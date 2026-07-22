import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: ['node_modules/**', 'dist-server/**', 'dist/**'],
    env: {
      NODE_ENV: 'test',
      SUPABASE_URL: 'https://test.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
      GROQ_API_KEY: 'test-groq-api-key',
      WHATSAPP_ACCESS_TOKEN: 'test-whatsapp-token',
      WHATSAPP_PHONE_NUMBER_ID: '123456789',
      WHATSAPP_VERIFY_TOKEN: 'test-verify-token',
      WHATSAPP_APP_SECRET: 'test-app-secret',
      JWT_SECRET: 'test-jwt-secret-that-is-at-least-32-characters',
      ADMIN_EMAIL: 'admin@test.edu',
      ADMIN_PASSWORD: 'test-password',
    },
  },
});
