/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IdleValue, raceCancellation } from 'vs/base/common/async';
import { CancellationTokenSource, CancellationToken } from 'vs/base/common/cancellation';
import * as strings from 'vs/base/common/strings';
import { IActiveCodeEditor } from 'vs/editor/browser/editorBrowser';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionTriggerType } from 'vs/editor/common/modes';
import { shouldSynchronizeModel } from 'vs/editor/common/services/modelService';
import { getCodeActions } from 'vs/editor/contrib/codeAction/codeAction';
import { applyCodeAction } from 'vs/editor/contrib/codeAction/codeActionCommands';
import { CodeActionKind } from 'vs/editor/contrib/codeAction/types';
import { formatDocumentWithSelectedProvider, FormattingMode } from 'vs/editor/contrib/format/format';
import { SnippetController2 } from 'vs/editor/contrib/snippet/snippetController2';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgressService, ProgressLocation, IProgressStep, IProgress } from 'vs/platform/progress/common/progress';
import { extHostCustomer } from 'vs/workbench/api/common/extHostCustomers';
import { ISaveParticipant, IResolvedTextFileEditorModel, ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { SaveReason } from 'vs/workbench/common/editor';
import { ExtHostContext, ExtHostDocumentSaveParticipantShape, IExtHostContext } from '../common/extHost.protocol';
import { ILabelService } from 'vs/platform/label/common/label';
import { canceled } from 'vs/base/common/errors';

export interface ICodeActionsOnSaveOptions {
	[kind: string]: boolean;
}

export interface ISaveParticipantParticipant {
	participate(model: IResolvedTextFileEditorModel, env: { reason: SaveReason }, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void>;
}

class TrimWhitespaceParticipant implements ISaveParticipantParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	async participate(model: IResolvedTextFileEditorModel, env: { reason: SaveReason; }): Promise<void> {
		if (this.configurationService.getValue('files.trimTrailingWhitespace', { overrideIdentifier: model.textEditorModel.getLanguageIdentifier().language, resource: model.resource })) {
			this.doTrimTrailingWhitespace(model.textEditorModel, env.reason === SaveReason.AUTO);
		}
	}

	private doTrimTrailingWhitespace(model: ITextModel, isAutoSaved: boolean): void {
		let prevSelection: Selection[] = [];
		let cursors: Position[] = [];

		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			// Find `prevSelection` in any case do ensure a good undo stack when pushing the edit
			// Collect active cursors in `cursors` only if `isAutoSaved` to avoid having the cursors jump
			prevSelection = editor.getSelections();
			if (isAutoSaved) {
				cursors = prevSelection.map(s => s.getPosition());
				const snippetsRange = SnippetController2.get(editor).getSessionEnclosingRange();
				if (snippetsRange) {
					for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
						cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
					}
				}
			}
		}

		const ops = trimTrailingWhitespace(model, cursors);
		if (!ops.length) {
			return; // Nothing to do
		}

		model.pushEditOperations(prevSelection, ops, (_edits) => prevSelection);
	}
}

function findEditor(model: ITextModel, codeEditorService: ICodeEditorService): IActiveCodeEditor | null {
	let candidate: IActiveCodeEditor | null = null;

	if (model.isAttachedToEditor()) {
		for (const editor of codeEditorService.listCodeEditors()) {
			if (editor.hasModel() && editor.getModel() === model) {
				if (editor.hasTextFocus()) {
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
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	async participate(model: IResolvedTextFileEditorModel, _env: { reason: SaveReason; }): Promise<void> {
		if (this.configurationService.getValue('files.insertFinalNewline', { overrideIdentifier: model.textEditorModel.getLanguageIdentifier().language, resource: model.resource })) {
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

		const edits = [EditOperation.insert(new Position(lineCount, model.getLineMaxColumn(lineCount)), model.getEOL())];
		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			editor.executeEdits('insertFinalNewLine', edits, editor.getSelections());
		} else {
			model.pushEditOperations([], edits, () => null);
		}
	}
}

export class TrimFinalNewLinesParticipant implements ISaveParticipantParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ICodeEditorService private readonly codeEditorService: ICodeEditorService
	) {
		// Nothing
	}

	async participate(model: IResolvedTextFileEditorModel, env: { reason: SaveReason; }): Promise<void> {
		if (this.configurationService.getValue('files.trimFinalNewlines', { overrideIdentifier: model.textEditorModel.getLanguageIdentifier().language, resource: model.resource })) {
			this.doTrimFinalNewLines(model.textEditorModel, env.reason === SaveReason.AUTO);
		}
	}

	/**
	 * returns 0 if the entire file is empty or whitespace only
	 */
	private findLastLineWithContent(model: ITextModel): number {
		for (let lineNumber = model.getLineCount(); lineNumber >= 1; lineNumber--) {
			const lineContent = model.getLineContent(lineNumber);
			if (strings.lastNonWhitespaceIndex(lineContent) !== -1) {
				// this line has content
				return lineNumber;
			}
		}
		// no line has content
		return 0;
	}

	private doTrimFinalNewLines(model: ITextModel, isAutoSaved: boolean): void {
		const lineCount = model.getLineCount();

		// Do not insert new line if file does not end with new line
		if (lineCount === 1) {
			return;
		}

		let prevSelection: Selection[] = [];
		let cannotTouchLineNumber = 0;
		const editor = findEditor(model, this.codeEditorService);
		if (editor) {
			prevSelection = editor.getSelections();
			if (isAutoSaved) {
				for (let i = 0, len = prevSelection.length; i < len; i++) {
					const positionLineNumber = prevSelection[i].positionLineNumber;
					if (positionLineNumber > cannotTouchLineNumber) {
						cannotTouchLineNumber = positionLineNumber;
					}
				}
			}
		}

		const lastLineNumberWithContent = this.findLastLineWithContent(model);
		const deleteFromLineNumber = Math.max(lastLineNumberWithContent + 1, cannotTouchLineNumber + 1);
		const deletionRange = model.validateRange(new Range(deleteFromLineNumber, 1, lineCount, model.getLineMaxColumn(lineCount)));

		if (deletionRange.isEmpty()) {
			return;
		}

		model.pushEditOperations(prevSelection, [EditOperation.delete(deletionRange)], _edits => prevSelection);

		if (editor) {
			editor.setSelections(prevSelection);
		}
	}
}

class FormatOnSaveParticipant implements ISaveParticipantParticipant {

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@ICodeEditorService private readonly _codeEditorService: ICodeEditorService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) {
		// Nothing
	}

	async participate(editorModel: IResolvedTextFileEditorModel, env: { reason: SaveReason; }, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		const model = editorModel.textEditorModel;
		const overrides = { overrideIdentifier: model.getLanguageIdentifier().language, resource: model.uri };

		if (env.reason === SaveReason.AUTO || !this._configurationService.getValue('editor.formatOnSave', overrides)) {
			return undefined;
		}

		progress.report({ message: localize('formatting', "Formatting") });
		const editorOrModel = findEditor(model, this._codeEditorService) || model;
		await this._instantiationService.invokeFunction(formatDocumentWithSelectedProvider, editorOrModel, FormattingMode.Silent, token);
	}
}

class CodeActionOnSaveParticipant implements ISaveParticipantParticipant {

	constructor(
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
	) { }

	async participate(editorModel: IResolvedTextFileEditorModel, env: { reason: SaveReason; }, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		if (env.reason === SaveReason.AUTO) {
			return undefined;
		}

		const model = editorModel.textEditorModel;

		const settingsOverrides = { overrideIdentifier: model.getLanguageIdentifier().language, resource: editorModel.resource };
		const setting = this._configurationService.getValue<ICodeActionsOnSaveOptions>('editor.codeActionsOnSave', settingsOverrides);
		if (!setting) {
			return undefined;
		}

		const codeActionsOnSave = Object.keys(setting)
			.filter(x => setting[x]).map(x => new CodeActionKind(x))
			.sort((a, b) => {
				if (CodeActionKind.SourceFixAll.contains(a)) {
					if (CodeActionKind.SourceFixAll.contains(b)) {
						return 0;
					}
					return -1;
				}
				if (CodeActionKind.SourceFixAll.contains(b)) {
					return 1;
				}
				return 0;
			});

		if (!codeActionsOnSave.length) {
			return undefined;
		}

		const excludedActions = Object.keys(setting)
			.filter(x => setting[x] === false)
			.map(x => new CodeActionKind(x));

		progress.report({ message: localize('codeaction', "Quick Fixes") });
		await this.applyOnSaveActions(model, codeActionsOnSave, excludedActions, token);
	}

	private async applyOnSaveActions(model: ITextModel, codeActionsOnSave: readonly CodeActionKind[], excludes: readonly CodeActionKind[], token: CancellationToken): Promise<void> {
		for (const codeActionKind of codeActionsOnSave) {
			const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludes, token);
			try {
				await this.applyCodeActions(actionsToRun.validActions);
			} catch {
				// Failure to apply a code action should not block other on save actions
			} finally {
				actionsToRun.dispose();
			}
		}
	}

	private async applyCodeActions(actionsToRun: readonly CodeAction[]) {
		for (const action of actionsToRun) {
			await this._instantiationService.invokeFunction(applyCodeAction, action);
		}
	}

	private getActionsToRun(model: ITextModel, codeActionKind: CodeActionKind, excludes: readonly CodeActionKind[], token: CancellationToken) {
		return getCodeActions(model, model.getFullModelRange(), {
			type: CodeActionTriggerType.Auto,
			filter: { include: codeActionKind, excludes: excludes, includeSourceActions: true },
		}, token);
	}
}

class ExtHostSaveParticipant implements ISaveParticipantParticipant {

	private readonly _proxy: ExtHostDocumentSaveParticipantShape;

	constructor(extHostContext: IExtHostContext) {
		this._proxy = extHostContext.getProxy(ExtHostContext.ExtHostDocumentSaveParticipant);
	}

	async participate(editorModel: IResolvedTextFileEditorModel, env: { reason: SaveReason; }, _progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		if (!shouldSynchronizeModel(editorModel.textEditorModel)) {
			// the model never made it to the extension
			// host meaning we cannot participate in its save
			return undefined;
		}

		return new Promise<any>((resolve, reject) => {

			token.onCancellationRequested(() => reject(canceled()));

			setTimeout(
				() => reject(new Error(localize('timeout.onWillSave', "Aborted onWillSaveTextDocument-event after 1750ms"))),
				1750
			);
			this._proxy.$participateInSave(editorModel.resource, env.reason).then(values => {
				if (!values.every(success => success)) {
					return Promise.reject(new Error('listener failed'));
				}
				return undefined;
			}).then(resolve, reject);
		});
	}
}

// The save participant can change a model before its saved to support various scenarios like trimming trailing whitespace
@extHostCustomer
export class SaveParticipant implements ISaveParticipant {

	private readonly _saveParticipants: IdleValue<ISaveParticipantParticipant[]>;

	constructor(
		extHostContext: IExtHostContext,
		@IInstantiationService instantiationService: IInstantiationService,
		@IProgressService private readonly _progressService: IProgressService,
		@ILogService private readonly _logService: ILogService,
		@ILabelService private readonly _labelService: ILabelService,
		@ITextFileService private readonly _textFileService: ITextFileService
	) {
		this._saveParticipants = new IdleValue(() => [
			instantiationService.createInstance(TrimWhitespaceParticipant),
			instantiationService.createInstance(CodeActionOnSaveParticipant),
			instantiationService.createInstance(FormatOnSaveParticipant),
			instantiationService.createInstance(FinalNewLineParticipant),
			instantiationService.createInstance(TrimFinalNewLinesParticipant),
			instantiationService.createInstance(ExtHostSaveParticipant, extHostContext),
		]);
		// Set as save participant for all text files
		this._textFileService.saveParticipant = this;
	}

	dispose(): void {
		this._textFileService.saveParticipant = undefined;
		this._saveParticipants.dispose();
	}

	async participate(model: IResolvedTextFileEditorModel, env: { reason: SaveReason; }): Promise<void> {

		const cts = new CancellationTokenSource();

		return this._progressService.withProgress({
			title: localize('saveParticipants', "Running Save Participants for '{0}'", this._labelService.getUriLabel(model.resource, { relative: true })),
			location: ProgressLocation.Notification,
			cancellable: true,
			delay: model.isDirty() ? 3000 : 5000
		}, async progress => {

			for (let p of this._saveParticipants.getValue()) {

				if (cts.token.isCancellationRequested) {
					break;
				}
				try {
					const promise = p.participate(model, env, progress, cts.token);
					await raceCancellation(promise, cts.token);
				} catch (err) {
					this._logService.warn(err);
				}
			}

		}, () => {
			// user cancel
			cts.dispose(true);
		});
	}
}
