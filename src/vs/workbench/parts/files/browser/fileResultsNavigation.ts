/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import Event, { Emitter } from 'vs/base/common/event';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { WorkbenchTree } from 'vs/platform/list/browser/listService';

export interface IOpenFileOptions {
	editorOptions: IEditorOptions;
	sideBySide: boolean;
	element: any;
	payload: any;
}

export interface IFileResultsNavigationOptions {
	openOnFocus: boolean;
}

export default class FileResultsNavigation extends Disposable {

	private _openFile: Emitter<IOpenFileOptions> = new Emitter<IOpenFileOptions>();
	public readonly openFile: Event<IOpenFileOptions> = this._openFile.event;

	constructor(private tree: WorkbenchTree, private options?: IFileResultsNavigationOptions) {
		super();

		this.registerListeners();
	}

	private registerListeners(): void {
		if (this.options && this.options.openOnFocus) {
			this._register(this.tree.onDidChangeFocus(e => this.onFocus(e)));
		}

		this._register(this.tree.onDidChangeSelection(e => this.onSelection(e)));
	}

	private onFocus({ payload }: any): void {
		const element = this.tree.getFocus();
		this.tree.setSelection([element], { fromFocus: true });

		const originalEvent: KeyboardEvent | MouseEvent = payload && payload.originalEvent;
		const isMouseEvent = payload && payload.origin === 'mouse';
		const isDoubleClick = isMouseEvent && originalEvent && originalEvent.detail === 2;

		if (!isMouseEvent || this.tree.openOnSingleClick || isDoubleClick) {
			this._openFile.fire({
				editorOptions: {
					preserveFocus: true,
					pinned: false,
					revealIfVisible: true
				},
				sideBySide: false,
				element,
				payload
			});
		}
	}

	private onSelection({ payload }: any): void {
		if (payload && payload.fromFocus) {
			return;
		}

		const originalEvent: KeyboardEvent | MouseEvent = payload && payload.originalEvent;
		const isMouseEvent = payload && payload.origin === 'mouse';
		const isDoubleClick = isMouseEvent && originalEvent && originalEvent.detail === 2;

		if (!isMouseEvent || this.tree.openOnSingleClick || isDoubleClick) {
			if (isDoubleClick && originalEvent) {
				originalEvent.preventDefault(); // focus moves to editor, we need to prevent default
			}

			const isFromKeyboard = payload && payload.origin === 'keyboard';
			const sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey || originalEvent.altKey));
			const preserveFocus = !((isFromKeyboard && (!payload || !payload.preserveFocus)) || isDoubleClick || (payload && payload.focusEditor));
			this._openFile.fire({
				editorOptions: {
					preserveFocus,
					pinned: isDoubleClick,
					revealIfVisible: true
				},
				sideBySide,
				element: this.tree.getSelection()[0],
				payload
			});
		}
	}
}
