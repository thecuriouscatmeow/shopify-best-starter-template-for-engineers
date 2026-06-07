#!/usr/bin/env node
/**
 * seed-images.mjs — attach aesthetic product images to all seed products.
 *
 * Image source: LoremFlickr (https://loremflickr.com) — free, CC-licensed Flickr
 * photos, keyword-targeted, no API key needed. Each product gets a unique URL
 * keyed by `lock` param so the image is stable across re-runs (same lock → same photo).
 *
 * Flow:
 *   1. For each product handle, look up its GID and check for existing media.
 *   2. Skip if already has at least one image (idempotent).
 *   3. Resolve the LoremFlickr redirect to get the direct CDN URL.
 *   4. Call productCreateMedia with that direct URL.
 *   5. Poll briefly until the media status leaves PROCESSING.
 *
 * Usage:
 *   node scripts/seed-images.mjs            # attach images (skip products that already have one)
 *   node scripts/seed-images.mjs --dry-run  # print URLs, no writes
 *   node scripts/seed-images.mjs --force    # re-attach even if product already has images
 *
 * Requires Node 18+ (built-in fetch). No external deps.
 */

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..');
const STORE       = 'awesome-store-1234637.myshopify.com';
const API_VERSION = '2025-10';
const GRAPHQL_URL = `https://${STORE}/admin/api/${API_VERSION}/graphql.json`;

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE   = process.argv.includes('--force');

// ---------------------------------------------------------------------------
// Image map — one entry per product handle.
// keywords: LoremFlickr search terms (comma-separated, no spaces).
// lock:     integer — fixes the specific photo returned by LoremFlickr.
//           Different locks within the same keyword set → different photos.
// ---------------------------------------------------------------------------
const PRODUCT_IMAGES = [
  // ── Anklets ──────────────────────────────────────────────────────────────
  { handle: 'seed-anklet-silver-oxidised-payal',       keywords: 'anklet', lock: 1 },
  { handle: 'seed-anklet-gold-chain-layered',           keywords: 'anklet', lock: 2 },
  { handle: 'seed-anklet-beaded-boho',                  keywords: 'anklet', lock: 3 },

  // ── Bracelets ─────────────────────────────────────────────────────────────
  { handle: 'seed-bracelet-rose-gold-heart-charm',      keywords: 'bracelet', lock: 1 },
  { handle: 'seed-bracelet-kundan-bangle',              keywords: 'bracelet', lock: 2 },
  { handle: 'seed-bracelet-thread-evil-eye',            keywords: 'bracelet', lock: 3 },

  // ── Earrings ──────────────────────────────────────────────────────────────
  { handle: 'seed-earrings-pearl-drop-studs',           keywords: 'earrings', lock: 1 },
  { handle: 'seed-earrings-oxidised-jhumka',            keywords: 'earrings', lock: 2 },
  { handle: 'seed-earrings-enamel-hoop',                keywords: 'earrings', lock: 3 },

  // ── Hair Bands ────────────────────────────────────────────────────────────
  { handle: 'seed-hair-band-velvet-embroidered',        keywords: 'headband,hair', lock: 1 },
  { handle: 'seed-hair-band-pearl-satin',               keywords: 'headband,hair', lock: 2 },
  { handle: 'seed-hair-band-knotted-scrunchie',         keywords: 'headband,hair', lock: 3 },

  // ── Hair Clips ────────────────────────────────────────────────────────────
  { handle: 'seed-hair-clip-acetate-claw',              keywords: 'accessories,hair', lock: 1 },
  { handle: 'seed-hair-clip-floral-barrette',           keywords: 'accessories,hair', lock: 2 },
  { handle: 'seed-hair-clip-metal-snap-set',            keywords: 'accessories,hair', lock: 3 },

  // ── Hair Pins ─────────────────────────────────────────────────────────────
  { handle: 'seed-hairpin-pearl-bun',                   keywords: 'jewelry,hair', lock: 1 },
  { handle: 'seed-hairpin-butterfly-matte',             keywords: 'jewelry,hair', lock: 2 },
  { handle: 'seed-hairpin-oxidised-flower',             keywords: 'jewelry,hair', lock: 3 },

  // ── Hair Ties ─────────────────────────────────────────────────────────────
  { handle: 'seed-hairtie-scrunchie-silk',              keywords: 'scrunchie', lock: 1 },
  { handle: 'seed-hairtie-elastic-neon',                keywords: 'scrunchie', lock: 2 },
  { handle: 'seed-hairtie-velvet-ribbon',               keywords: 'scrunchie', lock: 3 },

  // ── Key Chains ────────────────────────────────────────────────────────────
  { handle: 'seed-keychain-evil-eye-charm',             keywords: 'keychain', lock: 1 },
  { handle: 'seed-keychain-initial-letter',             keywords: 'keychain', lock: 2 },
  { handle: 'seed-keychain-tassel-pom',                 keywords: 'keychain', lock: 3 },

  // ── Necklaces ─────────────────────────────────────────────────────────────
  { handle: 'seed-necklace-layered-gold',               keywords: 'necklace', lock: 1 },
  { handle: 'seed-necklace-kundan-choker',              keywords: 'necklace', lock: 2 },
  { handle: 'seed-necklace-oxidised-tribal',            keywords: 'necklace', lock: 3 },

  // ── Piercings ─────────────────────────────────────────────────────────────
  { handle: 'seed-piercing-nose-pin-stud',              keywords: 'nose,jewelry', lock: 1 },
  { handle: 'seed-piercing-ear-stud-zirconia',          keywords: 'jewelry,stud', lock: 2 },
  { handle: 'seed-piercing-helix-hoop',                 keywords: 'earrings', lock: 4 },

  // ── Rings ─────────────────────────────────────────────────────────────────
  { handle: 'seed-ring-stackable-stone-band',           keywords: 'ring,jewelry', lock: 1 },
  { handle: 'seed-ring-twisted-rope-gold',              keywords: 'ring,jewelry', lock: 2 },
  { handle: 'seed-ring-enamel-floral-midi',             keywords: 'ring,jewelry', lock: 3 },

  // ── Rubber Bands ──────────────────────────────────────────────────────────
  { handle: 'seed-rubber-band-no-crease-clear',         keywords: 'scrunchie', lock: 4 },
  { handle: 'seed-rubber-band-thick-matte-multicolor',  keywords: 'scrunchie', lock: 5 },
  { handle: 'seed-rubber-band-pastel-mini-set',         keywords: 'scrunchie', lock: 6 },

  // ── Scrunchies ────────────────────────────────────────────────────────────
  { handle: 'seed-scrunchy-velvet-rich-jewel',          keywords: 'scrunchie', lock: 7  },
  { handle: 'seed-scrunchy-printed-satin-floral',       keywords: 'scrunchie', lock: 8  },
  { handle: 'seed-scrunchy-chunky-knit-winter',         keywords: 'scrunchie', lock: 9  },

  // ── Socks ─────────────────────────────────────────────────────────────────
  { handle: 'seed-socks-ankle-cotton-solid',            keywords: 'socks,fashion', lock: 1 },
  { handle: 'seed-socks-crew-quirky-print-pack',        keywords: 'socks,fashion', lock: 2 },
  { handle: 'seed-socks-no-show-loafer-liner',          keywords: 'socks,fashion', lock: 3 },

  // ── Sunglasses ────────────────────────────────────────────────────────────
  { handle: 'seed-sunglasses-cat-eye-retro',            keywords: 'sunglasses', lock: 1 },
  { handle: 'seed-sunglasses-oversized-square-tinted',  keywords: 'sunglasses', lock: 2 },
  { handle: 'seed-sunglasses-round-wire-frame',         keywords: 'sunglasses', lock: 3 },
];

// ---------------------------------------------------------------------------
// Auth + GraphQL
// ---------------------------------------------------------------------------

function getToken() {
  const out = execFileSync(resolve(REPO_ROOT, 'scripts/shopify-token.sh'), {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  });
  const t = out.trim();
  if (!t) throw new Error('shopify-token.sh returned an empty token');
  return t;
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
  if (json.errors) throw new Error('GraphQL error:\n' + JSON.stringify(json.errors, null, 2));
  return json.data;
}

// ---------------------------------------------------------------------------
// Image URL resolution
// ---------------------------------------------------------------------------

/**
 * Build a LoremFlickr redirect URL, then follow the redirect so that Shopify
 * receives a stable direct CDN URL rather than a redirect chain.
 * LoremFlickr with `lock=N` always resolves to the same Flickr photo.
 */
async function resolveImageUrl(keywords, lock) {
  const src = `https://loremflickr.com/800/800/${keywords}?lock=${lock}`;
  try {
    const res = await fetch(src, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // res.url is the final URL after redirect — a direct Flickr/CDN image URL.
    return res.url || src;
  } catch (e) {
    // If redirect resolution fails, fall back to the redirect URL itself.
    // Shopify's media fetcher will follow it server-side.
    console.warn(`    [warn] redirect resolve failed (${e.message}), using redirect URL directly`);
    return src;
  }
}

// ---------------------------------------------------------------------------
// Shopify product + media helpers
// ---------------------------------------------------------------------------

async function getProductWithMediaCount(handle) {
  const data = await gql(
    `query($q: String!) {
      products(first: 1, query: $q) {
        nodes {
          id
          handle
          media(first: 1) { nodes { id } }
        }
      }
    }`,
    { q: `handle:${handle}` },
  );
  return data.products.nodes.find((p) => p.handle === handle) || null;
}

async function createProductMedia(productId, imageUrl) {
  const data = await gql(
    `mutation($productId: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $productId, media: $media) {
        media {
          id
          mediaContentType
          status
        }
        mediaUserErrors { field message }
      }
    }`,
    {
      productId,
      media: [{ originalSource: imageUrl, mediaContentType: 'IMAGE' }],
    },
  );
  const errs = data?.productCreateMedia?.mediaUserErrors;
  if (errs?.length) throw new Error('mediaUserErrors:\n' + JSON.stringify(errs, null, 2));
  return data.productCreateMedia.media[0];
}

/** Poll until the media record is no longer PROCESSING (max ~20s). */
async function waitForMedia(productId, mediaId, maxRetries = 8) {
  for (let i = 0; i < maxRetries; i++) {
    await new Promise((r) => setTimeout(r, 2500));
    const data = await gql(
      `query($id: ID!) {
        product(id: $id) {
          media(first: 10) {
            nodes { id status }
          }
        }
      }`,
      { id: productId },
    );
    const m = data.product?.media?.nodes?.find((n) => n.id === mediaId);
    if (!m || m.status !== 'PROCESSING') return m?.status ?? 'UNKNOWN';
  }
  return 'PROCESSING'; // timed out — Shopify is slow but it'll complete
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log(`\nseed-images — store: ${STORE}${DRY_RUN ? '  [DRY RUN]' : ''}${FORCE ? '  [FORCE]' : ''}`);
  console.log(`Products: ${PRODUCT_IMAGES.length}\n`);

  let attached = 0, skipped = 0, errors = 0;

  for (const { handle, keywords, lock } of PRODUCT_IMAGES) {
    process.stdout.write(`  ${handle.padEnd(46)}`);

    try {
      const product = await getProductWithMediaCount(handle);
      if (!product) {
        console.log('NOT FOUND');
        errors++;
        continue;
      }

      const hasImage = product.media.nodes.length > 0;
      if (hasImage && !FORCE) {
        console.log('skip (has image)');
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        const url = `https://loremflickr.com/800/800/${keywords}?lock=${lock}`;
        console.log(`[dry-run] → ${url}`);
        continue;
      }

      // Resolve redirect → get a direct CDN URL Shopify can fetch without re-redirecting.
      const imageUrl = await resolveImageUrl(keywords, lock);

      const media = await createProductMedia(product.id, imageUrl);
      const finalStatus = await waitForMedia(product.id, media.id);

      console.log(`attached [${finalStatus}]`);
      attached++;

      // Gentle pacing — avoid hammering both LoremFlickr and Shopify.
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      console.log(`ERROR: ${e.message.split('\n')[0]}`);
      errors++;
    }
  }

  console.log(`\nDone. attached=${attached}  skipped=${skipped}  errors=${errors}\n`);
  if (errors > 0) {
    console.log('Re-run the script to retry any errors — it is idempotent (skips products that already have images).\n');
  }
}

main().catch((err) => {
  console.error('\nseed-images FAILED:\n' + err.message);
  process.exit(1);
});
