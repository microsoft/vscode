/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { ICodeWindow, LoadReason } from '../../window/electron-main/window.js';
import type { BrowserView } from './browserView.js';

/** Bind native content to its owning renderer, independently of its display bounds. */
export function registerBrowserViewWindowLifecycle(ownerWindow: ICodeWindow, view: BrowserView): IDisposable {
	const store = new DisposableStore();
	store.add(ownerWindow.onDidClose(() => view.dispose()));
	store.add(ownerWindow.onWillLoad(event => {
		if (event.reason === LoadReason.LOAD || (event.reason === LoadReason.RELOAD && view.presentation)) {
			view.dispose();
		} else if (event.reason === LoadReason.RELOAD) {
			view.setVisible(false);
		}
	}));
	if (view.presentation) {
		store.add(ownerWindow.onDidDestroy(() => view.dispose()));
		if (ownerWindow.win) {
			store.add(Event.fromNodeEventEmitter(ownerWindow.win.webContents, 'render-process-gone')(() => view.dispose()));
		}
	}
	return store;
}
