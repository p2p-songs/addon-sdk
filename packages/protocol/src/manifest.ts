/** Addon manifest (Plan §8). Describes what an addon serves and how it's called. */
import { z } from "zod";
import { contentTypeSchema } from "./meta.js";

export const RESOURCES = ["catalog", "meta", "stream", "lyrics"] as const;
export type Resource = (typeof RESOURCES)[number];
export const resourceSchema = z.enum(RESOURCES);

const SEMVER_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)*$/;

/** Extra property a catalog supports (search / genre filter / pagination). */
export const catalogExtraSchema = z
  .object({
    name: z.string(),
    isRequired: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    optionsLimit: z.number().int().positive().optional(),
  })
  .passthrough();

export const catalogDefSchema = z
  .object({
    type: contentTypeSchema,
    id: z.string(),
    name: z.string(),
    extra: z.array(catalogExtraSchema).optional(),
  })
  .passthrough();

export const manifestBehaviorHintsSchema = z
  .object({
    adult: z.boolean().optional(),
    p2p: z.boolean().optional(),
    /** The addon exposes a `/configure` page (e.g. stream-debrid). */
    configurable: z.boolean().optional(),
    /** Hide "Install" until configured (config required to function). */
    configurationRequired: z.boolean().optional(),
  })
  .passthrough();

export const manifestSchema = z
  .object({
    /** Reverse-DNS-ish unique id, e.g. "com.p2p-songs.stream-debrid". */
    id: z.string().min(1),
    version: z.string().regex(SEMVER_RE, "expected a semantic version"),
    name: z.string().min(1),
    description: z.string(),
    resources: z.array(resourceSchema).min(1),
    types: z.array(contentTypeSchema).min(1),
    /** Restrict which ids this addon is called for, e.g. ["mbid:recording:", "isrc:"]. */
    idPrefixes: z.array(z.string()).optional(),
    catalogs: z.array(catalogDefSchema).default([]),
    behaviorHints: manifestBehaviorHintsSchema.optional(),
    logo: z.string().url().optional(),
    background: z.string().url().optional(),
    contactEmail: z.string().email().optional(),
  })
  .passthrough();

export type Manifest = z.infer<typeof manifestSchema>;
