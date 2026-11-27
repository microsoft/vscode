/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as DOM from '../../../../base/browser/dom.js';
import { DataTransfers } from '../../../../base/browser/dnd.js';
import { CodeWindow } from '../../../../base/browser/window.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { isWeb } from '../../../../base/common/platform.js';
import { CodeDataTransfers } from '../../../../platform/dnd/browser/dnd.js';
import { IWebview } from './webview.js';

/**
 * Allows webviews to monitor when an element in the VS Code editor is being dragged/dropped.
 *
 * This is required since webview end up eating the drag event. VS Code needs to see this
 * event so it can handle editor element drag drop.
 */
export class WebviewWindowDragMonitor extends Disposable {
	constructor(targetWindow: CodeWindow, getWebview: () => IWebview | undefined) {
		super();
		let isDraggingResource = false;

		const onDragStart = () => {
			getWebview()?.windowDidDragStart();
		};

		const onDragEnd = () => {
			isDraggingResource = false;
			getWebview()?.windowDidDragEnd();
		};

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG_START, event => {
			// Electron rejects native drags from the workbench into a cross-site iframe.
			// Keep these drags in the workbench and forward explicitly requested drops.
			isDraggingResource = !isWeb && !!event.dataTransfer?.types.some(type =>
				type.toLowerCase() === DataTransfers.RESOURCES.toLowerCase()
				|| type.toLowerCase() === CodeDataTransfers.FILES.toLowerCase()
				|| type.toLowerCase() === DataTransfers.INTERNAL_URI_LIST.toLowerCase());
			onDragStart();
		}));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG_END, onDragEnd));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.MOUSE_MOVE, currentEvent => {
			if (currentEvent.buttons === 0) {
				onDragEnd();
			}
		}));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG, (event) => {
			if (event.shiftKey && !isDraggingResource) {
				getWebview()?.windowDidDragEnd();
			} else {
				onDragStart();
			}
		}));

		this._register(DOM.addDisposableListener(targetWindow, DOM.EventType.DRAG_OVER, event => {
			if (isDraggingResource) {
				onDragStart();
				getWebview()?.windowDidDrag(event);
				return;
			}
			if (event.shiftKey) {
				getWebview()?.windowDidDragEnd();
			} else {
				onDragStart();
			}
		}, true));

		for (const type of [DOM.EventType.DRAG_LEAVE, DOM.EventType.DROP]) {
			this._register(DOM.addDisposableListener(targetWindow, type, event => {
				if (isDraggingResource) {
					getWebview()?.windowDidDrag(event);
				}
			}, true));
		}

	}
}
