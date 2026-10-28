import path from 'path';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

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

async function check() {
  const { data: cls } = await supabase
    .from('campaign_leads')
    .select('id, lead:leads(company, first_name, email)')
    .eq('campaign_id', CAMPAIGN_ID);

  const clIds = (cls || []).map((c: any) => c.id);

  const { data: msgs } = await supabase
    .from('email_messages')
    .select('id, subject, body_text, status, campaign_lead_id')
    .in('campaign_lead_id', clIds);

  console.log('Total Enrolled Leads:', clIds.length);
  console.log('Total Draft Messages in DB:', msgs?.length);

  let minWords = 9999;
  let maxWords = 0;
  let emDashCount = 0;
  let enDashCount = 0;
  let hasResumePlaceholder = 0;
  let hasValidLinks = 0;

  for (const m of (msgs || [])) {
    const text = m.body_text || '';
    const words = text.trim().split(/\s+/).length;
    if (words < minWords) minWords = words;
    if (words > maxWords) maxWords = words;
    if (text.includes('—') || (m.subject || '').includes('—')) emDashCount++;
    if (text.includes('–') || (m.subject || '').includes('–')) enDashCount++;
    if (text.includes('{{resume_url}}')) hasResumePlaceholder++;
    if (text.includes('[Resume]') && text.includes('[GitHub]')) hasValidLinks++;
  }

  console.log('Word count range:', `${minWords} to ${maxWords} words`);
  console.log('Em dashes found in any draft:', emDashCount);
  console.log('En dashes found in any draft:', enDashCount);
  console.log('Drafts containing [Resume] and [GitHub] markdown links:', hasValidLinks);
  console.log('Drafts containing {{resume_url}} placeholder:', hasResumePlaceholder);

  const clMap = new Map((cls || []).map((c: any) => [c.id, c.lead]));
  for (const m of (msgs || [])) {
    const lead: any = clMap.get(m.campaign_lead_id);
    if (['LangChain', 'Modal Labs', 'Hatchet (YC W24)'].includes(lead?.company)) {
      console.log('\n========================================');
      console.log('Company:', lead?.company, '| To:', lead?.first_name, '<' + lead?.email + '>');
      console.log('Subject:', m.subject);
      console.log('Word Count:', m.body_text.trim().split(/\s+/).length);
      console.log('----------------------------------------');
      console.log(m.body_text);
    }
  }
}

check().catch(console.error);
