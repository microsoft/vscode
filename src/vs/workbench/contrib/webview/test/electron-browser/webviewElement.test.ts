/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IMainProcessService } from '../../../../../platform/ipc/common/mainProcessService.js';
import { INativeHostService } from '../../../../../platform/native/common/native.js';
import { IRemoteAuthorityResolverService } from '../../../../../platform/remote/common/remoteAuthorityResolver.js';
import { ITunnelService } from '../../../../../platform/tunnel/common/tunnel.js';
import { IWebviewManagerService } from '../../../../../platform/webview/common/webviewManagerService.js';
import { workbenchInstantiationService } from '../../../../test/browser/workbenchTestServices.js';
import { WebviewThemeDataProvider } from '../../browser/themeing.js';
import { ElectronWebviewElement } from '../../electron-browser/webviewElement.js';

class TestElectronWebviewElement extends ElectronWebviewElement {
	public override get element(): HTMLIFrameElement | undefined { return super.element; }
	public get frameName(): string { return this.id; }
	public override handleFocusChange(isFocused: boolean): void { super.handleFocusChange(isFocused); }
}

suite('ElectronWebviewElement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createWebview(shortcutStates: boolean[] = []) {
		const calls: { command: string; args: unknown }[] = [];
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ window: { titleBarStyle: 'native' } }));
		const service: IWebviewManagerService = {
			_serviceBrand: undefined,
			onFoundInFrame: Event.None,
			setIgnoreMenuShortcuts: async (_target, value) => { shortcutStates.push(value); },
			findInFrame: async (...args) => { calls.push({ command: 'findInFrame', args }); },
			stopFindInFrame: async (...args) => { calls.push({ command: 'stopFindInFrame', args }); },
		};
		const channel = ProxyChannel.fromService(service, store.add(new DisposableStore()));
		instantiationService.stub(IMainProcessService, {
			getChannel: () => ({
				listen: (event, args) => channel.listen(undefined, event, args),
				call: (command, args) => channel.call(undefined, command, args),
			}),
		});
		instantiationService.stub(INativeHostService, { windowId: 42 });
		instantiationService.stub(IRemoteAuthorityResolverService, {});
		instantiationService.stub(ITunnelService, {});
		const themeProvider = upcastPartial<WebviewThemeDataProvider>({
			onThemeDataChanged: Event.None,
			getWebviewThemeData: () => ({ styles: {}, activeTheme: 'vscode-dark', themeLabel: '', themeId: '' }),
		});
		const webview = store.add(instantiationService.createInstance(TestElectronWebviewElement, {
			title: undefined,
			options: { enableFindWidget: true },
			contentOptions: {},
			extension: undefined,
		}, themeProvider));
		return { webview, calls };
	}

	function createAuxiliaryDocument() {
		const frame = mainWindow.document.createElement('iframe');
		mainWindow.document.body.appendChild(frame);
		store.add(toDisposable(() => frame.remove()));
		assert.ok(frame.contentWindow);
		ensureCodeWindow(frame.contentWindow, 42);
		assert.ok(frame.contentDocument);
		return frame.contentDocument;
	}

	for (const previouslyFocused of [false, true]) {
		test(`disposing a ${previouslyFocused ? 'previously focused' : 'never focused'} webview preserves another webview's native shortcuts`, () => {
			const shortcutStates: boolean[] = [];
			const first = createWebview(shortcutStates).webview;
			const second = createWebview(shortcutStates).webview;
			if (previouslyFocused) {
				first.handleFocusChange(true);
				first.handleFocusChange(false);
			}
			second.handleFocusChange(true);
			shortcutStates.length = 0;

			first.dispose();
			assert.deepStrictEqual(shortcutStates, []);
		});
	}

	test('disposing a focused webview restores native shortcuts after its view zone is removed', () => {
		const shortcutStates: boolean[] = [];
		const { webview } = createWebview(shortcutStates);
		assert.ok(webview.element);
		mainWindow.document.body.appendChild(webview.element);
		webview.handleFocusChange(true);
		webview.element.remove(); // Inset disposal removes the view zone before disposing the webview.
		webview.dispose();
		webview.dispose();

		assert.deepStrictEqual(shortcutStates, [true, false]);
	});

	for (const auxiliary of [false, true]) {
		test(`routes initial, next, previous and stop searches to the ${auxiliary ? 'auxiliary' : 'main'} window`, () => runWithFakedTimers({}, async () => {
			const targetDocument = auxiliary ? createAuxiliaryDocument() : mainWindow.document;
			const { webview, calls } = createWebview();
			assert.ok(webview.element);
			targetDocument.body.appendChild(webview.element);

			webview.updateFind('text');
			await timeout(250);
			webview.find('text', false);
			webview.find('text', true);
			webview.stopFind(true);
			webview.stopFind(false);

			const target = auxiliary ? { webContentsId: 42 } : { windowId: 42 };
			assert.deepStrictEqual(calls, [
				{ command: 'findInFrame', args: [target, webview.frameName, 'text', { forward: true, findNext: true, matchCase: false }] },
				{ command: 'findInFrame', args: [target, webview.frameName, 'text', { forward: true, findNext: false, matchCase: false }] },
				{ command: 'findInFrame', args: [target, webview.frameName, 'text', { forward: false, findNext: false, matchCase: false }] },
				{ command: 'stopFindInFrame', args: [target, webview.frameName, { keepSelection: true }] },
				{ command: 'stopFindInFrame', args: [target, webview.frameName, { keepSelection: false }] },
			]);
		}));
	}

	test('debounces typing and cancels pending searches on stop and disposal', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('t');
		webview.updateFind('text');
		await timeout(250);
		const searchesAfterTyping = [...calls];
		calls.length = 0;

		webview.updateFind('cancelled');
		webview.stopFind(false);
		await timeout(250);
		const searchesAfterStop = calls.filter(call => call.command === 'findInFrame');
		calls.length = 0;

		webview.updateFind('disposed');
		webview.dispose();
		await timeout(250);

		assert.deepStrictEqual({
			searchesAfterTyping,
			searchesAfterStop,
			searchesAfterDisposal: calls.filter(call => call.command === 'findInFrame'),
		}, {
			searchesAfterTyping: [{
				command: 'findInFrame',
				args: [{ windowId: 42 }, webview.frameName, 'text', { forward: true, findNext: true, matchCase: false }],
			}],
			searchesAfterStop: [],
			searchesAfterDisposal: [],
		});
	}));
});
