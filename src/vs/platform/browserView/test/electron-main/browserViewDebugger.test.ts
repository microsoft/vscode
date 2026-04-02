/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { BrowserViewDebugger } from '../../electron-main/browserViewDebugger.js';
import { NullLogService } from '../../../log/common/log.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

function makeDebuggerStub(attached: boolean) {
	return {
		_attached: attached,
		isAttached(): boolean { return this._attached; },
		attach: sinon.stub(),
		detach: sinon.stub(),
		on: sinon.stub(),
		removeListener: sinon.stub(),
		sendCommand: sinon.stub().resolves({ targetInfo: { targetId: 'test-target' } }),
	};
}

function makeWebContentsStub(debuggerStub: ReturnType<typeof makeDebuggerStub>, destroyed: boolean) {
	return {
		debugger: debuggerStub,
		isDestroyed(): boolean { return destroyed; },
		getURL(): string { return 'about:blank'; },
		getTitle(): string { return ''; },
	};
}

function makeViewStub(webContentsStub: ReturnType<typeof makeWebContentsStub>) {
	return {
		webContents: webContentsStub,
		session: { id: 'test-session' },
	};
}

suite('BrowserViewDebugger', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	/**
	 * Regression test for https://github.com/microsoft/vscode/issues/306923
	 *
	 * Before the fix, dispose() called detachElectronDebugger() which called
	 * this._electronDebugger.detach() even when the underlying WebContents was
	 * already destroyed. Electron's debugger throws 'target closed while
	 * handling command' in that situation.
	 *
	 * After the fix, detachElectronDebugger() bails out early when
	 * webContents.isDestroyed() returns true, so detach() is never called.
	 */
	test('dispose() does not call debugger.detach() when WebContents is already destroyed', () => {
		const debuggerStub = makeDebuggerStub(/* attached */ true);
		const webContentsStub = makeWebContentsStub(debuggerStub, /* destroyed */ true);
		const viewStub = makeViewStub(webContentsStub);

		const debugger_ = store.add(
			new BrowserViewDebugger(viewStub as any, new NullLogService())
		);

		assert.doesNotThrow(() => debugger_.dispose());
		assert.strictEqual(
			(debuggerStub.detach as sinon.SinonStub).callCount,
			0,
			'debugger.detach() must not be called when WebContents is already destroyed'
		);
	});

	test('dispose() calls debugger.detach() when WebContents is still alive', () => {
		const debuggerStub = makeDebuggerStub(/* attached */ true);
		const webContentsStub = makeWebContentsStub(debuggerStub, /* destroyed */ false);
		const viewStub = makeViewStub(webContentsStub);

		const debugger_ = store.add(
			new BrowserViewDebugger(viewStub as any, new NullLogService())
		);

		assert.doesNotThrow(() => debugger_.dispose());
		assert.strictEqual(
			(debuggerStub.detach as sinon.SinonStub).callCount,
			1,
			'debugger.detach() should be called once when WebContents is alive'
		);
	});

	test('dispose() is a no-op when debugger was never attached', () => {
		const debuggerStub = makeDebuggerStub(/* attached */ false);
		const webContentsStub = makeWebContentsStub(debuggerStub, /* destroyed */ false);
		const viewStub = makeViewStub(webContentsStub);

		const debugger_ = store.add(
			new BrowserViewDebugger(viewStub as any, new NullLogService())
		);

		assert.doesNotThrow(() => debugger_.dispose());
		assert.strictEqual(
			(debuggerStub.detach as sinon.SinonStub).callCount,
			0,
			'debugger.detach() must not be called when the debugger was never attached'
		);
	});
});
