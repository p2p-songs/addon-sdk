/** Lyrics resource — the p2p-songs analog of Stremio's subtitles (Plan §8). */
import { z } from "zod";

export const lyricSchema = z
  .object({
    id: z.string(),
    /** BCP-47 / ISO language code, e.g. "eng". */
    lang: z.string().min(2),
    url: z.string().url(),
    /** true if the resource is time-synced (.lrc), false/absent for plain text. */
    synced: z.boolean().optional(),
  })
  .passthrough();

export type Lyric = z.infer<typeof lyricSchema>;

export const lyricsResponseSchema = z
  .object({ lyrics: z.array(lyricSchema) })
  .passthrough();

export type LyricsResponse = z.infer<typeof lyricsResponseSchema>;
