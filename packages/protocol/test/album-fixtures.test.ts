import { describe, it, expect } from "vitest";
import { metaDetailSchema, albumTrackSchema } from "../src/index.js";

/**
 * Required A-003 identity fixtures at the album-track level (audit A-004 asked
 * these be modeled as real album-track objects, not bare id constants). A
 * two-disc release with a BONUS disc, plus the same recording reappearing on
 * the bonus disc — the exact shapes the old `release:track-number` scheme
 * corrupted (medium-scoped positions collide; free-text positions break).
 */
const REC_A = "mbid:recording:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const REC_B = "mbid:recording:bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const RELEASE = "mbid:release:dddddddd-dddd-dddd-dddd-dddddddddddd";
const TK = (n: string) => `mbid:track:${n}${n}${n}${n}${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}-${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}${n}`;

// Disc 1 track 1, disc 2 (bonus) track 1 — both "position 1" but distinct ids.
const D1T1 = TK("1");
const D2T1 = TK("2");
// A bonus-disc entry that is the SAME recording as a main-disc track (a common
// "bonus disc = alt/live version cut" case still needs one recording identity).
const BONUS_REPRISE = TK("3");

const bonusDiscAlbum = {
  type: "album" as const,
  id: RELEASE,
  name: "Deluxe Edition",
  tracks: [
    { recordingId: REC_A, trackId: D1T1, title: "Opening", disc: 1, position: "1" },
    { recordingId: REC_B, trackId: D2T1, title: "B-side (bonus)", disc: 2, position: "1" },
    { recordingId: REC_A, trackId: BONUS_REPRISE, title: "Opening (reprise)", disc: 2, position: "A4" },
  ],
};

describe("bonus-disc album fixture (A-003 / A-004)", () => {
  it("validates as album detail with a multi-disc track listing", () => {
    expect(metaDetailSchema.safeParse(bonusDiscAlbum).success).toBe(true);
  });

  it("disc-1 and bonus-disc 'track 1' are distinct track ids (no medium collision)", () => {
    expect(D1T1).not.toBe(D2T1);
    expect(bonusDiscAlbum.tracks[0].disc).toBe(1);
    expect(bonusDiscAlbum.tracks[1].disc).toBe(2);
    expect(bonusDiscAlbum.tracks[0].position).toBe("1");
    expect(bonusDiscAlbum.tracks[1].position).toBe("1");
  });

  it("free-text bonus-disc position is preserved verbatim, never folded into an id", () => {
    const reprise = bonusDiscAlbum.tracks[2];
    expect(reprise.position).toBe("A4");
    expect(albumTrackSchema.safeParse(reprise).success).toBe(true);
  });

  it("a recording reappearing on the bonus disc keeps one stable recording id but a distinct track id", () => {
    const [main, , reprise] = bonusDiscAlbum.tracks;
    expect(reprise.recordingId).toBe(main.recordingId); // same streamable/cache/dedup key
    expect(reprise.trackId).not.toBe(main.trackId); // distinct album-context identity
  });
});
