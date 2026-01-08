/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, EventHelper, EventType, getWindow } from '../../../base/browser/dom.js';
import { StandardKeyboardEvent } from '../../../base/browser/keyboardEvent.js';
import { StandardMouseEvent } from '../../../base/browser/mouseEvent.js';
import { KeyCode, KeyMod } from '../../../base/common/keyCodes.js';
import { DisposableStore, IDisposable } from '../../../base/common/lifecycle.js';
import { isMacintosh } from '../../../base/common/platform.js';
import { IEditorOptions } from '../common/editor.js';

//#region Editor Open Event Listeners

export interface IOpenEditorOptions {
	readonly editorOptions: IEditorOptions;
	readonly openToSide: boolean;
}

export function registerOpenEditorListeners(element: HTMLElement, onOpenEditor: (options: IOpenEditorOptions) => void): IDisposable {
	const disposables = new DisposableStore();

	disposables.add(addDisposableListener(element, EventType.CLICK, e => {
		if (e.detail === 2) {
			return; // ignore double click as it is handled below
		}

		EventHelper.stop(e, true);
		onOpenEditor(toOpenEditorOptions(new StandardMouseEvent(getWindow(element), e)));
	}));

	disposables.add(addDisposableListener(element, EventType.DBLCLICK, e => {
		EventHelper.stop(e, true);

		onOpenEditor(toOpenEditorOptions(new StandardMouseEvent(getWindow(element), e), true));
	}));

	disposables.add(addDisposableListener(element, EventType.KEY_DOWN, e => {
		const options = toOpenEditorOptions(new StandardKeyboardEvent(e));
		if (!options) {
			return;
		}

		EventHelper.stop(e, true);
		onOpenEditor(options);
	}));

	return disposables;
}

export function toOpenEditorOptions(event: StandardMouseEvent, isDoubleClick?: boolean): IOpenEditorOptions;
export function toOpenEditorOptions(event: StandardKeyboardEvent): IOpenEditorOptions | undefined;
export function toOpenEditorOptions(event: StandardMouseEvent | StandardKeyboardEvent): IOpenEditorOptions | undefined;
export function toOpenEditorOptions(event: StandardMouseEvent | StandardKeyboardEvent, isDoubleClick?: boolean): IOpenEditorOptions | undefined {
	if (event instanceof StandardKeyboardEvent) {
		let preserveFocus: boolean | undefined = undefined;
		if (event.equals(KeyCode.Enter) || (isMacintosh && event.equals(KeyMod.CtrlCmd | KeyCode.DownArrow))) {
			preserveFocus = false;
		} else if (event.equals(KeyCode.Space)) {
			preserveFocus = true;
		}

		if (typeof preserveFocus === 'undefined') {
			return;
		}

		return { editorOptions: { preserveFocus, pinned: !preserveFocus }, openToSide: false };
	} else {
		return { editorOptions: { preserveFocus: !isDoubleClick, pinned: isDoubleClick || event.middleButton }, openToSide: event.ctrlKey || event.metaKey || event.altKey };
	}
}

//#endregion
