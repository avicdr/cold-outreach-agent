import { describe, it, expect, beforeEach } from 'vitest';
import { dbService } from '@/lib/db-service';
import { mockDb } from '@/lib/supabase/mock-db';
import { OWNER_USER_ID } from '@/lib/auth';
import { GET as leadGroupsGet, POST as leadGroupsPost } from '@/app/api/lead-groups/route';
import { GET as leadGroupGet, PATCH as leadGroupPatch, DELETE as leadGroupDelete } from '@/app/api/lead-groups/[id]/route';
import { GET as leadsGet, POST as leadsPost } from '@/app/api/leads/route';
import { POST as importPost } from '@/app/api/leads/import/route';
import { POST as campaignsPost } from '@/app/api/campaigns/route';
import { POST as enrollPost } from '@/app/api/campaigns/[id]/enroll/route';

describe('Lead Groups and Group-Based Uploads', () => {
  const userId = OWNER_USER_ID;

  beforeEach(async () => {
    // Clear leads, lead groups, campaigns, and campaign leads for test isolation
    mockDb.leads.clear();
    mockDb.leadGroups.clear();
    mockDb.campaigns.clear();
    mockDb.campaignLeads.clear();
  });

  it('creates, lists, updates, and deletes lead groups via API', async () => {
    // 1. Create a lead group
    const createReq = new Request('http://localhost:3000/api/lead-groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'SaaS Decision Makers Q4',
        description: 'VPs and Founders in Enterprise B2B SaaS',
      }),
    });

    const createRes = await leadGroupsPost(createReq as any);
    expect(createRes.status).toBe(201);
    const createData = await createRes.json();
    expect(createData.success).toBe(true);
    expect(createData.group.id).toBeDefined();
    expect(createData.group.name).toBe('SaaS Decision Makers Q4');
    const groupId = createData.group.id;

    // 2. List lead groups and verify lead count is 0
    const listRes = await leadGroupsGet();
    expect(listRes.status).toBe(200);
    const listData = await listRes.json();
    expect(Array.isArray(listData)).toBe(true);
    expect(listData.length).toBe(1);
    expect(listData[0].leads_count).toBe(0);

    // 3. Update lead group name and description
    const patchReq = new Request(`http://localhost:3000/api/lead-groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'B2B SaaS Execs Q4',
        description: 'Updated enterprise outreach segment',
      }),
    });

    const patchRes = await leadGroupPatch(patchReq as any, { params: Promise.resolve({ id: groupId }) });
    expect(patchRes.status).toBe(200);
    const patchData = await patchRes.json();
    expect(patchData.group.name).toBe('B2B SaaS Execs Q4');

    // 4. Retrieve single lead group
    const getRes = await leadGroupGet(new Request(`http://localhost:3000/api/lead-groups/${groupId}`) as any, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(getRes.status).toBe(200);
    const getData = await getRes.json();
    expect(getData.group.name).toBe('B2B SaaS Execs Q4');

    // 5. Delete lead group
    const deleteRes = await leadGroupDelete(new Request(`http://localhost:3000/api/lead-groups/${groupId}`) as any, {
      params: Promise.resolve({ id: groupId }),
    });
    expect(deleteRes.status).toBe(200);
    const afterDeleteList = await (await leadGroupsGet()).json();
    expect(afterDeleteList.length).toBe(0);
  });

  it('uploads leads as a group by creating a new group on import', async () => {
    const importPayload = {
      filename: 'fintech_prospects.csv',
      group_name: 'Fintech Series A',
      group_description: 'Prospects from fintech companies',
      mapping: {
        email: 'Email',
        first_name: 'First Name',
        company: 'Company',
      },
      rows: [
        { Email: 'ceo@fintech1.io', 'First Name': 'Alice', Company: 'Fintech Alpha' },
        { Email: 'cto@fintech2.io', 'First Name': 'Bob', Company: 'Fintech Beta' },
        { Email: 'vp@fintech3.io', 'First Name': 'Charlie', Company: 'Fintech Gamma' },
      ],
    };

    const req = new Request('http://localhost:3000/api/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importPayload),
    });

    const res = await importPost(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.inserted).toBe(3);
    expect(data.group).toBeDefined();
    expect(data.group.name).toBe('Fintech Series A');

    const createdGroupId = data.group.id;

    // Verify lead groups API reflects the 3 leads in this group
    const groups = await dbService.getLeadGroups(userId);
    const fintechGroup = groups.find((g) => g.id === createdGroupId);
    expect(fintechGroup).toBeDefined();
    expect(fintechGroup?.leads_count).toBe(3);

    // Verify leads GET API can filter by group_id
    const leadsReq = new Request(`http://localhost:3000/api/leads?group_id=${createdGroupId}`);
    const leadsRes = await leadsGet(leadsReq as any);
    expect(leadsRes.status).toBe(200);
    const leadsData = await leadsRes.json();
    expect(leadsData.leads.length).toBe(3);
    expect(leadsData.total).toBe(3);
    expect(leadsData.leads[0].group_id).toBe(createdGroupId);
    expect(leadsData.leads[0].lead_group?.name).toBe('Fintech Series A');
  });

  it('uploads leads into an existing lead group', async () => {
    // 1. Pre-create a lead group
    const group = await dbService.createLeadGroup(userId, {
      name: 'Healthcare SMBs',
      description: 'Local clinics and dental practices',
    });

    // 2. Import leads specifying the existing group_id
    const importPayload = {
      filename: 'dentists.xlsx',
      group_id: group.id,
      mapping: {
        email: 'email',
        company: 'business',
      },
      rows: [
        { email: 'dr.smith@dental.com', business: 'Smith Dental Care' },
        { email: 'clinic@healthplus.org', business: 'HealthPlus Clinic' },
      ],
    };

    const req = new Request('http://localhost:3000/api/leads/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importPayload),
    });

    const res = await importPost(req as any);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.inserted).toBe(2);
    expect(data.group.id).toBe(group.id);
    expect(data.group.name).toBe('Healthcare SMBs');

    // Verify updated count in group
    const updatedGroup = await dbService.getLeadGroup(group.id);
    expect(updatedGroup?.leads_count).toBe(2);
  });

  it('enrolls an entire group of leads into an outreach campaign', async () => {
    // 1. Create a lead group and import 4 leads into it
    const group = await dbService.createLeadGroup(userId, {
      name: 'High Fit Dentists',
    });

    await dbService.insertLeads(userId, [
      {
        email: 'lead1@clinic.com',
        normalized_email: 'lead1@clinic.com',
        first_name: 'Lead 1',
        last_name: 'Test',
        company: 'Clinic 1',
        job_title: 'Doctor',
        website: 'https://clinic1.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'test',
        group_id: group.id,
      },
      {
        email: 'lead2@clinic.com',
        normalized_email: 'lead2@clinic.com',
        first_name: 'Lead 2',
        last_name: 'Test',
        company: 'Clinic 2',
        job_title: 'Doctor',
        website: 'https://clinic2.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'test',
        group_id: group.id,
      },
    ]);

    // 2. Create a campaign
    const campaign = await dbService.createCampaign(userId, {
      name: 'Dental Outreach Campaign',
      status: 'draft',
      business_context: 'Medical software',
      ideal_customer_profile: 'Dentists',
      offer: 'Patient booking automation',
      tone: 'Professional',
      call_to_action: '10 min chat',
      initial_email_instructions: 'Concise intro',
      sending_config: { days: [1, 2, 3, 4, 5], start_hour: 9, end_hour: 17, timezone: 'Asia/Kolkata', daily_limit: 10, hourly_limit: 3 },
      followup_config: { max_followups: 2, steps: [] },
      activated_at: null,
    });

    // 3. Enroll leads using group_id
    const enrollReq = new Request(`http://localhost:3000/api/campaigns/${campaign.id}/enroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_id: group.id,
      }),
    });

    const enrollRes = await enrollPost(enrollReq as any, { params: Promise.resolve({ id: campaign.id }) });
    expect(enrollRes.status).toBe(200);
    const enrollData = await enrollRes.json();
    expect(enrollData.success).toBe(true);
    expect(enrollData.enrolled_count).toBe(2);

    // Verify campaign leads
    const campaignLeads = await dbService.getCampaignLeads(campaign.id);
    expect(campaignLeads.length).toBe(2);
  });

  it('keeps leads active when their lead group is deleted', async () => {
    // 1. Create a lead group and add a lead to it
    const group = await dbService.createLeadGroup(userId, {
      name: 'Temporary Promo Group',
    });

    await dbService.insertLeads(userId, [
      {
        email: 'prospect@promo.com',
        normalized_email: 'prospect@promo.com',
        first_name: 'Promo',
        last_name: 'Prospect',
        company: 'Promo Co',
        job_title: 'Manager',
        website: 'https://promo.com',
        notes: '',
        custom_fields: {},
        status: 'active',
        source_import: 'test',
        group_id: group.id,
      },
    ]);

    // 2. Delete the group
    await dbService.deleteLeadGroup(group.id);

    // 3. Verify lead still exists in database, now with group_id = null (ungrouped)
    const { leads } = await dbService.getLeads(userId, { search: 'prospect@promo.com' });
    expect(leads.length).toBe(1);
    expect(leads[0].email).toBe('prospect@promo.com');
    expect(leads[0].group_id).toBeNull();

    // 4. Verify ungrouped filter finds this lead
    const ungrouped = await dbService.getLeads(userId, { groupId: 'ungrouped' });
    expect(ungrouped.leads.some((l) => l.email === 'prospect@promo.com')).toBe(true);
  });
});
