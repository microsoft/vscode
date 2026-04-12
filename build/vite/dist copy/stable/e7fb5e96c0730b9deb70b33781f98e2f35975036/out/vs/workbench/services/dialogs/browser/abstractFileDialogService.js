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
import { isWorkspaceToOpen, isFileToOpen } from '../../../../platform/window/common/window.js';
import { IDialogService, getFileNamesMessage } from '../../../../platform/dialogs/common/dialogs.js';
import { isSavedWorkspace, isTemporaryWorkspace, IWorkspaceContextService, WORKSPACE_EXTENSION } from '../../../../platform/workspace/common/workspace.js';
import { IHistoryService } from '../../history/common/history.js';
import { IWorkbenchEnvironmentService } from '../../environment/common/environmentService.js';
import * as resources from '../../../../base/common/resources.js';
import { isAbsolute as localPathIsAbsolute, normalize as localPathNormalize } from '../../../../base/common/path.js';
import { IInstantiationService, } from '../../../../platform/instantiation/common/instantiation.js';
import { SimpleFileDialog } from './simpleFileDialog.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IHostService } from '../../host/browser/host.js';
import Severity from '../../../../base/common/severity.js';
import { coalesce, distinct } from '../../../../base/common/arrays.js';
import { trim } from '../../../../base/common/strings.js';
import { ILanguageService } from '../../../../editor/common/languages/language.js';
import { ILabelService } from '../../../../platform/label/common/label.js';
import { IPathService } from '../../path/common/pathService.js';
import { Schemas } from '../../../../base/common/network.js';
import { PLAINTEXT_EXTENSION } from '../../../../editor/common/languages/modesRegistry.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { EditorOpenSource } from '../../../../platform/editor/common/editor.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IRemoteAgentService } from '../../remote/common/remoteAgentService.js';
let AbstractFileDialogService = class AbstractFileDialogService {
    constructor(hostService, contextService, historyService, environmentService, instantiationService, configurationService, fileService, openerService, dialogService, languageService, workspacesService, labelService, pathService, commandService, editorService, codeEditorService, logService, remoteAgentService) {
        this.hostService = hostService;
        this.contextService = contextService;
        this.historyService = historyService;
        this.environmentService = environmentService;
        this.instantiationService = instantiationService;
        this.configurationService = configurationService;
        this.fileService = fileService;
        this.openerService = openerService;
        this.dialogService = dialogService;
        this.languageService = languageService;
        this.workspacesService = workspacesService;
        this.labelService = labelService;
        this.pathService = pathService;
        this.commandService = commandService;
        this.editorService = editorService;
        this.codeEditorService = codeEditorService;
        this.logService = logService;
        this.remoteAgentService = remoteAgentService;
    }
    async defaultFilePath(schemeFilter = this.getSchemeFilterForWindow(), authorityFilter = this.getAuthorityFilterForWindow()) {
        // Check for last active file first...
        let candidate = this.historyService.getLastActiveFile(schemeFilter, authorityFilter);
        // Skip user data files (e.g. Machine/settings.json) as default path candidates
        if (candidate && await this.isRemoteUserData(candidate)) {
            this.logService.debug(`[FileDialogService] Skipping last active file as it is a remote user data resource: ${candidate}`);
            candidate = undefined;
        }
        // ...then for last active file root
        if (!candidate) {
            candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter, authorityFilter);
            if (candidate) {
                this.logService.debug(`[FileDialogService] Default file path using last active workspace root: ${candidate}`);
            }
        }
        else {
            this.logService.debug(`[FileDialogService] Default file path using parent of last active file: ${candidate}`);
            candidate = resources.dirname(candidate);
        }
        if (!candidate) {
            candidate = await this.preferredHome(schemeFilter);
            this.logService.debug(`[FileDialogService] Default file path using preferred home: ${candidate}`);
        }
        return candidate;
    }
    async defaultFolderPath(schemeFilter = this.getSchemeFilterForWindow(), authorityFilter = this.getAuthorityFilterForWindow()) {
        // Check for last active file root first...
        let candidate = this.historyService.getLastActiveWorkspaceRoot(schemeFilter, authorityFilter);
        // ...then for last active file
        if (!candidate) {
            candidate = this.historyService.getLastActiveFile(schemeFilter, authorityFilter);
            // Skip user data files (e.g. Machine/settings.json) as default path candidates
            if (candidate && await this.isRemoteUserData(candidate)) {
                this.logService.debug(`[FileDialogService] Skipping last active file as it is a remote user data resource: ${candidate}`);
                candidate = undefined;
            }
            if (candidate) {
                this.logService.debug(`[FileDialogService] Default folder path using parent of last active file: ${candidate}`);
            }
        }
        else {
            this.logService.debug(`[FileDialogService] Default folder path using last active workspace root: ${candidate}`);
        }
        if (!candidate) {
            const preferredHome = await this.preferredHome(schemeFilter);
            this.logService.debug(`[FileDialogService] Default folder path using preferred home: ${preferredHome}`);
            return preferredHome;
        }
        return resources.dirname(candidate);
    }
    async preferredHome(schemeFilter = this.getSchemeFilterForWindow()) {
        const preferLocal = schemeFilter === Schemas.file;
        const preferredHomeConfig = this.configurationService.inspect('files.dialog.defaultPath');
        const preferredHomeCandidate = preferLocal ? preferredHomeConfig.userLocalValue : preferredHomeConfig.userRemoteValue;
        this.logService.debug(`[FileDialogService] Preferred home: preferLocal=${preferLocal}, userLocalValue=${preferredHomeConfig.userLocalValue}, userRemoteValue=${preferredHomeConfig.userRemoteValue}`);
        if (preferredHomeCandidate) {
            const isPreferredHomeCandidateAbsolute = preferLocal ? localPathIsAbsolute(preferredHomeCandidate) : (await this.pathService.path).isAbsolute(preferredHomeCandidate);
            if (isPreferredHomeCandidateAbsolute) {
                const preferredHomeNormalized = preferLocal ? localPathNormalize(preferredHomeCandidate) : (await this.pathService.path).normalize(preferredHomeCandidate);
                const preferredHome = resources.toLocalResource(await this.pathService.fileURI(preferredHomeNormalized), this.environmentService.remoteAuthority, this.pathService.defaultUriScheme);
                if (await this.fileService.exists(preferredHome)) {
                    this.logService.debug(`[FileDialogService] Preferred home using files.dialog.defaultPath setting: ${preferredHome}`);
                    return preferredHome;
                }
                this.logService.debug(`[FileDialogService] Preferred home files.dialog.defaultPath path does not exist: ${preferredHome}`);
            }
            else {
                this.logService.debug(`[FileDialogService] Preferred home files.dialog.defaultPath is not absolute: ${preferredHomeCandidate}`);
            }
        }
        const userHome = this.pathService.userHome({ preferLocal });
        this.logService.debug(`[FileDialogService] Preferred home using user home: ${userHome}`);
        return userHome;
    }
    async defaultWorkspacePath(schemeFilter = this.getSchemeFilterForWindow()) {
        let defaultWorkspacePath;
        // Check for current workspace config file first...
        if (this.contextService.getWorkbenchState() === 3 /* WorkbenchState.WORKSPACE */) {
            const configuration = this.contextService.getWorkspace().configuration;
            if (configuration?.scheme === schemeFilter && isSavedWorkspace(configuration, this.environmentService) && !isTemporaryWorkspace(configuration)) {
                defaultWorkspacePath = resources.dirname(configuration);
            }
        }
        // ...then fallback to default file path
        if (!defaultWorkspacePath) {
            defaultWorkspacePath = await this.defaultFilePath(schemeFilter);
        }
        return defaultWorkspacePath;
    }
    async showSaveConfirm(fileNamesOrResources) {
        if (this.skipDialogs()) {
            this.logService.trace('FileDialogService: refused to show save confirmation dialog in tests.');
            // no veto when we are in extension dev testing mode because we cannot assume we run interactive
            return 1 /* ConfirmResult.DONT_SAVE */;
        }
        return this.doShowSaveConfirm(fileNamesOrResources);
    }
    skipDialogs() {
        if (this.environmentService.enableSmokeTestDriver) {
            this.logService.warn('DialogService: Dialog requested during smoke test.');
        }
        // integration tests
        return this.environmentService.isExtensionDevelopment && !!this.environmentService.extensionTestsLocationURI;
    }
    async doShowSaveConfirm(fileNamesOrResources) {
        if (fileNamesOrResources.length === 0) {
            return 1 /* ConfirmResult.DONT_SAVE */;
        }
        let message;
        let detail = nls.localize('saveChangesDetail', "Your changes will be lost if you don't save them.");
        if (fileNamesOrResources.length === 1) {
            message = nls.localize('saveChangesMessage', "Do you want to save the changes you made to {0}?", typeof fileNamesOrResources[0] === 'string' ? fileNamesOrResources[0] : resources.basename(fileNamesOrResources[0]));
        }
        else {
            message = nls.localize('saveChangesMessages', "Do you want to save the changes to the following {0} files?", fileNamesOrResources.length);
            detail = getFileNamesMessage(fileNamesOrResources) + '\n' + detail;
        }
        const { result } = await this.dialogService.prompt({
            type: Severity.Warning,
            message,
            detail,
            buttons: [
                {
                    label: fileNamesOrResources.length > 1 ?
                        nls.localize({ key: 'saveAll', comment: ['&& denotes a mnemonic'] }, "&&Save All") :
                        nls.localize({ key: 'save', comment: ['&& denotes a mnemonic'] }, "&&Save"),
                    run: () => 0 /* ConfirmResult.SAVE */
                },
                {
                    label: nls.localize({ key: 'dontSave', comment: ['&& denotes a mnemonic'] }, "Do&&n't Save"),
                    run: () => 1 /* ConfirmResult.DONT_SAVE */
                }
            ],
            cancelButton: {
                run: () => 2 /* ConfirmResult.CANCEL */
            }
        });
        return result;
    }
    addFileSchemaIfNeeded(schema, _isFolder) {
        return schema === Schemas.untitled ? [Schemas.file] : (schema !== Schemas.file ? [schema, Schemas.file] : [schema]);
    }
    async pickFileFolderAndOpenSimplified(schema, options, preferNewWindow) {
        const title = nls.localize('openFileOrFolder.title', 'Open File or Folder');
        const availableFileSystems = this.addFileSchemaIfNeeded(schema);
        const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
        const uri = uris?.[0];
        if (uri) {
            const stat = await this.fileService.stat(uri);
            const toOpen = stat.isDirectory ? { folderUri: uri } : { fileUri: uri };
            if (!isWorkspaceToOpen(toOpen) && isFileToOpen(toOpen)) {
                this.addFileToRecentlyOpened(toOpen.fileUri);
            }
            if (stat.isDirectory || options.forceNewWindow || preferNewWindow) {
                await this.hostService.openWindow([toOpen], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
            }
            else {
                await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], undefined, { validateTrust: true });
            }
        }
    }
    async pickFileAndOpenSimplified(schema, options, preferNewWindow) {
        const title = nls.localize('openFile.title', 'Open File');
        const availableFileSystems = this.addFileSchemaIfNeeded(schema);
        const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
        const uri = uris?.[0];
        if (uri) {
            this.addFileToRecentlyOpened(uri);
            if (options.forceNewWindow || preferNewWindow) {
                await this.hostService.openWindow([{ fileUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
            }
            else {
                await this.editorService.openEditors([{ resource: uri, options: { source: EditorOpenSource.USER, pinned: true } }], undefined, { validateTrust: true });
            }
        }
    }
    addFileToRecentlyOpened(uri) {
        this.workspacesService.addRecentlyOpened([{ fileUri: uri, label: this.labelService.getUriLabel(uri, { appendWorkspaceSuffix: true }) }]);
    }
    async pickFolderAndOpenSimplified(schema, options) {
        const title = nls.localize('openFolder.title', 'Open Folder');
        const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);
        const uris = await this.pickResource({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, defaultUri: options.defaultUri, title, availableFileSystems });
        const uri = uris?.[0];
        if (uri) {
            return this.hostService.openWindow([{ folderUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
        }
    }
    async pickWorkspaceAndOpenSimplified(schema, options) {
        const title = nls.localize('openWorkspace.title', 'Open Workspace from File');
        const filters = [{ name: nls.localize('filterName.workspace', 'Workspace'), extensions: [WORKSPACE_EXTENSION] }];
        const availableFileSystems = this.addFileSchemaIfNeeded(schema, true);
        const uris = await this.pickResource({ canSelectFiles: true, canSelectFolders: false, canSelectMany: false, defaultUri: options.defaultUri, title, filters, availableFileSystems });
        const uri = uris?.[0];
        if (uri) {
            return this.hostService.openWindow([{ workspaceUri: uri }], { forceNewWindow: options.forceNewWindow, remoteAuthority: options.remoteAuthority });
        }
    }
    async pickFileToSaveSimplified(schema, options) {
        if (!options.availableFileSystems) {
            options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
        }
        options.title = nls.localize('saveFileAs.title', 'Save As');
        const uri = await this.saveRemoteResource(options);
        if (uri) {
            this.addFileToRecentlyOpened(uri);
        }
        return uri;
    }
    async showSaveDialogSimplified(schema, options) {
        if (!options.availableFileSystems) {
            options.availableFileSystems = this.addFileSchemaIfNeeded(schema);
        }
        return this.saveRemoteResource(options);
    }
    async showOpenDialogSimplified(schema, options) {
        if (!options.availableFileSystems) {
            options.availableFileSystems = this.addFileSchemaIfNeeded(schema, options.canSelectFolders);
        }
        return this.pickResource(options);
    }
    getSimpleFileDialog() {
        return this.instantiationService.createInstance(SimpleFileDialog);
    }
    pickResource(options) {
        return this.getSimpleFileDialog().showOpenDialog(options);
    }
    saveRemoteResource(options) {
        return this.getSimpleFileDialog().showSaveDialog(options);
    }
    /**
     * Checks whether the given resource is a remote user data file
     * that should not be used as a default file dialog path candidate.
     * This covers remote user data files such as settings.json, keybindings.json, etc.
     */
    async isRemoteUserData(resource) {
        if (!this.environmentService.remoteAuthority) {
            return false;
        }
        const remoteEnv = await this.remoteAgentService.getEnvironment();
        if (remoteEnv) {
            const remoteDataHome = resources.dirname(resources.dirname(remoteEnv.settingsPath));
            if (!resources.isEqual(remoteDataHome, remoteDataHome.with({ path: '/' })) && resources.isEqualOrParent(resource, remoteDataHome)) {
                return true;
            }
        }
        return false;
    }
    getSchemeFilterForWindow(defaultUriScheme) {
        return defaultUriScheme ?? this.pathService.defaultUriScheme;
    }
    getAuthorityFilterForWindow() {
        return this.environmentService.remoteAuthority;
    }
    getFileSystemSchema(options) {
        return options.availableFileSystems?.[0] || this.getSchemeFilterForWindow(options.defaultUri?.scheme);
    }
    getWorkspaceAvailableFileSystems(options) {
        if (options.availableFileSystems && (options.availableFileSystems.length > 0)) {
            return options.availableFileSystems;
        }
        const availableFileSystems = [Schemas.file];
        if (this.environmentService.remoteAuthority) {
            availableFileSystems.unshift(Schemas.vscodeRemote);
        }
        return availableFileSystems;
    }
    getPickFileToSaveDialogOptions(defaultUri, availableFileSystems) {
        const options = {
            defaultUri,
            title: nls.localize('saveAsTitle', "Save As"),
            availableFileSystems
        };
        // Build the file filter by using our known languages
        const ext = defaultUri ? resources.extname(defaultUri) : undefined;
        let matchingFilter;
        const registeredLanguageNames = this.languageService.getSortedRegisteredLanguageNames();
        const registeredLanguageFilters = coalesce(registeredLanguageNames.map(({ languageName, languageId }) => {
            const extensions = this.languageService.getExtensions(languageId);
            if (!extensions.length) {
                return null;
            }
            const filter = { name: languageName, extensions: distinct(extensions).slice(0, 10).map(e => trim(e, '.')) };
            // https://github.com/microsoft/vscode/issues/115860
            const extOrPlaintext = ext || PLAINTEXT_EXTENSION;
            if (!matchingFilter && extensions.includes(extOrPlaintext)) {
                matchingFilter = filter;
                // The selected extension must be in the set of extensions that are in the filter list that is sent to the save dialog.
                // If it isn't, add it manually. https://github.com/microsoft/vscode/issues/147657
                const trimmedExt = trim(extOrPlaintext, '.');
                if (!filter.extensions.includes(trimmedExt)) {
                    filter.extensions.unshift(trimmedExt);
                }
                return null; // first matching filter will be added to the top
            }
            return filter;
        }));
        // We have no matching filter, e.g. because the language
        // is unknown. We still add the extension to the list of
        // filters though so that it can be picked
        // (https://github.com/microsoft/vscode/issues/96283)
        if (!matchingFilter && ext) {
            matchingFilter = { name: trim(ext, '.').toUpperCase(), extensions: [trim(ext, '.')] };
        }
        // Order of filters is
        // - All Files (we MUST do this to fix macOS issue https://github.com/microsoft/vscode/issues/102713)
        // - File Extension Match (if any)
        // - All Languages
        // - No Extension
        options.filters = coalesce([
            { name: nls.localize('allFiles', "All Files"), extensions: ['*'] },
            matchingFilter,
            ...registeredLanguageFilters,
            { name: nls.localize('noExt', "No Extension"), extensions: [''] }
        ]);
        return options;
    }
};
AbstractFileDialogService = __decorate([
    __param(0, IHostService),
    __param(1, IWorkspaceContextService),
    __param(2, IHistoryService),
    __param(3, IWorkbenchEnvironmentService),
    __param(4, IInstantiationService),
    __param(5, IConfigurationService),
    __param(6, IFileService),
    __param(7, IOpenerService),
    __param(8, IDialogService),
    __param(9, ILanguageService),
    __param(10, IWorkspacesService),
    __param(11, ILabelService),
    __param(12, IPathService),
    __param(13, ICommandService),
    __param(14, IEditorService),
    __param(15, ICodeEditorService),
    __param(16, ILogService),
    __param(17, IRemoteAgentService)
], AbstractFileDialogService);
export { AbstractFileDialogService };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYWJzdHJhY3RGaWxlRGlhbG9nU2VydmljZS5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9zZXJ2aWNlcy9kaWFsb2dzL2Jyb3dzZXIvYWJzdHJhY3RGaWxlRGlhbG9nU2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUVoRyxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBbUIsaUJBQWlCLEVBQUUsWUFBWSxFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDaEgsT0FBTyxFQUErRixjQUFjLEVBQWlCLG1CQUFtQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDak4sT0FBTyxFQUFFLGdCQUFnQixFQUFFLG9CQUFvQixFQUFFLHdCQUF3QixFQUFrQixtQkFBbUIsRUFBRSxNQUFNLG9EQUFvRCxDQUFDO0FBQzNLLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSxpQ0FBaUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsNEJBQTRCLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUU5RixPQUFPLEtBQUssU0FBUyxNQUFNLHNDQUFzQyxDQUFDO0FBQ2xFLE9BQU8sRUFBRSxVQUFVLElBQUksbUJBQW1CLEVBQUUsU0FBUyxJQUFJLGtCQUFrQixFQUFFLE1BQU0saUNBQWlDLENBQUM7QUFDckgsT0FBTyxFQUFFLHFCQUFxQixHQUFHLE1BQU0sNERBQTRELENBQUM7QUFDcEcsT0FBTyxFQUFxQixnQkFBZ0IsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQzVFLE9BQU8sRUFBRSxrQkFBa0IsRUFBRSxNQUFNLHNEQUFzRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLDREQUE0RCxDQUFDO0FBQ25HLE9BQU8sRUFBRSxZQUFZLEVBQUUsTUFBTSw0Q0FBNEMsQ0FBQztBQUMxRSxP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