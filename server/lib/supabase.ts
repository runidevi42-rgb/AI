import { createClient } from '@supabase/supabase-js';
import { config } from '../config.js';

export const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function assertDatabaseConnection() {
  const { error } = await supabase.from('college_info').select('id').limit(1);
  if (error) throw new Error(`Supabase connection failed: ${error.message}`);
}
