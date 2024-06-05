/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { HierarchicalKind } from 'vs/base/common/hierarchicalKind';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { CodeActionProvider, CodeActionTriggerType, IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { IReadonlyTextBuffer, ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionItem, CodeActionKind, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/common/types';
import { FormattingMode, getDocumentFormattingEditsWithSelectedProvider } from 'vs/editor/contrib/format/browser/format';
import { SnippetController2 } from 'vs/editor/contrib/snippet/browser/snippetController2';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { SaveReason } from 'vs/workbench/common/editor';
import { getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookTextModel';
import { CellKind, NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookFileWorkingCopyModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { IStoredFileWorkingCopySaveParticipant, IStoredFileWorkingCopySaveParticipantContext, IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';

class FormatOnSaveParticipant implements IStoredFileWorkingCopySaveParticipant {
	constructor(
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) { }

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		if (context.reason === SaveReason.AUTO) {
			return undefined;
		}

		const enabled = this.configurationService.getValue<boolean>(NotebookSetting.formatOnSave);
		if (!enabled) {
			return undefined;
		}
		progress.report({ message: localize('notebookFormatSave.formatting', "Formatting") });

		const notebook = workingCopy.model.notebookModel;
		const formatApplied: boolean = await this.instantiationService.invokeFunction(CodeActionParticipantUtils.checkAndRunFormatCodeAction, notebook, progress, token);

		const disposable = new DisposableStore();
		try {
			if (!formatApplied) {
				const allCellEdits = await Promise.all(notebook.cells.map(async cell => {
					const ref = await this.textModelService.createModelReference(cell.uri);
					disposable.add(ref);

					const model = ref.object.textEditorModel;

					const formatEdits = await getDocumentFormattingEditsWithSelectedProvider(
						this.editorWorkerService,
						this.languageFeaturesService,
						model,
						FormattingMode.Silent,
						token
					);

					const edits: ResourceTextEdit[] = [];

					if (formatEdits) {
						edits.push(...formatEdits.map(edit => new ResourceTextEdit(model.uri, edit, model.getVersionId())));
						return edits;
					}

					return [];
				}));

				await this.bulkEditService.apply(/* edit */allCellEdits.flat(), { label: localize('formatNotebook', "Format Notebook"), code: 'undoredo.formatNotebook', });
			}
		} finally {
			progress.report({ increment: 100 });
			disposable.dispose();
		}
	}
}

class TrimWhitespaceParticipant implements IStoredFileWorkingCopySaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
	) { }

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, _token: CancellationToken): Promise<void> {
		const trimTrailingWhitespaceOption = this.configurationService.getValue<boolean>('files.trimTrailingWhitespace');
		const trimInRegexAndStrings = this.configurationService.getValue<boolean>('files.trimTrailingWhitespaceInRegexAndStrings');
		if (trimTrailingWhitespaceOption) {
			await this.doTrimTrailingWhitespace(workingCopy, context.reason === SaveReason.AUTO, trimInRegexAndStrings, progress);
		}
	}

	private async doTrimTrailingWhitespace(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, isAutoSaved: boolean, trimInRegexesAndStrings: boolean, progress: IProgress<IProgressStep>) {
		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		const disposable = new DisposableStore();
		const notebook = workingCopy.model.notebookModel;
		const activeCellEditor = getActiveCellCodeEditor(this.editorService);

		let cursors: Position[] = [];
		let prevSelection: Selection[] = [];
		try {
			const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
				if (cell.cellKind !== CellKind.Code) {
					return [];
				}

				const ref = await this.textModelService.createModelReference(cell.uri);
				disposable.add(ref);
				const model = ref.object.textEditorModel;

				const isActiveCell = (activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString());
				if (isActiveCell) {
					prevSelection = activeCellEditor.getSelections() ?? [];
					if (isAutoSaved) {
						cursors = prevSelection.map(s => s.getPosition()); // get initial cursor positions
						const snippetsRange = SnippetController2.get(activeCellEditor)?.getSessionEnclosingRange();
						if (snippetsRange) {
							for (let lineNumber = snippetsRange.startLineNumber; lineNumber <= snippetsRange.endLineNumber; lineNumber++) {
								cursors.push(new Position(lineNumber, model.getLineMaxColumn(lineNumber)));
							}
						}
					}
				}

				const ops = trimTrailingWhitespace(model, cursors, trimInRegexesAndStrings);
				if (!ops.length) {
					return []; // Nothing to do
				}

				return ops.map(op => new ResourceTextEdit(model.uri, { ...op, text: op.text || '' }, model.getVersionId()));
			}));

			const filteredEdits = allCellEdits.flat().filter(edit => edit !== undefined) as ResourceEdit[];
			await this.bulkEditService.apply(filteredEdits, { label: localize('trimNotebookWhitespace', "Notebook Trim Trailing Whitespace"), code: 'undoredo.notebookTrimTrailingWhitespace' });

		} finally {
			progress.report({ increment: 100 });
			disposable.dispose();
		}
	}
}

class TrimFinalNewLinesParticipant implements IStoredFileWorkingCopySaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IEditorService private readonly editorService: IEditorService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
	) { }

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, _token: CancellationToken): Promise<void> {
		if (this.configurationService.getValue<boolean>('files.trimFinalNewlines')) {
			await this.doTrimFinalNewLines(workingCopy, context.reason === SaveReason.AUTO, progress);
		}
	}

	/**
	 * returns 0 if the entire file is empty
	 */
	private findLastNonEmptyLine(textBuffer: IReadonlyTextBuffer): number {
		for (let lineNumber = textBuffer.getLineCount(); lineNumber >= 1; lineNumber--) {
			const lineLength = textBuffer.getLineLength(lineNumber);
			if (lineLength) {
				// this line has content
				return lineNumber;
			}
		}
		// no line has content
		return 0;
	}

	private async doTrimFinalNewLines(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, isAutoSaved: boolean, progress: IProgress<IProgressStep>): Promise<void> {
		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		const disposable = new DisposableStore();
		const notebook = workingCopy.model.notebookModel;
		const activeCellEditor = getActiveCellCodeEditor(this.editorService);

		try {
			const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
				if (cell.cellKind !== CellKind.Code) {
					return;
				}

				// autosave -- don't trim every trailing line, just up to the cursor line
				let cannotTouchLineNumber = 0;
				const isActiveCell = (activeCellEditor && cell.uri.toString() === activeCellEditor.getModel()?.uri.toString());
				if (isAutoSaved && isActiveCell) {
					const selections = activeCellEditor.getSelections() ?? [];
					for (const sel of selections) {
						cannotTouchLineNumber = Math.max(cannotTouchLineNumber, sel.selectionStartLineNumber);
					}
				}

				const textBuffer = cell.textBuffer;
				const lastNonEmptyLine = this.findLastNonEmptyLine(textBuffer);
				const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
				if (deleteFromLineNumber > textBuffer.getLineCount()) {
					return;
				}

				const deletionRange = new Range(deleteFromLineNumber, 1, textBuffer.getLineCount(), textBuffer.getLineLastNonWhitespaceColumn(textBuffer.getLineCount()));
				if (deletionRange.isEmpty()) {
					return;
				}

				// create the edit to delete all lines in deletionRange
				return new ResourceTextEdit(cell.uri, { range: deletionRange, text: '' }, cell.textModel?.getVersionId());
			}));

			const filteredEdits = allCellEdits.flat().filter(edit => edit !== undefined) as ResourceEdit[];
			await this.bulkEditService.apply(filteredEdits, { label: localize('trimNotebookNewlines', "Trim Final New Lines"), code: 'undoredo.trimFinalNewLines' });

		} finally {
			progress.report({ increment: 100 });
			disposable.dispose();
		}
	}
}

class InsertFinalNewLineParticipant implements IStoredFileWorkingCopySaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@IEditorService private readonly editorService: IEditorService,
	) { }

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, _token: CancellationToken): Promise<void> {
		// waiting on notebook-specific override before this feature can sync with 'files.insertFinalNewline'
		// if (this.configurationService.getValue('files.insertFinalNewline')) {

		if (this.configurationService.getValue<boolean>(NotebookSetting.insertFinalNewline)) {
			await this.doInsertFinalNewLine(workingCopy, context.reason === SaveReason.AUTO, progress);
		}
	}

	private async doInsertFinalNewLine(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, isAutoSaved: boolean, progress: IProgress<IProgressStep>): Promise<void> {
		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		const disposable = new DisposableStore();
		const notebook = workingCopy.model.notebookModel;

		// get initial cursor positions
		const activeCellEditor = getActiveCellCodeEditor(this.editorService);
		let selections;
		if (activeCellEditor) {
			selections = activeCellEditor.getSelections() ?? [];
		}

		try {
			const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
				if (cell.cellKind !== CellKind.Code) {
					return;
				}

				const lineCount = cell.textBuffer.getLineCount();
				const lastLineIsEmptyOrWhitespace = cell.textBuffer.getLineFirstNonWhitespaceColumn(lineCount) === 0;

				if (!lineCount || lastLineIsEmptyOrWhitespace) {
					return;
				}

				return new ResourceTextEdit(cell.uri, { range: new Range(lineCount + 1, cell.textBuffer.getLineLength(lineCount), lineCount + 1, cell.textBuffer.getLineLength(lineCount)), text: cell.textBuffer.getEOL() }, cell.textModel?.getVersionId());
			}));

			const filteredEdits = allCellEdits.filter(edit => edit !== undefined) as ResourceEdit[];
			await this.bulkEditService.apply(filteredEdits, { label: localize('insertFinalNewLine', "Insert Final New Line"), code: 'undoredo.insertFinalNewLine' });

			// set cursor back to initial position after inserting final new line
			if (activeCellEditor && selections) {
				activeCellEditor.setSelections(selections);
			}
		} finally {
			progress.report({ increment: 100 });
			disposable.dispose();
		}
	}
}

class CodeActionOnSaveParticipant implements IStoredFileWorkingCopySaveParticipant {
	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
	}

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: IStoredFileWorkingCopySaveParticipantContext, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		const isTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
		if (!isTrusted) {
			return;
		}

		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		let saveTrigger = '';
		if (context.reason === SaveReason.AUTO) {
			// currently this won't happen, as vs/editor/contrib/codeAction/browser/codeAction.ts L#104 filters out codeactions on autosave. Just future-proofing
			// ? notebook CodeActions on autosave seems dangerous (perf-wise)
			// saveTrigger = 'always'; // TODO@Yoyokrazy, support during debt
			return undefined;
		} else if (context.reason === SaveReason.EXPLICIT) {
			saveTrigger = 'explicit';
		} else {
			// 	SaveReason.FOCUS_CHANGE, WINDOW_CHANGE need to be addressed when autosaves are enabled
			return undefined;
		}

		const notebookModel = workingCopy.model.notebookModel;

		const setting = this.configurationService.getValue<{ [kind: string]: string | boolean }>(NotebookSetting.codeActionsOnSave);
		const settingItems: string[] = Array.isArray(setting)
			? setting
			: Object.keys(setting).filter(x => setting[x]);

		const allCodeActions = this.createCodeActionsOnSave(settingItems);
		const excludedActions = allCodeActions
			.filter(x => setting[x.value] === 'never' || setting[x.value] === false);
		const includedActions = allCodeActions
			.filter(x => setting[x.value] === saveTrigger || setting[x.value] === true);

		const editorCodeActionsOnSave = includedActions.filter(x => !CodeActionKind.Notebook.contains(x));
		const notebookCodeActionsOnSave = includedActions.filter(x => CodeActionKind.Notebook.contains(x));

		// run notebook code actions
		if (notebookCodeActionsOnSave.length) {
			const nbDisposable = new DisposableStore();
			progress.report({ message: localize('notebookSaveParticipants.notebookCodeActions', "Running 'Notebook' code actions") });
			try {
				const cell = notebookModel.cells[0];
				const ref = await this.textModelService.createModelReference(cell.uri);
				nbDisposable.add(ref);

				const textEditorModel = ref.object.textEditorModel;

				await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, notebookCodeActionsOnSave, excludedActions, progress, token);
			} catch {
				this.logService.error('Failed to apply notebook code action on save');
			} finally {
				progress.report({ increment: 100 });
				nbDisposable.dispose();
			}
		}

		// run cell level code actions
		if (editorCodeActionsOnSave.length) {
			// prioritize `source.fixAll` code actions
			if (!Array.isArray(setting)) {
				editorCodeActionsOnSave.sort((a, b) => {
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
			}

			const cellDisposable = new DisposableStore();
			progress.report({ message: localize('notebookSaveParticipants.cellCodeActions', "Running 'Cell' code actions") });
			try {
				await Promise.all(notebookModel.cells.map(async cell => {
					const ref = await this.textModelService.createModelReference(cell.uri);
					cellDisposable.add(ref);

					const textEditorModel = ref.object.textEditorModel;

					await this.instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveGenericCodeActions, textEditorModel, editorCodeActionsOnSave, excludedActions, progress, token);
				}));
			} catch {
				this.logService.error('Failed to apply code action on save');
			} finally {
				progress.report({ increment: 100 });
				cellDisposable.dispose();
			}
		}
	}

	private createCodeActionsOnSave(settingItems: readonly string[]): HierarchicalKind[] {
		const kinds = settingItems.map(x => new HierarchicalKind(x));

		// Remove subsets
		return kinds.filter(kind => {
			return kinds.every(otherKind => otherKind.equals(kind) || !otherKind.contains(kind));
		});
	}
}

export class CodeActionParticipantUtils {

	static async checkAndRunFormatCodeAction(
		accessor: ServicesAccessor,
		notebookModel: NotebookTextModel,
		progress: IProgress<IProgressStep>,
		token: CancellationToken): Promise<boolean> {

		const instantiationService: IInstantiationService = accessor.get(IInstantiationService);
		const textModelService: ITextModelService = accessor.get(ITextModelService);
		const logService: ILogService = accessor.get(ILogService);
		const configurationService: IConfigurationService = accessor.get(IConfigurationService);

		const formatDisposable = new DisposableStore();
		let formatResult: boolean = false;
		progress.report({ message: localize('notebookSaveParticipants.formatCodeActions', "Running 'Format' code actions") });
		try {
			const cell = notebookModel.cells[0];
			const ref = await textModelService.createModelReference(cell.uri);
			formatDisposable.add(ref);
			const textEditorModel = ref.object.textEditorModel;

			const defaultFormatterExtId = configurationService.getValue<string | undefined>(NotebookSetting.defaultFormatter);
			formatResult = await instantiationService.invokeFunction(CodeActionParticipantUtils.applyOnSaveFormatCodeAction, textEditorModel, new HierarchicalKind('notebook.format'), [], defaultFormatterExtId, progress, token);
		} catch {
			logService.error('Failed to apply notebook format action on save');
		} finally {
			progress.report({ increment: 100 });
			formatDisposable.dispose();
		}
		return formatResult;
	}

	static async applyOnSaveGenericCodeActions(
		accessor: ServicesAccessor,
		model: ITextModel,
		codeActionsOnSave: readonly HierarchicalKind[],
		excludes: readonly HierarchicalKind[],
		progress: IProgress<IProgressStep>,
		token: CancellationToken): Promise<void> {

		const instantiationService: IInstantiationService = accessor.get(IInstantiationService);
		const languageFeaturesService: ILanguageFeaturesService = accessor.get(ILanguageFeaturesService);
		const logService: ILogService = accessor.get(ILogService);

		const getActionProgress = new class implements IProgress<CodeActionProvider> {
			private _names = new Set<string>();
			private _report(): void {
				progress.report({
					message: localize(
						{ key: 'codeaction.get2', comment: ['[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}'] },
						"Getting code actions from '{0}' ([configure]({1})).",
						[...this._names].map(name => `'${name}'`).join(', '),
						'command:workbench.action.openSettings?%5B%22notebook.codeActionsOnSave%22%5D'
					)
				});
			}
			report(provider: CodeActionProvider) {
				if (provider.displayName && !this._names.has(provider.displayName)) {
					this._names.add(provider.displayName);
					this._report();
				}
			}
		};

		for (const codeActionKind of codeActionsOnSave) {
			const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludes, languageFeaturesService, getActionProgress, token);
			if (token.isCancellationRequested) {
				actionsToRun.dispose();
				return;
			}

			try {
				for (const action of actionsToRun.validActions) {
					const codeActionEdits = action.action.edit?.edits;
					let breakFlag = false;
					if (!action.action.kind?.startsWith('notebook')) {
						for (const edit of codeActionEdits ?? []) {
							const workspaceTextEdit = edit as IWorkspaceTextEdit;
							if (workspaceTextEdit.resource && isEqual(workspaceTextEdit.resource, model.uri)) {
								continue;
							} else {
								// error -> applied to multiple resources
								breakFlag = true;
								break;
							}
						}
					}
					if (breakFlag) {
						logService.warn('Failed to apply code action on save, applied to multiple resources.');
						continue;
					}
					progress.report({ message: localize('codeAction.apply', "Applying code action '{0}'.", action.action.title) });
					await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
					if (token.isCancellationRequested) {
						return;
					}
				}
			} catch {
				// Failure to apply a code action should not block other on save actions
			} finally {
				actionsToRun.dispose();
			}
		}
	}

	static async applyOnSaveFormatCodeAction(
		accessor: ServicesAccessor,
		model: ITextModel,
		formatCodeActionOnSave: HierarchicalKind,
		excludes: readonly HierarchicalKind[],
		extensionId: string | undefined,
		progress: IProgress<IProgressStep>,
		token: CancellationToken): Promise<boolean> {

		const instantiationService: IInstantiationService = accessor.get(IInstantiationService);
		const languageFeaturesService: ILanguageFeaturesService = accessor.get(ILanguageFeaturesService);
		const logService: ILogService = accessor.get(ILogService);

		const getActionProgress = new class implements IProgress<CodeActionProvider> {
			private _names = new Set<string>();
			private _report(): void {
				progress.report({
					message: localize(
						{ key: 'codeaction.get2', comment: ['[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}'] },
						"Getting code actions from '{0}' ([configure]({1})).",
						[...this._names].map(name => `'${name}'`).join(', '),
						'command:workbench.action.openSettings?%5B%22notebook.defaultFormatter%22%5D'
					)
				});
			}
			report(provider: CodeActionProvider) {
				if (provider.displayName && !this._names.has(provider.displayName)) {
					this._names.add(provider.displayName);
					this._report();
				}
			}
		};

		const providedActions = await CodeActionParticipantUtils.getActionsToRun(model, formatCodeActionOnSave, excludes, languageFeaturesService, getActionProgress, token);
		// warn the user if there are more than one provided format action, and there is no specified defaultFormatter
		if (providedActions.validActions.length > 1 && !extensionId) {
			logService.warn('More than one format code action is provided, the 0th one will be used. A default can be specified via `notebook.defaultFormatter` in your settings.');
		}

		if (token.isCancellationRequested) {
			providedActions.dispose();
			return false;
		}

		try {
			const action: CodeActionItem | undefined = extensionId ? providedActions.validActions.find(action => action.provider?.extensionId === extensionId) : providedActions.validActions[0];
			if (!action) {
				return false;
			}

			progress.report({ message: localize('codeAction.apply', "Applying code action '{0}'.", action.action.title) });
			await instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
			if (token.isCancellationRequested) {
				return false;
			}
		} catch {
			logService.error('Failed to apply notebook format code action on save');
			return false;
		} finally {
			providedActions.dispose();
		}
		return true;
	}

	// @Yoyokrazy this could likely be modified to leverage the extensionID, therefore not getting actions from providers unnecessarily -- future work
	static getActionsToRun(model: ITextModel, codeActionKind: HierarchicalKind, excludes: readonly HierarchicalKind[], languageFeaturesService: ILanguageFeaturesService, progress: IProgress<CodeActionProvider>, token: CancellationToken) {
		return getCodeActions(languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
			type: CodeActionTriggerType.Invoke,
			triggerAction: CodeActionTriggerSource.OnSave,
			filter: { include: codeActionKind, excludes: excludes, includeSourceActions: true },
		}, progress, token);
	}

}

function getActiveCellCodeEditor(editorService: IEditorService): ICodeEditor | undefined {
	const activePane = editorService.activeEditorPane;
	const notebookEditor = getNotebookEditorFromEditorPane(activePane);
	const activeCodeEditor = notebookEditor?.activeCodeEditor;
	return activeCodeEditor;
}

export class SaveParticipantsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService) {

		super();
		this.registerSaveParticipants();
	}

	private registerSaveParticipants(): void {
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimWhitespaceParticipant)));
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(InsertFinalNewLineParticipant)));
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
