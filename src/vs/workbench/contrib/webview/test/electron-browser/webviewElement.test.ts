/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { addDisposableListener, EventType } from '../../../../../base/browser/dom.js';
import { ensureCodeWindow, mainWindow } from '../../../../../base/browser/window.js';
import { timeout } from '../../../../../base/common/async.js';
import { isMacintosh } from '../../../../../base/common/platform.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { ProxyChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { ipcRenderer } from '../../../../../base/parts/sandbox/electron-browser/globals.js';
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

function focusHostDocument(): void {
	const button = mainWindow.document.createElement('button');
	mainWindow.document.body.appendChild(button);
	try {
		button.focus();
	} finally {
		button.remove();
	}
}

async function setWebContentsFocus(focused: boolean, focusTarget: Window = mainWindow): Promise<void> {
	const listeners = new DisposableStore();
	const changed = mainWindow.document.hasFocus() === focused ? undefined : new Promise<void>(resolve => {
		const onChange = () => {
			if (mainWindow.document.hasFocus() === focused) {
				resolve();
			}
		};
		const event = focused ? EventType.FOCUS : EventType.BLUR;
		listeners.add(addDisposableListener(mainWindow, event, onChange, true));
		if (focusTarget !== mainWindow) {
			listeners.add(addDisposableListener(focusTarget, event, onChange, true));
		}
	});
	try {
		// The IPC reply can arrive before the renderer observes the focus change.
		await ipcRenderer.invoke('vscode:test-set-web-contents-focus', focused);
		if (focused) {
			focusHostDocument();
		}
		await changed;
	} finally {
		listeners.dispose();
	}
}

suite('ElectronWebviewElement', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	suiteSetup(() => setWebContentsFocus(true));
	teardown(() => focusHostDocument());

	function createWebview(shortcutStates: boolean[] = [], windowId = 42, titleBarStyle = 'native') {
		const calls: { command: string; args: unknown }[] = [];
		const instantiationService = workbenchInstantiationService(undefined, store);
		instantiationService.stub(IConfigurationService, new TestConfigurationService({ window: { titleBarStyle } }));
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
		const nativeFocus = store.add(new Emitter<number>());
		instantiationService.stub(INativeHostService, { windowId, onDidFocusMainOrAuxiliaryWindow: nativeFocus.event });
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
		if (webview.element) {
			mainWindow.document.body.appendChild(webview.element);
		}
		return { webview, calls, nativeFocus };
	}

	function focusIframe(webview: TestElectronWebviewElement): void {
		assert.ok(webview.element?.contentWindow);
		webview.element.contentWindow.focus();
		assert.strictEqual(webview.element.ownerDocument.activeElement, webview.element);
	}

	function focusOutsideWebviews(targetDocument = mainWindow.document): void {
		const button = targetDocument.createElement('button');
		targetDocument.body.appendChild(button);
		store.add(toDisposable(() => button.remove()));
		button.focus();
		assert.strictEqual(targetDocument.activeElement, button);
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
				focusIframe(first);
				first.handleFocusChange(true);
				focusOutsideWebviews();
				first.handleFocusChange(false);
			}
			focusIframe(second);
			second.handleFocusChange(true);
			shortcutStates.length = 0;

			first.dispose();
			assert.deepStrictEqual(shortcutStates, []);
		});
	}

	for (const disposeBeforeBlur of [false, true]) {
		test(`${disposeBeforeBlur ? 'disposing' : 'blurring'} the previous owner after focus transfers preserves the new owner's shortcuts`, () => {
			const shortcutStates: boolean[] = [];
			const first = createWebview(shortcutStates).webview;
			const second = createWebview(shortcutStates).webview;
			focusIframe(first);
			first.handleFocusChange(true);
			focusIframe(second);
			second.handleFocusChange(true);

			if (disposeBeforeBlur) {
				first.dispose();
			} else {
				first.handleFocusChange(false);
			}
			const statesAfterTransfer = [...shortcutStates];
			second.dispose();
			first.dispose();
			assert.deepStrictEqual({ statesAfterTransfer, finalStates: shortcutStates }, {
				statesAfterTransfer: [true, true],
				finalStates: [true, true, false],
			});
		});
	}

	test('allows shortcut ownership to transfer back before a delayed blur arrives', () => {
		const shortcutStates: boolean[] = [];
		const first = createWebview(shortcutStates).webview;
		const second = createWebview(shortcutStates).webview;
		focusIframe(first);
		first.handleFocusChange(true);
		focusIframe(second);
		second.handleFocusChange(true);
		first.handleFocusChange(false);
		focusIframe(first);
		first.handleFocusChange(true);
		second.handleFocusChange(false);
		second.dispose();
		first.dispose();

		assert.deepStrictEqual(shortcutStates, [true, true, true, false]);
	});

	test('tracks shortcut ownership independently for each native window', () => {
		const firstStates: boolean[] = [];
		const secondStates: boolean[] = [];
		const first = createWebview(firstStates, 42).webview;
		const second = createWebview(secondStates, 43).webview;
		focusIframe(first);
		first.handleFocusChange(true);
		focusIframe(second);
		second.handleFocusChange(true);
		first.dispose();
		second.dispose();

		assert.deepStrictEqual({ firstStates, secondStates }, { firstStates: [true, false], secondStates: [true, false] });
	});

	for (const dispose of [false, true]) {
		test(`reconciles an unreported focus round trip before ${dispose ? 'disposal' : 'blur'}`, () => {
			const states: boolean[] = [];
			const first = createWebview(states).webview;
			const second = createWebview(states).webview;
			focusIframe(first);
			first.handleFocusChange(true);
			second.focus();
			focusIframe(first); // Neither webview poll observes the transient change.
			if (dispose) {
				first.dispose();
			} else {
				focusOutsideWebviews();
				first.handleFocusChange(false);
			}
			const statesAfterRelease = [...states];
			second.dispose();
			assert.deepStrictEqual({ statesAfterRelease, states }, { statesAfterRelease: [true, true, false], states: [true, true, false] });
		});
	}

	(isMacintosh ? test.skip : test)('an ineligible webview does not take ownership from an eligible one', () => {
		const states: boolean[] = [];
		const first = createWebview(states).webview;
		const second = createWebview(states, 42, 'custom').webview;
		focusIframe(first);
		first.handleFocusChange(true);
		focusIframe(second);
		second.handleFocusChange(true);
		first.handleFocusChange(false);
		focusOutsideWebviews();
		second.handleFocusChange(false);
		first.dispose();
		second.dispose();
		assert.deepStrictEqual(states, [true, false]);
	});

	test('disposing an old view preserves an actually focused view before its focus notification', () => {
		const states: boolean[] = [];
		const first = createWebview(states).webview;
		const second = createWebview(states).webview;
		focusIframe(first);
		first.handleFocusChange(true);
		focusIframe(second);
		first.dispose();
		const statesBeforeBlur = [...states];
		focusOutsideWebviews();
		second.handleFocusChange(false);
		assert.deepStrictEqual({ statesBeforeBlur, states }, { statesBeforeBlur: [true], states: [true, false] });
	});

	for (const dispose of [false, true]) {
		test(`releases an unreported focus owner after the previous view's ${dispose ? 'disposal' : 'blur'}`, async () => {
			const states: boolean[] = [];
			const first = createWebview(states).webview;
			const second = createWebview(states).webview;
			focusIframe(first);
			first.handleFocusChange(true);
			focusIframe(second);
			if (dispose) {
				first.dispose();
			} else {
				first.handleFocusChange(false);
			}
			assert.deepStrictEqual(states, [true]);
			await Promise.resolve(); // Drain setup callbacks while the second iframe is still focused.
			assert.deepStrictEqual(states, [true]);
			focusOutsideWebviews();
			await Promise.resolve();
			// The second webview's poll samples false both times and emits no notification.
			assert.deepStrictEqual(states, [true, false]);
		});
	}

	test('reacquires shortcuts after native focus returns before the next webview poll', async () => {
		const states: boolean[] = [];
		const first = createWebview(states).webview;
		const { webview: second, nativeFocus } = createWebview(states);
		focusIframe(first);
		first.handleFocusChange(true);
		focusIframe(second);
		second.handleFocusChange(true);
		await Promise.resolve();
		const focusTarget = second.element?.contentWindow;
		assert.ok(focusTarget);
		try {
			await setWebContentsFocus(false, focusTarget);
			assert.strictEqual(mainWindow.document.hasFocus(), false);
			first.handleFocusChange(false);
			assert.deepStrictEqual(states, [true, true, false]);
		} finally {
			await setWebContentsFocus(true, focusTarget);
		}
		assert.strictEqual(mainWindow.document.hasFocus(), true, 'test renderer regained native focus');
		focusIframe(second);
		assert.strictEqual(mainWindow.document.hasFocus(), true, 'test renderer remains focused in iframe');
		nativeFocus.fire(mainWindow.vscodeWindowId);
		await Promise.resolve();
		// The second webview's poll still remembers true, so it does not report focus again.
		assert.deepStrictEqual(states, [true, true, false, true]);
		focusOutsideWebviews();
		await Promise.resolve();
		assert.deepStrictEqual(states, [true, true, false, true, false]);
	});

	test('observes focus in the owning window after moving a webview', async () => {
		const states: boolean[] = [];
		const webview = createWebview(states).webview;
		const auxiliaryDocument = createAuxiliaryDocument();
		const auxiliaryWindow = auxiliaryDocument.defaultView;
		assert.ok(auxiliaryWindow);
		ensureCodeWindow(auxiliaryWindow, 42);
		webview.mountTo(auxiliaryDocument.body, auxiliaryWindow);
		focusIframe(webview);
		webview.handleFocusChange(true);
		await Promise.resolve(); // Setup reconciliation must not stand in for the auxiliary listener.
		assert.deepStrictEqual(states, [true]);
		focusOutsideWebviews(auxiliaryDocument);
		await Promise.resolve();
		assert.deepStrictEqual(states, [true, false]);

		webview.mountTo(mainWindow.document.body, mainWindow);
		focusIframe(webview);
		assert.strictEqual(mainWindow.document.hasFocus(), true, 'test renderer remains focused after adoption');
		await Promise.resolve();
		assert.deepStrictEqual(states, [true, false, true]);
		focusOutsideWebviews();
		await Promise.resolve();
		assert.deepStrictEqual(states, [true, false, true, false]);
	});

	test('native activation reconciles the activated window before a stale owner in another document', async () => {
		const states: boolean[] = [];
		const first = createWebview(states).webview;
		const { webview: second, nativeFocus } = createWebview(states);
		const auxiliaryDocument = createAuxiliaryDocument();
		const auxiliaryWindow = auxiliaryDocument.defaultView;
		assert.ok(auxiliaryWindow);
		ensureCodeWindow(auxiliaryWindow, 42);
		second.mountTo(auxiliaryDocument.body, auxiliaryWindow);
		focusIframe(second);
		second.handleFocusChange(true);
		await Promise.resolve();
		first.handleFocusChange(true); // A delayed focus report must not override actual auxiliary focus.
		nativeFocus.fire(auxiliaryWindow.vscodeWindowId);
		await Promise.resolve();
		first.handleFocusChange(false); // A stale owner would release shortcuts from the wrong document.
		assert.deepStrictEqual(states, [true, true]);
		focusOutsideWebviews(auxiliaryDocument);
		await Promise.resolve();
		assert.deepStrictEqual(states, [true, true, false]);
	});

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

	test('does not send stop requests before a search starts', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		let stopped = 0;
		store.add(webview.onDidStopFind(() => stopped++));

		webview.stopFind(true);
		webview.updateFind('cancelled');
		webview.stopFind(false);
		await timeout(250);

		assert.deepStrictEqual({ calls, stopped }, { calls: [], stopped: 2 });
	}));

	test('can clear a retained selection without repeating stop requests', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('text');
		await timeout(250);
		calls.length = 0;

		webview.stopFind(true);
		webview.stopFind(true);
		webview.stopFind(false);
		webview.stopFind(false);

		assert.deepStrictEqual(calls, [
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: true }] },
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: false }] },
		]);
	}));

	test('clears a retained selection when the webview content changes', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('text');
		await timeout(250);
		webview.stopFind(true);
		calls.length = 0;

		webview.setHtml('new content');

		assert.deepStrictEqual(calls, [
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: false }] },
		]);
	}));

	test('stops an active search before disposing the webview', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('text');
		await timeout(250);
		calls.length = 0;

		webview.dispose();
		webview.dispose();

		assert.deepStrictEqual(calls, [
			{ command: 'stopFindInFrame', args: [{ windowId: 42 }, webview.frameName, { keepSelection: false }] },
		]);
	}));

	test('starts a new search after stopping the previous one', () => runWithFakedTimers({}, async () => {
		const { webview, calls } = createWebview();
		webview.updateFind('first');
		await timeout(250);
		webview.stopFind(true);
		calls.length = 0;

		webview.find('second', false);
		await timeout(250);

		assert.deepStrictEqual(calls, [
			{ command: 'findInFrame', args: [{ windowId: 42 }, webview.frameName, 'second', { forward: true, findNext: true, matchCase: false }] },
		]);
	}));
});
