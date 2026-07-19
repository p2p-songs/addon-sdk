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
- Must actually implement the protocol as specced (Plan §8), not a
  simplified subset: content types `artist`/`album`/`track`/`playlist`;
  resources `catalog`/`meta`/`stream`/`lyrics`; **entity-typed** IDs
  `mbid:<entity>:<uuid>` (entity ∈ `artist`/`release`/`recording`/`track`),
  `isrc:` secondary. `stream`/`lyrics` are keyed by `mbid:recording:<uuid>`
  (the streamable unit); `mbid:track:<uuid>` is album context only. The old
  synthetic `mbid:<release-mbid>:<track-number>` form is **removed** — it
  collides across discs (track position is medium-scoped) and breaks on
  free-text vinyl numbers (audit A-003). The SDK's schema tests must include
  multi-disc / vinyl-free-text / bonus-disc / same-recording-on-two-releases
  fixtures.
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

## Structure (as of first implementation, 2026-07-18)
This repo is a **pnpm workspace**. `packages/protocol` = `@p2p-songs/protocol`
(the contract, built first). `packages/sdk` = `@p2p-songs/addon-sdk`
(`addonBuilder`, handlers, router — depends on protocol) comes next. Tooling:
TypeScript, zod, vitest.

## Status
`packages/protocol` implemented (entity-typed MBID schemas + parse/format,
stream/lyrics/meta/catalog resource shapes, manifest, expiry hint) with vitest
tests incl. the A-003 identity fixtures. Next: Phase 2 —
ship a "hello world" addon in <20 lines using the SDK, and a "hello
configurable world" addon proving the `/configure` round-trip.

## Being audited?
If you're the adversarial reviewer, not the implementer: start at
[`p2p-songs/.github` — `docs/ADVERSARIAL_REVIEW_CONTRACT.md`](https://github.com/p2p-songs/.github/blob/main/docs/ADVERSARIAL_REVIEW_CONTRACT.md),
not this file.
