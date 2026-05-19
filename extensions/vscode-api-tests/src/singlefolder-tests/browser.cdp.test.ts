/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { window, workspace } from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

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

	test('CDP debugging golden scenario', async function () {
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
			{ direction: 'recv', method: 'Target.targetCreated', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>' } }, sessionId: '<session-0>' },
			{ direction: 'resp', method: 'Target.setDiscoverTargets', result: {} },
			{ direction: 'send', method: 'Target.attachToTarget', params: { targetId: '<target-1>', flatten: true }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.attachedToTarget', params: { sessionId: '<session-1>', targetInfo: { attached: true, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>' }, waitingForDebugger: false }, sessionId: '<session-0>' },
			{ direction: 'resp', method: 'Target.attachToTarget', result: { sessionId: '<session-1>' } },
			{ direction: 'send', method: 'Target.setAutoAttach', params: { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId: '<session-1>' },
			{ direction: 'resp', method: 'Target.setAutoAttach', result: {} },
			{ direction: 'recv', method: 'Target.targetCreated', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.attachedToTarget', params: { sessionId: '<session-2>', targetInfo: { attached: true, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js' }, waitingForDebugger: true }, sessionId: '<session-1>' },
			{ direction: 'send', method: 'Target.closeTarget', params: { targetId: '<target-1>' }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-1>', title: '<blank>', type: 'page', url: '<blank>' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.detachedFromTarget', params: { sessionId: '<session-1>', targetId: '<target-1>' }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetDestroyed', params: { targetId: '<target-1>' }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.targetInfoChanged', params: { targetInfo: { attached: false, browserContextId: '<context-0>', canAccessOpener: false, targetId: '<target-2>', title: '<omitted>/worker.js', type: 'worker', url: '<omitted>/worker.js' } }, sessionId: '<session-0>' },
			{ direction: 'recv', method: 'Target.detachedFromTarget', params: { sessionId: '<session-2>', targetId: '<target-2>' }, sessionId: '<session-1>' },
			{ direction: 'resp', method: 'Target.closeTarget', result: { success: true } },
		];
		assert.deepStrictEqual(actual, expected);

		// Tab should have been closed
		assert.equal(window.browserTabs.length, 0);
	});
});
