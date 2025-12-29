/**
 * E2E Tests for Multi-Agent Chat
 */

import { test, expect } from '@playwright/test';

test.describe('Multi-Agent Chat', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to Logos and wait for load
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]', { timeout: 30000 });

    // Open chat panel
    await page.keyboard.press('Meta+Shift+L');
    await page.waitForSelector('[data-testid="chat-panel"]');
  });

  test('should open chat panel with keyboard shortcut', async ({ page }) => {
    await expect(page.locator('[data-testid="chat-panel"]')).toBeVisible();
    await expect(page.locator('[data-testid="message-input"]')).toBeVisible();
  });

  test('should send a message and receive response', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('Hello, can you help me with code?');
    await page.keyboard.press('Meta+Enter');

    // Wait for user message to appear
    await expect(page.locator('[data-testid="message-user"]').first()).toContainText('Hello');

    // Wait for agent response
    await expect(page.locator('[data-testid="message-assistant"]').first()).toBeVisible({
      timeout: 30000,
    });
  });

  test('should show agent autocomplete on @ symbol', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('@');

    // Wait for autocomplete dropdown
    await expect(page.locator('[data-testid="agent-autocomplete"]')).toBeVisible();

    // Should show available agents
    await expect(page.locator('[data-testid="agent-option-swe"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-option-conductor"]')).toBeVisible();
  });

  test('should filter agents based on input', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('@swe');

    // Should show only SWE agent
    await expect(page.locator('[data-testid="agent-option-swe"]')).toBeVisible();
    await expect(page.locator('[data-testid="agent-option-conductor"]')).not.toBeVisible();
  });

  test('should insert agent mention on selection', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('@');

    // Click on SWE agent
    await page.locator('[data-testid="agent-option-swe"]').click();

    // Input should contain @SWE
    await expect(input).toHaveValue(/@(SWE|swe)\s/);
  });

  test('should create new thread', async ({ page }) => {
    // Click new thread button
    await page.locator('[data-testid="new-thread-button"]').click();

    // Should show empty thread
    await expect(page.locator('[data-testid="empty-thread-message"]')).toBeVisible();
  });

  test('should switch between threads', async ({ page }) => {
    // Send a message in first thread
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('First thread message');
    await page.keyboard.press('Meta+Enter');
    await expect(page.locator('[data-testid="message-user"]')).toContainText('First thread');

    // Create new thread
    await page.locator('[data-testid="new-thread-button"]').click();
    await input.fill('Second thread message');
    await page.keyboard.press('Meta+Enter');

    // Switch back to first thread
    await page.locator('[data-testid="thread-item"]').first().click();

    // Should show first thread message
    await expect(page.locator('[data-testid="message-user"]')).toContainText('First thread');
  });

  test('should branch thread from message', async ({ page }) => {
    // Send a message
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('Original message');
    await page.keyboard.press('Meta+Enter');

    // Wait for response
    await page.waitForSelector('[data-testid="message-assistant"]');

    // Hover over message to show branch button
    await page.locator('[data-testid="message-user"]').first().hover();
    await page.locator('[data-testid="branch-button"]').click();

    // Should be in new branch
    await expect(page.locator('[data-testid="branch-indicator"]')).toBeVisible();
  });

  test('should show context indicator', async ({ page }) => {
    // Context indicator should show no context initially
    await expect(page.locator('[data-testid="context-indicator"]')).toContainText('No file context');
  });

  test('should display code blocks with apply button', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('@swe write a hello world function');
    await page.keyboard.press('Meta+Enter');

    // Wait for response with code block
    await expect(page.locator('[data-testid="code-block"]').first()).toBeVisible({
      timeout: 30000,
    });

    // Should have apply button
    await expect(page.locator('[data-testid="code-apply-button"]').first()).toBeVisible();
  });

  test('should copy code on click', async ({ page }) => {
    const input = page.locator('[data-testid="message-input"]');
    await input.fill('@swe write a simple function');
    await page.keyboard.press('Meta+Enter');

    // Wait for code block
    await page.waitForSelector('[data-testid="code-block"]', { timeout: 30000 });

    // Click copy button
    await page.locator('[data-testid="code-copy-button"]').first().click();

    // Should show copied confirmation
    await expect(page.locator('[data-testid="code-copy-button"]').first()).toContainText('Copied');
  });
});

test.describe('Chat Thread Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('[data-testid="logos-ready"]');
    await page.keyboard.press('Meta+Shift+L');
    await page.waitForSelector('[data-testid="chat-panel"]');
  });

  test('should show thread list', async ({ page }) => {
    await expect(page.locator('[data-testid="thread-sidebar"]')).toBeVisible();
  });

  test('should search threads', async ({ page }) => {
    // Create threads with messages
    for (const topic of ['authentication', 'database']) {
      await page.locator('[data-testid="new-thread-button"]').click();
      await page.locator('[data-testid="message-input"]').fill(`Help with ${topic}`);
      await page.keyboard.press('Meta+Enter');
      await page.waitForSelector('[data-testid="message-assistant"]');
    }

    // Search for specific thread
    await page.locator('[data-testid="thread-search"]').fill('authentication');

    // Should only show matching thread
    await expect(page.locator('[data-testid="thread-item"]')).toHaveCount(1);
  });

  test('should rename thread', async ({ page }) => {
    // Send a message to create thread
    await page.locator('[data-testid="message-input"]').fill('Test message');
    await page.keyboard.press('Meta+Enter');

    // Right-click on thread to rename
    await page.locator('[data-testid="thread-item"]').first().click({ button: 'right' });
    await page.locator('[data-testid="rename-thread"]').click();

    // Enter new name
    await page.locator('[data-testid="thread-name-input"]').fill('My Custom Thread');
    await page.keyboard.press('Enter');

    // Should show new name
    await expect(page.locator('[data-testid="thread-item"]').first()).toContainText(
      'My Custom Thread'
    );
  });
});

