import { describe, it, expect } from "vitest";
import { AddonBuilder, createRouter, encodeConfig, type AddonConfig } from "../src/index.js";

const REC = "mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TRACK = "mbid:track:11111111-1111-1111-1111-111111111111";
const RELEASE = "mbid:release:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const enc = encodeURIComponent;

function helloAddon(onStream?: (config?: AddonConfig) => void) {
  return new AddonBuilder({
    id: "com.p2p-songs.hello",
    version: "0.1.0",
    name: "Hello",
    description: "test",
    resources: ["stream"],
    types: ["track"],
    idPrefixes: ["mbid:recording:"],
  })
    .defineStreamHandler(({ recordingId, config }) => {
      onStream?.(config);
      expect(recordingId).toBe(REC);
      return { streams: [{ url: "https://cdn.example/x.flac", name: "FLAC" }], cacheMaxAge: 3600 };
    })
    .getInterface();
}

describe("router — transport + CORS", () => {
  const route = createRouter(helloAddon());

  it("serves manifest.json with CORS", async () => {
    const r = await route({ method: "GET", url: "/manifest.json" });
    expect(r.status).toBe(200);
    expect(r.headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(JSON.parse(r.body).id).toBe("com.p2p-songs.hello");
  });

  it("answers OPTIONS preflight with 204 + CORS", async () => {
    const r = await route({ method: "OPTIONS", url: "/stream/track/x.json" });
    expect(r.status).toBe(204);
    expect(r.headers["Access-Control-Allow-Methods"]).toContain("GET");
  });

  it("404s unknown routes and rejects non-GET", async () => {
    expect((await route({ method: "GET", url: "/nope" })).status).toBe(404);
    expect((await route({ method: "POST", url: "/manifest.json" })).status).toBe(405);
  });
});

describe("router — resource routing", () => {
  it("routes a stream request keyed by recording", async () => {
    const route = createRouter(helloAddon());
    const r = await route({ method: "GET", url: `/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(200);
    const body = JSON.parse(r.body);
    expect(body.streams).toHaveLength(1);
    expect(r.headers["Cache-Control"]).toContain("max-age=3600");
  });

  it("passes album context from the extra segment", async () => {
    let seen: { trackId?: string; releaseId?: string } = {};
    const addon = new AddonBuilder({
      id: "x", version: "0.1.0", name: "X", description: "",
      resources: ["stream"], types: ["track"],
    })
      .defineStreamHandler(({ trackId, releaseId }) => {
        seen = { trackId, releaseId };
        return { streams: [] };
      })
      .getInterface();
    const extra = enc(`trackId=${TRACK}&releaseId=${RELEASE}`);
    const r = await createRouter(addon)({ method: "GET", url: `/stream/track/${enc(REC)}/${extra}.json` });
    expect(r.status).toBe(200);
    expect(seen).toEqual({ trackId: TRACK, releaseId: RELEASE });
  });

  it("400s a stream request whose id is not a recording id", async () => {
    const r = await createRouter(helloAddon())({ method: "GET", url: `/stream/track/${enc(TRACK)}.json` });
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body).err).toMatch(/invalid stream request/);
  });

  it("404s a resource with no registered handler", async () => {
    const r = await createRouter(helloAddon())({ method: "GET", url: `/catalog/track/x.json` });
    expect(r.status).toBe(404);
  });

  it("500s when a handler returns a schema-invalid response (non-https url)", async () => {
    const addon = new AddonBuilder({
      id: "x", version: "0.1.0", name: "X", description: "",
      resources: ["stream"], types: ["track"],
    })
      .defineStreamHandler(() => ({ streams: [{ url: "http://insecure/x.flac" }] }))
      .getInterface();
    const r = await createRouter(addon)({ method: "GET", url: `/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(500);
    expect(JSON.parse(r.body).err).toMatch(/invalid stream response/);
  });

  it("500s when a handler throws", async () => {
    const addon = new AddonBuilder({
      id: "x", version: "0.1.0", name: "X", description: "",
      resources: ["stream"], types: ["track"],
    })
      .defineStreamHandler(() => { throw new Error("boom"); })
      .getInterface();
    const r = await createRouter(addon)({ method: "GET", url: `/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(500);
    expect(JSON.parse(r.body).detail).toBe("boom");
  });
});

describe("router — /configure round-trip", () => {
  it("decodes the leading config segment and hands it to the handler", async () => {
    let received: AddonConfig | undefined;
    const addon = new AddonBuilder({
      id: "x", version: "0.1.0", name: "X", description: "",
      resources: ["stream"], types: ["track"],
      behaviorHints: { configurable: true, configurationRequired: true },
    })
      .defineStreamHandler(({ config }) => {
        received = config;
        return { streams: [] };
      })
      .getInterface();
    const route = createRouter(addon);

    const seg = encodeConfig({ debridKey: "RD-secret" });
    const r = await route({ method: "GET", url: `/${seg}/stream/track/${enc(REC)}.json` });
    expect(r.status).toBe(200);
    expect(received).toEqual({ debridKey: "RD-secret" });

    // Unconfigured install: same route, no leading segment → no config.
    await route({ method: "GET", url: `/stream/track/${enc(REC)}.json` });
    expect(received).toBeUndefined();
  });

  it("serves the configure page as HTML", async () => {
    const r = await createRouter(helloAddon())({ method: "GET", url: "/configure" });
    expect(r.status).toBe(200);
    expect(r.headers["Content-Type"]).toContain("text/html");
    expect(r.body).toContain("Configure Hello");
  });

  it("serves manifest.json under a config prefix", async () => {
    const seg = encodeConfig({ k: 1 });
    const r = await createRouter(helloAddon())({ method: "GET", url: `/${seg}/manifest.json` });
    expect(r.status).toBe(200);
    expect(JSON.parse(r.body).id).toBe("com.p2p-songs.hello");
  });
});
