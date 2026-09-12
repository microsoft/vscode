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
	for (const { name, fixture, ariaStatus, indicatorClass, color, count } of [
		{ name: 'unread', fixture: 'SessionsList_CollapsedUnreadSections', ariaStatus: 'contains unread sessions', indicatorClass: '.codicon-circle-filled', color: '--vscode-textLink-foreground', count: 1 },
		{ name: 'needs-input', fixture: 'SessionsList_CollapsedNeedsInputSections', ariaStatus: 'session needs input', indicatorClass: '.monaco-pixel-spinner-ring', color: '--vscode-list-warningForeground', count: 2 },
		{ name: 'CI-failure', fixture: 'SessionsList_CollapsedCIFailureSections', ariaStatus: 'session has failing CI checks', indicatorClass: '.codicon-circle-filled', color: '--vscode-list-warningForeground', count: 2 },
	]) {
		test.describe(`collapsed section ${name} indicators (${theme})`, () => {
			test('replaces only the owning section icons and preserves hover and keyboard chevrons', async ({ page }) => {
				await openFixture(page, `sessions/sessionsList/${fixture}/${theme}`, '.sessions-list-control');

				const readWorkspace = page.getByRole('treeitem', { name: 'vscode, 1', exact: true });
				await expect(readWorkspace.locator('.session-section-icon.codicon-folder')).toBeVisible();
				await expect(readWorkspace.locator(indicatorClass)).toHaveCount(0);

				for (const label of ['Release work', 'vscode-docs']) {
					const row = page.getByRole('treeitem', { name: `${label}, ${count}, ${ariaStatus}`, exact: true });
					const icon = row.locator('.session-section-icon');
					const indicator = icon.locator(indicatorClass);
					const chevron = row.locator('.session-section-chevron');

					await expect(row).toHaveAttribute('aria-expanded', 'false');
					await expect(indicator).toBeVisible();
					await expect(indicator).toHaveAttribute('style', `color: var(${color});`);
					await expect(chevron).toBeHidden();

					await row.hover();
					await expect(icon).toBeHidden();
					await expect(chevron).toBeVisible();

					await readWorkspace.hover();
					await expect(indicator).toBeVisible();
					await expect(chevron).toBeHidden();

					await row.click();
					await readWorkspace.hover();
					await expect(row).toHaveAttribute('aria-expanded', 'true');
					await expect(indicator).toHaveCount(0);
					await expect(icon).toHaveClass(/codicon-folder(?:-library)?/);
					await expect(icon).toBeVisible();

					await row.click();
					await readWorkspace.hover();
					await expect(row).toHaveAttribute('aria-expanded', 'false');
					await expect(indicator).toHaveCount(1);
					await page.keyboard.press('Tab');
					await page.keyboard.press('Shift+Tab');
					await expect(page.getByRole('tree', { name: 'Sessions', exact: true })).toBeFocused();
					await expect(icon).toBeHidden();
					await expect(chevron).toBeVisible();
				}
			});

			test('keeps normal icons with the default-disabled setting', async ({ page }) => {
				await openFixture(page, `sessions/sessionsList/${fixture}_Disabled/${theme}`, '.sessions-list-control');

				await expect(page.locator(`.session-section-icon ${indicatorClass}`)).toHaveCount(0);
				await expect(page.getByRole('treeitem', { name: `Release work, ${count}`, exact: true }).locator('.codicon-folder-library')).toBeVisible();
				for (const label of ['vscode', 'vscode-docs']) {
					const row = page.getByRole('treeitem', { name: `${label}, ${label === 'vscode' ? 1 : count}`, exact: true });
					await expect(row).toHaveAttribute('aria-expanded', 'false');
					await expect(row.locator('.session-section-icon.codicon-folder')).toBeVisible();
				}
			});
		});
	}
}
