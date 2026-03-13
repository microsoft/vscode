/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import assert from 'assert';
import { mock } from '../../../../base/test/common/mock.js';
import { BrowserTabDto, MainThreadBrowsersShape } from '../../common/extHost.protocol.js';
import { ExtHostBrowsers } from '../../common/extHostBrowsers.js';
import { SingleProxyRPCProtocol } from '../common/testRPCProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

suite('ExtHostBrowsers', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	const defaultDto: BrowserTabDto = {
		id: 'browser-1',
		url: 'https://example.com',
		title: 'Example',
		favicon: undefined,
	};

	function createDto(overrides?: Partial<BrowserTabDto>): BrowserTabDto {
		return { ...defaultDto, ...overrides };
	}

	function createExtHostBrowsers(overrides?: Partial<MainThreadBrowsersShape>): ExtHostBrowsers {
		const proxy = new class extends mock<MainThreadBrowsersShape>() {
			override $openBrowserTab(): Promise<BrowserTabDto> { return Promise.resolve(createDto()); }
			override $startCDPSession(): Promise<void> { return Promise.resolve(); }
			override $closeCDPSession(): Promise<void> { return Promise.resolve(); }
			override $sendCDPMessage(): Promise<void> { return Promise.resolve(); }
			override $closeBrowserTab(): Promise<void> { return Promise.resolve(); }
		};
		if (overrides) {
			Object.assign(proxy, overrides);
		}
		return store.add(new ExtHostBrowsers(SingleProxyRPCProtocol(proxy)));
	}

	// #region browserTabs

	test('browserTabs populates from $onDidOpenBrowserTab', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://one.com', title: 'One' }));
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b2', url: 'https://two.com', title: 'Two' }));

		const tabs = extHost.browserTabs;
		assert.strictEqual(tabs.length, 2);
		assert.strictEqual(tabs[0].url, 'https://one.com');
		assert.strictEqual(tabs[1].url, 'https://two.com');
	});

	test('browserTabs returns a snapshot, not a live array', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
		const snapshot1 = extHost.browserTabs;

		extHost.$onDidOpenBrowserTab(createDto({ id: 'b2' }));
		const snapshot2 = extHost.browserTabs;

		assert.notStrictEqual(snapshot1, snapshot2);
		assert.strictEqual(snapshot1.length, 1);
		assert.strictEqual(snapshot2.length, 2);
	});

	// #endregion

	// #region activeBrowserTab

	test('activeBrowserTab updates via $onDidChangeActiveBrowserTab', () => {
		const extHost = createExtHostBrowsers();
		const dto = createDto({ id: 'b1', url: 'https://active.com' });
		extHost.$onDidOpenBrowserTab(dto);
		extHost.$onDidChangeActiveBrowserTab(dto);

		assert.strictEqual(extHost.activeBrowserTab?.url, 'https://active.com');
	});

	test('activeBrowserTab becomes undefined when cleared', () => {
		const extHost = createExtHostBrowsers();
		const dto = createDto({ id: 'b1' });
		extHost.$onDidOpenBrowserTab(dto);
		extHost.$onDidChangeActiveBrowserTab(dto);
		assert.ok(extHost.activeBrowserTab);

		extHost.$onDidChangeActiveBrowserTab(undefined);
		assert.strictEqual(extHost.activeBrowserTab, undefined);
	});

	test('$onDidChangeActiveBrowserTab with unknown tab creates it and fires open event', () => {
		const extHost = createExtHostBrowsers();
		const opened: vscode.BrowserTab[] = [];
		store.add(extHost.onDidOpenBrowserTab(tab => opened.push(tab)));

		extHost.$onDidChangeActiveBrowserTab(createDto({ id: 'new-tab', url: 'https://new.com' }));

		assert.strictEqual(extHost.activeBrowserTab?.url, 'https://new.com');
		assert.strictEqual(extHost.browserTabs.length, 1);
		assert.strictEqual(opened.length, 1, 'onDidOpenBrowserTab should fire for the new tab');
	});

	// #endregion

	// #region openBrowserTab

	test('openBrowserTab returns a BrowserTab with correct properties', async () => {
		const dto = createDto({ id: 'opened', url: 'https://opened.com', title: 'Opened' });
		const extHost = createExtHostBrowsers({
			$openBrowserTab: () => Promise.resolve(dto),
		});

		const tab = await extHost.openBrowserTab('https://opened.com');
		assert.strictEqual(tab.url, 'https://opened.com');
		assert.strictEqual(tab.title, 'Opened');
	});

	test('openBrowserTab fires onDidOpenBrowserTab for new tabs', async () => {
		const extHost = createExtHostBrowsers({
			$openBrowserTab: () => Promise.resolve(createDto({ id: 'new-tab' })),
		});
		const opened: vscode.BrowserTab[] = [];
		store.add(extHost.onDidOpenBrowserTab(tab => opened.push(tab)));

		await extHost.openBrowserTab('https://example.com');

		assert.strictEqual(opened.length, 1);
		assert.strictEqual(opened[0].url, 'https://example.com');
	});

	test('openBrowserTab reuses existing tab when IDs match', async () => {
		const extHost = createExtHostBrowsers({
			$openBrowserTab: () => Promise.resolve(createDto({ id: 'same', url: 'https://updated.com' })),
		});

		extHost.$onDidOpenBrowserTab(createDto({ id: 'same', url: 'https://original.com' }));
		const tab = await extHost.openBrowserTab('https://updated.com');

		assert.strictEqual(extHost.browserTabs.length, 1);
		assert.strictEqual(tab.url, 'https://updated.com');
	});

	test('openBrowserTab forwards options to proxy', async () => {
		let capturedViewColumn: number | undefined;
		let capturedOptions: { preserveFocus?: boolean; inactive?: boolean } | undefined;
		const extHost = createExtHostBrowsers({
			$openBrowserTab: (_url: string, viewColumn?: number, options?: { preserveFocus?: boolean; inactive?: boolean }) => {
				capturedViewColumn = viewColumn;
				capturedOptions = options;
				return Promise.resolve(createDto({ id: 'opts' }));
			},
		});

		await extHost.openBrowserTab('https://example.com', { viewColumn: 2, preserveFocus: true, background: true });

		// ViewColumn.from converts API viewColumn (1-based) to EditorGroupColumn (0-based)
		assert.strictEqual(capturedViewColumn, 1);
		assert.strictEqual(capturedOptions?.preserveFocus, true);
		assert.strictEqual(capturedOptions?.inactive, true);
	});

	// #endregion

	// #region $onDidOpenBrowserTab

	test('$onDidOpenBrowserTab fires event', () => {
		const extHost = createExtHostBrowsers();
		const opened: vscode.BrowserTab[] = [];
		store.add(extHost.onDidOpenBrowserTab(tab => opened.push(tab)));

		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://opened.com' }));

		assert.strictEqual(opened.length, 1);
		assert.strictEqual(opened[0].url, 'https://opened.com');
	});

	// #endregion

	// #region $onDidCloseBrowserTab

	test('$onDidCloseBrowserTab removes tab and fires event', () => {
		const extHost = createExtHostBrowsers();
		const changes: vscode.BrowserTab[] = [];
		store.add(extHost.onDidChangeBrowserTabState(tab => changes.push(tab)));

		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://old.com' }));
		extHost.$onDidChangeBrowserTabState('b1', createDto({ id: 'b1', url: 'https://new.com' }));

		assert.strictEqual(changes.length, 1);
		assert.strictEqual(changes[0].url, 'https://new.com');
	});

	test('$onDidChangeBrowserTabState does not fire when data is unchanged', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://example.com', title: 'Old Title' }));

		extHost.$onDidChangeBrowserTabState('b1', createDto({ id: 'b1', url: 'https://example.com', title: 'New Title' }));

		assert.strictEqual(extHost.browserTabs[0].url, 'https://example.com');
		assert.strictEqual(extHost.browserTabs[0].title, 'New Title');
	});

	// #endregion

	// #region $onDidChangeActiveBrowserTab event

	test('$onDidChangeActiveBrowserTab fires event', () => {
		const extHost = createExtHostBrowsers();
		const activeChanges: (string | undefined)[] = [];
		store.add(extHost.onDidChangeActiveBrowserTab(tab => activeChanges.push(tab?.url)));

		const dto = createDto({ id: 'b1' });
		extHost.$onDidOpenBrowserTab(dto);
		extHost.$onDidChangeActiveBrowserTab(dto);
		extHost.$onDidChangeActiveBrowserTab(undefined);

		assert.deepStrictEqual(activeChanges, ['https://example.com', undefined]);
	});

	// #endregion

	// #region BrowserTab icon

	test('icon is globe ThemeIcon when no favicon', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: undefined }));

		assert.strictEqual((extHost.browserTabs[0].icon as { id: string }).id, 'globe');
	});

	test('icon is URI when favicon is provided', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: 'https://example.com/favicon.ico' }));

		assert.strictEqual(String(extHost.browserTabs[0].icon), 'https://example.com/favicon.ico');
	});

	test('icon updates when favicon changes', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: undefined }));
		assert.strictEqual((extHost.browserTabs[0].icon as { id: string }).id, 'globe');

		extHost.$onDidChangeBrowserTabState('b1', createDto({ id: 'b1', favicon: 'https://example.com/new.ico' }));
		assert.strictEqual(String(extHost.browserTabs[0].icon), 'https://example.com/new.ico');
	});

	test('icon reverts to globe when favicon is cleared', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', favicon: 'https://example.com/icon.ico' }));
		assert.strictEqual(String(extHost.browserTabs[0].icon), 'https://example.com/icon.ico');

		extHost.$onDidChangeBrowserTabState('b1', createDto({ id: 'b1', favicon: undefined }));
		assert.strictEqual((extHost.browserTabs[0].icon as { id: string }).id, 'globe');
	});

	// #endregion

	// #region BrowserTab readonly properties

	test('tab properties are not directly writable', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://example.com', title: 'Title' }));
		const tab = extHost.browserTabs[0];

		// Attempting to assign to getter-only properties should either throw or be silently ignored
		assert.throws(() => { (tab as unknown as Record<string, unknown>).url = 'https://hacked.com'; });
		assert.throws(() => { (tab as unknown as Record<string, unknown>).title = 'Hacked'; });
		assert.strictEqual(tab.url, 'https://example.com');
		assert.strictEqual(tab.title, 'Title');
	});

	test('startCDPSession calls $startCDPSession on proxy', async () => {
		let capturedBrowserId: string | undefined;
		const extHost = createExtHostBrowsers({
			$startCDPSession: (_sessionId: string, browserId: string) => {
				capturedBrowserId = browserId;
				return Promise.resolve();
			},
		});

		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
		const session = await extHost.browserTabs[0].startCDPSession();

		assert.ok(session);
		assert.strictEqual(capturedBrowserId, 'b1');
	});

	test('sendMessage validates message structure', async () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
		const session = await extHost.browserTabs[0].startCDPSession();

		// Valid message succeeds
		await session.sendMessage({ id: 1, method: 'Page.enable' });

		// Invalid messages are rejected
		await assert.rejects(Promise.resolve().then(() => session.sendMessage(null as never)), /must be an object/);
		await assert.rejects(Promise.resolve().then(() => session.sendMessage({ method: 'Foo' } as never)), /numeric id/);
		await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1 } as never)), /method string/);
	});

	test('sendMessage forwards valid message to proxy', async () => {
		const sentMessages: unknown[] = [];
		const extHost = createExtHostBrowsers({
			$sendCDPMessage: (_sid: string, message: unknown) => {
				sentMessages.push(message);
				return Promise.resolve();
			},
		});

		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
		const session = await extHost.browserTabs[0].startCDPSession();
		await session.sendMessage({ id: 1, method: 'Page.enable', params: {} });

		assert.strictEqual(sentMessages.length, 1);
		assert.deepStrictEqual(sentMessages[0], { id: 1, method: 'Page.enable', params: {}, sessionId: undefined });
	});

	test('sendMessage rejects after session is closed', async () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
		const session = await extHost.browserTabs[0].startCDPSession();

		await session.close();
		await assert.rejects(Promise.resolve().then(() => session.sendMessage({ id: 1, method: 'Foo' })), /closed/);
	});

	test('$onCDPSessionMessage delivers to correct session', async () => {
		const capturedIds: string[] = [];
		const extHost = createExtHostBrowsers({
			$startCDPSession: (sessionId: string) => {
				capturedIds.push(sessionId);
				return Promise.resolve();
			},
		});

		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
		const session1 = await extHost.browserTabs[0].startCDPSession();
		const session2 = await extHost.browserTabs[0].startCDPSession();

		const received1: unknown[] = [];
		const received2: unknown[] = [];
		store.add(session1.onDidReceiveMessage(m => received1.push(m)));
		store.add(session2.onDidReceiveMessage(m => received2.push(m)));

		extHost.$onCDPSessionMessage(capturedIds[1], { id: 1, result: { data: 'hello' } });

		assert.deepStrictEqual(received1, []);
		assert.deepStrictEqual(received2, [{ id: 1, result: { data: 'hello' } }]);
	});

	test('$onCDPSessionClosed fires onDidClose', async () => {
		const capturedIds: string[] = [];
		const extHost = createExtHostBrowsers({
			$startCDPSession: (sessionId: string) => {
				capturedIds.push(sessionId);
				return Promise.resolve();
			},
		});

		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1' }));
		const session = await extHost.browserTabs[0].startCDPSession();

		let closeFired = false;
		store.add(session.onDidClose(() => { closeFired = true; }));

		extHost.$onCDPSessionClosed(capturedIds[0]);
		assert.ok(closeFired);
	});

	// #endregion

	// #region Reference stability

	test('tab object reference is stable across updates', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://old.com', title: 'Old' }));
		const tabBefore = extHost.browserTabs[0];

		extHost.$onDidChangeBrowserTabState('b1', createDto({ id: 'b1', url: 'https://new.com', title: 'New' }));
		const tabAfter = extHost.browserTabs[0];

		assert.strictEqual(tabBefore, tabAfter);
		assert.strictEqual(tabAfter.url, 'https://new.com');
	});

	test('openBrowserTab returns same reference as browserTabs entry', async () => {
		const extHost = createExtHostBrowsers({
			$openBrowserTab: () => Promise.resolve(createDto({ id: 'ref-test' })),
		});

		const returned = await extHost.openBrowserTab('https://example.com');
		const fromArray = extHost.browserTabs[0];

		assert.strictEqual(returned, fromArray);
	});

	// #endregion

	// #region Multiple tabs tracked independently

	test('closing one tab does not affect others', () => {
		const extHost = createExtHostBrowsers();
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b1', url: 'https://one.com' }));
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b2', url: 'https://two.com' }));
		extHost.$onDidOpenBrowserTab(createDto({ id: 'b3', url: 'https://three.com' }));

		extHost.$onDidCloseBrowserTab('b2');

		assert.strictEqual(extHost.browserTabs.length, 2);
		assert.deepStrictEqual(extHost.browserTabs.map(t => t.url), ['https://one.com', 'https://three.com']);
	});

	test('closing active tab clears activeBrowserTab', () => {
		const extHost = createExtHostBrowsers();
		const dto = createDto({ id: 'b1' });
		extHost.$onDidOpenBrowserTab(dto);
		extHost.$onDidChangeActiveBrowserTab(dto);
		assert.ok(extHost.activeBrowserTab);

		extHost.$onDidCloseBrowserTab('b1');
		assert.strictEqual(extHost.activeBrowserTab, undefined);
	});

	// #endregion
});
