/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { IDisposable, toDisposable } from 'vs/base/common/lifecycle';
import { LinkedList } from 'vs/base/common/linkedList';
import { ResourceMap, ResourceSet } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor, isCodeEditor, isDiffEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditOptions, IBulkEditPreviewHandler, IBulkEditResult, IBulkEditService, ResourceEdit, ResourceFileEdit, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { EditorOption } from 'vs/editor/common/config/editorOptions';
import { WorkspaceEdit } from 'vs/editor/common/languages';
import { localize } from 'vs/nls';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { Extensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { IDialogService } from 'vs/platform/dialogs/common/dialogs';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IProgress, IProgressStep, Progress } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { UndoRedoGroup, UndoRedoSource } from 'vs/platform/undoRedo/common/undoRedo';
import { BulkCellEdits, ResourceNotebookCellEdit } from 'vs/workbench/contrib/bulkEdit/browser/bulkCellEdits';
import { BulkFileEdits } from 'vs/workbench/contrib/bulkEdit/browser/bulkFileEdits';
import { BulkTextEdits } from 'vs/workbench/contrib/bulkEdit/browser/bulkTextEdits';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ILifecycleService, ShutdownReason } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IWorkingCopyService } from 'vs/workbench/services/workingCopy/common/workingCopyService';

function liftEdits(edits: ResourceEdit[]): ResourceEdit[] {
	return edits.map(edit => {
		if (ResourceTextEdit.is(edit)) {
			return ResourceTextEdit.lift(edit);
		}
		if (ResourceFileEdit.is(edit)) {
			return ResourceFileEdit.lift(edit);
		}
		if (ResourceNotebookCellEdit.is(edit)) {
			return ResourceNotebookCellEdit.lift(edit);
		}
		throw new Error('Unsupported edit');
	});
}

class BulkEdit {

	constructor(
		private readonly _label: string | undefined,
		private readonly _code: string | undefined,
		private readonly _editor: ICodeEditor | undefined,
		private readonly _progress: IProgress<IProgressStep>,
		private readonly _token: CancellationToken,
		private readonly _edits: ResourceEdit[],
		private readonly _undoRedoGroup: UndoRedoGroup,
		private readonly _undoRedoSource: UndoRedoSource | undefined,
		private readonly _confirmBeforeUndo: boolean,
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
	) {

	}

	ariaMessage(): string {

		const otherResources = new ResourceMap<boolean>();
		const textEditResources = new ResourceMap<boolean>();
		let textEditCount = 0;
		for (const edit of this._edits) {
			if (edit instanceof ResourceTextEdit) {
				textEditCount += 1;
				textEditResources.set(edit.resource, true);
			} else if (edit instanceof ResourceFileEdit) {
				otherResources.set(edit.oldResource ?? edit.newResource!, true);
			}
		}
		if (this._edits.length === 0) {
			return localize('summary.0', "Made no edits");
		} else if (otherResources.size === 0) {
			if (textEditCount > 1 && textEditResources.size > 1) {
				return localize('summary.nm', "Made {0} text edits in {1} files", textEditCount, textEditResources.size);
			} else {
				return localize('summary.n0', "Made {0} text edits in one file", textEditCount);
			}
		} else {
			return localize('summary.textFiles', "Made {0} text edits in {1} files, also created or deleted {2} files", textEditCount, textEditResources.size, otherResources.size);
		}
	}

	async perform(): Promise<readonly URI[]> {

		if (this._edits.length === 0) {
			return [];
		}

		const ranges: number[] = [1];
		for (let i = 1; i < this._edits.length; i++) {
			if (Object.getPrototypeOf(this._edits[i - 1]) === Object.getPrototypeOf(this._edits[i])) {
				ranges[ranges.length - 1]++;
			} else {
				ranges.push(1);
			}
		}

		// Show infinte progress when there is only 1 item since we do not know how long it takes
		const increment = this._edits.length > 1 ? 0 : undefined;
		this._progress.report({ increment, total: 100 });
		// Increment by percentage points since progress API expects that
		const progress: IProgress<void> = { report: _ => this._progress.report({ increment: 100 / this._edits.length }) };

		const resources: (readonly URI[])[] = [];
		let index = 0;
		for (const range of ranges) {
			if (this._token.isCancellationRequested) {
				break;
			}
			const group = this._edits.slice(index, index + range);
			if (group[0] instanceof ResourceFileEdit) {
				resources.push(await this._performFileEdits(<ResourceFileEdit[]>group, this._undoRedoGroup, this._undoRedoSource, this._confirmBeforeUndo, progress));
			} else if (group[0] instanceof ResourceTextEdit) {
				resources.push(await this._performTextEdits(<ResourceTextEdit[]>group, this._undoRedoGroup, this._undoRedoSource, progress));
			} else if (group[0] instanceof ResourceNotebookCellEdit) {
				resources.push(await this._performCellEdits(<ResourceNotebookCellEdit[]>group, this._undoRedoGroup, this._undoRedoSource, progress));
			} else {
				console.log('UNKNOWN EDIT');
			}
			index = index + range;
		}

		return resources.flat();
	}

	private async _performFileEdits(edits: ResourceFileEdit[], undoRedoGroup: UndoRedoGroup, undoRedoSource: UndoRedoSource | undefined, confirmBeforeUndo: boolean, progress: IProgress<void>): Promise<readonly URI[]> {
		this._logService.debug('_performFileEdits', JSON.stringify(edits));
		const model = this._instaService.createInstance(BulkFileEdits, this._label || localize('workspaceEdit', "Workspace Edit"), this._code || 'undoredo.workspaceEdit', undoRedoGroup, undoRedoSource, confirmBeforeUndo, progress, this._token, edits);
		return await model.apply();
	}

	private async _performTextEdits(edits: ResourceTextEdit[], undoRedoGroup: UndoRedoGroup, undoRedoSource: UndoRedoSource | undefined, progress: IProgress<void>): Promise<readonly URI[]> {
		this._logService.debug('_performTextEdits', JSON.stringify(edits));
		const model = this._instaService.createInstance(BulkTextEdits, this._label || localize('workspaceEdit', "Workspace Edit"), this._code || 'undoredo.workspaceEdit', this._editor, undoRedoGroup, undoRedoSource, progress, this._token, edits);
		return await model.apply();
	}

	private async _performCellEdits(edits: ResourceNotebookCellEdit[], undoRedoGroup: UndoRedoGroup, undoRedoSource: UndoRedoSource | undefined, progress: IProgress<void>): Promise<readonly URI[]> {
		this._logService.debug('_performCellEdits', JSON.stringify(edits));
		const model = this._instaService.createInstance(BulkCellEdits, undoRedoGroup, undoRedoSource, progress, this._token, edits);
		return await model.apply();
	}
}

export class BulkEditService implements IBulkEditService {

	declare readonly _serviceBrand: undefined;

	private readonly _activeUndoRedoGroups = new LinkedList<UndoRedoGroup>();
	private _previewHandler?: IBulkEditPreviewHandler;

	constructor(
		@IInstantiationService private readonly _instaService: IInstantiationService,
		@ILogService private readonly _logService: ILogService,
		@IEditorService private readonly _editorService: IEditorService,
		@ILifecycleService private readonly _lifecycleService: ILifecycleService,
		@IDialogService private readonly _dialogService: IDialogService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@IConfigurationService private readonly _configService: IConfigurationService,
	) { }

	setPreviewHandler(handler: IBulkEditPreviewHandler): IDisposable {
		this._previewHandler = handler;
		return toDisposable(() => {
			if (this._previewHandler === handler) {
				this._previewHandler = undefined;
			}
		});
	}

	hasPreviewHandler(): boolean {
		return Boolean(this._previewHandler);
	}

	async apply(editsIn: ResourceEdit[] | WorkspaceEdit, options?: IBulkEditOptions): Promise<IBulkEditResult> {
		let edits = liftEdits(Array.isArray(editsIn) ? editsIn : editsIn.edits);

		if (edits.length === 0) {
			return { ariaSummary: localize('nothing', "Made no edits"), isApplied: false };
		}

		if (this._previewHandler && (options?.showPreview || edits.some(value => value.metadata?.needsConfirmation))) {
			edits = await this._previewHandler(edits, options);
		}

		let codeEditor = options?.editor;
		// try to find code editor
		if (!codeEditor) {
			const candidate = this._editorService.activeTextEditorControl;
			if (isCodeEditor(candidate)) {
				codeEditor = candidate;
			} else if (isDiffEditor(candidate)) {
				codeEditor = candidate.getModifiedEditor();
			}
		}

		if (codeEditor && codeEditor.getOption(EditorOption.readOnly)) {
			// If the code editor is readonly still allow bulk edits to be applied #68549
			codeEditor = undefined;
		}

		// undo-redo-group: if a group id is passed then try to find it
		// in the list of active edits. otherwise (or when not found)
		// create a separate undo-redo-group
		let undoRedoGroup: UndoRedoGroup | undefined;
		let undoRedoGroupRemove = () => { };
		if (typeof options?.undoRedoGroupId === 'number') {
			for (const candidate of this._activeUndoRedoGroups) {
				if (candidate.id === options.undoRedoGroupId) {
					undoRedoGroup = candidate;
					break;
				}
			}
		}
		if (!undoRedoGroup) {
			undoRedoGroup = new UndoRedoGroup();
			undoRedoGroupRemove = this._activeUndoRedoGroups.push(undoRedoGroup);
		}

		const label = options?.quotableLabel || options?.label;
		const bulkEdit = this._instaService.createInstance(
			BulkEdit,
			label,
			options?.code,
			codeEditor,
			options?.progress ?? Progress.None,
			options?.token ?? CancellationToken.None,
			edits,
			undoRedoGroup,
			options?.undoRedoSource,
			!!options?.confirmBeforeUndo
		);

		let listener: IDisposable | undefined;
		try {
			listener = this._lifecycleService.onBeforeShutdown(e => e.veto(this._shouldVeto(label, e.reason), 'veto.blukEditService'));
			const resources = await bulkEdit.perform();

			// when enabled (option AND setting) loop over all dirty working copies and trigger save
			// for those that were involved in this bulk edit operation.
			if (options?.respectAutoSaveConfig && this._configService.getValue(autoSaveSetting) === true && resources.length > 1) {
				await this._saveAll(resources);
			}

			return { ariaSummary: bulkEdit.ariaMessage(), isApplied: edits.length > 0 };
		} catch (err) {
			// console.log('apply FAILED');
			// console.log(err);
			this._logService.error(err);
			throw err;
		} finally {
			listener?.dispose();
			undoRedoGroupRemove();
		}
	}

	private async _saveAll(resources: readonly URI[]) {
		const set = new ResourceSet(resources);
		const saves = this._workingCopyService.dirtyWorkingCopies.map(async (copy) => {
			if (set.has(copy.resource)) {
				await copy.save();
			}
		});

		const result = await Promise.allSettled(saves);
		for (const item of result) {
			if (item.status === 'rejected') {
				this._logService.warn(item.reason);
			}
		}
	}

	private async _shouldVeto(label: string | undefined, reason: ShutdownReason): Promise<boolean> {
		let message: string;
		let primaryButton: string;
		switch (reason) {
			case ShutdownReason.CLOSE:
				message = localize('closeTheWindow.message', "Are you sure you want to close the window?");
				primaryButton = localize({ key: 'closeTheWindow', comment: ['&& denotes a mnemonic'] }, "&&Close Window");
				break;
			case ShutdownReason.LOAD:
				message = localize('changeWorkspace.message', "Are you sure you want to change the workspace?");
				primaryButton = localize({ key: 'changeWorkspace', comment: ['&& denotes a mnemonic'] }, "Change &&Workspace");
				break;
			case ShutdownReason.RELOAD:
				message = localize('reloadTheWindow.message', "Are you sure you want to reload the window?");
				primaryButton = localize({ key: 'reloadTheWindow', comment: ['&& denotes a mnemonic'] }, "&&Reload Window");
				break;
			default:
				message = localize('quit.message', "Are you sure you want to quit?");
				primaryButton = localize({ key: 'quit', comment: ['&& denotes a mnemonic'] }, "&&Quit");
				break;
		}

		const result = await this._dialogService.confirm({
			message,
			detail: localize('areYouSureQuiteBulkEdit.detail', "'{0}' is in progress.", label || localize('fileOperation', "File operation")),
			primaryButton
		});

		return !result.confirmed;
	}
}

registerSingleton(IBulkEditService, BulkEditService, InstantiationType.Delayed);

const autoSaveSetting = 'files.refactoring.autoSave';

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'files',
	properties: {
		[autoSaveSetting]: {
			description: localize('refactoring.autoSave', "Controls if files that were part of a refactoring are saved automatically"),
			default: true,
			type: 'boolean'
		}
	}
});
