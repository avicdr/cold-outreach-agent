import { createClient } from '@supabase/supabase-js';
import { generateInitialEmail } from '../src/lib/gemini';
import { Lead, Campaign } from '../src/types/database';

import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nkiizjcwrrdggdqneuhv.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const CAMPAIGN_ID = 'c8376445-b90d-4c3f-bcc8-10403be99d4f';
const SENDER_NAME = 'Avi';

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function run() {
  console.log(`🚀 Generating personalized drafts for campaign: ${CAMPAIGN_ID}...`);

  // 1. Fetch Campaign
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (campErr || !campaign) {
    console.error('Failed to fetch campaign:', campErr);
    process.exit(1);
  }

  console.log(`📋 Campaign: "${campaign.name}"`);
  console.log(`🔒 Single Inbox Lock: ${campaign.email_account_id}`);
  console.log(`🔗 Resume URL: ${campaign.resume_url || '{{resume_url}} (placeholder)'}`);

  // 2. Fetch all enrolled campaign leads with full lead profiles
  const { data: campaignLeads, error: clErr } = await supabase
    .from('campaign_leads')
    .select('*, lead:leads(*)')
    .eq('campaign_id', CAMPAIGN_ID);

  if (clErr || !campaignLeads) {
    console.error('Failed to fetch campaign leads:', clErr);
    process.exit(1);
  }

  console.log(`👥 Found ${campaignLeads.length} enrolled leads.`);

  // 3. Check existing draft messages
  const { data: existingMessages, error: msgErr } = await supabase
    .from('email_messages')
    .select('id, campaign_lead_id, step_number')
    .in('campaign_lead_id', campaignLeads.map((cl) => cl.id))
    .eq('step_number', 0);

  if (msgErr) {
    console.error('Error fetching existing messages:', msgErr);
  }

  const existingMap = new Map<string, string>();
  for (const m of existingMessages || []) {
    existingMap.set(m.campaign_lead_id, m.id);
  }

  console.log(`📑 Existing drafts found: ${existingMap.size}`);

  let createdCount = 0;
  let updatedCount = 0;
  const sampleDrafts: any[] = [];

  for (let i = 0; i < campaignLeads.length; i++) {
    const cl = campaignLeads[i];
    const lead = cl.lead as Lead;
    if (!lead) continue;

    const draft = await generateInitialEmail({
      lead,
      campaign,
      senderName: SENDER_NAME,
    });

    const existingId = existingMap.get(cl.id);
    if (existingId) {
      // Update existing draft
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
      // Insert new draft
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

    if (sampleDrafts.length < 3) {
      sampleDrafts.push({
        founder: `${lead.first_name || ''} ${lead.last_name || ''}`.trim(),
        company: lead.company,
        email: lead.email,
        subject: draft.subject,
        body: draft.body,
      });
    }

    if ((i + 1) % 25 === 0 || i === campaignLeads.length - 1) {
      console.log(`  Processed ${i + 1}/${campaignLeads.length} leads... (${createdCount} created, ${updatedCount} updated)`);
    }
  }

  console.log(`\n🎉 Completed! Total drafts: ${createdCount + updatedCount} (Created: ${createdCount}, Updated: ${updatedCount})`);
  console.log('\n--- SAMPLE DRAFT 1 ---');
  console.log(`To: ${sampleDrafts[0]?.founder} <${sampleDrafts[0]?.email}> (${sampleDrafts[0]?.company})`);
  console.log(`Subject: ${sampleDrafts[0]?.subject}\n`);
  console.log(sampleDrafts[0]?.body);
  console.log('\n--- SAMPLE DRAFT 2 ---');
  console.log(`To: ${sampleDrafts[1]?.founder} <${sampleDrafts[1]?.email}> (${sampleDrafts[1]?.company})`);
  console.log(`Subject: ${sampleDrafts[1]?.subject}\n`);
  console.log(sampleDrafts[1]?.body);
}

run().catch((err) => {
  console.error('Fatal error during draft generation:', err);
  process.exit(1);
});
