/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { Disposable } from 'vs/base/common/lifecycle';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { IEditorContribution } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';

const ignoreUnusualLineTerminators = 'ignoreUnusualLineTerminators';

function writeIgnoreState(codeEditorService: ICodeEditorService, model: ITextModel, state: boolean): void {
	codeEditorService.setTransientModelProperty(model, ignoreUnusualLineTerminators, state);
}

function readIgnoreState(codeEditorService: ICodeEditorService, model: ITextModel): boolean | undefined {
	return codeEditorService.getTransientModelProperty(model, ignoreUnusualLineTerminators);
}

class UnusualLineTerminatorsDetector extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.unusualLineTerminatorsDetector';

	private _enabled: boolean;

	constructor(
		private readonly _editor: ICodeEditor,
		@IDialogService private readonly _dialogService: IDialogService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();

		this._enabled = this._editor.getOption(EditorOption.removeUnusualLineTerminators);
		this._register(this._editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.removeUnusualLineTerminators)) {
				this._enabled = this._editor.getOption(EditorOption.removeUnusualLineTerminators);
				this._checkForUnusualLineTerminators();
			}
		}));

		this._register(this._editor.onDidChangeModel(() => {
			this._checkForUnusualLineTerminators();
		}));

		this._register(this._editor.onDidChangeModelContent(() => {
			this._checkForUnusualLineTerminators();
		}));
	}

	private async _checkForUnusualLineTerminators(): Promise<void> {
		if (!this._enabled) {
			return;
		}
		if (!this._editor.hasModel()) {
			return;
		}
		const model = this._editor.getModel();
		if (!model.mightContainUnusualLineTerminators()) {
			return;
		}
		const ignoreState = readIgnoreState(this._codeEditorService, model);
		if (ignoreState === true) {
			// this model should be ignored
			return;
		}
		if (this._editor.getOption(EditorOption.readOnly)) {
			// read only editor => sorry!
			return;
		}

		const result = await this._dialogService.confirm({
			title: nls.localize('unusualLineTerminators.title', "Unusual Line Terminators"),
			message: nls.localize('unusualLineTerminators.message', "Detected unusual line terminators"),
			detail: nls.localize('unusualLineTerminators.detail', "Your file contains one or more unusual line terminator characters, like Line Separator (LS), Paragraph Separator (PS) or Next Line (NEL).\n\nThese characters can cause subtle problems with language servers, due to how each programming language specifies its line terminators. e.g. what is line 11 for VS Code might be line 12 for a language server.\n\nThis check can be disabled via `editor.removeUnusualLineTerminators`."),
			primaryButton: nls.localize('unusualLineTerminators.fix', "Fix this file"),
			secondaryButton: nls.localize('unusualLineTerminators.ignore', "Ignore problem for this file")
		});

		if (!result.confirmed) {
			// this model should be ignored
			writeIgnoreState(this._codeEditorService, model, true);
			return;
		}

		model.removeUnusualLineTerminators(this._editor.getSelections());
	}
}

registerEditorContribution(UnusualLineTerminatorsDetector.ID, UnusualLineTerminatorsDetector);
