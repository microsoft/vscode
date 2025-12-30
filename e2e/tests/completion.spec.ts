/**
 * E2E Tests for Code Completion
 */

import { test, expect } from '@playwright/test';

test.describe('Code Completion', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]', { timeout: 30000 });

    // Create a new file
    await page.keyboard.press('Meta+N');
    await page.waitForSelector('[data-testid="editor"]');
  });

  test('should trigger completion on Ctrl+Space', async ({ page }) => {
    const editor = page.locator('[data-testid="editor"]');

    // Type some code
    await editor.pressSequentially('def hello(');

    // Trigger completion
    await page.keyboard.press('Control+Space');

    // Should show completion popup
    await expect(page.locator('[data-testid="completion-popup"]')).toBeVisible({
      timeout: 5000,
    });
  });

  test('should accept completion with Tab', async ({ page }) => {
    const editor = page.locator('[data-testid="editor"]');

    await editor.pressSequentially('def process_da');
    await page.keyboard.press('Control+Space');

    // Wait for completion
    await page.waitForSelector('[data-testid="completion-popup"]');

    // Accept with Tab
    await page.keyboard.press('Tab');

    // Should complete the word
    const content = await editor.inputValue();
    expect(content).toContain('process_data');
  });

  test('should reject completion with Escape', async ({ page }) => {
    const editor = page.locator('[data-testid="editor"]');

    await editor.pressSequentially('def get_');
    await page.keyboard.press('Control+Space');

    // Wait for completion
    await page.waitForSelector('[data-testid="completion-popup"]');

    // Reject with Escape
    await page.keyboard.press('Escape');

    // Popup should be gone
    await expect(page.locator('[data-testid="completion-popup"]')).not.toBeVisible();

    // Content should be unchanged
    const content = await editor.inputValue();
    expect(content).toBe('def get_');
  });

  test('should show tier indicator', async ({ page }) => {
    const editor = page.locator('[data-testid="editor"]');

    await editor.pressSequentially('def complex_algorithm(');
    await page.keyboard.press('Control+Space');

    // Wait for completion
    await page.waitForSelector('[data-testid="completion-popup"]');

    // Should show tier indicator
    await expect(page.locator('[data-testid="tier-indicator"]')).toBeVisible();
  });

  test('should show Flash App indicator when used', async ({ page }) => {
    const editor = page.locator('[data-testid="editor"]');

    // Simple completion should use Flash App
    await editor.pressSequentially('x = ');
    await page.keyboard.press('Control+Space');

    // Wait for completion
    await page.waitForSelector('[data-testid="completion-popup"]');

    // Should show Flash App indicator
    await expect(page.locator('[data-testid="flash-app-indicator"]')).toBeVisible();
  });

  test('should navigate completions with arrow keys', async ({ page }) => {
    const editor = page.locator('[data-testid="editor"]');

    await editor.pressSequentially('import ');
    await page.keyboard.press('Control+Space');

    // Wait for completion with multiple items
    await page.waitForSelector('[data-testid="completion-item"]');

    // Navigate down
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');

    // Third item should be highlighted
    await expect(
      page.locator('[data-testid="completion-item"]:nth-child(3)')
    ).toHaveClass(/selected/);
  });
});

test.describe('Completion Metrics', () => {
  test('should track completion latency', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]');

    // Open metrics panel
    await page.keyboard.press('Meta+Shift+M');

    // Should show latency metrics
    await expect(page.locator('[data-testid="completion-latency-p50"]')).toBeVisible();
    await expect(page.locator('[data-testid="completion-latency-p99"]')).toBeVisible();
  });

  test('should show cache hit rate', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]');

    // Open metrics panel
    await page.keyboard.press('Meta+Shift+M');

    // Should show cache metrics
    await expect(page.locator('[data-testid="cache-hit-rate"]')).toBeVisible();
  });
});


