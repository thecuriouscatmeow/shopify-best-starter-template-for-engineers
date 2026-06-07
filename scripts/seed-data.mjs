#!/usr/bin/env node
/**
 * L1.5 seed-data — repeatable, idempotent test catalog seeder.
 *
 * Seeds the dev store with 3 collections, each holding 2 products (6 total) so the
 * commerce-spine slices (L3 collection / L4 product / L5 cart) have real data to render
 * and exercise. Every product:
 *   - status ACTIVE, price in INR, vendor/product_type/description
 *   - one option with 2-3 variants, inventory 50 per variant (purchasable for L5 cart)
 *   - published to the Online Store sales channel (the #1 gotcha — else it won't show)
 *   - tagged `seed-data` so it's identifiable + cleanable
 *
 * Idempotent: deterministic handles + query-first. Re-running does NOT create duplicates;
 * it updates the existing product/collection in place via productSet (handle identifier).
 *
 * Auth: token comes from scripts/shopify-token.sh (cached client_credentials grant).
 *       NEVER hardcode secrets / read src/.env directly here.
 *
 * API: GraphQL Admin API 2025-10. REST product/variant writes are deprecated.
 *
 * GraphQL mutations used (shapes verified against shopify.dev, API 2025-10):
 *   - productSet            https://shopify.dev/docs/api/admin-graphql/latest/mutations/productSet
 *   - collectionCreate      https://shopify.dev/docs/api/admin-graphql/latest/mutations/collectionCreate
 *   - publishablePublish    https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablePublish
 *   - publications query     (to discover the Online Store publication id)
 *
 * Usage:  node scripts/seed-data.mjs            # seed / re-seed (idempotent)
 *         node scripts/seed-data.mjs --dry-run  # build payloads + print, no writes
 *
 * Requires Node 18+ (built-in fetch). No external dependencies.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const STORE = 'awesome-store-1234637.myshopify.com';
const API_VERSION = '2025-10';
const GRAPHQL_URL = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;
const STOREFRONT_BASE = `https://${STORE}`;
const SEED_TAG = 'seed-data';
const INVENTORY_PER_VARIANT = 50;
const CATALOG_PATH = resolve(REPO_ROOT, 'scripts/seed-catalog.json');
const DRY_RUN = process.argv.includes('--dry-run');
// --purge: delete existing seed data (tag:seed-data products + seed-* collections) before seeding.
// --purge-only: delete and exit without seeding.
const PURGE_ONLY = process.argv.includes('--purge-only');
const PURGE = PURGE_ONLY || process.argv.includes('--purge');

/* ------------------------------------------------------------------ */
/* Seed catalog (loaded from scripts/seed-catalog.json)                 */
/* ------------------------------------------------------------------ */
/* The catalog content lives in scripts/seed-catalog.json so it can be  */
/* regenerated/edited without touching this script. Shape:              */
/*   { collections: [{ handle, title, description }],                    */
/*     products:    [{ collectionHandle, handle, title, description,     */
/*                     vendor, productType, option:{name,values[]},      */
/*                     price }] }                                        */
/* Handles are deterministic idempotency keys (re-run updates in place). */

function loadCatalog() {
  let raw;
  try {
    raw = readFileSync(CATALOG_PATH, 'utf8');
  } catch (e) {
    throw new Error(`Cannot read catalog at ${CATALOG_PATH}: ${e.message}`);
  }
  let cat;
  try {
    cat = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Catalog JSON is invalid: ${e.message}`);
  }
  validateCatalog(cat);
  return cat;
}

// Fail fast on a malformed catalog so we never push junk to the live store.
function validateCatalog(cat) {
  if (!Array.isArray(cat.collections) || !cat.collections.length) {
    throw new Error('Catalog: "collections" must be a non-empty array');
  }
  if (!Array.isArray(cat.products) || !cat.products.length) {
    throw new Error('Catalog: "products" must be a non-empty array');
  }
  const collHandles = new Set(cat.collections.map((c) => c.handle));
  const seenColl = new Set();
  for (const c of cat.collections) {
    for (const f of ['handle', 'title', 'description']) {
      if (!c[f] || typeof c[f] !== 'string') throw new Error(`Collection ${c.handle || '?'}: missing "${f}"`);
    }
    if (seenColl.has(c.handle)) throw new Error(`Duplicate collection handle: ${c.handle}`);
    seenColl.add(c.handle);
  }
  const seenProd = new Set();
  for (const p of cat.products) {
    for (const f of ['collectionHandle', 'handle', 'title', 'description', 'vendor', 'productType', 'price']) {
      if (!p[f] || typeof p[f] !== 'string') throw new Error(`Product ${p.handle || '?'}: missing "${f}"`);
    }
    if (!/^\d+(\.\d{1,2})?$/.test(p.price)) throw new Error(`Product ${p.handle}: price "${p.price}" must be a decimal string (INR)`);
    if (!p.option || typeof p.option.name !== 'string' || !Array.isArray(p.option.values) || p.option.values.length < 1) {
      throw new Error(`Product ${p.handle}: needs option {name, values:[...]}`);
    }
    if (new Set(p.option.values).size !== p.option.values.length) throw new Error(`Product ${p.handle}: duplicate option values`);
    if (!collHandles.has(p.collectionHandle)) throw new Error(`Product ${p.handle}: collectionHandle "${p.collectionHandle}" has no matching collection`);
    if (seenProd.has(p.handle)) throw new Error(`Duplicate product handle: ${p.handle}`);
    seenProd.add(p.handle);
  }
}

const catalog = loadCatalog();
const COLLECTIONS = catalog.collections;
const PRODUCTS = catalog.products;

/* ------------------------------------------------------------------ */
/* Auth + GraphQL client                                               */
/* ------------------------------------------------------------------ */

function getToken() {
  const out = execFileSync(resolve(REPO_ROOT, 'scripts/shopify-token.sh'), {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  const token = out.trim();
  if (!token) throw new Error('shopify-token.sh returned an empty token');
  return token;
}

const TOKEN = getToken();

async function gql(query, variables = {}) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': TOKEN,
    },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) {
    throw new Error('GraphQL transport/auth error:\n' + JSON.stringify(json.errors, null, 2));
  }
  return json.data;
}

// Throw if a mutation returned userErrors. `path` is the mutation field name.
function assertNoUserErrors(data, path) {
  const errs = data?.[path]?.userErrors;
  if (errs && errs.length) {
    throw new Error(`${path} userErrors:\n` + JSON.stringify(errs, null, 2));
  }
}

/* ------------------------------------------------------------------ */
/* Discovery: primary location + Online Store publication              */
/* ------------------------------------------------------------------ */

async function getPrimaryLocationId() {
  const data = await gql(`{
    location: locations(first: 1) { nodes { id name } }
  }`);
  const loc = data.location.nodes[0];
  if (!loc) throw new Error('No locations found on the store');
  return loc.id;
}

async function getOnlineStorePublicationId() {
  const data = await gql(`{
    publications(first: 25) { nodes { id name } }
  }`);
  const pubs = data.publications.nodes;
  // Match the Online Store channel by name (locale-stable on dev stores).
  const online =
    pubs.find((p) => p.name === 'Online Store') ||
    pubs.find((p) => /online store/i.test(p.name));
  if (!online) {
    throw new Error(
      'Online Store publication not found. Publications: ' +
        JSON.stringify(pubs.map((p) => p.name)),
    );
  }
  return online.id;
}

/* ------------------------------------------------------------------ */
/* Collections                                                         */
/* ------------------------------------------------------------------ */

async function findCollectionByHandle(handle) {
  const data = await gql(
    `query($q: String!) { collections(first: 1, query: $q) { nodes { id handle title } } }`,
    { q: `handle:${handle}` },
  );
  const node = data.collections.nodes.find((c) => c.handle === handle);
  return node || null;
}

async function upsertCollection(def) {
  const existing = await findCollectionByHandle(def.handle);
  if (existing) {
    console.log(`  collection "${def.handle}" exists → reuse (${existing.id})`);
    return existing.id;
  }
  if (DRY_RUN) {
    console.log(`  [dry-run] would create collection "${def.handle}"`);
    return `gid://dry-run/Collection/${def.handle}`;
  }
  const data = await gql(
    `mutation($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id handle }
        userErrors { field message }
      }
    }`,
    {
      input: {
        handle: def.handle,
        title: def.title,
        descriptionHtml: def.description,
      },
    },
  );
  assertNoUserErrors(data, 'collectionCreate');
  const id = data.collectionCreate.collection.id;
  console.log(`  collection "${def.handle}" created (${id})`);
  return id;
}

/* ------------------------------------------------------------------ */
/* Products (create-or-update via productSet, keyed by handle)         */
/* ------------------------------------------------------------------ */

async function findProductByHandle(handle) {
  const data = await gql(
    `query($q: String!) {
      products(first: 1, query: $q) {
        nodes { id handle status }
      }
    }`,
    { q: `handle:${handle}` },
  );
  const node = data.products.nodes.find((p) => p.handle === handle);
  return node || null;
}

// Build the ProductSetInput for one product definition.
function buildProductSetInput(def, locationId, collectionId) {
  const variants = def.option.values.map((value) => ({
    optionValues: [{ optionName: def.option.name, name: value }],
    price: def.price,
    inventoryQuantities: [
      { locationId, name: 'available', quantity: INVENTORY_PER_VARIANT },
    ],
  }));

  return {
    handle: def.handle,
    title: def.title,
    descriptionHtml: def.description,
    vendor: def.vendor,
    productType: def.productType,
    status: 'ACTIVE',
    tags: [SEED_TAG],
    collections: [collectionId],
    productOptions: [
      {
        name: def.option.name,
        position: 1,
        values: def.option.values.map((v) => ({ name: v })),
      },
    ],
    variants,
  };
}

async function upsertProduct(def, locationId, collectionId) {
  const input = buildProductSetInput(def, locationId, collectionId);

  if (DRY_RUN) {
    console.log(`  [dry-run] productSet payload for "${def.handle}":`);
    console.log(JSON.stringify(input, null, 2));
    return { id: `gid://dry-run/Product/${def.handle}`, handle: def.handle };
  }

  // productSet with the `handle` identifier is create-or-update: if a product with this
  // handle exists it is updated in place (no duplicate); otherwise it is created.
  const data = await gql(
    `mutation($input: ProductSetInput!, $identifier: ProductSetIdentifiers, $synchronous: Boolean!) {
      productSet(input: $input, identifier: $identifier, synchronous: $synchronous) {
        product { id handle status }
        userErrors { field message code }
      }
    }`,
    {
      input,
      identifier: { handle: def.handle },
      synchronous: true,
    },
  );
  assertNoUserErrors(data, 'productSet');
  const product = data.productSet.product;
  console.log(`  product "${product.handle}" upserted (${product.id}, ${product.status})`);
  return product;
}

/* ------------------------------------------------------------------ */
/* Publish to Online Store                                             */
/* ------------------------------------------------------------------ */

async function publishToOnlineStore(resourceId, publicationId, label) {
  if (DRY_RUN) {
    console.log(`  [dry-run] would publish ${label} to Online Store`);
    return;
  }
  // publishablePublish is idempotent — re-publishing an already-published resource is a no-op.
  const data = await gql(
    `mutation($id: ID!, $input: [PublicationInput!]!) {
      publishablePublish(id: $id, input: $input) {
        userErrors { field message }
      }
    }`,
    { id: resourceId, input: [{ publicationId }] },
  );
  assertNoUserErrors(data, 'publishablePublish');
  console.log(`  published ${label} to Online Store`);
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

async function verifyProduct(handle, publicationId) {
  const data = await gql(
    `query($q: String!, $pubId: ID!) {
      products(first: 1, query: $q) {
        nodes {
          id
          handle
          status
          totalInventory
          publishedOnPublication(publicationId: $pubId)
          variants(first: 10) { nodes { id title inventoryQuantity } }
        }
      }
    }`,
    { q: `handle:${handle}`, pubId: publicationId },
  );
  return data.products.nodes.find((p) => p.handle === handle) || null;
}

async function storefrontStatus(handle) {
  const url = `${STOREFRONT_BASE}/products/${handle}`;
  try {
    // HEAD can be blocked; use GET and just read the status.
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
    return res.status;
  } catch (e) {
    return `ERR ${e.message}`;
  }
}

/* ------------------------------------------------------------------ */
/* Purge (delete existing seed data)                                   */
/* ------------------------------------------------------------------ */

// Deletes everything this script owns: products tagged `seed-data` and any
// collection whose handle starts with `seed-`. Idempotent and safe to re-run.
async function purgeSeedData() {
  console.log('Purging existing seed data (products tag:seed-data + seed-* collections)...');

  // Products — page through tag:seed-data and delete each.
  let deletedProducts = 0;
  for (;;) {
    const data = await gql(
      `query($q: String!) { products(first: 50, query: $q) { nodes { id handle } } }`,
      { q: `tag:${SEED_TAG}` },
    );
    const nodes = data.products.nodes;
    if (!nodes.length) break;
    if (DRY_RUN) {
      console.log(`  [dry-run] would delete ${nodes.length} product(s): ${nodes.map((n) => n.handle).join(', ')}`);
      break;
    }
    for (const p of nodes) {
      const d = await gql(
        `mutation($input: ProductDeleteInput!) {
          productDelete(input: $input) { deletedProductId userErrors { field message } }
        }`,
        { input: { id: p.id } },
      );
      assertNoUserErrors(d, 'productDelete');
      deletedProducts++;
    }
  }

  // Collections — fetch and delete any with the seed- handle prefix.
  const cdata = await gql(`{ collections(first: 100) { nodes { id handle } } }`);
  const seedColls = cdata.collections.nodes.filter((c) => c.handle.startsWith('seed-'));
  let deletedColls = 0;
  if (DRY_RUN) {
    console.log(`  [dry-run] would delete ${seedColls.length} collection(s): ${seedColls.map((c) => c.handle).join(', ')}`);
  } else {
    for (const c of seedColls) {
      const d = await gql(
        `mutation($input: CollectionDeleteInput!) {
          collectionDelete(input: $input) { deletedCollectionId userErrors { field message } }
        }`,
        { input: { id: c.id } },
      );
      assertNoUserErrors(d, 'collectionDelete');
      deletedColls++;
    }
  }

  if (!DRY_RUN) console.log(`  deleted ${deletedProducts} product(s), ${deletedColls} collection(s)`);
  console.log('');
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

async function main() {
  console.log(`\nL1.5 seed-data — store ${STORE} (API ${API_VERSION})${DRY_RUN ? '  [DRY RUN]' : ''}\n`);
  console.log(`Catalog: ${COLLECTIONS.length} collections, ${PRODUCTS.length} products\n`);

  if (PURGE) {
    await purgeSeedData();
    if (PURGE_ONLY) {
      console.log('Purge-only complete. Exiting without seeding.\n');
      return;
    }
  }

  console.log('Discovering location + Online Store publication...');
  const locationId = await getPrimaryLocationId();
  const publicationId = await getOnlineStorePublicationId();
  console.log(`  location:     ${locationId}`);
  console.log(`  publication:  ${publicationId}\n`);

  // 1) Upsert collections, build handle -> id map.
  console.log('Collections:');
  const collectionIdByHandle = {};
  for (const def of COLLECTIONS) {
    const id = await upsertCollection(def);
    collectionIdByHandle[def.handle] = id;
    await publishToOnlineStore(id, publicationId, `collection ${def.handle}`);
  }
  console.log('');

  // 2) PROVE ONE FIRST — fully process the first product and verify before the rest.
  console.log('Prove-one-first (single product end-to-end):');
  const first = PRODUCTS[0];
  const firstCollId = collectionIdByHandle[first.collectionHandle];
  await upsertProduct(first, locationId, firstCollId);
  const firstProd = await findProductByHandle(first.handle);
  if (!DRY_RUN) {
    await publishToOnlineStore(firstProd.id, publicationId, `product ${first.handle}`);
    const v = await verifyProduct(first.handle, publicationId);
    const code = await storefrontStatus(first.handle);
    console.log(`  verify: status=${v.status} publishedOnline=${v.publishedOnPublication} ` +
      `variants=${v.variants.nodes.length} inventory=${v.totalInventory} storefrontHTTP=${code}`);
    if (v.status !== 'ACTIVE' || !v.publishedOnPublication) {
      throw new Error('Prove-one-first FAILED: product not ACTIVE or not published. Aborting before bulk.');
    }
    if (code !== 200) {
      console.warn(`  WARN: storefront returned ${code} (expected 200). Continuing, but investigate.`);
    }
    console.log('  prove-one-first OK → proceeding to remaining products.\n');
  } else {
    console.log('  [dry-run] skipping live verification.\n');
  }

  // 3) Remaining products.
  console.log('Remaining products:');
  for (const def of PRODUCTS.slice(1)) {
    const collId = collectionIdByHandle[def.collectionHandle];
    await upsertProduct(def, locationId, collId);
    if (!DRY_RUN) {
      const prod = await findProductByHandle(def.handle);
      await publishToOnlineStore(prod.id, publicationId, `product ${def.handle}`);
    }
  }
  console.log('');

  // 4) Final summary table.
  if (!DRY_RUN) {
    console.log('Final summary:');
    console.log(
      'handle'.padEnd(24) +
        'collection'.padEnd(20) +
        'status'.padEnd(8) +
        'variants'.padEnd(10) +
        'inv'.padEnd(6) +
        'published'.padEnd(11) +
        'HTTP',
    );
    for (const def of PRODUCTS) {
      const v = await verifyProduct(def.handle, publicationId);
      const code = await storefrontStatus(def.handle);
      console.log(
        def.handle.padEnd(24) +
          def.collectionHandle.padEnd(20) +
          String(v.status).padEnd(8) +
          String(v.variants.nodes.length).padEnd(10) +
          String(v.totalInventory).padEnd(6) +
          String(v.publishedOnPublication).padEnd(11) +
          String(code),
      );
    }
    console.log('\nCollections:');
    for (const def of COLLECTIONS) {
      const c = await findCollectionByHandle(def.handle);
      console.log(`  ${def.handle.padEnd(20)} ${c ? c.id : 'MISSING'}`);
    }
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nseed-data FAILED:\n' + err.message);
  process.exit(1);
});
