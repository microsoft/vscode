/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getDomNodePagePosition } from 'vs/base/browser/dom';
import { Action } from 'vs/base/common/actions';
import { canceled } from 'vs/base/common/errors';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { ScrollType } from 'vs/editor/common/editorCommon';
import { CodeAction } from 'vs/editor/common/modes';
import { IContextMenuService } from 'vs/platform/contextview/browser/contextView';
import { CodeActionSet } from 'vs/editor/contrib/codeAction/codeAction';
import { Disposable, MutableDisposable } from 'vs/base/common/lifecycle';
import { IAnchor } from 'vs/base/browser/ui/contextview/contextview';

interface CodeActionWidgetDelegate {
	onSelectCodeAction: (action: CodeAction) => Promise<any>;
}

export class CodeActionWidget extends Disposable {

	private _visible: boolean;
	private readonly _showingActions = this._register(new MutableDisposable<CodeActionSet>());

	constructor(
		private readonly _editor: ICodeEditor,
		private readonly _contextMenuService: IContextMenuService,
		private readonly _delegate: CodeActionWidgetDelegate,
	) {
		super();
		this._visible = false;
	}

	public async show(codeActions: CodeActionSet, at?: IAnchor | IPosition): Promise<void> {
		if (!codeActions.actions.length) {
			this._visible = false;
			return;
		}
		if (!this._editor.getDomNode()) {
			// cancel when editor went off-dom
			this._visible = false;
			return Promise.reject(canceled());
		}

		this._visible = true;
		const actions = codeActions.actions.map(action => this.codeActionToAction(action));

		this._showingActions.value = codeActions;
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
	}

	private codeActionToAction(action: CodeAction): Action {
		const id = action.command ? action.command.id : action.title;
		const title = action.title;
		return new Action(id, title, undefined, true, () => this._delegate.onSelectCodeAction(action));
	}

	get isVisible(): boolean {
		return this._visible;
	}

	private _toCoords(position: IPosition): { x: number, y: number } {
		if (!this._editor.hasModel()) {
			return { x: 0, y: 0 };
		}
		this._editor.revealPosition(position, ScrollType.Immediate);
		this._editor.render();

		// Translate to absolute editor position
		const cursorCoords = this._editor.getScrolledVisiblePosition(position);
		const editorCoords = getDomNodePagePosition(this._editor.getDomNode());
		const x = editorCoords.left + cursorCoords.left;
		const y = editorCoords.top + cursorCoords.top + cursorCoords.height;

		return { x, y };
	}
}
