/**
 * @p2p-songs/protocol — the p2p-songs addon wire contract.
 *
 * Schema-first: the zod schemas are the single source of truth; TypeScript
 * types are inferred from them; runtime validators come for free. Type-only
 * consumers (e.g. the player) can `import type` at zero runtime cost.
 *
 * Spec: https://github.com/p2p-songs/.github/blob/main/docs/IMPLEMENTATION_PLAN.md (§8)
 */
export const PROTOCOL_VERSION = "0.1.0";

export { ProtocolError } from "./errors.js";
export * from "./ids.js";
export * from "./stream.js";
export * from "./requests.js";
export * from "./lyrics.js";
export * from "./meta.js";
export * from "./manifest.js";
