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

	function createInspector(mainReady?: Promise<ICDPConnection>) {
		const main = disposables.add(new TestSession('main'));
		const child = disposables.add(new TestSession('child'));
		const targets = disposables.add(new Emitter<CDPTargetInfo>());
		const webContents = new EventEmitter();
		const attachCalls = { count: 0 };
		const debuggerInstance = new class extends mock<BrowserViewDebugger>() {
			override readonly onTargetDiscovered = targets.event;
			override async attach(): Promise<ICDPConnection> { attachCalls.count++; return mainReady ?? main; }
			override async attachToTarget(): Promise<ICDPConnection> { return child; }
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
		const createFrame = () => new class extends mock<Electron.WebFrameMain>() {
			override readonly detached = false;
			override readonly url = 'https://example.com';
			override readonly ipc = new EventEmitter() as Electron.IpcMain;
			override isDestroyed() { return false; }
			override postMessage() { }
		};
		const mainFrame = createFrame();
		const iframe = createFrame();
		(webContents as EventEmitter & { mainFrame?: Electron.WebFrameMain }).mainFrame = mainFrame;
		main.tokens.set('main-context', 'main-token');
		child.tokens.set('iframe-context', 'iframe-token');

		webContents.emit('ipc-message', { senderFrame: mainFrame }, 'vscode:browserView:preloadReady', 'main-token');
		webContents.emit('ipc-message', { senderFrame: iframe }, 'vscode:browserView:preloadReady', 'iframe-token');

		await inspector.toggleElementSelection(true);
		targets.fire({ targetId: 'child', type: 'iframe', title: '', url: '', attached: true, canAccessOpener: false });
		await Promise.resolve();
		main.fireEvent({ method: 'Runtime.executionContextCreated', params: { context: { uniqueId: 'main-context', auxData: { isDefault: true, frameId: 'main-frame' } } } });
		child.fireEvent({ method: 'Runtime.executionContextCreated', params: { context: { uniqueId: 'iframe-context', auxData: { isDefault: true, frameId: 'iframe-frame' } } } });
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
});
