/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { isEqual } from 'vs/base/common/resources';
import * as strings from 'vs/base/common/strings';
import { IBulkEditService, ResourceEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { trimTrailingWhitespace } from 'vs/editor/common/commands/trimTrailingWhitespaceCommand';
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { CodeActionProvider, CodeActionTriggerType, IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { ApplyCodeActionReason, applyCodeAction, getCodeActions } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { CodeActionKind, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/common/types';
import { getDocumentFormattingEditsUntilResult } from 'vs/editor/contrib/format/browser/format';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { SaveReason } from 'vs/workbench/common/editor';
import { ICellViewModel, getNotebookEditorFromEditorPane } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { NotebookFileWorkingCopyModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { IStoredFileWorkingCopySaveParticipant, IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';

const NotebookCodeAction = new CodeActionKind('notebook');

class FormatOnSaveParticipant implements IStoredFileWorkingCopySaveParticipant {
	constructor(
		@IEditorWorkerService private readonly editorWorkerService: IEditorWorkerService,
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
	}

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
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

		const notebook = workingCopy.model.notebookModel;

		progress.report({ message: localize('notebookFormatSave.formatting', "Formatting") });
		const disposable = new DisposableStore();
		try {
			const allCellEdits = await Promise.all(notebook.cells.map(async cell => {
				const ref = await this.textModelService.createModelReference(cell.uri);
				disposable.add(ref);

				const model = ref.object.textEditorModel;

				const formatEdits = await getDocumentFormattingEditsUntilResult(
					this.editorWorkerService,
					this.languageFeaturesService,
					model,
					model.getOptions(),
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

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>, _token: CancellationToken): Promise<void> {
		if (this.configurationService.getValue<boolean>('files.trimTrailingWhitespace')) {
			await this.doTrimTrailingWhitespace(workingCopy, context, progress);
		}
	}

	private async doTrimTrailingWhitespace(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>) {
		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		const disposable = new DisposableStore();
		const notebook = workingCopy.model.notebookModel;

		const cursors: Position[] = [];
		let viewCell: ICellViewModel | undefined = undefined;

		// autosave -- don't trim entire line, only up to cursor, so need to track position of cursor(s)
		if (context.reason === SaveReason.AUTO) {
			viewCell = getNotebookViewCell(this.editorService);
			if (!viewCell) {
				return;
			}
			const selections = viewCell.getSelections();
			for (const sel of selections) {
				if (viewCell.model.textModel) {
					cursors.push(new Position(sel.selectionStartLineNumber, sel.startColumn));
				}
			}

		}

		try {
			const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
				if (cell.cellKind !== 2) {
					return [];
				}

				const ref = await this.textModelService.createModelReference(cell.uri);
				disposable.add(ref);
				const model = ref.object.textEditorModel;
				const ops = trimTrailingWhitespace(model, (viewCell && viewCell.model.textModel === model) ? cursors : []);
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
		@ITextModelService private readonly textModelService: ITextModelService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
	) { }

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>, _token: CancellationToken): Promise<void> {
		if (this.configurationService.getValue<boolean>('files.trimTrailingWhitespace')) {
			this.doTrimFinalNewLines(workingCopy, context, progress);
		}
	}

	/**
	 * returns 0 if the entire file is empty
	 */
	private findLastNonEmptyLine(model: ITextModel): number {
		for (let lineNumber = model.getLineCount(); lineNumber >= 1; lineNumber--) {
			const lineContent = model.getLineContent(lineNumber);
			if (lineContent.length > 0) {
				// this line has content
				return lineNumber;
			}
		}
		// no line has content
		return 0;
	}

	private async doTrimFinalNewLines(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>): Promise<void> {
		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		const disposable = new DisposableStore();
		const notebook = workingCopy.model.notebookModel;

		let cannotTouchLineNumber = 0;
		let viewCell: ICellViewModel | undefined = undefined;

		// autosave -- don't trim entire line, only up to cursor, so need to track position of cursor(s)
		if (context.reason === SaveReason.AUTO) {
			viewCell = getNotebookViewCell(this.editorService);
			if (!viewCell) {
				return;
			}
			const selections = viewCell.getSelections();
			for (const sel of selections) {
				if (viewCell.model.textModel) {
					cannotTouchLineNumber = Math.max(cannotTouchLineNumber, sel.selectionStartLineNumber);
				}
			}
		}


		try {
			const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
				if (cell.cellKind !== 2) {
					return;
				}

				const ref = await this.textModelService.createModelReference(cell.uri);
				disposable.add(ref);
				const model = ref.object.textEditorModel;

				const lastNonEmptyLine = this.findLastNonEmptyLine(model);
				const deleteFromLineNumber = Math.max(lastNonEmptyLine + 1, cannotTouchLineNumber + 1);
				const deletionRange = model.validateRange(new Range(deleteFromLineNumber, 1, model.getLineCount(), model.getLineMaxColumn(model.getLineCount())));

				if (deletionRange.isEmpty()) {
					return;
				}

				// create the edit to delete all lines in deletionRange
				return new ResourceTextEdit(model.uri, { range: deletionRange, text: '' }, model.getVersionId());
			}));

			const filteredEdits = allCellEdits.flat().filter(edit => edit !== undefined) as ResourceEdit[];
			await this.bulkEditService.apply(filteredEdits, { label: localize('trimNotebookNewlines', "Trim Final New Lines"), code: 'undoredo.trimFinalNewLines' });

		} finally {
			progress.report({ increment: 100 });
			disposable.dispose();
		}
	}
}

class FinalNewLineParticipant implements IStoredFileWorkingCopySaveParticipant {

	constructor(
		@IConfigurationService private readonly configurationService: IConfigurationService,
		// @IEditorService private readonly editorService: IEditorService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IBulkEditService private readonly bulkEditService: IBulkEditService,
	) { }

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>, _token: CancellationToken): Promise<void> {
		if (this.configurationService.getValue('files.insertFinalNewline')) {
			this.doInsertFinalNewLine(workingCopy, context, progress);
		}
	}

	private async doInsertFinalNewLine(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>): Promise<void> {
		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		const disposable = new DisposableStore();
		const notebook = workingCopy.model.notebookModel;

		try {
			const allCellEdits = await Promise.all(notebook.cells.map(async (cell) => {
				if (cell.cellKind !== 2) {
					return;
				}

				const ref = await this.textModelService.createModelReference(cell.uri);
				disposable.add(ref);
				const model = ref.object.textEditorModel;

				const lineCount = model.getLineCount();
				const lastLine = model.getLineContent(lineCount);
				const lastLineIsEmptyOrWhitespace = strings.lastNonWhitespaceIndex(lastLine) === -1;

				if (!lineCount || lastLineIsEmptyOrWhitespace) {
					return;
				}

				return new ResourceTextEdit(model.uri, { range: new Range(lineCount, model.getLineMaxColumn(lineCount), lineCount, model.getLineMaxColumn(lineCount)), text: model.getEOL() }, model.getVersionId());
			}));

			const filteredEdits = allCellEdits.flat().filter(edit => edit !== undefined) as ResourceEdit[];
			await this.bulkEditService.apply(filteredEdits, { label: localize('insertFinalNewLine', "Insert Final New Line"), code: 'undoredo.insertFinalNewLine' });

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
		@ILanguageFeaturesService private readonly languageFeaturesService: ILanguageFeaturesService,
		@ITextModelService private readonly textModelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
	}

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {
		const isTrusted = this.workspaceTrustManagementService.isWorkspaceTrusted();
		if (!isTrusted) {
			return;
		}

		if (!workingCopy.model || !(workingCopy.model instanceof NotebookFileWorkingCopyModel)) {
			return;
		}

		if (context.reason === SaveReason.AUTO) {
			return undefined;
		}

		const setting = this.configurationService.getValue<{ [kind: string]: boolean } | string[]>(NotebookSetting.codeActionsOnSave);
		if (!setting) {
			return undefined;
		}

		const notebookModel = workingCopy.model.notebookModel;

		const settingItems: string[] = Array.isArray(setting)
			? setting
			: Object.keys(setting).filter(x => setting[x]);

		if (!settingItems.length) {
			return undefined;
		}

		const codeActionsOnSave = this.createCodeActionsOnSave(settingItems).filter(x => !NotebookCodeAction.contains(x));
		const notebookCodeActionsOnSave = this.createCodeActionsOnSave(settingItems).filter(x => NotebookCodeAction.contains(x));

		// prioritize `source.fixAll` code actions
		if (!Array.isArray(setting)) {
			codeActionsOnSave.sort((a, b) => {
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




		if (!codeActionsOnSave.length && !notebookCodeActionsOnSave.length) {
			return undefined;
		}

		const excludedActions = Array.isArray(setting)
			? []
			: Object.keys(setting)
				.filter(x => setting[x] === false)
				.map(x => new CodeActionKind(x));

		const nbDisposable = new DisposableStore();

		// run notebook code actions
		progress.report({ message: localize('notebookSaveParticipants.notebookCodeActions', "Running 'Notebook' code actions") });
		try {
			const cell = notebookModel.cells[0];
			const ref = await this.textModelService.createModelReference(cell.uri);
			nbDisposable.add(ref);

			const textEditorModel = ref.object.textEditorModel;

			await this.applyOnSaveActions(textEditorModel, notebookCodeActionsOnSave, excludedActions, progress, token);
		} catch {
			this.logService.error('Failed to apply notebook code action on save');
		} finally {
			progress.report({ increment: 100 });
			nbDisposable.dispose();
		}

		// run cell level code actions
		const disposable = new DisposableStore();
		progress.report({ message: localize('notebookSaveParticipants.cellCodeActions', "Running code actions") });
		try {
			await Promise.all(notebookModel.cells.map(async cell => {
				const ref = await this.textModelService.createModelReference(cell.uri);
				disposable.add(ref);

				const textEditorModel = ref.object.textEditorModel;

				await this.applyOnSaveActions(textEditorModel, codeActionsOnSave, excludedActions, progress, token);
			}));
		} catch {
			this.logService.error('Failed to apply code action on save');
		} finally {
			progress.report({ increment: 100 });
			disposable.dispose();
		}
	}

	private createCodeActionsOnSave(settingItems: readonly string[]): CodeActionKind[] {
		const kinds = settingItems.map(x => new CodeActionKind(x));

		// Remove subsets
		return kinds.filter(kind => {
			return kinds.every(otherKind => otherKind.equals(kind) || !otherKind.contains(kind));
		});
	}

	private async applyOnSaveActions(model: ITextModel, codeActionsOnSave: readonly CodeActionKind[], excludes: readonly CodeActionKind[], progress: IProgress<IProgressStep>, token: CancellationToken): Promise<void> {

		const getActionProgress = new class implements IProgress<CodeActionProvider> {
			private _names = new Set<string>();
			private _report(): void {
				progress.report({
					message: localize(
						{ key: 'codeaction.get2', comment: ['[configure]({1}) is a link. Only translate `configure`. Do not change brackets and parentheses or {1}'] },
						"Getting code actions from '{0}' ([configure]({1})).",
						[...this._names].map(name => `'${name}'`).join(', '),
						'command:workbench.action.openSettings?%5B%22editor.codeActionsOnSave%22%5D'
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
			const actionsToRun = await this.getActionsToRun(model, codeActionKind, excludes, getActionProgress, token);
			if (token.isCancellationRequested) {
				actionsToRun.dispose();
				return;
			}

			try {
				for (const action of actionsToRun.validActions) {
					const codeActionEdits = action.action.edit?.edits;
					let breakFlag = false;
					if (!action.action.kind?.includes('notebook')) {
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
						this.logService.warn('Failed to apply code action on save, applied to multiple resources.');
						continue;
					}
					progress.report({ message: localize('codeAction.apply', "Applying code action '{0}'.", action.action.title) });
					await this.instantiationService.invokeFunction(applyCodeAction, action, ApplyCodeActionReason.OnSave, {}, token);
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

	private getActionsToRun(model: ITextModel, codeActionKind: CodeActionKind, excludes: readonly CodeActionKind[], progress: IProgress<CodeActionProvider>, token: CancellationToken) {
		return getCodeActions(this.languageFeaturesService.codeActionProvider, model, model.getFullModelRange(), {
			type: CodeActionTriggerType.Invoke,
			triggerAction: CodeActionTriggerSource.OnSave,
			filter: { include: codeActionKind, excludes: excludes, includeSourceActions: true },
		}, progress, token);
	}
}

function getNotebookViewCell(editorService: IEditorService): ICellViewModel | undefined {
	const activePane = editorService.activeEditorPane;
	const notebookEditor = getNotebookEditorFromEditorPane(activePane);
	const notebookViewModel = notebookEditor?.getViewModel();
	const cellSelections = notebookViewModel?.getSelections();
	if (!cellSelections || !notebookViewModel || !notebookEditor?.textModel) {
		return;
	}
	return notebookViewModel.viewCells[cellSelections[0].start];
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
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(FinalNewLineParticipant)));
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(TrimFinalNewLinesParticipant)));

	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
