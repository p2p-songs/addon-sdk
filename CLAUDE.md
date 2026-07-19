# CLAUDE.md — addon-sdk

## Scope
SDK for building p2p-songs addons — the music equivalent of
[`stremio-addon-sdk`](https://github.com/Stremio/stremio-addon-sdk):
`addonBuilder()`, `defineCatalogHandler`/`defineMetaHandler`/
`defineStreamHandler`/`defineLyricsHandler`, a CORS'd router that serves
`manifest.json` + resource routes, and a `/configure` route helper (config
read back out of the URL path on every request).

Full architecture: [`p2p-songs/.github` — `docs/IMPLEMENTATION_PLAN.md`](https://github.com/p2p-songs/.github/blob/main/docs/IMPLEMENTATION_PLAN.md), §1, §7, §8, §10 (Phase 2).

## Before implementation
Read `../.github/docs/audits/README.md` and its first (latest) report before
starting work. The registry owns current sign-off and supersession; do not rely
only on issue notifications.

## Invariants this repo must hold (see `.github`'s `docs/REVIEW_CHECKLIST.md` §1, §6)
- Purely transport/protocol tooling — content-agnostic, no assumptions
  about what kind of stream source an addon built with it uses.
- Must actually implement the protocol as specced (`docs/PROTOCOL.md`, the
  standalone v0.1 wire spec; Plan §8), not a simplified subset: content types
  `artist`/`album`/`track`/`playlist`; resources `catalog`/`meta`/`stream`/`lyrics`;
  **entity-typed** IDs `mbid:<entity>:<uuid>` (entity ∈
  `artist`/`release`/`recording`/`track`), `isrc:` secondary, `playlist:<token>`
  (addon-scoped opaque, no colon) for playlists. `stream`/`lyrics` are keyed by
  `mbid:recording:<uuid>` (the streamable unit); `mbid:track:<uuid>` is album
  context only. The old synthetic `mbid:<release-mbid>:<track-number>` form is
  **removed** — it collides across discs (track position is medium-scoped) and
  breaks on free-text vinyl numbers (audit A-003). The SDK's schema tests must
  include multi-disc / vinyl-free-text / bonus-disc / same-recording-on-two-releases
  fixtures.
- **Content type ↔ id identity is enforced** (`meta` is a discriminated union:
  `artist`→artist MBID, `album`→release MBID, `track`→recording MBID/ISRC,
  `playlist`→playlist id) and **every resource URL is `https://`** (`stream.url`,
  `lyric.url`, `poster`, `logo`, `background`; `ytId`/`infoHash` exempt). Audit
  A-004 — don't loosen either back to bare `z.string().url()` or an unconstrained
  `id`.
- The `/configure` mechanism must round-trip: encode config into the
  manifest URL path, decode it back out on every subsequent request — this
  is how `stream-debrid` (in the `addons` repo) gets its debrid
  credentials and indexer settings without any server-side account system.

## Stream object: optional link-expiry hint (audit re-audit, 2026-07-17)
The stream object's `behaviorHints` carries an **optional** expiry hint for
resolved (debrid/CDN) URLs — `expiresAt` (absolute UTC ISO-8601) **or**
`maxAgeSeconds` (int). The SDK must **validate its shape when present** and
leave it absent otherwise. It is a *hint only*: the player's freshness
guarantee is re-resolve-on-failure, never trust in this field (see
IMPLEMENTATION_PLAN §8 "Link expiry" and player ARCHITECTURE §5a). This exists
because the player has no neutral way to know when a debrid link dies without
parsing provider URL formats (which would break addon-neutrality) — so the
addon, which does know, optionally tells it.

## Decided: this repo owns the canonical protocol contract
The addon protocol (manifest, stream object, resource shapes, entity-typed
IDs) is the wire contract shared by addons *and* the player. Decision (from
`player/docs/ARCHITECTURE.md` §8/§9): **one source of truth, and it lives
here** — the **schema-first** `@p2p-songs/protocol` package: zod schemas are
the source of truth, TS types are `z.infer`red, runtime validators come free.
Zero heavy deps; the player can `import type` at zero runtime cost. The
`player` repo consumes it (pinned git dependency pre-1.0, published package
at protocol v1). This package is built **first** (it's the foundation the SDK,
addons, and player addon-client all import); don't let a second copy of these
types grow elsewhere.

## Structure (as of Phase 2, 2026-07-19)
This repo is a **pnpm workspace**. `packages/protocol` = `@p2p-songs/protocol`
(the contract, built first). `packages/sdk` = `@p2p-songs/addon-sdk`
(`AddonBuilder`, typed handlers, framework-agnostic CORS `createRouter`,
`serveHTTP` node adapter, `/configure` round-trip via `encodeConfig`/`decodeConfig`
+ default page). The SDK **re-exports `@p2p-songs/protocol`** so addon authors
take one dependency. Tooling: TypeScript, zod, vitest.

Router invariants (don't regress): CORS on every response + `OPTIONS` 204;
leading non-reserved path segment = base64url config → `config` handler arg;
`stream`/`lyrics` keyed by a validated `mbid:recording:` id (400 otherwise),
album context from `<extra>`; every handler response validated against the
protocol response schema (a bad response is the addon's bug → 500); cache hints
→ `Cache-Control`.

**Security posture at this boundary (audit A-005 — do NOT loosen):** the router
is the credential-carrying trust boundary every addon inherits.
- A request with a config segment is **secret-bearing** → manifest, configure,
  and resource responses are `Cache-Control: no-store, private`, never public.
- Client error bodies are **opaque** (`{ err }` only) — a handler/provider
  exception message can contain the debrid key, so it never reaches the client;
  diagnostics go only to the opt-in `onError` hook (implementer redacts).
- Route content `type` is validated: `stream`/`lyrics` require `track`,
  `catalog`/`meta` require a protocol `ContentType`, else 404.
- `configurationRequired` **fails closed** (400 without a valid config); a
  malformed config prefix is a 400, not a silent downgrade.
- Malformed percent-encoding → controlled 400, never an escaped `URIError`/500.

## Status
`packages/protocol` implemented (entity-typed MBID + ISRC + playlist schemas +
parse/format, https-only resource URLs, type↔id discriminated-union meta,
stream/lyrics/catalog shapes, manifest, expiry hint) with 46 vitest tests incl.
the A-003 identity fixtures and the A-004 bonus-disc/multi-disc fixture. The
standalone wire spec is `docs/PROTOCOL.md` (v0.1). Audits A-003 and A-004 are
reconciled. **Phase 2 (`packages/sdk`, `@p2p-songs/addon-sdk`) implemented
2026-07-19:** `AddonBuilder` + typed handlers, framework-agnostic `createRouter`,
`serveHTTP`, `/configure` round-trip; 22 vitest tests (config round-trip, builder
guards, router routing/validation/CORS, live `serveHTTP` hello-world over HTTP).
68 tests total across the workspace; typecheck + build green. **Audit A-005
(SDK's first audit) reconciled 2026-07-19** — 2 critical + 3 medium boundary
findings fixed: secret-bearing paths are `no-store, private` (never public);
error bodies opaque + `onError` diagnostics hook; route content types validated;
`configurationRequired` fails closed + malformed config → 400; malformed
percent-encoding → 400. 32 SDK tests (10 new A-005 regressions in
`test/security.test.ts`); 78 total; built-package probes green. Next: Phase 3 —
reference addons in the `addons` repo (`stream-legal` first — no debrid/config,
gives the first end-to-end slice).

## Being audited?
If you're the adversarial reviewer, not the implementer: start at
[`p2p-songs/.github` — `docs/ADVERSARIAL_REVIEW_CONTRACT.md`](https://github.com/p2p-songs/.github/blob/main/docs/ADVERSARIAL_REVIEW_CONTRACT.md),
not this file.
