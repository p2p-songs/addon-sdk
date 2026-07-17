# CLAUDE.md — addon-sdk

## Scope
SDK for building p2p-songs addons — the music equivalent of
[`stremio-addon-sdk`](https://github.com/Stremio/stremio-addon-sdk):
`addonBuilder()`, `defineCatalogHandler`/`defineMetaHandler`/
`defineStreamHandler`/`defineLyricsHandler`, a CORS'd router that serves
`manifest.json` + resource routes, and a `/configure` route helper (config
read back out of the URL path on every request).

Full architecture: [`p2p-songs/.github` — `docs/IMPLEMENTATION_PLAN.md`](https://github.com/p2p-songs/.github/blob/main/docs/IMPLEMENTATION_PLAN.md), §1, §7, §8, §10 (Phase 2).

## Invariants this repo must hold (see `.github`'s `docs/REVIEW_CHECKLIST.md` §1, §6)
- Purely transport/protocol tooling — content-agnostic, no assumptions
  about what kind of stream source an addon built with it uses.
- Must actually implement the protocol as specced (Plan §8), not a
  simplified subset: content types `artist`/`album`/`track`/`playlist`;
  resources `catalog`/`meta`/`stream`/`lyrics`; ID scheme
  `mbid:<uuid>` / `mbid:<release-mbid>:<track-number>`, `isrc:` as
  secondary `idPrefix`.
- The `/configure` mechanism must round-trip: encode config into the
  manifest URL path, decode it back out on every subsequent request — this
  is how `stream-debrid` (in the `addons` repo) gets its debrid
  credentials and indexer settings without any server-side account system.

## Status
Scaffolding only (this file + README). No SDK code yet. Next: Phase 2 —
ship a "hello world" addon in <20 lines using the SDK, and a "hello
configurable world" addon proving the `/configure` round-trip.
