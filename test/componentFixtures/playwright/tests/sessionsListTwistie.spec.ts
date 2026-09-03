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
