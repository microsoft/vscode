/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { DeferredPromise } from '../../../../base/common/async.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { mock } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CDPEvent, CDPTargetInfo, ICDPConnection } from '../../common/cdp/types.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import type { BrowserViewDebugger } from '../../electron-main/browserViewDebugger.js';
import { BrowserViewInspector } from '../../electron-main/browserViewInspector.js';

class TestSession extends Disposable implements ICDPConnection {
	readonly targetId = 'target';
	private readonly events = this._register(new Emitter<CDPEvent>());
	readonly closed = this._register(new Emitter<void>());
	readonly onClose = this.closed.event;
	activeEventSubscriptions = 0;
	readonly evaluation = new DeferredPromise<{ result: { value: string } }>();
	evaluationRequested = false;
	readonly commands: string[] = [];
	readonly tokens = new Map<string, string>();

	readonly onEvent: Event<CDPEvent> = (listener, thisArgs) => {
		const subscription = this.events.event(listener, thisArgs);
		this.activeEventSubscriptions++;
		return this._register(toDisposable(() => {
			this.activeEventSubscriptions--;
			subscription.dispose();
		}));
	};

	constructor(readonly sessionId: string) {
		super();
	}

	async sendCommand(method: string, params?: { uniqueContextId?: string }): Promise<unknown> {
		this.commands.push(method);
		if (method === 'Runtime.evaluate') {
			this.evaluationRequested = true;
			const token = params?.uniqueContextId && this.tokens.get(params.uniqueContextId);
			if (token) {
				return { result: { value: token } };
			}
			return this.evaluation.p;
		}
		return {};
	}

	fireEvent(event: CDPEvent): void {
		this.events.fire(event);
	}

	close(): void {
		this.closed.fire();
		this.events.dispose();
		this.closed.dispose();
	}
}

suite('BrowserViewInspector', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function createInspector(mainReady?: Promise<ICDPConnection>, knownTargets: CDPTargetInfo[] = []) {
		const main = disposables.add(new TestSession('main'));
		const child = disposables.add(new TestSession('child'));
		const targets = disposables.add(new Emitter<CDPTargetInfo>());
		const webContents = new EventEmitter();
		const attachCalls = { count: 0, targets: 0 };
		const debuggerInstance = new class extends mock<BrowserViewDebugger>() {
			override readonly onTargetDiscovered = targets.event;
			override get knownTargets(): ReadonlyMap<string, CDPTargetInfo> { return new Map(knownTargets.map(t => [t.targetId, t])); }
			override async attachToTarget(): Promise<ICDPConnection> { attachCalls.targets++; return child; }
			override async attach(): Promise<ICDPConnection> { attachCalls.count++; return mainReady ?? main; }
		};
		const browser = new class extends mock<BrowserView>() {
			override readonly debugger = debuggerInstance;
			override get webContents(): Electron.WebContents { return webContents as Electron.WebContents; }
			override readonly emulator = new class extends mock<BrowserView['emulator']>() {
				override async setElementSelectionActive(): Promise<void> { }
			};
		};
		const inspector = disposables.add(new BrowserViewInspector(browser));
		return { inspector, main, child, targets, webContents, attachCalls };
	}

	const iframeTarget: CDPTargetInfo = { targetId: 'child', type: 'iframe', title: '', url: '', attached: true, canAccessOpener: false };

	function createFrame(state = { detached: false }) {
		return new class extends mock<Electron.WebFrameMain>() {
			override get detached() { return state.detached; }
			override readonly url = 'https://example.com';
			override readonly ipc = new EventEmitter() as Electron.IpcMain;
			override isDestroyed() { return false; }
			override postMessage() { }
		};
	}

	function contextCreated(uniqueId: string, frameId: string): CDPEvent {
		return { method: 'Runtime.executionContextCreated', params: { context: { uniqueId, auxData: { isDefault: true, frameId } } } };
	}

	test('releases a closed child session without removing the main session listener', async () => {
		const { inspector, main, child, targets } = createInspector();
		await inspector.toggleElementSelection(true);
		targets.fire({ targetId: 'child', type: 'iframe', title: '', url: '', attached: true, canAccessOpener: false });
		await Promise.resolve();
		assert.deepStrictEqual([main.activeEventSubscriptions, child.activeEventSubscriptions], [1, 1]);
		child.close();
		assert.deepStrictEqual([main.activeEventSubscriptions, child.activeEventSubscriptions], [1, 0]);
	});

	test('does not retain a session when its evaluation completes after it closes', async () => {
		const { inspector, child, targets } = createInspector();
		await inspector.toggleElementSelection(true);
		targets.fire({ targetId: 'child', type: 'iframe', title: '', url: '', attached: true, canAccessOpener: false });
		await Promise.resolve();

		child.fireEvent({
			method: 'Runtime.executionContextCreated',
			params: { context: { uniqueId: 'context', auxData: { isDefault: true, frameId: 'frame' } } }
		});
		assert.strictEqual(child.evaluationRequested, true);
		child.close();
		await child.evaluation.complete({ result: { value: 'frame-token' } });
		await new Promise<void>(resolve => setImmediate(resolve));

		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect retained sessions without exposing test-only API.
		assert.strictEqual(inspector['_registry']['_pendingSessions'].size, 0);
	});

	test('removes close listeners from live sessions when the inspector is disposed', async () => {
		const { inspector, main } = createInspector();
		await inspector.toggleElementSelection(true);
		assert.strictEqual(main.closed.hasListeners(), true);
		inspector.dispose();
		assert.deepStrictEqual([main.activeEventSubscriptions, main.closed.hasListeners()], [0, false]);
	});

	test('does not watch a session that attaches after inspector disposal', async () => {
		const ready = new DeferredPromise<ICDPConnection>();
		const { inspector, main } = createInspector(ready.p);
		void inspector.toggleElementSelection(true);
		inspector.dispose();
		await ready.complete(main);
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual([main.activeEventSubscriptions, main.closed.hasListeners()], [0, false]);
	});

	test('does not attach the debugger or enable Runtime on construction', async () => {
		const { main, attachCalls } = createInspector();
		await Promise.resolve();
		assert.deepStrictEqual({ attaches: attachCalls.count, commands: main.commands }, { attaches: 0, commands: [] });
	});

	test('attaches on first element selection and adopts frames that were ready earlier', async () => {
		const { inspector, main, child, targets, webContents, attachCalls } = createInspector();
		const mainFrame = createFrame();
		const iframe = createFrame();
		(webContents as EventEmitter & { mainFrame?: Electron.WebFrameMain }).mainFrame = mainFrame;
		main.tokens.set('main-context', 'main-token');
		child.tokens.set('iframe-context', 'iframe-token');

		webContents.emit('ipc-message', { senderFrame: mainFrame }, 'vscode:browserView:preloadReady', 'main-token');
		webContents.emit('ipc-message', { senderFrame: iframe }, 'vscode:browserView:preloadReady', 'iframe-token');

		await inspector.toggleElementSelection(true);
		targets.fire(iframeTarget);
		await Promise.resolve();
		main.fireEvent(contextCreated('main-context', 'main-frame'));
		child.fireEvent(contextCreated('iframe-context', 'iframe-frame'));
		await new Promise<void>(resolve => setImmediate(resolve));

		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect adopted frames without exposing test-only API.
		const registry = inspector['_registry'];
		assert.deepStrictEqual({
			attaches: attachCalls.count,
			runtimeEnabled: main.commands.includes('Runtime.enable'),
			mainAdopted: !!registry.getByFrame(mainFrame),
			iframeAdopted: !!registry.getByFrame(iframe),
		}, { attaches: 1, runtimeEnabled: true, mainAdopted: true, iframeAdopted: true });

		await inspector.toggleElementSelection(true);
		assert.strictEqual(attachCalls.count, 1);
	});

	test('adopts an iframe target discovered by another consumer before first use', async () => {
		const { inspector, child, webContents, attachCalls } = createInspector(undefined, [iframeTarget]);
		const iframe = createFrame();
		child.tokens.set('iframe-context', 'iframe-token');
		webContents.emit('ipc-message', { senderFrame: iframe }, 'vscode:browserView:preloadReady', 'iframe-token');

		await inspector.toggleElementSelection(true);
		await Promise.resolve();
		child.fireEvent(contextCreated('iframe-context', 'iframe-frame'));
		await new Promise<void>(resolve => setImmediate(resolve));

		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect adopted frames without exposing test-only API.
		assert.deepStrictEqual({ targets: attachCalls.targets, adopted: !!inspector['_registry'].getByFrame(iframe) }, { targets: 1, adopted: true });
	});

	suite('pending selection while attaching', () => {
		async function startPending() {
			const ready = new DeferredPromise<ICDPConnection>();
			const ctx = createInspector(ready.p);
			void ctx.inspector.toggleElementSelection(true);
			await Promise.resolve();
			return { ...ctx, ready };
		}

		async function settle(ready: DeferredPromise<ICDPConnection>, main: ICDPConnection) {
			await ready.complete(main);
			await new Promise<void>(resolve => setImmediate(resolve));
		}

		test('does not start after being disabled', async () => {
			const { inspector, main, ready } = await startPending();
			await inspector.toggleElementSelection(false);
			await settle(ready, main);
			assert.strictEqual(inspector.isElementSelectionActive, false);
		});

		test('does not start after navigation', async () => {
			const { inspector, main, webContents, ready } = await startPending();
			webContents.emit('did-navigate');
			await settle(ready, main);
			assert.strictEqual(inspector.isElementSelectionActive, false);
		});

		test('does not start after area selection takes over', async () => {
			const { inspector, main, webContents, ready } = await startPending();
			(webContents as EventEmitter & { mainFrame?: Electron.WebFrameMain }).mainFrame = createFrame();
			await inspector.toggleAreaSelection(true);
			await settle(ready, main);
			assert.deepStrictEqual([inspector.isElementSelectionActive, inspector.isAreaSelectionActive], [false, true]);
		});

		test('does not start after disposal', async () => {
			const { inspector, main, ready } = await startPending();
			inspector.dispose();
			await settle(ready, main);
			assert.strictEqual(inspector.isElementSelectionActive, false);
		});

		test('starts when not cancelled', async () => {
			const { inspector, main, ready } = await startPending();
			await settle(ready, main);
			assert.strictEqual(inspector.isElementSelectionActive, true);
		});
	});

	test('retires pending preloads of removed frames and superseded tokens before attachment', async () => {
		const { inspector, main, child, targets, webContents } = createInspector();
		const mainState = { detached: false };
		const iframeState = { detached: false };
		const mainFrame = createFrame(mainState);
		const iframe = createFrame(iframeState);
		const liveIframe = createFrame();
		main.tokens.set('main-context', 'main-token-2');
		child.tokens.set('iframe-context', 'live-token');

		webContents.emit('ipc-message', { senderFrame: mainFrame }, 'vscode:browserView:preloadReady', 'main-token-1');
		webContents.emit('ipc-message', { senderFrame: mainFrame }, 'vscode:browserView:preloadReady', 'main-token-2');
		webContents.emit('ipc-message', { senderFrame: iframe }, 'vscode:browserView:preloadReady', 'removed-token');
		webContents.emit('ipc-message', { senderFrame: liveIframe }, 'vscode:browserView:preloadReady', 'live-token');
		iframeState.detached = true;
		webContents.emit('did-navigate');

		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect retained state without exposing test-only API.
		const registry = inspector['_registry'];
		// eslint-disable-next-line local/code-no-bracket-notation-for-identifiers -- Inspect retained state without exposing test-only API.
		const pendingTokens = [...registry['_pendingFrames'].keys()];

		await inspector.toggleElementSelection(true);
		targets.fire(iframeTarget);
		await Promise.resolve();
		main.fireEvent(contextCreated('main-context', 'main-frame'));
		child.fireEvent(contextCreated('iframe-context', 'iframe-frame'));
		await new Promise<void>(resolve => setImmediate(resolve));

		assert.deepStrictEqual({
			pendingTokens,
			mainAdopted: !!registry.getByFrame(mainFrame),
			liveIframeAdopted: !!registry.getByFrame(liveIframe),
		}, { pendingTokens: ['main-token-2', 'live-token'], mainAdopted: true, liveIframeAdopted: true });
	});
});
