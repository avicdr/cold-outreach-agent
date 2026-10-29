import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// We need calculateStaggeredScheduleWithAccounts
// Let's implement it or use dbService
async function main() {
  const CAMPAIGN_ID = 'd374f975-c246-4063-9431-16d888e61538';
  console.log(`Rescheduling campaign: ${CAMPAIGN_ID}`);

  const { data: campaign, error: cErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (cErr) throw cErr;

  const { data: cls } = await supabase
    .from('campaign_leads')
    .select('id')
    .eq('campaign_id', CAMPAIGN_ID);

  const clIds = cls.map((c) => c.id);

  const { data: messages } = await supabase
    .from('email_messages')
    .select('id, campaign_lead_id, step_number, created_at, scheduled_at, email_account_id, status')
    .in('campaign_lead_id', clIds)
    .eq('status', 'scheduled')
    .order('created_at', { ascending: true });

  console.log(`Found ${messages.length} scheduled messages in UK campaign.`);

  // Get active accounts for this campaign
  const { data: accounts } = await supabase
    .from('email_accounts')
    .select('*')
    .eq('status', 'active');

  console.log(`Found ${accounts.length} active email accounts.`);

  // Clean out any old queued jobs for these messages
  const msgIds = messages.map((m) => m.id);
  for (let i = 0; i < msgIds.length; i += 100) {
    const chunk = msgIds.slice(i, i + 100);
    const formatted = `(${chunk.join(',')})`;
    await supabase
      .from('job_queue')
      .delete()
      .eq('job_type', 'send_email')
      .eq('status', 'queued')
      .filter('payload->>emailMessageId', 'in', formatted);
  }

  // Calculate slots within sending window (Europe/London 09:00 - 16:00, Mon-Fri)
  // Let's calculate dates starting tomorrow morning (or today if still in window)
  // London time right now:
  const now = new Date();
  console.log(`Current time UTC: ${now.toISOString()}`);

  // Stagger messages across tomorrow (Oct 30) starting at 09:30 AM London time (BST/GMT: 09:30 UTC)
  // 13 messages, max 4 per hour, spaced every 15-20 mins
  const startWindow = new Date('2026-10-30T09:30:00.000Z');
  
  const updates = [];
  const newJobs = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    // Stagger every 18 minutes (approx 3 per hour)
    const slotDate = new Date(startWindow.getTime() + i * 18 * 60 * 1000);
    const slotIso = slotDate.toISOString();

    updates.push({
      id: msg.id,
      scheduled_at: slotIso,
      updated_at: new Date().toISOString()
    });

    newJobs.push({
      job_type: 'send_email',
      payload: { emailMessageId: msg.id },
      idempotency_key: `resume_send_${msg.id}_${slotDate.getTime()}`,
      run_at: slotIso,
      status: 'queued',
      attempts: 0,
      max_attempts: 3
    });
  }

  console.log('Sample rescheduled slots:');
  newJobs.slice(0, 5).forEach((j) => console.log(j.run_at, j.payload));

  // Update messages
  for (const u of updates) {
    await supabase
      .from('email_messages')
      .update({ scheduled_at: u.scheduled_at, updated_at: u.updated_at })
      .eq('id', u.id);
  }
  console.log(`Updated all ${updates.length} messages in email_messages.`);

  // Insert jobs
  const { error: insErr } = await supabase.from('job_queue').insert(newJobs);
  if (insErr) {
    console.error('Insert jobs error:', insErr);
  } else {
    console.log(`Successfully enqueued ${newJobs.length} fresh jobs in job_queue.`);
  }

  console.log('Rescheduling complete!');
}

main().catch(console.error);

