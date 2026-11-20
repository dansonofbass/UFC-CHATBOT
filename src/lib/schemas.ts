import { z } from 'zod';
export const identitySchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  name: z.string(),
  nickname: z.string().nullable(),
  nationality: z.string().nullable(),
});
export const recordSchema = z.object({
  value: z.string(),
  wins: z.number().nullable(),
  losses: z.number().nullable(),
  draws: z.number().nullable(),
  no_contests: z.number().nullable(),
  source: z.string(),
  scope: z.string(),
});
export const fighterSchema = identitySchema.extend({
  credentials: z
    .object({
      credentials: z.array(
        z.object({
          kind: z.string(),
          discipline: z.string().nullable(),
          competition: z.string().nullable(),
          placement: z.string().nullable(),
          rank: z.string().nullable(),
          year: z.number().int().nullable(),
          detail: z.unknown(),
          note: z.string().nullable(),
          sources: z.array(z.url()),
          confidence: z.enum(['confirmed', 'reported']),
        }),
      ),
      affiliations: z.array(
        z.object({
          kind: z.string(),
          name: z.string(),
          role: z.string().nullable(),
          status: z.string().nullable(),
          is_primary: z.boolean(),
          location: z.string().nullable(),
          gym: z.string().nullable(),
          discipline: z.string().nullable(),
          relationship: z.string().nullable(),
          as_of: z.string().nullable(),
          period: z.string().nullable(),
          note: z.string().nullable(),
          sources: z.array(z.url()),
          confidence: z.enum(['confirmed', 'reported']),
        }),
      ),
    })
    .optional(),
  height_inches: z.number().nullable().optional(),
  weight_lbs: z.number().nullable().optional(),
  reach_inches: z.number().nullable().optional(),
  stance: z.string().nullable().optional(),
  dob: z.string().nullable().optional(),
  team: z.string().nullable().optional(),
  birthplace: z.string().nullable().optional(),
  records: z.record(z.string(), recordSchema).optional(),
  career_stats: z
    .array(
      z.object({
        scope: z.string(),
        source: z.string(),
        record: z.string().nullable(),
        slpm: z.string().nullable(),
        sapm: z.string().nullable(),
        str_acc: z.string().nullable(),
        str_def: z.string().nullable(),
        td_avg: z.string().nullable(),
        td_acc: z.string().nullable(),
        td_def: z.string().nullable(),
        sub_avg: z.string().nullable(),
        updated_at: z.string().nullable().optional(),
      }),
    )
    .optional(),
  stats: z
    .object({
      slpm: z.string().nullable(),
      str_acc: z.string().nullable(),
      sapm: z.string().nullable(),
      str_def: z.string().nullable(),
      td_avg: z.string().nullable(),
      td_acc: z.string().nullable(),
      td_def: z.string().nullable(),
      sub_avg: z.string().nullable(),
      basis: z.record(z.string(), z.unknown()),
    })
    .nullable()
    .optional(),
});
export const fightSchema = z.object({
  id: z.number().int(),
  ordering: z.number().nullable(),
  card_section: z.string().nullable(),
  weight_class: z.string().nullable(),
  is_title: z.boolean(),
  is_main: z.boolean(),
  status: z.enum(['announced', 'confirmed', 'cancelled', 'completed', 'no_contest']).nullable(),
  fighter_a: identitySchema.nullable(),
  fighter_b: identitySchema.nullable(),
  result: z
    .object({
      winner_fighter_id: z.number().nullable(),
      method: z.string().nullable(),
      round: z.number().nullable(),
      time: z.string().nullable(),
    })
    .nullable(),
});
export const eventSchema = z.object({
  id: z.number().int(),
  slug: z.string(),
  title: z.string(),
  org: z.literal('ufc'),
  starts_at: z.iso.datetime(),
  tz: z.string().nullable(),
  status: z.enum(['announced', 'scheduled', 'live', 'completed', 'cancelled', 'postponed']),
  venue: z
    .object({
      name: z.string().nullable(),
      city: z.string().nullable(),
      country: z.string().nullable(),
    })
    .nullable()
    .optional(),
  card: z.array(fightSchema).optional(),
});
export const rankingSchema = z.object({
  org: z.literal('ufc'),
  board: z.literal('official'),
  snapshot_date: z.iso.date(),
  divisions: z.array(
    z.object({
      division: z.string(),
      entries: z.array(
        z.object({
          rank: z.number(),
          is_champion: z.boolean(),
          fighter_id: z.number().nullable(),
          fighter_slug: z.string().nullable(),
          name: z.string(),
        }),
      ),
    }),
  ),
});
export const historySchema = z.object({
  source: z.enum(['native', 'history']),
  fight_id: z.number().nullable(),
  event_id: z.number().nullable(),
  event_title: z.string().nullable(),
  event_slug: z.string().nullable(),
  org_slug: z.string().nullable(),
  date: z.string().nullable(),
  opponent_name: z.string().nullable(),
  status: z.enum(['win', 'loss', 'draw', 'no_contest', 'cancelled', 'upcoming', 'unknown']),
  method: z.string().nullable(),
  round: z.number().nullable(),
  time: z.string().nullable(),
});
export const fightStatSchema = z.object({
  fighter_id: z.number().int(),
  fighter_position: z.number().int(),
  corner: z.enum(['a', 'b']).nullable(),
  knockdowns: z.number().nullable(),
  sig_strikes_landed: z.number().nullable(),
  sig_strikes_attempted: z.number().nullable(),
  total_strikes_landed: z.number().nullable(),
  total_strikes_attempted: z.number().nullable(),
  takedowns_landed: z.number().nullable(),
  takedowns_attempted: z.number().nullable(),
  submission_attempts: z.number().nullable(),
  reversals: z.number().nullable(),
  control_time_sec: z.number().nullable(),
});
export const envelope = <T extends z.ZodType>(schema: T) =>
  z.object({
    data: schema,
    meta: z
      .object({
        fetched_at: z.string().optional(),
        pagination: z
          .object({ next_cursor: z.string().nullable(), has_more: z.boolean() })
          .optional(),
      })
      .passthrough(),
  });
export type Fighter = z.infer<typeof fighterSchema> & { source_url: string; updated_at: string };
export type Event = z.infer<typeof eventSchema> & { source_url: string; updated_at: string };
export type News = {
  id: string;
  title: string;
  url: string;
  published_at: string;
  excerpt: string;
  source: string;
  confirmation: 'unconfirmed' | 'confirmed' | 'report';
  updated_at: string;
};
export type Citation = { title: string; url: string; updated_at: string };
export function safeUrl(value: string) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' ? u.href : undefined;
  } catch {
    return undefined;
  }
}
