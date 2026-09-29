import { corsHeaders, json } from '../_shared/cors.ts';
import { serviceClient } from '../_shared/client.ts';

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(v => v.toString(16).padStart(2,'0')).join('');
async function hash(value: string) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))); }
function token() { const a=new Uint8Array(32); crypto.getRandomValues(a); return btoa(String.fromCharCode(...a)).replace(/[^a-zA-Z0-9]/g,''); }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { name, email, subject, message } = await req.json();
    if (![name,email,subject,message].every(v => typeof v === 'string' && v.trim())) return json({ error:'Name, email, subject, and message are required.' },400);
    const access = token(), admin = serviceClient();
    const { data: inquiry, error } = await admin.from('public_inquiries').insert({ client_name:name.trim(), client_email:email.trim().toLowerCase(), subject:subject.trim(), access_token_hash:await hash(access) }).select('id').single();
    if (error) throw error;
    const { error: msgError } = await admin.from('public_inquiry_messages').insert({ inquiry_id:inquiry.id, sender_type:'client', sender_name:name.trim(), message:message.trim() });
    if (msgError) throw msgError;
    return json({ inquiry_id: inquiry.id, access_token: access });
  } catch (e) { return json({ error: e.message || 'Unable to create inquiry.' },500); }
});
