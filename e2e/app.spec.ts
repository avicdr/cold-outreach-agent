import { test, expect } from '@playwright/test';

test.describe('Cold Outreach Agent End-to-End UI Verification', () => {
  test('navigates to public landing page and renders brand hero', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Outreacher');
    await expect(page.getByText('Launch Outreach App')).toBeVisible();
    await expect(page.getByText('Technical Architecture')).toBeVisible();
  });

  test('navigates to dashboard and renders metric cards', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('h1')).toContainText('Dashboard');
    await expect(page.getByText('Total Leads')).toBeVisible();
    await expect(page.getByText('Eligible Leads')).toBeVisible();
    await expect(page.getByText('Drafts Generated')).toBeVisible();
    await expect(page.getByText('Emails Sent')).toBeVisible();
  });

  test('navigates to leads page and displays leads list', async ({ page }) => {
    await page.goto('/leads');
    await expect(page.locator('h1')).toContainText('Leads & Prospects');
    await expect(page.getByPlaceholder('Search name, email, company...')).toBeVisible();
  });

  test('navigates to import wizard and displays upload surface', async ({ page }) => {
    await page.goto('/leads/import');
    await expect(page.locator('h1')).toContainText('Lead Import Wizard');
    await expect(page.getByText('Upload File')).toBeVisible();
  });

  test('navigates to campaigns and new campaign builder', async ({ page }) => {
    await page.goto('/campaigns');
    await expect(page.locator('h1')).toContainText('Campaigns');

    await page.goto('/campaigns/new');
    await expect(page.locator('h1')).toContainText('Create Campaign');
    await expect(page.getByPlaceholder('e.g. Q4 B2B SaaS Founders Outreach')).toBeVisible();
  });

  test('navigates to settings and checks Gmail integration status card', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('Settings & Integrations');
    await expect(page.getByText('Google OAuth & Gmail Integration')).toBeVisible();
  });

  test('renders public unsubscribe landing page with message', async ({ page }) => {
    await page.goto('/unsubscribe?token=sample-test-token');
    await expect(page.getByText(/Unsubscribe|Unable/)).toBeVisible();
  });
});
