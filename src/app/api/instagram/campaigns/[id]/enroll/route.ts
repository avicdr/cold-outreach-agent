import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { instagramDb } from '@/lib/instagram/db';
import {
  normalizeInstagramHandle,
  isValidInstagramHandle,
  formatInstagramHandle,
  buildInstagramUrl,
} from '@/lib/instagram/handles';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getAuthenticatedUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const campaign = await instagramDb.getInstagramCampaign(id);
  if (!campaign || campaign.user_id !== user.id) {
    return NextResponse.json({ error: 'Instagram campaign not found' }, { status: 404 });
  }

  try {
    const body = await request.json();
    let enrolledCount = 0;

    // Option 1: Enroll existing Instagram leads by ID
    if (Array.isArray(body.lead_ids) && body.lead_ids.length > 0) {
      const res = await instagramDb.enrollInstagramLeads(id, body.lead_ids);
      enrolledCount += res.enrolled;
    }

    // Option 2: Enroll an Instagram Lead Group
    if (body.group_id) {
      const grp = await instagramDb.getInstagramLeadGroup(body.group_id);
      if (!grp || grp.user_id !== user.id) {
        return NextResponse.json({ error: 'Instagram lead group not found' }, { status: 404 });
      }
      const { leads } = await instagramDb.getInstagramLeads(user.id, { groupId: body.group_id, limit: 2000 });
      const res = await instagramDb.enrollInstagramLeads(id, leads.map((l) => l.id));
      enrolledCount += res.enrolled;
    }

    // Option 3: Pull leads directly from an existing Email Campaign or Email Lead Group
    if (body.email_campaign_id || body.email_group_id) {
      const imported = await instagramDb.importLeadsFromEmailSource(user.id, {
        emailCampaignId: body.email_campaign_id,
        emailLeadGroupId: body.email_group_id,
      });
      if (imported.leads.length > 0) {
        const res = await instagramDb.enrollInstagramLeads(id, imported.leads.map((l) => l.id));
        enrolledCount += res.enrolled;
      }
    }

    // Option 4: Quick-paste raw Instagram handles directly into this campaign
    if (Array.isArray(body.handles) && body.handles.length > 0) {
      const existingHandles = await instagramDb.getExistingNormalizedHandles(user.id);
      const existingList = await instagramDb.getInstagramLeads(user.id, { limit: 5000 });
      const byHandle = new Map(existingList.leads.map((l) => [l.normalized_handle, l.id]));

      const toInsert: any[] = [];
      const enrollIds: string[] = [];

      for (const raw of body.handles) {
        const norm = normalizeInstagramHandle(String(raw || ''));
        if (!norm || !isValidInstagramHandle(norm)) continue;
        if (existingHandles.has(norm)) {
          const existingId = byHandle.get(norm);
          if (existingId) enrollIds.push(existingId);
          continue;
        }
        existingHandles.add(norm);
        toInsert.push({
          normalized_handle: norm,
          instagram_handle: formatInstagramHandle(norm),
          instagram_url: buildInstagramUrl(norm),
          source_import: `campaign_quick_add:${id}`,
          status: 'active',
        });
      }

      if (toInsert.length > 0) {
        const inserted = await instagramDb.insertInstagramLeads(user.id, toInsert);
        enrollIds.push(...inserted.insertedLeads.map((l) => l.id));
      }

      if (enrollIds.length > 0) {
        const res = await instagramDb.enrollInstagramLeads(id, enrollIds);
        enrolledCount += res.enrolled;
      }
    }

    await dbService.logActivity(user.id, 'instagram_campaign_enrolled', 'instagram_campaigns', id, {
      enrolled_count: enrolledCount,
    });

    return NextResponse.json({ success: true, enrolled_count: enrolledCount });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
