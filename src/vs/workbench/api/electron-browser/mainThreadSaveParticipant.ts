/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import * as strings from 'vs/base/common/strings';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { ISaveParticipant, ITextFileEditorModel, SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IModel, ICommonCodeEditor, ISingleEditOperation, IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { getDocumentFormattingEdits } from 'vs/editor/contrib/format/format';
import { EditOperationsCommand } from 'vs/editor/contrib/format/formatCommand';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ExtHostContext, ExtHostDocumentSaveParticipantShape, IExtHostContext } from '../node/extHost.protocol';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { extHostCustomer } from 'vs/workbench/api/electron-browser/extHostCustomers';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorkerService';

export interface INamedSaveParticpant extends ISaveParticipant {
	readonly name: string;
}

class TrimWhitespaceParticipant implements INamedSaveParticpant {

	readonly name = 'TrimWhitespaceParticipant';

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

	private doTrimTrailingWhitespace(model: IModel, isAutoSaved: boolean): void {
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

function findEditor(model: IModel, codeEditorService: ICodeEditorService): ICommonCodeEditor {
	let candidate: ICommonCodeEditor = null;

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

export class FinalNewLineParticipant implements INamedSaveParticpant {

	readonly name = 'FinalNewLineParticipant';

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

	private doInsertFinalNewLine(model: IModel): void {
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

export class TrimFinalNewLinesParticipant implements INamedSaveParticpant {

	readonly name = 'TrimFinalNewLinesParticipant';

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

	private doTrimFinalNewLines(model: IModel): void {
		const lineCount = model.getLineCount();

		// Do not insert new line if file does not end with new line
		if (!lineCount) {
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
		model.pushEditOperations(prevSelection, [EditOperation.delete(new Range(currentLineNumber + 1, 1, lineCount + 1, 1))], edits => prevSelection);

		if (editor) {
			editor.setSelections(prevSelection);
		}
	}
}

class FormatOnSaveParticipant implements INamedSaveParticpant {

	readonly name = 'FormatOnSaveParticipant';

	constructor(
		@ICodeEditorService private _editorService: ICodeEditorService,
		@IEditorWorkerService private _editorWorkerService: IEditorWorkerService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		// Nothing
	}

	participate(editorModel: ITextFileEditorModel, env: { reason: SaveReason }): TPromise<void> {

		const model = editorModel.textEditorModel;
		if (env.reason === SaveReason.AUTO
			|| !this._configurationService.getValue('editor.formatOnSave', { overrideIdentifier: model.getLanguageIdentifier().language, resource: editorModel.getResource() })) {
			return undefined;
		}

		const versionNow = model.getVersionId();
		const { tabSize, insertSpaces } = model.getOptions();

		return new TPromise<ISingleEditOperation[]>((resolve, reject) => {
			setTimeout(reject, 750);
			getDocumentFormattingEdits(model, { tabSize, insertSpaces })
				.then(edits => this._editorWorkerService.computeMoreMinimalEdits(model.uri, edits))
				.then(resolve, reject);

		}).then(edits => {
			if (edits && versionNow === model.getVersionId()) {
				const editor = findEditor(model, this._editorService);
				if (editor) {
					this._editsWithEditor(editor, edits);
				} else {
					this._editWithModel(model, edits);
				}
			}
		});
	}

	private _editsWithEditor(editor: ICommonCodeEditor, edits: ISingleEditOperation[]): void {
		EditOperationsCommand.execute(editor, edits);
	}

	private _editWithModel(model: IModel, edits: ISingleEditOperation[]): void {

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
			identifier: undefined,
			forceMoveMarkers: true
		};
	}
}

class ExtHostSaveParticipant implements INamedSaveParticpant {

	private _proxy: ExtHostDocumentSaveParticipantShape;

	readonly name = 'ExtHostSaveParticipant';

	constructor(extHostContext: IExtHostContext) {
		this._proxy = extHostContext.get(ExtHostContext.ExtHostDocumentSaveParticipant);
	}

	participate(editorModel: ITextFileEditorModel, env: { reason: SaveReason }): TPromise<void> {
		return new TPromise<any>((resolve, reject) => {
			setTimeout(reject, 1750);
			this._proxy.$participateInSave(editorModel.getResource(), env.reason).then(values => {
				for (const success of values) {
					if (!success) {
						return TPromise.wrapError(new Error('listener failed'));
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

	private _saveParticipants: INamedSaveParticpant[];

	constructor(
		extHostContext: IExtHostContext,
		@ITelemetryService private _telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IConfigurationService configurationService: IConfigurationService,
		@ICodeEditorService codeEditorService: ICodeEditorService,
		@IEditorWorkerService editorWorkerService: IEditorWorkerService
	) {

		this._saveParticipants = [
			new TrimWhitespaceParticipant(configurationService, codeEditorService),
			new FormatOnSaveParticipant(codeEditorService, editorWorkerService, configurationService),
			new FinalNewLineParticipant(configurationService, codeEditorService),
			new TrimFinalNewLinesParticipant(configurationService, codeEditorService),
			new ExtHostSaveParticipant(extHostContext)
		];

		// Hook into model
		TextFileEditorModel.setSaveParticipant(this);
	}

	dispose(): void {
		TextFileEditorModel.setSaveParticipant(undefined);
	}

	participate(model: ITextFileEditorModel, env: { reason: SaveReason }): TPromise<void> {

		const stats: { [name: string]: number } = Object.create(null);

		const promiseFactory = this._saveParticipants.map(p => () => {

			const { name } = p;
			const t1 = Date.now();

			return TPromise.as(p.participate(model, env)).then(() => {
				stats[`Success-${name}`] = Date.now() - t1;
			}, err => {
				stats[`Failure-${name}`] = Date.now() - t1;
				// console.error(err);
			});
		});

		return sequence(promiseFactory).then(() => {
			/* __GDPR__
				"saveParticipantStats" : {
					"${wildcard}": [
						{
							"${prefix}": "Success-",
							"${classification}": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
						},
						{
							"${prefix}": "Failure-",
							"${classification}": { "classification": "SystemMetaData", "purpose": "PerformanceAndHealth" }
						}
					]
				}
			*/
			this._telemetryService.publicLog('saveParticipantStats', stats);
		});
	}
}
