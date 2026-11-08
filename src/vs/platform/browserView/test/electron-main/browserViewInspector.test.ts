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

	async sendCommand(method: string): Promise<unknown> {
		if (method === 'Runtime.evaluate') {
			this.evaluationRequested = true;
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
		const debuggerInstance = new class extends mock<BrowserViewDebugger>() {
			override readonly onTargetDiscovered = targets.event;
			override async attach(): Promise<ICDPConnection> { return mainReady ?? main; }
			override async attachToTarget(): Promise<ICDPConnection> { return child; }
		};
		const browser = new class extends mock<BrowserView>() {
			override readonly debugger = debuggerInstance;
			override get webContents(): Electron.WebContents { return webContents as Electron.WebContents; }
		};
		const inspector = disposables.add(new BrowserViewInspector(browser));
		return { inspector, main, child, targets };
	}

	test('releases a closed child session without removing the main session listener', async () => {
		const { main, child, targets } = createInspector();
		targets.fire({ targetId: 'child', type: 'iframe', title: '', url: '', attached: true, canAccessOpener: false });
		await Promise.resolve();
		assert.deepStrictEqual([main.activeEventSubscriptions, child.activeEventSubscriptions], [1, 1]);
		child.close();
		assert.deepStrictEqual([main.activeEventSubscriptions, child.activeEventSubscriptions], [1, 0]);
	});

	test('does not retain a session when its evaluation completes after it closes', async () => {
		const { inspector, child, targets } = createInspector();
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
		await Promise.resolve();
		assert.strictEqual(main.closed.hasListeners(), true);
		inspector.dispose();
		assert.deepStrictEqual([main.activeEventSubscriptions, main.closed.hasListeners()], [0, false]);
	});

	test('does not watch a session that attaches after inspector disposal', async () => {
		const ready = new DeferredPromise<ICDPConnection>();
		const { inspector, main } = createInspector(ready.p);
		inspector.dispose();
		await ready.complete(main);
		await Promise.resolve();
		await Promise.resolve();
		assert.deepStrictEqual([main.activeEventSubscriptions, main.closed.hasListeners()], [0, false]);
	});
});
