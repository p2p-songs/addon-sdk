import { describe, it, expect } from "vitest";
import { manifestSchema } from "../src/index.js";

describe("manifest", () => {
  it("accepts a stream-debrid-style configurable manifest", () => {
    const r = manifestSchema.safeParse({
      id: "com.p2p-songs.stream-debrid",
      version: "0.1.0",
      name: "stream-debrid",
      description: "Debrid-backed music streams",
      resources: ["stream"],
      types: ["track", "album"],
      idPrefixes: ["mbid:recording:"],
      catalogs: [],
      behaviorHints: { configurable: true, configurationRequired: true, p2p: true },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a catalog addon manifest", () => {
    const r = manifestSchema.safeParse({
      id: "com.p2p-songs.catalog-charts",
      version: "0.1.0",
      name: "Charts",
      description: "Trending music",
      resources: ["catalog", "meta"],
      types: ["album", "artist"],
      catalogs: [{ type: "album", id: "trending", name: "Trending", extra: [{ name: "genre", options: ["rock", "jazz"] }] }],
    });
    expect(r.success).toBe(true);
  });

  it("rejects a bad version and empty resources", () => {
    expect(
      manifestSchema.safeParse({ id: "x", version: "v1", name: "x", description: "", resources: ["stream"], types: ["track"] }).success,
    ).toBe(false);
    expect(
      manifestSchema.safeParse({ id: "x", version: "0.1.0", name: "x", description: "", resources: [], types: ["track"] }).success,
    ).toBe(false);
  });
});
