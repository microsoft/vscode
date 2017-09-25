/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { Throttler } from 'vs/base/common/async';
import Event, { Emitter } from 'vs/base/common/event';
import { IEditorOptions } from 'vs/platform/editor/common/editor';
import { ITree } from 'vs/base/parts/tree/browser/tree';

export interface IOpenFileOptions {
	editorOptions: IEditorOptions;
	sideBySide: boolean;
	element: any;
	payload: any;
}

export default class FileResultsNavigation extends Disposable {

	private _openFile: Emitter<IOpenFileOptions> = new Emitter<IOpenFileOptions>();
	public readonly openFile: Event<IOpenFileOptions> = this._openFile.event;

	private throttler: Throttler;

	constructor(private tree: ITree) {
		super();
		this.throttler = new Throttler();
		this._register(this.tree.addListener('focus', e => this.onFocus(e)));
		this._register(this.tree.addListener('selection', e => this.onSelection(e)));
	}

	private onFocus(event: any): void {
		const element = this.tree.getFocus();
		this.tree.setSelection([element], { fromFocus: true });
		this._openFile.fire({
			editorOptions: {
				preserveFocus: true,
				pinned: false,
				revealIfVisible: true
			},
			sideBySide: false,
			element,
			payload: event.payload
		});
	}

	private onSelection({ payload }: any): void {
		if (payload && payload.fromFocus) {
			return;
		}
		let keyboard = payload && payload.origin === 'keyboard';
		let originalEvent: KeyboardEvent | MouseEvent = payload && payload.originalEvent;

		let pinned = (payload && payload.origin === 'mouse' && originalEvent && originalEvent.detail === 2);
		if (pinned && originalEvent) {
			originalEvent.preventDefault(); // focus moves to editor, we need to prevent default
		}

		let sideBySide = (originalEvent && (originalEvent.ctrlKey || originalEvent.metaKey));
		let preserveFocus = !((keyboard && (!payload || !payload.preserveFocus)) || pinned || (payload && payload.focusEditor));
		this._openFile.fire({
			editorOptions: {
				preserveFocus,
				pinned,
				revealIfVisible: !sideBySide
			},
			sideBySide,
			element: this.tree.getSelection()[0],
			payload
		});
	}
}