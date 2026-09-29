import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
export const serviceClient = () => createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  { auth: { persistSession: false } },
);
export async function requireStaff(req: Request) {
  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) throw new Error('Not authenticated.');
  const admin = serviceClient();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) throw new Error('Invalid session.');
  const { data: profile, error } = await admin.from('users').select('id,full_name,role').eq('id', userData.user.id).single();
  if (error || !profile || !['admin','staff'].includes(profile.role)) throw new Error('Staff access required.');
  return { admin, user: userData.user, profile };
}
