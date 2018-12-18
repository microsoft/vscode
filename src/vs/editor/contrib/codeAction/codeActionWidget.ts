/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { Action } from 'vs/base/common/actions';
import { always } from 'vs/base/common/async';
import { canceled } from 'vs/base/common/errors';
import { Emitter, Event } from 'vs/base/common/event';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { CodeAction } from 'vs/editor/common/modes';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';

export class CodeActionContextMenu {

	private _visible: boolean;
	private _onDidExecuteCodeAction = new Emitter<void>();

	readonly onDidExecuteCodeAction: Event<void> = this._onDidExecuteCodeAction.event;

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _contextMenuService: IContextMenuService,
		private readonly _onApplyCodeAction: (action: CodeAction) => Promise<any>
	) { }

	show(fixes: Promise<CodeAction[]>, at?: { x: number; y: number } | Position) {
		const actionsPromise = fixes.then(value => {
			return value.map(action => {
				return new Action(action.command ? action.command.id : action.title, action.title, undefined, true, () => {
					return always(
						this._onApplyCodeAction(action),
						() => this._onDidExecuteCodeAction.fire(undefined));
				});
			});
		}).then(actions => {
			if (!this._editor.getDomNode()) {
				// cancel when editor went off-dom
				return Promise.reject(canceled());
			}
			return actions;
		});

		actionsPromise.then(actions => {
			this._contextMenuService.showContextMenu({
				getAnchor: () => {
					if (Position.isIPosition(at)) {
						at = this._toCoords(at);
					}
					return at || { x: 0, y: 0 };
				},
				getActions: () => actions,
				onHide: () => {
					this._visible = false;
					this._editor.focus();
				},
				autoSelectFirstItem: true
			});
		});
	}

	get isVisible(): boolean {
		return this._visible;
	}

	private _toCoords(position: Position): { x: number, y: number } {
		if (!this._editor.hasModel()) {
			return { x: 0, y: 0 };
		}
		this._editor.revealPosition(position, ScrollType.Immediate);
		this._editor.render();

		// Translate to absolute editor position
		const cursorCoords = this._editor.getScrolledVisiblePosition(this._editor.getPosition());
		const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
		const x = editorCoords.left + cursorCoords.left;
		const y = editorCoords.top + cursorCoords.top + cursorCoords.height;

		return { x, y };
	}
}
