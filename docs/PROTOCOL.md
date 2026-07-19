# p2p-songs Addon Protocol — v0.1

Status: **v0.1 (pre-1.0, may change)** · Wire package: [`@p2p-songs/protocol`](../packages/protocol) · Authoritative design rationale: [`.github` — `docs/IMPLEMENTATION_PLAN.md` §8](https://github.com/p2p-songs/.github/blob/main/docs/IMPLEMENTATION_PLAN.md)

This is the standalone, independently-implementable specification of the
p2p-songs addon protocol: an **HTTP + JSON** contract, modeled on the Stremio
addon protocol but adapted for music (recordings, releases, lyrics). An addon is
a stateless HTTP service that publishes a `manifest.json` and answers a fixed
set of resource routes. A client (the player) installs an addon by its
`manifest.json` URL and calls its routes.

The `@p2p-songs/protocol` package is the machine-readable source of truth: every
shape below is a zod schema in [`packages/protocol/src`](../packages/protocol/src),
and this document and those schemas must agree. Where prose and schema disagree,
the schema wins and this document is the bug.

---

## 1. Transport rules

- **HTTPS.** Addons are served over `https://`. Every URL an addon returns that
  the client will fetch or play (`stream.url`, `lyric.url`, `poster`, `logo`,
  `background`) **MUST** be `https://`. The wire schemas reject any other scheme
  (`http`, `ftp`, `file`, `data`, `javascript`, …). `ytId` and `infoHash` are
  not URLs and are exempt.
- **JSON.** Requests carry no body; all parameters are in the path. Responses
  are `application/json; charset=utf-8`.
- **CORS.** Every route MUST send `Access-Control-Allow-Origin: *` (the client
  is a browser app on a different origin) and answer `OPTIONS` preflight.
- **Statelessness.** A request is fully determined by its URL. Per-user
  configuration (e.g. debrid credentials) is carried **in the manifest URL
  path**, not in cookies or server-side sessions — see §7.
- **Caching.** Resource responses MAY include `cacheMaxAge`, `staleRevalidate`,
  `staleError` (integer seconds) to advise client/CDN caching.

---

## 2. Content types

`artist` · `album` · `track` · `playlist`

The atomic **streamable** unit is the **recording** (the song), surfaced under
the `track` content type. `album`/`playlist` provide ordered context; `artist`
is a browse root.

---

## 3. ID scheme

IDs are entity-typed. An id's prefix names its namespace; a client MUST NOT
infer identity from position or composition.

| Id form | Identifies | Notes |
|---|---|---|
| `mbid:artist:<uuid>` | MusicBrainz artist | |
| `mbid:release:<uuid>` | MusicBrainz release | an **album** (a specific pressing) |
| `mbid:recording:<uuid>` | MusicBrainz recording | **the song itself** — the streamable / cache / dedup key; identity shared across every release it appears on |
| `mbid:track:<uuid>` | MusicBrainz track | a recording *as it appears on one release+medium*; **album context only**, never resolved against |
| `isrc:<CC><REG><NNNNNNN>` | a recording (by ISRC) | secondary id for a recording |
| `playlist:<token>` | a playlist | **addon-scoped opaque token** (`[A-Za-z0-9][A-Za-z0-9._~-]*`, no colon); a playlist has no canonical cross-addon identity, so the addon that emits the id is the one that resolves its `/meta` |

`<uuid>` is a canonical lowercase MusicBrainz UUID (`8-4-4-4-12` hex).

There is **no** synthetic composite id (e.g. `release:track-number`): track
position is scoped to a medium (disc), so multi-disc albums would collide, and
positions can be free text (vinyl `A4`). See audit A-003.

**Identity relationships a client relies on:**
- The same recording on two releases → **one** `mbid:recording:` id, **two**
  distinct `mbid:track:` ids.
- Disc 1 "track 1" and (bonus) disc 2 "track 1" → distinct `mbid:track:` ids.

---

## 4. Manifest

`GET /manifest.json` → a `Manifest`:

```jsonc
{
  "id": "com.p2p-songs.catalog-charts",   // reverse-DNS-ish, unique
  "version": "0.1.0",                       // semver
  "name": "Charts",
  "description": "Trending music",
  "resources": ["catalog", "meta"],         // subset of catalog|meta|stream|lyrics, ≥1
  "types": ["album", "artist"],             // subset of the content types, ≥1
  "idPrefixes": ["mbid:release:", "mbid:artist:"], // optional: only call me for these ids
  "catalogs": [
    { "type": "album", "id": "trending", "name": "Trending",
      "extra": [{ "name": "genre", "options": ["rock", "jazz"] }] }
  ],
  "behaviorHints": {
    "configurable": false,          // exposes a /configure page
    "configurationRequired": false, // hide "Install" until configured
    "p2p": false,
    "adult": false
  },
  "logo": "https://…/logo.png",       // optional, https
  "background": "https://…/bg.jpg",   // optional, https
  "contactEmail": "hi@example.com"    // optional
}
```

`resources` and `types` are non-empty. `catalogs` defaults to `[]`.

---

## 5. Resource routes

Ids appearing in a path segment are **URL-encoded** (they contain `:`).
`<extra>` is an optional trailing segment of URL-encoded `key=value` pairs
joined by `&` (Stremio convention), e.g. `genre%3Drock%26skip%3D100`.

| Route | Resource | Purpose |
|---|---|---|
| `GET /catalog/:type/:id.json` | catalog | a listing (`metas`) |
| `GET /catalog/:type/:id/:extra.json` | catalog | listing with search/genre/skip |
| `GET /meta/:type/:id.json` | meta | full metadata for one item |
| `GET /stream/:type/:recordingId.json` | stream | streams for a recording |
| `GET /stream/:type/:recordingId/:extra.json` | stream | streams with album context |
| `GET /lyrics/:type/:recordingId.json` | lyrics | lyrics for a recording |
| `GET /lyrics/:type/:recordingId/:extra.json` | lyrics | lyrics with album context |

For `stream`/`lyrics`, `:type` is `track` and `:recordingId` MUST be a
`mbid:recording:` id. Optional album context is passed in `<extra>`:
`trackId=<mbid:track:…>` (preferred pressing) and, for streams,
`releaseId=<mbid:release:…>` (album grouping). An addon MUST ignore extras it
does not understand.

### 5.1 catalog response

```jsonc
{ "metas": [ { "type": "album", "id": "mbid:release:…", "name": "…",
              "poster": "https://…", "description": "…" } ] }
```

Each `meta` item's `type` and `id` MUST match (§3): `artist`→artist MBID,
`album`→release MBID, `track`→recording MBID or ISRC, `playlist`→playlist id.

### 5.2 meta response

```jsonc
{ "meta": {
    "type": "album", "id": "mbid:release:…", "name": "Deluxe Edition",
    "artistName": "…", "releaseDate": "1997-05-12",
    "poster": "https://…",
    "tracks": [                              // album/playlist only
      { "recordingId": "mbid:recording:…",   // streamable identity (required)
        "trackId": "mbid:track:…",           // album-context identity (optional)
        "title": "Opening", "disc": 1, "position": "1", "durationMs": 262000 },
      { "recordingId": "mbid:recording:…", "trackId": "mbid:track:…",
        "title": "Opening (reprise)", "disc": 2, "position": "A4" }
    ]
} }
```

`position` is preserved verbatim (may be free text). A recording reappearing on
a bonus disc keeps its `recordingId` but has a distinct `trackId`.

### 5.3 stream response

Each stream carries **exactly one** source:

```jsonc
{ "streams": [
    // resolved direct link (stream-legal / stream-debrid)
    { "url": "https://…/track.flac", "name": "FLAC · cached",
      "behaviorHints": {
        "bingeGroup": "mbid:release:…",  // gapless auto-advance grouping
        "filename": "05 - Song.flac",
        "videoSize": 41234567,
        "expiresAt": "2026-07-19T21:30:00Z" // optional; OR maxAgeSeconds, never both
      } },
    // official embed (stream-ytmusic)
    { "ytId": "dQw4w9WgXcQ", "name": "YouTube Music" }
] }
```

- `url` MUST be `https://`. A source is exactly one of `url` | `ytId` |
  `infoHash` (`+ fileIdx`, torrent pointer, retained for parity — no reference
  addon emits it; addons resolve server-side first).
- **Link expiry** (`behaviorHints.expiresAt` absolute UTC ISO-8601, **or**
  `maxAgeSeconds` integer) is **optional** and a **hint only**. At most one may
  be set. The client's freshness guarantee is re-resolve-on-failure; it never
  trusts this field for correctness (player `ARCHITECTURE.md` §5/§5a).

### 5.4 lyrics response

```jsonc
{ "lyrics": [ { "id": "lrclib-123", "lang": "eng",
               "url": "https://…/synced.lrc", "synced": true } ] }
```

`url` MUST be `https://`. `synced: true` ⇒ time-synced `.lrc`.

---

## 6. Empty results and errors

- **No results** for a valid request → HTTP `200` with the empty container
  (`{ "streams": [] }`, `{ "metas": [] }`, `{ "lyrics": [] }`). This is not an
  error.
- **Genuine failure** → an appropriate `4xx`/`5xx`. A client treats any
  non-`200`, non-JSON, or schema-invalid response as "this addon contributed
  nothing" and moves on to the next addon; one addon failing never blocks
  playback.
- Unknown routes, an unknown/invalid content `type`, or `stream`/`lyrics`
  addressed with a non-`track` type → `404`. Malformed input (bad
  percent-encoding, an invalid stream/lyrics request, a corrupt config prefix)
  → `4xx`, never an uncaught server error.
- **Error bodies are opaque.** A failure response carries only a stable `err`
  string — never a handler or provider exception message, which can contain the
  configured credential. Diagnostic detail stays server-side (audit A-005).

---

## 7. Configuration (`/configure`)

An addon that needs per-user settings (e.g. `stream-debrid`: debrid credentials,
indexer choices) sets `behaviorHints.configurable: true` and serves a
`/configure` HTML page. Configuration is encoded into the **manifest URL path**
and read back out of the path on every subsequent request — there is no
server-side account system. Concretely, the configured install URL looks like
`https://addon.example/<encoded-config>/manifest.json`, and the same
`<encoded-config>` segment prefixes that install's resource routes.

Because that segment carries a **secret** (audit A-005):

- A request whose path includes a config segment is **secret-bearing**. Its
  manifest, `/configure`, and resource responses are served `Cache-Control:
  no-store, private` — never shared/public caching, regardless of a handler's
  cache hints. (Unconfigured requests keep normal caching.)
- `configurationRequired: true` **fails closed**: the SDK rejects a resource
  request (`400`) unless a valid config was decoded — a handler is never invoked
  without credentials, so it can never fall back to an operator-owned account.
- A config segment that does not decode is a `400`, not a silent downgrade to
  "unconfigured".

`<encoded-config>` is the **base64url of the config JSON** (no `/`, no `=`
padding, so it is a single path-safe segment). The router treats a leading path
segment that is not one of the reserved roots (`manifest.json`, `configure`,
`catalog`, `meta`, `stream`, `lyrics`) as this config segment, decodes it, and
passes the object to handlers as `config`. `@p2p-songs/addon-sdk` provides
`encodeConfig` / `decodeConfig` and a default `/configure` page that builds the
install URL. The config never leaves the URL path — no cookies, no server state.

---

## 8. Versioning

This document and `@p2p-songs/protocol` are versioned together. Pre-1.0 (`0.x`)
the wire contract may change; the player pins the protocol package by git ref.
At `1.0` the package is published and this spec is frozen for that major.
`PROTOCOL_VERSION` is exported from the package.

---

## 9. Worked example — validating a hand-written response

A minimal `stream-legal`-style manifest and a `/stream` response, validated with
the wire package (this is exactly what the SDK router and player addon-client
do):

```ts
import { manifestSchema, streamResponseSchema } from "@p2p-songs/protocol";

manifestSchema.parse({
  id: "com.p2p-songs.stream-legal",
  version: "0.1.0",
  name: "Legal Streams",
  description: "Public-domain & CC audio",
  resources: ["stream"],
  types: ["track"],
  idPrefixes: ["mbid:recording:", "isrc:"],
}); // ✓

streamResponseSchema.parse({
  streams: [{ url: "https://cdn.example/song.flac", name: "FLAC" }],
}); // ✓

streamResponseSchema.parse({
  streams: [{ url: "http://cdn.example/song.flac" }], // ✗ throws: non-https
});
```
