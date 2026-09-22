/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, type Page, test } from '@playwright/test';
import { openFixture } from './utils.js';

async function measureActivityRows(page: Page) {
	return page.locator('.chat-tool-chain > .chat-thinking-collapsible > .chat-thinking-tool-wrapper').evaluateAll(rows => rows.map(row => {
		const icon = row.querySelector<HTMLElement>(':scope > .chat-thinking-icon');
		const label = row.querySelector<HTMLElement>('.chat-used-context-label .monaco-button-mdlabel, .progress-container p');
		if (!icon || !label) {
			throw new Error('Activity row is missing its icon or label');
		}
		const rowBounds = row.getBoundingClientRect();
		const iconBounds = icon.getBoundingClientRect();
		const labelBounds = label.getBoundingClientRect();
		const lineHeight = parseFloat(getComputedStyle(label).lineHeight);
		return {
			label: label.textContent,
			iconOffset: iconBounds.top + iconBounds.height / 2 - labelBounds.top - lineHeight / 2,
			labelOffset: labelBounds.top - rowBounds.top,
			textGutter: labelBounds.left - rowBounds.left,
			wrapped: labelBounds.height > lineHeight + 0.1,
		};
	}));
}

const scenarios = ['HookWarnings', 'HookWarningsDraw', 'HookWarningsExpanded', 'HookWarningsNarrow', 'CompletedHookWarnings'];

for (const theme of ['Dark', 'Light']) {
	for (const scenario of scenarios) {
		test(`hook activity rows align in ${scenario}/${theme}`, async ({ page }) => {
			await openFixture(page, `chat/widget/chatWidget/PersistentProgress/ToolChains/${scenario}/${theme}`, '.chat-tool-chain');
			await expect(page.locator(':is(.chat-hook-outcome-warning, .chat-hook-outcome-blocked) > .chat-used-context-label [aria-expanded="true"]')).toHaveCount(scenario === 'HookWarningsExpanded' ? 4 : 0);
			await expect(page.locator('.chat-working-progress')).toHaveCount(scenario === 'CompletedHookWarnings' ? 0 : 1);

			for (const fontSize of [10, 13, 20]) {
				await page.locator('.interactive-session').evaluate((element, size) => {
					element.style.fontSize = `${size}px`;
				}, fontSize);

				const rows = await measureActivityRows(page);
				expect({
					rowCount: rows.length,
					misaligned: rows.filter(row => Math.abs(row.iconOffset) > 0.1 || Math.abs(row.labelOffset) > 0.1 || Math.abs(row.textGutter - 24) > 0.1),
					wrapped: scenario === 'HookWarningsNarrow' ? rows.some(row => row.wrapped) : true,
				}, `Activity alignment at chat.fontSize=${fontSize}`).toEqual({
					rowCount: 6,
					misaligned: [],
					wrapped: true,
				});
			}
		});
	}
}

test('hook details remain keyboard accessible without moving the header', async ({ page }) => {
	await openFixture(page, 'chat/widget/chatWidget/PersistentProgress/ToolChains/HookWarnings/Light', '.chat-tool-chain');
	const hook = page.getByRole('button', { name: 'Warning from Pre-Tool Use hook', exact: true });
	const before = await measureActivityRows(page);

	await hook.press('Enter');
	await expect(hook).toHaveAttribute('aria-expanded', 'true');
	await expect(page.getByText('Check the command before running it.', { exact: true })).toBeVisible();
	expect(await measureActivityRows(page)).toEqual(before);

	await hook.press('Space');
	await expect(hook).toHaveAttribute('aria-expanded', 'false');
	await expect(page.getByText('Check the command before running it.', { exact: true })).toBeHidden();
});
