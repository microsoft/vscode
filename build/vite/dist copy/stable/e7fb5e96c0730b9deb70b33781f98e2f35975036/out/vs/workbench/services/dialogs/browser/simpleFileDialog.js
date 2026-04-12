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
import * as nls from '../../../../nls.js';
import * as resources from '../../../../base/common/resources.js';
import * as objects from '../../../../base/common/objects.js';
import { IFileService, FileKind } from '../../../../platform/files/common/files.js';
import { IQuickInputService, ItemActivation } from '../../../../platform/quickinput/common/quickInput.js';
import { URI } from '../../../../base/common/uri.js';
import { isWindows } from '../../../../base/common/platform.js';
import { IFileDialogService } from '../../../../platform/dialogs/common/dialogs.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IModelService } from '../../../../editor/common/services/model.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { getIconClasses } from '../../../../editor/common/services/getIconClasses.js';
import { Schemas } from '../../../../base/common/network.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
import { IContextKeyService, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { equalsIgnoreCase, format, startsWithIgnoreCase } from '../../../../base/common/strings.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { isValidBasename } from '../../../../base/common/extpath.js';
import { Emitter } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { createCancelablePromise } from '../../../../base/common/async.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { normalizeDriveLetter } from '../../../../base/common/labels.js';
import { IPathService } from '../../path/common/pathService.js';
import { IAccessibilityService } from '../../../../platform/accessibility/common/accessibility.js';
import { getActiveDocument } from '../../../../base/browser/dom.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
export var OpenLocalFileCommand;
(function (OpenLocalFileCommand) {
    OpenLocalFileCommand.ID = 'workbench.action.files.openLocalFile';
    OpenLocalFileCommand.LABEL = nls.localize('openLocalFile', "Open Local File...");
    function handler() {
        return accessor => {
            const dialogService = accessor.get(IFileDialogService);
            return dialogService.pickFileAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
        };
    }
    OpenLocalFileCommand.handler = handler;
})(OpenLocalFileCommand || (OpenLocalFileCommand = {}));
export var SaveLocalFileCommand;
(function (SaveLocalFileCommand) {
    SaveLocalFileCommand.ID = 'workbench.action.files.saveLocalFile';
    SaveLocalFileCommand.LABEL = nls.localize('saveLocalFile', "Save Local File...");
    function handler() {
        return accessor => {
            const editorService = accessor.get(IEditorService);
            const activeEditorPane = editorService.activeEditorPane;
            if (activeEditorPane) {
                return editorService.save({ groupId: activeEditorPane.group.id, editor: activeEditorPane.input }, { saveAs: true, availableFileSystems: [Schemas.file], reason: 1 /* SaveReason.EXPLICIT */ });
            }
            return Promise.resolve(undefined);
        };
    }
    SaveLocalFileCommand.handler = handler;
})(SaveLocalFileCommand || (SaveLocalFileCommand = {}));
export var OpenLocalFolderCommand;
(function (OpenLocalFolderCommand) {
    OpenLocalFolderCommand.ID = 'workbench.action.files.openLocalFolder';
    OpenLocalFolderCommand.LABEL = nls.localize('openLocalFolder', "Open Local Folder...");
    function handler() {
        return accessor => {
            const dialogService = accessor.get(IFileDialogService);
            return dialogService.pickFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
        };
    }
    OpenLocalFolderCommand.handler = handler;
})(OpenLocalFolderCommand || (OpenLocalFolderCommand = {}));
export var OpenLocalFileFolderCommand;
(function (OpenLocalFileFolderCommand) {
    OpenLocalFileFolderCommand.ID = 'workbench.action.files.openLocalFileFolder';
    OpenLocalFileFolderCommand.LABEL = nls.localize('openLocalFileFolder', "Open Local...");
    function handler() {
        return accessor => {
            const dialogService = accessor.get(IFileDialogService);
            return dialogService.pickFileFolderAndOpen({ forceNewWindow: false, availableFileSystems: [Schemas.file] });
        };
    }
    OpenLocalFileFolderCommand.handler = handler;
})(OpenLocalFileFolderCommand || (OpenLocalFileFolderCommand = {}));
var UpdateResult;
(function (UpdateResult) {
    UpdateResult[UpdateResult["Updated"] = 0] = "Updated";
    UpdateResult[UpdateResult["UpdatedWithTrailing"] = 1] = "UpdatedWithTrailing";
    UpdateResult[UpdateResult["Updating"] = 2] = "Updating";
    UpdateResult[UpdateResult["NotUpdated"] = 3] = "NotUpdated";
    UpdateResult[UpdateResult["InvalidPath"] = 4] = "InvalidPath";
})(UpdateResult || (UpdateResult = {}));
export const RemoteFileDialogContext = new RawContextKey('remoteFileDialogVisible', false);
let SimpleFileDialog = class SimpleFileDialog extends Disposable {
    constructor(fileService, quickInputService, labelService, workspaceContextService, notificationService, fileDialogService, modelService, languageService, environmentService, remoteAgentService, pathService, keybindingService, contextKeyService, accessibilityService, storageService) {
        super();
        this.fileService = fileService;
        this.quickInputService = quickInputService;
        this.labelService = labelService;
        this.workspaceContextService = workspaceContextService;
        this.notificationService = notificationService;
        this.fileDialogService = fileDialogService;
        this.modelService = modelService;
        this.languageService = languageService;
        this.environmentService = environmentService;
        this.remoteAgentService = remoteAgentService;
        this.pathService = pathService;
        this.keybindingService = keybindingService;
        this.accessibilityService = accessibilityService;
        this.storageService = storageService;
        this.hidden = false;
        this.allowFileSelection = true;
        this.allowFolderSelection = false;
        this.requiresTrailing = false;
        this.userEnteredPathSegment = '';
        this.autoCompletePathSegment = '';
        this.isWindows = false;
        this.separator = '/';
        /**
         * Path prefix that the label formatter strips from URIs in the
         * scoped scheme (e.g. `/file/-` for agent host URIs that encode
         * the original scheme and authority as leading path segments).
         *
         * Stripped by {@link pathFromUri} and re-applied by
         * {@link remoteUriFrom} so the user sees clean paths.
         */
        this.scopedPathPrefix = '';
        this.onBusyChangeEmitter = this._register(new Emitter());
        this._showDotFiles = true;
        this.remoteAuthority = this.environmentService.remoteAuthority;
        this.contextKey = RemoteFileDialogContext.bindTo(contextKeyService);
        this.scheme = this.pathService.defaultUriScheme;
        this.getShowDotFiles();
        const disposableStore = this._register(new DisposableStore());
        disposableStore.add(this.storageService.onDidChangeValue(1 /* StorageScope.WORKSPACE */, 'remoteFileDialog.showDotFiles', disposableStore)(async (_) => {
            this.getShowDotFiles();
            this.setButtons();
            const startingValue = this.filePickBox.value;
            const folderValue = this.pathFromUri(this.currentFolder, true);
            this.filePickBox.value = folderValue;
            await this.tryUpdateItems(folderValue, this.currentFolder, true);
            this.filePickBox.value = startingValue;
        }));
    }
    setShowDotFiles(showDotFiles) {
        this.storageService.store('remoteFileDialog.showDotFiles', showDotFiles, 1 /* StorageScope.WORKSPACE */, 0 /* StorageTarget.USER */);
    }
    getShowDotFiles() {
        this._showDotFiles = this.storageService.getBoolean('remoteFileDialog.showDotFiles', 1 /* StorageScope.WORKSPACE */, true);
    }
    set busy(busy) {
        if (this.filePickBox.busy !== busy) {
            this.filePickBox.busy = busy;
            this.onBusyChangeEmitter.fire(busy);
        }
    }
    get busy() {
        return this.filePickBox.busy;
    }
    async showOpenDialog(options = {}) {
        this.scheme = this.getScheme(options.availableFileSystems, options.defaultUri);
        this.scopedAuthority = this.getScopedAuthority(options.defaultUri);
        this.scopedPathPrefix = options.defaultUri && this.scopedAuthority ? this.computeScopedPathPrefix(options.defaultUri) : '';
        this.userHome = await this.getUserHome();
        this.trueHome = await this.getUserHome(true);
        const newOptions = this.getOptions(options);
        if (!newOptions) {
            return Promise.resolve(undefined);
        }
        this.options = newOptions;
        const result = await this.pickResource();
        if (Array.isArray(result)) {
            return result;
        }
        return result ? [result] : undefined;
    }
    async showSaveDialog(options) {
        this.scheme = this.getScheme(options.availableFileSystems, options.defaultUri);
        this.scopedAuthority = this.getScopedAuthority(options.defaultUri);
        this.scopedPathPrefix = options.defaultUri && this.scopedAuthority ? this.computeScopedPathPrefix(options.defaultUri) : '';
        this.userHome = await this.getUserHome();
        this.trueHome = await this.getUserHome(true);
        this.requiresTrailing = true;
        const newOptions = this.getOptions(options, true);
        if (!newOptions) {
            return Promise.resolve(undefined);
        }
        this.options = newOptions;
        this.options.canSelectFolders = true;
        this.options.canSelectFiles = true;
        return new Promise((resolve) => {
            this.pickResource(true).then(result => {
                resolve(Array.isArray(result) ? result[0] : result);
            });
        });
    }
    getOptions(options, isSave = false) {
        let defaultUri = undefined;
        let filename = undefined;
        if (options.defaultUri) {
            defaultUri = (this.scheme === options.defaultUri.scheme) ? options.defaultUri : undefined;
            filename = isSave ? resources.basename(options.defaultUri) : undefined;
        }
        if (!defaultUri) {
            defaultUri = this.userHome;
            if (filename) {
                defaultUri = resources.joinPath(defaultUri, filename);
            }
        }
        if ((this.scheme !== Schemas.file) && !this.fileService.hasProvider(defaultUri)) {
            this.notificationService.info(nls.localize('remoteFileDialog.notConnectedToRemote', 'File system provider for {0} is not available.', defaultUri.toString()));
            return undefined;
        }
        const newOptions = objects.deepClone(options);
        newOptions.defaultUri = defaultUri;
        return newOptions;
    }
    remoteUriFrom(path, hintUri) {
        if (!path.startsWith('\\\\')) {
            path = path.replace(/\\/g, '/');
        }
        // When scoped to a specific authority (e.g. agenthost://host/...),
        // construct the URI directly with the authority to avoid
        // toLocalResource stripping or replacing it.
        // Re-add the scopedPathPrefix that was stripped in pathFromUri.
        if (this.scopedAuthority) {
            return URI.from({ scheme: this.scheme, authority: this.scopedAuthority, path: this.scopedPathPrefix + path, query: hintUri?.query, fragment: hintUri?.fragment });
        }
        const uri = this.scheme === Schemas.file ? URI.file(path) : URI.from({ scheme: this.scheme, path, query: hintUri?.query, fragment: hintUri?.fragment });
        // If the default scheme is file, then we don't care about the remote authority or the hint authority
        const authority = (uri.scheme === Schemas.file) ? undefined : (this.remoteAuthority ?? hintUri?.authority);
        return resources.toLocalResource(uri, authority, 
        // If there is a remote authority, then we should use the system's default URI as the local scheme.
        // If there is *no* remote authority, then we should use the default scheme for this dialog as that is already local.
        authority ? this.pathService.defaultUriScheme : uri.scheme);
    }
    getScheme(available, defaultUri) {
        if (available && available.length > 0) {
            if (defaultUri && (available.indexOf(defaultUri.scheme) >= 0)) {
                return defaultUri.scheme;
            }
            return available[0];
        }
        else if (defaultUri) {
            return defaultUri.scheme;
        }
        return Schemas.file;
    }
    /**
     * Returns the per-URI authority from {@link defaultUri} if the dialog
     * should be scoped to a specific authority (e.g. `agenthost://host/...`).
     *
     * Returns `undefined` when the authority matches the global
     * {@link remoteAuthority} (standard SSH remotes), since that path is
     * already handled by the existing logic.
     */
    getScopedAuthority(defaultUri) {
        if (defaultUri
            && defaultUri.scheme === this.scheme
            && defaultUri.authority
            && defaultUri.authority !== this.remoteAuthority) {
            return defaultUri.authority;
        }
        return undefined;
    }
    /**
     * Computes the path prefix that the label formatter strips for the
     * scoped scheme, by comparing the raw URI path with the label
     * service's formatted output.
     *
     * For example, an agent host URI with path `/file/-/Users/roblou`
     * formats as `/Users/roblou`, so the prefix is `/file/-`.
     */
    computeScopedPathPrefix(uri) {
        const fullPath = uri.path;
        const displayPath = this.labelService.getUriLabel(uri);
        if (displayPath && fullPath.endsWith(displayPath)) {
            return fullPath.substring(0, fullPath.length - displayPath.length);
        }
        return '';
    }
    async getRemoteAgentEnvironment() {
        if (this.remoteAgentEnvironment === undefined) {
            this.remoteAgentEnvironment = await this.remoteAgentService.getEnvironment();
        }
        return this.remoteAgentEnvironment;
    }
    getUserHome(trueHome = false) {
        // When scoped to a custom authority, the platform userHome is not
        // meaningful (it would return a local file:// path). Use the root
        // of the scoped filesystem as the home directory instead.
        // Include the scopedPathPrefix so the URI resolves correctly.
        if (this.scopedAuthority) {
            return Promise.resolve(URI.from({ scheme: this.scheme, authority: this.scopedAuthority, path: this.scopedPathPrefix + '/' }));
        }
        return trueHome
            ? this.pathService.userHome({ preferLocal: this.scheme === Schemas.file })
            : this.fileDialogService.preferredHome(this.scheme);
    }
    normalizeUri(uri) {
        uri = resources.addTrailingPathSeparator(uri, this.separator); // Ensures that c: is c:/ since this comes from user input and can be incorrect.
        // To be consistent, we should never have a trailing path separator on directories (or anything else). Will not remove from c:/.
        uri = resources.removeTrailingPathSeparator(uri);
        return uri;
    }
    async pickResource(isSave = false) {
        this.allowFolderSelection = !!this.options.canSelectFolders;
        this.allowFileSelection = !!this.options.canSelectFiles;
        this.separator = this.scopedAuthority ? '/' : this.labelService.getSeparator(this.scheme, this.remoteAuthority);
        this.hidden = false;
        this.isWindows = this.scopedAuthority ? false : await this.checkIsWindowsOS();
        let homedir = this.options.defaultUri ? this.options.defaultUri : this.workspaceContextService.getWorkspace().folders[0].uri;
        let stat;
        const ext = resources.extname(homedir);
        if (this.options.defaultUri) {
            try {
                stat = await this.fileService.stat(this.options.defaultUri);
            }
            catch (e) {
                // The file or folder doesn't exist
            }
            if (!stat || !stat.isDirectory) {
                homedir = resources.dirname(this.options.defaultUri);
                this.trailing = resources.basename(this.options.defaultUri);
            }
        }
        return new Promise((resolve) => {
            this.filePickBox = this._register(this.quickInputService.createQuickPick());
            this.busy = true;
            this.filePickBox.matchOnLabel = false;
            this.filePickBox.sortByLabel = false;
            this.filePickBox.ignoreFocusOut = true;
            this.filePickBox.placeholder = nls.localize('remoteFileDialog.placeholder', "Folder path");
            this.filePickBox.ok = true;
            this.filePickBox.okLabel = typeof this.options.openLabel === 'string' ? this.options.openLabel : this.options.openLabel?.withoutMnemonic;
            if ((this.scheme !== Schemas.file) && this.options && this.options.availableFileSystems && (this.options.availableFileSystems.length > 1) && (this.options.availableFileSystems.indexOf(Schemas.file) > -1)) {
                this.filePickBox.customButton = true;
                this.filePickBox.customLabel = nls.localize('remoteFileDialog.local', 'Show Local');
                this.filePickBox.customButtonSecondary = true;
                let action;
                if (isSave) {
                    action = SaveLocalFileCommand;
                }
                else {
                    action = this.allowFileSelection ? (this.allowFolderSelection ? OpenLocalFileFolderCommand : OpenLocalFileCommand) : OpenLocalFolderCommand;
                }
                const keybinding = this.keybindingService.lookupKeybinding(action.ID);
                if (keybinding) {
                    const label = keybinding.getLabel();
                    if (label) {
                        this.filePickBox.customHover = format('{0} ({1})', action.LABEL, label);
                    }
                }
            }
            this.setButtons();
            this._register(this.filePickBox.onDidTriggerButton(e => {
                this.setShowDotFiles(!this._showDotFiles);
            }));
            let isResolving = 0;
            let isAcceptHandled = false;
            this.currentFolder = resources.dirname(homedir);
            this.userEnteredPathSegment = '';
            this.autoCompletePathSegment = '';
            this.filePickBox.title = this.options.title;
            this.filePickBox.value = this.pathFromUri(this.currentFolder, true);
            this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
            const doResolve = (uriOrUris) => {
                if (uriOrUris) {
                    if (Array.isArray(uriOrUris)) {
                        uriOrUris = uriOrUris.map(uri => this.normalizeUri(uri));
                    }
                    else {
                        uriOrUris = this.normalizeUri(uriOrUris);
                    }
                }
                resolve(uriOrUris);
                this.contextKey.set(false);
                this.dispose();
            };
            this._register(this.filePickBox.onDidCustom(() => {
                if (isAcceptHandled || this.busy) {
                    return;
                }
                isAcceptHandled = true;
                isResolving++;
                if (this.options.availableFileSystems && (this.options.availableFileSystems.length > 1)) {
                    this.options.availableFileSystems = this.options.availableFileSystems.slice(1);
                }
                this.filePickBox.hide();
                if (isSave) {
                    return this.fileDialogService.showSaveDialog(this.options).then(result => {
                        doResolve(result);
                    });
                }
                else {
                    return this.fileDialogService.showOpenDialog(this.options).then(result => {
                        doResolve(result);
                    });
                }
            }));
            const busyDisposable = this._register(new MutableDisposable());
            const handleAccept = () => {
                if (this.busy) {
                    // Save the accept until the file picker is not busy.
                    busyDisposable.value = this.onBusyChangeEmitter.event((busy) => {
                        if (!busy) {
                            handleAccept();
                        }
                    });
                    return;
                }
                else if (isAcceptHandled) {
                    return;
                }
                isAcceptHandled = true;
                isResolving++;
                this.onDidAccept().then(resolveValue => {
                    if (resolveValue) {
                        this.filePickBox.hide();
                        doResolve(resolveValue);
                    }
                    else if (this.hidden) {
                        doResolve(undefined);
                    }
                    else {
                        isResolving--;
                        isAcceptHandled = false;
                    }
                });
            };
            this._register(this.filePickBox.onDidAccept(_ => {
                handleAccept();
            }));
            this._register(this.filePickBox.onDidChangeActive(i => {
                isAcceptHandled = false;
                // update input box to match the first selected item
                if ((i.length === 1) && this.isSelectionChangeFromUser()) {
                    this.filePickBox.validationMessage = undefined;
                    const userPath = this.constructFullUserPath();
                    if (!equalsIgnoreCase(this.filePickBox.value.substring(0, userPath.length), userPath)) {
                        this.filePickBox.valueSelection = [0, this.filePickBox.value.length];
                        this.insertText(userPath, userPath);
                    }
                    this.setAutoComplete(userPath, this.userEnteredPathSegment, i[0], true);
                }
            }));
            this._register(this.filePickBox.onDidChangeValue(async (value) => {
                return this.handleValueChange(value);
            }));
            this._register(this.filePickBox.onDidHide(() => {
                this.hidden = true;
                if (isResolving === 0) {
                    doResolve(undefined);
                }
            }));
            this.filePickBox.show();
            this.contextKey.set(true);
            this.updateItems(homedir, true, this.trailing).then(() => {
                if (this.trailing) {
                    this.filePickBox.valueSelection = [this.filePickBox.value.length - this.trailing.length, this.filePickBox.value.length - ext.length];
                }
                else {
                    this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
                }
                this.busy = false;
            });
        });
    }
    dispose() {
        super.dispose();
    }
    async handleValueChange(value) {
        try {
            // onDidChangeValue can also be triggered by the auto complete, so if it looks like the auto complete, don't do anything
            if (this.isValueChangeFromUser()) {
                // If the user has just entered more bad path, don't change anything
                if (!equalsIgnoreCase(value, this.constructFullUserPath()) && (!this.isBadSubpath(value) || this.canTildaEscapeHatch(value))) {
                    this.filePickBox.validationMessage = undefined;
                    const filePickBoxUri = this.filePickBoxValue();
                    let updated = UpdateResult.NotUpdated;
                    if (!resources.extUriIgnorePathCase.isEqual(this.currentFolder, filePickBoxUri)) {
                        updated = await this.tryUpdateItems(value, filePickBoxUri);
                    }
                    if ((updated === UpdateResult.NotUpdated) || (updated === UpdateResult.UpdatedWithTrailing)) {
                        this.setActiveItems(value);
                    }
                }
                else {
                    this.filePickBox.activeItems = [];
                    this.userEnteredPathSegment = '';
                }
            }
        }
        catch {
            // Since any text can be entered in the input box, there is potential for error causing input. If this happens, do nothing.
        }
    }
    setButtons() {
        this.filePickBox.buttons = [{
                iconClass: this._showDotFiles ? ThemeIcon.asClassName(Codicon.eye) : ThemeIcon.asClassName(Codicon.eyeClosed),
                tooltip: this._showDotFiles ? nls.localize('remoteFileDialog.hideDotFiles', "Hide dot files") : nls.localize('remoteFileDialog.showDotFiles', "Show dot files"),
                alwaysVisible: true
            }];
    }
    isBadSubpath(value) {
        return this.badPath && (value.length > this.badPath.length) && equalsIgnoreCase(value.substring(0, this.badPath.length), this.badPath);
    }
    isValueChangeFromUser() {
        if (equalsIgnoreCase(this.filePickBox.value, this.pathAppend(this.currentFolder, this.userEnteredPathSegment + this.autoCompletePathSegment))) {
            return false;
        }
        return true;
    }
    isSelectionChangeFromUser() {
        if (this.activeItem === (this.filePickBox.activeItems ? this.filePickBox.activeItems[0] : undefined)) {
            return false;
        }
        return true;
    }
    constructFullUserPath() {
        const currentFolderPath = this.pathFromUri(this.currentFolder);
        if (equalsIgnoreCase(this.filePickBox.value.substr(0, this.userEnteredPathSegment.length), this.userEnteredPathSegment)) {
            if (equalsIgnoreCase(this.filePickBox.value.substr(0, currentFolderPath.length), currentFolderPath)) {
                return currentFolderPath;
            }
            else {
                return this.userEnteredPathSegment;
            }
        }
        else {
            return this.pathAppend(this.currentFolder, this.userEnteredPathSegment);
        }
    }
    filePickBoxValue() {
        // The file pick box can't render everything, so we use the current folder to create the uri so that it is an existing path.
        const directUri = this.remoteUriFrom(this.filePickBox.value.trimRight(), this.currentFolder);
        const currentPath = this.pathFromUri(this.currentFolder);
        if (equalsIgnoreCase(this.filePickBox.value, currentPath)) {
            return this.currentFolder;
        }
        const currentDisplayUri = this.remoteUriFrom(currentPath, this.currentFolder);
        const relativePath = resources.relativePath(currentDisplayUri, directUri);
        const isSameRoot = (this.filePickBox.value.length > 1 && currentPath.length > 1) ? equalsIgnoreCase(this.filePickBox.value.substr(0, 2), currentPath.substr(0, 2)) : false;
        if (relativePath && isSameRoot) {
            let path = resources.joinPath(this.currentFolder, relativePath);
            const directBasename = resources.basename(directUri);
            if ((directBasename === '.') || (directBasename === '..')) {
                path = this.remoteUriFrom(this.pathAppend(path, directBasename), this.currentFolder);
            }
            return resources.hasTrailingPathSeparator(directUri) ? resources.addTrailingPathSeparator(path) : path;
        }
        else {
            return directUri;
        }
    }
    async onDidAccept() {
        this.busy = true;
        if (!this.updatingPromise && this.filePickBox.activeItems.length === 1) {
            const item = this.filePickBox.selectedItems[0];
            if (item.isFolder) {
                if (this.trailing) {
                    await this.updateItems(item.uri, true, this.trailing);
                }
                else {
                    // When possible, cause the update to happen by modifying the input box.
                    // This allows all input box updates to happen first, and uses the same code path as the user typing.
                    const newPath = this.pathFromUri(item.uri);
                    if (startsWithIgnoreCase(newPath, this.filePickBox.value) && (equalsIgnoreCase(item.label, resources.basename(item.uri)))) {
                        this.filePickBox.valueSelection = [this.pathFromUri(this.currentFolder).length, this.filePickBox.value.length];
                        this.insertText(newPath, this.basenameWithTrailingSlash(item.uri));
                    }
                    else if ((item.label === '..') && startsWithIgnoreCase(this.filePickBox.value, newPath)) {
                        this.filePickBox.valueSelection = [newPath.length, this.filePickBox.value.length];
                        this.insertText(newPath, '');
                    }
                    else {
                        await this.updateItems(item.uri, true);
                    }
                }
                this.filePickBox.busy = false;
                return;
            }
        }
        else if (!this.updatingPromise) {
            // If the items have updated, don't try to resolve
            if ((await this.tryUpdateItems(this.filePickBox.value, this.filePickBoxValue())) !== UpdateResult.NotUpdated) {
                this.filePickBox.busy = false;
                return;
            }
        }
        let resolveValue;
        // Find resolve value
        if (this.filePickBox.activeItems.length === 0) {
            resolveValue = this.filePickBoxValue();
        }
        else if (this.filePickBox.activeItems.length === 1) {
            resolveValue = this.filePickBox.selectedItems[0].uri;
        }
        if (resolveValue) {
            resolveValue = this.addPostfix(resolveValue);
        }
        if (await this.validate(resolveValue)) {
            this.busy = false;
            return resolveValue;
        }
        this.busy = false;
        return undefined;
    }
    root(value) {
        let lastDir = value;
        let dir = resources.dirname(value);
        while (!resources.isEqual(lastDir, dir)) {
            lastDir = dir;
            dir = resources.dirname(dir);
        }
        return dir;
    }
    canTildaEscapeHatch(value) {
        return !!(value.endsWith('~') && this.isBadSubpath(value));
    }
    tildaReplace(value) {
        const home = this.trueHome;
        if ((value.length > 0) && (value[0] === '~')) {
            return resources.joinPath(home, value.substring(1));
        }
        else if (this.canTildaEscapeHatch(value)) {
            return home;
        }
        return this.remoteUriFrom(value);
    }
    tryAddTrailingSeparatorToDirectory(uri, stat) {
        if (stat.isDirectory) {
            // At this point we know it's a directory and can add the trailing path separator
            if (!this.endsWithSlash(uri.path)) {
                return resources.addTrailingPathSeparator(uri);
            }
        }
        return uri;
    }
    async tryUpdateItems(value, valueUri, reset = false) {
        if ((value.length > 0) && ((value[0] === '~') || this.canTildaEscapeHatch(value))) {
            const newDir = this.tildaReplace(value);
            return await this.updateItems(newDir, true) ? UpdateResult.UpdatedWithTrailing : UpdateResult.Updated;
        }
        else if (value === '\\') {
            valueUri = this.root(this.currentFolder);
            value = this.pathFromUri(valueUri);
            return await this.updateItems(valueUri, true) ? UpdateResult.UpdatedWithTrailing : UpdateResult.Updated;
        }
        else {
            const newFolderIsOldFolder = resources.extUriIgnorePathCase.isEqual(this.currentFolder, valueUri);
            const newFolderIsSubFolder = resources.extUriIgnorePathCase.isEqual(this.currentFolder, resources.dirname(valueUri));
            const newFolderIsParent = resources.extUriIgnorePathCase.isEqualOrParent(this.currentFolder, resources.dirname(valueUri));
            const newFolderIsUnrelated = !newFolderIsParent && !newFolderIsSubFolder;
            if ((!newFolderIsOldFolder && (this.endsWithSlash(value) || newFolderIsParent || newFolderIsUnrelated)) || reset) {
                let stat;
                try {
                    stat = await this.fileService.stat(valueUri);
                }
                catch (e) {
                    // do nothing
                }
                if (stat?.isDirectory && (resources.basename(valueUri) !== '.') && this.endsWithSlash(value)) {
                    valueUri = this.tryAddTrailingSeparatorToDirectory(valueUri, stat);
                    return await this.updateItems(valueUri) ? UpdateResult.UpdatedWithTrailing : UpdateResult.Updated;
                }
                else if (this.endsWithSlash(value)) {
                    // The input box contains a path that doesn't exist on the system.
                    this.filePickBox.validationMessage = nls.localize('remoteFileDialog.badPath', 'The path does not exist. Use ~ to go to your home directory.');
                    // Save this bad path. It can take too long to a stat on every user entered character, but once a user enters a bad path they are likely
                    // to keep typing more bad path. We can compare against this bad path and see if the user entered path starts with it.
                    this.badPath = value;
                    return UpdateResult.InvalidPath;
                }
                else {
                    let inputUriDirname = resources.dirname(valueUri);
                    const currentFolderWithoutSep = resources.removeTrailingPathSeparator(resources.addTrailingPathSeparator(this.currentFolder));
                    const inputUriDirnameWithoutSep = resources.removeTrailingPathSeparator(resources.addTrailingPathSeparator(inputUriDirname));
                    if (!resources.extUriIgnorePathCase.isEqual(currentFolderWithoutSep, inputUriDirnameWithoutSep)
                        && (!/^[a-zA-Z]:$/.test(this.filePickBox.value)
                            || !equalsIgnoreCase(this.pathFromUri(this.currentFolder).substring(0, this.filePickBox.value.length), this.filePickBox.value))) {
                        let statWithoutTrailing;
                        try {
                            statWithoutTrailing = await this.fileService.stat(inputUriDirname);
                        }
                        catch (e) {
                            // do nothing
                        }
                        if (statWithoutTrailing?.isDirectory) {
                            this.badPath = undefined;
                            inputUriDirname = this.tryAddTrailingSeparatorToDirectory(inputUriDirname, statWithoutTrailing);
                            return await this.updateItems(inputUriDirname, false, resources.basename(valueUri)) ? UpdateResult.UpdatedWithTrailing : UpdateResult.Updated;
                        }
                    }
                }
            }
        }
        this.badPath = undefined;
        return UpdateResult.NotUpdated;
    }
    tryUpdateTrailing(value) {
        const ext = resources.extname(value);
        if (this.trailing && ext) {
            this.trailing = resources.basename(value);
        }
    }
    setActiveItems(value) {
        value = this.pathFromUri(this.tildaReplace(value));
        const asUri = this.remoteUriFrom(value);
        const inputBasename = resources.basename(asUri);
        const userPath = this.constructFullUserPath();
        // Make sure that the folder whose children we are currently viewing matches the path in the input
        const pathsEqual = equalsIgnoreCase(userPath, value.substring(0, userPath.length)) ||
            equalsIgnoreCase(value, userPath.substring(0, value.length));
        if (pathsEqual) {
            let hasMatch = false;
            for (let i = 0; i < this.filePickBox.items.length; i++) {
                const item = this.filePickBox.items[i];
                if (this.setAutoComplete(value, inputBasename, item)) {
                    hasMatch = true;
                    break;
                }
            }
            if (!hasMatch) {
                const userBasename = inputBasename.length >= 2 ? userPath.substring(userPath.length - inputBasename.length + 2) : '';
                this.userEnteredPathSegment = (userBasename === inputBasename) ? inputBasename : '';
                this.autoCompletePathSegment = '';
                this.filePickBox.activeItems = [];
                this.tryUpdateTrailing(asUri);
            }
        }
        else {
            this.userEnteredPathSegment = inputBasename;
            this.autoCompletePathSegment = '';
            this.filePickBox.activeItems = [];
            this.tryUpdateTrailing(asUri);
        }
    }
    setAutoComplete(startingValue, startingBasename, quickPickItem, force = false) {
        if (this.busy) {
            // We're in the middle of something else. Doing an auto complete now can result jumbled or incorrect autocompletes.
            this.userEnteredPathSegment = startingBasename;
            this.autoCompletePathSegment = '';
            return false;
        }
        const itemBasename = quickPickItem.label;
        // Either force the autocomplete, or the old value should be one smaller than the new value and match the new value.
        if (itemBasename === '..') {
            // Don't match on the up directory item ever.
            this.userEnteredPathSegment = '';
            this.autoCompletePathSegment = '';
            this.activeItem = quickPickItem;
            if (force) {
                // clear any selected text
                getActiveDocument().execCommand('insertText', false, '');
            }
            return false;
        }
        else if (!force && (itemBasename.length >= startingBasename.length) && equalsIgnoreCase(itemBasename.substr(0, startingBasename.length), startingBasename)) {
            this.userEnteredPathSegment = startingBasename;
            this.activeItem = quickPickItem;
            // Changing the active items will trigger the onDidActiveItemsChanged. Clear the autocomplete first, then set it after.
            this.autoCompletePathSegment = '';
            if (quickPickItem.isFolder || !this.trailing) {
                this.filePickBox.activeItems = [quickPickItem];
            }
            else {
                this.filePickBox.activeItems = [];
            }
            return true;
        }
        else if (force && (!equalsIgnoreCase(this.basenameWithTrailingSlash(quickPickItem.uri), (this.userEnteredPathSegment + this.autoCompletePathSegment)))) {
            this.userEnteredPathSegment = '';
            if (!this.accessibilityService.isScreenReaderOptimized()) {
                this.autoCompletePathSegment = this.trimTrailingSlash(itemBasename);
            }
            this.activeItem = quickPickItem;
            if (!this.accessibilityService.isScreenReaderOptimized()) {
                this.filePickBox.valueSelection = [this.pathFromUri(this.currentFolder, true).length, this.filePickBox.value.length];
                // use insert text to preserve undo buffer
                this.insertText(this.pathAppend(this.currentFolder, this.autoCompletePathSegment), this.autoCompletePathSegment);
                this.filePickBox.valueSelection = [this.filePickBox.value.length - this.autoCompletePathSegment.length, this.filePickBox.value.length];
            }
            return true;
        }
        else {
            this.userEnteredPathSegment = startingBasename;
            this.autoCompletePathSegment = '';
            return false;
        }
    }
    insertText(wholeValue, insertText) {
        if (this.filePickBox.inputHasFocus()) {
            getActiveDocument().execCommand('insertText', false, insertText);
            if (this.filePickBox.value !== wholeValue) {
                this.filePickBox.value = wholeValue;
                this.handleValueChange(wholeValue);
            }
        }
        else {
            this.filePickBox.value = wholeValue;
            this.handleValueChange(wholeValue);
        }
    }
    addPostfix(uri) {
        let result = uri;
        if (this.requiresTrailing && this.options.filters && this.options.filters.length > 0 && !resources.hasTrailingPathSeparator(uri)) {
            // Make sure that the suffix is added. If the user deleted it, we automatically add it here
            let hasExt = false;
            const currentExt = resources.extname(uri).substr(1);
            for (let i = 0; i < this.options.filters.length; i++) {
                for (let j = 0; j < this.options.filters[i].extensions.length; j++) {
                    if ((this.options.filters[i].extensions[j] === '*') || (this.options.filters[i].extensions[j] === currentExt)) {
                        hasExt = true;
                        break;
                    }
                }
                if (hasExt) {
                    break;
                }
            }
            if (!hasExt) {
                result = resources.joinPath(resources.dirname(uri), resources.basename(uri) + '.' + this.options.filters[0].extensions[0]);
            }
        }
        return result;
    }
    trimTrailingSlash(path) {
        return ((path.length > 1) && this.endsWithSlash(path)) ? path.substr(0, path.length - 1) : path;
    }
    yesNoPrompt(uri, message) {
        const disposableStore = new DisposableStore();
        const prompt = disposableStore.add(this.quickInputService.createQuickPick());
        prompt.title = message;
        prompt.ignoreFocusOut = true;
        prompt.ok = true;
        prompt.customButton = true;
        prompt.customLabel = nls.localize('remoteFileDialog.cancel', 'Cancel');
        prompt.customButtonSecondary = true;
        prompt.value = this.pathFromUri(uri);
        let isResolving = false;
        return new Promise(resolve => {
            disposableStore.add(prompt.onDidAccept(() => {
                isResolving = true;
                prompt.hide();
                resolve(true);
            }));
            disposableStore.add(prompt.onDidHide(() => {
                if (!isResolving) {
                    resolve(false);
                }
                this.filePickBox.show();
                this.hidden = false;
                disposableStore.dispose();
            }));
            disposableStore.add(prompt.onDidChangeValue(() => {
                prompt.hide();
            }));
            disposableStore.add(prompt.onDidCustom(() => {
                prompt.hide();
            }));
            prompt.show();
        });
    }
    async validate(uri) {
        if (uri === undefined) {
            this.filePickBox.validationMessage = nls.localize('remoteFileDialog.invalidPath', 'Please enter a valid path.');
            return Promise.resolve(false);
        }
        let stat;
        let statDirname;
        try {
            statDirname = await this.fileService.stat(resources.dirname(uri));
            stat = await this.fileService.stat(uri);
        }
        catch (e) {
            // do nothing
        }
        if (this.requiresTrailing) { // save
            if (stat?.isDirectory) {
                // Can't do this
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.validateFolder', 'The folder already exists. Please use a new file name.');
                return Promise.resolve(false);
            }
            else if (stat) {
                // Replacing a file.
                // Show a yes/no prompt
                const message = nls.localize('remoteFileDialog.validateExisting', '{0} already exists. Are you sure you want to overwrite it?', resources.basename(uri));
                return this.yesNoPrompt(uri, message);
            }
            else if (!(isValidBasename(resources.basename(uri), this.isWindows))) {
                // Filename not allowed
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.validateBadFilename', 'Please enter a valid file name.');
                return Promise.resolve(false);
            }
            else if (!statDirname) {
                // Folder to save in doesn't exist
                const message = nls.localize('remoteFileDialog.validateCreateDirectory', 'The folder {0} does not exist. Would you like to create it?', resources.basename(resources.dirname(uri)));
                return this.yesNoPrompt(uri, message);
            }
            else if (!statDirname.isDirectory) {
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.validateNonexistentDir', 'Please enter a path that exists.');
                return Promise.resolve(false);
            }
            else if (statDirname.readonly) {
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.validateReadonlyFolder', 'This folder cannot be used as a save destination. Please choose another folder');
                return Promise.resolve(false);
            }
        }
        else { // open
            if (!stat) {
                // File or folder doesn't exist
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.validateNonexistentDir', 'Please enter a path that exists.');
                return Promise.resolve(false);
            }
            else if (uri.path === '/' && this.isWindows) {
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.windowsDriveLetter', 'Please start the path with a drive letter.');
                return Promise.resolve(false);
            }
            else if (stat.isDirectory && !this.allowFolderSelection) {
                // Folder selected when folder selection not permitted
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.validateFileOnly', 'Please select a file.');
                return Promise.resolve(false);
            }
            else if (!stat.isDirectory && !this.allowFileSelection) {
                // File selected when file selection not permitted
                this.filePickBox.validationMessage = nls.localize('remoteFileDialog.validateFolderOnly', 'Please select a folder.');
                return Promise.resolve(false);
            }
        }
        return Promise.resolve(true);
    }
    // Returns true if there is a file at the end of the URI.
    async updateItems(newFolder, force = false, trailing) {
        this.busy = true;
        this.autoCompletePathSegment = '';
        const wasDotDot = trailing === '..';
        trailing = wasDotDot ? undefined : trailing;
        const isSave = !!trailing;
        let result = false;
        const updatingPromise = createCancelablePromise(async (token) => {
            let folderStat;
            try {
                folderStat = await this.fileService.resolve(newFolder);
                if (!folderStat.isDirectory) {
                    trailing = resources.basename(newFolder);
                    newFolder = resources.dirname(newFolder);
                    folderStat = undefined;
                    result = true;
                }
            }
            catch (e) {
                // The file/directory doesn't exist
            }
            const newValue = trailing ? this.pathAppend(newFolder, trailing) : this.pathFromUri(newFolder, true);
            this.currentFolder = this.endsWithSlash(newFolder.path) ? newFolder : resources.addTrailingPathSeparator(newFolder, this.separator);
            this.userEnteredPathSegment = trailing ? trailing : '';
            return this.createItems(folderStat, this.currentFolder, token).then(items => {
                if (token.isCancellationRequested) {
                    this.busy = false;
                    return false;
                }
                this.filePickBox.itemActivation = ItemActivation.NONE;
                this.filePickBox.items = items;
                // the user might have continued typing while we were updating. Only update the input box if it doesn't match the directory.
                if (!equalsIgnoreCase(this.filePickBox.value, newValue) && (force || wasDotDot)) {
                    this.filePickBox.valueSelection = [0, this.filePickBox.value.length];
                    this.insertText(newValue, newValue);
                }
                if (force && trailing && isSave) {
                    // Keep the cursor position in front of the save as name.
                    this.filePickBox.valueSelection = [this.filePickBox.value.length - trailing.length, this.filePickBox.value.length - trailing.length];
                }
                else if (!trailing) {
                    // If there is trailing, we don't move the cursor. If there is no trailing, cursor goes at the end.
                    this.filePickBox.valueSelection = [this.filePickBox.value.length, this.filePickBox.value.length];
                }
                this.busy = false;
                this.updatingPromise = undefined;
                return result;
            });
        });
        if (this.updatingPromise !== undefined) {
            this.updatingPromise.cancel();
        }
        this.updatingPromise = updatingPromise;
        return updatingPromise;
    }
    pathFromUri(uri, endWithSeparator = false) {
        // For authority-scoped schemes, use the raw path component instead
        // of fsPath, which would prepend the authority as a UNC prefix.
        // Strip the scopedPathPrefix so the user sees clean paths
        // (e.g. `/Users/roblou/code` instead of `/file/-/Users/roblou/code`).
        let result;
        if (this.scopedAuthority) {
            let path = uri.path;
            if (this.scopedPathPrefix && path.startsWith(this.scopedPathPrefix)) {
                path = path.substring(this.scopedPathPrefix.length);
            }
            result = path.replace(/\n/g, '');
        }
        else {
            result = normalizeDriveLetter(uri.fsPath, this.isWindows).replace(/\n/g, '');
        }
        if (this.separator === '/') {
            result = result.replace(/\\/g, this.separator);
        }
        else {
            result = result.replace(/\//g, this.separator);
        }
        if (endWithSeparator && !this.endsWithSlash(result)) {
            result = result + this.separator;
        }
        return result;
    }
    pathAppend(uri, additional) {
        if ((additional === '..') || (additional === '.')) {
            const basePath = this.pathFromUri(uri, true);
            return basePath + additional;
        }
        else {
            return this.pathFromUri(resources.joinPath(uri, additional));
        }
    }
    async checkIsWindowsOS() {
        let isWindowsOS = isWindows;
        const env = await this.getRemoteAgentEnvironment();
        if (env) {
            isWindowsOS = env.os === 1 /* OperatingSystem.Windows */;
        }
        return isWindowsOS;
    }
    endsWithSlash(s) {
        return /[\/\\]$/.test(s);
    }
    basenameWithTrailingSlash(fullPath) {
        const child = this.pathFromUri(fullPath, true);
        const parent = this.pathFromUri(resources.dirname(fullPath), true);
        return child.substring(parent.length);
    }
    async createBackItem(currFolder) {
        // For authority-scoped URIs with a path prefix, treat the prefix
        // root as the filesystem root so the user cannot navigate above it.
        if (this.scopedPathPrefix) {
            const pathAfterPrefix = currFolder.path.substring(this.scopedPathPrefix.length);
            if (pathAfterPrefix === '/' || pathAfterPrefix === '') {
                return undefined;
            }
        }
        // For authority-scoped URIs, compare within the original scheme so
        // that the authority is preserved and the root is detected correctly.
        const compareScheme = this.scopedAuthority ? this.scheme : Schemas.file;
        const compareAuthority = this.scopedAuthority ?? '';
        const fileRepresentationCurr = this.currentFolder.with({ scheme: compareScheme, authority: compareAuthority });
        const fileRepresentationParent = resources.dirname(fileRepresentationCurr);
        if (!resources.isEqual(fileRepresentationCurr, fileRepresentationParent)) {
            const parentFolder = resources.dirname(currFolder);
            if (await this.fileService.exists(parentFolder)) {
                return { label: '..', uri: resources.addTrailingPathSeparator(parentFolder, this.separator), isFolder: true };
            }
        }
        return undefined;
    }
    async createItems(folder, currentFolder, token) {
        const result = [];
        const backDir = await this.createBackItem(currentFolder);
        try {
            if (!folder) {
                folder = await this.fileService.resolve(currentFolder);
            }
            const filteredChildren = this._showDotFiles ? folder.children : folder.children?.filter(child => !child.name.startsWith('.'));
            const items = filteredChildren ? await Promise.all(filteredChildren.map(child => this.createItem(child, currentFolder, token))) : [];
            for (const item of items) {
                if (item) {
                    result.push(item);
                }
            }
        }
        catch (e) {
            // ignore
            console.log(e);
        }
        if (token.isCancellationRequested) {
            return [];
        }
        const sorted = result.sort((i1, i2) => {
            if (i1.isFolder !== i2.isFolder) {
                return i1.isFolder ? -1 : 1;
            }
            const trimmed1 = this.endsWithSlash(i1.label) ? i1.label.substr(0, i1.label.length - 1) : i1.label;
            const trimmed2 = this.endsWithSlash(i2.label) ? i2.label.substr(0, i2.label.length - 1) : i2.label;
            return trimmed1.localeCompare(trimmed2);
        });
        if (backDir) {
            sorted.unshift(backDir);
        }
        return sorted;
    }
    filterFile(file) {
        if (this.options.filters) {
            for (let i = 0; i < this.options.filters.length; i++) {
                for (let j = 0; j < this.options.filters[i].extensions.length; j++) {
                    const testExt = this.options.filters[i].extensions[j];
                    if ((testExt === '*') || (file.path.endsWith('.' + testExt))) {
                        return true;
                    }
                }
            }
            return false;
        }
        return true;
    }
    async createItem(stat, parent, token) {
        if (token.isCancellationRequested) {
            return undefined;
        }
        let fullPath = resources.joinPath(parent, stat.name);
        if (stat.isDirectory) {
            const filename = resources.basename(fullPath);
            fullPath = resources.addTrailingPathSeparator(fullPath, this.separator);
            return { label: filename, uri: fullPath, isFolder: true, iconClasses: getIconClasses(this.modelService, this.languageService, fullPath || undefined, FileKind.FOLDER) };
        }
        else if (!stat.isDirectory && this.allowFileSelection && this.filterFile(fullPath)) {
            return { label: stat.name, uri: fullPath, isFolder: false, iconClasses: getIconClasses(this.modelService, this.languageService, fullPath || undefined) };
        }
        return undefined;
    }
};
SimpleFileDialog = __decorate([
    __param(0, IFileService),
    __param(1, IQuickInputService),
    __param(2, ILabelService),
    __param(3, IWorkspaceContextService),
    __param(4, INotificationService),
    __param(5, IFileDialogService),
    __param(6, IModelService),
    __param(7, ILanguageService),
    __param(8, IWorkbenchEnvironmentService),
    __param(9, IRemoteAgentService),
    __param(10, IPathService),
    __param(11, IKeybindingService),
    __param(12, IContextKeyService),
    __param(13, IAccessibilityService),
    __param(14, IStorageService)
], SimpleFileDialog);
export { SimpleFileDialog };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2ltcGxlRmlsZURpYWxvZy5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9kaWFsb2dzL2Jyb3dzZXIvc2ltcGxlRmlsZURpYWxvZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sS0FBSyxTQUFTLE1BQU0sc0NBQXNDLENBQUM7QUFDbEUsT0FBTyxLQUFLLE9BQU8sTUFBTSxvQ0FBb0MsQ0FBQztBQUM5RCxPQUFPLEVBQUUsWUFBWSxFQUFhLFFBQVEsRUFBZ0MsTUFBTSw0Q0FBNEMsQ0FBQztBQUM3SCxPQUFPLEVBQUUsa0JBQWtCLEVBQThCLGNBQWMsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQ3RJLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEVBQUUsU0FBUyxFQUFtQixNQUFNLHFDQUFxQyxDQUFDO0FBQ2pGLE9BQU8sRUFBMEMsa0JBQWtCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUM1SCxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDM0UsT0FBTyxFQUFFLHdCQUF3QixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFDOUYsT0FBTyxFQUFFLG9CQUFvQixFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDaEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzREFBc0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sb0NBQW9DLENBQUM7QUFDN0QsT0FBTyxFQUFFLDRCQUE0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