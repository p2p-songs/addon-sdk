import { describe, it, expect } from "vitest";
import { encodeConfig, decodeConfig } from "../src/index.js";
import { parseExtra, stringifyExtra } from "../src/index.js";

describe("config round-trip", () => {
  it("encodes to a single path-safe segment and decodes back", () => {
    const cfg = { debridKey: "RD-abc123", indexers: ["a", "b"], nested: { x: 1 } };
    const seg = encodeConfig(cfg);
    expect(seg).not.toContain("/");
    expect(seg).not.toContain("=");
    expect(decodeConfig(seg)).toEqual(cfg);
  });

  it("returns undefined for non-config segments (not base64url JSON object)", () => {
    expect(decodeConfig("configure")).toBeUndefined();
    expect(decodeConfig("manifest.json")).toBeUndefined();
    expect(decodeConfig(encodeConfig([1, 2] as unknown as Record<string, unknown>))).toBeUndefined(); // arrays rejected
    expect(decodeConfig("!!!not-base64!!!")).toBeUndefined();
  });
});

describe("extra segment", () => {
  it("round-trips key=value pairs through URL encoding", () => {
    const extra = { trackId: "mbid:track:1", genre: "rock" };
    expect(parseExtra(stringifyExtra(extra))).toEqual(extra);
  });
  it("empty/undefined extra is an empty record", () => {
    expect(parseExtra(undefined)).toEqual({});
    expect(parseExtra("")).toEqual({});
  });
});
