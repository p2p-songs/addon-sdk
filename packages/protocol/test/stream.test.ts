import { describe, it, expect } from "vitest";
import {
  streamSchema,
  streamResponseSchema,
  streamRequestSchema,
  albumTrackSchema,
} from "../src/index.js";

const REC = "mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TRACK = "mbid:track:11111111-1111-1111-1111-111111111111";
const RELEASE = "mbid:release:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("stream object", () => {
  it("accepts a resolved direct url (stream-legal/stream-debrid shape)", () => {
    const r = streamSchema.safeParse({
      url: "https://cdn.example/track.flac",
      name: "FLAC · cached",
      behaviorHints: { bingeGroup: RELEASE, filename: "05 - Song.flac", videoSize: 41234567 },
    });
    expect(r.success).toBe(true);
  });

  it("accepts a ytId (stream-ytmusic shape)", () => {
    expect(streamSchema.safeParse({ ytId: "dQw4w9WgXcQ", name: "YouTube Music" }).success).toBe(true);
  });

  it("accepts an infoHash pointer with fileIdx", () => {
    expect(
      streamSchema.safeParse({ infoHash: "0123456789abcdef0123456789abcdef01234567", fileIdx: 4 }).success,
    ).toBe(true);
  });

  it("requires exactly one source", () => {
    expect(streamSchema.safeParse({ name: "no source" }).success).toBe(false);
    expect(
      streamSchema.safeParse({ url: "https://x/y.flac", ytId: "abc" }).success,
    ).toBe(false); // two sources
  });

  it("rejects fileIdx without infoHash", () => {
    expect(streamSchema.safeParse({ url: "https://x/y.flac", fileIdx: 2 }).success).toBe(false);
  });

  describe("optional link-expiry hint", () => {
    it("accepts expiresAt (UTC ISO-8601)", () => {
      expect(
        streamSchema.safeParse({ url: "https://x/y.flac", behaviorHints: { expiresAt: "2026-07-19T21:30:00Z" } }).success,
      ).toBe(true);
    });
    it("accepts maxAgeSeconds", () => {
      expect(
        streamSchema.safeParse({ url: "https://x/y.flac", behaviorHints: { maxAgeSeconds: 3600 } }).success,
      ).toBe(true);
    });
    it("rejects both expiresAt and maxAgeSeconds together", () => {
      expect(
        streamSchema.safeParse({
          url: "https://x/y.flac",
          behaviorHints: { expiresAt: "2026-07-19T21:30:00Z", maxAgeSeconds: 3600 },
        }).success,
      ).toBe(false);
    });
    it("accepts neither (expiry is optional)", () => {
      expect(streamSchema.safeParse({ url: "https://x/y.flac", behaviorHints: {} }).success).toBe(true);
    });
  });

  it("stream response wraps an array", () => {
    expect(streamResponseSchema.safeParse({ streams: [{ url: "https://x/y.flac" }] }).success).toBe(true);
  });
});

describe("stream/lyrics request is keyed by recording, with optional album context", () => {
  it("accepts recordingId alone", () => {
    expect(streamRequestSchema.safeParse({ recordingId: REC }).success).toBe(true);
  });
  it("accepts recordingId + album-context track/release", () => {
    expect(streamRequestSchema.safeParse({ recordingId: REC, trackId: TRACK, releaseId: RELEASE }).success).toBe(true);
  });
  it("rejects a track id in the recordingId slot", () => {
    expect(streamRequestSchema.safeParse({ recordingId: TRACK }).success).toBe(false);
  });
});

describe("album track entry carries recording + album-context identity", () => {
  it("accepts a free-text vinyl position with clean ids", () => {
    const r = albumTrackSchema.safeParse({
      recordingId: REC,
      trackId: TRACK,
      title: "Dial Tone Romance",
      disc: 1,
      position: "A4",
      durationMs: 262000,
    });
    expect(r.success).toBe(true);
  });
});
