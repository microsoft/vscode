/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { localize } from '../../../../../nls.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { basename, isEqual } from '../../../../../base/common/resources.js';
import { Action } from '../../../../../base/common/actions.js';
import { URI } from '../../../../../base/common/uri.js';
import { ITextFileService } from '../../../../services/textfile/common/textfiles.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { dispose, Disposable } from '../../../../../base/common/lifecycle.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { ResourceMap } from '../../../../../base/common/map.js';
import { DiffEditorInput } from '../../../../common/editor/diffEditorInput.js';
import { IContextKeyService, RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
import { TextFileContentProvider } from '../../common/files.js';
import { FileEditorInput } from './fileEditorInput.js';
import { SAVE_FILE_AS_LABEL } from '../fileConstants.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IStorageService } from '../../../../../platform/storage/common/storage.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { Event } from '../../../../../base/common/event.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { isWindows } from '../../../../../base/common/platform.js';
import { Schemas } from '../../../../../base/common/network.js';
import { IPreferencesService } from '../../../../services/preferences/common/preferences.js';
import { SideBySideEditor } from '../../../../common/editor.js';
import { hash } from '../../../../../base/common/hash.js';
export const CONFLICT_RESOLUTION_CONTEXT = 'saveConflictResolutionContext';
export const CONFLICT_RESOLUTION_SCHEME = 'conflictResolution';
const LEARN_MORE_DIRTY_WRITE_IGNORE_KEY = 'learnMoreDirtyWriteError';
const conflictEditorHelp = localize('userGuide', "Use the actions in the editor tool bar to either undo your changes or overwrite the content of the file with your changes.");
// A handler for text file save error happening with conflict resolution actions
let TextFileSaveErrorHandler = class TextFileSaveErrorHandler extends Disposable {
    static { this.ID = 'workbench.contrib.textFileSaveErrorHandler'; }
    constructor(notificationService, textFileService, contextKeyService, editorService, textModelService, instantiationService, storageService) {
        super();
        this.notificationService = notificationService;
        this.textFileService = textFileService;
        this.editorService = editorService;
        this.instantiationService = instantiationService;
        this.storageService = storageService;
        this.messages = new ResourceMap();
        this.activeConflictResolutionResource = undefined;
        this.conflictResolutionContext = new RawContextKey(CONFLICT_RESOLUTION_CONTEXT, false, true).bindTo(contextKeyService);
        const provider = this._register(instantiationService.createInstance(TextFileContentProvider));
        this._register(textModelService.registerTextModelContentProvider(CONFLICT_RESOLUTION_SCHEME, provider));
        // Set as save error handler to service for text files
        this.textFileService.files.saveErrorHandler = this;
        this.registerListeners();
    }
    registerListeners() {
        this._register(this.textFileService.files.onDidSave(e => this.onFileSavedOrReverted(e.model.resource)));
        this._register(this.textFileService.files.onDidRevert(model => this.onFileSavedOrReverted(model.resource)));
        this._register(this.editorService.onDidActiveEditorChange(() => this.onActiveEditorChanged()));
    }
    onActiveEditorChanged() {
        let isActiveEditorSaveConflictResolution = false;
        let activeConflictResolutionResource;
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
    onFileSavedOrReverted(resource) {
        const messageHandle = this.messages.get(resource);
        if (messageHandle) {
            messageHandle.close();
            this.messages.delete(resource);
        }
    }
    onSaveError(error, model, options) {
        const fileOperationError = error;
        const resource = model.resource;
        let message;
        const primaryActions = [];
        const secondaryActions = [];
        // Dirty write prevention
        if (fileOperationError.fileOperationResult === 3 /* FileOperationResult.FILE_MODIFIED_SINCE */) {
            // If the user tried to save from the opened conflict editor, show its message again
            if (this.activeConflictResolutionResource && isEqual(this.activeConflictResolutionResource, model.resource)) {
                if (this.storageService.getBoolean(LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, -1 /* StorageScope.APPLICATION */)) {
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
            const isWriteLocked = fileOperationError.fileOperationResult === 5 /* FileOperationResult.FILE_WRITE_LOCKED */;
            const triedToUnlock = isWriteLocked && fileOperationError.options?.unlock;
            const isPermissionDenied = fileOperationError.fileOperationResult === 6 /* FileOperationResult.FILE_PERMISSION_DENIED */;
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
                }
                else {
                    message = localize('readonlySaveError', "Failed to save '{0}': File is read-only. Select 'Overwrite' to attempt to make it writeable.", basename(resource));
                }
            }
            else if (canSaveElevated && isPermissionDenied) {
                message = isWindows ? localize('permissionDeniedSaveError', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Admin' to retry as administrator.", basename(resource)) : localize('permissionDeniedSaveErrorSudo', "Failed to save '{0}': Insufficient permissions. Select 'Retry as Sudo' to retry as superuser.", basename(resource));
            }
            else {
                message = localize({ key: 'genericSaveError', comment: ['{0} is the resource that failed to save and {1} the error message'] }, "Failed to save '{0}': {1}", basename(resource), toErrorMessage(error, false));
            }
        }
        // Show message and keep function to hide in case the file gets saved/reverted
        const actions = { primary: primaryActions, secondary: secondaryActions };
        const handle = this.notificationService.notify({
            id: `${hash(model.resource.toString())}`, // unique per model (https://github.com/microsoft/vscode/issues/121539)
            severity: Severity.Error,
            message,
            actions
        });
        Event.once(handle.onDidClose)(() => { dispose(primaryActions); dispose(secondaryActions); });
        this.messages.set(model.resource, handle);
    }
    dispose() {
        super.dispose();
        this.messages.clear();
    }
};
TextFileSaveErrorHandler = __decorate([
    __param(0, INotificationService),
    __param(1, ITextFileService),
    __param(2, IContextKeyService),
    __param(3, IEditorService),
    __param(4, ITextModelService),
    __param(5, IInstantiationService),
    __param(6, IStorageService)
], TextFileSaveErrorHandler);
export { TextFileSaveErrorHandler };
const pendingResolveSaveConflictMessages = [];
function clearPendingResolveSaveConflictMessages() {
    while (pendingResolveSaveConflictMessages.length > 0) {
        const item = pendingResolveSaveConflictMessages.pop();
        item?.close();
    }
}
let ResolveConflictLearnMoreAction = class ResolveConflictLearnMoreAction extends Action {
    constructor(openerService) {
        super('workbench.files.action.resolveConflictLearnMore', localize('learnMore', "Learn More"));
        this.openerService = openerService;
    }
    async run() {
        await this.openerService.open(URI.parse('https://go.microsoft.com/fwlink/?linkid=868264'));
    }
};
ResolveConflictLearnMoreAction = __decorate([
    __param(0, IOpenerService)
], ResolveConflictLearnMoreAction);
let DoNotShowResolveConflictLearnMoreAction = class DoNotShowResolveConflictLearnMoreAction extends Action {
    constructor(storageService) {
        super('workbench.files.action.resolveConflictLearnMoreDoNotShowAgain', localize('dontShowAgain', "Don't Show Again"));
        this.storageService = storageService;
    }
    async run(notification) {
        // Remember this as application state
        this.storageService.store(LEARN_MORE_DIRTY_WRITE_IGNORE_KEY, true, -1 /* StorageScope.APPLICATION */, 0 /* StorageTarget.USER */);
        // Hide notification
        notification.dispose();
    }
};
DoNotShowResolveConflictLearnMoreAction = __decorate([
    __param(0, IStorageService)
], DoNotShowResolveConflictLearnMoreAction);
let ResolveSaveConflictAction = class ResolveSaveConflictAction extends Action {
    constructor(model, editorService, notificationService, instantiationService, productService) {
        super('workbench.files.action.resolveConflict', localize('compareChanges', "Compare"));
        this.model = model;
        this.editorService = editorService;
        this.notificationService = notificationService;
        this.instantiationService = instantiationService;
        this.productService = productService;
    }
    async run() {
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
};
ResolveSaveConflictAction = __decorate([
    __param(1, IEditorService),
    __param(2, INotificationService),
    __param(3, IInstantiationService),
    __param(4, IProductService)
], ResolveSaveConflictAction);
class SaveModelElevatedAction extends Action {
    constructor(model, options, triedToUnlock) {
        super('workbench.files.action.saveModelElevated', triedToUnlock ? isWindows ? localize('overwriteElevated', "Overwrite as Admin...") : localize('overwriteElevatedSudo', "Overwrite as Sudo...") : isWindows ? localize('saveElevated', "Retry as Admin...") : localize('saveElevatedSudo', "Retry as Sudo..."));
        this.model = model;
        this.options = options;
        this.triedToUnlock = triedToUnlock;
    }
    async run() {
        if (!this.model.isDisposed()) {
            await this.model.save({
                ...this.options,
                writeElevated: true,
                writeUnlock: this.triedToUnlock,
                reason: 1 /* SaveReason.EXPLICIT */
            });
        }
    }
}
class RetrySaveModelAction extends Action {
    constructor(model, options) {
        super('workbench.files.action.saveModel', localize('retry', "Retry"));
        this.model = model;
        this.options = options;
    }
    async run() {
        if (!this.model.isDisposed()) {
            await this.model.save({ ...this.options, reason: 1 /* SaveReason.EXPLICIT */ });
        }
    }
}
class RevertModelAction extends Action {
    constructor(model) {
        super('workbench.files.action.revertModel', localize('revert', "Revert"));
        this.model = model;
    }
    async run() {
        if (!this.model.isDisposed()) {
            await this.model.revert();
        }
    }
}
let SaveModelAsAction = class SaveModelAsAction extends Action {
    constructor(model, editorService) {
        super('workbench.files.action.saveModelAs', SAVE_FILE_AS_LABEL.value);
        this.model = model;
        this.editorService = editorService;
    }
    async run() {
        if (!this.model.isDisposed()) {
            const editor = this.findEditor();
            if (editor) {
                await this.editorService.save(editor, { saveAs: true, reason: 1 /* SaveReason.EXPLICIT */ });
            }
        }
    }
    findEditor() {
        let preferredMatchingEditor;
        const editors = this.editorService.findEditors(this.model.resource, { supportSideBySide: SideBySideEditor.PRIMARY });
        for (const identifier of editors) {
            if (identifier.editor instanceof FileEditorInput) {
                // We prefer a `FileEditorInput` for "Save As", but it is possible
                // that a custom editor is leveraging the text file model and as
                // such we need to fallback to any other editor having the resource
                // opened for running the save.
                preferredMatchingEditor = identifier;
                break;
            }
            else if (!preferredMatchingEditor) {
                preferredMatchingEditor = identifier;
            }
        }
        return preferredMatchingEditor;
    }
};
SaveModelAsAction = __decorate([
    __param(1, IEditorService)
], SaveModelAsAction);
class UnlockModelAction extends Action {
    constructor(model, options) {
        super('workbench.files.action.unlock', localize('overwrite', "Overwrite"));
        this.model = model;
        this.options = options;
    }
    async run() {
        if (!this.model.isDisposed()) {
            await this.model.save({ ...this.options, writeUnlock: true, reason: 1 /* SaveReason.EXPLICIT */ });
        }
    }
}
class SaveModelIgnoreModifiedSinceAction extends Action {
    constructor(model, options) {
        super('workbench.files.action.saveIgnoreModifiedSince', localize('overwrite', "Overwrite"));
        this.model = model;
        this.options = options;
    }
    async run() {
        if (!this.model.isDisposed()) {
            await this.model.save({ ...this.options, ignoreModifiedSince: true, reason: 1 /* SaveReason.EXPLICIT */ });
        }
    }
}
let ConfigureSaveConflictAction = class ConfigureSaveConflictAction extends Action {
    constructor(preferencesService) {
        super('workbench.files.action.configureSaveConflict', localize('configure', "Configure"));
        this.preferencesService = preferencesService;
    }
    async run() {
        this.preferencesService.openSettings({ query: 'files.saveConflictResolution' });
    }
};
ConfigureSaveConflictAction = __decorate([
    __param(0, IPreferencesService)
], ConfigureSaveConflictAction);
export const acceptLocalChangesCommand = (accessor, resource) => {
    return acceptOrRevertLocalChangesCommand(accessor, resource, true);
};
export const revertLocalChangesCommand = (accessor, resource) => {
    return acceptOrRevertLocalChangesCommand(accessor, resource, false);
};
async function acceptOrRevertLocalChangesCommand(accessor, resource, accept) {
    const editorService = accessor.get(IEditorService);
    if (!URI.isUri(resource)) {
        return;
    }
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
        const options = { ignoreModifiedSince: true, reason: 1 /* SaveReason.EXPLICIT */ };
        await editorService.save({ editor, groupId: group.id }, options);
    }
    else {
        await editorService.revert({ editor, groupId: group.id });
    }
    // Reopen original editor
    await editorService.openEditor({ resource }, group);
    // Clean up
    return group.closeEditor(editor);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGV4dEZpbGVTYXZlRXJyb3JIYW5kbGVyLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvYnJvd3Nlci9lZGl0b3JzL3RleHRGaWxlU2F2ZUVycm9ySGFuZGxlci50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEVBQUUsUUFBUSxFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDakQsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDNUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLHVDQUF1QyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUV4RCxPQUFPLEVBQUUsZ0JBQWdCLEVBQXlGLE1BQU0sbURBQW1ELENBQUM7QUFDNUssT0FBTyxFQUFvQixxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3hILE9BQU8sRUFBZSxPQUFPLEVBQUUsVUFBVSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFM0YsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDN0YsT0FBTyxFQUFFLFdBQVcsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ2hFLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUMvRSxPQUFPLEVBQWUsa0JBQWtCLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFDekgsT0FBTyxFQUFFLHVCQUF1QixFQUFFLE1BQU0sdUJBQXVCLENBQUM7QUFDaEUsT0FBTyxFQUFFLGVBQWUsRUFBRSxNQUFNLHNCQUFzQixDQUFDO0FBQ3ZELE9BQU8sRUFBRSxrQkFB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