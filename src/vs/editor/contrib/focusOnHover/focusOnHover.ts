/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ConfigurationChangedEvent, EditorOption } from 'vs/editor/common/config/editorOptions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IDisposable, Disposable } from 'vs/base/common/lifecycle';

export class FocusOnHoverController extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.focusOnHover';

	private _editorMouseMoveHandler: IDisposable | null;

	constructor(private readonly _editor: ICodeEditor) {
		super();
		this._editorMouseMoveHandler = null;

		this._hookEvents();
		this._register(this._editor.onDidChangeConfiguration((e: ConfigurationChangedEvent) => {
			if (e.hasChanged(EditorOption.focusOnHover)) {
				this._unhookEvents();
				this._hookEvents();
			}
		}));
	}

	private _hookEvents(): void {
		if (this._editor.getOption(EditorOption.focusOnHover)) {
			this._editorMouseMoveHandler = this._editor.onMouseMove(_ => this._onEditorMouseMove());
		}
	}

	private _unhookEvents(): void {
		if (this._editorMouseMoveHandler) {
			this._editorMouseMoveHandler.dispose();
			this._editorMouseMoveHandler = null;
		}
	}

	private _onEditorMouseMove(): void {
		if (!this._editor.hasTextFocus()) {
			this._editor.focus();
		}
	}

	public dispose(): void {
		super.dispose();
		this._unhookEvents();
	}
}

registerEditorContribution(FocusOnHoverController.ID, FocusOnHoverController);
