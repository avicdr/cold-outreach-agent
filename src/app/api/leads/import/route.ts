import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/auth';
import { dbService } from '@/lib/db-service';
import {
  parseCSVContent,
  parseExcelBuffer,
  autoDetectColumnMapping,
  processImportRows,
  ColumnMapping,
  RawLeadRow,
} from '@/lib/csv-excel';

export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const contentType = request.headers.get('content-type') || '';

  try {
    let rows: RawLeadRow[] = [];
    let headers: string[] = [];
    let customMapping: ColumnMapping | undefined;
    let filename = 'import_data';

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      const mappingStr = formData.get('mapping') as string | null;

      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
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

    // Retrieve existing and suppressed emails for user
    const existingEmails = await dbService.getExistingNormalizedEmails(user.id);
    const suppressedEmails = await dbService.getSuppressedNormalizedEmails(user.id);

    // Validate and normalize rows
    const validation = processImportRows(rows, mapping, existingEmails, suppressedEmails);

    // Insert valid leads
    const insertResult = await dbService.insertLeads(
      user.id,
      validation.validLeads.map((l) => ({
        ...l,
        status: 'active',
        source_import: filename,
      }))
    );

    // Log activity
    await dbService.logActivity(user.id, 'lead_import', 'leads', null, {
      filename,
      total_rows: validation.totalRows,
      inserted: insertResult.inserted,
      duplicates_in_file: validation.duplicatesInFile,
      invalid_rows_count: validation.invalidRows.length,
    });

    return NextResponse.json({
      success: true,
      filename,
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
