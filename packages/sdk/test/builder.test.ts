import { describe, it, expect } from "vitest";
import { AddonBuilder, AddonError } from "../src/index.js";

const baseManifest = {
  id: "com.p2p-songs.hello",
  version: "0.1.0",
  name: "Hello",
  description: "test addon",
  resources: ["stream"],
  types: ["track"],
  idPrefixes: ["mbid:recording:"],
};

describe("AddonBuilder", () => {
  it("rejects an invalid manifest at construction", () => {
    expect(() => new AddonBuilder({ ...baseManifest, version: "v1" })).toThrow(AddonError);
    expect(() => new AddonBuilder({ ...baseManifest, resources: [] })).toThrow(AddonError);
  });

  it("rejects a handler for a resource not in the manifest", () => {
    const b = new AddonBuilder(baseManifest);
    expect(() => b.defineCatalogHandler(() => ({ metas: [] }))).toThrow(/not in the manifest/);
  });

  it("rejects a duplicate handler", () => {
    const b = new AddonBuilder(baseManifest);
    b.defineStreamHandler(() => ({ streams: [] }));
    expect(() => b.defineStreamHandler(() => ({ streams: [] }))).toThrow(/already defined/);
  });

  it("getInterface fails if a declared resource has no handler", () => {
    const b = new AddonBuilder(baseManifest);
    expect(() => b.getInterface()).toThrow(/no handler/);
  });

  it("builds a servable interface", () => {
    const addon = new AddonBuilder(baseManifest)
      .defineStreamHandler(() => ({ streams: [] }))
      .getInterface();
    expect(addon.manifest.id).toBe("com.p2p-songs.hello");
    expect(addon.hasHandler("stream")).toBe(true);
    expect(addon.hasHandler("catalog")).toBe(false);
  });
});
