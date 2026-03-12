/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as vscode from 'vscode';
import { window } from 'vscode';
import { assertNoRpc, closeAllEditors } from '../utils';

(vscode.env.uiKind === vscode.UIKind.Web ? suite.skip : suite)('vscode API - browser', () => {

	teardown(async function () {
		assertNoRpc();
		await closeAllEditors();
	});

	test('browserTabs is initially empty', () => {
		assert.ok(Array.isArray(window.browserTabs));
	});

	test('activeBrowserTab is initially undefined', () => {
		assert.strictEqual(window.activeBrowserTab, undefined);
	});

	test('openBrowserTab opens a tab and returns a BrowserTab', async () => {
		const tab = await window.openBrowserTab('about:blank');

		assert.ok(tab);
		assert.strictEqual(tab.url, 'about:blank');
		assert.ok(tab.title);
		assert.ok(tab.icon);
		assert.ok(window.browserTabs.length >= 1);
	});

	test('openBrowserTab fires onDidOpenBrowserTab', async () => {
		const opened = new Promise<void>(resolve => {
			const disposable = window.onDidOpenBrowserTab(() => {
				disposable.dispose();
				resolve();
			});
		});

		await window.openBrowserTab('about:blank');
		await opened;
	});

	test('BrowserTab.close removes the tab', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const countBefore = window.browserTabs.length;

		await tab.close();

		assert.strictEqual(window.browserTabs.length, countBefore - 1);
	});

	test('BrowserTab.startCDPSession returns a session', async () => {
		const tab = await window.openBrowserTab('about:blank');
		const session = await tab.startCDPSession();

		assert.ok(session);
		assert.ok(session.onDidReceiveMessage);
		assert.ok(session.onDidClose);

		await session.close();
		await tab.close();
	});
});
