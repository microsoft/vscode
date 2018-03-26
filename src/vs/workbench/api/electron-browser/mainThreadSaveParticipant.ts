/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { sequence } from 'vs/base/common/async';
import * as strings from 'vs/base/common/strings';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { ISaveParticipant, ITextFileEditorModel, SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITextModel, ISingleEditOperation, IIdentifiedSingleEditOperation } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { getDocumentFormattingEdits, NoProviderError } from 'vs/editor/contrib/format/format';
import { EditOperationsCommand } from 'vs/editor/contrib/format/formatCommand';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ExtHostContext, ExtHostDocumentSaveParticipantShape, IExtHostContext } from '../node/extHost.protocol';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IProgressService2, ProgressLocation } from 'vs/platform/progress/common/progress';
import { localize } from 'vs/nls';
import { isFalsyOrEmpty } from 'vs/base/common/arrays';
import { ILogService } from 'vs/platform/log/common/log';
import { shouldSynchronizeModel } from 'vs/editor/common/services/modelService';

export interface ISaveParticipantParticipant extends ISaveParticipant {
	// progressMessage: string;
}

class TrimWhitespaceParticipant implements ISaveParticipantParticipant {

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	public participate(model: ITextFileEditorModel, env: { reason: SaveReason }): void {
		if (this.configurationService.getValue('files.trimTrailingWhitespace', { overrideIdentifier: model.textEditorModel.getLanguageIdentifier().language, resource: model.getResource() })) {
			this.doTrimTrailingWhitespace(model.textEditorModel, env.reason === SaveReason.AUTO);
		}
	}

	private doTrimTrailingWhitespace(model: ITextModel, isAutoSaved: boolean): void {
		let prevSelection: Selection[] = [new Selection(1, 1, 1, 1)];
		const cursors: Position[] = [];

		let editor = findEditor(model, this.codeEditorService);
		if (editor) {
			// Find `prevSelection` in any case do ensure a good undo stack when pushing the edit
			// Collect active cursors in `cursors` only if `isAutoSaved` to avoid having the cursors jump
			prevSelection = editor.getSelections();
			if (isAutoSaved) {
				cursors.push(...prevSelection.map(s => new Position(s.positionLineNumber, s.positionColumn)));
			}
		}

		const ops = trimTrailingWhitespace(model, cursors);
		if (!ops.length) {
			return; // Nothing to do
		}

		model.pushEditOperations(prevSelection, ops, (edits) => prevSelection);
	}
}

function findEditor(model: ITextModel, codeEditorService: ICodeEditorService): ICodeEditor {
	let candidate: ICodeEditor = null;

	if (model.isAttachedToEditor()) {
		for (const editor of codeEditorService.listCodeEditors()) {
			if (editor.getModel() === model) {
				if (editor.isFocused()) {
					return editor; // favour focused editor if there are multiple
				}

				candidate = editor;
			}
		}
	}

	return candidate;
}

export class FinalNewLineParticipant implements ISaveParticipantParticipant {

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	public participate(model: ITextFileEditorModel, env: { reason: SaveReason }): void {
		if (this.configurationService.getValue('files.insertFinalNewline', { overrideIdentifier: model.textEditorModel.getLanguageIdentifier().language, resource: model.getResource() })) {
			this.doInsertFinalNewLine(model.textEditorModel);
		}
	}

	private doInsertFinalNewLine(model: ITextModel): void {
		const lineCount = model.getLineCount();
		const lastLine = model.getLineContent(lineCount);
		const lastLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(lastLine) === -1;

		if (!lineCount || lastLineIsEmptyOrWhitespace) {
			return;
		}

		let prevSelection: Selection[] = [new Selection(1, 1, 1, 1)];
		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			prevSelection = editor.getSelections();
		}

		model.pushEditOperations(prevSelection, [EditOperation.insert(new Position(lineCount, model.getLineMaxColumn(lineCount)), model.getEOL())], edits => prevSelection);

		if (editor) {
			editor.setSelections(prevSelection);
		}
	}
}

export class TrimFinalNewLinesParticipant implements ISaveParticipantParticipant {

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@ICodeEditorService private codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	public participate(model: ITextFileEditorModel, env: { reason: SaveReason }): void {
		if (this.configurationService.getValue('files.trimFinalNewlines', { overrideIdentifier: model.textEditorModel.getLanguageIdentifier().language, resource: model.getResource() })) {
			this.doTrimFinalNewLines(model.textEditorModel);
		}
	}

	private doTrimFinalNewLines(model: ITextModel): void {
		const lineCount = model.getLineCount();

		// Do not insert new line if file does not end with new line
		if (lineCount === 1) {
			return;
		}

		let prevSelection: Selection[] = [new Selection(1, 1, 1, 1)];
		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			prevSelection = editor.getSelections();
		}

		let currentLineNumber = model.getLineCount();
		let currentLine = model.getLineContent(currentLineNumber);
		let currentLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(currentLine) === -1;
		while (currentLineIsEmptyOrWhitespace) {
			currentLineNumber--;
			currentLine = model.getLineContent(currentLineNumber);
			currentLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(currentLine) === -1;
		}

		const deletionRange = new Range(currentLineNumber + 1, 1, lineCount + 1, 1);
		if (!deletionRange.isEmpty()) {
			model.pushEditOperations(prevSelection, [EditOperation.delete(deletionRange)], edits => prevSelection);
		}

		if (editor) {
			editor.setSelections(prevSelection);
		}
	}
}

class FormatOnSaveParticipant implements ISaveParticipantParticipant {

	constructor(
		@ICodeEditorService private readonly _editorService: ICodeEditorService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService
	) {
		// Nothing
	}

	participate(editorModel: ITextFileEditorModel, env: { reason: SaveReason }): Promise<void> {

		const model = editorModel.textEditorModel;
		if (env.reason === SaveReason.AUTO
			|| !this._configurationService.getValue('editor.formatOnSave', { overrideIdentifier: model.getLanguageIdentifier().language, resource: editorModel.getResource() })) {
			return undefined;
		}

		const versionNow = model.getVersionId();
		const { tabSize, insertSpaces } = model.getOptions();

		const timeout = this._configurationService.getValue('editor.formatOnSaveTimeout', { overrideIdentifier: model.getLanguageIdentifier().language, resource: editorModel.getResource() });

		return new Promise<ISingleEditOperation[]>((resolve, reject) => {
			setTimeout(() => reject(localize('timeout.formatOnSave', "Aborted format on save after {0}ms", timeout)), timeout);
			getDocumentFormattingEdits(model, { tabSize, insertSpaces })
				.then(edits => this._editorWorkerService.computeMoreMinimalEdits(model.uri, edits))
				.then(resolve, err => {
					if (!(err instanceof Error) || err.name !== NoProviderError.Name) {
						reject(err);
					} else {
						resolve();
					}
				});

		}).then(edits => {
			if (!isFalsyOrEmpty(edits) && versionNow === model.getVersionId()) {
				const editor = findEditor(model, this._editorService);
				if (editor) {
					this._editsWithEditor(editor, edits);
				} else {
					this._editWithModel(model, edits);
				}
			}
		});
	}

	private _editsWithEditor(editor: ICodeEditor, edits: ISingleEditOperation[]): void {
		EditOperationsCommand.execute(editor, edits, false);
	}

	private _editWithModel(model: ITextModel, edits: ISingleEditOperation[]): void {

		const [{ range }] = edits;
		const initialSelection = new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);

		model.pushEditOperations([initialSelection], edits.map(FormatOnSaveParticipant._asIdentEdit), undoEdits => {
			for (const { range } of undoEdits) {
				if (Range.areIntersectingOrTouching(range, initialSelection)) {
					return [new Selection(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn)];
				}
			}
			return undefined;
		});
	}

	private static _asIdentEdit({ text, range }: ISingleEditOperation): IIdentifiedSingleEditOperation {
		return {
			text,
			range: Range.lift(range),
			forceMoveMarkers: true
		};
	}
}

class ExtHostSaveParticipant implements ISaveParticipantParticipant {

	private _proxy: ExtHostDocumentSaveParticipantShape;

	constructor(extHostContext: IExtHostContext) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentSaveParticipant);
	}

	participate(editorModel: ITextFileEditorModel, env: { reason: SaveReason }): Promise<void> {

		if (!shouldSynchronizeModel(editorModel.textEditorModel)) {
			// the model never made it to the extension
			// host meaning we cannot participate in its save
			return undefined;
		}

		return new Promise<any>((resolve, reject) => {
			setTimeout(() => reject(localize('timeout.onWillSave', "Aborted onWillSaveTextDocument-event after 1750ms")), 1750);
			this._proxy.$participateInSave(editorModel.getResource(), env.reason).then(values => {
				for (const success of values) {
					if (!success) {
						return Promise.reject(new Error('listener failed'));
					}
				}
				return undefined;
			}).then(resolve, reject);
		});
	}
}

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
@extHostCustomer
export class SaveParticipant implements ISaveParticipant {

	private _saveParticipants: ISaveParticipantParticipant[];

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProgressService2 private readonly _progressService: IProgressService2,
		@ILogService private readonly _logService: ILogService
	) {
		this._saveParticipants = [
			instantiationService.createInstance(TrimWhitespaceParticipant),
			instantiationService.createInstance(FormatOnSaveParticipant),
			instantiationService.createInstance(FinalNewLineParticipant),
			instantiationService.createInstance(TrimFinalNewLinesParticipant),
			instantiationService.createInstance(ExtHostSaveParticipant, extHostContext),
		];
		// Hook into model
		TextFileEditorModel.setSaveParticipant(this);
	}

	dispose(): void {
		TextFileEditorModel.setSaveParticipant(undefined);
	}

	participate(model: ITextFileEditorModel, env: { reason: SaveReason }): Thenable<void> {
		return this._progressService.withProgress({ location: ProgressLocation.Window }, progress => {
			progress.report({ message: localize('saveParticipants', "Running Save Participants...") });
			const promiseFactory = this._saveParticipants.map(p => () => {
				return Promise.resolve(p.participate(model, env));
			});
			return sequence(promiseFactory).then(() => { }, err => this._logService.warn(err));
		});
	}
}
