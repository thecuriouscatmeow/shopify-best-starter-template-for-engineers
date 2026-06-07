# Shopify Best Starter Template For Engineers

> A production-grade Shopify **Online Store 2.0** theme starter that keeps the battle-tested
> engine of Shopify's **Dawn** reference theme and rips out the part that causes the most pain —
> the CSS layer — replacing it with a clean **Tailwind CSS + design-token** system.
>
> Built for engineers who want Dawn's reliability without Dawn's cascade wars.

---

## Why this exists (the psychology behind the codebase)

Most Shopify theme projects fail in the same place: **the CSS**. Dawn ships ~65 stylesheets and
an unlayered, theme-editor-driven color system. The moment you try to impose your own design
system on top, you're fighting an override war you can't win — specificity battles,
`!important` spirals, and a color block that beats every `@layer` you write.

This starter is built on one core insight:

> **Keep what Dawn does brilliantly. Replace only what fights you.**

So the strategy is surgical:

1. **Keep Dawn's engine.** Dawn's JavaScript (Web Components for cart, predictive search,
   variant picker, media gallery, facets, quick-add), its accessibility work, its responsive
   CDN image pipeline, and its Online Store 2.0 section/schema architecture are the result of
   years of work by Shopify. We don't rewrite them.
2. **Delete the CSS layer entirely.** All 65 Dawn stylesheets are gone.
3. **Rebuild styling on a predictable foundation** — Tailwind utilities backed by CSS custom
   properties (design tokens), with `@layer` so source order stops mattering and the override
   wars simply can't happen.

The result is a theme you can actually reason about: change a token, not a thousand selectors.

---

## What's kept from Dawn (the best parts)

- **Web-Component JavaScript** — `<cart-drawer>`, `<product-form>`, `<predictive-search>`,
  `<facet-filters-form>`, `<media-gallery>`, `<variant-selects>`, quick-add, and more. No
  framework, no jQuery, progressive enhancement.
- **Accessibility** — focus management, ARIA, keyboard navigation, screen-reader live regions.
- **Responsive CDN images** — every image renders through Shopify's `image_url` + `srcset` +
  `sizes` pipeline so the browser fetches the right resolution. (Enforced as a hard rule —
  see the decisions doc.)
- **Online Store 2.0** — JSON templates, sections everywhere, full `{% schema %}` so merchants
  edit content without a developer.

## What's different (the CSS system)

| Concern | Approach |
|---|---|
| **Styling** | Tailwind CSS utilities, compiled from `src/styles/main.css` → `src/assets/main.css` (gitignored build output). |
| **Design tokens** | All non-color visual values (spacing, type, radius, z-index, motion) as CSS custom properties in `src/assets/tokens.css`, mapped into Tailwind via `tailwind.config.js`. |
| **Color ownership** | Merchant palette (`--color-background/foreground/accent/…`) emitted from `:root` in `theme.liquid` (theme-editor driven); brand/system colors in `tokens.css`. A color is **never** defined in both places. All space-separated RGB triplets → `rgb(var(--color-x) / <alpha>)` so opacity utilities work. |
| **Per-component CSS** | Lives in `{% stylesheet %}` blocks **nested under `@layer components`** inside the section/snippet — scoped, deduped, and order-independent. |
| **Hard rules** | No hardcoded color values. No `!important`. No `.color-scheme` override selectors. Flat specificity (BEM, max one nesting level). |

These conventions — plus the **markup contract** (you may restyle `class=` attributes but never
rename the tags/ids/`data-*`/`aria-*` the kept JS binds to) and the **file-slicing principle**
(small, single-purpose files with stable interfaces) — are documented in
[`codebase.md`](codebase.md), the indexed map of every file in the theme.

---

## Repository structure

```
.
├── src/            # the Shopify theme root (Online Store 2.0)
│   ├── assets/     #   tokens.css + Dawn's Web-Component JS + SVG icons (Dawn CSS deleted)
│   ├── sections/   #   page sections (migrated to Tailwind + tokens)
│   ├── snippets/   #   reusable Liquid partials
│   ├── layout/     #   theme.liquid shell (owns the merchant :root palette)
│   ├── styles/     #   main.css — Tailwind input (@layer base, components, utilities)
│   ├── config/     #   settings_schema.json / settings_data.json
│   ├── locales/    #   i18n strings
│   └── tailwind.config.js
├── scripts/        # data-seeding tooling (Node, zero-dependency)
└── codebase.md     # full file index + inter-file dependency map (read this first)
```

> Only `src/`, `scripts/`, and `codebase.md` are included here — the theme, its tooling, and its
> map. Everything you need to pick the project back up later.

---

## Getting started

```bash
cd src
npm install            # Tailwind + Shopify CLI tooling
npm run dev            # Tailwind watch + `shopify theme dev` in parallel
```

`src/assets/main.css` is **compiled output** (gitignored) — never edit it. Edit
`src/styles/main.css` and let the watcher rebuild.

## Data-seeding scripts (`scripts/`)

Zero-dependency Node tooling (built-in `fetch`) to populate a dev store with a realistic catalog
via the Shopify GraphQL Admin API — handy for building/QA against real data.

| Script | What it does |
|---|---|
| `shopify-token.sh` | Mints + caches a short-lived Admin API token (`client_credentials`), reading `client_id`/`client_secret` from `.env`. |
| `seed-catalog.json` | The catalog data (collections + products), decoupled from the script. |
| `seed-data.mjs` | Schema-validates the catalog, then creates/updates products + collections (idempotent, handle-keyed) and publishes them. Modes: `--dry-run`, `--purge`, `--purge-only`. |
| `seed-images.mjs` | Attaches a CC-licensed image per product (`--force`, `--dry-run`). |

**Setup:** copy [`.env.example`](.env.example) → `src/.env`, fill in your Shopify custom-app
`client_id`/`client_secret`, and set your store handle (top of each script). Then:

```bash
node scripts/seed-data.mjs --dry-run     # preview
node scripts/seed-data.mjs               # seed
node scripts/seed-images.mjs             # add product images
```

> `.env` and the token cache are gitignored — **never commit credentials.**

---

## Credits & License

This project is built on and derives from [**Shopify Dawn**](https://github.com/Shopify/dawn)
(MIT). Dawn's original license is retained at [`src/LICENSE.md`](src/LICENSE.md), and our
modifications are released under the [MIT License](LICENSE).

Keep the engine. Lose the override wars. Ship.
