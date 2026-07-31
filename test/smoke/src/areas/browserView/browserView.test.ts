/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import * as assert from 'assert';
import type { Page } from '@playwright/test';
import { Application, Logger } from '../../../../automation';
import { installAllHandlers } from '../../utils';

export function setup(logger: Logger): void {
	describe('Integrated Browser', () => {

		installAllHandlers(logger);

		const fixtureName = 'browser-smoke-bootstrap.html';
		const comment = 'Smoke-test-comment';
		const openPages = new Set<Page>();
		const requestCounts = new Map<string, number>();
		let server: http.Server;
		let baseUrl: string;
		let fixturePath: string;

		before(async function () {
			const app = this.app as Application;
			fixturePath = path.join(app.workspacePathOrFolder, fixtureName);
			fs.writeFileSync(fixturePath, '<!DOCTYPE html><html><head><title>Browser Smoke Bootstrap</title></head><body>Bootstrap</body></html>');
			server = http.createServer((request, response) => {
				const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
				const count = (requestCounts.get(requestUrl.pathname) ?? 0) + 1;
				requestCounts.set(requestUrl.pathname, count);
				response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
				response.end(pageForRoute(requestUrl.pathname, count));
			});
			await new Promise<void>((resolve, reject) => {
				server.once('error', reject);
				server.listen(0, '127.0.0.1', () => {
					server.off('error', reject);
					resolve();
				});
			});
			const address = server.address();
			if (!address || typeof address === 'string') {
				throw new Error('Integrated Browser smoke server did not expose a TCP address.');
			}
			baseUrl = `http://127.0.0.1:${address.port}`;
			await app.workbench.settingsEditor.addUserSetting('workbench.browser.experimentalUserTools.enabled', 'true');
		});

		afterEach(async () => {
			for (const page of openPages) {
				if (!page.isClosed()) {
					await page.close();
				}
			}
			openPages.clear();
		});

		after(async () => {
			fs.rmSync(fixturePath, { force: true });
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		});

		it('opens a blank tab and navigates from the address bar', async function () {
			const app = this.app as Application;
			const workbenchPage = app.code.driver.currentPage;
			const targetUrl = `${baseUrl}/address-bar`;
			const browserPage = await app.code.driver.waitForNewPage('/address-bar', async () => {
				await app.workbench.quickaccess.runCommand('workbench.action.browser.open', { keepOpen: true });
				const addressInput = workbenchPage.locator('.quick-input-widget:visible input[placeholder*="enter URL"]');
				await addressInput.waitFor();
				await addressInput.fill(targetUrl);
				await addressInput.press('Enter');
			});
			openPages.add(browserPage);

			await browserPage.locator('#address-bar-content').waitFor();
			await waitForWorkbenchUrl(workbenchPage, targetUrl);
			await waitForActiveBrowserTab(workbenchPage, 'Browser Smoke Address Bar');
		});

		it('navigates through history and exposes it in History', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/navigation/a`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;

			await browserPage.locator('#to-b').click();
			await browserPage.waitForURL(`${baseUrl}/navigation/b`);
			await waitForWorkbenchUrl(workbenchPage, `${baseUrl}/navigation/b`);
			await waitForActiveBrowserTab(workbenchPage, 'Browser Smoke B');

			await browserPage.keyboard.press(process.platform === 'darwin' ? 'Meta+[' : 'Alt+ArrowLeft');
			await browserPage.waitForURL(`${baseUrl}/navigation/a`);
			await browserPage.keyboard.press(process.platform === 'darwin' ? 'Meta+]' : 'Alt+ArrowRight');
			await browserPage.waitForURL(`${baseUrl}/navigation/b`);

			await browserPage.keyboard.press(process.platform === 'darwin' ? 'Meta+y' : 'Control+h');
			await workbenchPage.locator('.quick-input-widget:visible .quick-input-title', { hasText: 'Browser History' }).waitFor();
			const historyPicker = workbenchPage.locator('.quick-input-widget:visible');
			await historyPicker.locator('.monaco-list-row', { hasText: 'Browser Smoke A' }).first().waitFor();
			await historyPicker.locator('.monaco-list-row', { hasText: 'Browser Smoke B' }).first().waitFor();
			await workbenchPage.keyboard.press('Escape');

			const previousCount = requestCounts.get('/navigation/b');
			await browserPage.keyboard.press(process.platform === 'darwin' ? 'Meta+r' : 'Control+r');
			await browserPage.locator('#request-count', { hasText: String((previousCount ?? 0) + 1) }).waitFor();
		});

		it('finds page text and restores focus', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/find`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;

			await browserPage.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
			const findWidget = workbenchPage.locator('.browser-find-widget-wrapper .simple-find-part.visible');
			const findInput = findWidget.locator('.monaco-findInput input');
			await findInput.waitFor();
			await findInput.fill('FindSmokeToken');
			await findWidget.locator('.matchesCount', { hasText: '1 of 3' }).waitFor();
			await findInput.press('Enter');
			await findWidget.locator('.matchesCount', { hasText: '2 of 3' }).waitFor();
			await findInput.press('Escape');
			await findWidget.waitFor({ state: 'hidden' });

			await browserPage.locator('#focus-target').pressSequentially('focused');
			assert.strictEqual(await browserPage.locator('#focus-target').inputValue(), 'focused');
		});

		it('forwards workbench shortcuts but keeps editing shortcuts native', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/keys`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;
			const input = browserPage.locator('#key-input');
			const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

			await input.fill('NativeClipboardValue');
			await input.press(`${modifier}+a`);
			await input.press(`${modifier}+c`);
			await input.fill('');
			await input.press(`${modifier}+v`);
			assert.strictEqual(await input.inputValue(), 'NativeClipboardValue');

			await input.press(`${modifier}+Shift+p`);
			await workbenchPage.locator('.quick-input-widget:visible input[placeholder*="Type the name of a command"]').waitFor();
			await workbenchPage.keyboard.press('Escape');
		});

		it('prompts for and remembers a camera permission decision', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/permission`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;

			await browserPage.locator('#request-camera').click();
			const dialog = workbenchPage.locator('.monaco-dialog-box:visible');
			await dialog.locator('#monaco-dialog-message-text', { hasText: 'wants access to Camera' }).waitFor();
			await dialog.locator('.monaco-button', { hasText: 'Block' }).click();
			await browserPage.locator('#permission-result', { hasText: 'NotAllowedError:1' }).waitFor();

			await runBrowserOverflowAction(browserPage, workbenchPage, ['Site Permissions']);
			const permissionsPicker = workbenchPage.locator('.quick-input-widget:visible');
			await permissionsPicker.locator('.quick-input-title', { hasText: 'Permissions for 127.0.0.1' }).waitFor();
			await permissionsPicker.locator('.monaco-list-row', { hasText: 'Camera' }).locator('[aria-label="Blocked"]').waitFor();
			await workbenchPage.keyboard.press('Escape');

			const previousPermissionResult = await browserPage.locator('#permission-result').textContent();
			await browserPage.locator('#request-camera').click();
			await browserPage.waitForFunction(previous => document.querySelector('#permission-result')?.textContent !== previous, previousPermissionResult);
			assert.match(await browserPage.locator('#permission-result').textContent() ?? '', /^NotAllowedError:\d+$/);
			assert.strictEqual(await workbenchPage.locator('.monaco-dialog-box:visible').count(), 0);
		});

		it('preserves page state when switching editors', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/state`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;

			await browserPage.locator('#state-input').fill('Preserved state');
			await browserPage.locator('#scroll-marker').scrollIntoViewIfNeeded();
			const scrollPosition = await browserPage.evaluate(() => scrollY);
			assert.ok(scrollPosition > 0);

			await app.workbench.quickaccess.openFile(path.join(app.workspacePathOrFolder, 'app.js'));
			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke State' }).click();
			await browserPage.locator('#state-input').waitFor();
			assert.deepStrictEqual({
				value: await browserPage.locator('#state-input').inputValue(),
				scrollY: await browserPage.evaluate(() => scrollY)
			}, {
				value: 'Preserved state',
				scrollY: scrollPosition
			});
		});

		it('creates and closes a page-initiated popup tab', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/popup`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;
			const childPage = await app.code.driver.waitForNewPage('/popup-child', () => browserPage.locator('#open-popup').click());
			openPages.add(childPage);

			await childPage.locator('#popup-child-content').waitFor();
			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke Popup Child' }).waitFor();
			await childPage.close();
			openPages.delete(childPage);
			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke Popup Child' }).waitFor({ state: 'detached' });

			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke Popup Parent' }).click();
			await browserPage.locator('#parent-counter').click();
			await browserPage.locator('#parent-counter', { hasText: '1' }).waitFor();
		});

		it('can add and comment on an element in chat', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/comment`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;
			const target = browserPage.locator('#comment-target');
			await target.waitFor();

			await runBrowserOverflowAction(browserPage, workbenchPage, ['Add to Chat', 'Add Element to Chat']);
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'attached' });
			await target.click();
			await app.workbench.chat.waitForChatView();
			await workbenchPage.locator('div[id="workbench.panel.chat"] .chat-attached-context-attachment', { hasText: 'button#comment-target' }).waitFor();

			await target.click();
			await browserPage.keyboard.press(process.platform === 'darwin' ? 'Meta+Alt+C' : 'Control+Alt+C');
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'attached' });
			await target.click();

			await browserPage.waitForFunction(() => document.activeElement?.hasAttribute('data-vscode-pick-host'));
			await browserPage.keyboard.type(comment);
			await browserPage.keyboard.press('Enter');

			await app.workbench.chat.waitForChatView();
			await app.workbench.chat.waitForInputText('@button#comment-target');
			await app.workbench.chat.waitForInputText(comment);

			await browserPage.keyboard.press('Escape');
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'attached' });
			const chatInput = workbenchPage.locator('div[id="workbench.panel.chat"] .interactive-input-part .monaco-editor[role="code"]');
			await chatInput.click();
			await workbenchPage.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
			await workbenchPage.keyboard.press('Backspace');
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'detached' });
		});

		it('sends a full-page screenshot to chat', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/screenshot`, openPages, fixturePath);
			const workbenchPage = app.code.driver.currentPage;

			await runBrowserOverflowAction(browserPage, workbenchPage, ['Add to Chat', 'Add Full Page Screenshot to Chat (Experimental)']);
			await app.workbench.chat.waitForChatView();
			const attachment = workbenchPage.locator('div[id="workbench.panel.chat"] .chat-attached-context-attachment.image-attachment', { hasText: 'Browser Full Page Screenshot' });
			await attachment.waitFor();
			const image = attachment.locator('img.chat-attached-context-pill-image');
			await image.waitFor();
			assert.deepStrictEqual(await image.evaluate(element => ({
				hasPixels: (element as HTMLImageElement).naturalWidth > 0 && (element as HTMLImageElement).naturalHeight > 0,
				hasSource: (element as HTMLImageElement).src.length > 0
			})), {
				hasPixels: true,
				hasSource: true
			});
		});

		it('restores a browser editor across application restart', async function () {
			const app = this.app as Application;
			const restoreUrl = `${baseUrl}/restore`;
			await openBrowserPage(app, restoreUrl, openPages, fixturePath);

			await app.restart();
			openPages.clear();
			const restoredPage = await app.code.driver.waitForPage('/restore', 30_000);
			openPages.add(restoredPage);
			await restoredPage.locator('#restore-content').waitFor();
			await waitForActiveBrowserTab(app.code.driver.currentPage, 'Browser Smoke Restore');
			await waitForWorkbenchUrl(app.code.driver.currentPage, restoreUrl);
			await restoredPage.locator('#restore-counter').click();
			await restoredPage.locator('#restore-counter', { hasText: '1' }).waitFor();
		});
	});
}

async function openBrowserPage(app: Application, url: string, openPages: Set<Page>, fixturePath: string): Promise<Page> {
	await app.workbench.quickaccess.openFile(fixturePath);
	const browserPage = await app.code.driver.waitForNewPage(
		path.basename(fixturePath),
		() => app.workbench.quickaccess.runCommand('workbench.action.browser.openFile')
	);
	openPages.add(browserPage);
	await browserPage.goto(url);
	await browserPage.waitForLoadState('domcontentloaded');
	return browserPage;
}

async function waitForWorkbenchUrl(workbenchPage: Page, url: string): Promise<void> {
	await workbenchPage.locator('.browser-root .browser-url-display', { hasText: url }).waitFor();
}

async function waitForActiveBrowserTab(workbenchPage: Page, title: string): Promise<void> {
	await workbenchPage.locator('.tab.active', { hasText: title }).waitFor();
}

async function runBrowserOverflowAction(browserPage: Page, workbenchPage: Page, labels: readonly string[]): Promise<void> {
	await browserPage.locator('body').click({ position: { x: 1, y: 1 } });
	let index = 0;
	if (labels[0] === 'Add to Chat') {
		await workbenchPage.locator('.browser-actions-toolbar .action-label[aria-label="Add to Chat"]').click();
		index++;
	} else {
		await workbenchPage.locator('.browser-actions-toolbar .action-label[aria-label^="More Actions"]').click();
	}
	await workbenchPage.waitForTimeout(150);
	for (; index < labels.length; index++) {
		const item = workbenchPage.locator(`.monaco-menu-container:visible .action-label[aria-label="${labels[index]}"]`).last().locator('..');
		await item.waitFor();
		if (index < labels.length - 1) {
			await item.hover();
			await workbenchPage.waitForTimeout(150);
		} else {
			await item.click();
		}
	}
}

function pageForRoute(route: string, requestCount: number): string {
	switch (route) {
		case '/address-bar':
			return html('Browser Smoke Address Bar', '<div id="address-bar-content">Address bar navigation</div>');
		case '/navigation/a':
			return html('Browser Smoke A', '<a id="to-b" href="/navigation/b">Go to B</a>');
		case '/navigation/b':
			return html('Browser Smoke B', `<div id="request-count">${requestCount}</div>`);
		case '/find':
			return html('Browser Smoke Find', '<p>FindSmokeToken one</p><p>FindSmokeToken two</p><p>FindSmokeToken three</p><input id="focus-target">');
		case '/keys':
			return html('Browser Smoke Keys', '<input id="key-input">');
		case '/permission':
			return html('Browser Smoke Permission', `<button id="request-camera">Request camera</button><div id="permission-result"></div><script>
				let attempts = 0;
				document.querySelector('#request-camera').addEventListener('click', async () => {
					attempts++;
					try {
						const stream = await navigator.mediaDevices.getUserMedia({ video: true });
						document.querySelector('#permission-result').textContent = 'Allowed:' + attempts;
						stream.getTracks().forEach(track => track.stop());
					} catch (error) {
						document.querySelector('#permission-result').textContent = error.name + ':' + attempts;
					}
				});
			</script>`);
		case '/state':
			return html('Browser Smoke State', '<input id="state-input"><div style="height: 1800px"></div><div id="scroll-marker">Scroll marker</div>');
		case '/popup':
			return html('Browser Smoke Popup Parent', '<a id="open-popup" target="_blank" href="/popup-child">Open child</a><button id="parent-counter" onclick="this.textContent = String(Number(this.textContent) + 1)">0</button>');
		case '/popup-child':
			return html('Browser Smoke Popup Child', '<div id="popup-child-content">Popup child</div>');
		case '/comment':
			return html('Browser Smoke Comment', '<button id="comment-target">Comment target</button>');
		case '/screenshot':
			return html('Browser Smoke Screenshot', '<div id="screenshot-top">Top</div><div style="height: 2400px"></div><div id="screenshot-bottom">Bottom</div>');
		case '/restore':
			return html('Browser Smoke Restore', '<div id="restore-content">Restored content</div><button id="restore-counter" onclick="this.textContent = String(Number(this.textContent) + 1)">0</button>');
		default:
			return html('Browser Smoke Not Found', 'Not found');
	}
}

function html(title: string, body: string): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}
