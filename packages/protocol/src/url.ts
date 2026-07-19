/**
 * Resource URL schemas (Plan §8).
 *
 * `z.string().url()` validates URL *syntax* only — it accepts `http:`, `ftp:`,
 * `data:`, `javascript:`, etc. Every URL an addon puts on the wire for the
 * player to fetch or play (resolved stream links, lyrics, artwork, logos) must
 * be `https:`: it is the protocol's secure-transport promise, and it keeps a
 * downstream consumer from having to independently reject a dangerous scheme.
 * So the wire contract narrows the primitive here rather than at every field.
 */
import { z } from "zod";

/** An `https://` URL. Rejects http/ftp/file/data/javascript and malformed input. */
export const httpsUrlSchema = z
  .string()
  .url()
  // URL schemes are case-insensitive (RFC 3986 §3.1). `.url()` above already
  // guaranteed a syntactically valid, scheme-prefixed URL.
  .refine((u) => /^https:\/\//i.test(u), { message: "expected an https:// URL" });

export type HttpsUrl = z.infer<typeof httpsUrlSchema>;
