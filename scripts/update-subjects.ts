import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

function loadEnvFile(file: string) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return;
  const content = fs.readFileSync(p, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkiizjcwrrdggdqneuhv.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CAMPAIGN_ID = 'c8376445-b90d-4c3f-bcc8-10403be99d4f';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('🚀 Updating subjects in every draft to "Engineering Internship at [Company] — Om Nigam"...');

  // 1. Fetch all campaign leads with lead data
  const { data: campaignLeads, error: clErr } = await supabase
    .from('campaign_leads')
    .select('id, lead:leads(id, company, first_name, email)')
    .eq('campaign_id', CAMPAIGN_ID);

  if (clErr || !campaignLeads) {
    console.error('Failed to fetch campaign leads:', clErr);
    process.exit(1);
  }

  console.log(`📋 Found ${campaignLeads.length} campaign leads.`);

  // 2. Fetch existing step 0 messages
  const clIds = campaignLeads.map((cl) => cl.id);
  const { data: messages, error: msgErr } = await supabase
    .from('email_messages')
    .select('id, campaign_lead_id, subject')
    .in('campaign_lead_id', clIds)
    .eq('step_number', 0);

  if (msgErr || !messages) {
    console.error('Failed to fetch messages:', msgErr);
    process.exit(1);
  }

  console.log(`✉️ Found ${messages.length} step 0 draft messages to update.`);

  const msgMap = new Map<string, string>();
  for (const m of messages) {
    msgMap.set(m.campaign_lead_id, m.id);
  }

  let updatedCount = 0;
  const samples: { company: string; oldSubject: string; newSubject: string }[] = [];

  for (const cl of campaignLeads) {
    const msgId = msgMap.get(cl.id);
    if (!msgId) continue;

    const lead: any = cl.lead;
    const company = (lead?.company || '').trim();
    const newSubject = company && company.toLowerCase() !== 'your team'
      ? `Engineering Internship at ${company} — Om Nigam`
      : `Engineering Internship — Om Nigam`;

    const oldMsg = messages.find((m) => m.id === msgId);

    const { error: updErr } = await supabase
      .from('email_messages')
      .update({
        subject: newSubject,
        updated_at: new Date().toISOString(),
      })
      .eq('id', msgId);

    if (updErr) {
      console.error(`Failed to update message ${msgId}:`, updErr.message);
    } else {
      updatedCount++;
      if (samples.length < 5) {
        samples.push({
          company,
          oldSubject: oldMsg?.subject || '',
          newSubject,
        });
      }
    }
  }

  console.log(`✅ Successfully updated ${updatedCount} draft subjects.`);

  console.log('\nSamples:');
  for (const s of samples) {
    console.log(`  Company: ${s.company}`);
    console.log(`    Before: ${s.oldSubject}`);
    console.log(`    After:  ${s.newSubject}\n`);
  }

  // 3. Update campaign initial email instructions so future emails also follow this format
  await supabase
    .from('campaigns')
    .update({
      initial_email_instructions: 'Personalize based on the founder product and actual engineering stack. Subject line MUST be: "Engineering Internship at [Company] — Om Nigam". Connect Om most relevant project (Compact SLM for infra/LLMs, Conflict-Free OLTP in Rust for distributed systems/databases, ResearchGit for search/dev-tools, Arenova/AetherLabs for applied AI and agentic workflows). Use [Resume]({{resume_url}}) and [GitHub](https://github.com/avicdr). Strict 100 to 160 words. Paragraphs 1 to 3 sentences. Never use em dashes or en dashes in the email body. Sign off as Om.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', CAMPAIGN_ID);

  console.log('✅ Campaign instructions updated.');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
