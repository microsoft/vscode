/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect, test } from '@playwright/test';
import { openFixture } from './utils.js';

test('keeps session hover actions within a narrow row', async ({ page }) => {
	await openFixture(page, 'sessions/sessionsList/SessionsList_NarrowHoverActions/Dark', '.session-item');

	const sessionRow = page.locator('.monaco-list-row').filter({ has: page.locator('.session-item') }).first();
	await sessionRow.hover();
	await expect(sessionRow.locator('.session-title-toolbar')).toBeVisible();

	const rowBox = await sessionRow.boundingBox();
	const actionBoxes = await sessionRow.locator('.session-title-toolbar .action-item').evaluateAll(items => items.map(item => {
		const { left, right } = item.getBoundingClientRect();
		return { left, right };
	}));
	const chatItem = page.locator('.session-chat-item').first();
	const chatRowBox = await chatItem.locator('..').boundingBox();
	const chatItemBox = await chatItem.boundingBox();
	expect(rowBox).not.toBeNull();
	expect(chatRowBox).not.toBeNull();
	expect(chatItemBox).not.toBeNull();
	expect({
		left: actionBoxes.every(action => action.left >= rowBox!.x),
		right: actionBoxes.every(action => action.right <= rowBox!.x + rowBox!.width),
		actions: actionBoxes.length,
		chatWithinRow: chatItemBox!.x >= chatRowBox!.x && chatItemBox!.x + chatItemBox!.width <= chatRowBox!.x + chatRowBox!.width,
	}).toEqual({
		left: true,
		right: true,
		actions: 2,
		chatWithinRow: true,
	});
});
