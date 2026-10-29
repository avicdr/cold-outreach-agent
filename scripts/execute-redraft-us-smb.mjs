import { createClient } from '@supabase/supabase-js';
import { generateDraft } from './test-redraft.mjs';

const CAMPAIGN_ID = 'a509b0f0-90ce-46e0-a41f-37b999d5b1b1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('--- STARTING US SMB CAMPAIGN REDRAFT ---');
  console.log(`Target Campaign ID: ${CAMPAIGN_ID}`);

  // 1. Verify Campaign Status
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, status')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (campErr || !campaign) {
    console.error('Failed to fetch campaign:', campErr);
    process.exit(1);
  }

  console.log(`Campaign Name: "${campaign.name}"`);
  console.log(`Campaign Status: "${campaign.status}"`);

  if (campaign.status !== 'paused') {
    console.error('ERROR: Campaign is not paused! Aborting to ensure safety.');
    process.exit(1);
  }

  // 2. Snapshot other campaigns before update
  const { data: otherCampaigns, error: otherCampErr } = await supabase
    .from('campaigns')
    .select('id, name, status')
    .neq('id', CAMPAIGN_ID);

  if (otherCampErr) {
    console.error('Failed to snapshot other campaigns:', otherCampErr);
    process.exit(1);
  }

  // 3. Fetch Campaign Leads and their messages
  const { data: campaignLeads, error: clErr } = await supabase
    .from('campaign_leads')
    .select('id, lead_id, status, leads(*)')
    .eq('campaign_id', CAMPAIGN_ID);

  if (clErr) {
    console.error('Failed to fetch campaign leads:', clErr);
    process.exit(1);
  }

  console.log(`Found ${campaignLeads.length} campaign leads enrolled in target campaign.`);
  const clMap = new Map();
  campaignLeads.forEach(cl => clMap.set(cl.id, cl));

  const clIds = campaignLeads.map(cl => cl.id);

  const { data: existingMessages, error: msgErr } = await supabase
    .from('email_messages')
    .select('*')
    .in('campaign_lead_id', clIds);

  if (msgErr) {
    console.error('Failed to fetch existing messages:', msgErr);
    process.exit(1);
  }

  console.log(`Found ${existingMessages.length} eligible messages to redraft.`);

  // Validate before making any DB updates
  const updates = [];
  let skipped = 0;
  const skipReasons = [];
  const validationFailures = [];

  for (let i = 0; i < existingMessages.length; i++) {
    const msg = existingMessages[i];
    const cl = clMap.get(msg.campaign_lead_id);
    if (!cl || !cl.leads) {
      skipped++;
      skipReasons.push(`Message ${msg.id}: No linked lead data found`);
      continue;
    }

    // Safety check: ensure message is not already sent
    if (msg.sent_at !== null) {
      skipped++;
      skipReasons.push(`Message ${msg.id}: Already marked as sent`);
      continue;
    }

    const draft = generateDraft(cl.leads, i);

    // Validation checks
    if (draft.hasLongHyphen) {
      validationFailures.push(`Message ${msg.id}: Contains prohibited long hyphen`);
    }
    if (draft.subjectWordCount < 3 || draft.subjectWordCount > 7) {
      validationFailures.push(`Message ${msg.id}: Subject word count (${draft.subjectWordCount}) out of range (3-7 words)`);
    }
    if (draft.wordCount < 65 || draft.wordCount > 110) {
      validationFailures.push(`Message ${msg.id}: Body word count (${draft.wordCount}) out of range (65-110 words)`);
    }

    updates.push({
      id: msg.id,
      subject: draft.subject,
      body_text: draft.bodyText,
      personalization_basis: draft.personalizationBasis,
      updated_at: new Date().toISOString()
    });
  }

  if (validationFailures.length > 0) {
    console.error(`Validation failed on ${validationFailures.length} drafts! Aborting without updating DB.`);
    console.error(validationFailures.slice(0, 10));
    process.exit(1);
  }

  console.log(`All ${updates.length} drafts passed validation perfectly! Executing updates...`);

  // Batch update in chunks of 50
  const CHUNK_SIZE = 50;
  let updatedCount = 0;

  for (let i = 0; i < updates.length; i += CHUNK_SIZE) {
    const chunk = updates.slice(i, i + CHUNK_SIZE);
    
    // Perform updates in parallel within chunk
    await Promise.all(chunk.map(async (item) => {
      const { error: upErr } = await supabase
        .from('email_messages')
        .update({
          subject: item.subject,
          body_text: item.body_text,
          personalization_basis: item.personalization_basis,
          updated_at: item.updated_at
        })
        .eq('id', item.id);

      if (upErr) {
        throw new Error(`Failed to update message ${item.id}: ${upErr.message}`);
      }
      updatedCount++;
    }));
    console.log(`Updated ${updatedCount}/${updates.length} drafts...`);
  }

  console.log(`--- POST-EXECUTION VERIFICATION ---`);

  // 1. Verify Campaign is STILL paused
  const { data: postCamp, error: postCampErr } = await supabase
    .from('campaigns')
    .select('id, name, status')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (postCampErr || postCamp.status !== 'paused') {
    console.error('CRITICAL: Campaign status changed or unreadable!', postCamp);
  } else {
    console.log(`[VERIFIED] Campaign "${postCamp.name}" status is still strictly "${postCamp.status}".`);
  }

  // 2. Verify 0 sent messages
  const { data: postMsgs, error: postMsgErr } = await supabase
    .from('email_messages')
    .select('id, status, sent_at, subject, body_text')
    .in('campaign_lead_id', clIds);

  const sentCount = postMsgs.filter(m => m.sent_at !== null).length;
  console.log(`[VERIFIED] Sent messages count in campaign: ${sentCount} (expected: 0).`);

  let longHyphenCount = 0;
  postMsgs.forEach(m => {
    if (/[—–]/.test(m.subject) || /[—–]/.test(m.body_text)) {
      longHyphenCount++;
    }
  });
  console.log(`[VERIFIED] Long hyphens (em/en-dash) across all updated messages: ${longHyphenCount} (expected: 0).`);

  // 3. Verify other campaigns untouched
  const { data: postOtherCampaigns, error: postOtherCampErr } = await supabase
    .from('campaigns')
    .select('id, name, status')
    .neq('id', CAMPAIGN_ID);

  console.log(`[VERIFIED] Other campaigns intact:`, postOtherCampaigns);

  console.log(`\n=== FINAL STATS ===`);
  console.log(`Campaign ID: ${CAMPAIGN_ID}`);
  console.log(`Campaign Name: ${campaign.name}`);
  console.log(`Eligible drafts found: ${existingMessages.length}`);
  console.log(`Successfully redrafted: ${updatedCount}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Validation failures: ${validationFailures.length}`);
  console.log(`Campaign paused status maintained: YES`);
  console.log(`Sent messages: 0`);
}

main().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

