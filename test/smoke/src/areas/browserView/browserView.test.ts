/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { Page } from '@playwright/test';
import { Application, ApplicationOptions, Logger } from '../../../../automation';
import { installAllHandlers, preseedChatExtensionEnablement } from '../../utils';

const browserCommandPrefix = 'workbench.action.browser';

export function setup(logger: Logger): void {
	describe('Integrated Browser', () => {

		installAllHandlers(
			logger,
			options => withFakeMediaDevice(options),
			async app => {
				await preseedChatExtensionEnablement(app.userDataPath);
				preseedSettings(app.userDataPath);
			}
		);

		const comment = 'Smoke-test-comment';
		const openPages = new Set<Page>();
		const requestCounts = new Map<string, number>();
		let server: http.Server;
		let baseUrl: string;

		before(async function () {
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
		});

		afterEach(async function () {
			const app = this.app as Application;
			const pageClosePromises = [...openPages]
				.filter(page => !page.isClosed())
				.map(page => page.waitForEvent('close'));
			await app.workbench.quickaccess.runCommand('workbench.action.closeAllEditors');
			await Promise.all(pageClosePromises);
			openPages.clear();
		});

		after(async () => {
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		});

		it('opens an HTML file in a locked browser editor', async function () {
			const app = this.app as Application;
			const htmlPath = path.join(app.workspacePathOrFolder, 'browser-editor-smoke.html');
			const htmlUrl = pathToFileURL(htmlPath).toString();
			fs.writeFileSync(htmlPath, '<!DOCTYPE html><html><head><title>HTML Browser Editor Smoke</title></head><body><main id="browser-editor-smoke">Loaded in the browser editor</main></body></html>');

			try {
				const browserPage = await app.code.driver.waitForNewPage(path.basename(htmlPath), async () => {
					await app.workbench.quickaccess.openFileQuickAccessAndWait(htmlPath, path.basename(htmlPath));
					await app.workbench.quickinput.selectQuickInputElement(0);
				});
				openPages.add(browserPage);
				await browserPage.locator('#browser-editor-smoke', { hasText: 'Loaded in the browser editor' }).waitFor();

				const urlDisplay = app.code.driver.currentPage.locator('.browser-root .browser-url-display');
				await urlDisplay.waitFor();
				assert.deepStrictEqual({
					path: normalizeFileUrl(await urlDisplay.textContent()),
					contentEditable: await urlDisplay.getAttribute('contenteditable'),
					ariaReadonly: await urlDisplay.getAttribute('aria-readonly')
				}, {
					path: normalizeFileUrl(htmlUrl),
					contentEditable: 'false',
					ariaReadonly: 'true'
				});
			} finally {
				fs.rmSync(htmlPath, { force: true });
			}
		});

		it('navigates, reloads, and exposes page history', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/navigation/a`, openPages);
			const workbenchPage = app.code.driver.currentPage;

			await browserPage.locator('#navigate').click();
			await browserPage.waitForURL(`${baseUrl}/navigation/b`);
			await waitForWorkbenchUrl(workbenchPage, `${baseUrl}/navigation/b`);
			await waitForActiveBrowserTab(workbenchPage, 'Browser Smoke B');

			await workbenchPage.locator('.browser-nav-toolbar .action-label[aria-label^="Go Back"]').click();
			await browserPage.waitForURL(`${baseUrl}/navigation/a`);
			await workbenchPage.locator('.browser-nav-toolbar .action-label[aria-label^="Go Forward"]').click();
			await browserPage.waitForURL(`${baseUrl}/navigation/b`);
			await waitForWorkbenchUrl(workbenchPage, `${baseUrl}/navigation/b`);

			await runBrowserCommand(app, browserPage, `${browserCommandPrefix}.showHistory`);
			const historyPicker = workbenchPage.locator('.quick-input-widget:visible');
			await historyPicker.locator('.quick-input-title', { hasText: 'Browser History' }).waitFor();
			await historyPicker.locator('.monaco-list-row', { hasText: 'Browser Smoke A' }).first().waitFor();
			await historyPicker.locator('.monaco-list-row', { hasText: 'Browser Smoke B' }).first().waitFor();
			await workbenchPage.keyboard.press('Escape');

			const previousCount = requestCounts.get('/navigation/b') ?? 0;
			await workbenchPage.locator('.browser-nav-toolbar .action-label[aria-label^="Reload"]').click();
			await browserPage.locator('#request-count', { hasText: String(previousCount + 1) }).waitFor();
		});

		it('integrates page find and keyboard routing with the workbench', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/keyboard`, openPages);
			const workbenchPage = app.code.driver.currentPage;
			const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';

			await browserPage.locator('body').click({ position: { x: 1, y: 1 } });
			await browserPage.keyboard.press(`${modifier}+f`);
			const findWidget = workbenchPage.locator('.browser-find-widget-wrapper .simple-find-part.visible');
			const findInput = findWidget.locator('.monaco-findInput input');
			await findInput.waitFor();
			await findInput.fill('FindSmokeToken');
			await findWidget.locator('.matchesCount', { hasText: '1 of 3' }).waitFor();
			await findInput.press('Enter');
			await findWidget.locator('.matchesCount', { hasText: '2 of 3' }).waitFor();
			await findInput.press('Escape');
			await findWidget.waitFor({ state: 'hidden' });
			const input = browserPage.locator('#key-input');
			await input.fill('NativeSelectionValue');
			await input.press(`${modifier}+a`);
			await input.pressSequentially('x');
			assert.strictEqual(await input.inputValue(), 'x');

			await input.press(`${modifier}+Shift+p`);
			await workbenchPage.locator('.quick-input-widget:visible input[placeholder*="Type the name of a command"]').waitFor();
			await workbenchPage.keyboard.press('Escape');
		});

		it('prompts for and remembers a camera permission decision', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/permission`, openPages);
			const workbenchPage = app.code.driver.currentPage;

			await browserPage.locator('#request-camera').click();
			const dialog = workbenchPage.locator('.monaco-dialog-box:visible');
			await dialog.locator('#monaco-dialog-message-text', { hasText: 'wants access to Camera' }).waitFor();
			await dialog.locator('.monaco-button', { hasText: 'Block' }).click();
			await browserPage.locator('#permission-result', { hasText: 'NotAllowedError' }).waitFor();

			await runBrowserOverflowAction(browserPage, workbenchPage, 'Site Permissions');
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

		it('adds browser context to chat', async function () {
			const app = this.app as Application;
			const browserPage = await openBrowserPage(app, `${baseUrl}/comment`, openPages);
			const workbenchPage = app.code.driver.currentPage;
			const target = browserPage.locator('#comment-target');
			const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
			await target.waitFor();

			await browserPage.keyboard.press(`${modifier}+Shift+c`);
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'attached' });
			await target.click();
			await app.workbench.chat.waitForChatView();
			await workbenchPage.locator('div[id="workbench.panel.chat"] .chat-attached-context-attachment', { hasText: 'button#comment-target' }).waitFor();

			await target.click();
			await browserPage.keyboard.press(`${modifier}+Alt+c`);
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'attached' });
			await target.click();
			await browserPage.waitForFunction(() => document.activeElement?.hasAttribute('data-vscode-pick-host'));
			await browserPage.evaluate(() => document.querySelector('#comment-keydown-count')!.textContent = '0');
			await browserPage.keyboard.type(comment);
			await browserPage.keyboard.press('Enter');
			assert.strictEqual(await browserPage.locator('#comment-keydown-count').textContent(), '0');
			await app.workbench.chat.waitForInputText('@button#comment-target');
			await app.workbench.chat.waitForInputText(comment);

			await browserPage.keyboard.press('Escape');
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'attached' });
			const chatInput = workbenchPage.locator('div[id="workbench.panel.chat"] .interactive-input-part .monaco-editor[role="code"]');
			await chatInput.click();
			await workbenchPage.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
			await workbenchPage.keyboard.press('Backspace');
			await browserPage.locator('[data-vscode-pick-host]').waitFor({ state: 'detached' });

			await browserPage.goto(`${baseUrl}/screenshot`);
			await runAddToChatMenuAction(browserPage, workbenchPage, 'Add Full Page Screenshot to Chat (Experimental)');
			const attachment = workbenchPage.locator('div[id="workbench.panel.chat"] .chat-attached-context-attachment.image-attachment', { hasText: 'Browser Full Page Screenshot' });
			const image = attachment.locator('img.chat-attached-context-pill-image');
			await image.waitFor();
			assert.strictEqual(await image.evaluate(element => {
				const image = element as HTMLImageElement;
				return image.naturalHeight > image.naturalWidth * 2;
			}), true);
		});

		it('preserves native page lifecycle across editors, popups, and restart', async function () {
			const app = this.app as Application;
			const lifecycleUrl = `${baseUrl}/lifecycle`;
			const browserPage = await openBrowserPage(app, lifecycleUrl, openPages);
			const workbenchPage = app.code.driver.currentPage;

			await browserPage.locator('#state-input').fill('Preserved state');
			await browserPage.locator('#scroll-marker').scrollIntoViewIfNeeded();
			const scrollPosition = await browserPage.evaluate(() => scrollY);
			assert.ok(scrollPosition > 0);

			await app.workbench.quickaccess.openFile(path.join(app.workspacePathOrFolder, 'app.js'));
			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke Lifecycle' }).click();
			assert.deepStrictEqual({
				value: await browserPage.locator('#state-input').inputValue(),
				scrollY: await browserPage.evaluate(() => scrollY)
			}, {
				value: 'Preserved state',
				scrollY: scrollPosition
			});

			const childPage = await app.code.driver.waitForNewPage('/popup-child', () => browserPage.locator('#open-popup').click());
			openPages.add(childPage);
			await childPage.locator('#popup-child-content').waitFor();
			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke Popup Child' }).waitFor();
			await childPage.close();
			openPages.delete(childPage);
			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke Popup Child' }).waitFor({ state: 'detached' });
			await workbenchPage.locator('.tab', { hasText: 'Browser Smoke Lifecycle' }).click();
			assert.strictEqual(await browserPage.locator('#state-input').inputValue(), 'Preserved state');

			await app.restart();
			openPages.clear();
			const restoredPage = await app.code.driver.waitForPage('/lifecycle', 30_000);
			openPages.add(restoredPage);
			await restoredPage.locator('#lifecycle-content').waitFor();
			await waitForActiveBrowserTab(app.code.driver.currentPage, 'Browser Smoke Lifecycle');
			await waitForWorkbenchUrl(app.code.driver.currentPage, lifecycleUrl);
		});
	});
}

function normalizeFileUrl(url: string | null): string | null {
	if (!url) {
		return null;
	}

	const filePath = path.normalize(fileURLToPath(url));
	return process.platform === 'win32' ? filePath.toLowerCase() : filePath;
}

/**
 * Pre-seed the settings this suite depends on before the application starts.
 *
 * `window.menuStyle` must be written to disk rather than through the settings
 * editor: `SettingsChangeRelauncher` watches it on Windows/Linux and would pop a
 * modal "restart to take effect" dialog the moment the value changes at runtime,
 * blocking the workbench. Seeding it up front means it is already in effect when
 * the window opens, so nothing changes and no prompt appears.
 *
 * The suite drives the browser toolbar overflow and "Add to Chat" menus through
 * DOM locators (`.monaco-menu-container`), which only exist for custom menus. The
 * default is quality dependent on macOS (`native` for stable, `inherit` for
 * insiders), so pinning `custom` keeps the suite deterministic across qualities.
 */
function preseedSettings(userDataDir: string | undefined): void {
	if (!userDataDir) {
		throw new Error('Cannot pre-seed Integrated Browser settings without a user data directory');
	}

	const settingsPath = path.join(userDataDir, 'User', 'settings.json');
	fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
	fs.writeFileSync(settingsPath, JSON.stringify({
		'window.menuStyle': 'custom',
		'workbench.browser.experimentalUserTools.enabled': true,
		'workbench.editorAssociations': {
			'*.html': 'workbench.editor.browser'
		},
	}, null, 2));
}

function withFakeMediaDevice(options: ApplicationOptions): ApplicationOptions {
	return {
		...options,
		extraArgs: [...(options.extraArgs ?? []), '--use-fake-device-for-media-stream']
	};
}

async function openBrowserPage(app: Application, url: string, openPages: Set<Page>): Promise<Page> {
	const workbenchPage = app.code.driver.currentPage;
	const browserPage = await app.code.driver.waitForNewPage(url, async () => {
		await app.workbench.quickaccess.runCommand('workbench.action.browser.open', { keepOpen: true });
		const addressInput = workbenchPage.locator('.quick-input-widget:visible input[placeholder*="enter URL"]');
		await addressInput.waitFor();
		await addressInput.fill(url);
		await addressInput.press('Enter');
	});
	openPages.add(browserPage);
	await browserPage.waitForLoadState('domcontentloaded');
	await waitForWorkbenchUrl(workbenchPage, url);
	return browserPage;
}

async function waitForWorkbenchUrl(workbenchPage: Page, url: string): Promise<void> {
	await workbenchPage.locator('.browser-root .browser-url-display', { hasText: url }).waitFor();
}

async function waitForActiveBrowserTab(workbenchPage: Page, title: string): Promise<void> {
	await workbenchPage.locator('.tab.active', { hasText: title }).waitFor();
}

async function runBrowserCommand(app: Application, browserPage: Page, command: string): Promise<void> {
	await browserPage.locator('body').click({ position: { x: 1, y: 1 } });
	await app.workbench.quickaccess.runCommand(command, { keepOpen: true });
}

async function runBrowserOverflowAction(browserPage: Page, workbenchPage: Page, label: string): Promise<void> {
	await browserPage.locator('body').click({ position: { x: 1, y: 1 } });
	const dropdown = workbenchPage.locator('.browser-actions-toolbar .action-label[aria-label^="More Actions"]');
	await dropdown.hover();
	await workbenchPage.waitForTimeout(500);
	await dropdown.click();
	const item = workbenchPage.locator('.monaco-menu-container:visible .action-menu-item', { hasText: label }).last();
	await item.waitFor();
	await item.hover();
	await workbenchPage.waitForTimeout(500);
	await item.click();
}

async function runAddToChatMenuAction(browserPage: Page, workbenchPage: Page, label: string): Promise<void> {
	await browserPage.locator('body').click({ position: { x: 1, y: 1 } });
	const dropdown = workbenchPage.locator('.browser-actions-toolbar .monaco-dropdown-with-default .dropdown-action-container .action-label');
	await dropdown.hover();
	await workbenchPage.waitForTimeout(500);
	await dropdown.click();
	const item = workbenchPage.locator('.monaco-menu-container:visible .action-menu-item', { hasText: label }).last();
	await item.waitFor();
	await item.hover();
	await workbenchPage.waitForTimeout(500);
	await item.click();
}

function pageForRoute(route: string, requestCount: number): string {
	switch (route) {
		case '/navigation/a':
			return html('Browser Smoke A', '<a id="navigate" href="/navigation/b">Navigate</a>');
		case '/navigation/b':
			return html('Browser Smoke B', `<div id="request-count">${requestCount}</div>`);
		case '/keyboard':
			return html('Browser Smoke Keyboard', '<p>FindSmokeToken one</p><p>FindSmokeToken two</p><p>FindSmokeToken three</p><input id="key-input">');
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
		case '/comment':
			return html('Browser Smoke Comment', `<button id="comment-target">Comment target</button>
				<output id="comment-keydown-count">0</output>
				<script>
					window.addEventListener('keydown', () => {
						const output = document.querySelector('#comment-keydown-count');
						output.textContent = String(Number(output.textContent) + 1);
					});
				</script>`);
		case '/screenshot':
			return html('Browser Smoke Screenshot', '<div id="screenshot-top">Top</div><div style="height: 2400px"></div><div id="screenshot-bottom">Bottom</div>');
		case '/lifecycle':
			return html('Browser Smoke Lifecycle', '<div id="lifecycle-content">Lifecycle content</div><input id="state-input"><a id="open-popup" target="_blank" href="/popup-child">Open child</a><div style="height: 1800px"></div><div id="scroll-marker">Scroll marker</div>');
		case '/popup-child':
			return html('Browser Smoke Popup Child', '<div id="popup-child-content">Popup child</div>');
		default:
			return html('Browser Smoke Not Found', 'Not found');
	}
}

function html(title: string, body: string): string {
	return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;
}
