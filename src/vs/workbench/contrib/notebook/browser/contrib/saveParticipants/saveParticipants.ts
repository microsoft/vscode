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
import { ICommandService } from 'vs/platform/commands/common/commands';
import { ILogService } from 'vs/platform/log/common/log';
import { IWorkspaceTrustManagementService } from 'vs/platform/workspace/common/workspaceTrust';

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
		@ICommandService private readonly commandService: ICommandService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceTrustManagementService private readonly workspaceTrustManagementService: IWorkspaceTrustManagementService,
	) {
	}

	async participate(workingCopy: IStoredFileWorkingCopy<IStoredFileWorkingCopyModel>, context: { reason: SaveReason }, progress: IProgress<IProgressStep>, _token: CancellationToken): Promise<void> {
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

		const setting = this.configurationService.getValue<{ [kind: string]: boolean } | string[]>('notebook.experimental.codeActionsOnSave');
		if (!setting) {
			return undefined;
		}

		const settingItems: string[] = Array.isArray(setting)
			? setting
			: Object.keys(setting).filter(x => setting[x]);

		if (!settingItems.length) {
			return undefined;
		}

		progress.report({ message: 'CodeActionsOnSave running' });
		const disposable = new DisposableStore();
		try {
			for (const cmd of settingItems) {
				await this.commandService.executeCommand(cmd);
			}
		} catch {
			// Failure to apply a code action should not block other on save actions
			this.logService.warn('CodeActionsOnSave failed to apply a code action');
		} finally {
			progress.report({ increment: 100 });
			disposable.dispose();
		}
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
