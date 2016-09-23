/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {sequence} from 'vs/base/common/async';
import {ICodeEditorService} from 'vs/editor/common/services/codeEditorService';
import {IThreadService} from 'vs/workbench/services/thread/common/threadService';
import {ISaveParticipant, ITextFileEditorModel} from 'vs/workbench/parts/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IPosition, IModel, ICommonCodeEditor, ISingleEditOperation} from 'vs/editor/common/editorCommon';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {trimTrailingWhitespace} from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import {getDocumentRangeFormattingEdits} from 'vs/editor/contrib/format/common/format';
import {EditOperationsCommand} from 'vs/editor/contrib/format/common/formatCommand';
import {IConfigurationService} from 'vs/platform/configuration/common/configuration';
import {TextFileEditorModel} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {ExtHostContext, ExtHostDocumentSaveParticipantShape} from './extHost.protocol';

class TrimWhitespaceParticipant implements ISaveParticipant {

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	public participate(model: ITextFileEditorModel, env: { isAutoSaved: boolean }): any {
		if (this.configurationService.lookup('files.trimTrailingWhitespace').value) {
			this.doTrimTrailingWhitespace(model.textEditorModel, env.isAutoSaved);
		}
	}

	private doTrimTrailingWhitespace(model: IModel, isAutoSaved: boolean): void {
		let prevSelection: Selection[] = [new Selection(1, 1, 1, 1)];
		const cursors: IPosition[] = [];

		// Find `prevSelection` in any case do ensure a good undo stack when pushing the edit
		// Collect active cursors in `cursors` only if `isAutoSaved` to avoid having the cursors jump
		if (model.isAttachedToEditor()) {
			const allEditors = this.codeEditorService.listCodeEditors();
			for (let i = 0, len = allEditors.length; i < len; i++) {
				const editor = allEditors[i];
				const editorModel = editor.getModel();

				if (!editorModel) {
					continue; // empty editor
				}

				if (model === editorModel) {
					prevSelection = editor.getSelections();
					if (isAutoSaved) {
						cursors.push(...prevSelection.map(s => {
							return {
								lineNumber: s.positionLineNumber,
								column: s.positionColumn
							};
						}));
					}
				}
			}
		}

		const ops = trimTrailingWhitespace(model, cursors);
		if (!ops.length) {
			return; // Nothing to do
		}

		model.pushEditOperations(prevSelection, ops, (edits) => prevSelection);
	}
}

class FormatOnSaveParticipant implements ISaveParticipant {

	constructor(
		@ICodeEditorService private _editorService: ICodeEditorService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		// Nothing
	}

	participate(editorModel: ITextFileEditorModel, env: { isAutoSaved: boolean }): TPromise<any> {

		if (env.isAutoSaved || !this._configurationService.lookup('files.formatOnSave').value) {
			return;
		}

		const model: IModel = editorModel.textEditorModel;
		const editor = this._findEditor(model);
		const {tabSize, insertSpaces} = model.getOptions();

		return getDocumentRangeFormattingEdits(model, model.getFullModelRange(), { tabSize, insertSpaces }).then(edits => {
			if (edits) {
				if (editor) {
					this._editsWithEditor(editor, edits);
				} else {
					this._editWithModel(model, edits);
				}
			}
		});
	}

	private _editsWithEditor(editor: ICommonCodeEditor, edits: ISingleEditOperation[]): void {
		editor.executeCommand('files.formatOnSave', new EditOperationsCommand(edits, editor.getSelection()));
	}

	private _editWithModel(model: IModel, edits: ISingleEditOperation[]): void {
		model.applyEdits(edits.map(({text, range}) => ({
			text,
			range: Range.lift(range),
			identifier: undefined,
			forceMoveMarkers: true
		})));
	}

	private _findEditor(model: IModel) {
		if (!model.isAttachedToEditor()) {
			return;
		}

		let candidate: ICommonCodeEditor;
		for (const editor of this._editorService.listCodeEditors()) {
			if (editor.getModel() === model) {
				if (editor.isFocused()) {
					return editor;
				} else {
					candidate = editor;
				}
			}
		}
		return candidate;
	}
}

class ExtHostSaveParticipant implements ISaveParticipant {

	private _proxy: ExtHostDocumentSaveParticipantShape;

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.get(ExtHostContext.ExtHostDocumentSaveParticipant);
	}

	participate(editorModel: ITextFileEditorModel, env: { isAutoSaved: boolean }): TPromise<any> {
		return this._proxy.$participateInSave(editorModel.getResource());
	}
}

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
export class SaveParticipant implements ISaveParticipant {

	private _saveParticipants: ISaveParticipant[];

	constructor(
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {

		this._saveParticipants = [
			instantiationService.createInstance(TrimWhitespaceParticipant),
			instantiationService.createInstance(FormatOnSaveParticipant),
			instantiationService.createInstance(ExtHostSaveParticipant)
		];

		// Hook into model
		TextFileEditorModel.setSaveParticipant(this);
	}
	participate(model: ITextFileEditorModel, env: { isAutoSaved: boolean }): TPromise<any> {
		const promiseFactory = this._saveParticipants.map(p => () => {
			return TPromise.as(p.participate(model, env)).then(undefined, err => {
				// console.error(err);
			});
		});
		return sequence(promiseFactory);
	}
}
