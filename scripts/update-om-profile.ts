import { createClient } from '@supabase/supabase-js';
import { generateInitialEmail } from '../src/lib/gemini';
import { Lead, Campaign } from '../src/types/database';

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
process.env.MOCK_MODE = 'true';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkiizjcwrrdggdqneuhv.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CAMPAIGN_ID = 'c8376445-b90d-4c3f-bcc8-10403be99d4f';
const USER_ID = '5f9832c0-d340-4e0f-b2d8-b3f44a294697';
const SENDER_NAME = 'Om';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log('🚀 Updating Profile and Campaign for Om Nigam...');

  // 1. Update Profile sender_name to Om Nigam
  const { data: updatedProfile, error: profErr } = await supabase
    .from('profiles')
    .update({
      sender_name: 'Om Nigam',
      business_name: 'Om Nigam (Applied AI & Systems Engineer)',
      business_description: 'Computer Science student at BITS Pilani, Bengaluru building Arenova (AI automation and digital workflows), local LLM serving, and distributed systems in Rust.',
      value_proposition: 'Hands-on AI & Systems Engineer contributor across AI application development, backend systems, and infrastructure.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', USER_ID)
    .select()
    .single();

  if (profErr) {
    console.warn('Profile update warning:', profErr.message);
  } else {
    console.log(`✅ Profile updated: Sender Name = "${updatedProfile.sender_name}"`);
  }

  // 2. Update Campaign Metadata for Om Nigam
  const { data: updatedCampaign, error: campErr } = await supabase
    .from('campaigns')
    .update({
      name: 'Founder Outreach - Om Nigam (Applied AI & Systems Engineering Internship)',
      offer: 'Applied AI & Systems Engineering Internship (Om Nigam, BITS Pilani CS)',
      business_context: 'Om Nigam is a Computer Science student at BITS Pilani, Bengaluru (2025-2029) building practical Agentic AI, Arenova (AI automation and digital workflows), local LLM serving (Compact SLM in FastAPI/Qwen3), distributed systems in Rust (Conflict-Free OLTP with CRDTs), and backend architecture.',
      tone: 'conversational, technical, humble, high-signal, peer-to-peer',
      call_to_action: 'Brief 5-minute chat to discuss internship opportunities',
      initial_email_instructions: 'Personalize based on the founder product and actual engineering stack. Subject line MUST be: "Engineering Internship at [Company] — Om Nigam". Connect Om most relevant project (Compact SLM for infra/LLMs, Conflict-Free OLTP in Rust for distributed systems/databases, ResearchGit for search/dev-tools, Arenova/AetherLabs for applied AI and agentic workflows). Use [Resume]({{resume_url}}) and [GitHub](https://github.com/avicdr). Strict 100 to 160 words. Paragraphs 1 to 3 sentences. Never use em dashes or en dashes in the email body. Sign off as Om.',
      updated_at: new Date().toISOString(),
    })
    .eq('id', CAMPAIGN_ID)
    .select()
    .single();

  if (campErr) {
    console.error('Failed to update campaign:', campErr);
    process.exit(1);
  }
  console.log(`✅ Campaign updated: "${updatedCampaign.name}"`);

  // 3. Fetch all enrolled campaign leads with full lead profiles
  const { data: campaignLeads, error: clErr } = await supabase
    .from('campaign_leads')
    .select('*, lead:leads(*)')
    .eq('campaign_id', CAMPAIGN_ID);

  if (clErr || !campaignLeads) {
    console.error('Failed to fetch campaign leads:', clErr);
    process.exit(1);
  }

  console.log(`👥 Found ${campaignLeads.length} enrolled founder leads. Re-generating personalized drafts for Om Nigam...`);

  // 4. Fetch existing messages for step 0
  const { data: existingMessages } = await supabase
    .from('email_messages')
    .select('id, campaign_lead_id')
    .in('campaign_lead_id', campaignLeads.map((cl) => cl.id))
    .eq('step_number', 0);

  const existingMap = new Map<string, string>();
  for (const m of existingMessages || []) {
    existingMap.set(m.campaign_lead_id, m.id);
  }

  let updatedCount = 0;
  let createdCount = 0;
  const sampleDrafts: any[] = [];

  for (let i = 0; i < campaignLeads.length; i++) {
    const cl = campaignLeads[i];
    const lead = cl.lead as Lead;
    if (!lead) continue;

    const draft = await generateInitialEmail({
      lead,
      campaign: updatedCampaign,
      senderName: SENDER_NAME,
    });

    const existingId = existingMap.get(cl.id);
    if (existingId) {
      const { error: updErr } = await supabase
        .from('email_messages')
        .update({
          subject: draft.subject,
          body_text: draft.body,
          personalization_basis: draft.personalization_basis,
          unsupported_claims: draft.unsupported_claims,
          status: 'draft',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingId);

      if (updErr) {
        console.error(`Failed to update draft for ${lead.email}:`, updErr.message);
      } else {
        updatedCount++;
      }
    } else {
      const { data: inserted, error: insErr } = await supabase
        .from('email_messages')
        .insert({
          campaign_lead_id: cl.id,
          step_number: 0,
          subject: draft.subject,
          body_text: draft.body,
          personalization_basis: draft.personalization_basis,
          unsupported_claims: draft.unsupported_claims,
          status: 'draft',
          scheduled_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insErr) {
        console.error(`Failed to insert draft for ${lead.email}:`, insErr.message);
      } else {
        createdCount++;
        existingMap.set(cl.id, inserted.id);
      }
    }

    if (
      ['LangChain', 'Modal', 'Hatchet', 'LlamaIndex'].includes(lead.company || '') ||
      sampleDrafts.length < 3
    ) {
      sampleDrafts.push({
        founder: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        company: lead.company,
        email: lead.email,
        subject: draft.subject,
        body: draft.body,
      });
    }

    if ((i + 1) % 50 === 0 || i === campaignLeads.length - 1) {
      console.log(`  Processed ${i + 1}/${campaignLeads.length} leads... (${updatedCount} updated, ${createdCount} created)`);
    }
  }

  console.log(`\n🎉 Successfully personalized all ${updatedCount + createdCount} founder drafts for Om Nigam!`);
  console.log('\n================== SAMPLE FOUNDER DRAFTS ==================');
  for (const s of sampleDrafts.slice(0, 3)) {
    console.log(`\nTo: ${s.founder} <${s.email}> (${s.company})`);
    console.log(`Subject: ${s.subject}`);
    console.log(`----------------------------------------`);
    console.log(s.body);
    console.log(`========================================`);
  }
}

run().catch((err) => {
  console.error('Fatal error during profile and draft update:', err);
  process.exit(1);
});
