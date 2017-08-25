/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { TPromise } from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import { toErrorMessage } from 'vs/base/common/errorMessage';
import paths = require('vs/base/common/paths');
import { Action } from 'vs/base/common/actions';
import URI from 'vs/base/common/uri';
import { SaveFileAsAction, RevertFileAction, SaveFileAction } from 'vs/workbench/parts/files/browser/fileActions';
import { FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService, ISaveErrorHandler, ITextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService, ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IMessageWithAction, Severity, CancelAction } from 'vs/platform/message/common/message';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModel } from 'vs/editor/common/editorCommon';
import { ResourceMap } from 'vs/base/common/map';
import { IEditorGroupService } from 'vs/workbench/services/group/common/groupService';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { ResourceEditorInput } from 'vs/workbench/common/editor/resourceEditorInput';
import { IContextKeyService, IContextKey, RawContextKey } from 'vs/platform/contextkey/common/contextkey';
import { IMode } from 'vs/editor/common/modes';

export const CONFLICT_RESOLUTION_CONTEXT = 'saveConflictResolutionContext';
export const CONFLICT_RESOLUTION_SCHEME = 'conflictResolution';

// A handler for save error happening with conflict resolution actions
export class SaveErrorHandler implements ISaveErrorHandler, IWorkbenchContribution, ITextModelContentProvider {
	private messages: ResourceMap<() => void>;
	private toUnbind: IDisposable[];
	private conflictResolutionContext: IContextKey<boolean>;

	constructor(
		@IMessageService private messageService: IMessageService,
		@ITextFileService private textFileService: ITextFileService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEditorGroupService private editorGroupService: IEditorGroupService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		this.messages = new ResourceMap<() => void>();
		this.conflictResolutionContext = new RawContextKey<boolean>(CONFLICT_RESOLUTION_CONTEXT, false).bindTo(contextKeyService);
		this.toUnbind = [];

		// Register as text model content provider that supports to load a resource as it actually
		// is stored on disk as opposed to using the file:// scheme that will return a dirty buffer
		// if there is one.
		this.textModelResolverService.registerTextModelContentProvider(CONFLICT_RESOLUTION_SCHEME, this);

		// Hook into model
		TextFileEditorModel.setSaveErrorHandler(this);

		this.registerListeners();
	}

	public provideTextContent(resource: URI): TPromise<IModel> {
		const fileOnDiskResource = URI.file(resource.fsPath);

		// Make sure our file from disk is resolved up to date
		return this.textFileService.resolveTextContent(fileOnDiskResource).then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (codeEditorModel) {
				this.modelService.updateModel(codeEditorModel, content.value);
			} else {
				const fileOnDiskModel = this.modelService.getModel(fileOnDiskResource);

				let mode: TPromise<IMode>;
				if (fileOnDiskModel) {
					mode = this.modeService.getOrCreateMode(fileOnDiskModel.getModeId());
				} else {
					mode = this.modeService.getOrCreateModeByFilenameOrFirstLine(fileOnDiskResource.fsPath);
				}

				codeEditorModel = this.modelService.createModel(content.value, mode, resource);
			}

			return codeEditorModel;
		});
	}

	public getId(): string {
		return 'vs.files.saveerrorhandler';
	}

	private registerListeners(): void {
		this.toUnbind.push(this.textFileService.models.onModelSaved(e => this.onFileSavedOrReverted(e.resource)));
		this.toUnbind.push(this.textFileService.models.onModelReverted(e => this.onFileSavedOrReverted(e.resource)));
		this.toUnbind.push(this.editorGroupService.onEditorsChanged(() => this.onEditorsChanged()));
	}

	private onEditorsChanged(): void {
		let isActiveEditorSaveConflictResolution = false;
		const activeEditor = this.editorService.getActiveEditor();

		if (activeEditor && activeEditor.input instanceof DiffEditorInput && activeEditor.input.originalInput instanceof ResourceEditorInput) {
			const resource = activeEditor.input.originalInput.getResource();
			isActiveEditorSaveConflictResolution = resource && resource.scheme === CONFLICT_RESOLUTION_SCHEME;
		}

		this.conflictResolutionContext.set(isActiveEditorSaveConflictResolution);
	}

	private onFileSavedOrReverted(resource: URI): void {
		const hideMessage = this.messages.get(resource);
		if (hideMessage) {
			hideMessage();
			this.messages.delete(resource);
		}
	}

	public onSaveError(error: any, model: ITextFileEditorModel): void {
		let message: IMessageWithAction;
		const resource = model.getResource();

		// Dirty write prevention
		if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
			message = this.instantiationService.createInstance(ResolveSaveConflictMessage, model, null);
		}

		// Any other save error
		else {
			const isReadonly = (<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_READ_ONLY;
			const actions: Action[] = [];

			// Save As
			actions.push(new Action('workbench.files.action.saveAs', SaveFileAsAction.LABEL, null, true, () => {
				const saveAsAction = this.instantiationService.createInstance(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL);
				saveAsAction.setResource(resource);
				saveAsAction.run().done(() => saveAsAction.dispose(), errors.onUnexpectedError);

				return TPromise.as(true);
			}));

			// Discard
			actions.push(new Action('workbench.files.action.discard', nls.localize('discard', "Discard"), null, true, () => {
				const revertFileAction = this.instantiationService.createInstance(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL);
				revertFileAction.setResource(resource);
				revertFileAction.run().done(() => revertFileAction.dispose(), errors.onUnexpectedError);

				return TPromise.as(true);
			}));

			// Retry
			if (isReadonly) {
				actions.push(new Action('workbench.files.action.overwrite', nls.localize('overwrite', "Overwrite"), null, true, () => {
					if (!model.isDisposed()) {
						model.save({ overwriteReadonly: true }).done(null, errors.onUnexpectedError);
					}

					return TPromise.as(true);
				}));
			} else {
				actions.push(new Action('workbench.files.action.retry', nls.localize('retry', "Retry"), null, true, () => {
					const saveFileAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
					saveFileAction.setResource(resource);
					saveFileAction.run().done(() => saveFileAction.dispose(), errors.onUnexpectedError);

					return TPromise.as(true);
				}));
			}

			// Cancel
			actions.push(CancelAction);

			let errorMessage: string;
			if (isReadonly) {
				errorMessage = nls.localize('readonlySaveError', "Failed to save '{0}': File is write protected. Select 'Overwrite' to remove protection.", paths.basename(resource.fsPath));
			} else {
				errorMessage = nls.localize('genericSaveError', "Failed to save '{0}': {1}", paths.basename(resource.fsPath), toErrorMessage(error, false));
			}

			message = {
				message: errorMessage,
				actions
			};
		}

		// Show message and keep function to hide in case the file gets saved/reverted
		this.messages.set(model.getResource(), this.messageService.show(Severity.Error, message));
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);

		this.messages.clear();
	}
}

const pendingResolveSaveConflictMessages: Function[] = [];
function clearPendingResolveSaveConflictMessages(): void {
	while (pendingResolveSaveConflictMessages.length > 0) {
		pendingResolveSaveConflictMessages.pop()();
	}
}

// A message with action to resolve a save conflict
class ResolveSaveConflictMessage implements IMessageWithAction {
	public message: string;
	public actions: Action[];

	private model: ITextFileEditorModel;

	constructor(
		model: ITextFileEditorModel,
		message: string,
		@IMessageService private messageService: IMessageService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@IEnvironmentService private environmentService: IEnvironmentService
	) {
		this.model = model;

		const resource = model.getResource();
		if (message) {
			this.message = message;
		} else {
			this.message = nls.localize('staleSaveError', "Failed to save '{0}': The content on disk is newer. Click on **Compare** to compare your version with the one on disk.", paths.basename(resource.fsPath));
		}

		this.actions = [
			new Action('workbench.files.action.resolveConflict', nls.localize('compareChanges', "Compare"), null, true, () => {
				if (!this.model.isDisposed()) {
					const name = paths.basename(resource.fsPath);
					const editorLabel = nls.localize('saveConflictDiffLabel', "{0} (on disk) ↔ {1} (in {2}) - Resolve save conflict", name, name, this.environmentService.appNameLong);

					return this.editorService.openEditor({ leftResource: URI.from({ scheme: CONFLICT_RESOLUTION_SCHEME, path: resource.fsPath }), rightResource: resource, label: editorLabel, options: { pinned: true } }).then(() => {

						// Inform user
						pendingResolveSaveConflictMessages.push(this.messageService.show(Severity.Info, nls.localize('userGuide', "Use the actions in the editor tool bar to the right to either **undo** your changes or **overwrite** the content on disk with your changes")));
					});
				}

				return TPromise.as(true);
			})
		];
	}
}

export const acceptLocalChangesCommand = (accessor: ServicesAccessor, resource: URI) => {
	const editorService = accessor.get(IWorkbenchEditorService);
	const resolverService = accessor.get(ITextModelService);

	const editor = editorService.getActiveEditor();
	const input = editor.input;
	const position = editor.position;

	resolverService.createModelReference(resource).then(reference => {
		const model = reference.object as ITextFileEditorModel;
		const localModelValue = model.getValue();

		clearPendingResolveSaveConflictMessages(); // hide any previously shown message about how to use these actions

		// revert to be able to save
		return model.revert().then(() => {

			// Restore user value
			model.textEditorModel.setValue(localModelValue);

			// Trigger save
			return model.save().then(() => {

				// Reopen file input
				return editorService.openEditor({ resource: model.getResource() }, position).then(() => {

					// Clean up
					input.dispose();
					reference.dispose();
				});
			});
		});
	});
};

export const revertLocalChangesCommand = (accessor: ServicesAccessor, resource: URI) => {
	const editorService = accessor.get(IWorkbenchEditorService);
	const resolverService = accessor.get(ITextModelService);

	const editor = editorService.getActiveEditor();
	const input = editor.input;
	const position = editor.position;

	resolverService.createModelReference(resource).then(reference => {
		const model = reference.object as ITextFileEditorModel;

		clearPendingResolveSaveConflictMessages(); // hide any previously shown message about how to use these actions

		// Revert on model
		return model.revert().then(() => {

			// Reopen file input
			return editorService.openEditor({ resource: model.getResource() }, position).then(() => {

				// Clean up
				input.dispose();
				reference.dispose();
			});
		});
	});
};
