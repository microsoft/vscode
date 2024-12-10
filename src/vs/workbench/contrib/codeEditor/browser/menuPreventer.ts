/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyMod } from '../../../../base/common/keyCodes.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../editor/browser/editorExtensions.js';
import { IEditorContribution } from '../../../../editor/common/editorCommon.js';

/**
 * Prevents the top-level menu from showing up when doing Alt + Click in the editor
 */
export class MenuPreventer extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.menuPreventer';

	private _editor: ICodeEditor;
	private _altListeningMouse: boolean;
	private _altMouseTriggered: boolean;

	constructor(editor: ICodeEditor) {
		super();
		this._editor = editor;
		this._altListeningMouse = false;
		this._altMouseTriggered = false;

		// A global crossover handler to prevent menu bar from showing up
		// When <alt> is hold, we will listen to mouse events and prevent
		// the release event up <alt> if the mouse is triggered.

		this._register(this._editor.onMouseDown((e) => {
			if (this._altListeningMouse) {
				this._altMouseTriggered = true;
			}
		}));

		this._register(this._editor.onKeyDown((e) => {
			if (e.equals(KeyMod.Alt)) {
				if (!this._altListeningMouse) {
					this._altMouseTriggered = false;
				}
				this._altListeningMouse = true;
			}
		}));

		this._register(this._editor.onKeyUp((e) => {
			if (e.equals(KeyMod.Alt)) {
				if (this._altMouseTriggered) {
					e.preventDefault();
				}
				this._altListeningMouse = false;
				this._altMouseTriggered = false;
			}
		}));
	}
}

registerEditorContribution(MenuPreventer.ID, MenuPreventer, EditorContributionInstantiation.BeforeFirstInteraction);
