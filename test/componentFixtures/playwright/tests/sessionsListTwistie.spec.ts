/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('reveals the nested chat twistie only while hovering the session row', async ({ page }) => {
	await openFixture(page, 'sessions/sessionsList/SessionsList_NestedChatApprovals/Dark', '.session-item');

	const sessionRow = page.locator('.monaco-list-row').filter({ has: page.locator('.session-item') }).first();
	const twistie = sessionRow.locator('.session-chat-twistie.collapsible');
	const statusIcon = sessionRow.locator('.session-icon');

	await expect(twistie).toHaveCSS('opacity', '0');
	await expect(twistie).toHaveCSS('pointer-events', 'none');
	await expect(statusIcon).toHaveCSS('visibility', 'visible');

	await sessionRow.hover();

	await expect(twistie).toHaveCSS('opacity', '1');
	await expect(twistie).toHaveCSS('pointer-events', 'auto');
	await expect(statusIcon).toHaveCSS('visibility', 'hidden');

	await page.mouse.move(0, 0);

	await expect(twistie).toHaveCSS('opacity', '0');
	await expect(statusIcon).toHaveCSS('visibility', 'visible');
});

for (const theme of ['Dark', 'Light', 'DarkHighContrast', 'LightHighContrast']) {
	test.describe(`collapsed section unread indicators (${theme})`, () => {
		test('replaces only the owning section icons and preserves hover and keyboard chevrons', async ({ page }) => {
			await openFixture(page, `sessions/sessionsList/SessionsList_CollapsedUnreadSections/${theme}`, '.sessions-list-control');

			const readWorkspace = page.getByRole('treeitem', { name: 'vscode, 1', exact: true });
			await expect(readWorkspace.locator('.session-section-icon.codicon-folder')).toBeVisible();
			await expect(readWorkspace.locator('.codicon-circle-filled')).toHaveCount(0);

			for (const label of ['Release work', 'vscode-docs']) {
				const row = page.getByRole('treeitem', { name: `${label}, 1, unread sessions`, exact: true });
				const icon = row.locator('.session-section-icon');
				const unread = icon.locator('.codicon-circle-filled');
				const chevron = row.locator('.session-section-chevron');

				await expect(row).toHaveAttribute('aria-expanded', 'false');
				await expect(unread).toBeVisible();
				await expect(unread).toHaveAttribute('style', 'color: var(--vscode-textLink-foreground);');
				await expect(chevron).toBeHidden();

				await row.hover();
				await expect(icon).toBeHidden();
				await expect(chevron).toBeVisible();

				await readWorkspace.hover();
				await expect(unread).toBeVisible();
				await expect(chevron).toBeHidden();

				await row.click();
				await readWorkspace.hover();
				await expect(row).toHaveAttribute('aria-expanded', 'true');
				await expect(unread).toHaveCount(0);
				await expect(icon).toHaveClass(/codicon-folder(?:-library)?/);
				await expect(icon).toBeVisible();

				await row.click();
				await readWorkspace.hover();
				await expect(row).toHaveAttribute('aria-expanded', 'false');
				await expect(unread).toHaveCount(1);
				await page.keyboard.press('Tab');
				await page.keyboard.press('Shift+Tab');
				await expect(page.getByRole('tree', { name: 'Sessions', exact: true })).toBeFocused();
				await expect(icon).toBeHidden();
				await expect(chevron).toBeVisible();
			}
		});

		test('keeps normal icons when the setting is disabled', async ({ page }) => {
			await openFixture(page, `sessions/sessionsList/SessionsList_CollapsedUnreadSections_Disabled/${theme}`, '.sessions-list-control');

			await expect(page.locator('.session-section-icon .codicon-circle-filled')).toHaveCount(0);
			await expect(page.getByRole('treeitem', { name: 'Release work, 1', exact: true }).locator('.codicon-folder-library')).toBeVisible();
			for (const label of ['vscode', 'vscode-docs']) {
				const row = page.getByRole('treeitem', { name: `${label}, 1`, exact: true });
				await expect(row).toHaveAttribute('aria-expanded', 'false');
				await expect(row.locator('.session-section-icon.codicon-folder')).toBeVisible();
			}
		});
	});
}
