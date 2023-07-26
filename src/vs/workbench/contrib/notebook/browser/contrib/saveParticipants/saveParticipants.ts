/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { CancellationToken } from 'vs/base/common/cancellation';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IBulkEditService, ResourceTextEdit } from 'vs/editor/browser/services/bulkEditService';
import { IEditorWorkerService } from 'vs/editor/common/services/editorWorker';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { getDocumentFormattingEditsUntilResult } from 'vs/editor/contrib/format/browser/format';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IProgress, IProgressStep } from 'vs/platform/progress/common/progress';
import { Registry } from 'vs/platform/registry/common/platform';
import { IWorkbenchContribution, IWorkbenchContributionsRegistry, Extensions as WorkbenchContributionsExtensions } from 'vs/workbench/common/contributions';
import { SaveReason } from 'vs/workbench/common/editor';
import { NotebookFileWorkingCopyModel } from 'vs/workbench/contrib/notebook/common/notebookEditorModel';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import { IStoredFileWorkingCopy, IStoredFileWorkingCopyModel } from 'vs/workbench/services/workingCopy/common/storedFileWorkingCopy';
import { IStoredFileWorkingCopySaveParticipant, IWorkingCopyFileService } from 'vs/workbench/services/workingCopy/common/workingCopyFileService';
import { NotebookSetting } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { ITextModel } from 'vs/editor/common/model';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';
import { CodeActionKind, CodeActionTriggerSource } from 'vs/editor/contrib/codeAction/common/types';
import { CodeActionTriggerType, CodeActionProvider, IWorkspaceTextEdit } from 'vs/editor/common/languages';
import { applyCodeAction, ApplyCodeActionReason, getCodeActions } from 'vs/editor/contrib/codeAction/browser/codeAction';
import { isEqual } from 'vs/base/common/resources';

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

			await this.bulkEditService.apply(/* edit */allCellEdits.flat(), { label: localize('label', "Format Notebook"), code: 'undoredo.formatNotebook', });

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



export class SaveParticipantsContribution extends Disposable implements IWorkbenchContribution {
	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IWorkingCopyFileService private readonly workingCopyFileService: IWorkingCopyFileService) {

		super();
		this.registerSaveParticipants();
	}

	private registerSaveParticipants(): void {
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(CodeActionOnSaveParticipant)));
		this._register(this.workingCopyFileService.addSaveParticipant(this.instantiationService.createInstance(FormatOnSaveParticipant)));
	}
}

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchContributionsExtensions.Workbench);
workbenchContributionsRegistry.registerWorkbenchContribution(SaveParticipantsContribution, LifecyclePhase.Restored);
