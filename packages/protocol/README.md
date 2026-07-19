# @p2p-songs/protocol

The p2p-songs addon **wire contract** — schema-first (zod) definitions of the
manifest, resources, entity-typed IDs, and stream/lyrics/meta shapes shared by
addons and the player.

- **Specification:** [`../../docs/PROTOCOL.md`](../../docs/PROTOCOL.md) — the
  versioned, independently-implementable HTTP+JSON protocol (routes, payloads,
  errors, examples). This package is its machine-readable source of truth.
- **Design rationale:** [`.github` — `docs/IMPLEMENTATION_PLAN.md` §8](https://github.com/p2p-songs/.github/blob/main/docs/IMPLEMENTATION_PLAN.md).

Schemas are the source of truth; TypeScript types are `z.infer`red and runtime
validators come for free. Type-only consumers (the player) can `import type` at
zero runtime cost.

```ts
import { manifestSchema, streamResponseSchema, parseId } from "@p2p-songs/protocol";
```

Build: `pnpm build` · Test: `pnpm test` · Typecheck: `pnpm typecheck`.
