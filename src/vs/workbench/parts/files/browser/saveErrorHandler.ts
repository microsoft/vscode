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
import { EditorInputAction } from 'vs/workbench/browser/parts/editor/baseEditor';
import { SaveFileAsAction, RevertFileAction, SaveFileAction } from 'vs/workbench/parts/files/browser/fileActions';
import { IFileOperationResult, FileOperationResult } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextFileService, ISaveErrorHandler, ITextFileEditorModel } from 'vs/workbench/services/textfile/common/textfiles';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { IMessageService, IMessageWithAction, Severity, CancelAction } from 'vs/platform/message/common/message';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IDisposable, dispose } from 'vs/base/common/lifecycle';
import { IWorkbenchContribution } from 'vs/workbench/common/contributions';
import { TextFileEditorModel } from 'vs/workbench/services/textfile/common/textFileEditorModel';
import { ITextModelResolverService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { IModel } from 'vs/editor/common/editorCommon';
import { toResource } from 'vs/workbench/common/editor';

export const CONFLICT_RESOLUTION_SCHEME = 'conflictResolution';

// A handler for save error happening with conflict resolution actions
export class SaveErrorHandler implements ISaveErrorHandler, IWorkbenchContribution, ITextModelContentProvider {
	private messages: { [resource: string]: () => void };
	private toUnbind: IDisposable[];

	constructor(
		@IMessageService private messageService: IMessageService,
		@ITextFileService private textFileService: ITextFileService,
		@ITextModelResolverService private textModelResolverService: ITextModelResolverService,
		@IModelService private modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.messages = Object.create(null);
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

		// Make sure our file from disk is resolved up to date
		return this.textFileService.resolveTextContent(URI.file(resource.fsPath)).then(content => {
			let codeEditorModel = this.modelService.getModel(resource);
			if (!codeEditorModel) {
				codeEditorModel = this.modelService.createModel(content.value, this.modeService.getOrCreateModeByFilenameOrFirstLine(resource.fsPath), resource);
			} else {
				this.modelService.updateModel(codeEditorModel, content.value);
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
	}

	private onFileSavedOrReverted(resource: URI): void {
		const hideMessage = this.messages[resource.toString()];
		if (hideMessage) {
			hideMessage();
			this.messages[resource.toString()] = void 0;
		}
	}

	public onSaveError(error: any, model: ITextFileEditorModel): void {
		let message: IMessageWithAction;
		const resource = model.getResource();

		// Dirty write prevention
		if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
			message = this.instantiationService.createInstance(ResolveSaveConflictMessage, model, null);
		}

		// Any other save error
		else {
			const isReadonly = (<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_READ_ONLY;
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
		this.messages[model.getResource().toString()] = this.messageService.show(Severity.Error, message);
	}

	public dispose(): void {
		this.toUnbind = dispose(this.toUnbind);
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

						// We have to bring the model into conflict resolution mode to prevent subsequent save erros when the user makes edits
						this.model.setConflictResolutionMode();

						// Inform user
						pendingResolveSaveConflictMessages.push(this.messageService.show(Severity.Info, nls.localize('userGuide', "Use the actions in the editor tool bar to either **undo** your changes or **overwrite** the content on disk with your changes")));
					});
				}

				return TPromise.as(true);
			})
		];
	}
}

// Accept changes to resolve a conflicting edit
export class AcceptLocalChangesAction extends EditorInputAction {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextModelResolverService private resolverService: ITextModelResolverService
	) {
		super('workbench.files.action.acceptLocalChanges', nls.localize('acceptLocalChanges', "Use local changes and overwrite disk contents"), 'conflict-editor-action accept-changes');
	}

	public run(): TPromise<void> {
		return this.resolverService.createModelReference(toResource(this.input, { supportSideBySide: true })).then(reference => {
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
					return this.editorService.openEditor({ resource: model.getResource() }, this.position).then(() => {

						// Clean up
						this.input.dispose();
						reference.dispose();
					});
				});
			});
		});
	}
}

// Revert changes to resolve a conflicting edit
export class RevertLocalChangesAction extends EditorInputAction {

	constructor(
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService,
		@ITextModelResolverService private resolverService: ITextModelResolverService
	) {
		super('workbench.action.files.revert', nls.localize('revertLocalChanges', "Discard local changes and revert to content on disk"), 'conflict-editor-action revert-changes');
	}

	public run(): TPromise<void> {
		return this.resolverService.createModelReference(toResource(this.input, { supportSideBySide: true })).then(reference => {
			const model = reference.object as ITextFileEditorModel;

			clearPendingResolveSaveConflictMessages(); // hide any previously shown message about how to use these actions

			// Revert on model
			return model.revert().then(() => {

				// Reopen file input
				return this.editorService.openEditor({ resource: model.getResource() }, this.position).then(() => {

					// Clean up
					this.input.dispose();
					reference.dispose();
				});
			});
		});
	}
}