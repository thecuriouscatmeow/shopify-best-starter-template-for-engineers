# Session Handoff — Dawn→Tailwind starter build

Read this first when continuing in a new conversation. Pairs with:
[`docs/agent-tracelog.md`](agent-tracelog.md) (live agent log), the master plan
(`~/.claude/plans/replicated-doodling-sky.md`), [`codebase.md`](../codebase.md),
[`docs/shopify-api-access.md`](shopify-api-access.md), and `CLAUDE.md`.

---

## How we work (the co-developer model — keep this going)

- **Claude stays foreground as supervisor + reviewer.** The user (Saahil) and Claude are
  co-developers: cross-check each other, evaluate strategy, hold the bigger picture.
- **Background agents do the building** — one *bounded vertical slice* each. Each agent
  maintains the **tracelog** (`docs/agent-tracelog.md`, append-only: major decisions, not
  keystrokes) and **STOPS at the slice boundary for human evaluation**. No long-running
  agents stacking hours of work on something unverified.
- **Claude independently verifies every agent's output** (diff review + greps, NOT just the
  agent's self-report). This already caught a real 404 and confirmed the CSS override war
  was actually dead — self-reports alone would have missed both.
- **Claude makes the eval-boundary edits itself** (small, judgment-heavy fixes — e.g. the
  header accent swap) rather than spawning an agent for them.
- **User does the visual check** at each boundary (Shopify auth is interactive). Nothing
  builds on unverified work.
- **Agents work directly on `master` in `src/`** (user's choice — no worktrees).

### Slice model (decided)
Couple **design + JS-smoke per slice** (rejected "all CSS first, then all JS" — that's the
horizontal antipattern). Commerce spine first. Verify render + local interactivity per
slice; cross-page flows at integration checkpoints.

### ⚠️ CHECKPOINT — slice-sizing rule (learned the hard way at L3, 2026-06-07)
**A slice must be small enough that the build agent never has to compact its context.** L3
was dispatched as one agent over **10 files including the two largest in the theme**
(`facets.liquid` 48KB + `card-product.liquid` 34KB). The agent's context overflowed and it
**auto-compacted mid-build** — exactly the failure the slice model exists to prevent:
compaction can drop the per-file JS-hook findings and lead to hallucinated class names,
silently breaking the markup contract.

**Rules going forward (review the plan BEFORE dispatching):**
1. **Right-size first.** Before spawning, estimate the agent's working set (files × size +
   the JS it must grep). If it risks a compaction, **split into sub-slices** (e.g. L3a banner
   + list-collections + card-collection; L3b price primitives + card-product; L3c facets +
   product-grid section). One end-to-end functional unit at a time.
2. **No single mega-file slices.** `facets.liquid` and `card-product.liquid` each likely
   deserve their own bounded pass.
3. **Tracelog-before-edit pays off.** Because the agent logged its JS-hook findings to the
   tracelog *before* compacting, those findings survive on disk — use them as the
   verification checklist even if the agent itself lost them.
4. Co-dev reviews slice scope/plan together before the agent is launched — not just the
   output after.

### Operational playbook (proven this session — reuse it)
- **Commit a git restore point BEFORE dispatching agents.** `src/` was untracked the whole
  time (all of L1/L2/L2b sat uncommitted) — a stray `checkout` would have wiped weeks of
  signed-off work. Now baselined. Commit each verified slice immediately (it's a restore
  point, not "done forever"). **Restore points so far:** L3a `src 4eec670`, L3b `src 34b2f71`,
  L3-fix `src c526fae` (responsive-toggle bug fixes).
- **Kill-switch:** a runaway/compacting background agent can be halted with **`TaskStop <agentId>`**;
  then `git checkout -- <file>` (or reset to the last slice commit) reverts its damage. Used
  both this session.
- **Git scope-guard:** after committing a verified slice, supervise the next agent with
  `git status --short` + `git diff --quiet <out-of-scope files>` — proves the agent only
  touched its scope (catches drift the tracelog might not show).
- **Lead peeks the tracelog on a ~2-min cadence** while an agent runs (read the file tail,
  NOT the agent transcript) to catch drift early; agents log a `[start]` (with per-file
  JS-hook grep findings) → one `[snippet]`/`[section]` entry per file → `[final]`.
- **STOP-not-compact:** agents are told to STOP + log `BLOCKED` rather than auto-compact.
  (An agent that compacted on `facets.liquid` resumed blind and started counting `</div>`s —
  caught and killed.) Right-size so it never gets close.
- **`docs/CODEBASE-DECISIONS.md` is the canonical base-reasoning doc** every agent reads
  first (markup contract, file-slicing, CSS/color ownership, §4b image standard). Hand it +
  `shopify-best-practices.md` + the relevant tracelog `[start]` entry to each agent.

### The non-negotiable rule (markup contract)
Agents may only change `class=` attributes + presentational wrappers. They may **NOT**
remove/rename custom-element tags (`<cart-drawer>`, `<product-form>`, `<predictive-search>`,
`<localization-form>`, etc.), `id`s, `name`s, `data-*`, form structure, or `aria-*` — the
kept Dawn JS binds to them. Breaking it = silent functional breakage found hours later.

---

## Architecture (decided & partly built)

- **Override war root cause (fixed in L1):** `theme.liquid` emitted an *unlayered*
  `{% for scheme %}` color block generating `.color-{id}` rules. Unlayered CSS beats every
  `@layer`, so Tailwind always lost. Removed; replaced with a **variable-only `:root`**
  palette.
- **Color ownership:** merchant palette (`--color-background/foreground/accent/
  accent-foreground/border`) emitted from `:root` in `theme.liquid` from
  `settings_schema.json`; brand/system tokens in `tokens.css`. All space-separated RGB
  triplets → consumers use `rgb(var(--x))` / Tailwind `bg-x`. **No hardcoded colors, no
  `!important`, no `.color-scheme` classes.**
- **Header is theme-driven:** uses `bg-accent text-accent-foreground` (accent defaults to
  navy `#1B2350`, editable in Theme editor → Global palette). Per-section interactive CSS
  lives in `{% stylesheet %} @layer components { }` inside the section file.

---

## Slice status

| Slice | What | Status |
|---|---|---|
| **L0** | Pipeline smoke (CLI 3.92.1, Tailwind compiles) | ✅ done (interactive `shopify theme dev` is user's to boot) |
| **L1** | Color architecture — kill scheme loop, `:root` palette, base layer, settings | ✅ **signed off** (Claude review + user visual) |
| **L2** | Header — migrated snippets (drawer/search/localization), fixed 7 hardcodes, **killed `header-drawer.js` 404**, swapped to `bg-accent` (theme-driven), fixed `codebase.md` | ✅ **signed off** ("perfect") |
| **L2b** | Footer + announcement bar | ✅ **signed off** (Claude review + user visual — "pass") |
| **L1.5** | Seed-data script + catalog | ✅ **done** — **15 collections × 3 products = 45 products** (fashion accessories, INR), all ACTIVE/published/HTTP 200 |
| **L3** | Collection page (grid/list/facets/pagination) | ✅ **COMPLETE + USER VISUAL EVAL DONE (2026-06-07).** **L3a** product-grid + list-collections grid CSS (`src 4eec670`). **L3b** facets.liquid decomposed 937→192-line orchestrator + 5 single-purpose self-contained snippets (active-pills/filter-group/product-count/sort/mobile), each owning its `{% stylesheet %}` (`src 34b2f71`). All 10 original files migrated. Verified: build clean, forbidden-patterns clean, theme check ZERO offenses (killed 3 dead-CSS MissingAsset errors), full facets.js/show-more.js contract preserved, images §4b-compliant. **L3-fix (`src c526fae`):** visual eval surfaced 3 responsive-toggle bugs — all fixed + re-verified live in-browser (chrome-devtools vs `:9292`): (1) header menu-drawer — restored dropped `.header-wrapper` JS hook + `--header-bottom-position` positioning + sticky-header z-index + icon-swap wrappers (✕ visible, opens AND closes, no content bleed); (2) header search icon/✕ specificity; (3) facets desktop sidebar missing base `hidden` → both drawers showed on mobile. See memory `project-dawn-js-binding-hooks`. **Quality note:** facets-mobile (721) + facets-filter-group (537) are larger than the ~200-line target — candidate for further split later. Minor open: facets-mobile filter drawer has no dimming overlay (functional; cosmetic follow-up). |
| **L4** | Product page (gallery/variant/buy) | ⬜ not started |
| **L5** | Cart (drawer + page + checkout button) → integration checkpoint | ⬜ not started |
| **L6** | Home (carousel = net-new, isolate; + rich text) | ⬜ not started |
| **L7** | Search + predictive search | ⬜ not started |
| **L8** | Account (login/register/account/addresses/order/reset/activate) | ⬜ not started |
| **L9** | Blog + article (static, design-first) | ⬜ not started |
| **L10** | Page/about/contact/404 (static) | ⬜ not started |
| **L11** | Dormancy (templates ref only migrated) + `codebase.md` ✅/⚠️ + CLAUDE.md | ⬜ not started |

**Re-baseline finding:** before this session only `header.liquid` was migrated. The other
53 sections are raw Dawn (29 carry dead `color-{{ }}` classes — harmless no-ops now that the
scheme rules are gone; cleaned at L11). Orphaned & not rendered: `header-mega-menu.liquid`,
`header-dropdown-menu.liquid` → migrate-or-delete at L11.

---

## ✅ The seed-data blocker — RESOLVED + catalog re-seeded (2026-06-06)

L1.5 is done. **15 collections × 3 products = 45 products** seeded — a practical fashion-
accessories catalog (Indian market, INR): Anklets, Bracelets, Earrings, Hair Bands, Hair
Clips, Hair Pins, Hair Ties, Key Chains, Necklaces, Piercings, Rings, Rubber Bands,
Scrunchies, Socks, Sunglasses. All ACTIVE, published to Online Store, storefront HTTP 200,
inventory 50/variant (2–4 variants each). Re-run `node scripts/seed-data.mjs` anytime
(idempotent, updates in place); `--purge` deletes old seed data first.

**Catalog lives in `scripts/seed-catalog.json`** (decoupled from the script). `seed-data.mjs`
loads + schema-validates it (`validateCatalog()` — fails fast on dup handles / bad price /
orphan collectionHandle / missing fields) before any write. Modes: `--dry-run`, `--purge`
(delete seed-data-tagged products + `seed-*` collections, then seed), `--purge-only`.
Catalog was generated by 3 parallel background Sonnet agents (5 categories each → part
files → merged).

**Open items on the catalog:** ~~(1) no product images~~ ✅ **images seeded** (see below). ~~(2) **"HAIR T"
was interpreted as "Hair Tie"**~~ ✅ **confirmed "Hair Tie" (user, 2026-06-07).** (3) 3 products/category — bump if you
want denser collections.

**What unblocked it:** a *new* custom app **"Seed Data"** — `client_id`
`76bc1bfc79fb2f34a46691f2be01fe7e` (the old `13eb003b...` had zero scopes). Creds in
`src/.env`; granted scopes read/write_products, read/write_publications, read_locations,
inventory. `scripts/shopify-token.sh` mints/caches the `client_credentials` token.

**Product images seeded (2026-06-06):** `scripts/seed-images.mjs` — attaches one CC-licensed
photo per product via `productCreateMedia`. Source: LoremFlickr (Flickr CC, keyword-targeted
per category). 45/45 attached, all `READY`. Idempotent: skips products that already have
an image; use `--force` to replace. `--dry-run` previews URLs. Re-run anytime (e.g. after
`--purge` + re-seed). Gotcha: niche keyword strings (e.g. `anklet,silver,jewelry`) hit
LoremFlickr's default placeholder — use single or two-word terms only.

**Gotcha learned:** `GET /admin/api/2025-10/access_scopes.json` returns `Not Found` for
`client_credentials` tokens on custom apps — it does *not* report scopes. Verify scopes
**functionally** instead: per-operation GraphQL probes, or let the seed's prove-one-first
gate prove the write path before bulk.

---

## Next actions (when resuming — START HERE)

1. ~~L1.5 seed + images, L2b sign-off~~ ✅ done.
2. ~~**L3 collection page**~~ ✅ **COMPLETE + USER VISUAL EVAL DONE** (L3a `src 4eec670`,
   L3b `src 34b2f71`, L3-fix `src c526fae`, docs `c4b2d20` + this commit). Visual eval found
   3 responsive-toggle bugs (header drawer / search / facets) — all fixed and re-verified
   live in-browser. See L3 row above + memory `project-dawn-js-binding-hooks`.
3. **L4 — product page** (`main-product.liquid` + gallery/variant-picker/buy-buttons snippets).
   Next slice. **Right-size it** (main-product is large + media-gallery/variant JS-heavy —
   likely 2 sub-slices: media gallery; variant picker + buy buttons). **Flag:** product-page
   variant swatches need swatch visual CSS — `card-product`/`facets-filter-group` have swatch
   CSS for their contexts, but `main-product` is separate (noted in tracelog L3b `[start]`).
4. **Deferred (user decision 2026-06-07):** `facets-mobile.liquid` (721) + `facets-filter-group.liquid`
   (537) are larger than the ~200-line target — revisit a finer split at **L11 cleanup**, not now.
5. Then **L5 cart** → integration checkpoint. L6–L10 can parallelize where files don't overlap. L11 closes.

### ⚠️ Git / GitHub state (resolve before relying on a remote)
- **Two repos, embedded:** the **outer** project repo (`master`, has docs/`codebase.md`/`CLAUDE.md`,
  **no GitHub remote**) and the **nested `src/`** theme repo (`main`) whose `origin` is
  **`github.com/Shopify/dawn.git`** (upstream Dawn — DO NOT push there). All work is committed
  **locally** in both.
- **DECIDED (user, 2026-06-07):** the nested `src/` does **NOT** get its own GitHub repo for now.
  Defer all GitHub-remote decisions until **migration is complete and the base-version template
  exists**. Keep committing locally in both repos as restore points. Revisit (flatten `src/` into
  outer repo vs. separate theme repo) at base-version-template time.

## Key conventions / files
- Dev: `cd src && npm run dev` (Tailwind watch + `shopify theme dev`), store
  `awesome-store-1234637.myshopify.com`.
- `src/assets/main.css` is compiled output — gitignored, never edit. Edit `src/styles/main.css`.
- Update `codebase.md` whenever a file is added/removed in `src/`.
- Memories: `reference-shopify-api-access`, `feedback-pragmatic-token-caching` (cache tokens,
  don't over-secure non-prod), `project-gujrati-theme`.
