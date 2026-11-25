/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { DeferredPromise } from '../../../../base/common/async.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CDPEvent, CDPTargetInfo, ICDPConnection } from '../../common/cdp/types.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import { BrowserViewDebugger } from '../../electron-main/browserViewDebugger.js';
import { BrowserViewDialogs } from '../../electron-main/browserViewDialogs.js';

class TestElectronDebugger extends EventEmitter {
	private attached = false;
	evaluate: (() => Promise<unknown>) | undefined;

	attach(): void { this.attached = true; }
	detach(): void { this.attached = false; }
	isAttached(): boolean { return this.attached; }

	async sendCommand(method: string): Promise<unknown> {
		if ((method === 'Runtime.evaluate' || method === 'Runtime.callFunctionOn') && this.evaluate) {
			return this.evaluate();
		}
		if (method === 'Target.getTargetInfo') {
			return { targetInfo: targetInfo('page', '') };
		}
		return {};
	}

	fireEvent(method: string, params: unknown, sessionId?: string): void {
		this.emit('message', {}, method, params, sessionId);
	}
}

function targetInfo(targetId: string, url: string, type = 'page'): CDPTargetInfo {
	return { targetId, type, title: url, url, attached: false, canAccessOpener: false };
}

suite('BrowserViewDebugger', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	async function createDebugger() {
		const electronDebugger = new TestElectronDebugger();
		const webContents = Object.assign(new EventEmitter(), {
			debugger: electronDebugger,
			getOrCreateDevToolsTargetId: () => 'page',
			isDestroyed: () => false,
		});
		const dialogs = disposables.add(new BrowserViewDialogs());
		const debuggerInstance = disposables.add(new BrowserViewDebugger({ webContents, dialogs } as unknown as BrowserView));
		const changes: CDPTargetInfo[] = [];
		disposables.add(debuggerInstance.onTargetInfoChanged(info => changes.push(info)));
		await debuggerInstance.getTargetInfo();
		return { electronDebugger, changes, debuggerInstance, dialogs };
	}

	test('reports target info changes for its own page target', async () => {
		const { electronDebugger, changes } = await createDebugger();

		electronDebugger.fireEvent('Target.targetInfoChanged', { targetInfo: targetInfo('page', 'about:blank') });

		assert.deepStrictEqual(changes.map(info => [info.targetId, info.url]), [['page', 'about:blank']]);
	});

	test('reports changes for discovered sub-targets and ignores unrelated targets', async () => {
		const { electronDebugger, changes } = await createDebugger();

		electronDebugger.fireEvent('Target.attachedToTarget', { sessionId: 'worker-session', targetInfo: targetInfo('worker', '', 'worker'), waitingForDebugger: false });
		electronDebugger.fireEvent('Target.targetInfoChanged', { targetInfo: targetInfo('worker', 'https://example.com/worker.js', 'worker') });
		electronDebugger.fireEvent('Target.targetInfoChanged', { targetInfo: targetInfo('other-page', 'https://example.com/') });

		assert.deepStrictEqual(changes.map(info => [info.targetId, info.url]), [['worker', 'https://example.com/worker.js']]);
	});

	test('projects the queue to CDP in order without native duplicates', async () => {
		const { electronDebugger, debuggerInstance, dialogs } = await createDebugger();
		const sessions: ICDPConnection[] = [];
		disposables.add(debuggerInstance.onSessionCreated(({ session }) => sessions.push(session)));
		electronDebugger.fireEvent('Target.attachedToTarget', { sessionId: 'first', targetInfo: targetInfo('page', ''), waitingForDebugger: false });
		electronDebugger.fireEvent('Target.attachedToTarget', { sessionId: 'child', targetInfo: targetInfo('iframe', '', 'iframe'), waitingForDebugger: false });
		const events: CDPEvent[] = [];
		for (const session of sessions) {
			disposables.add(session.onEvent(event => events.push(event)));
		}
		dialogs.request({ type: 'alert', origin: 'https://example.com', message: 'First' }, () => { });
		dialogs.request({ type: 'prompt', origin: 'https://example.com', message: 'Second', defaultPrompt: 'initial' }, () => { });
		electronDebugger.fireEvent('Page.javascriptDialogOpening', { type: 'alert', message: 'native duplicate' }, 'first');
		dialogs.respond(dialogs.pendingDialog!.requestId, { accept: true });
		dialogs.respond(dialogs.pendingDialog!.requestId, { accept: true, promptText: 'answer' });
		assert.deepStrictEqual(events.map(event => [event.sessionId, event.method, event.params]), [
			['first', 'Page.javascriptDialogOpening', { type: 'alert', message: 'First', defaultPrompt: '', url: 'https://example.com', hasBrowserHandler: true }],
			['first', 'Page.javascriptDialogClosed', { result: true, userInput: '' }],
			['first', 'Page.javascriptDialogOpening', { type: 'prompt', message: 'Second', defaultPrompt: 'initial', url: 'https://example.com', hasBrowserHandler: true }],
			['first', 'Page.javascriptDialogClosed', { result: true, userInput: 'answer' }],
		]);
	});

	for (const method of ['Runtime.evaluate', 'Runtime.callFunctionOn']) {
		test(`holds ${method} results until all queued JavaScript dialogs are answered`, async () => {
			const { electronDebugger, debuggerInstance, dialogs } = await createDebugger();
			const evaluated = new DeferredPromise<void>();
			const result = new DeferredPromise<unknown>();
			electronDebugger.evaluate = () => {
				evaluated.complete();
				return result.p;
			};
			let completed = false;
			const evaluation = debuggerInstance.sendCommand(method).then(value => {
				completed = true;
				return value;
			});
			await evaluated.p;
			dialogs.request({ type: 'confirm', origin: 'null', message: 'Opaque iframe' }, () => { });
			dialogs.request({ type: 'prompt', origin: 'https://example.com', message: 'Next dialog' }, () => { });
			result.complete({ result: { value: true } });
			await result.p;
			await Promise.resolve();
			const whileFirstDialog = completed;
			dialogs.respond(dialogs.pendingDialog!.requestId, { accept: true });
			await Promise.resolve();
			const whileSecondDialog = completed;
			dialogs.respond(dialogs.pendingDialog!.requestId, { accept: true, promptText: 'answer' });
			const value = await evaluation;
			assert.deepStrictEqual({ whileFirstDialog, whileSecondDialog, completed, value }, {
				whileFirstDialog: false, whileSecondDialog: false, completed: true, value: { result: { value: true } },
			});
		});
	}

	test('does not start evaluation during a queued dialog and rejects it on debugger disposal', async () => {
		const { electronDebugger, debuggerInstance, dialogs } = await createDebugger();
		let evaluated = false;
		electronDebugger.evaluate = async () => { evaluated = true; return {}; };
		dialogs.request({ type: 'alert', origin: 'https://example.com', message: 'Pending' }, () => { });
		const evaluation = debuggerInstance.sendCommand('Runtime.callFunctionOn');
		const rejected = assert.rejects(evaluation, /Browser view debugger is disposed/);
		debuggerInstance.dispose();
		await rejected;
		assert.strictEqual(evaluated, false);
	});
});
