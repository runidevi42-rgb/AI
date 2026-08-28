import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().default(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3000'),
  CLIENT_URL: z.string().default('http://localhost:5173'),
  COLLEGE_TIMEZONE: z.string().default('Asia/Kolkata'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10),
  GROQ_API_KEY: z.string().min(10),
  GROQ_MODEL: z.string().trim().default('openai/gpt-oss-120b'),
  WHATSAPP_ACCESS_TOKEN: z.string().min(10),
  WHATSAPP_PHONE_NUMBER_ID: z.string().min(2),
  WHATSAPP_VERIFY_TOKEN: z.string().min(8),
  WHATSAPP_APP_SECRET: z.string().min(8),
  WHATSAPP_API_VERSION: z.string().default('v23.0'),
  WHATSAPP_TIMETABLE_TEMPLATE: z.string().trim().default(''),
  WHATSAPP_TIMETABLE_UPDATE_TEMPLATE: z.string().trim().default(''),
  WHATSAPP_ASSIGNMENT_TEMPLATE: z.string().trim().default(''),
  WHATSAPP_EXAM_TEMPLATE: z.string().trim().default(''),
  WHATSAPP_EVENT_TEMPLATE: z.string().trim().default(''),
  WHATSAPP_NOTIFICATION_TEMPLATE: z.string().trim().default(''),
  WHATSAPP_TEMPLATE_LANGUAGE: z.string().trim().regex(/^[a-z]{2,3}(?:_[A-Z]{2})?$/, 'Use an exact Meta language code such as en or en_US').default('en'),
  WEB_PUSH_VAPID_PUBLIC_KEY: z.string().trim().default(''),
  WEB_PUSH_VAPID_PRIVATE_KEY: z.string().trim().default(''),
  WEB_PUSH_VAPID_SUBJECT: z.string().trim().default('mailto:admin@example.com'),
  JWT_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  SCHEDULER_ENABLED: z.string().default('true').transform((v) => v === 'true'),
});

const result = schema.safeParse(process.env);
if (!result.success) {
  console.error('Invalid environment configuration:', result.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = result.data;
