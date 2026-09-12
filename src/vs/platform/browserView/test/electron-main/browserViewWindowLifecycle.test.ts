/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { EventEmitter } from 'events';
import { Emitter } from '../../../../base/common/event.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { mock, upcastPartial } from '../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { ICodeWindow, ILoadEvent, LoadReason } from '../../../window/electron-main/window.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import { registerBrowserViewWindowLifecycle } from '../../electron-main/browserViewWindowLifecycle.js';

suite('BrowserViewWindowLifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(external: boolean) {
		const load = store.add(new Emitter<ILoadEvent>());
		const close = store.add(new Emitter<void>());
		const destroy = store.add(new Emitter<void>());
		const renderer = new EventEmitter();
		const webContents: Electron.WebContents = upcastPartial<Electron.WebContents>({
			on: (event, listener) => { renderer.on(event, listener); return webContents; },
			removeListener: (event, listener) => { renderer.removeListener(event, listener); return webContents; },
		});
		const owner = upcastPartial<ICodeWindow>({
			onWillLoad: load.event, onDidClose: close.event, onDidDestroy: destroy.event,
			win: upcastPartial<Electron.BrowserWindow>({ webContents }),
		});
		let disposed = false;
		let visible = true;
		const lifetime = store.add(new DisposableStore());
		const view = new class extends mock<BrowserView>() {
			override readonly presentation = external ? { type: 'external' as const, resource: URI.parse('test-canvas:/instance') } : undefined;
			override setVisible(value: boolean) { visible = value; }
			override dispose() { disposed = true; lifetime.dispose(); }
		}();
		lifetime.add(registerBrowserViewWindowLifecycle(owner, view));
		return { view, load, close, destroy, renderer, state: () => ({ disposed, visible }) };
	}

	test('reload retires external pages while retaining ordinary browser pages for enumeration', () => {
		const external = createFixture(true);
		const ordinary = createFixture(false);
		external.load.fire({ reason: LoadReason.RELOAD, workspace: undefined });
		ordinary.load.fire({ reason: LoadReason.RELOAD, workspace: undefined });
		assert.deepStrictEqual({
			external: external.state(), ordinary: ordinary.state(),
			externalRendererListeners: external.renderer.listenerCount('render-process-gone'),
		}, { external: { disposed: true, visible: true }, ordinary: { disposed: false, visible: false }, externalRendererListeners: 0 });
	});

	test('hiding retains content but owner renderer loss releases it and its listeners', () => {
		const fixture = createFixture(true);
		fixture.view.setVisible(false);
		const hidden = fixture.state();
		fixture.renderer.emit('render-process-gone');
		assert.deepStrictEqual({
			hidden, afterCrash: fixture.state(),
			listeners: [fixture.load.hasListeners(), fixture.close.hasListeners(), fixture.destroy.hasListeners(), fixture.renderer.listenerCount('render-process-gone')],
		}, { hidden: { disposed: false, visible: false }, afterCrash: { disposed: true, visible: false }, listeners: [false, false, false, 0] });
	});
});
