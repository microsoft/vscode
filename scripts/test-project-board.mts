/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'node:assert/strict';
import { chromium, expect, type CDPSession, type Page } from '@playwright/test';
import type { IWindowDriver } from '../src/vs/workbench/services/driver/common/driver.js';

const [endpoint, resource, boardId] = process.argv.slice(2);
assert.ok(endpoint && resource, 'Usage: node scripts/test-project-board.mts <CDP endpoint> <dedicated test chat URI> [board ID]');
const address = new URL(endpoint);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(address.hostname), 'Use a local, isolated OSS instance');

// Default CDP attachment makes background editors report focus and misroutes editing commands.
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
const context = browser.contexts()[0];
const sessions = new Map<Page, Promise<CDPSession>>();
const prepare = (page: Page) => {
	if (!sessions.has(page)) {
		sessions.set(page, context.newCDPSession(page).then(async session => {
			await session.send('Emulation.setFocusEmulationEnabled', { enabled: false });
			return session;
		}));
	}
	return sessions.get(page)!;
};
const inputText = (page: Page | undefined) => {
	assert.ok(page);
	return page.locator('.interactive-input-part .view-lines .view-line').evaluateAll(elements => elements.map(element => element.textContent).join('').replace(/\u00a0/g, ' '));
};
let board: Page | undefined;
let chat: Page | undefined;
let initialPages: Set<Page> | undefined;
let scrollPosition: { top: number; left: number } | undefined;
try {
	const protocol = await browser.newBrowserCDPSession();
	const targets = (await protocol.send('Target.getTargets')).targetInfos.filter(target => target.type === 'page');
	await expect.poll(() => context.pages().length).toBe(targets.length);
	initialPages = new Set(context.pages());
	await Promise.all(context.pages().map(prepare));
	const boardSelector = boardId
		? `.project-board-scrollable > .project-board[data-board-id=${JSON.stringify(boardId)}]`
		: '.project-board-scrollable';
	for (const page of context.pages()) {
		if (await page.locator(boardSelector).count()) {
			assert.equal(board, undefined, 'Pass a board ID when multiple board windows are open');
			board = page;
		}
	}
	assert.ok(board, 'Open the project board before running this gate');
	const boardPage = board;
	const owner = context.pages().find(page => /sessions(-dev)?\.html/.test(page.url()));
	assert.ok(owner);
	const hasExclusiveFocus = async (target: Page) => {
		for (const page of context.pages()) {
			if (await page.evaluate(() => document.hasFocus()) !== (page === target)) {
				return false;
			}
		}
		return true;
	};
	const focus = async (target: Page) => {
		const ids = await Promise.all([...context.pages().filter(page => page !== target), target].map(page => page.evaluate(() => Reflect.get(window, 'vscodeWindowId'))));
		for (const id of ids) {
			assert.ok(typeof id === 'number');
			await owner.evaluate(async windowId => {
				const driver: IWindowDriver = Reflect.get(window, 'driver');
				if (!driver?.focusWindow) {
					throw new Error('Launch the current build with --enable-smoke-test-driver');
				}
				await driver.focusWindow(windowId);
			}, id);
		}
	};
	const ownerInput = await inputText(owner);
	const scroller = board.locator('.project-board');
	const scrollbarHost = board.locator('.project-board-scrollable.monaco-scrollable-element');
	await expect(scrollbarHost).toHaveCount(1);
	await expect(scroller).toHaveCSS('overflow', 'hidden');
	scrollPosition = await scroller.evaluate(element => ({ top: element.scrollTop, left: element.scrollLeft }));
	const dimensions = await scroller.evaluate(element => ({
		height: element.clientHeight, viewport: innerHeight, scrollHeight: element.scrollHeight,
		width: element.clientWidth, scrollWidth: element.scrollWidth,
	}));
	assert.ok(dimensions.height <= dimensions.viewport, 'The scroll viewport must fit the real window');
	assert.ok(dimensions.scrollHeight > dimensions.height, 'Expand board cells until content extends below the window before running this gate');
	await focus(board);
	const trayToggle = board.locator('[data-board-control="collapse:unassigned"]');
	await expect(trayToggle).toHaveAttribute('aria-expanded', 'true');
	await trayToggle.focus();
	await expect(trayToggle).toHaveCSS('border-top-width', '0px');
	await expect(trayToggle).toHaveCSS('outline-style', 'solid');
	await board.keyboard.press('Space');
	await expect(trayToggle).toHaveAttribute('aria-expanded', 'false');
	await board.keyboard.press('Space');
	await expect(trayToggle).toHaveAttribute('aria-expanded', 'true');
	await board.mouse.move(dimensions.width - 20, Math.min(200, dimensions.height - 20));
	await board.mouse.wheel(0, 10000);
	await expect.poll(() => scroller.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
	if (dimensions.scrollWidth > dimensions.width) {
		await board.mouse.wheel(10000, 0);
		await expect.poll(() => scroller.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
	}
	await expect.poll(async () => {
		await boardPage.mouse.wheel(0, 10000);
		return scroller.evaluate(element => {
			const lastCell = element.querySelector('.project-board-grid .project-board-card-group:last-child');
			return lastCell && lastCell.getBoundingClientRect().bottom <= element.getBoundingClientRect().bottom + 1;
		});
	}, { intervals: [25, 50], timeout: 10000, message: 'The last row must be reachable with repeated wheel input, including subpixel layout rounding' }).toBe(true);
	const slider = scrollbarHost.locator(':scope > .scrollbar.vertical > .slider');
	const sliderBounds = await slider.boundingBox();
	const hostBounds = await scrollbarHost.boundingBox();
	assert.ok(sliderBounds && hostBounds);
	await board.mouse.move(sliderBounds.x + sliderBounds.width / 2, sliderBounds.y + sliderBounds.height / 2);
	await board.mouse.down();
	try {
		await board.mouse.move(sliderBounds.x + sliderBounds.width / 2, hostBounds.y, { steps: 8 });
	} finally {
		await board.mouse.up();
	}
	await expect.poll(() => scroller.evaluate(element => element.scrollTop), { message: 'Dragging the themed thumb reaches the top' }).toBe(0);

	const card = board.locator(`[data-chat-resource=${JSON.stringify(resource)}], [data-draft-id=${JSON.stringify(resource)}]`);
	await expect(card).toHaveCount(1);
	await card.focus();
	await board.keyboard.press('Home');
	const first = await board.evaluate(() => document.activeElement?.getAttribute('data-chat-resource') ?? document.activeElement?.getAttribute('data-draft-id'));
	await board.keyboard.press('End');
	const last = await board.evaluate(() => document.activeElement?.getAttribute('data-chat-resource') ?? document.activeElement?.getAttribute('data-draft-id'));
	assert.ok(first && last && first !== last, 'Home/End must navigate distinct cards');
	await board.keyboard.press('ArrowUp');
	assert.notEqual(await board.evaluate(() => document.activeElement?.getAttribute('data-chat-resource') ?? document.activeElement?.getAttribute('data-draft-id')), last);
	for (const page of initialPages) {
		assert.equal(await page.locator(`.chat-editor-relative[data-bound-chat-resource=${JSON.stringify(resource)}]`).count(), 0, 'Close the dedicated test chat window before running');
	}
	const open = async () => {
		await card.focus();
		await boardPage.keyboard.press('Enter');
		let opened: Page | undefined;
		await expect.poll(async () => {
			for (const page of context.pages()) {
				if (await page.locator(`.chat-editor-relative[data-bound-chat-resource=${JSON.stringify(resource)}]`).count()) {
					opened = page;
					return true;
				}
			}
			return false;
		}, { timeout: 30000 }).toBe(true);
		assert.ok(opened);
		chat = opened;
		await prepare(opened);
		await focus(opened);
		const target = opened;
		await expect.poll(() => hasExclusiveFocus(target)).toBe(true);
		await opened.locator('.interactive-input-part .native-edit-context').focus();
		return opened;
	};
	chat = await open();
	await expect.poll(() => inputText(chat)).toBe('');
	await chat.keyboard.type('abc def');
	await expect.poll(() => inputText(chat)).toBe('abc def');
	await chat.keyboard.press('Backspace');
	await expect.poll(() => inputText(chat)).toBe('abc de');
	await chat.keyboard.press('Home');
	await chat.keyboard.press('Delete');
	await expect.poll(() => inputText(chat)).toBe('bc de');
	const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
	await chat.keyboard.press(`${modifier}+a`);
	await chat.keyboard.type('xyz');
	await expect.poll(() => inputText(chat)).toBe('xyz');
	await chat.keyboard.press(`${modifier}+z`);
	await expect.poll(() => inputText(chat)).toBe('bc de');
	await chat.keyboard.press(process.platform === 'darwin' ? 'Meta+Shift+z' : 'Control+y');
	await expect.poll(() => inputText(chat)).toBe('xyz');
	await chat.keyboard.press(`${modifier}+a`);
	await chat.keyboard.press('Backspace');
	await expect.poll(() => inputText(chat)).toBe('');
	assert.equal(await inputText(owner), ownerInput, 'Editing must not modify the background composer');

	await chat.keyboard.press('F1');
	let pickerHost: Page | undefined;
	await expect.poll(async () => {
		for (const page of context.pages()) {
			if (await page.locator('.quick-input-widget:visible').count()) {
				pickerHost = page;
				return true;
			}
		}
		return false;
	}).toBe(true);
	assert.ok(pickerHost);
	await pickerHost.keyboard.press('Escape');
	await expect(pickerHost.locator('.quick-input-widget:visible')).toHaveCount(0);
	assert.equal(chat.isClosed(), false, 'Escape must dismiss a popup before closing the chat');
	chat = await open();
	await chat.keyboard.type('Unsent keyboard regression draft');
	await expect.poll(() => inputText(chat)).toBe('Unsent keyboard regression draft');
	await chat.keyboard.down('Escape');
	await expect.poll(() => chat?.isClosed()).toBe(true);
	await board.keyboard.up('Escape');
	await expect.poll(() => hasExclusiveFocus(boardPage)).toBe(true);
	await expect.poll(() => card.evaluate(element => element === element.ownerDocument.activeElement)).toBe(true);
	chat = await open();
	await expect.poll(() => inputText(chat)).toBe('Unsent keyboard regression draft');
	await chat.keyboard.press(`${modifier}+a`);
	await chat.keyboard.press('Backspace');
	await expect.poll(() => inputText(chat)).toBe('');
	await chat.keyboard.down('Escape');
	await expect.poll(() => chat?.isClosed()).toBe(true);
	await board.keyboard.up('Escape');
	await expect.poll(() => hasExclusiveFocus(boardPage)).toBe(true);
	assert.equal(context.pages().length, initialPages.size, 'Verification must not leave extra windows');
	console.log('PASS: themed scrollbar thumb and wheel, bounded scrolling, real editing keys, popup priority, Enter/Escape, retained input, and window cleanup');
} finally {
	if (board && !board.isClosed()) {
		if (scrollPosition) {
			await board.locator('.project-board').evaluate((element, position) => {
				element.scrollTop = position.top;
				element.scrollLeft = position.left;
			}, scrollPosition);
		}
	}
	if (chat && !chat.isClosed() && !initialPages?.has(chat)) {
		if (await inputText(chat) === '') {
			await chat.close();
		} else {
			console.error('Verification stopped with text in its dedicated chat window; retained it for inspection.');
		}
	}
	await Promise.all(context.pages().map(prepare));
	await browser.close();
}
