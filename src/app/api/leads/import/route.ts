import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import { checkRateLimit, getClientIp } from '@/lib/security';
import {
  parseCSVContent,
  parseExcelBuffer,
  autoDetectColumnMapping,
  processImportRows,
  ColumnMapping,
  RawLeadRow,
} from '@/lib/csv-excel';

const MAX_IMPORT_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const clientIp = getClientIp(request);
  const rateLimit = checkRateLimit(`import:${user.id}:${clientIp}`, 10, 60 * 1000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded. Please wait before importing more files.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter || 60) } }
    );
  }

  const contentType = request.headers.get('content-type') || '';

  try {
    let rows: RawLeadRow[] = [];
    let headers: string[] = [];
    let customMapping: ColumnMapping | undefined;
    let filename = 'import_data';
    let requestedGroupId: string | null = null;
    let requestedGroupName: string | null = null;
    let requestedGroupDesc: string | null = null;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const mappingStr = formData.get('mapping') as string | null;
      requestedGroupId = (formData.get('group_id') as string | null) || null;
      requestedGroupName = (formData.get('group_name') as string | null) || null;
      requestedGroupDesc = (formData.get('group_description') as string | null) || null;

      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }

      if (file.size > MAX_IMPORT_FILE_SIZE) {
        return NextResponse.json(
          { error: 'File size exceeds maximum allowed limit (10MB)' },
          { status: 413 }
        );
      }

      filename = file.name;
      const buffer = Buffer.from(await file.arrayBuffer());

      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const parsed = parseExcelBuffer(buffer);
        rows = parsed.rows;
        headers = parsed.headers;
      } else {
        const text = buffer.toString('utf8');
        const parsed = parseCSVContent(text);
        rows = parsed.rows;
        headers = parsed.headers;
      }

      if (mappingStr) {
        try {
          customMapping = JSON.parse(mappingStr);
        } catch {
          // Fall back to auto-detection
        }
      }
    } else {
      // JSON payload
      const json = await request.json();
      rows = json.rows || [];
      headers = json.headers || (rows.length > 0 ? Object.keys(rows[0]) : []);
      customMapping = json.mapping;
      filename = json.filename || 'import.json';
      requestedGroupId = json.group_id || null;
      requestedGroupName = json.group_name || json.new_group_name || null;
      requestedGroupDesc = json.group_description || null;
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'The uploaded file contains no rows' }, { status: 400 });
    }

    const mapping = customMapping || autoDetectColumnMapping(headers);

    if (!mapping.email) {
      return NextResponse.json(
        {
          error: 'Could not automatically detect the email column. Please provide column mapping.',
          detected_headers: headers,
        },
        { status: 422 }
      );
    }

    // Resolve Lead Group if specified
    let targetGroup: { id: string; name: string } | null = null;
    let targetGroupId: string | null = null;

    try {
      if (requestedGroupId && requestedGroupId.trim()) {
        const g = await dbService.getLeadGroup(requestedGroupId.trim());
        if (g && (g.user_id === user.id || user.isOwner)) {
          targetGroup = { id: g.id, name: g.name };
          targetGroupId = g.id;
        } else {
          return NextResponse.json({ error: 'Lead group not found or access denied' }, { status: 404 });
        }
      } else if (requestedGroupName && requestedGroupName.trim()) {
        const cleanName = requestedGroupName.trim();
        const existingGroups = await dbService.getLeadGroups(user.id);
        const existing = existingGroups.find((g) => g.name.toLowerCase() === cleanName.toLowerCase());
        if (existing) {
          targetGroup = { id: existing.id, name: existing.name };
          targetGroupId = existing.id;
        } else {
          const created = await dbService.createLeadGroup(user.id, {
            name: cleanName,
            description: (requestedGroupDesc || '').trim(),
          });
          targetGroup = { id: created.id, name: created.name };
          targetGroupId = created.id;
        }
      }
    } catch (groupErr) {
      console.warn('Lead group lookup/creation failed during import, continuing without group:', groupErr);
      targetGroup = null;
      targetGroupId = null;
    }

    // Retrieve existing and suppressed emails for user
    const existingEmails = await dbService.getExistingNormalizedEmails(user.id);
    const suppressedEmails = await dbService.getSuppressedNormalizedEmails(user.id);

    // Validate and normalize rows
    const validation = processImportRows(rows, mapping, existingEmails, suppressedEmails, targetGroupId);

    // Insert valid leads
    const insertResult = await dbService.insertLeads(
      user.id,
      validation.validLeads.map((l) => ({
        ...l,
        group_id: targetGroupId,
        status: 'active',
        source_import: filename,
      }))
    );

    // Log activity
    await dbService.logActivity(user.id, 'lead_import', 'leads', targetGroupId, {
      filename,
      group_id: targetGroupId,
      group_name: targetGroup ? targetGroup.name : null,
      total_rows: validation.totalRows,
      inserted: insertResult.inserted,
      duplicates_in_file: validation.duplicatesInFile,
      invalid_rows_count: validation.invalidRows.length,
    });

    return NextResponse.json({
      success: true,
      filename,
      group: targetGroup,
      total_rows: validation.totalRows,
      inserted: insertResult.inserted,
      duplicates_in_file: validation.duplicatesInFile,
      invalid_count: validation.invalidRows.length,
      invalid_rows: validation.invalidRows.slice(0, 50), // Sample of invalid rows
    });
  } catch (err: unknown) {
    console.error('Lead import error:', err);
    const errorMsg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Import failed: ${errorMsg}` }, { status: 500 });
  }
}
