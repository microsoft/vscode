/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as http from 'http';
import * as path from 'path';
import * as vscode from 'vscode';
import { window, workspace } from 'vscode';
import { assertNoRpc, closeAllEditors, poll } from '../utils';

/**
 * We only care about target-lifecycle and browser-level events.
 */
const CAPTURED_DOMAINS = ['Browser', 'Target'];

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('vscode API - browser CDP', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	// #region Helpers

	type CdpLog = { direction: 'send' | 'recv' | 'resp'; method?: string; params?: any; result?: any; sessionId?: string };

	/**
	 * Creates a CDP harness that records all Browser.* / Target.* traffic.
	 */
	function createHarness(session: vscode.BrowserCDPSession) {
		const log: CdpLog[] = [];
		let nextId = 1;
		const pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; method: string }>();

		session.onDidReceiveMessage((msg: any) => {
			// Record events (no id) whose method is in a captured domain
			if (!msg.id && msg.method) {
				const domain = msg.method.split('.')[0];
				if (CAPTURED_DOMAINS.includes(domain)) {
					log.push({ direction: 'recv', method: msg.method, params: msg.params, sessionId: msg.sessionId });
				}
			}
			// Resolve pending requests
			if (msg.id && pending.has(msg.id)) {
				const entry = pending.get(msg.id)!;
				pending.delete(msg.id);
				if (msg.error) {
					entry.reject(new Error(`CDP error ${msg.error.code}: ${msg.error.message}`));
				} else {
					const domain = entry.method.split('.')[0];
					if (CAPTURED_DOMAINS.includes(domain)) {
						log.push({ direction: 'resp', method: entry.method, result: msg.result });
					}
					entry.resolve(msg.result);
				}
			}
		});

		async function cdpSend(method: string, params: object = {}, sessionId?: string): Promise<any> {
			const id = nextId++;
			// Record the outgoing command
			const domain = method.split('.')[0];
			if (CAPTURED_DOMAINS.includes(domain)) {
				log.push({ direction: 'send', method, params: Object.keys(params).length ? params : undefined, sessionId });
			}

			const response = new Promise<any>((resolve, reject) => {
				pending.set(id, { resolve, reject, method });
			});
			await session.sendMessage({ id, method, params, sessionId });
			return response;
		}

		function waitForEvent(predicate: (msg: any) => boolean, timeoutMs = 15_000): Promise<any> {
			return new Promise<any>((resolve, reject) => {
				const timeout = setTimeout(() => {
					disposable.dispose();
					reject(new Error('Timed out waiting for CDP event'));
				}, timeoutMs);
				const disposable = session.onDidReceiveMessage((msg: any) => {
					if (predicate(msg)) {
						clearTimeout(timeout);
						disposable.dispose();
						resolve(msg);
					}
				});
			});
		}

		return { log, cdpSend, waitForEvent };
	}

	async function withBrowserPage(run: (tab: vscode.BrowserTab, sessionId: string, harness: ReturnType<typeof createHarness>) => Promise<void>): Promise<void> {
		// Attach the model and CDP before navigating so initial subscription timing is not part of the fixture.
		const tab = await window.openBrowserTab('');
		const session = await tab.startCDPSession();
		try {
			const harness = createHarness(session);
			const browser: { sessionId: string } = await harness.cdpSend('Target.attachToBrowserTarget');
			const targets: { targetInfos: { targetId: string; type: string }[] } = await harness.cdpSend('Target.getTargets', {}, browser.sessionId);
			const target = targets.targetInfos.find(target => target.type === 'page');
			assert.ok(target);
			const page: { sessionId: string } = await harness.cdpSend('Target.attachToTarget', { targetId: target.targetId, flatten: true }, browser.sessionId);
			await run(tab, page.sessionId, harness);
		} finally {
			await session.close();
		}
	}

	async function withHttpServer(listener: http.RequestListener, run: (port: number) => Promise<void>): Promise<void> {
		const server = http.createServer(listener);
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject);
			server.listen(0, '127.0.0.1', () => {
				server.off('error', reject);
				resolve();
			});
		});
		try {
			const address = server.address();
			assert.ok(address && typeof address !== 'string');
			await run(address.port);
		} finally {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
		}
	}

	function createFavicon(color: string): string {
		return 'data:image/svg+xml;base64,' + Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${color}"/></svg>`).toString('base64');
	}

	async function waitForBrowserIcon(tab: vscode.BrowserTab, url: string, icon: string): Promise<void> {
		await poll(
			async () => ({ url: tab.url, icon: tab.icon instanceof vscode.Uri ? tab.icon.toString(true) : tab.icon instanceof vscode.ThemeIcon ? tab.icon.id : undefined }),
			state => state.url === url && state.icon === icon,
			`Browser favicon for ${url} should be ${icon}`,
		);
	}

	/**
	 * Normalize a log for snapshot comparison. Replaces volatile IDs with
	 * stable placeholders and strips file-system-specific paths.
	 */
	function normalizeLog(log: CdpLog[], workspaceRoot: string): CdpLog[] {
		const targetIds: { [original: string]: string } = {};
		const idCounters: { [domain: string]: number } = {};

		function replaceId(domain: string, id: string): string {
			const key = `${domain}-${id}`;
			if (!targetIds[key]) {
				if (!idCounters[domain]) {
					idCounters[domain] = 0;
				}
				targetIds[key] = `<${domain}-${idCounters[domain]++}>`;
			}
			return targetIds[key];
		}

		// Deep-clone and normalize
		const normalized = JSON.parse(JSON.stringify(log));

		function normalizeValue(obj: any): any {
			if (obj === null || obj === undefined) {
				return obj;
			}
			if (typeof obj === 'string') {
				// Replace file:// URIs with <omitted>/basename (must run before workspace root replacement)
				let result = obj.replace(/file:\/\/\/[^\s"')}\]]+/g, (match) => {
					const basename = decodeURIComponent(match.split('/').pop() || match);
					return `<omitted>/${basename}`;
				});
				// Replace workspace root in remaining paths (handles both raw and URI-encoded forms)
				const normalizedRoot = workspaceRoot.replace(/\\/g, '/');
				const encodedRoot = encodeURI(normalizedRoot).replace(/%5C/gi, '/');
				result = result.split(encodedRoot).join('<workspace>');
				result = result.split(normalizedRoot).join('<workspace>');
				result = result.split(workspaceRoot).join('<workspace>');
				return result;
			}
			if (Array.isArray(obj)) {
				return obj.map(normalizeValue);
			}
			if (typeof obj === 'object') {
				const out: any = {};
				for (const [key, value] of Object.entries(obj)) {
					if (key === 'targetId' || key === 'openerId') {
						out[key] = replaceId('target', value as string);
					} else if (key === 'sessionId') {
						out[key] = replaceId('session', value as string);
					} else if (key === 'browserContextId') {
						out[key] = replaceId('context', value as string);
					} else if (key === 'vscodeBrowserViewId') {
						out[key] = replaceId('browser-view', value as string);
					} else if (key === 'title' && obj['type'] === 'browser') {
						out[key] = '<browser-title>';
					} else if ((key === 'title' || key === 'url') && (value === '' || value === 'about:blank')) {
						// On Linux, '' can show up instead of 'about:blank'. So normalize both to '<blank>'.
						out[key] = '<blank>';
					} else if (key === 'ts') {
						// Skip timestamps
						continue;
					} else {
						out[key] = normalizeValue(value);
					}
				}
				return out;
			}
			return obj;
		}

		for (const entry of normalized) {
			if (entry.sessionId) {
				entry.sessionId = replaceId('session', entry.sessionId);
			}
			if (entry.params) {
				entry.params = normalizeValue(entry.params);
			}
			if (entry.result) {
				entry.result = normalizeValue(entry.result);
			}
		}

		return normalized;
	}

	// #endregion

	(vscode.env.remoteName ? test.skip : test)('favicons follow native document navigation and redirect history', async function () {
		this.timeout(30_000);
		const red = createFavicon('red');
		const blue = createFavicon('blue');
		const ignoredIcon = createFavicon('green');
		let sharedIconUrl = '';
		await withHttpServer((request, response) => {
			const url = new URL(request.url ?? '/', 'http://localhost');
			if (url.pathname === '/redirect') {
				response.writeHead(302, { Location: url.searchParams.get('to')! });
				response.end();
			} else if (url.pathname === '/favicon.ico') {
				response.writeHead(404);
				response.end();
			} else if (url.pathname === '/shared.svg') {
				response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
				response.end(Buffer.from(blue.slice(blue.indexOf(',') + 1), 'base64'));
			} else {
				const icon = url.pathname === '/first' || url.pathname === '/same-icon' ? red : url.pathname === '/second' ? blue : url.pathname === '/shared-icon' ? sharedIconUrl : undefined;
				const ignoredLinks = url.pathname === '/shared-icon'
					? `<link rel="shortcut&#160;icon" href="${ignoredIcon}"><link rel="icon" media="not all" href="${ignoredIcon}">`
					: '';
				response.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
				response.end(`<!doctype html><html><head><title>${url.pathname}</title>${icon ? `<link rel="SHORTCUT ICON" media="all" href="${icon}">` : ''}${ignoredLinks}</head><body>${url.pathname}</body></html>`);
			}
		}, async port => {
			sharedIconUrl = `http://127.0.0.1:${port}/shared.svg`;
			const firstUrl = `http://127.0.0.1:${port}/first`;
			const secondUrl = `http://localhost:${port}/second`;
			await withBrowserPage(async (tab, sessionId, { cdpSend, waitForEvent }) => {
				const waitForIcon = (url: string, icon: string) => waitForBrowserIcon(tab, url, icon);
				await cdpSend('Page.navigate', { url: firstUrl }, sessionId);
				await waitForIcon(firstUrl, red);
				await cdpSend('Page.navigate', { url: secondUrl }, sessionId);
				await waitForIcon(secondUrl, blue);
				const history: { currentIndex: number; entries: { id: number }[] } = await cdpSend('Page.getNavigationHistory', {}, sessionId);
				await cdpSend('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id }, sessionId);
				await waitForIcon(firstUrl, red);
				await cdpSend('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex].id }, sessionId);
				await waitForIcon(secondUrl, blue);
				await cdpSend('Page.navigateToHistoryEntry', { entryId: history.entries[history.currentIndex - 1].id }, sessionId);
				await waitForIcon(firstUrl, red);

				await cdpSend('Page.enable', {}, sessionId);
				const sameIconUrl = `http://localhost:${port}/same-icon`;
				const loaded = waitForEvent(message => message.method === 'Page.loadEventFired' && message.sessionId === sessionId);
				await cdpSend('Page.navigate', { url: sameIconUrl }, sessionId);
				await loaded;
				await waitForIcon(sameIconUrl, red);

				for (const host of ['127.0.0.1', 'localhost']) {
					const url = `http://${host}:${port}/shared-icon`;
					const loaded = waitForEvent(message => message.method === 'Page.loadEventFired' && message.sessionId === sessionId);
					await cdpSend('Page.navigate', { url }, sessionId);
					await loaded;
					await waitForIcon(url, blue);
				}
				const sharedHistory: typeof history = await cdpSend('Page.getNavigationHistory', {}, sessionId);
				await cdpSend('Page.navigateToHistoryEntry', { entryId: sharedHistory.entries[sharedHistory.currentIndex - 1].id }, sessionId);
				await waitForIcon(`http://127.0.0.1:${port}/shared-icon`, blue);
				await cdpSend('Page.navigateToHistoryEntry', { entryId: sharedHistory.entries[sharedHistory.currentIndex].id }, sessionId);
				await waitForIcon(`http://localhost:${port}/shared-icon`, blue);

				await cdpSend('Page.navigate', { url: firstUrl }, sessionId);
				await waitForIcon(firstUrl, red);
				const finalUrl = `http://127.0.0.1:${port}/iconless`;
				const intermediate = `http://localhost:${port}/redirect?to=${encodeURIComponent(finalUrl)}`;
				await cdpSend('Page.navigate', { url: `http://127.0.0.1:${port}/redirect?to=${encodeURIComponent(intermediate)}` }, sessionId);
				await waitForIcon(finalUrl, 'globe');
			});
		});
	});

	(vscode.env.remoteName ? test.skip : test)('favicons retain outgoing document updates across cancelled navigation', async function () {
		this.timeout(30_000);
		const red = createFavicon('red');
		const blue = createFavicon('blue');
		let pendingRequested = false;
		await withHttpServer((request, response) => {
			if (request.url === '/pending') {
				pendingRequested = true;
				return;
			}
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end(`<!doctype html><html><head><title>Retained page</title><link rel="icon" href="${red}"></head><body>Retained page</body></html>`);
		}, async port => {
			await withBrowserPage(async (tab, sessionId, { cdpSend, waitForEvent }) => {
				const firstUrl = `http://127.0.0.1:${port}/first`;
				await cdpSend('Page.navigate', { url: firstUrl }, sessionId);
				await waitForBrowserIcon(tab, firstUrl, red);
				const contextReady = waitForEvent(message => message.method === 'Runtime.executionContextCreated' && message.sessionId === sessionId && message.params.context.auxData?.isDefault);
				await cdpSend('Runtime.enable', {}, sessionId);
				const context: { params: { context: { uniqueId: string } } } = await contextReady;
				const target = `http://localhost:${port}/pending`;
				try {
					const source: { result: { value: string }; exceptionDetails?: object } = await cdpSend('Runtime.evaluate', {
						expression: `(() => { const source = location.href; location.href = ${JSON.stringify(target)}; setTimeout(() => document.querySelector('link').href = ${JSON.stringify(blue)}, 0); return source; })()`,
						uniqueContextId: context.params.context.uniqueId,
						returnByValue: true,
					}, sessionId);
					assert.deepStrictEqual({ url: source.result.value, exception: source.exceptionDetails }, { url: firstUrl, exception: undefined });
					await poll(async () => pendingRequested, requested => requested, 'Destination headers should still be pending');
					await waitForBrowserIcon(tab, firstUrl, blue);
				} finally {
					await cdpSend('Page.stopLoading', {}, sessionId);
				}
				await waitForBrowserIcon(tab, firstUrl, blue);
			});
		});
	});

	(vscode.env.remoteName ? test.skip : test)('favicon recovery preserves cached defaults without new CSP-blocked requests', async function () {
		this.timeout(30_000);
		const red = createFavicon('red');
		const defaultRequests: http.IncomingHttpHeaders[] = [];
		await withHttpServer((request, response) => {
			if (request.url === '/favicon.ico') {
				defaultRequests.push(request.headers);
				response.writeHead(200, { 'Content-Type': 'image/svg+xml' });
				response.end(Buffer.from(red.slice(red.indexOf(',') + 1), 'base64'));
				return;
			}
			response.writeHead(200, {
				'Content-Type': 'text/html',
				'Cache-Control': 'no-store',
				...(request.url === '/blocked' ? { 'Content-Security-Policy': 'img-src \'none\'' } : {}),
			});
			response.end('<!doctype html><html><head><title>Default favicon</title></head><body>Default favicon</body></html>');
		}, async port => {
			await withBrowserPage(async (tab, sessionId, { cdpSend, waitForEvent }) => {
				const firstUrl = `http://127.0.0.1:${port}/first`;
				await cdpSend('Page.navigate', { url: firstUrl }, sessionId);
				await waitForBrowserIcon(tab, firstUrl, red);
				await cdpSend('Page.enable', {}, sessionId);
				// Same-origin navigation keeps the cached icon; a new blocked origin must not be fetched.
				for (const [host, path, icon] of [
					['127.0.0.1', '/second', red],
					['127.0.0.1', '/blocked', red],
					['localhost', '/blocked', 'globe'],
				]) {
					const url = `http://${host}:${port}${path}`;
					const loaded = waitForEvent(message => message.method === 'Page.loadEventFired' && message.sessionId === sessionId);
					await cdpSend('Page.navigate', { url }, sessionId);
					await loaded;
					await waitForBrowserIcon(tab, url, icon);
				}
				assert.strictEqual(defaultRequests.filter(headers => headers.host === `localhost:${port}`).length, 0, 'CSP must prevent a default favicon request on the new host');
			});
		});
	});

	// Loads `file:///<workspaceFolder>/index.html`. Skipped in remote
	// workspaces: the workspace folder is a `vscode-remote://` URI so it
	// isn't added to the local `file://` trust allowlist, and the harness
	// would be rejected with 403 before the worker is ever attached.
	(vscode.env.remoteName ? test.skip : test)('CDP debugging golden scenario', async function () {
		this.timeout(30_000);

		const workspaceRoot = workspace.rootPath!;
		assert.ok(workspaceRoot, 'workspace root must be available');

		const pageUrl = vscode.Uri.file(path.join(workspaceRoot, 'index.html')).toString();

		// 1. Open a browser tab with an empty URL
		const tab = await window.openBrowserTab('');
		const session = await tab.startCDPSession();
		const { log, cdpSend, waitForEvent } = createHarness(session);

		// 2. Attach to the browser target (mirrors BrowserTargetManager.connect)
		const browserAttach = await cdpSend('Target.attachToBrowserTarget');
		assert.ok(browserAttach.sessionId, 'should get a browser session');
		const browserSessionId = browserAttach.sessionId;

		// 3. Discover targets and find the page (mirrors waitForMainTarget)
		const pageCreated = waitForEvent(
			(msg: any) => msg.method === 'Target.targetCreated'
				&& msg.params?.targetInfo?.type === 'page',
		);
		await cdpSend('Target.setDiscoverTargets', { discover: true }, browserSessionId);
		const pageTarget = (await pageCreated).params.targetInfo;

		// 4. Attach to the page target (mirrors attachToTarget in waitForMainTarget)
		const pageAttach = await cdpSend('Target.attachToTarget', {
			targetId: pageTarget.targetId,
			flatten: true,
		}, browserSessionId);
		assert.ok(pageAttach.sessionId, 'should get a page session');
		const pageSessionId = pageAttach.sessionId;

		// 5. Enable auto-attach on the page session with waitForDebuggerOnStart
		//    (mirrors BrowserTargetManager.attachedToTarget)
		await cdpSend('Target.setAutoAttach', {
			autoAttach: true,
			waitForDebuggerOnStart: true,
			flatten: true,
		}, pageSessionId);

		// 6. Set up listener for worker auto-attach before navigating
		const workerAttached = waitForEvent(
			(msg: any) =>
				msg.method === 'Target.attachedToTarget'
				&& msg.params?.targetInfo?.type === 'worker'
				&& msg.sessionId === pageSessionId,
		);

		// 7. Navigate to the test page (mirrors finishLaunch -> Page.navigate)
		await cdpSend('Page.navigate', { url: pageUrl }, pageSessionId);

		// 8. Wait for the worker to be auto-attached
		const workerEvent = await workerAttached;
		assert.strictEqual(workerEvent.params.targetInfo.type, 'worker');
		assert.strictEqual(workerEvent.params.waitingForDebugger, true);
		const workerSessionId = workerEvent.params.sessionId;

		// 9. Resume the worker (mirrors js-debug's runIfWaitingForDebugger)
		await cdpSend('Runtime.runIfWaitingForDebugger', {}, workerSessionId);

		// 10. Evaluate a script on the page that sends a message to the worker and gets the echo
		const evalResult = await cdpSend('Runtime.evaluate', {
			expression: 'sendMessage("hello from test")',
			awaitPromise: true,
			returnByValue: true,
		}, pageSessionId);
		assert.strictEqual(evalResult.result.value, 'hello from test');

		// 11. Close the page target (mirrors closeBrowser -> closeTarget)
		const detached = waitForEvent(
			(msg: any) => msg.method === 'Target.detachedFromTarget'
				&& msg.params?.sessionId === pageAttach.sessionId,
		);
		const destroyed = waitForEvent(
			(msg: any) => msg.method === 'Target.targetDestroyed'
				&& msg.params?.targetId === pageTarget.targetId,
		);

		await cdpSend('Target.closeTarget', { targetId: pageTarget.targetId }, browserSessionId);

		await detached;
		await destroyed;

		// 12. Normalize and compare to snapshot
		const actual = normalizeLog(log, workspaceRoot);

		const expected: CdpLog[] = [
			{ direction: 'send', method: 'Target.attachToBrowserTarget' },
			{ direction: 'recv', method: 'Target.attachedToTarget', params: { sessionId: '<session-0>', targetInfo: { targetId: '<target-0>', type: 'browser', title: '<browser-title>', url: '<blank>', attached: true, canAccessOpener: false }, waitingForDebugger: false } },
			{ direction: 'resp', method: 'Target.attachToBrowserTarget', result: { sessionId: '<session-0>' } },
			{ direction: 'send', method: 'Target.setDiscoverTargets', params: { discover: true }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetCreated', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>', vscodeBrowserViewId: '<browser-view-0>' } }, sessionId: '<session-0>' },
			{ direction: 'resp', method: 'Target.setDiscoverTargets', result: {} },
			{ direction: 'send', method: 'Target.attachToTarget', params: { targetId: '<target-1>', flatten: true }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>', vscodeBrowserViewId: '<browser-view-0>' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.attachedToTarget', params: { sessionId: '<session-1>', targetInfo: { attached: true, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>', vscodeBrowserViewId: '<browser-view-0>' }, waitingForDebugger: false }, sessionId: '<session-0>' },
			{ direction: 'resp', method: 'Target.attachToTarget', result: { sessionId: '<session-1>' } },
			{ direction: 'send', method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId: '<session-1>' },
			{ direction: 'resp', method: 'Target.setAutoAttach', result: {} },
			{ direction: 'recv', method: 'Target.targetCreated', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js', vscodeBrowserViewId: '<browser-view-0>' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js', vscodeBrowserViewId: '<browser-view-0>' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.attachedToTarget', params: { sessionId: '<session-2>', targetInfo: { attached: true, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js', vscodeBrowserViewId: '<browser-view-0>' }, waitingForDebugger: true }, sessionId: '<session-1>' },
			{ direction: 'send', method: 'Target.closeTarget', params: { targetId: '<target-1>' }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>', vscodeBrowserViewId: '<browser-view-0>' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.detachedFromTarget', params: { sessionId: '<session-1>', targetId: '<target-1>' }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetDestroyed', params: { targetId: '<target-1>' }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js', vscodeBrowserViewId: '<browser-view-0>' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.detachedFromTarget', params: { sessionId: '<session-2>', targetId: '<target-2>' }, sessionId: '<session-1>' },
			{ direction: 'resp', method: 'Target.closeTarget', result: { success: true } },
		];
		assert.deepStrictEqual(actual, expected);

		// Tab should have been closed
		assert.equal(window.browserTabs.length, 0);
	});
});
