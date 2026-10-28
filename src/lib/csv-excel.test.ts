import { describe, it, expect } from 'vitest';
import {
  normalizeEmail,
  isValidEmailSyntax,
  autoDetectColumnMapping,
  processImportRows,
  sanitizeCSVValue,
  exportToSafeCSV,
  parseCSVContent,
} from './csv-excel';

describe('CSV and Excel Utilities', () => {
  it('normalizes email correctly', () => {
    expect(normalizeEmail('  Test.User+123@Example.COM  ')).toBe('test.user+123@example.com');
  });

  it('validates email syntax correctly', () => {
    expect(isValidEmailSyntax('user@example.com')).toBe(true);
    expect(isValidEmailSyntax('user.name+tag@sub.domain.co')).toBe(true);
    expect(isValidEmailSyntax('invalid-email')).toBe(false);
    expect(isValidEmailSyntax('invalid@domain')).toBe(false);
    expect(isValidEmailSyntax('@nodomain.com')).toBe(false);
    expect(isValidEmailSyntax('')).toBe(false);
  });

  it('auto-detects common column headers', () => {
    const headers = ['First Name', 'Last Name', 'Email Address', 'Company Name', 'Job Title'];
    const mapping = autoDetectColumnMapping(headers);
    expect(mapping.email).toBe('Email Address');
    expect(mapping.first_name).toBe('First Name');
    expect(mapping.last_name).toBe('Last Name');
    expect(mapping.company).toBe('Company Name');
    expect(mapping.job_title).toBe('Job Title');
  });

  it('parses CSV and detects duplicates and invalid emails', () => {
    const csvData = `First Name,Last Name,Email,Company
Alice,Smith,alice@example.com,Acme
Bob,Jones,bob@example.com,Beta
Duplicate,One,alice@example.com,Acme
Invalid,Bad,not-an-email,Gamma
`;
    const { headers, rows } = parseCSVContent(csvData);
    const mapping = autoDetectColumnMapping(headers);
    const result = processImportRows(rows, mapping);

    expect(result.validLeads.length).toBe(2);
    expect(result.validLeads[0].email).toBe('alice@example.com');
    expect(result.validLeads[1].email).toBe('bob@example.com');
    expect(result.duplicatesInFile).toBe(1);
    expect(result.invalidRows.length).toBe(2); // 1 duplicate + 1 invalid syntax
  });

  it('sanitizes formula injection in CSV export', () => {
    expect(sanitizeCSVValue('=CMD|"/C calc"!A0')).toBe('\'=CMD|"/C calc"!A0');
    expect(sanitizeCSVValue('+123456')).toBe('\'+123456');
    expect(sanitizeCSVValue('-dangerous')).toBe('\'-dangerous');
    expect(sanitizeCSVValue('@formula')).toBe('\'@formula');
    expect(sanitizeCSVValue('Safe Value')).toBe('Safe Value');

    const exported = exportToSafeCSV(
      [{ name: '=SUM(A1:A5)', email: 'test@example.com' }],
      ['name', 'email']
    );
    expect(exported).toContain(`"'=SUM(A1:A5)"`);
  });

  it('auto-detects and processes tech founder CSV with multi-emails and multiple names', () => {
    const csvData = `ID,Startup_Name,Website,Cohort,Startup_Details,Founder_Names,Founder_Direct_Emails,Business_Careers_Email,Target_Remote_Roles,Tech_Stack,Outreach_Hook
1,"LangChain","https://langchain.com","AI Infrastructure","Orchestration platform","Harrison Chase, Ankush Gola","harrison@langchain.dev; harrison@langchain.com","hello@langchain.dev","Applied AI Engineer","Python, LangGraph","Reference LangGraph 1.0 loops"
2,"Modal Labs","https://modal.com","AI Infrastructure","Serverless GPU compute","Erik Bernhardsson, Akshat Bubna","erik@modal.com","jobs@modal.com","Systems Engineer","Python, Rust","Share cold-start benchmarks"
`;
    const { headers, rows } = parseCSVContent(csvData);
    const mapping = autoDetectColumnMapping(headers);

    expect(mapping.company).toBe('Startup_Name');
    expect(mapping.email).toBe('Founder_Direct_Emails');
    expect(mapping.full_name).toBe('Founder_Names');
    expect(mapping.personalization_hook).toBe('Outreach_Hook');

    const result = processImportRows(rows, mapping);
    expect(result.validLeads.length).toBe(2);

    expect(result.validLeads[0].company).toBe('LangChain');
    expect(result.validLeads[0].first_name).toBe('Harrison');
    expect(result.validLeads[0].last_name).toBe('Chase');
    expect(result.validLeads[0].email).toBe('harrison@langchain.dev');
    expect(result.validLeads[0].custom_fields['Tech_Stack']).toBe('Python, LangGraph');
    expect(result.validLeads[0].custom_fields['Cold_Email_Personalization_Hook']).toBe('Reference LangGraph 1.0 loops');

    expect(result.validLeads[1].company).toBe('Modal Labs');
    expect(result.validLeads[1].first_name).toBe('Erik');
    expect(result.validLeads[1].email).toBe('erik@modal.com');
  });
});
