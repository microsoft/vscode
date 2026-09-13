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
import type { IBrowserViewBounds } from '../../common/browserView.js';
import type { BrowserView } from '../../electron-main/browserView.js';
import { registerBrowserViewWindowLifecycle } from '../../electron-main/browserViewWindowLifecycle.js';

suite('BrowserViewWindowLifecycle', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const source = URI.parse('test-page:/document');

	function createWindow(id: number) {
		const onWillLoad = store.add(new Emitter<ILoadEvent>());
		const onDidClose = store.add(new Emitter<void>());
		const onDidDestroy = store.add(new Emitter<void>());
		const renderer = new EventEmitter();
		const webContents: Electron.WebContents = upcastPartial<Electron.WebContents>({
			on: (event, listener) => {
				renderer.on(event, listener);
				return webContents;
			},
			removeListener: (event, listener) => {
				renderer.removeListener(event, listener);
				return webContents;
			},
		});
		const window = upcastPartial<ICodeWindow>({
			id,
			onWillLoad: onWillLoad.event,
			onDidClose: onDidClose.event,
			onDidDestroy: onDidDestroy.event,
			win: upcastPartial<Electron.BrowserWindow>({ webContents }),
		});
		return { window, onWillLoad, onDidClose, onDidDestroy, renderer };
	}

	function createView(owner: ICodeWindow, pageSource?: URI) {
		const lifetime = store.add(new DisposableStore());
		const onDidClose = store.add(new Emitter<void>());
		let disposed = false;
		let visible = true;
		let reloads = 0;
		let displayWindowId = owner.id;
		const view = new class extends mock<BrowserView>() {
			override readonly source = pageSource;
			override readonly host = { windowId: owner.id };
			override readonly onDidClose = onDidClose.event;
			override setVisible(value: boolean): void { visible = value; }
			override reload(): void { reloads++; }
			override layout(bounds: IBrowserViewBounds): void { displayWindowId = bounds.windowId; }
			override dispose(): void {
				if (disposed) {
					return;
				}
				disposed = true;
				onDidClose.fire();
				lifetime.dispose();
			}
		}();
		lifetime.add(registerBrowserViewWindowLifecycle(owner, view));
		return { view, lifetime, snapshot: () => ({ disposed, visible, reloads, displayWindowId }) };
	}

	test('workbench reload invalidates only its source pages and retains ordinary URL pages', () => {
		const first = createWindow(1);
		const second = createWindow(2);
		const sourcePage = createView(first.window, source);
		const ordinaryPage = createView(first.window);
		const otherWindowPage = createView(second.window, source);
		const closed: string[] = [];
		store.add(sourcePage.view.onDidClose(() => closed.push('source')));
		store.add(ordinaryPage.view.onDidClose(() => closed.push('ordinary')));
		store.add(otherWindowPage.view.onDidClose(() => closed.push('otherWindow')));
		first.onWillLoad.fire({ reason: LoadReason.RELOAD, workspace: undefined });

		assert.deepStrictEqual({
			source: sourcePage.snapshot(),
			ordinary: ordinaryPage.snapshot(),
			otherWindow: otherWindowPage.snapshot(),
			sourceRendererListeners: first.renderer.listenerCount('render-process-gone'),
			closed,
		}, {
			source: { disposed: true, visible: true, reloads: 0, displayWindowId: 1 },
			ordinary: { disposed: false, visible: false, reloads: 0, displayWindowId: 1 },
			otherWindow: { disposed: false, visible: true, reloads: 0, displayWindowId: 2 },
			sourceRendererListeners: 0,
			closed: ['source'],
		});
	});

	test('page reload, hiding, and moving display bounds do not replace the owning renderer lifetime', () => {
		const owner = createWindow(1);
		const display = createWindow(2);
		const page = createView(owner.window, source);
		page.view.reload();
		page.view.setVisible(false);
		page.view.layout({ windowId: 2, x: 0, y: 0, width: 100, height: 100, zoomFactor: 1, cornerRadius: 0 });
		display.onWillLoad.fire({ reason: LoadReason.RELOAD, workspace: undefined });
		display.renderer.emit('render-process-gone');
		display.onDidClose.fire();
		const beforeOwnerReload = page.snapshot();
		owner.onWillLoad.fire({ reason: LoadReason.RELOAD, workspace: undefined });

		assert.deepStrictEqual({ beforeOwnerReload, afterOwnerReload: page.snapshot() }, {
			beforeOwnerReload: { disposed: false, visible: false, reloads: 1, displayWindowId: 2 },
			afterOwnerReload: { disposed: true, visible: false, reloads: 1, displayWindowId: 2 },
		});
	});

	test('renderer loss invalidates source pages but does not change ordinary page lifetime', () => {
		const owner = createWindow(1);
		const sourcePage = createView(owner.window, source);
		const ordinaryPage = createView(owner.window);
		owner.renderer.emit('render-process-gone');

		assert.deepStrictEqual({
			sourceDisposed: sourcePage.snapshot().disposed,
			ordinaryDisposed: ordinaryPage.snapshot().disposed,
			rendererListeners: owner.renderer.listenerCount('render-process-gone'),
		}, { sourceDisposed: true, ordinaryDisposed: false, rendererListeners: 0 });
	});

	test('destroy and workspace load remain scoped to the owning workbench', () => {
		const first = createWindow(1);
		const second = createWindow(2);
		const sourcePage = createView(first.window, source);
		const ordinaryPage = createView(second.window);
		first.onDidDestroy.fire();
		const otherWindowDisposed = ordinaryPage.snapshot().disposed;
		second.onWillLoad.fire({ reason: LoadReason.LOAD, workspace: undefined });

		assert.deepStrictEqual({
			sourceDisposed: sourcePage.snapshot().disposed,
			otherWindowDisposed,
			ordinaryAfterWorkspaceLoad: ordinaryPage.snapshot().disposed,
		}, { sourceDisposed: true, otherWindowDisposed: false, ordinaryAfterWorkspaceLoad: true });
	});

	test('view disposal releases all owner-window and renderer subscriptions', () => {
		const owner = createWindow(1);
		const page = createView(owner.window, source);
		page.view.dispose();

		assert.deepStrictEqual({
			loadListeners: owner.onWillLoad.hasListeners(),
			closeListeners: owner.onDidClose.hasListeners(),
			destroyListeners: owner.onDidDestroy.hasListeners(),
			rendererListeners: owner.renderer.listenerCount('render-process-gone'),
		}, { loadListeners: false, closeListeners: false, destroyListeners: false, rendererListeners: 0 });
	});
});
