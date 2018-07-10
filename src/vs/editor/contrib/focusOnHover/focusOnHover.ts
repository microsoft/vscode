/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { IConfigurationChangedEvent } from 'vs/editor/common/config/editorOptions';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { IDisposable } from 'vs/base/common/lifecycle';

export class FocusOnHoverController implements IEditorContribution {

	private static readonly ID = 'editor.contrib.focusOnHover';

	private _editorMouseMoveHandler?: IDisposable;
	private _didChangeConfigurationHandler: IDisposable;

	static get(editor: ICodeEditor): FocusOnHoverController {
		return editor.getContribution<FocusOnHoverController>(FocusOnHoverController.ID);
	}

	constructor(private readonly _editor: ICodeEditor) {
		this._hookEvents();

		this._didChangeConfigurationHandler = this._editor.onDidChangeConfiguration((e: IConfigurationChangedEvent) => {
			if (e.contribInfo) {
				this._unhookEvents();
				this._hookEvents();
			}
		});
	}

	private _hookEvents(): void {
		if (this._editor.getConfiguration().contribInfo.focusOnHover) {
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

	public getId(): string {
		return FocusOnHoverController.ID;
	}

	public dispose(): void {
		this._unhookEvents();
		this._didChangeConfigurationHandler.dispose();
	}
}

registerEditorContribution(FocusOnHoverController);
