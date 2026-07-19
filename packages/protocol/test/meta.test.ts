import { describe, it, expect } from "vitest";
import { metaPreviewSchema, metaDetailSchema, catalogResponseSchema } from "../src/index.js";

const ARTIST = "mbid:artist:cccccccc-cccc-cccc-cccc-cccccccccccc";
const RELEASE = "mbid:release:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const REC = "mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TRACK = "mbid:track:11111111-1111-1111-1111-111111111111";
const ISRC = "isrc:USRC17607839";
const PLAYLIST = "playlist:charts.trending-2026";

describe("meta type↔identity is enforced (A-004)", () => {
  it("accepts each type paired with its own id namespace", () => {
    expect(metaPreviewSchema.safeParse({ type: "artist", id: ARTIST, name: "A" }).success).toBe(true);
    expect(metaPreviewSchema.safeParse({ type: "album", id: RELEASE, name: "R" }).success).toBe(true);
    expect(metaPreviewSchema.safeParse({ type: "track", id: REC, name: "S" }).success).toBe(true);
    expect(metaPreviewSchema.safeParse({ type: "track", id: ISRC, name: "S" }).success).toBe(true);
    expect(metaPreviewSchema.safeParse({ type: "playlist", id: PLAYLIST, name: "P" }).success).toBe(true);
  });

  it("rejects contradictory type/id pairings", () => {
    // an artist whose id is a recording, an album whose id is a track, a track whose id is a release
    expect(metaPreviewSchema.safeParse({ type: "artist", id: REC, name: "A" }).success).toBe(false);
    expect(metaPreviewSchema.safeParse({ type: "album", id: TRACK, name: "R" }).success).toBe(false);
    expect(metaPreviewSchema.safeParse({ type: "track", id: RELEASE, name: "S" }).success).toBe(false);
    expect(metaPreviewSchema.safeParse({ type: "playlist", id: REC, name: "P" }).success).toBe(false);
  });

  it("a playlist has a valid, honest id (its own namespace, not a borrowed MBID)", () => {
    expect(metaPreviewSchema.safeParse({ type: "playlist", id: PLAYLIST, name: "P" }).success).toBe(true);
    // colon-bearing tokens (MBID-looking) are not valid playlist ids
    expect(metaPreviewSchema.safeParse({ type: "playlist", id: "playlist:a:b", name: "P" }).success).toBe(false);
  });

  it("catalog listing validates every entry's type/id pairing", () => {
    const ok = catalogResponseSchema.safeParse({
      metas: [
        { type: "album", id: RELEASE, name: "R" },
        { type: "artist", id: ARTIST, name: "A" },
      ],
    });
    expect(ok.success).toBe(true);
    const bad = catalogResponseSchema.safeParse({ metas: [{ type: "album", id: ARTIST, name: "R" }] });
    expect(bad.success).toBe(false);
  });

  it("album/playlist detail carries a tracks listing; artist detail does not require one", () => {
    const album = metaDetailSchema.safeParse({
      type: "album",
      id: RELEASE,
      name: "R",
      tracks: [{ recordingId: REC, trackId: TRACK, title: "Song", disc: 1, position: "1" }],
    });
    expect(album.success).toBe(true);
    expect(metaDetailSchema.safeParse({ type: "artist", id: ARTIST, name: "A" }).success).toBe(true);
  });
});
