/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, Page, test } from '@playwright/test';
import { openFixture } from './utils.js';

/** Titles of the session and chat rows that draw a hierarchy guide, as rendered, in list order. */
function shownGuides(page: Page): Promise<string[]> {
	return page.locator('.session-item, .session-chat-item').evaluateAll(items => items
		.filter(item => {
			const style = getComputedStyle(item, '::after');
			return style.content !== 'none' && style.display !== 'none' && style.opacity === '1';
		})
		.sort((a, b) => Number(a.closest('.monaco-list-row')?.getAttribute('data-index')) - Number(b.closest('.monaco-list-row')?.getAttribute('data-index')))
		.map(item => item.querySelector('.session-title, .session-chat-title')?.textContent ?? ''));
}

test('reveals the guides of every hierarchy while the pointer is anywhere over the pane', async ({ page }) => {
	await openFixture(page, 'sessions/sessionsList/SessionsList_NestedChatHierarchies/Dark', '.sessions-list-control');

	const pane = await page.locator('.agent-sessions-viewpane').boundingBox();
	expect(pane).not.toBeNull();
	const outsidePane = { x: pane!.x + pane!.width + 20, y: pane!.y + 20 };
	const emptySpaceInPane = { x: pane!.x + pane!.width / 2, y: pane!.y + pane!.height - 10 };
	const firstSession = page.locator('.monaco-list-row').filter({ has: page.getByText('HTTP Client Retry Plan', { exact: true }) });
	const secondSession = page.locator('.monaco-list-row').filter({ has: page.getByText('Session Persistence Cleanup', { exact: true }) });
	const allGuides = ['HTTP Client Retry Plan', 'Task A', 'Task B', 'Session Persistence Cleanup', 'Audit stored state', 'Migrate old entries'];

	await page.mouse.move(outsidePane.x, outsidePane.y);
	await expect.poll(() => shownGuides(page)).toEqual([]);

	await page.mouse.move(emptySpaceInPane.x, emptySpaceInPane.y);
	await expect.poll(() => shownGuides(page)).toEqual(allGuides);
	await expect(firstSession.locator('.session-chat-twistie.collapsible')).toHaveCSS('opacity', '0');
	await expect(secondSession.locator('.session-chat-twistie.collapsible')).toHaveCSS('opacity', '0');

	await secondSession.hover();
	await expect.poll(() => shownGuides(page)).toEqual(allGuides);
	await expect(firstSession.locator('.session-chat-twistie.collapsible')).toHaveCSS('opacity', '0');
	await expect(secondSession.locator('.session-chat-twistie.collapsible')).toHaveCSS('opacity', '1');

	await page.mouse.move(outsidePane.x, outsidePane.y);
	await expect.poll(() => shownGuides(page)).toEqual([]);
});

test('renders empty-section placeholders at the compact row height', async ({ page }) => {
	await openFixture(page, 'sessions/sessionsList/SessionsList_Groups_Empty/Dark', '.session-placeholder');

	const placeholder = page.locator('.session-placeholder').filter({ hasText: 'No session' });
	const dimensions = await placeholder.evaluate(element => ({
		content: element.getBoundingClientRect().height,
		row: element.closest('.monaco-list-row')?.getBoundingClientRect().height,
	}));

	expect(dimensions).toEqual({ content: 28, row: 28 });
});

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

test('aligns the nested chat twistie with the compact session status icon', async ({ page }) => {
	await openFixture(page, 'sessions/sessionsList/SessionsList_Compact/Dark', '.sessions-list-control');

	const sessionRow = page.locator('.monaco-list-row').filter({ has: page.locator('.session-item') }).first();
	const twistie = sessionRow.locator('.session-chat-twistie.collapsible');
	const statusIcon = sessionRow.locator('.session-icon > .codicon');

	await sessionRow.hover();
	await expect(twistie).toBeVisible();

	const twistieBounds = await twistie.boundingBox();
	const statusIconBounds = await statusIcon.boundingBox();
	expect(twistieBounds).not.toBeNull();
	expect(statusIconBounds).not.toBeNull();
	expect(twistieBounds!.y + twistieBounds!.height / 2).toBe(statusIconBounds!.y + statusIconBounds!.height / 2);
});

for (const theme of ['Dark', 'Light']) {
	for (const { fixture, pinned, sticky } of [
		{ fixture: 'SessionsList_NestedChats', pinned: false, sticky: false },
		{ fixture: 'SessionsList_NestedChats_PinnedView', pinned: false, sticky: true },
		{ fixture: 'SessionsList_NestedChatHierarchyGuides', pinned: true, sticky: true },
	]) {
		test(`renders nested chats with independent sidebar and view pinning (${fixture}, ${theme})`, async ({ page }) => {
			await openFixture(page, `sessions/sessionsList/${fixture}/${theme}`, '.session-item');

			const sessionRow = page.locator('.monaco-list-row').filter({ has: page.locator('.session-item') });
			const chatTitles = page.locator('.session-chat-title');
			const tree = page.getByRole('tree', { name: 'Sessions', exact: true });
			await expect(chatTitles).toHaveText(['Task A', 'Task B']);
			await expect(page.locator('.session-item.pinned')).toHaveCount(pinned ? 1 : 0);
			await expect(page.locator('.session-item.sticky')).toHaveCount(sticky ? 1 : 0);
			await expect.poll(() => shownGuides(page)).toEqual(['HTTP Client Retry Plan', 'Task A', 'Task B']);

			const twistie = sessionRow.locator('.session-chat-twistie.collapsible');
			await sessionRow.hover();
			await twistie.click();
			await expect(sessionRow).toHaveAttribute('aria-expanded', 'false');
			await expect(chatTitles).toHaveCount(0);
			await expect(tree).toBeFocused();

			await twistie.click();
			await expect(sessionRow).toHaveAttribute('aria-expanded', 'true');
			await expect(chatTitles).toHaveText(['Task A', 'Task B']);
			await expect(tree).toBeFocused();
		});
	}
}

for (const theme of ['Dark', 'Light', 'DarkHighContrast', 'LightHighContrast']) {
	for (const { name, fixture, ariaStatus, indicatorClass, color, count } of [
		{ name: 'unread', fixture: 'SessionsList_CollapsedUnreadSections', ariaStatus: 'contains unread sessions', indicatorClass: '.codicon-circle-filled', color: '--vscode-textLink-foreground', count: 1 },
		{ name: 'needs-input', fixture: 'SessionsList_CollapsedNeedsInputSections', ariaStatus: 'session needs attention', indicatorClass: '.codicon-report-question', color: '--vscode-list-warningForeground', count: 2 },
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
					// A hovered row reveals its toolbar actions, which would then sit in the Shift+Tab order.
					await page.mouse.move(0, 0);
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
