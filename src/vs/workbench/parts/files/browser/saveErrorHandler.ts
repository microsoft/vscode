/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Promise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import paths = require('vs/base/common/paths');
import {Action} from 'vs/base/common/actions';
import {guessMimeTypes} from 'vs/base/common/mime';
import {EditorInputAction} from 'vs/workbench/browser/parts/editor/baseEditor';
import {ResourceEditorInput} from 'vs/workbench/browser/parts/editor/resourceEditorInput';
import {TextResourceEditorModel} from 'vs/workbench/browser/parts/editor/resourceEditorModel';
import {DiffEditorInput} from 'vs/workbench/browser/parts/editor/diffEditorInput';
import {DiffEditorModel} from 'vs/workbench/browser/parts/editor/diffEditorModel';
import {FileEditorInput} from 'vs/workbench/parts/files/browser/editors/fileEditorInput';
import {SaveFileAsAction, RevertFileAction, SaveFileAction} from 'vs/workbench/parts/files/browser/fileActions';
import {IFileOperationResult, FileOperationResult} from 'vs/platform/files/common/files';
import {TextFileEditorModel, ISaveErrorHandler} from 'vs/workbench/parts/files/browser/editors/textFileEditorModel';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IEventService} from 'vs/platform/event/common/event';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, IMessageWithAction, Severity, CancelAction} from 'vs/platform/message/common/message';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';

// A handler for save error happening with conflict resolution actions
export class SaveErrorHandler implements ISaveErrorHandler {

	constructor(
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
	}

	public onSaveError(error: any, model: TextFileEditorModel): void {
		let message: IMessageWithAction;

		// Dirty write prevention
		if ((<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
			message = this.instantiationService.createInstance(ResolveSaveConflictMessage, model, null);
		}

		// Any other save error
		else {
			let isReadonly = (<IFileOperationResult>error).fileOperationResult === FileOperationResult.FILE_READ_ONLY;
			let actions: Action[] = [];

			// Cancel
			actions.push(CancelAction);

			// Retry
			if (isReadonly) {
				actions.push(new Action('workbench.files.action.overwrite', nls.localize('overwrite', "Overwrite"), null, true, () => {
					if (!model.isDisposed()) {
						return model.save(true /* overwrite readonly */).then(() => true);
					}

					return Promise.as(true);
				}));
			} else {
				actions.push(new Action('workbench.files.action.retry', nls.localize('retry', "Retry"), null, true, () => {
					let saveFileAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
					saveFileAction.setResource(model.getResource());

					return saveFileAction.run().then(() => { saveFileAction.dispose(); return true; });
				}));
			}

			// Discard
			actions.push(new Action('workbench.files.action.discard', nls.localize('discard', "Discard"), null, true, () => {
				let revertFileAction = this.instantiationService.createInstance(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL);
				revertFileAction.setResource(model.getResource());

				return revertFileAction.run().then(() => { revertFileAction.dispose(); return true; });
			}));

			// Save As
			actions.push(new Action('workbench.files.action.saveAs', SaveFileAsAction.LABEL, null, true, () => {
				let saveAsAction = this.instantiationService.createInstance(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL);
				saveAsAction.setResource(model.getResource());

				return saveAsAction.run().then(() => { saveAsAction.dispose(); return true; });
			}));

			let errorMessage: string;
			if (isReadonly) {
				errorMessage = nls.localize('readonlySaveError', "Failed to save '{0}': File is write protected. Select 'Overwrite' to remove protection.", paths.basename(model.getResource().fsPath));
			} else {
				errorMessage = nls.localize('genericSaveError', "Failed to save '{0}': {1}", paths.basename(model.getResource().fsPath), errors.toErrorMessage(error, false));
			}

			message = {
				message: errorMessage,
				actions: actions
			};
		}

		if (this.messageService) {
			this.messageService.show(Severity.Error, message);
		}
	}
}

// Save conflict resolution editor input
export class ConflictResolutionDiffEditorInput extends DiffEditorInput {

	public static ID = 'workbench.editors.files.conflictResolutionDiffEditorInput';

	private model: TextFileEditorModel;

	constructor(
		model: TextFileEditorModel,
		name: string,
		description: string,
		originalInput: ResourceEditorInput,
		modifiedInput: FileEditorInput,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IEventService private eventService: IEventService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super(name, description, originalInput, modifiedInput);

		this.model = model;
	}

	public getModel(): TextFileEditorModel {
		return this.model;
	}

	public getId(): string {
		return ConflictResolutionDiffEditorInput.ID;
	}
}

// A message with action to resolve a 412 save conflict
class ResolveSaveConflictMessage implements IMessageWithAction {
	public message: string;
	public actions: Action[];

	private model: TextFileEditorModel;

	constructor(
		model: TextFileEditorModel,
		message: string,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		this.model = model;

		if (message) {
			this.message = message;
		} else {
			this.message = nls.localize('staleSaveError', "Failed to save '{0}': The content on disk is newer. Click on **Compare** to compare your version with the one on disk.", paths.basename(this.model.getResource().fsPath));
		}

		this.actions = [
			new Action('workbench.files.action.resolveConflict', nls.localize('compareChanges', "Compare"), null, true, () => {
				if (!this.model.isDisposed()) {
					let mime = guessMimeTypes(this.model.getResource().fsPath).join(', ');
					let originalInput = this.instantiationService.createInstance(ResourceEditorInput, paths.basename(this.model.getResource().fsPath), this.model.getResource().fsPath, this.model.getResource().toString(), mime, void 0, void 0, void 0);
					let modifiedInput = this.instantiationService.createInstance(FileEditorInput, this.model.getResource(), mime, void 0);
					let conflictInput = this.instantiationService.createInstance(ConflictResolutionDiffEditorInput, this.model, nls.localize('saveConflictDiffLabel', "{0} - on disk ↔ in {1}", modifiedInput.getName(), this.contextService.getConfiguration().env.appName), nls.localize('resolveSaveConflict', "{0} - Resolve save conflict", modifiedInput.getDescription()), originalInput, modifiedInput);

					return this.editorService.openEditor(conflictInput).then(() => {

						// We have to bring the model into conflict resolution mode to prevent subsequent save erros when the user makes edits
						this.model.setConflictResolutionMode();

						// Inform user
						this.messageService.show(Severity.Info, nls.localize('userGuide', "Use the actions in the editor tool bar to either **undo** your changes or **overwrite** the content on disk with your changes"));
					});
				}

				return Promise.as(true);
			})
		];
	}
}

// Accept changes to resolve a conflicting edit
export class AcceptLocalChangesAction extends EditorInputAction {
	private messagesToHide: { (): void; }[];

	constructor(
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super('workbench.files.action.acceptLocalChanges', nls.localize('acceptLocalChanges', "Use local changes and overwrite disk contents"), 'conflict-editor-action accept-changes');

		this.messagesToHide = [];
	}

	public run(): Promise {
		let conflictInput = <ConflictResolutionDiffEditorInput>this.input;
		let model = conflictInput.getModel();
		let localModelValue = model.getValue();

		// 1.) Get the diff editor model from cache (resolve(false)) to have access to the mtime of the file we currently show to the left
		return conflictInput.resolve(false).then((diffModel: DiffEditorModel) => {
			let knownLastModified = (<TextResourceEditorModel>diffModel.originalModel).getLastModified();

			// 2.) Revert the model to get the latest copy from disk and to have access to the mtime of the file now
			return model.revert().then(() => {
				let diskLastModified = model.getLastModifiedTime();

				// 3. a) If we know that the file on the left hand side was not modified meanwhile, restore the user value and trigger a save
				if (diskLastModified <= knownLastModified) {

					// Restore user value
					model.textEditorModel.setValue(localModelValue);

					// Trigger save
					return model.save().then(() => {

						// Hide any previously shown messages
						while (this.messagesToHide.length) {
							this.messagesToHide.pop()();
						}

						// Reopen file input
						let input = this.instantiationService.createInstance(FileEditorInput, model.getResource(), guessMimeTypes(model.getResource().fsPath).join(', '), void 0);
						return this.editorService.openEditor(input, null, this.position).then(() => {

							// Dispose conflict input
							conflictInput.dispose();
						});
					});
				}

				// 3. b) The file was changed on disk while it was shown in the conflict editor
				else {

					// Again, we have to bring the model into conflict resolution because revert() would have cleared it
					model.setConflictResolutionMode();

					// Restore user value
					model.textEditorModel.setValue(localModelValue);

					// Reload the left hand side of the diff editor to show the up to date version and inform the user that he has to redo the action
					return (<TextResourceEditorModel>diffModel.originalModel).load().then(() => {
						this.messagesToHide.push(this.messageService.show(Severity.Info, nls.localize('conflictingFileHasChanged', "The content of the file on disk has changed and the left hand side of the compare editor was refreshed. Please review and resolve again.")));
					});
				}
			});
		});
	}
}

// Revert changes to resolve a conflicting edit
export class RevertLocalChangesAction extends EditorInputAction {

	constructor(
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super('workbench.action.files.revert', nls.localize('revertLocalChanges', "Discard local changes and revert to content on disk"), 'conflict-editor-action revert-changes');
	}

	public run(): Promise {
		let conflictInput = <ConflictResolutionDiffEditorInput>this.input;
		let model = conflictInput.getModel();

		// Revert on model
		return model.revert().then(() => {

			// Reopen file input
			let input = this.instantiationService.createInstance(FileEditorInput, model.getResource(), guessMimeTypes(model.getResource().fsPath).join(', '), void 0);
			return this.editorService.openEditor(input, null, this.position).then(() => {

				// Dispose conflict input
				conflictInput.dispose();
			});
		});
	}
}