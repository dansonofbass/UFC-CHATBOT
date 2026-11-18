import { z } from 'zod';
const optionalKey = z.string().min(1).optional();
const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalKey,
  SUPABASE_SECRET_KEY: optionalKey,
  GROQ_API_KEY: optionalKey,
  GROQ_MODEL: z.string().default('openai/gpt-oss-120b'),
  OPENROUTER_API_KEY: optionalKey,
  OPENROUTER_MODEL: z.string().default('openrouter/free'),
  ALLOW_OPENROUTER_FALLBACK: z.enum(['true', 'false']).default('false'),
  INTERNAL_API_TOKEN: z.string().min(32).optional(),
  AI_DAILY_REQUEST_LIMIT: z.coerce.number().int().min(1).default(100),
  AI_DAILY_TOKEN_LIMIT: z.coerce.number().int().min(2048).default(100000),
  CLIENT_HOURLY_LIMIT: z.coerce.number().int().min(1).default(20),
});
export function env() {
  return schema.parse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));
}
export const requiredVariables = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'GROQ_API_KEY',
  'OPENROUTER_API_KEY',
  'UFCALENDAR_API_KEY_1',
  'UFCALENDAR_API_KEY_2',
  'UFCALENDAR_API_KEY_3',
  'INTERNAL_API_TOKEN',
];
export function missingVariables() {
  return requiredVariables.filter((k) => !process.env[k]);
}
