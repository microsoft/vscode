/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IPlanningModeService } from '../../planningMode/common/planningMode.js';
import { IMarkdownString } from '../../../../base/common/htmlContent.js';
import { localize } from '../../../../nls.js';

export class PlanningModeEditorController extends Disposable {

	private readonly readOnlyMessage: IMarkdownString = {
		value: localize('planningMode.editorReadOnly', "Editor is read-only while in **Planning Mode**. This mode is for research and analysis only. Disable Planning Mode to make changes.")
	};

	private readonly editorsOriginalReadOnlyState = new WeakMap<ICodeEditor, boolean>();

	constructor(
		@IEditorService private readonly editorService: IEditorService,
		@IPlanningModeService private readonly planningModeService: IPlanningModeService,
	) {
		super();

		// Apply current state to existing editors
		this._updateAllEditors();

		// Listen for planning mode changes
		this._register(this.planningModeService.onDidChange(isActive => {
			this._updateAllEditors();
		}));

		// Listen for new editors
		this._register(this.editorService.onDidVisibleEditorsChange(() => {
			this._updateAllEditors();
		}));
	}

	private _updateAllEditors(): void {
		// Get all visible text editor controls
		const editorControls = this.editorService.visibleTextEditorControls;

		for (const editorControl of editorControls) {
			if (this._isCodeEditor(editorControl)) {
				this._updateEditor(editorControl);
			}
		}
	}

	private _updateEditor(editor: ICodeEditor): void {
		if (this.planningModeService.isActive) {
			// Store original read-only state if not already stored
			if (!this.editorsOriginalReadOnlyState.has(editor)) {
				const currentOptions = editor.getOptions();
				this.editorsOriginalReadOnlyState.set(editor, currentOptions.get(57 /* readOnly */)); // EditorOption.readOnly = 57
			}

			// Make editor read-only with custom message
			editor.updateOptions({
				readOnly: true,
				readOnlyMessage: this.readOnlyMessage
			});
		} else {
			// Restore original read-only state
			const originalReadOnly = this.editorsOriginalReadOnlyState.get(editor);
			if (originalReadOnly !== undefined) {
				editor.updateOptions({
					readOnly: originalReadOnly,
					readOnlyMessage: undefined
				});
				this.editorsOriginalReadOnlyState.delete(editor);
			}
		}
	}

	private _isCodeEditor(editor: any): editor is ICodeEditor {
		return editor && typeof editor.updateOptions === 'function' && typeof editor.getOptions === 'function';
	}
}
