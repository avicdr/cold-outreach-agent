import { createClient } from '@supabase/supabase-js';
import { cleanCompanyName, getSubjectCompanyName, getCategoryConfig, countWords } from './test-redraft.mjs';

const CAMPAIGN_ID = 'a509b0f0-90ce-46e0-a41f-37b999d5b1b1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function main() {
  console.log('=== UPDATING SUBJECT LINES FOR US SMB CAMPAIGN ===');
  console.log(`Target Campaign ID: ${CAMPAIGN_ID}`);

  // 1. Fetch Campaign
  const { data: campaign, error: campErr } = await supabase
    .from('campaigns')
    .select('id, name, status, initial_email_instructions')
    .eq('id', CAMPAIGN_ID)
    .single();

  if (campErr || !campaign) {
    console.error('Failed to fetch campaign:', campErr);
    process.exit(1);
  }

  console.log(`Campaign Name: "${campaign.name}" (Status: ${campaign.status})`);

  // 2. Fetch Campaign Leads and their linked lead profile
  const { data: cls, error: clErr } = await supabase
    .from('campaign_leads')
    .select('id, lead_id, lead:leads(company, category, city)')
    .eq('campaign_id', CAMPAIGN_ID);

  if (clErr) {
    console.error('Failed to fetch campaign leads:', clErr);
    process.exit(1);
  }

  const clMap = new Map();
  (cls || []).forEach((c) => clMap.set(c.id, c.lead));
  const clIds = Array.from(clMap.keys());

  console.log(`Found ${clIds.length} campaign leads enrolled in campaign.`);

  // 3. Fetch all messages
  const { data: messages, error: msgErr } = await supabase
    .from('email_messages')
    .select('id, campaign_lead_id, subject, status, sent_at, scheduled_at, created_at')
    .in('campaign_lead_id', clIds)
    .order('created_at', { ascending: true });

  if (msgErr) {
    console.error('Failed to fetch messages:', msgErr);
    process.exit(1);
  }

  console.log(`Found ${messages.length} total messages in campaign.`);

  const sentCount = messages.filter((m) => m.sent_at !== null || m.status === 'sent').length;
  const eligibleMessages = messages.filter((m) => m.sent_at === null && m.status !== 'sent');

  console.log(`Sent messages (preserved, untouched): ${sentCount}`);
  console.log(`Unsent messages eligible for subject update: ${eligibleMessages.length}`);

  let updatedCount = 0;
  const subjectDistribution = {};
  const sampleUpdates = [];

  for (let i = 0; i < eligibleMessages.length; i++) {
    const msg = eligibleMessages[i];
    const lead = clMap.get(msg.campaign_lead_id);
    const comp = cleanCompanyName(lead?.company);
    const subjComp = getSubjectCompanyName(comp);
    const cfg = getCategoryConfig(lead?.category);
    const entityNoun = cfg.practiceType === 'shop' ? 'shop' : (cfg.practiceType === 'practice' ? 'practice' : 'clinic');

    const templates = [
      `this might be useful for your ${entityNoun}`,
      `what happens after your ${entityNoun} closes?`,
      `i had an idea for ${subjComp}`,
      `a thought about your front desk`,
      `what happens to missed calls?`,
      `this might make things easier`,
      `who's answering calls after hours?`,
      `a small idea for your ${entityNoun}`
    ];

    let newSubject = templates[i % templates.length];
    const words = countWords(newSubject);
    if (words > 7 && newSubject.startsWith('i had an idea for')) {
      const shortComp = subjComp.split(/\s+/).slice(0, 2).join(' ');
      newSubject = `i had an idea for ${shortComp}`;
    }

    // Safety check for dashes or hyphens
    if (/[-–—]/.test(newSubject)) {
      newSubject = newSubject.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const { error: updErr } = await supabase
      .from('email_messages')
      .update({
        subject: newSubject,
        updated_at: new Date().toISOString()
      })
      .eq('id', msg.id);

    if (updErr) {
      console.error(`Failed to update message ${msg.id}:`, updErr.message);
    } else {
      updatedCount++;
      const tmplKey = templates[i % templates.length].replace(subjComp, '[Clinic Name]').replace(entityNoun, '[noun]');
      subjectDistribution[tmplKey] = (subjectDistribution[tmplKey] || 0) + 1;

      if (sampleUpdates.length < 10) {
        sampleUpdates.push({
          company: comp,
          oldSubject: msg.subject,
          newSubject: newSubject
        });
      }
    }
  }

  // 4. Update campaign initial_email_instructions to reflect new subject line guidelines
  const newInstructions = `${campaign.initial_email_instructions || ''}\n\nSubject line rules: Use conversational, lowercase subject lines (3-7 words) without dashes. Examples: "this might be useful for your clinic", "what happens after your clinic closes?", "i had an idea for [Clinic Name]", "a thought about your front desk", "what happens to missed calls?", "this might make things easier", "who's answering calls after hours?", "a small idea for your clinic".`.trim();

  await supabase
    .from('campaigns')
    .update({
      initial_email_instructions: newInstructions,
      updated_at: new Date().toISOString()
    })
    .eq('id', CAMPAIGN_ID);

  console.log('\n--- UPDATE COMPLETE ---');
  console.log(`Successfully updated: ${updatedCount} / ${eligibleMessages.length} drafts`);
  console.log('\nSubject template distribution:');
  console.table(subjectDistribution);

  console.log('\nSample updated drafts:');
  console.table(sampleUpdates);
}

main().catch(console.error);

