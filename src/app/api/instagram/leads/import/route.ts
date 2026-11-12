import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { parseCSVContent, parseExcelBuffer, RawLeadRow } from '@/lib/csv-excel';
import { instagramDb } from '@/lib/instagram/db';
import {
  autoDetectInstagramColumnMapping,
  processInstagramImportRows,
  InstagramColumnMapping,
} from '@/lib/instagram/csv';

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const contentType = request.headers.get('content-type') || '';

  try {
    // JSON source bridging (from Email Campaign / Email Lead Group) or JSON rows
    if (!contentType.includes('multipart/form-data')) {
      const json = await request.json();

      // Resolve or create target IG Lead Group
      let targetGroupId: string | null = json.group_id || null;
      let targetGroup: { id: string; name: string } | null = null;
      if (!targetGroupId && json.group_name?.trim()) {
        const grp = await instagramDb.createInstagramLeadGroup(user.id, {
          name: json.group_name.trim(),
          description: json.group_description || '',
        });
        targetGroupId = grp.id;
        targetGroup = { id: grp.id, name: grp.name };
      } else if (targetGroupId) {
        const grp = await instagramDb.getInstagramLeadGroup(targetGroupId);
        if (grp && grp.user_id === user.id) targetGroup = { id: grp.id, name: grp.name };
      }

      if (json.source === 'email_campaign' || json.source === 'email_group') {
        const res = await instagramDb.importLeadsFromEmailSource(user.id, {
          emailCampaignId: json.email_campaign_id,
          emailLeadGroupId: json.email_group_id,
          targetGroupId,
        });

        let enrolled = 0;
        if (json.enroll_campaign_id && res.leads.length > 0) {
          const enrollRes = await instagramDb.enrollInstagramLeads(
            json.enroll_campaign_id,
            res.leads.map((l) => l.id)
          );
          enrolled = enrollRes.enrolled;
        }

        return NextResponse.json({
          success: true,
          total_rows: res.leads.length,
          inserted: res.created,
          reused: res.reused,
          enrolled,
          leads: res.leads,
          group: targetGroup,
        });
      }

      // Raw JSON rows import
      const rows: RawLeadRow[] = json.rows || [];
      if (rows.length === 0) {
        return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
      }
      const headers = json.headers || Object.keys(rows[0]);
      const mapping: InstagramColumnMapping = json.mapping || autoDetectInstagramColumnMapping(headers);
      const allowMissingHandle = Boolean(json.allow_missing_handle);

      if (!mapping.instagram_handle && !mapping.instagram_url && !allowMissingHandle) {
        return NextResponse.json(
          {
            error: 'Could not detect an Instagram handle or URL column. Map the Instagram handle column or allow missing handles.',
            detected_headers: headers,
          },
          { status: 422 }
        );
      }

      const existingHandles = await instagramDb.getExistingNormalizedHandles(user.id);
      const validation = processInstagramImportRows(rows, mapping, existingHandles, targetGroupId, {
        allowMissingHandle,
      });

      const insertResult = await instagramDb.insertInstagramLeads(
        user.id,
        validation.validLeads.map((l) => ({
          ...l,
          group_id: targetGroupId,
          status: 'active',
          source_import: json.filename || 'import.json',
        }))
      );

      if (json.enroll_campaign_id && insertResult.insertedLeads.length > 0) {
        await instagramDb.enrollInstagramLeads(
          json.enroll_campaign_id,
          insertResult.insertedLeads.map((l) => l.id)
        );
      }

      await dbService.logActivity(user.id, 'instagram_leads_imported', 'instagram_leads', null, {
        inserted: insertResult.inserted,
        total_rows: validation.totalRows,
      });

      return NextResponse.json({
        success: true,
        total_rows: validation.totalRows,
        inserted: insertResult.inserted,
        duplicates_in_file: validation.duplicatesInFile,
        invalid_count: validation.invalidRows.length,
        invalid_rows: validation.invalidRows.slice(0, 50),
        errors: insertResult.errors,
        group: targetGroup,
      });
    }

    // Multipart file upload
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return NextResponse.json({ error: 'File exceeds 10MB limit' }, { status: 413 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed =
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls')
        ? parseExcelBuffer(buffer)
        : parseCSVContent(buffer.toString('utf8'));

    if (parsed.rows.length === 0) {
      return NextResponse.json({ error: 'Uploaded file contains no rows' }, { status: 400 });
    }

    const mappingStr = formData.get('mapping') as string | null;
    let customMapping: InstagramColumnMapping | undefined;
    if (mappingStr) {
      try {
        customMapping = JSON.parse(mappingStr);
      } catch {
        // Fallback to auto-detect
      }
    }

    const mapping = customMapping || autoDetectInstagramColumnMapping(parsed.headers);
    const allowMissingHandle = formData.get('allow_missing_handle') === 'true';

    if (!mapping.instagram_handle && !mapping.instagram_url && !allowMissingHandle) {
      return NextResponse.json(
        {
          error: 'Could not detect an Instagram handle column. Please map the handle column.',
          detected_headers: parsed.headers,
        },
        { status: 422 }
      );
    }

    let targetGroupId = (formData.get('group_id') as string | null) || null;
    const groupName = (formData.get('group_name') as string | null) || null;
    let targetGroup: { id: string; name: string } | null = null;

    if (!targetGroupId && groupName?.trim()) {
      const grp = await instagramDb.createInstagramLeadGroup(user.id, {
        name: groupName.trim(),
        description: (formData.get('group_description') as string | null) || '',
      });
      targetGroupId = grp.id;
      targetGroup = { id: grp.id, name: grp.name };
    }

    const existingHandles = await instagramDb.getExistingNormalizedHandles(user.id);
    const validation = processInstagramImportRows(parsed.rows, mapping, existingHandles, targetGroupId, {
      allowMissingHandle,
    });

    const insertResult = await instagramDb.insertInstagramLeads(
      user.id,
      validation.validLeads.map((l) => ({
        ...l,
        group_id: targetGroupId,
        status: 'active',
        source_import: file.name,
      }))
    );

    const enrollCampaignId = formData.get('enroll_campaign_id') as string | null;
    if (enrollCampaignId && insertResult.insertedLeads.length > 0) {
      await instagramDb.enrollInstagramLeads(
        enrollCampaignId,
        insertResult.insertedLeads.map((l) => l.id)
      );
    }

    return NextResponse.json({
      success: true,
      total_rows: validation.totalRows,
      inserted: insertResult.inserted,
      duplicates_in_file: validation.duplicatesInFile,
      invalid_count: validation.invalidRows.length,
      invalid_rows: validation.invalidRows.slice(0, 50),
      errors: insertResult.errors,
      group: targetGroup,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
