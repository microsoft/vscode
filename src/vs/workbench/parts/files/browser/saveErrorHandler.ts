/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import nls = require('vs/nls');
import errors = require('vs/base/common/errors');
import paths = require('vs/base/common/paths');
import {Action} from 'vs/base/common/actions';
import URI from 'vs/base/common/uri';
import {EditorModel} from 'vs/workbench/common/editor';
import {guessMimeTypes} from 'vs/base/common/mime';
import {ResourceEditorInput} from 'vs/workbench/common/editor/resourceEditorInput';
import {DiffEditorInput} from 'vs/workbench/common/editor/diffEditorInput';
import {DiffEditorModel} from 'vs/workbench/common/editor/diffEditorModel';
import {Position} from 'vs/platform/editor/common/editor';
import {FileEditorInput} from 'vs/workbench/parts/files/common/editors/fileEditorInput';
import {SaveFileAsAction, RevertFileAction, SaveFileAction} from 'vs/workbench/parts/files/browser/fileActions';
import {IFileService, IFileOperationResult, FileOperationResult} from 'vs/platform/files/common/files';
import {TextFileEditorModel, ISaveErrorHandler} from 'vs/workbench/parts/files/common/editors/textFileEditorModel';
import {IWorkbenchEditorService} from 'vs/workbench/services/editor/common/editorService';
import {IEventService} from 'vs/platform/event/common/event';
import {EventType as FileEventType, TextFileChangeEvent, ITextFileService} from 'vs/workbench/parts/files/common/files';
import {IInstantiationService} from 'vs/platform/instantiation/common/instantiation';
import {IMessageService, IMessageWithAction, Severity, CancelAction} from 'vs/platform/message/common/message';
import {IWorkspaceContextService} from 'vs/platform/workspace/common/workspace';
import {IModeService} from 'vs/editor/common/services/modeService';
import {IModelService} from 'vs/editor/common/services/modelService';

// A handler for save error happening with conflict resolution actions
export class SaveErrorHandler implements ISaveErrorHandler {
	private messages: { [resource: string]: () => void };

	constructor(
		@IMessageService private messageService: IMessageService,
		@IEventService private eventService: IEventService,
		@IInstantiationService private instantiationService: IInstantiationService
	) {
		this.messages = Object.create(null);

		this.registerListeners();
	}

	private registerListeners(): void {
		this.eventService.addListener2(FileEventType.FILE_SAVED, (e: TextFileChangeEvent) => this.onFileSavedOrReverted(e.resource));
		this.eventService.addListener2(FileEventType.FILE_REVERTED, (e: TextFileChangeEvent) => this.onFileSavedOrReverted(e.resource));
	}

	private onFileSavedOrReverted(resource: URI): void {
		const hideMessage = this.messages[resource.toString()];
		if (hideMessage) {
			hideMessage();
			this.messages[resource.toString()] = void 0;
		}
	}

	public onSaveError(error: any, model: TextFileEditorModel): void {
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

			// Cancel
			actions.push(CancelAction);

			// Retry
			if (isReadonly) {
				actions.push(new Action('workbench.files.action.overwrite', nls.localize('overwrite', "Overwrite"), null, true, () => {
					if (!model.isDisposed()) {
						return model.save(true /* overwrite readonly */).then(() => true);
					}

					return TPromise.as(true);
				}));
			} else {
				actions.push(new Action('workbench.files.action.retry', nls.localize('retry', "Retry"), null, true, () => {
					const saveFileAction = this.instantiationService.createInstance(SaveFileAction, SaveFileAction.ID, SaveFileAction.LABEL);
					saveFileAction.setResource(resource);

					return saveFileAction.run().then(() => { saveFileAction.dispose(); return true; });
				}));
			}

			// Discard
			actions.push(new Action('workbench.files.action.discard', nls.localize('discard', "Discard"), null, true, () => {
				const revertFileAction = this.instantiationService.createInstance(RevertFileAction, RevertFileAction.ID, RevertFileAction.LABEL);
				revertFileAction.setResource(resource);

				return revertFileAction.run().then(() => { revertFileAction.dispose(); return true; });
			}));

			// Save As
			actions.push(new Action('workbench.files.action.saveAs', SaveFileAsAction.LABEL, null, true, () => {
				const saveAsAction = this.instantiationService.createInstance(SaveFileAsAction, SaveFileAsAction.ID, SaveFileAsAction.LABEL);
				saveAsAction.setResource(resource);

				return saveAsAction.run().then(() => { saveAsAction.dispose(); return true; });
			}));

			let errorMessage: string;
			if (isReadonly) {
				errorMessage = nls.localize('readonlySaveError', "Failed to save '{0}': File is write protected. Select 'Overwrite' to remove protection.", paths.basename(resource.fsPath));
			} else {
				errorMessage = nls.localize('genericSaveError', "Failed to save '{0}': {1}", paths.basename(resource.fsPath), errors.toErrorMessage(error, false));
			}

			message = {
				message: errorMessage,
				actions: actions
			};
		}

		// Show message and keep function to hide in case the file gets saved/reverted
		this.messages[model.getResource().toString()] = this.messageService.show(Severity.Error, message);
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
		originalInput: FileOnDiskEditorInput,
		modifiedInput: FileEditorInput
	) {
		super(name, description, originalInput, modifiedInput);

		this.model = model;
	}

	public getModel(): TextFileEditorModel {
		return this.model;
	}

	public getTypeId(): string {
		return ConflictResolutionDiffEditorInput.ID;
	}
}

export class FileOnDiskEditorInput extends ResourceEditorInput {
	private fileResource: URI;
	private lastModified: number;
	private mime: string;
	private createdEditorModel: boolean;

	constructor(
		fileResource: URI,
		mime: string,
		name: string,
		description: string,
		@IModelService modelService: IModelService,
		@IModeService private modeService: IModeService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IFileService private fileService: IFileService,
		@ITextFileService private textFileService: ITextFileService
	) {
		// We create a new resource URI here that is different from the file resource because we represent the state of
		// the file as it is on disk and not as it is (potentially cached) in Code. That allows us to have a different
		// model for the left-hand comparision compared to the conflicting one in Code to the right.
		super(name, description, URI.from({ scheme: 'disk', path: fileResource.fsPath }), modelService, instantiationService);

		this.fileResource = fileResource;
		this.mime = mime;
	}

	public getLastModified(): number {
		return this.lastModified;
	}

	public resolve(refresh?: boolean): TPromise<EditorModel> {

		// Make sure our file from disk is resolved up to date
		return this.textFileService.resolveTextContent(this.fileResource).then(content => {
			this.lastModified = content.mtime;

			const codeEditorModel = this.modelService.getModel(this.resource);
			if (!codeEditorModel) {
				this.modelService.createModel(content.value, this.modeService.getOrCreateMode(this.mime), this.resource);
				this.createdEditorModel = true;
			} else {
				codeEditorModel.setValueFromRawText(content.value);
			}

			return super.resolve(refresh);
		});
	}

	public dispose(): void {
		if (this.createdEditorModel) {
			this.modelService.destroyModel(this.resource);
			this.createdEditorModel = false;
		}

		super.dispose();
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

		const resource = model.getResource();
		if (message) {
			this.message = message;
		} else {
			this.message = nls.localize('staleSaveError', "Failed to save '{0}': The content on disk is newer. Click on **Compare** to compare your version with the one on disk.", paths.basename(resource.fsPath));
		}

		this.actions = [
			new Action('workbench.files.action.resolveConflict', nls.localize('compareChanges', "Compare"), null, true, () => {
				if (!this.model.isDisposed()) {
					const mime = guessMimeTypes(resource.fsPath).join(', ');
					const originalInput = this.instantiationService.createInstance(FileOnDiskEditorInput, resource, mime, paths.basename(resource.fsPath), resource.fsPath);
					const modifiedInput = this.instantiationService.createInstance(FileEditorInput, resource, mime, void 0);
					const conflictInput = this.instantiationService.createInstance(ConflictResolutionDiffEditorInput, this.model, nls.localize('saveConflictDiffLabel', "{0} - on disk ↔ in {1}", modifiedInput.getName(), this.contextService.getConfiguration().env.appName), nls.localize('resolveSaveConflict', "{0} - Resolve save conflict", modifiedInput.getDescription()), originalInput, modifiedInput);

					return this.editorService.openEditor(conflictInput).then(editor => {

						// We have to bring the model into conflict resolution mode to prevent subsequent save erros when the user makes edits
						this.model.setConflictResolutionMode();

						// Inform user
						this.messageService.show(Severity.Info, {
							message: nls.localize('userGuide', "Please either select **Revert** to discard your changes or **Overwrite** to replace the content on disk with your changes"),
							actions: [
								this.instantiationService.createInstance(AcceptLocalChangesAction, conflictInput, editor.position),
								this.instantiationService.createInstance(RevertLocalChangesAction, conflictInput, editor.position)
							]
						});
					});
				}

				return TPromise.as(true);
			})
		];
	}
}

// Accept changes to resolve a conflicting edit
export class AcceptLocalChangesAction extends Action {
	private messagesToHide: { (): void; }[];

	constructor(
		private input: ConflictResolutionDiffEditorInput,
		private position: Position,
		@IMessageService private messageService: IMessageService,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super('workbench.files.action.acceptLocalChanges', nls.localize('acceptLocalChanges', "Overwrite"), 'conflict-editor-action accept-changes');

		this.messagesToHide = [];
	}

	public run(): TPromise<void> {
		const conflictInput = this.input;
		const model = conflictInput.getModel();
		const localModelValue = model.getValue();

		// 1.) Get the diff editor model from cache (resolve(false)) to have access to the mtime of the file we currently show to the left
		return conflictInput.resolve(false).then((diffModel: DiffEditorModel) => {
			const knownLastModified = (<FileOnDiskEditorInput>conflictInput.originalInput).getLastModified();

			// 2.) Revert the model to get the latest copy from disk and to have access to the mtime of the file now
			return model.revert().then(() => {
				const diskLastModified = model.getLastModifiedTime();

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
						const input = this.instantiationService.createInstance(FileEditorInput, model.getResource(), guessMimeTypes(model.getResource().fsPath).join(', '), void 0);
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
					return conflictInput.originalInput.resolve(true).then(() => {
						this.messagesToHide.push(this.messageService.show(Severity.Info, nls.localize('conflictingFileHasChanged', "The content of the file on disk has changed and the left hand side of the compare editor was refreshed. Please review and resolve again.")));
					});
				}
			});
		});
	}
}

// Revert changes to resolve a conflicting edit
export class RevertLocalChangesAction extends Action {

	constructor(
		private input: ConflictResolutionDiffEditorInput,
		private position: Position,
		@IInstantiationService private instantiationService: IInstantiationService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		super('workbench.action.files.revert', nls.localize('revertLocalChanges', "Revert"), 'conflict-editor-action revert-changes');
	}

	public run(): TPromise<void> {
		const conflictInput = this.input;
		const model = conflictInput.getModel();

		// Revert on model
		return model.revert().then(() => {

			// Reopen file input
			const input = this.instantiationService.createInstance(FileEditorInput, model.getResource(), guessMimeTypes(model.getResource().fsPath).join(', '), void 0);
			return this.editorService.openEditor(input, null, this.position).then(() => {

				// Dispose conflict input
				conflictInput.dispose();
			});
		});
	}
}