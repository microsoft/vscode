/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CDPTargetInfo } from '../../common/cdp/types.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import { BrowserViewDebugger } from '../../electron-main/browserViewDebugger.js';

class TestElectronDebugger extends EventEmitter {
	private attached = false;

	attach(): void { this.attached = true; }
	detach(): void { this.attached = false; }
	isAttached(): boolean { return this.attached; }

	async sendCommand(method: string): Promise<unknown> {
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
		const debuggerInstance = disposables.add(new BrowserViewDebugger({ webContents } as unknown as BrowserView));
		const changes: CDPTargetInfo[] = [];
		disposables.add(debuggerInstance.onTargetInfoChanged(info => changes.push(info)));
		await debuggerInstance.getTargetInfo();
		return { electronDebugger, changes };
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
});
