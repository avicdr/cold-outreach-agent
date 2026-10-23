import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export interface RawLeadRow {
  [key: string]: string | number | boolean | null | undefined;
}

export interface ParsedLead {
  email: string;
  normalized_email: string;
  first_name: string;
  last_name: string;
  company: string;
  job_title: string;
  website: string;
  notes: string;
  phone?: string;
  category?: string;
  city?: string;
  country?: string;
  rating?: number | null;
  review_count?: number | null;
  qualification_score?: number | null;
  suggested_opening?: string | null;
  sales_angle?: string | null;
  custom_fields: Record<string, string | number | boolean>;
}

export interface ColumnMapping {
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company?: string;
  job_title?: string;
  website?: string;
  notes?: string;
  phone?: string;
  category?: string;
  city?: string;
  country?: string;
  rating?: string;
  review_count?: string;
  qualification_score?: string;
  personalization_hook?: string;
  custom_fields?: string[];
}

export interface ImportValidationResult {
  validLeads: ParsedLead[];
  duplicatesInFile: number;
  invalidRows: { rowNumber: number; raw: RawLeadRow; reason: string }[];
  totalRows: number;
}

/**
 * Normalizes email: trim whitespace, convert to lowercase.
 */
export function normalizeEmail(email: string): string {
  if (!email) return '';
  return email.trim().toLowerCase();
}

/**
 * Validates email syntax strictly.
 */
export function isValidEmailSyntax(email: string): boolean {
  if (!email || email.length > 254) return false;
  // Standard compliant email regex
  const regex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  return regex.test(email);
}

/**
 * Auto-detects column mappings from headers based on common names.
 */
export function autoDetectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = { email: '' };
  const lowerHeaders = headers.map((h) => ({ original: h, lower: h.toLowerCase().trim().replace(/[-_ ]/g, '') }));

  for (const { original, lower } of lowerHeaders) {
    if (!mapping.email && (lower === 'email' || lower === 'targetcoldemail' || lower === 'targetemail' || lower === 'emailaddress' || lower === 'mail' || lower === 'contactemail')) {
      mapping.email = original;
    } else if (!mapping.first_name && (lower === 'firstname' || lower === 'fname' || lower === 'givenname')) {
      mapping.first_name = original;
    } else if (!mapping.last_name && (lower === 'lastname' || lower === 'lname' || lower === 'surname' || lower === 'familyname')) {
      mapping.last_name = original;
    } else if (!mapping.full_name && (lower === 'name' || lower === 'fullname' || lower === 'contactname')) {
      mapping.full_name = original;
    } else if (!mapping.company && (lower === 'businessname' || lower === 'company' || lower === 'companyname' || lower === 'organization' || lower === 'org' || lower === 'business' || lower === 'practicename')) {
      mapping.company = original;
    } else if (!mapping.job_title && (lower === 'jobtitle' || lower === 'title' || lower === 'role' || lower === 'position' || lower === 'occupation')) {
      mapping.job_title = original;
    } else if (!mapping.website && (lower === 'websiteurl' || lower === 'website' || lower === 'url' || lower === 'domain' || lower === 'companywebsite' || lower === 'site')) {
      mapping.website = original;
    } else if (!mapping.phone && (lower === 'phonenumber' || lower === 'phone' || lower === 'telephone' || lower === 'tel' || lower === 'mobile')) {
      mapping.phone = original;
    } else if (!mapping.category && (lower === 'categoryniche' || lower === 'category' || lower === 'niche' || lower === 'industry')) {
      mapping.category = original;
    } else if (!mapping.city && (lower === 'cityarea' || lower === 'city' || lower === 'area' || lower === 'location')) {
      mapping.city = original;
    } else if (!mapping.country && (lower === 'country')) {
      mapping.country = original;
    } else if (!mapping.rating && (lower === 'googlerating' || lower === 'rating' || lower === 'stars')) {
      mapping.rating = original;
    } else if (!mapping.review_count && (lower === 'googlereviewcount' || lower === 'reviewcount' || lower === 'reviews' || lower === 'numreviews')) {
      mapping.review_count = original;
    } else if (!mapping.qualification_score && (lower === 'leadqualificationscore' || lower === 'qualificationscore' || lower === 'score' || lower === 'leadscore')) {
      mapping.qualification_score = original;
    } else if (!mapping.personalization_hook && (lower === 'coldemailpersonalizationhook' || lower === 'personalizationhook' || lower === 'hook' || lower === 'suggestedopening' || lower === 'salesangle')) {
      mapping.personalization_hook = original;
    } else if (!mapping.notes && (lower === 'notes' || lower === 'note' || lower === 'bio' || lower === 'summary' || lower === 'context')) {
      mapping.notes = original;
    }
  }

  return mapping;
}

/**
 * Parses raw CSV string or Buffer into array of objects and headers.
 */
export function parseCSVContent(csvString: string): { headers: string[]; rows: RawLeadRow[] } {
  const parsed = Papa.parse<RawLeadRow>(csvString, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });

  const headers = parsed.meta.fields || [];
  return {
    headers,
    rows: parsed.data,
  };
}

/**
 * Parses XLSX / XLS buffer into array of objects and headers.
 */
export function parseExcelBuffer(buffer: Buffer | ArrayBuffer): { headers: string[]; rows: RawLeadRow[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [] };
  }

  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<RawLeadRow>(sheet, { defval: '' });
  
  // Extract headers
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { headers, rows };
}

/**
 * Maps rows to normalized lead objects and checks file-level uniqueness.
 */
export function processImportRows(
  rows: RawLeadRow[],
  mapping: ColumnMapping,
  existingNormalizedEmails: Set<string> = new Set(),
  suppressedNormalizedEmails: Set<string> = new Set()
): ImportValidationResult {
  const validLeads: ParsedLead[] = [];
  const seenEmailsInFile = new Set<string>();
  const invalidRows: { rowNumber: number; raw: RawLeadRow; reason: string }[] = [];
  let duplicatesInFile = 0;

  rows.forEach((row, idx) => {
    const rowNumber = idx + 2; // 1-indexed, accounting for header
    const rawEmail = String(row[mapping.email] ?? '').trim();

    if (!rawEmail) {
      invalidRows.push({ rowNumber, raw: row, reason: 'Missing email address' });
      return;
    }

    const normalized = normalizeEmail(rawEmail);

    if (!isValidEmailSyntax(normalized)) {
      invalidRows.push({ rowNumber, raw: row, reason: `Invalid email format: "${rawEmail}"` });
      return;
    }

    if (seenEmailsInFile.has(normalized)) {
      duplicatesInFile++;
      invalidRows.push({ rowNumber, raw: row, reason: `Duplicate email in file: "${rawEmail}"` });
      return;
    }
    seenEmailsInFile.add(normalized);

    if (suppressedNormalizedEmails.has(normalized)) {
      invalidRows.push({ rowNumber, raw: row, reason: `Email is on global suppression list: "${rawEmail}"` });
      return;
    }

    if (existingNormalizedEmails.has(normalized)) {
      invalidRows.push({ rowNumber, raw: row, reason: `Email already exists in database: "${rawEmail}"` });
      return;
    }

    // Handle names
    let firstName = mapping.first_name ? String(row[mapping.first_name] ?? '').trim() : '';
    let lastName = mapping.last_name ? String(row[mapping.last_name] ?? '').trim() : '';

    if (!firstName && mapping.full_name) {
      const fullName = String(row[mapping.full_name] ?? '').trim();
      if (fullName) {
        const parts = fullName.split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }
    }

    const company = mapping.company ? String(row[mapping.company] ?? '').trim() : '';
    const jobTitle = mapping.job_title ? String(row[mapping.job_title] ?? '').trim() : '';
    const website = mapping.website ? String(row[mapping.website] ?? '').trim() : '';
    const notes = mapping.notes ? String(row[mapping.notes] ?? '').trim() : '';
    const phone = mapping.phone ? String(row[mapping.phone] ?? '').trim() : '';
    const category = mapping.category ? String(row[mapping.category] ?? '').trim() : '';
    const city = mapping.city ? String(row[mapping.city] ?? '').trim() : '';
    const country = mapping.country ? String(row[mapping.country] ?? '').trim() : '';
    const rating = mapping.rating && row[mapping.rating] !== undefined && row[mapping.rating] !== '' ? parseFloat(String(row[mapping.rating])) || null : null;
    const reviewCount = mapping.review_count && row[mapping.review_count] !== undefined && row[mapping.review_count] !== '' ? parseInt(String(row[mapping.review_count]), 10) || null : null;
    const qualificationScore = mapping.qualification_score && row[mapping.qualification_score] !== undefined && row[mapping.qualification_score] !== '' ? parseInt(String(row[mapping.qualification_score]), 10) || null : null;
    const personalizationHook = mapping.personalization_hook ? String(row[mapping.personalization_hook] ?? '').trim() : '';

    // Handle custom fields: preserve all mapped custom fields and any remaining non-empty raw columns
    const customFields: Record<string, string | number | boolean> = {};

    // Standard mapped keys to avoid duplicating as raw custom fields unless helpful
    const mappedHeaderKeys = new Set(
      Object.values(mapping)
        .filter((val): val is string => typeof val === 'string' && val.length > 0)
    );

    // Save all unmapped attributes into customFields automatically
    for (const [key, val] of Object.entries(row)) {
      if (val !== undefined && val !== null && val !== '') {
        const cleanVal = typeof val === 'object' ? JSON.stringify(val) : val;
        // Save if not a primary field or if it holds qualification data
        if (!mappedHeaderKeys.has(key)) {
          customFields[key] = cleanVal;
        }
      }
    }

    // Always preserve explicit qualification names in customFields for prompt extraction
    if (personalizationHook) customFields['Cold_Email_Personalization_Hook'] = personalizationHook;
    if (category) customFields['Category_Niche'] = category;
    if (city) customFields['City_Area'] = city;
    if (company) customFields['Business_Name'] = company;
    if (rating !== null) customFields['Google_Rating'] = rating;
    if (reviewCount !== null) customFields['Google_Review_Count'] = reviewCount;
    if (qualificationScore !== null) customFields['Lead_Qualification_Score'] = qualificationScore;

    validLeads.push({
      email: rawEmail,
      normalized_email: normalized,
      first_name: firstName,
      last_name: lastName,
      company,
      job_title: jobTitle,
      website,
      notes,
      phone: phone || undefined,
      category: category || undefined,
      city: city || undefined,
      country: country || undefined,
      rating,
      review_count: reviewCount,
      qualification_score: qualificationScore,
      suggested_opening: personalizationHook || undefined,
      sales_angle: personalizationHook || undefined,
      custom_fields: customFields,
    });
  });

  return {
    validLeads,
    duplicatesInFile,
    invalidRows,
    totalRows: rows.length,
  };
}

/**
 * Safe CSV cell sanitizer that prevents CSV Formula Injection (CWE-1236).
 * If cell starts with '=', '+', '-', '@', tab, or carriage return, prepends a single quote.
 */
export function sanitizeCSVValue(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  if (dangerousChars.some((char) => str.startsWith(char))) {
    return `'${str}`;
  }
  return str;
}

/**
 * Safely exports leads or records to CSV string with formula injection protection.
 */
export function exportToSafeCSV<T extends Record<string, unknown>>(data: T[], columns: (keyof T)[]): string {
  const sanitizedRows = data.map((row) => {
    const sanitizedObj: Record<string, string> = {};
    columns.forEach((col) => {
      sanitizedObj[String(col)] = sanitizeCSVValue(row[col]);
    });
    return sanitizedObj;
  });

  return Papa.unparse(sanitizedRows, { quotes: true });
}
