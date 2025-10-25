/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { basename } from '../../../../base/common/resources.js';
import { ICodeEditor } from '../../../browser/editorBrowser.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../browser/editorExtensions.js';
import { ICodeEditorService } from '../../../browser/services/codeEditorService.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { IEditorContribution } from '../../../common/editorCommon.js';
import { ITextModel } from '../../../common/model.js';
import * as nls from '../../../../nls.js';
import { IConfirmationResult, IDialogService } from '../../../../platform/dialogs/common/dialogs.js';

const ignoreUnusualLineTerminators = 'ignoreUnusualLineTerminators';

function writeIgnoreState(codeEditorService: ICodeEditorService, model: ITextModel, state: boolean): void {
	codeEditorService.setModelProperty(model.uri, ignoreUnusualLineTerminators, state);
}

function readIgnoreState(codeEditorService: ICodeEditorService, model: ITextModel): boolean | undefined {
	return codeEditorService.getModelProperty(model.uri, ignoreUnusualLineTerminators) as boolean | undefined;
}

export class UnusualLineTerminatorsDetector extends Disposable implements IEditorContribution {

	public static readonly ID = 'editor.contrib.unusualLineTerminatorsDetector';

	private _config: 'auto' | 'off' | 'prompt';
	private _isPresentingDialog: boolean = false;

	constructor(
		private readonly _editor: ICodeEditor,
		@IDialogService private readonly _dialogService: IDialogService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService
	) {
		super();

		this._config = this._editor.getOption(EditorOption.unusualLineTerminators);
		this._register(this._editor.onDidChangeConfiguration((e) => {
			if (e.hasChanged(EditorOption.unusualLineTerminators)) {
				this._config = this._editor.getOption(EditorOption.unusualLineTerminators);
				this._checkForUnusualLineTerminators();
			}
		}));

		this._register(this._editor.onDidChangeModel(() => {
			this._checkForUnusualLineTerminators();
		}));

		this._register(this._editor.onDidChangeModelContent((e) => {
			if (e.isUndoing) {
				// skip checking in case of undoing
				return;
			}
			this._checkForUnusualLineTerminators();
		}));

		this._checkForUnusualLineTerminators();
	}

	private async _checkForUnusualLineTerminators(): Promise<void> {
		if (this._config === 'off') {
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

		if (this._config === 'auto') {
			// just do it!
			model.removeUnusualLineTerminators(this._editor.getSelections());
			return;
		}

		if (this._isPresentingDialog) {
			// we're currently showing the dialog, which is async.
			// avoid spamming the user
			return;
		}

		let result: IConfirmationResult;
		try {
			this._isPresentingDialog = true;
			result = await this._dialogService.confirm({
				title: nls.localize('unusualLineTerminators.title', "Unusual Line Terminators"),
				message: nls.localize('unusualLineTerminators.message', "Detected unusual line terminators"),
				detail: nls.localize('unusualLineTerminators.detail', "The file '{0}' contains one or more unusual line terminator characters, like Line Separator (LS) or Paragraph Separator (PS).\n\nIt is recommended to remove them from the file. This can be configured via `editor.unusualLineTerminators`.", basename(model.uri)),
				primaryButton: nls.localize({ key: 'unusualLineTerminators.fix', comment: ['&& denotes a mnemonic'] }, "&&Remove Unusual Line Terminators"),
				cancelButton: nls.localize('unusualLineTerminators.ignore', "Ignore")
			});
		} finally {
			this._isPresentingDialog = false;
		}

		if (!result.confirmed) {
			// this model should be ignored
			writeIgnoreState(this._codeEditorService, model, true);
			return;
		}

		model.removeUnusualLineTerminators(this._editor.getSelections());
	}
}

registerEditorContribution(UnusualLineTerminatorsDetector.ID, UnusualLineTerminatorsDetector, EditorContributionInstantiation.AfterFirstRender);
