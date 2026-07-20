/**
 * A-005 boundary regressions. The SDK is the credential-carrying trust boundary
 * every addon inherits, so these are the cases that must fail safe.
 */
import { describe, it, expect } from "vitest";
import { AddonBuilder, createRouter, encodeConfig, type AddonConfig } from "../src/index.js";

const REC = "mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const enc = encodeURIComponent;
const SECRET = "RD-SECRET-abc123";

function streamAddon(opts: {
  handler?: (a: { config?: AddonConfig }) => unknown;
  configurationRequired?: boolean;
  onError?: (e: unknown) => void;
}) {
  const addon = new AddonBuilder({
    id: "com.p2p-songs.s",
    version: "0.1.0",
    name: "S",
    description: "",
    resources: ["stream"],
    types: ["track"],
    idPrefixes: ["mbid:recording:"],
    ...(opts.configurationRequired
      ? { behaviorHints: { configurable: true, configurationRequired: true } }
      : {}),
  })
    .defineStreamHandler((a) => (opts.handler ? (opts.handler(a) as { streams: [] }) : { streams: [] }))
    .getInterface();
  return createRouter(addon, opts.onError ? { onError: opts.onError } : {});
}

describe("[CRIT-1] secret-bearing configured paths are never public-cacheable", () => {
  const seg = encodeConfig({ debridKey: SECRET });

  it("configured manifest is no-store, private", async () => {
    const r = await streamAddon({})({ method: "GET", url: `/${seg}/manifest.json` });
    expect(r.status).toBe(200);
    expect(r.headers["Cache-Control"]).toBe("no-store, private");
  });

  it("configured resource response is no-store even if the handler asks for public caching", async () => {
    const route = streamAddon({ handler: () => ({ streams: [], cacheMaxAge: 3600 }) });
    const r = await route({ method: "GET", url: `/${seg}/stream/track/${enc(REC)}.json` });
    expect(r.headers["Cache-Control"]).toBe("no-store, private");
    expect(r.headers["Cache-Control"]).not.toContain("public");
  });

  it("unconfigured manifest keeps public caching", async () => {
    const r = await streamAddon({})({ method: "GET", url: `/manifest.json` });
    expect(r.headers["Cache-Control"]).toContain("public");
  });

  // A-006: the secret-bearing check must run before method/OPTIONS early-returns,
  // so even a 405/204 on a configured path is no-store.
  it("configured non-GET (405) and OPTIONS (204) are still no-store", async () => {
    const route = streamAddon({});
    for (const method of ["POST", "PUT", "DELETE"]) {
      const r = await route({ method, url: `/${seg}/stream/track/${enc(REC)}.json` });
      expect(r.status).toBe(405);
      expect(r.headers["Cache-Control"]).toBe("no-store, private");
    }
    const opt = await route({ method: "OPTIONS", url: `/${seg}/manifest.json` });
    expect(opt.status).toBe(204);
    expect(opt.headers["Cache-Control"]).toBe("no-store, private");
  });

  it("unconfigured 405/OPTIONS carry no secret cache policy", async () => {
    const route = streamAddon({});
    expect((await route({ method: "POST", url: `/manifest.json` })).headers["Cache-Control"]).toBeUndefined();
    expect((await route({ method: "OPTIONS", url: `/manifest.json` })).headers["Cache-Control"]).toBeUndefined();
  });
});

describe("[A-006] meta route type↔id identity is validated on input", () => {
  function metaAddon() {
    const addon = new AddonBuilder({
      id: "m", version: "0.1.0", name: "M", description: "",
      resources: ["meta"], types: ["artist", "album", "track"],
    })
      .defineMetaHandler(({ id, type }) => ({ meta: metaFor(type, id) }))
      .getInterface();
    return createRouter(addon);
  }
  // Minimal valid meta per type (the handler is only reached on a matching pair).
  function metaFor(type: string, id: string): Record<string, unknown> {
    return { type, id, name: "x" };
  }
  const ARTIST = "mbid:artist:cccccccc-cccc-cccc-cccc-cccccccccccc";
  const RELEASE = "mbid:release:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

  it("accepts matching type/id pairs", async () => {
    const route = metaAddon();
    expect((await route({ method: "GET", url: `/meta/artist/${enc(ARTIST)}.json` })).status).toBe(200);
    expect((await route({ method: "GET", url: `/meta/album/${enc(RELEASE)}.json` })).status).toBe(200);
    expect((await route({ method: "GET", url: `/meta/track/${enc(REC)}.json` })).status).toBe(200);
  });

  it("rejects contradictory pairs with 404 (no handler call)", async () => {
    const route = metaAddon();
    // artist route with a recording id — the exact A-006 probe.
    expect((await route({ method: "GET", url: `/meta/artist/${enc(REC)}.json` })).status).toBe(404);
    expect((await route({ method: "GET", url: `/meta/album/${enc(REC)}.json` })).status).toBe(404);
    expect((await route({ method: "GET", url: `/meta/track/${enc(RELEASE)}.json` })).status).toBe(404);
  });
});

describe("[CRIT-2] handler/router exceptions never disclose the credential", () => {
  it("a provider error mentioning the secret is not echoed to the client", async () => {
    let reported: unknown;
    const route = streamAddon({
      handler: ({ config }) => {
        throw new Error(`provider rejected key ${(config as { debridKey: string }).debridKey}`);
      },
      onError: (e) => (reported = e),
    });
    const seg = encodeConfig({ debridKey: SECRET });
    const r = await route({ method: "GET", url: `/${seg}/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(500);
    expect(r.body).not.toContain(SECRET);
    expect(JSON.parse(r.body)).toEqual({ err: "stream handler failed" });
    // Diagnostics still get the raw error (implementer redacts before logging).
    expect(String(reported)).toContain(SECRET);
  });
});

describe("[MED-3] route content types are validated", () => {
  it("stream with a non-track type is rejected (never invokes the handler)", async () => {
    let called = false;
    const route = streamAddon({ handler: () => ((called = true), { streams: [] }) });
    const r = await route({ method: "GET", url: `/stream/artist/${enc(REC)}.json` });
    expect(r.status).toBe(404);
    expect(called).toBe(false);
  });
});

describe("[MED-4] configurationRequired fails closed", () => {
  it("rejects an unconfigured resource call", async () => {
    let called = false;
    const route = streamAddon({
      configurationRequired: true,
      handler: () => ((called = true), { streams: [] }),
    });
    const r = await route({ method: "GET", url: `/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body).err).toBe("configuration required");
    expect(called).toBe(false);
  });

  it("a malformed config prefix is a 400, not a silent downgrade to unconfigured", async () => {
    let called = false;
    const route = streamAddon({
      configurationRequired: true,
      handler: () => ((called = true), { streams: [] }),
    });
    const r = await route({ method: "GET", url: `/not-valid-base64-config/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body).err).toBe("invalid configuration");
    expect(called).toBe(false);
  });

  it("proceeds when a valid config is present", async () => {
    const seg = encodeConfig({ debridKey: SECRET });
    const route = streamAddon({ configurationRequired: true, handler: () => ({ streams: [] }) });
    const r = await route({ method: "GET", url: `/${seg}/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(200);
  });
});

describe("[MED-5] malformed percent-encoding is a controlled 400", () => {
  it("does not reject the router promise with a URIError", async () => {
    const route = streamAddon({});
    const r = await route({ method: "GET", url: `/stream/track/%E0%A4%A.json` });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body).err).toBe("bad request");
  });

  it("malformed extra segment is also a controlled 400", async () => {
    const route = streamAddon({});
    const r = await route({ method: "GET", url: `/stream/track/${enc(REC)}/%E0%A4%A.json` });
    expect(r.status).toBe(400);
  });
});
