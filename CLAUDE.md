# Project: gujrati

## Shopify Coding Best Practices

When writing or reviewing any Shopify Liquid / theme code in this repo, **follow
[docs/shopify-best-practices.md](docs/shopify-best-practices.md)**. It is the canonical
coding standard, covering:

- Recent Shopify platform changes (Horizon theme, theme blocks, modern Liquid filters)
- Dawn vs. Horizon vs. clean-start decision
- Core Liquid rules (`render` over `include`, schema-driven sections, filter every output)
- Sections & theme-blocks architecture
- The CSS strategy that prevents override wars (scoped `{% stylesheet %}`, CSS custom
  properties for variation, `@layer`, flat BEM, design tokens)
- Performance, accessibility, and tooling (Shopify CLI, Theme Check, Theme Inspector)

Read it before generating theme code.

### Where to get authoritative Shopify info
For any Shopify/Liquid syntax, schema, filter, drop, or API question, **do not answer from
memory** — query Context7 for current, version-accurate docs. Use these exact libraries
(in priority order):

| Context7 library ID | Use for |
|---|---|
| `/shopify/liquid-skills` | **Primary.** Official Liquid coding standards, theme blocks, accessibility (benchmark 92). |
| `/shopify/theme-liquid-docs` | Auto-generated reference for Liquid drops, tags, filters, schema. |
| `/benjaminsehl/liquid-skills` | Supplementary language fundamentals + WCAG patterns. |

Workflow: `resolve-library-id` (if needed) → `query-docs` with the exact library ID above.

---

## What We're Building

A custom Shopify theme for a Gujarati client. Built on **Dawn** (Shopify's reference theme) with its CSS layer stripped and replaced by a clean token-based system using Tailwind CSS.

The theme lives in `src/` — that is the Shopify theme root. Everything else in the repo (`raw_analysis/`, `generated_doc_assets/`) is pre-build research from an earlier analysis phase and can be ignored during development.

## Store

**Store URL:** `awesome-store-1234637.myshopify.com`

All Shopify CLI commands use this store. Always pass `--store awesome-store-1234637.myshopify.com` when running `shopify theme dev`, `shopify theme push`, or `shopify theme list`.

## Base decisions (why this codebase is the way it is)

**Read [`docs/CODEBASE-DECISIONS.md`](docs/CODEBASE-DECISIONS.md) before building.** It is the
canonical record of the base architectural reasoning — the markup contract, file-slicing
principle (single-purpose files, stable interfaces, container-position vs container-internals
independence), CSS/color ownership, the bounded-agent workflow, and the right-size-every-slice
rule. The best-practices guide says *how* to write Liquid; this says *why we do it this way*.

## Codebase Index

**Always read [`codebase.md`](codebase.md) at the start of any session before touching files.** It is a full indexed map of every file and directory in `src/` with one-line descriptions.

**Maintain it actively:** whenever you create or delete a file in `src/`, update `codebase.md` in the same action — add or remove the relevant row. Never leave it stale.

## Architecture

### Theme root: `src/`
Shopify Online Store 2.0 theme. Deployed and previewed via:
```bash
cd src && npm run dev   # Tailwind watch + shopify theme dev in parallel
```

### CSS system (Dawn's CSS replaced)
Dawn shipped 65 CSS files — all deleted. Replaced with:

| File | Role |
|---|---|
| `src/assets/tokens.css` | Design tokens as CSS custom properties — brand colors, spacing, type, z-index, motion (merchant scheme colors live in `theme.liquid`; see Color ownership below) |
| `src/styles/main.css` | Tailwind input — declares `@layer base, components, utilities` |
| `src/assets/main.css` | **Compiled output** — gitignored, never edit directly |
| `src/tailwind.config.js` | Maps CSS tokens into Tailwind's theme (`bg-primary`, `text-foreground`, etc.) |

**The rule:** all non-color visual values live in `tokens.css`. Tailwind utilities reference them. Per-section styles use `{% stylesheet %}` inside the section file, always nested under `@layer components {}`.

#### Color ownership (avoid the override collision)
Colors are split by ownership and **must never be redefined across both files**:

| Owner | Colors | Format |
|---|---|---|
| `layout/theme.liquid` `{% style %}` | Merchant color-scheme colors — `--color-background`, `--color-foreground`, `--color-button`, `--color-link`, `--color-badge-*`, etc. (driven by the theme editor) | space-separated RGB triplet (`18 18 18`) |
| `src/assets/tokens.css` | Brand/system colors — `--color-primary`, `--color-secondary`, `--color-border`, `--color-error`, `--color-success` (not merchant-editable) | space-separated RGB triplet |

All color tokens are **space-separated RGB triplets**, so consumers wrap them: `rgb(var(--color-x))` or, with opacity, `rgb(var(--color-x) / 0.5)`. `tailwind.config.js` maps each color as `rgb(var(--color-x) / <alpha-value>)`, so opacity utilities work (`bg-background`, `text-foreground/75`). `--page-width` is also owned by `theme.liquid` (merchant `page_width` setting) — do not redefine it in `tokens.css`.

### JS (kept intact from Dawn)
All `src/assets/*.js` are Web Component–based custom elements from Dawn — cart drawer, predictive search, variant picker, media gallery, etc. Do not rewrite. Extend via subclassing if behaviour changes are needed.

### Key Conventions
- Never hardcode colour/spacing values — use `var(--token-name)` or a Tailwind class backed by a token.
- Snippets are pure Liquid partials — no section schemas, no `{% stylesheet %}` unless it's a shared UI primitive.
- `templates/*.json` declare which sections appear on each page type.
- `config/settings_schema.json` drives the Shopify theme editor UI; `config/settings_data.json` holds saved values.
