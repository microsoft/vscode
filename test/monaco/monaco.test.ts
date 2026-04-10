/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as playwright from '@playwright/test';
import { assert } from 'chai';
import { injectAxe } from 'axe-playwright';

const PORT = 8563;
const TIMEOUT = 20 * 1000;

const APP = `http://127.0.0.1:${PORT}/dist/core.html`;

let browser: playwright.Browser;
let page: playwright.Page;

type BrowserType = 'chromium' | 'firefox' | 'webkit';

const browserType: BrowserType = process.env.BROWSER as BrowserType || 'chromium';

before(async function () {
	this.timeout(TIMEOUT);
	console.log(`Starting browser: ${browserType}`);
	browser = await playwright[browserType].launch({
		headless: process.argv.includes('--headless'),
	});
});

after(async function () {
	this.timeout(TIMEOUT);
	await browser.close();
});

const pageErrors: any[] = [];
beforeEach(async function () {
	this.timeout(TIMEOUT);
	page = await browser.newPage({
		viewport: {
			width: 800,
			height: 600
		}
	});

	pageErrors.length = 0;
	page.on('pageerror', (e) => {
		console.log(e);
		pageErrors.push(e);
	});
	page.on('pageerror', (e) => {
		console.log(e);
		pageErrors.push(e);
	});
});

afterEach(async () => {
	await page.close();
	for (const e of pageErrors) {
		throw e;
	}
});

describe('API Integration Tests', function (): void {
	this.timeout(TIMEOUT);

	beforeEach(async () => {
		await page.goto(APP);
	});

	it('`monaco` is not exposed as global', async function (): Promise<any> {
		assert.strictEqual(await page.evaluate(`typeof monaco`), 'undefined');
	});

	it('Focus and Type', async function (): Promise<any> {
		await page.evaluate(`
		(function () {
			instance.focus();
			instance.trigger('keyboard', 'cursorHome');
			instance.trigger('keyboard', 'type', {
				text: 'a'
			});
		})()
		`);
		assert.strictEqual(await page.evaluate(`instance.getModel().getLineContent(1)`), 'afrom banana import *');
	});

	it('Type and Undo', async function (): Promise<any> {
		await page.evaluate(`
		(function () {
			instance.focus();
			instance.trigger('keyboard', 'cursorHome');
			instance.trigger('keyboard', 'type', {
				text: 'a'
			});
			instance.getModel().undo();
		})()
		`);
		assert.strictEqual(await page.evaluate(`instance.getModel().getLineContent(1)`), 'from banana import *');
	});

	it('Multi Cursor', async function (): Promise<any> {
		await page.evaluate(`
		(function () {
			instance.focus();
			instance.trigger('keyboard', 'editor.action.insertCursorBelow');
			instance.trigger('keyboard', 'editor.action.insertCursorBelow');
			instance.trigger('keyboard', 'editor.action.insertCursorBelow');
			instance.trigger('keyboard', 'editor.action.insertCursorBelow');
			instance.trigger('keyboard', 'editor.action.insertCursorBelow');
			instance.trigger('keyboard', 'type', {
				text: '# '
			});
			instance.focus();
		})()
		`);

		await page.waitForTimeout(1000);

		assert.deepStrictEqual(await page.evaluate(`
			[
				instance.getModel().getLineContent(1),
				instance.getModel().getLineContent(2),
				instance.getModel().getLineContent(3),
				instance.getModel().getLineContent(4),
				instance.getModel().getLineContent(5),
				instance.getModel().getLineContent(6),
				instance.getModel().getLineContent(7),
			]
		`), [
			'# from banana import *',
			'# ',
			'# class Monkey:',
			'# 	# Bananas the monkey can eat.',
			'# 	capacity = 10',
			'# 	def eat(self, N):',
			'\t\t\'\'\'Make the monkey eat N bananas!\'\'\''
		]);
	});
	describe('Accessibility', function (): void {
		beforeEach(async () => {
			await page.goto(APP);
			await injectAxe(page);
			await page.evaluate(`
			(function () {
				instance.focus();
				instance.trigger('keyboard', 'cursorHome');
				instance.trigger('keyboard', 'type', {
					text: 'a'
				});
			})()
			`);
		});

		it('Editor should not have critical accessibility violations', async () => {
			let violationCount = 0;
			const checkedElements = new Set<string>();

			// Run axe and get all results (passes and violations)
			const axeResults = await page.evaluate(() => {
				return window.axe.run(document, {
					runOnly: {
						type: 'tag',
						values: [
							'wcag2a',
							'wcag2aa',
							'wcag21a',
							'wcag21aa',
							'best-practice'
						]
					}
				});
			});

			axeResults.violations.forEach((v: any) => {
				const isCritical = v.impact === 'critical';
				const emoji = isCritical ? '❌' : undefined;
				v.nodes.forEach((node: any) => {
					const selector = node.target?.join(' ');
					if (selector && emoji) {
						checkedElements.add(selector);
						console.log(`${emoji} FAIL: ${selector} - ${v.id} - ${v.description}`);
					}
				});
				violationCount += isCritical ? 1 : 0;
			});

			axeResults.passes.forEach((pass: any) => {
				pass.nodes.forEach((node: any) => {
					const selector = node.target?.join(' ');
					if (selector && !checkedElements.has(selector)) {
						checkedElements.add(selector);
					}
				});
			});

			playwright.expect(violationCount).toBe(0);
		});

		it('Editor should not have color contrast accessibility violations', async () => {
			let violationCount = 0;
			const checkedElements = new Set<string>();

			const axeResults = await page.evaluate(() => {
				return window.axe.run(document, {
					runOnly: {
						type: 'rule',
						values: ['color-contrast']
					}
				});
			});

			axeResults.violations.forEach((v: any) => {
				const isCritical = v.impact === 'critical';
				const emoji = isCritical ? '❌' : undefined;
				v.nodes.forEach((node: any) => {
					const selector = node.target?.join(' ');
					if (selector && emoji) {
						checkedElements.add(selector);
						console.log(`${emoji} FAIL: ${selector} - ${v.id} - ${v.description}`);
					}
				});
				violationCount += 1;
			});

			axeResults.passes.forEach((pass: any) => {
				pass.nodes.forEach((node: any) => {
					const selector = node.target?.join(' ');
					if (selector && !checkedElements.has(selector)) {
						checkedElements.add(selector);
					}
				});
			});

			playwright.expect(violationCount).toBe(0);
		});
		it('Monaco editor container should have an ARIA role', async () => {
			const role = await page.evaluate(() => {
				const container = document.querySelector('.monaco-editor');
				return container?.getAttribute('role');
			});
			assert.isDefined(role, 'Monaco editor container should have a role attribute');
		});

		it('Monaco editor should have an ARIA label', async () => {
			const ariaLabel = await page.evaluate(() => {
				const container = document.querySelector('.monaco-editor');
				return container?.getAttribute('aria-label');
			});
			assert.isDefined(ariaLabel, 'Monaco editor container should have an aria-label attribute');
		});

		it('All toolbar buttons should have accessible names', async () => {
			const buttonsWithoutLabel = await page.evaluate(() => {
				return Array.from(document.querySelectorAll('button')).filter(btn => {
					const label = btn.getAttribute('aria-label') || btn.textContent?.trim();
					return !label;
				}).map(btn => btn.outerHTML);
			});
			assert.deepEqual(buttonsWithoutLabel, [], 'All toolbar buttons should have accessible names');
		});
	});
});
