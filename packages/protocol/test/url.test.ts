import { describe, it, expect } from "vitest";
import { httpsUrlSchema, streamSchema, lyricSchema, manifestSchema } from "../src/index.js";

const NON_HTTPS = [
  "http://cdn.example/track.flac",
  "ftp://cdn.example/track.flac",
  "file:///etc/passwd",
  "data:audio/mpeg;base64,AA==",
  "javascript:alert(1)",
  "not a url",
];

describe("httpsUrlSchema restricts the scheme to https", () => {
  it("accepts https (any case in the scheme)", () => {
    expect(httpsUrlSchema.safeParse("https://cdn.example/a.flac").success).toBe(true);
    expect(httpsUrlSchema.safeParse("HTTPS://cdn.example/a.flac").success).toBe(true);
  });
  it.each(NON_HTTPS)("rejects %s", (u) => {
    expect(httpsUrlSchema.safeParse(u).success).toBe(false);
  });
});

describe("resource URL fields inherit the https requirement", () => {
  it("stream.url rejects non-https (A-004 probe cases)", () => {
    for (const u of ["http://x/y.flac", "ftp://x/y", "javascript:alert(1)", "data:audio/mpeg;base64,AA=="]) {
      expect(streamSchema.safeParse({ url: u }).success).toBe(false);
    }
    expect(streamSchema.safeParse({ url: "https://x/y.flac" }).success).toBe(true);
  });
  it("lyric.url rejects non-https", () => {
    expect(lyricSchema.safeParse({ id: "l1", lang: "eng", url: "http://x/y.lrc" }).success).toBe(false);
    expect(lyricSchema.safeParse({ id: "l1", lang: "eng", url: "https://x/y.lrc" }).success).toBe(true);
  });
  it("manifest logo/background reject non-https", () => {
    const base = { id: "x", version: "0.1.0", name: "x", description: "", resources: ["stream"], types: ["track"] };
    expect(manifestSchema.safeParse({ ...base, logo: "http://x/logo.png" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, background: "data:image/png;base64,AA==" }).success).toBe(false);
    expect(manifestSchema.safeParse({ ...base, logo: "https://x/logo.png" }).success).toBe(true);
  });
});
