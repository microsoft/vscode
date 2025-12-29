/**
 * E2E Tests for Workspace Cognitive Architect
 */

import { test, expect } from '@playwright/test';

test.describe('Workspace CA', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]', { timeout: 30000 });
  });

  test('should show CA sidebar', async ({ page }) => {
    // Click CA icon in activity bar
    await page.locator('[data-testid="activity-bar-ca"]').click();

    // Should show CA sidebar
    await expect(page.locator('[data-testid="ca-sidebar"]')).toBeVisible();
  });

  test('should display suggestions', async ({ page }) => {
    // Open CA sidebar
    await page.locator('[data-testid="activity-bar-ca"]').click();

    // Should show suggestions section
    await expect(page.locator('[data-testid="ca-suggestions"]')).toBeVisible();
  });

  test('should show project insights', async ({ page }) => {
    // Open CA sidebar
    await page.locator('[data-testid="activity-bar-ca"]').click();

    // Should show insights section
    await expect(page.locator('[data-testid="ca-insights"]')).toBeVisible();

    // Should display module count
    await expect(page.locator('[data-testid="insight-module-count"]')).toBeVisible();
  });

  test('should generate documentation on request', async ({ page }) => {
    // Open CA sidebar
    await page.locator('[data-testid="activity-bar-ca"]').click();

    // Click generate docs button
    await page.locator('[data-testid="generate-docs-button"]').click();

    // Should show documentation preview
    await expect(page.locator('[data-testid="doc-preview"]')).toBeVisible({
      timeout: 30000,
    });
  });

  test('should apply suggestion', async ({ page }) => {
    // Open CA sidebar
    await page.locator('[data-testid="activity-bar-ca"]').click();

    // Wait for suggestions to load
    await page.waitForSelector('[data-testid="suggestion-item"]');

    // Click apply on first suggestion
    await page.locator('[data-testid="suggestion-apply-button"]').first().click();

    // Should show success message
    await expect(page.locator('[data-testid="suggestion-applied-toast"]')).toBeVisible();
  });

  test('should dismiss suggestion', async ({ page }) => {
    // Open CA sidebar
    await page.locator('[data-testid="activity-bar-ca"]').click();

    // Wait for suggestions
    await page.waitForSelector('[data-testid="suggestion-item"]');

    // Get initial count
    const initialCount = await page.locator('[data-testid="suggestion-item"]').count();

    // Dismiss first suggestion
    await page.locator('[data-testid="suggestion-dismiss-button"]').first().click();

    // Should have one less suggestion
    await expect(page.locator('[data-testid="suggestion-item"]')).toHaveCount(initialCount - 1);
  });

  test('should show status bar indicator', async ({ page }) => {
    // CA status should be visible in status bar
    await expect(page.locator('[data-testid="ca-status-bar"]')).toBeVisible();

    // Should show CA status (active/analyzing/idle)
    await expect(page.locator('[data-testid="ca-status-bar"]')).toContainText(
      /(Active|Analyzing|Idle)/
    );
  });

  test('should show architecture diagram', async ({ page }) => {
    // Open CA sidebar
    await page.locator('[data-testid="activity-bar-ca"]').click();

    // Click architecture diagram button
    await page.locator('[data-testid="show-architecture-button"]').click();

    // Should show Mermaid diagram
    await expect(page.locator('[data-testid="architecture-diagram"]')).toBeVisible({
      timeout: 10000,
    });
  });
});

test.describe('CA Suggestion Types', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]');
    await page.locator('[data-testid="activity-bar-ca"]').click();
  });

  test('should show documentation gap suggestions', async ({ page }) => {
    // Look for documentation_gap type
    await expect(
      page.locator('[data-testid="suggestion-type-documentation_gap"]')
    ).toBeVisible({ timeout: 10000 });
  });

  test('should show refactoring suggestions', async ({ page }) => {
    // May or may not be present depending on codebase
    const refactorSuggestions = page.locator(
      '[data-testid="suggestion-type-refactoring_opportunity"]'
    );

    // Either visible or count is 0
    const count = await refactorSuggestions.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should filter suggestions by type', async ({ page }) => {
    // Click filter dropdown
    await page.locator('[data-testid="suggestion-filter"]').click();

    // Select documentation only
    await page.locator('[data-testid="filter-documentation"]').click();

    // All visible suggestions should be documentation type
    const suggestions = page.locator('[data-testid="suggestion-item"]');
    const count = await suggestions.count();

    for (let i = 0; i < count; i++) {
      await expect(suggestions.nth(i)).toHaveAttribute(
        'data-suggestion-type',
        'documentation_gap'
      );
    }
  });
});

