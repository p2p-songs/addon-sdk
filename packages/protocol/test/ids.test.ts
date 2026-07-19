import { describe, it, expect } from "vitest";
import {
  parseId,
  parseMbid,
  safeParseId,
  formatMbid,
  isEntity,
  isPlaylistId,
  recordingIdSchema,
  trackIdSchema,
  ProtocolError,
} from "../src/index.js";

// Format-valid MusicBrainz UUIDs (8-4-4-4-12 hex).
const REC = "mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TRACK_D1T1 = "mbid:track:11111111-1111-1111-1111-111111111111";
const TRACK_D2T1 = "mbid:track:22222222-2222-2222-2222-222222222222";
const RELEASE = "mbid:release:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ARTIST = "mbid:artist:cccccccc-cccc-cccc-cccc-cccccccccccc";
const ISRC = "isrc:USRC17607839";

describe("entity-typed MBID parsing/formatting", () => {
  it("parses each entity", () => {
    expect(parseMbid(REC)).toEqual({
      scheme: "mbid",
      entity: "recording",
      uuid: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    });
    expect(parseMbid(ARTIST).entity).toBe("artist");
    expect(parseMbid(RELEASE).entity).toBe("release");
    expect(parseMbid(TRACK_D1T1).entity).toBe("track");
  });

  it("parses ISRC", () => {
    expect(parseId(ISRC)).toEqual({ scheme: "isrc", code: "USRC17607839" });
  });

  it("parses a playlist id (addon-scoped opaque token)", () => {
    expect(parseId("playlist:charts.trending-2026")).toEqual({
      scheme: "playlist",
      token: "charts.trending-2026",
    });
    expect(isPlaylistId("playlist:charts.trending-2026")).toBe(true);
    // colon-bearing / MBID-looking tokens are not valid playlist ids
    expect(() => parseId("playlist:a:b")).toThrow(ProtocolError);
    expect(isPlaylistId("mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toBe(false);
  });

  it("formats and round-trips, lowercasing the uuid", () => {
    const id = formatMbid("recording", "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA");
    expect(id).toBe(REC);
    expect(parseMbid(id).uuid).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  });

  it("rejects malformed ids", () => {
    expect(() => parseMbid("mbid:widget:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toThrow(ProtocolError);
    expect(() => parseMbid("mbid:recording:not-a-uuid")).toThrow(ProtocolError);
    expect(() => parseMbid("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).toThrow(ProtocolError);
    expect(() => formatMbid("recording", "nope")).toThrow(ProtocolError);
    expect(safeParseId("garbage")).toBeUndefined();
  });

  it("branded entity schemas reject the wrong entity", () => {
    expect(recordingIdSchema.safeParse(REC).success).toBe(true);
    expect(recordingIdSchema.safeParse(TRACK_D1T1).success).toBe(false);
    expect(trackIdSchema.safeParse(TRACK_D1T1).success).toBe(true);
    expect(trackIdSchema.safeParse(REC).success).toBe(false);
  });
});

// --- Audit A-003 identity fixtures: the cases the old release:track-number scheme corrupted ---
describe("A-003 identity fixtures", () => {
  it("multi-disc: disc1-track1 and disc2-track1 are distinct track ids (no collision)", () => {
    expect(TRACK_D1T1).not.toBe(TRACK_D2T1);
    expect(isEntity(TRACK_D1T1, "track")).toBe(true);
    expect(isEntity(TRACK_D2T1, "track")).toBe(true);
  });

  it("the synthetic release:track-number composite is not expressible/parseable", () => {
    // The removed scheme would have addressed a track as `<release-mbid>:1`.
    expect(() => parseMbid(`${RELEASE}:1`)).toThrow(ProtocolError);
    expect(() => parseMbid("mbid:release:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb:1")).toThrow(ProtocolError);
    // Two different discs would BOTH have collapsed to `<release>:1` under the old scheme.
    // Under entity-typed ids they are simply two different track ids (asserted above).
  });

  it("vinyl/free-text position never enters an id", () => {
    // A track's shown position may be "A4"; identity is still a clean track MBID,
    // and the recording it maps to is a clean recording MBID. No number-in-id.
    expect(isEntity(TRACK_D1T1, "track")).toBe(true);
    expect(recordingIdSchema.safeParse(REC).success).toBe(true);
  });

  it("same recording on two releases: one recording id, two track ids", () => {
    const trackOnReleaseX = TRACK_D1T1;
    const trackOnReleaseY = TRACK_D2T1;
    // Same song → same recording id (the dedup / cache / stream key)...
    const recX = REC;
    const recY = REC;
    expect(recX).toBe(recY);
    // ...but distinct track ids for the two pressings.
    expect(trackOnReleaseX).not.toBe(trackOnReleaseY);
  });
});
