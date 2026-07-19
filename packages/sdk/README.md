# @p2p-songs/addon-sdk

Build a p2p-songs addon: declare a manifest, register typed resource handlers,
serve them over a CORS'd HTTP router with a `/configure` round-trip. The music
equivalent of [`stremio-addon-sdk`](https://github.com/Stremio/stremio-addon-sdk).

- **Wire spec:** [`../../docs/PROTOCOL.md`](../../docs/PROTOCOL.md)
- **Contract types:** [`@p2p-songs/protocol`](../protocol) (re-exported from here,
  so an addon needs only this one dependency).

## Hello world

```ts
import { AddonBuilder, serveHTTP } from "@p2p-songs/addon-sdk";

const addon = new AddonBuilder({
  id: "com.p2p-songs.hello",
  version: "0.1.0",
  name: "Hello",
  description: "A minimal stream addon",
  resources: ["stream"],
  types: ["track"],
  idPrefixes: ["mbid:recording:"],
})
  .defineStreamHandler(({ recordingId }) => ({
    streams: [{ url: "https://cdn.example/song.flac", name: "FLAC" }],
  }))
  .getInterface();

serveHTTP(addon, { port: 7000 });
// install: http://127.0.0.1:7000/manifest.json
```

Handlers are keyed the way the protocol is: `stream`/`lyrics` receive a
validated `recordingId` (plus optional `trackId`/`releaseId` album context);
`catalog`/`meta` receive the route `id` and parsed `extra`. The router validates
every handler response against the protocol schema and maps `cacheMaxAge` etc.
to `Cache-Control`.

## Configurable addons

For per-user settings (e.g. `stream-debrid` debrid credentials), set
`behaviorHints.configurable` and read `config` off the handler args — it is
decoded from the `/<encoded-config>/…` URL segment, never stored server-side:

```ts
.defineStreamHandler(({ recordingId, config }) => {
  const key = config?.debridKey as string | undefined;
  /* …resolve with the user's own key… */
  return { streams: [] };
})
```

`encodeConfig` / `decodeConfig` are exported for building install URLs; the
default `/configure` page generates one in the browser. Framework-agnostic
embedding: `createRouter(addon)` returns a `({ method, url }) => { status,
headers, body }` function if you are not using `serveHTTP`.

Build: `pnpm build` · Test: `pnpm test` · Typecheck: `pnpm typecheck`.
