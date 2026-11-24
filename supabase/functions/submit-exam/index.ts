// Supabase Edge Function reference for server-verified CBT exam submission
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';

  const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: userErr } = await userClient.auth.getUser();
  if (userErr || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { attemptId } = await req.json();

  const { data: attempt } = await adminClient
    .from('examination_attempts')
    .select('*, examinations(*)')
    .eq('id', attemptId)
    .single();

  if (!attempt || attempt.status !== 'in_progress') {
    return new Response(JSON.stringify({ error: 'Attempt unavailable or already submitted' }), { status: 409 });
  }

  const now = new Date();
  const expired = now.getTime() >= new Date(attempt.deadline_at).getTime();
  await adminClient
    .from('examination_attempts')
    .update({ status: expired ? 'time_expired' : 'submitted', submitted_at: now.toISOString() })
    .eq('id', attemptId);

  return new Response(JSON.stringify({ ok: true, status: expired ? 'time_expired' : 'submitted' }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
