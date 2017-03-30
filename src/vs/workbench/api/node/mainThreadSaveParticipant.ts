/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import { sequence } from 'vs/base/common/async';
import * as strings from 'vs/base/common/strings';
import { ICodeEditorService } from 'vs/editor/common/services/codeEditorService';
import { IThreadService } from 'vs/workbench/services/thread/common/threadService';
import { ISaveParticipant, ITextFileEditorModel, SaveReason } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IModel, ICommonCodeEditor, ISingleEditOperation, IIdentifiedSingleEditOperation } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { Position } from 'vs/editor/common/core/position';
import { trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { getDocumentFormattingEdits } from 'vs/editor/contrib/format/common/format';
import { EditOperationsCommand } from 'vs/editor/contrib/format/common/formatCommand';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ExtHostContext, ExtHostDocumentSaveParticipantShape } from './extHost.protocol';
import { EditOperation } from 'vs/editor/common/core/editOperation';

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

	public participate(model: ITextFileEditorModel, env: { reason: SaveReason }): any {
		if (this.configurationService.lookup('files.trimTrailingWhitespace', model.textEditorModel.getLanguageIdentifier().language).value) {
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
					return editor; // favour focussed editor if there are multiple
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

	public participate(model: ITextFileEditorModel, env: { reason: SaveReason }): any {
		if (this.configurationService.lookup('files.insertFinalNewline', model.textEditorModel.getLanguageIdentifier().language).value) {
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

class FormatOnSaveParticipant implements INamedSaveParticpant {

	readonly name = 'FormatOnSaveParticipant';

	constructor(
		@ICodeEditorService private _editorService: ICodeEditorService,
		@IConfigurationService private _configurationService: IConfigurationService
	) {
		// Nothing
	}

	participate(editorModel: ITextFileEditorModel, env: { reason: SaveReason }): TPromise<any> {

		const model = editorModel.textEditorModel;
		if (env.reason === SaveReason.AUTO
			|| !this._configurationService.lookup('editor.formatOnSave', model.getLanguageIdentifier().language).value) {
			return undefined;
		}

		const versionNow = model.getVersionId();
		const { tabSize, insertSpaces } = model.getOptions();

		return new TPromise<ISingleEditOperation[]>((resolve, reject) => {
			setTimeout(reject, 750);
			getDocumentFormattingEdits(model, { tabSize, insertSpaces }).then(resolve, reject);

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

	constructor( @IThreadService threadService: IThreadService) {
		this._proxy = threadService.get(ExtHostContext.ExtHostDocumentSaveParticipant);
	}

	participate(editorModel: ITextFileEditorModel, env: { reason: SaveReason }): TPromise<any> {
		return new TPromise<any>((resolve, reject) => {
			setTimeout(reject, 1750);
			this._proxy.$participateInSave(editorModel.getResource(), env.reason).then(values => {
				for (const success of values) {
					if (!success) {
						return TPromise.wrapError('listener failed');
					}
				}
				return undefined;
			}).then(resolve, reject);
		});
	}
}

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
export class SaveParticipant implements ISaveParticipant {

	private _saveParticipants: INamedSaveParticpant[];

	constructor(
		@ITelemetryService private _telemetryService: ITelemetryService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IThreadService threadService: IThreadService
	) {

		this._saveParticipants = [
			instantiationService.createInstance(TrimWhitespaceParticipant),
			instantiationService.createInstance(FormatOnSaveParticipant),
			instantiationService.createInstance(FinalNewLineParticipant),
			instantiationService.createInstance(ExtHostSaveParticipant)
		];

		// Hook into model
		TextFileEditorModel.setSaveParticipant(this);
	}
	participate(model: ITextFileEditorModel, env: { reason: SaveReason }): TPromise<any> {

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
			this._telemetryService.publicLog('saveParticipantStats', stats);
		});
	}
}
