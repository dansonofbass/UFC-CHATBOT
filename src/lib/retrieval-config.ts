import { z } from 'zod';
const flag = z.enum(['true', 'false']).default('false');
const schema = z.object({
  CHAT_INTELLIGENCE_ENABLED: z.enum(['true', 'false']).default('true'),
  CHAT_LIVE_RETRIEVAL_ENABLED: z.enum(['true', 'false']).default('true'),
  CHAT_WEB_SEARCH_ENABLED: flag,
  CHAT_MODEL_UNDERSTANDING_ENABLED: z.enum(['true', 'false']).default('true'),
  CHAT_RETRIEVAL_DAILY_LIMIT: z.coerce.number().int().min(1).max(100000).default(1000),
  CHAT_PROVIDER_REQUEST_LIMIT: z.coerce.number().int().min(1).max(12).default(6),
  WEB_SEARCH_PROVIDER: z.enum(['brave']).optional(),
  BRAVE_SEARCH_API_KEY: z.string().min(1).optional(),
  WEB_SEARCH_DAILY_LIMIT: z.coerce.number().int().min(1).max(1000).default(10),
});
export const retrievalConfig = () =>
  schema.parse(Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== '')));
