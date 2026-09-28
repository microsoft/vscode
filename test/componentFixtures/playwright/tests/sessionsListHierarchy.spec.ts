/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, Locator, Page, test } from '@playwright/test';
import { getBaseURL } from './utils.js';

// Skipped: cold fixture renders intermittently exceed the 3000ms fixture timeout
// (`Fixture timed out after 3000ms`). Re-enable once the shared fixture readiness
// fix lands: https://github.com/microsoft/vscode/pull/338259
// Spec added in https://github.com/microsoft/vscode/pull/338329
test.skip(true, 'Flaky: cold fixture renders exceed the 3000ms fixture timeout, see https://github.com/microsoft/vscode/pull/338259');

declare const __componentExplorer__: {
	renderFixture(fixtureId: string): Promise<{ hasError: boolean; previousDispose?: { hasError: boolean } }>;
	disposeCurrentFixture(): Promise<{ hasError: boolean }>;
};

test.beforeEach(async ({ page }) => {
	await page.goto(`${getBaseURL()}/___explorer?mode=headless`, { waitUntil: 'networkidle' });
	await page.waitForFunction(() => typeof __componentExplorer__ !== 'undefined');
});

test.afterEach(async ({ page }) => {
	expect(await page.evaluate(() => __componentExplorer__.disposeCurrentFixture())).toMatchObject({ hasError: false });
});

async function renderFixture(page: Page, fixtureId: string): Promise<void> {
	const report = await page.evaluate(id => __componentExplorer__.renderFixture(`sessions/sessionsList/${id}`), fixtureId);
	expect({ renderError: report.hasError, disposeError: report.previousDispose?.hasError ?? false }, JSON.stringify(report)).toEqual({ renderError: false, disposeError: false });
}

async function expectCompactChatLayout(row: Locator): Promise<void> {
	const geometry = await row.evaluate(element => {
		const content = element.querySelector('.session-chat-item')!.getBoundingClientRect();
		const title = element.querySelector('.session-chat-title')!.getBoundingClientRect();
		const toolbar = element.querySelector('.session-title-toolbar')!.getBoundingClientRect();
		const bounds = element.getBoundingClientRect();
		return {
			contentHeight: content.height,
			rowHeight: bounds.height,
			titleBeforeActions: title.right <= toolbar.left,
			actionsInsideRow: toolbar.right <= bounds.right,
		};
	});
	expect(geometry).toEqual({ contentHeight: 28, rowHeight: 30, titleBeforeActions: true, actionsInsideRow: true });
}

for (const theme of ['Dark', 'Light']) {
	for (const compact of [false, true]) {
		const prefix = compact ? 'SessionsList_Compact' : 'SessionsList_';

		test(`nested chat actions belong to the hovered child (${compact ? 'compact' : 'normal'}, ${theme})`, async ({ page }) => {
			await renderFixture(page, `${prefix}NestedChatActions/${theme}`);

			const hierarchy = await page.locator('.monaco-list-row').filter({ has: page.locator('.session-item, .session-chat-item') }).evaluateAll(rows => rows.map(row => ({
				title: row.querySelector('.session-title, .session-chat-title')?.textContent,
				level: row.getAttribute('aria-level'),
				expanded: row.getAttribute('aria-expanded'),
				archived: !!row.querySelector('.archived'),
				actions: Array.from(row.querySelectorAll<HTMLElement>('.session-title-toolbar .action-label')).filter(action => action.checkVisibility()).map(action => action.getAttribute('aria-label')),
			})));
			expect(hierarchy).toEqual([
				{ title: 'Investigate session persistence', level: '2', expanded: 'true', archived: false, actions: [] },
				{ title: 'Compare provider state', level: '3', expanded: null, archived: false, actions: ['Mark as Done'] },
				{ title: 'Previous persistence approach', level: '3', expanded: null, archived: true, actions: [] },
			]);

			if (compact) {
				await expectCompactChatLayout(page.getByRole('treeitem', { name: /^Compare provider state,/ }));
			}
		});
	}

	test(`compact parent actions are independent of child archive state (${theme})`, async ({ page }) => {
		await renderFixture(page, `SessionsList_CompactNestedChats/${theme}`);

		const parent = page.locator('.session-item');
		await expect(parent.getByRole('button', { name: 'Pin', exact: true })).toBeVisible();
		await expect(parent.getByRole('button', { name: 'Mark as Done', exact: true })).toBeVisible();
		await expect(page.locator('.session-chat-item .session-title-toolbar:visible')).toHaveCount(0);
		await expect(page.locator('.session-chat-item.archived .codicon-pass-filled')).toBeVisible();
	});

	test(`compact collapsed hierarchy preserves focus and expands both children (${theme})`, async ({ page }) => {
		await renderFixture(page, `SessionsList_CompactNestedChatsCollapsed/${theme}`);

		const parent = page.getByRole('treeitem', { name: /^Investigate session persistence,/ });
		const tree = page.getByRole('tree', { name: 'Sessions', exact: true });
		await expect(parent).toHaveAttribute('aria-expanded', 'false');
		await expect(page.locator('.session-chat-item')).toHaveCount(0);
		await expect(tree).toBeFocused();

		await parent.hover();
		const twistie = parent.locator('.session-chat-twistie');
		await twistie.click();
		await expect(tree).toBeFocused();
		await expect(parent).toHaveAttribute('aria-expanded', 'true');
		await expect(page.locator('.session-chat-title')).toHaveText(['Compare provider state', 'Previous persistence approach']);

		await twistie.click();
		await expect(tree).toBeFocused();
		await expect(parent).toHaveAttribute('aria-expanded', 'false');
		await expect(page.locator('.session-chat-item')).toHaveCount(0);
	});

	test(`compact done parent offers Restore and keeps its children (${theme})`, async ({ page }) => {
		await renderFixture(page, `SessionsList_CompactArchivedSessionWithChats/${theme}`);

		await expect(page.locator('.session-section-label')).toHaveText('Done');
		await expect(page.locator('.session-item.archived').getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
		await expect(page.locator('.session-item').getByRole('button', { name: 'Pin', exact: true })).toHaveCount(0);
		await expect(page.locator('.session-item').getByRole('button', { name: 'Mark as Done', exact: true })).toHaveCount(0);
		await expect(page.locator('.session-chat-title')).toHaveText(['Compare provider state', 'Previous persistence approach']);
	});

	test(`compact nested approvals reserve space on their own rows (${theme})`, async ({ page }) => {
		await renderFixture(page, `SessionsList_CompactNestedChatApprovals/${theme}`);

		const rows = await page.locator('.monaco-list-row').filter({ has: page.locator('.session-item, .session-chat-item') }).evaluateAll(elements => elements.map(element => {
			const bounds = element.getBoundingClientRect();
			const approval = element.querySelector<HTMLElement>('.session-approval-row');
			const approvalBounds = approval?.checkVisibility() ? approval.getBoundingClientRect() : undefined;
			return {
				title: element.querySelector('.session-title, .session-chat-title')?.textContent,
				compact: element.querySelector('.session-item, .session-chat-item')!.getBoundingClientRect().height === 28,
				approvalFits: approvalBounds ? approvalBounds.top >= bounds.top && approvalBounds.bottom <= bounds.bottom : undefined,
			};
		}));
		expect(rows).toEqual([
			{ title: 'HTTP Client Retry Plan', compact: false, approvalFits: true },
			{ title: 'Task A', compact: false, approvalFits: true },
			{ title: 'Task B', compact: true, approvalFits: undefined },
			{ title: 'Task C', compact: false, approvalFits: true },
		]);
		expect(await page.getByRole('button', { name: /^Allow once:/ }).evaluateAll(buttons => buttons.map(button => button.getAttribute('aria-label')))).toEqual([
			'Allow once: yarn workspace @vscode-tools/server build --watch',
			'Allow once: yarn workspace @vscode-tools/server build',
			'Allow once: npm run test:integration -- --grep "retry"',
		]);
	});
}

for (const theme of ['Dark', 'Light', 'DarkHighContrast', 'LightHighContrast']) {
	for (const compact of [false, true]) {
		test(`done child exposes Restore on keyboard focus (${compact ? 'compact' : 'normal'}, ${theme})`, async ({ page }) => {
			const fixture = compact ? 'SessionsList_CompactArchivedNestedChat' : 'SessionsList_ArchivedNestedChat';
			await renderFixture(page, `${fixture}/${theme}`);

			const done = page.getByRole('treeitem', { name: /^Previous persistence approach,.*archived$/ });
			await expect(done).toHaveClass(/focused/);
			await expect(done.locator('.codicon-pass-filled')).toBeVisible();
			await expect(done.getByRole('button', { name: 'Restore', exact: true })).toBeVisible();
			await expect(done.getByRole('button', { name: 'Mark as Done', exact: true })).toHaveCount(0);
			await expect(page.locator('.session-item .session-title-toolbar')).toBeHidden();
			await expect(page.locator('.session-chat-item:not(.archived) .session-title-toolbar')).toBeHidden();
			if (compact) {
				await expect(done).toHaveAttribute('aria-selected', 'true');
				await expectCompactChatLayout(done);
			}
		});
	}
}

test('done child context menu offers Restore, not parent actions', async ({ page }) => {
	await renderFixture(page, 'SessionsList_ArchivedNestedChatMenu/Dark');

	await expect(page.getByRole('menuitem', { name: 'Restore', exact: true })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Mark as Done', exact: true })).toHaveCount(0);
	await expect(page.getByRole('menuitem', { name: 'Pin', exact: true })).toHaveCount(0);
});

test('compact parent menu reflects visible done children', async ({ page }) => {
	await renderFixture(page, 'SessionsList_ArchivedNestedChatsVisibleSessionMenu/Dark');

	await expect(page.getByRole('menuitemcheckbox', { name: /Show Done Chats$/ })).toHaveAttribute('aria-checked', 'true');
	await expect(page.getByRole('menuitem', { name: 'Mark as Done', exact: true })).toBeVisible();
	await expect(page.getByRole('menuitem', { name: 'Restore', exact: true })).toHaveCount(0);
});
