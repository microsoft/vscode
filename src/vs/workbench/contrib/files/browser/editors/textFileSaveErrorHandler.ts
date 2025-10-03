/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { Action } from '../../../../../base/common/actions.js';
import { URI } from '../../../../../base/common/uri.js';
import { FileOperationError, FileOperationResult, IWriteFileOptions } from '../../../../../platform/files/common/files.js';
import { ITextFileService, ISaveErrorHandler, ITextFileEditorModel, ITextFileSaveAsOptions, ITextFileSaveOptions } from '../../../../services/textfile/common/textfiles.js';
import { ServicesAccessor, IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IDisposable, dispose, Disposable } from '../../../../../base/common/lifecycle.js';
import { IWorkbenchContribution } from '../../../../common/contributions.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IContextKey, IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { TextFileContentProvider } from '../../common/files.js';
import { FileEditorInput } from './fileEditorInput.js';
import { SAVE_FILE_AS_LABEL } from '../fileConstants.js';
import { INotificationService, INotificationHandle, INotificationActions, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Event } from '../../../../../base/common/event.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { IEditorIdentifier, SaveReason, SideBySideEditor } from '../../../../common/editor.js';
import { hash } from '../../../../../base/common/hash.js';

export const CONFLICT_RESOLUTION_CONTEXT = 'saveConflictResolutionContext';
export const CONFLICT_RESOLUTION_SCHEME = 'conflictResolution';

const LEARN_MORE_DIRTY_WRITE_IGNORE_KEY = 'learnMoreDirtyWriteError';

const conflictEditorHelp = localize('userGuide', "Use the actions in the editor tool bar to either undo your changes or overwrite the content of the file with your changes.");

// A handler for text file save error happening with conflict resolution actions
export class TextFileSaveErrorHandler extends Disposable implements ISaveErrorHandler, IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.textFileSaveErrorHandler';

	private readonly messages = new ResourceMap<INotificationHandle>();
	private readonly conflictResolutionContext: IContextKey<boolean>;
	private activeConflictResolutionResource: URI | undefined = undefined;

	constructor(
		@INotificationService private readonly notificationService: INotificationService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@IContextKeyService contextKeyService: IContextKeyService,
		@IEditorService private readonly editorService: IEditorService,
		@ITextModelService textModelService: ITextModelService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IStorageService private readonly storageService: IStorageService
	) {
		super();

		this.conflictResolutionContext = new RawContextKey<boolean>(CONFLICT_RESOLUTION_CONTEXT, false, true).bindTo(contextKeyService);

		const provider = this._register(instantiationService.createInstance(TextFileContentProvider));
		this._register(textModelService.registerTextModelContentProvider(CONFLICT_RESOLUTION_SCHEME, provider));

		// Set as save error handler to service for text files
		this.textFileService.files.saveErrorHandler = this;

		this.registerListeners();
	}

	private registerListeners(): void {
		this._register(this.textFileService.files.onDidSave(e => this.onFileSavedOrReverted(e.model.resource)));
		this._register(this.textFileService.files.onDidRevert(model => this.onFileSavedOrReverted(model.resource)));
		this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChanged()));
	}

	private onActiveEditorChanged(): void {
		let isActiveEditorSaveConflictResolution = false;
		let activeConflictResolutionResource: URI | undefined;

		const activeInput = this.editorService.activeEditor;
		if (activeInput instanceof DiffEditorInput) {
			const resource = activeInput.original.resource;
			if (resource?.scheme === CONFLICT_RESOLUTION_SCHEME) {
				isActiveEditorSaveConflictResolution = true;
				activeConflictResolutionResource = activeInput.modified.resource;
			}
		}

		this.conflictResolutionContext.set(isActiveEditorSaveConflictResolution);
		this.activeConflictResolutionResource = activeConflictResolutionResource;
	}

	private onFileSavedOrReverted(resource: URI): void {
		const messageHandle = this.messages.get(resource);
		if (messageHandle) {
			messageHandle.close();
			this.messages.delete(resource);
		}
	}

	onSaveError(error: unknown, model: ITextFileEditorModel, options: ITextFileSaveOptions): void {
		const fileOperationError = error as FileOperationError;
		const resource = model.resource;

		let message: string;
		const primaryActions: Action[] = [];
		const secondaryActions: Action[] = [];

		// Dirty write prevention
		if (fileOperationError.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {

			// If the user tried to save from the opened conflict editor, show its message again
			if (this.activeConflictResolutionResource && isEqual(this.activeConflictResolutionResource, model.resource)) {
				if (this.storageService.getBoolean(LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, StorageScope.APPLICATION)) {
					return; // return if this message is ignored
				}

				message = conflictEditorHelp;

				primaryActions.push(this.instantiationService.createInstance(ResolveConflictLearnMoreAction));
				secondaryActions.push(this.instantiationService.createInstance(DoNotShowResolveConflictLearnMoreAction));
			}

			// Otherwise show the message that will lead the user into the save conflict editor.
			else {
				message = localize('staleSaveError', "Failed to save '{0}': The content of the file is newer. Please compare your version with the file contents or overwrite the content of the file with your changes.", basename(resource));

				primaryActions.push(this.instantiationService.createInstance(ResolveSaveConflictAction, model));
				primaryActions.push(this.instantiationService.createInstance(SaveModelIgnoreModifiedSinceAction, model, options));

				secondaryActions.push(this.instantiationService.createInstance(ConfigureSaveConflictAction));
			}
		}

		// Any other save error
		else {
			const isWriteLocked = fileOperationError.fileOperationResult === FileOperationResult.FILE_WRITE_LOCKED;
			const triedToUnlock = isWriteLocked && (fileOperationError.options as IWriteFileOptions | undefined)?.unlock;
			const isPermissionDenied = fileOperationError.fileOperationResult === FileOperationResult.FILE_PERMISSION_DENIED;
			const canSaveElevated = resource.scheme === Schemas.file; // currently only supported for local schemes (https://github.com/microsoft/vscode/issues/48659)

			// Save Elevated
			if (canSaveElevated && (isPermissionDenied || triedToUnlock)) {
				primaryActions.push(this.instantiationService.createInstance(SaveModelElevatedAction, model, options, !!triedToUnlock));
			}

			// Unlock
			else if (isWriteLocked) {
				primaryActions.push(this.instantiationService.createInstance(UnlockModelAction, model, options));
			}

			// Retry
			else {
				primaryActions.push(this.instantiationService.createInstance(RetrySaveModelAction, model, options));
			}

			// Save As
			primaryActions.push(this.instantiationService.createInstance(SaveModelAsAction, model));

			// Revert
			primaryActions.push(this.instantiationService.createInstance(RevertModelAction, model));

			// Message
			if (isWriteLocked) {
				if (triedToUnlock && canSaveElevated) {
					message = isWindows ? localize('readonlySaveErrorAdmin', "Failed to save '{0}': File is read-only. Select 'Overwrite as Admin' to retry as administrator.", basename(resource)) : localize('readonlySaveErrorSudo', "Failed to save '{0}': File is read-only. Select 'Overwrite as Sudo' to retry as superuser.", basename(resource));
				} else {
					message = localize('readonlySaveError', "Failed to save '{0}': File is read-only. Select 'Overwrite' to attempt to make it writeable.", basename(resource));
				}
			} else if (canSaveElevated && isPermissionDenied) {
				message = isWindows ? localize('permissionDeniedSaveError', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Admin' to retry as administrator.", basename(resource)) : localize('permissionDeniedSaveErrorSudo', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Sudo' to retry as superuser.", basename(resource));
			} else {
				message = localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", basename(resource), toErrorMessage(error, false));
			}
		}

		// Show message and keep function to hide in case the file gets saved/reverted
		const actions: INotificationActions = { primary: primaryActions, secondary: secondaryActions };
		const handle = this.notificationService.notify({
			id: `${hash(model.resource.toString())}`, // unique per model (https://github.com/microsoft/vscode/issues/121539)
			severity: Severity.Error,
			message,
			actions
		});
		Event.once(handle.onDidClose)(() => { dispose(primaryActions); dispose(secondaryActions); });
		this.messages.set(model.resource, handle);
	}

	override dispose(): void {
		super.dispose();

		this.messages.clear();
	}
}

const pendingResolveSaveConflictMessages: INotificationHandle[] = [];
function clearPendingResolveSaveConflictMessages(): void {
	while (pendingResolveSaveConflictMessages.length > 0) {
		const item = pendingResolveSaveConflictMessages.pop();
		item?.close();
	}
}

class ResolveConflictLearnMoreAction extends Action {

	constructor(
		@IOpenerService private readonly openerService: IOpenerService
	) {
		super('workbench.files.action.resolveConflictLearnMore', localize('learnMore', "Learn More"));
	}

	override async run(): Promise<void> {
		await this.openerService.open(URI.parse('https://go.microsoft.com/fwlink/?linkid=868264'));
	}
}

class DoNotShowResolveConflictLearnMoreAction extends Action {

	constructor(
		@IStorageService private readonly storageService: IStorageService
	) {
		super('workbench.files.action.resolveConflictLearnMoreDoNotShowAgain', localize('dontShowAgain', "Don't Show Again"));
	}

	override async run(notification: IDisposable): Promise<void> {

		// Remember this as application state
		this.storageService.store(LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, true, StorageScope.APPLICATION, StorageTarget.USER);

		// Hide notification
		notification.dispose();
	}
}

class ResolveSaveConflictAction extends Action {

	constructor(
		private model: ITextFileEditorModel,
		@IEditorService private readonly editorService: IEditorService,
		@INotificationService private readonly notificationService: INotificationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IProductService private readonly productService: IProductService
	) {
		super('workbench.files.action.resolveConflict', localize('compareChanges', "Compare"));
	}

	override async run(): Promise<void> {
		if (!this.model.isDisposed()) {
			const resource = this.model.resource;
			const name = basename(resource);
			const editorLabel = localize('saveConflictDiffLabel', "{0} (in file) ↔ {1} (in {2}) - Resolve save conflict", name, name, this.productService.nameLong);

			await TextFileContentProvider.open(resource, CONFLICT_RESOLUTION_SCHEME, editorLabel, this.editorService, { pinned: true });

			// Show additional help how to resolve the save conflict
			const actions = { primary: [this.instantiationService.createInstance(ResolveConflictLearnMoreAction)] };
			const handle = this.notificationService.notify({
				id: `${hash(resource.toString())}`, // unique per model
				severity: Severity.Info,
				message: conflictEditorHelp,
				actions,
				neverShowAgain: { id: LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, isSecondary: true }
			});
			Event.once(handle.onDidClose)(() => dispose(actions.primary));
			pendingResolveSaveConflictMessages.push(handle);
		}
	}
}

class SaveModelElevatedAction extends Action {

	constructor(
		private model: ITextFileEditorModel,
		private options: ITextFileSaveOptions,
		private triedToUnlock: boolean
	) {
		super('workbench.files.action.saveModelElevated', triedToUnlock ? isWindows ? localize('overwriteElevated', "Overwrite as Admin...") : localize('overwriteElevatedSudo', "Overwrite as Sudo...") : isWindows ? localize('saveElevated', "Retry as Admin...") : localize('saveElevatedSudo', "Retry as Sudo..."));
	}

	override async run(): Promise<void> {
		if (!this.model.isDisposed()) {
			await this.model.save({
				...this.options,
				writeElevated: true,
				writeUnlock: this.triedToUnlock,
				reason: SaveReason.EXPLICIT
			});
		}
	}
}

class RetrySaveModelAction extends Action {

	constructor(
		private model: ITextFileEditorModel,
		private options: ITextFileSaveOptions
	) {
		super('workbench.files.action.saveModel', localize('retry', "Retry"));
	}

	override async run(): Promise<void> {
		if (!this.model.isDisposed()) {
			await this.model.save({ ...this.options, reason: SaveReason.EXPLICIT });
		}
	}
}

class RevertModelAction extends Action {

	constructor(
		private model: ITextFileEditorModel
	) {
		super('workbench.files.action.revertModel', localize('revert', "Revert"));
	}

	override async run(): Promise<void> {
		if (!this.model.isDisposed()) {
			await this.model.revert();
		}
	}
}

class SaveModelAsAction extends Action {

	constructor(
		private model: ITextFileEditorModel,
		@IEditorService private editorService: IEditorService
	) {
		super('workbench.files.action.saveModelAs', SAVE_FILE_AS_LABEL.value);
	}

	override async run(): Promise<void> {
		if (!this.model.isDisposed()) {
			const editor = this.findEditor();
			if (editor) {
				await this.editorService.save(editor, { saveAs: true, reason: SaveReason.EXPLICIT });
			}
		}
	}

	private findEditor(): IEditorIdentifier | undefined {
		let preferredMatchingEditor: IEditorIdentifier | undefined;

		const editors = this.editorService.findEditors(this.model.resource, { supportSideBySide: SideBySideEditor.PRIMARY });
		for (const identifier of editors) {
			if (identifier.editor instanceof FileEditorInput) {
				// We prefer a `FileEditorInput` for "Save As", but it is possible
				// that a custom editor is leveraging the text file model and as
				// such we need to fallback to any other editor having the resource
				// opened for running the save.
				preferredMatchingEditor = identifier;
				break;
			} else if (!preferredMatchingEditor) {
				preferredMatchingEditor = identifier;
			}
		}

		return preferredMatchingEditor;
	}
}

class UnlockModelAction extends Action {

	constructor(
		private model: ITextFileEditorModel,
		private options: ITextFileSaveOptions
	) {
		super('workbench.files.action.unlock', localize('overwrite', "Overwrite"));
	}

	override async run(): Promise<void> {
		if (!this.model.isDisposed()) {
			await this.model.save({ ...this.options, writeUnlock: true, reason: SaveReason.EXPLICIT });
		}
	}
}

class SaveModelIgnoreModifiedSinceAction extends Action {

	constructor(
		private model: ITextFileEditorModel,
		private options: ITextFileSaveOptions
	) {
		super('workbench.files.action.saveIgnoreModifiedSince', localize('overwrite', "Overwrite"));
	}

	override async run(): Promise<void> {
		if (!this.model.isDisposed()) {
			await this.model.save({ ...this.options, ignoreModifiedSince: true, reason: SaveReason.EXPLICIT });
		}
	}
}

class ConfigureSaveConflictAction extends Action {

	constructor(
		@IPreferencesService private readonly preferencesService: IPreferencesService
	) {
		super('workbench.files.action.configureSaveConflict', localize('configure', "Configure"));
	}

	override async run(): Promise<void> {
		this.preferencesService.openSettings({ query: 'files.saveConflictResolution' });
	}
}

export const acceptLocalChangesCommand = (accessor: ServicesAccessor, resource: URI) => {
	return acceptOrRevertLocalChangesCommand(accessor, resource, true);
};

export const revertLocalChangesCommand = (accessor: ServicesAccessor, resource: URI) => {
	return acceptOrRevertLocalChangesCommand(accessor, resource, false);
};

async function acceptOrRevertLocalChangesCommand(accessor: ServicesAccessor, resource: URI, accept: boolean) {
	const editorService = accessor.get(IEditorService);

	const editorPane = editorService.activeEditorPane;
	if (!editorPane) {
		return;
	}

	const editor = editorPane.input;
	const group = editorPane.group;

	// Hide any previously shown message about how to use these actions
	clearPendingResolveSaveConflictMessages();

	// Accept or revert
	if (accept) {
		const options: ITextFileSaveAsOptions = { ignoreModifiedSince: true, reason: SaveReason.EXPLICIT };
		await editorService.save({ editor, groupId: group.id }, options);
	} else {
		await editorService.revert({ editor, groupId: group.id });
	}

	// Reopen original editor
	await editorService.openEditor({ resource }, group);

	// Clean up
	return group.closeEditor(editor);
}
