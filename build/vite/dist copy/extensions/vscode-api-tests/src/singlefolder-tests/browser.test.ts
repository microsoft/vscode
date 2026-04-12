/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { window, commands, ViewColumn } from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('vscode API - browser', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	// #region window.browserTabs / activeBrowserTab

	test('browserTabs is an array', () => {
		assert.ok(Array.isArray(window.browserTabs));
	});

	test('activeBrowserTab is undefined when no browser tab is open', () => {
		assert.strictEqual(window.activeBrowserTab, undefined);
	});

	// #endregion

	// #region openBrowserTab

	test('openBrowserTab returns a BrowserTab with url, title, and icon', async () => {
		const tab = await window.openBrowserTab('about:blank');

		assert.ok(tab);
		assert.strictEqual(tab.url, 'about:blank');
		assert.ok(tab.title);
		assert.ok(tab.icon);
	});

	test('openBrowserTab adds tab to browserTabs', async () => {
		const before = window.browserTabs.length;
		await window.openBrowserTab('about:blank');
		assert.strictEqual(window.browserTabs.length, before + 1);
	});

	test('openBrowserTab with viewColumn.Beside', async () => {
		const tab = await window.openBrowserTab('about:blank', { viewColumn: ViewColumn.Beside });
		assert.ok(tab);
		assert.strictEqual(tab.url, 'about:blank');
	});

	test('openBrowserTab with preserveFocus', async () => {
		const tab = await window.openBrowserTab('about:blank', { preserveFocus: true });
		assert.ok(tab);
	});

	test('openBrowserTab with background', async () => {
		const tab = await window.openBrowserTab('about:blank', { background: true });
		assert.ok(tab);
	});

	// #endregion

	// #region BrowserTab.close

	test('BrowserTab.close removes the tab from browserTabs', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const countBefore = window.browserTabs.length;

		await tab.close();

		assert.strictEqual(window.browserTabs.length, countBefore - 1);
	});

	test('Can move a browser tab to a new group and close it successfully', async () => {
		const tab = await window.openBrowserTab('about:blank');
		assert.ok(window.browserTabs.includes(tab));

		await commands.executeCommand('workbench.action.moveEditorToNextGroup');

		await tab.close();
		assert.ok(!window.browserTabs.includes(tab));
	});

	// #endregion

	// #region onDidOpenBrowserTab

	test('onDidOpenBrowserTab fires when a tab is opened', async () => {
		const opened = new Promise<vscode.BrowserTab>(resolve => {
			const disposable = window.onDidOpenBrowserTab(tab => {
				disposable.dispose();
				resolve(tab);
			});
		});

		const tab = await window.openBrowserTab('about:blank');
		const firedTab = await opened;
		assert.strictEqual(firedTab.url, tab.url);
	});

	// #endregion

	// #region onDidCloseBrowserTab

	test('onDidCloseBrowserTab fires when a tab is closed', async () => {
		const tab = await window.openBrowserTab('about:blank');

		const closed = new Promise<vscode.BrowserTab>(resolve => {
			const disposable = window.onDidCloseBrowserTab(t => {
				disposable.dispose();
				resolve(t);
			});
		});

		await tab.close();
		const firedTab = await closed;
		assert.ok(firedTab);
	});

	// #endregion

	// #region activeBrowserTab / onDidChangeActiveBrowserTab

	test('activeBrowserTab is set after opening a tab', async () => {
		await window.openBrowserTab('about:blank');
		assert.ok(window.activeBrowserTab);
	});

	test('onDidChangeActiveBrowserTab fires when active tab changes', async () => {
		const changed = new Promise<vscode.BrowserTab | undefined>(resolve => {
			const disposable = window.onDidChangeActiveBrowserTab(tab => {
				disposable.dispose();
				resolve(tab);
			});
		});

		await window.openBrowserTab('about:blank');
		const activeTab = await changed;
		assert.ok(activeTab);
	});

	// #endregion

	// #region CDP sessions

	test('startCDPSession returns a session with expected API', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const session = await tab.startCDPSession();

		assert.ok(session);
		assert.ok(session.onDidReceiveMessage);
		assert.ok(session.onDidClose);
		assert.ok(typeof session.sendMessage === 'function');
		assert.ok(typeof session.close === 'function');

		await session.close();
	});

	test('CDP sendMessage and onDidReceiveMessage round-trip', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const session = await tab.startCDPSession();

		const response = new Promise<any>(resolve => {
			const disposable = session.onDidReceiveMessage((msg: any) => {
				if (msg.id === 1) {
					disposable.dispose();
					resolve(msg);
				}
			});
		});

		await session.sendMessage({ id: 1, method: 'Target.getTargets' });
		const msg = await response;
		assert.ok(msg.result);
		const targets: any[] = msg.result.targetInfos;
		assert.equal(targets.length, 1);
		assert.equal(targets[0].url, 'about:blank');

		await session.close();
	});

	test('CDP session.close fires onDidClose', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const session = await tab.startCDPSession();

		const closed = new Promise<void>(resolve => {
			const disposable = session.onDidClose(() => {
				disposable.dispose();
				resolve();
			});
		});

		await session.close();
		await closed;
	});

	// #endregion
});
