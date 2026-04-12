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
import * as json from '../../../../base/common/json.js';
import { setProperty } from '../../../../base/common/jsonEdit.js';
import { Queue } from '../../../../base/common/async.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { FOLDER_SETTINGS_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, USER_STANDALONE_CONFIGURATIONS, TASKS_DEFAULT, FOLDER_SCOPES, IWorkbenchConfigurationService, APPLICATION_SCOPES, MCP_CONFIGURATION_KEY } from './configuration.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { Extensions as ConfigurationExtensions, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_REGEX } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IPreferencesService } from '../../preferences/common/preferences.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { ErrorNoTelemetry } from '../../../../base/common/errors.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';
export var ConfigurationEditingErrorCode;
(function (ConfigurationEditingErrorCode) {
    /**
     * Error when trying to write a configuration key that is not registered.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_UNKNOWN_KEY"] = 0] = "ERROR_UNKNOWN_KEY";
    /**
     * Error when trying to write an application setting into workspace settings.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION"] = 1] = "ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION";
    /**
     * Error when trying to write a machne setting into workspace settings.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE"] = 2] = "ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE";
    /**
     * Error when trying to write an invalid folder configuration key to folder settings.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_FOLDER_CONFIGURATION"] = 3] = "ERROR_INVALID_FOLDER_CONFIGURATION";
    /**
     * Error when trying to write to user target but not supported for provided key.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_USER_TARGET"] = 4] = "ERROR_INVALID_USER_TARGET";
    /**
     * Error when trying to write to user target but not supported for provided key.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_WORKSPACE_TARGET"] = 5] = "ERROR_INVALID_WORKSPACE_TARGET";
    /**
     * Error when trying to write a configuration key to folder target
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_FOLDER_TARGET"] = 6] = "ERROR_INVALID_FOLDER_TARGET";
    /**
     * Error when trying to write to language specific setting but not supported for preovided key
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION"] = 7] = "ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION";
    /**
     * Error when trying to write to the workspace configuration without having a workspace opened.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_NO_WORKSPACE_OPENED"] = 8] = "ERROR_NO_WORKSPACE_OPENED";
    /**
     * Error when trying to write and save to the configuration file while it is dirty in the editor.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_CONFIGURATION_FILE_DIRTY"] = 9] = "ERROR_CONFIGURATION_FILE_DIRTY";
    /**
     * Error when trying to write and save to the configuration file while it is not the latest in the disk.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_CONFIGURATION_FILE_MODIFIED_SINCE"] = 10] = "ERROR_CONFIGURATION_FILE_MODIFIED_SINCE";
    /**
     * Error when trying to write to a configuration file that contains JSON errors.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INVALID_CONFIGURATION"] = 11] = "ERROR_INVALID_CONFIGURATION";
    /**
     * Error when trying to write a policy configuration
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_POLICY_CONFIGURATION"] = 12] = "ERROR_POLICY_CONFIGURATION";
    /**
     * Internal Error.
     */
    ConfigurationEditingErrorCode[ConfigurationEditingErrorCode["ERROR_INTERNAL"] = 13] = "ERROR_INTERNAL";
})(ConfigurationEditingErrorCode || (ConfigurationEditingErrorCode = {}));
export class ConfigurationEditingError extends ErrorNoTelemetry {
    constructor(message, code) {
        super(message);
        this.code = code;
    }
}
export var EditableConfigurationTarget;
(function (EditableConfigurationTarget) {
    EditableConfigurationTarget[EditableConfigurationTarget["USER_LOCAL"] = 1] = "USER_LOCAL";
    EditableConfigurationTarget[EditableConfigurationTarget["USER_REMOTE"] = 2] = "USER_REMOTE";
    EditableConfigurationTarget[EditableConfigurationTarget["WORKSPACE"] = 3] = "WORKSPACE";
    EditableConfigurationTarget[EditableConfigurationTarget["WORKSPACE_FOLDER"] = 4] = "WORKSPACE_FOLDER";
})(EditableConfigurationTarget || (EditableConfigurationTarget = {}));
let ConfigurationEditing = class ConfigurationEditing {
    constructor(remoteSettingsResource, configurationService, contextService, userDataProfileService, userDataProfilesService, fileService, textModelResolverService, textFileService, notificationService, preferencesService, editorService, uriIdentityService, filesConfigurationService) {
        this.remoteSettingsResource = remoteSettingsResource;
        this.configurationService = configurationService;
        this.contextService = contextService;
        this.userDataProfileService = userDataProfileService;
        this.userDataProfilesService = userDataProfilesService;
        this.fileService = fileService;
        this.textModelResolverService = textModelResolverService;
        this.textFileService = textFileService;
        this.notificationService = notificationService;
        this.preferencesService = preferencesService;
        this.editorService = editorService;
        this.uriIdentityService = uriIdentityService;
        this.filesConfigurationService = filesConfigurationService;
        this.queue = new Queue();
    }
    async writeConfiguration(target, value, options = {}) {
        const operation = this.getConfigurationEditOperation(target, value, options.scopes || {});
        // queue up writes to prevent race conditions
        return this.queue.queue(async () => {
            try {
                await this.doWriteConfiguration(operation, options);
            }
            catch (error) {
                if (options.donotNotifyError) {
                    throw error;
                }
                await this.onError(error, operation, options.scopes);
            }
        });
    }
    async doWriteConfiguration(operation, options) {
        await this.validate(operation.target, operation, !options.handleDirtyFile, options.scopes || {});
        const resource = operation.resource;
        const reference = await this.resolveModelReference(resource);
        try {
            const formattingOptions = this.getFormattingOptions(reference.object.textEditorModel);
            await this.updateConfiguration(operation, reference.object.textEditorModel, formattingOptions, options);
        }
        finally {
            reference.dispose();
        }
    }
    async updateConfiguration(operation, model, formattingOptions, options) {
        if (this.hasParseErrors(model.getValue(), operation)) {
            throw this.toConfigurationEditingError(11 /* ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION */, operation.target, operation);
        }
        if (this.textFileService.isDirty(model.uri) && options.handleDirtyFile) {
            switch (options.handleDirtyFile) {
                case 'save':
                    await this.save(model, operation);
                    break;
                case 'revert':
                    await this.textFileService.revert(model.uri);
                    break;
            }
        }
        const edit = this.getEdits(operation, model.getValue(), formattingOptions)[0];
        if (edit) {
            let disposable;
            try {
                // Optimization: we apply edits to a text model and save it
                // right after. Use the files config service to signal this
                // to the workbench to optimise the UI during this operation.
                // For example, avoids to briefly show dirty indicators.
                disposable = this.filesConfigurationService.enableAutoSaveAfterShortDelay(model.uri);
                if (this.applyEditsToBuffer(edit, model)) {
                    await this.save(model, operation);
                }
            }
            finally {
                disposable?.dispose();
            }
        }
    }
    async save(model, operation) {
        try {
            await this.textFileService.save(model.uri, { ignoreErrorHandler: true });
        }
        catch (error) {
            if (error.fileOperationResult === 3 /* FileOperationResult.FILE_MODIFIED_SINCE */) {
                throw this.toConfigurationEditingError(10 /* ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */, operation.target, operation);
            }
            throw new ConfigurationEditingError(nls.localize('fsError', "Error while writing to {0}. {1}", this.stringifyTarget(operation.target), error.message), 13 /* ConfigurationEditingErrorCode.ERROR_INTERNAL */);
        }
    }
    applyEditsToBuffer(edit, model) {
        const startPosition = model.getPositionAt(edit.offset);
        const endPosition = model.getPositionAt(edit.offset + edit.length);
        const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
        const currentText = model.getValueInRange(range);
        if (edit.content !== currentText) {
            const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
            model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
            return true;
        }
        return false;
    }
    getEdits({ value, jsonPath }, modelContent, formattingOptions) {
        if (jsonPath.length) {
            return setProperty(modelContent, jsonPath, value, formattingOptions);
        }
        // Without jsonPath, the entire configuration file is being replaced, so we just use JSON.stringify
        const content = JSON.stringify(value, null, formattingOptions.insertSpaces && formattingOptions.tabSize ? ' '.repeat(formattingOptions.tabSize) : '\t');
        return [{
                content,
                length: modelContent.length,
                offset: 0
            }];
    }
    getFormattingOptions(model) {
        const { insertSpaces, tabSize } = model.getOptions();
        const eol = model.getEOL();
        return { insertSpaces, tabSize, eol };
    }
    async onError(error, operation, scopes) {
        switch (error.code) {
            case 11 /* ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION */:
                this.onInvalidConfigurationError(error, operation);
                break;
            case 9 /* ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY */:
                this.onConfigurationFileDirtyError(error, operation, scopes);
                break;
            case 10 /* ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */:
                return this.doWriteConfiguration(operation, { scopes, handleDirtyFile: 'revert' });
            default:
                this.notificationService.error(error.message);
        }
    }
    onInvalidConfigurationError(error, operation) {
        const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
            : operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
                : operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY ? nls.localize('openMcpConfiguration', "Open MCP Configuration")
                    : null;
        if (openStandAloneConfigurationActionLabel) {
            this.notificationService.prompt(Severity.Error, error.message, [{
                    label: openStandAloneConfigurationActionLabel,
                    run: () => this.openFile(operation.resource)
                }]);
        }
        else {
            this.notificationService.prompt(Severity.Error, error.message, [{
                    label: nls.localize('open', "Open Settings"),
                    run: () => this.openSettings(operation)
                }]);
        }
    }
    onConfigurationFileDirtyError(error, operation, scopes) {
        const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
            : operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
                : null;
        if (openStandAloneConfigurationActionLabel) {
            this.notificationService.prompt(Severity.Error, error.message, [{
                    label: nls.localize('saveAndRetry', "Save and Retry"),
                    run: () => {
                        const key = operation.key ? `${operation.workspaceStandAloneConfigurationKey}.${operation.key}` : operation.workspaceStandAloneConfigurationKey;
                        this.writeConfiguration(operation.target, { key, value: operation.value }, { handleDirtyFile: 'save', scopes });
                    }
                },
                {
                    label: openStandAloneConfigurationActionLabel,
                    run: () => this.openFile(operation.resource)
                }]);
        }
        else {
            this.notificationService.prompt(Severity.Error, error.message, [{
                    label: nls.localize('saveAndRetry', "Save and Retry"),
                    run: () => this.writeConfiguration(operation.target, { key: operation.key, value: operation.value }, { handleDirtyFile: 'save', scopes })
                },
                {
                    label: nls.localize('open', "Open Settings"),
                    run: () => this.openSettings(operation)
                }]);
        }
    }
    openSettings(operation) {
        const options = { jsonEditor: true };
        switch (operation.target) {
            case 1 /* EditableConfigurationTarget.USER_LOCAL */:
                this.preferencesService.openUserSettings(options);
                break;
            case 2 /* EditableConfigurationTarget.USER_REMOTE */:
                this.preferencesService.openRemoteSettings(options);
                break;
            case 3 /* EditableConfigurationTarget.WORKSPACE */:
                this.preferencesService.openWorkspaceSettings(options);
                break;
            case 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */:
                if (operation.resource) {
                    const workspaceFolder = this.contextService.getWorkspaceFolder(operation.resource);
                    if (workspaceFolder) {
                        this.preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, jsonEditor: true });
                    }
                }
                break;
        }
    }
    openFile(resource) {
        this.editorService.openEditor({ resource, options: { pinned: true } });
    }
    toConfigurationEditingError(code, target, operation) {
        const message = this.toErrorMessage(code, target, operation);
        return new ConfigurationEditingError(message, code);
    }
    toErrorMessage(error, target, operation) {
        switch (error) {
            // API constraints
            case 12 /* ConfigurationEditingErrorCode.ERROR_POLICY_CONFIGURATION */: return nls.localize('errorPolicyConfiguration', "Unable to write {0} because it is configured in system policy.", operation.key);
            case 0 /* ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY */: return nls.localize('errorUnknownKey', "Unable to write to {0} because {1} is not a registered configuration.", this.stringifyTarget(target), operation.key);
            case 1 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */: return nls.localize('errorInvalidWorkspaceConfigurationApplication', "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
            case 2 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */: return nls.localize('errorInvalidWorkspaceConfigurationMachine', "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
            case 3 /* ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION */: return nls.localize('errorInvalidFolderConfiguration', "Unable to write to Folder Settings because {0} does not support the folder resource scope.", operation.key);
            case 4 /* ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET */: return nls.localize('errorInvalidUserTarget', "Unable to write to User Settings because {0} does not support for global scope.", operation.key);
            case 5 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_TARGET */: return nls.localize('errorInvalidWorkspaceTarget', "Unable to write to Workspace Settings because {0} does not support for workspace scope in a multi folder workspace.", operation.key);
            case 6 /* ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET */: return nls.localize('errorInvalidFolderTarget', "Unable to write to Folder Settings because no resource is provided.");
            case 7 /* ConfigurationEditingErrorCode.ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION */: return nls.localize('errorInvalidResourceLanguageConfiguration', "Unable to write to Language Settings because {0} is not a resource language setting.", operation.key);
            case 8 /* ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED */: return nls.localize('errorNoWorkspaceOpened', "Unable to write to {0} because no workspace is opened. Please open a workspace first and try again.", this.stringifyTarget(target));
            // User issues
            case 11 /* ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION */: {
                if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
                    return nls.localize('errorInvalidTaskConfiguration', "Unable to write into the tasks configuration file. Please open it to correct errors/warnings in it and try again.");
                }
                if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
                    return nls.localize('errorInvalidLaunchConfiguration', "Unable to write into the launch configuration file. Please open it to correct errors/warnings in it and try again.");
                }
                if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
                    return nls.localize('errorInvalidMCPConfiguration', "Unable to write into the MCP configuration file. Please open it to correct errors/warnings in it and try again.");
                }
                switch (target) {
                    case 1 /* EditableConfigurationTarget.USER_LOCAL */:
                        return nls.localize('errorInvalidConfiguration', "Unable to write into user settings. Please open the user settings to correct errors/warnings in it and try again.");
                    case 2 /* EditableConfigurationTarget.USER_REMOTE */:
                        return nls.localize('errorInvalidRemoteConfiguration', "Unable to write into remote user settings. Please open the remote user settings to correct errors/warnings in it and try again.");
                    case 3 /* EditableConfigurationTarget.WORKSPACE */:
                        return nls.localize('errorInvalidConfigurationWorkspace', "Unable to write into workspace settings. Please open the workspace settings to correct errors/warnings in the file and try again.");
                    case 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */: {
                        let workspaceFolderName = '<<unknown>>';
                        if (operation.resource) {
                            const folder = this.contextService.getWorkspaceFolder(operation.resource);
                            if (folder) {
                                workspaceFolderName = folder.name;
                            }
                        }
                        return nls.localize('errorInvalidConfigurationFolder', "Unable to write into folder settings. Please open the '{0}' folder settings to correct errors/warnings in it and try again.", workspaceFolderName);
                    }
                    default:
                        return '';
                }
            }
            case 9 /* ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY */: {
                if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
                    return nls.localize('errorTasksConfigurationFileDirty', "Unable to write into tasks configuration file because the file has unsaved changes. Please save it first and then try again.");
                }
                if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
                    return nls.localize('errorLaunchConfigurationFileDirty', "Unable to write into launch configuration file because the file has unsaved changes. Please save it first and then try again.");
                }
                if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
                    return nls.localize('errorMCPConfigurationFileDirty', "Unable to write into MCP configuration file because the file has unsaved changes. Please save it first and then try again.");
                }
                switch (target) {
                    case 1 /* EditableConfigurationTarget.USER_LOCAL */:
                        return nls.localize('errorConfigurationFileDirty', "Unable to write into user settings because the file has unsaved changes. Please save the user settings file first and then try again.");
                    case 2 /* EditableConfigurationTarget.USER_REMOTE */:
                        return nls.localize('errorRemoteConfigurationFileDirty', "Unable to write into remote user settings because the file has unsaved changes. Please save the remote user settings file first and then try again.");
                    case 3 /* EditableConfigurationTarget.WORKSPACE */:
                        return nls.localize('errorConfigurationFileDirtyWorkspace', "Unable to write into workspace settings because the file has unsaved changes. Please save the workspace settings file first and then try again.");
                    case 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */: {
                        let workspaceFolderName = '<<unknown>>';
                        if (operation.resource) {
                            const folder = this.contextService.getWorkspaceFolder(operation.resource);
                            if (folder) {
                                workspaceFolderName = folder.name;
                            }
                        }
                        return nls.localize('errorConfigurationFileDirtyFolder', "Unable to write into folder settings because the file has unsaved changes. Please save the '{0}' folder settings file first and then try again.", workspaceFolderName);
                    }
                    default:
                        return '';
                }
            }
            case 10 /* ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_MODIFIED_SINCE */:
                if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
                    return nls.localize('errorTasksConfigurationFileModifiedSince', "Unable to write into tasks configuration file because the content of the file is newer.");
                }
                if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
                    return nls.localize('errorLaunchConfigurationFileModifiedSince', "Unable to write into launch configuration file because the content of the file is newer.");
                }
                if (operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY) {
                    return nls.localize('errorMCPConfigurationFileModifiedSince', "Unable to write into MCP configuration file because the content of the file is newer.");
                }
                switch (target) {
                    case 1 /* EditableConfigurationTarget.USER_LOCAL */:
                        return nls.localize('errorConfigurationFileModifiedSince', "Unable to write into user settings because the content of the file is newer.");
                    case 2 /* EditableConfigurationTarget.USER_REMOTE */:
                        return nls.localize('errorRemoteConfigurationFileModifiedSince', "Unable to write into remote user settings because the content of the file is newer.");
                    case 3 /* EditableConfigurationTarget.WORKSPACE */:
                        return nls.localize('errorConfigurationFileModifiedSinceWorkspace', "Unable to write into workspace settings because the content of the file is newer.");
                    case 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */:
                        return nls.localize('errorConfigurationFileModifiedSinceFolder', "Unable to write into folder settings because the content of the file is newer.");
                }
            case 13 /* ConfigurationEditingErrorCode.ERROR_INTERNAL */: return nls.localize('errorUnknown', "Unable to write to {0} because of an internal error.", this.stringifyTarget(target));
        }
    }
    stringifyTarget(target) {
        switch (target) {
            case 1 /* EditableConfigurationTarget.USER_LOCAL */:
                return nls.localize('userTarget', "User Settings");
            case 2 /* EditableConfigurationTarget.USER_REMOTE */:
                return nls.localize('remoteUserTarget', "Remote User Settings");
            case 3 /* EditableConfigurationTarget.WORKSPACE */:
                return nls.localize('workspaceTarget', "Workspace Settings");
            case 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */:
                return nls.localize('folderTarget', "Folder Settings");
            default:
                return '';
        }
    }
    defaultResourceValue(resource) {
        const basename = this.uriIdentityService.extUri.basename(resource);
        const configurationValue = basename.substr(0, basename.length - this.uriIdentityService.extUri.extname(resource).length);
        switch (configurationValue) {
            case TASKS_CONFIGURATION_KEY: return TASKS_DEFAULT;
            default: return '{}';
        }
    }
    async resolveModelReference(resource) {
        const exists = await this.fileService.exists(resource);
        if (!exists) {
            await this.textFileService.write(resource, this.defaultResourceValue(resource), { encoding: 'utf8' });
        }
        return this.textModelResolverService.createModelReference(resource);
    }
    hasParseErrors(content, operation) {
        // If we write to a workspace standalone file and replace the entire contents (no key provided)
        // we can return here because any parse errors can safely be ignored since all contents are replaced
        if (operation.workspaceStandAloneConfigurationKey && !operation.key) {
            return false;
        }
        const parseErrors = [];
        json.parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
        return parseErrors.length > 0;
    }
    async validate(target, operation, checkDirty, overrides) {
        if (this.configurationService.inspect(operation.key).policyValue !== undefined) {
            throw this.toConfigurationEditingError(12 /* ConfigurationEditingErrorCode.ERROR_POLICY_CONFIGURATION */, target, operation);
        }
        const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
        const configurationScope = configurationProperties[operation.key]?.scope;
        /**
         * Key to update must be a known setting from the registry unless
         * 	- the key is standalone configuration (eg: tasks, debug)
         * 	- the key is an override identifier
         * 	- the operation is to delete the key
         */
        if (!operation.workspaceStandAloneConfigurationKey) {
            const validKeys = this.configurationService.keys().default;
            if (validKeys.indexOf(operation.key) < 0 && !OVERRIDE_PROPERTY_REGEX.test(operation.key) && operation.value !== undefined) {
                throw this.toConfigurationEditingError(0 /* ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY */, target, operation);
            }
        }
        if (operation.workspaceStandAloneConfigurationKey) {
            // Global launches are not supported
            if ((operation.workspaceStandAloneConfigurationKey !== TASKS_CONFIGURATION_KEY) && (operation.workspaceStandAloneConfigurationKey !== MCP_CONFIGURATION_KEY) && (target === 1 /* EditableConfigurationTarget.USER_LOCAL */ || target === 2 /* EditableConfigurationTarget.USER_REMOTE */)) {
                throw this.toConfigurationEditingError(4 /* ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET */, target, operation);
            }
        }
        // Target cannot be workspace or folder if no workspace opened
        if ((target === 3 /* EditableConfigurationTarget.WORKSPACE */ || target === 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */) && this.contextService.getWorkbenchState() === 1 /* WorkbenchState.EMPTY */) {
            throw this.toConfigurationEditingError(8 /* ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED */, target, operation);
        }
        if (target === 3 /* EditableConfigurationTarget.WORKSPACE */) {
            if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
                if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
                    throw this.toConfigurationEditingError(1 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION */, target, operation);
                }
                if (configurationScope === 2 /* ConfigurationScope.MACHINE */) {
                    throw this.toConfigurationEditingError(2 /* ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE */, target, operation);
                }
            }
        }
        if (target === 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */) {
            if (!operation.resource) {
                throw this.toConfigurationEditingError(6 /* ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET */, target, operation);
            }
            if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
                if (configurationScope !== undefined && !FOLDER_SCOPES.includes(configurationScope)) {
                    throw this.toConfigurationEditingError(3 /* ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION */, target, operation);
                }
            }
        }
        if (overrides.overrideIdentifiers?.length) {
            if (configurationScope !== 6 /* ConfigurationScope.LANGUAGE_OVERRIDABLE */) {
                throw this.toConfigurationEditingError(7 /* ConfigurationEditingErrorCode.ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION */, target, operation);
            }
        }
        if (!operation.resource) {
            throw this.toConfigurationEditingError(6 /* ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET */, target, operation);
        }
        if (checkDirty && this.textFileService.isDirty(operation.resource)) {
            throw this.toConfigurationEditingError(9 /* ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY */, target, operation);
        }
    }
    getConfigurationEditOperation(target, config, overrides) {
        // Check for standalone workspace configurations
        if (config.key) {
            const standaloneConfigurationMap = target === 1 /* EditableConfigurationTarget.USER_LOCAL */ ? USER_STANDALONE_CONFIGURATIONS : WORKSPACE_STANDALONE_CONFIGURATIONS;
            const standaloneConfigurationKeys = Object.keys(standaloneConfigurationMap);
            for (const key of standaloneConfigurationKeys) {
                const resource = this.getConfigurationFileResource(target, key, standaloneConfigurationMap[key], overrides.resource, undefined);
                // Check for prefix
                if (config.key === key) {
                    const jsonPath = this.isWorkspaceConfigurationResource(resource) ? [key] : [];
                    return { key: jsonPath[jsonPath.length - 1], jsonPath, value: config.value, resource: resource ?? undefined, workspaceStandAloneConfigurationKey: key, target };
                }
                // Check for prefix.<setting>
                const keyPrefix = `${key}.`;
                if (config.key.indexOf(keyPrefix) === 0) {
                    const jsonPath = this.isWorkspaceConfigurationResource(resource) ? [key, config.key.substring(keyPrefix.length)] : [config.key.substring(keyPrefix.length)];
                    return { key: jsonPath[jsonPath.length - 1], jsonPath, value: config.value, resource: resource ?? undefined, workspaceStandAloneConfigurationKey: key, target };
                }
            }
        }
        const key = config.key;
        const configurationProperties = Registry.as(ConfigurationExtensions.Configuration).getConfigurationProperties();
        const configurationScope = configurationProperties[key]?.scope;
        let jsonPath = overrides.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
        if (target === 1 /* EditableConfigurationTarget.USER_LOCAL */ || target === 2 /* EditableConfigurationTarget.USER_REMOTE */) {
            return { key, jsonPath, value: config.value, resource: this.getConfigurationFileResource(target, key, '', null, configurationScope) ?? undefined, target };
        }
        const resource = this.getConfigurationFileResource(target, key, FOLDER_SETTINGS_PATH, overrides.resource, configurationScope);
        if (this.isWorkspaceConfigurationResource(resource)) {
            jsonPath = ['settings', ...jsonPath];
        }
        return { key, jsonPath, value: config.value, resource: resource ?? undefined, target };
    }
    isWorkspaceConfigurationResource(resource) {
        const workspace = this.contextService.getWorkspace();
        return !!(workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath);
    }
    getConfigurationFileResource(target, key, relativePath, resource, scope) {
        if (target === 1 /* EditableConfigurationTarget.USER_LOCAL */) {
            if (key === TASKS_CONFIGURATION_KEY) {
                return this.userDataProfileService.currentProfile.tasksResource;
            }
            if (key === MCP_CONFIGURATION_KEY) {
                return this.userDataProfileService.currentProfile.mcpResource;
            }
            else {
                if (!this.userDataProfileService.currentProfile.isDefault && this.configurationService.isSettingAppliedForAllProfiles(key)) {
                    return this.userDataProfilesService.defaultProfile.settingsResource;
                }
                return this.userDataProfileService.currentProfile.settingsResource;
            }
        }
        if (target === 2 /* EditableConfigurationTarget.USER_REMOTE */) {
            return this.remoteSettingsResource;
        }
        const workbenchState = this.contextService.getWorkbenchState();
        if (workbenchState !== 1 /* WorkbenchState.EMPTY */) {
            const workspace = this.contextService.getWorkspace();
            if (target === 3 /* EditableConfigurationTarget.WORKSPACE */) {
                if (workbenchState === 3 /* WorkbenchState.WORKSPACE */) {
                    return workspace.configuration ?? null;
                }
                if (workbenchState === 2 /* WorkbenchState.FOLDER */) {
                    return workspace.folders[0].toResource(relativePath);
                }
            }
            if (target === 4 /* EditableConfigurationTarget.WORKSPACE_FOLDER */) {
                if (resource) {
                    const folder = this.contextService.getWorkspaceFolder(resource);
                    if (folder) {
                        return folder.toResource(relativePath);
                    }
                }
            }
        }
        return null;
    }
};
ConfigurationEditing = __decorate([
    __param(1, IWorkbenchConfigurationService),
    __param(2, IWorkspaceContextService),
    __param(3, IUserDataProfileService),
    __param(4, IUserDataProfilesService),
    __param(5, IFileService),
    __param(6, ITextModelService),
    __param(7, ITextFileService),
    __param(8, INotificationService),
    __param(9, IPreferencesService),
    __param(10, IEditorService),
    __param(11, IUriIdentityService),
    __param(12, IFilesConfigurationService)
], ConfigurationEditing);
export { ConfigurationEditing };
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uZmlndXJhdGlvbkVkaXRpbmcuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvc2VydmljZXMvY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbkVkaXRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7Ozs7Ozs7Ozs7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEtBQUssSUFBSSxNQUFNLGlDQUFpQyxDQUFDO0FBQ3hELE9BQU8sRUFBRSxXQUFXLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUNsRSxPQUFPLEVBQUUsS0FBSyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFekQsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSx3QkFBd0IsRUFBa0IsTUFBTSxvREFBb0QsQ0FBQztBQUM5RyxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUV0RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsbUNBQW1DLEVBQUUsdUJBQXVCLEVBQUUsd0JBQXdCLEVBQUUsOEJBQThCLEVBQUUsYUFBYSxFQUFFLGFBQWEsRUFBRSw4QkFBOEIsRUFBRSxrQkFBa0IsRUFBRSxxQkFBcUIsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzNSLE9BQU8sRUFBMkMsWUFBWSxFQUFFLE1BQU0sNENBQTRDLENBQUM7QUFDbkgsT0FBTyxFQUE0QixpQkFBaUIsRUFBRSxNQUFNLHVEQUF1RCxDQUFDO0FBQ3BILE9BQU8sRUFBMEIsVUFBVSxJQUFJLHVCQUF1QixFQUFzQiwwQkFBMEIsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLG9FQUFvRSxDQUFDO0FBQzVOLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxzQ0FBc0MsQ0FBQztBQUN0RSxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsUUFBUSxFQUFFLE1BQU0sMERBQTBELENBQUM7QUFDMUcsT0FBTyxFQUF3QixtQkFBbUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQ3BHLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSxNQUFNLHdEQUF3RCxDQUFDO0FBRzdGLE9BQU8sRUFBRSxLQUFLLEVBQUUsTUFBTSx5Q0FBeUMsQ0FBQztBQUNoRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0saURBQWlELENBQUM7QUFDaEYsT0FBTyxFQUFFLFNBQVMsRUFBRSxNQUFNLDZDQUE2QyxDQUFDO0FBQ3hFLE9BQU8sRUFBRSx1QkFBdUIsRUFBRSxNQUFNLGlEQUFpRCxDQUFDO0FBQzFGLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLGdFQUFnRSxDQUFDO0FBQzFHLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3JFLE9BQU8sRUFBRSwwQkFBMEIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBRTFHLE1BQU0sQ0FBTixJQUFrQiw2QkF1RWpCO0FBdkVELFdBQWtCLDZCQUE2QjtJQUU5Qzs7T0FFRztJQUNILDJHQUFpQixDQUFBO0lBRWpCOztPQUVHO0lBQ0gsMktBQWlELENBQUE7SUFFakQ7O09BRUc7SUFDSCxtS0FBNkMsQ0FBQTtJQUU3Qzs7T0FFRztJQUNILDZJQUFrQyxDQUFBO0lBRWxDOztPQUVHO0lBQ0gsMkhBQXlCLENBQUE7SUFFekI7O09BRUc7SUFDSCxxSUFBOEIsQ0FBQTtJQUU5Qjs7T0FFRztJQUNILCtIQUEyQixDQUFBO0lBRTNCOztPQUVHO0lBQ0gsbUtBQTZDLENBQUE7SUFFN0M7O09BRUc7SUFDSCwySEFBeUIsQ0FBQTtJQUV6Qjs7T0FFRztJQUNILHFJQUE4QixDQUFBO0lBRTlCOztPQUVHO0lBQ0gsd0pBQXVDLENBQUE7SUFFdkM7O09BRUc7SUFDSCxnSUFBMkIsQ0FBQTtJQUUzQjs7T0FFRztJQUNILDhIQUEwQixDQUFBO0lBRTFCOztPQUVHO0lBQ0gsc0dBQWMsQ0FBQTtBQUNmLENBQUMsRUF2RWlCLDZCQUE2QixLQUE3Qiw2QkFBNkIsUUF1RTlDO0FBRUQsTUFBTSxPQUFPLHlCQUEwQixTQUFRLGdCQUFnQjtJQUM5RCxZQUFZLE9BQWUsRUFBUyxJQUFtQztRQUN0RSxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUM7UUFEb0IsU0FBSSxHQUFKLElBQUksQ0FBK0I7SUFFdkUsQ0FBQztDQUNEO0FBY0QsTUFBTSxDQUFOLElBQWtCLDJCQUtqQjtBQUxELFdBQWtCLDJCQUEyQjtJQUM1Qyx5RkFBYyxDQUFBO0lBQ2QsMkZBQVcsQ0FBQTtJQUNYLHVGQUFTLENBQUE7SUFDVCxxR0FBZ0IsQ0FBQTtBQUNqQixDQUFDLEVBTGlCLDJCQUEyQixLQUEzQiwyQkFBMkIsUUFLNUM7QUFTTSxJQUFNLG9CQUFvQixHQUExQixNQUFNLG9CQUFvQjtJQU1oQyxZQUNrQixzQkFBa0MsRUFDRixvQkFBb0QsRUFDMUQsY0FBd0MsRUFDekMsc0JBQStDLEVBQzlDLHVCQUFpRCxFQUM3RCxXQUF5QixFQUNwQix3QkFBMkMsRUFDNUMsZUFBaUMsRUFDN0IsbUJBQXlDLEVBQzFDLGtCQUF1QyxFQUM1QyxhQUE2QixFQUN4QixrQkFBdUMsRUFDaEMseUJBQXFEO1FBWmpGLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBWTtRQUNGLHlCQUFvQixHQUFwQixvQkFBb0IsQ0FBZ0M7UUFDMUQsbUJBQWMsR0FBZCxjQUFjLENBQTBCO1FBQ3pDLDJCQUFzQixHQUF0QixzQkFBc0IsQ0FBeUI7UUFDOUMsNEJBQXVCLEdBQXZCLHVCQUF1QixDQUEwQjtRQUM3RCxnQkFBVyxHQUFYLFdBQVcsQ0FBYztRQUNwQiw2QkFBd0IsR0FBeEIsd0JBQXdCLENBQW1CO1FBQzVDLG9CQUFlLEdBQWYsZUFBZSxDQUFrQjtRQUM3Qix3QkFBbUIsR0FBbkIsbUJBQW1CLENBQXNCO1FBQzFDLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDNUMsa0JBQWEsR0FBYixhQUFhLENBQWdCO1FBQ3hCLHVCQUFrQixHQUFsQixrQkFBa0IsQ0FBcUI7UUFDaEMsOEJBQXlCLEdBQXpCLHlCQUF5QixDQUE0QjtRQUVsRyxJQUFJLENBQUMsS0FBSyxHQUFHLElBQUksS0FBSyxFQUFRLENBQUM7SUFDaEMsQ0FBQztJQUVELEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxNQUFtQyxFQUFFLEtBQTBCLEVBQUUsVUFBd0MsRUFBRTtRQUNuSSxNQUFNLFNBQVMsR0FBRyxJQUFJLENBQUMsNkJBQTZCLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxPQUFPLENBQUMsTUFBTSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzFGLDZDQUE2QztRQUM3QyxPQUFPLElBQUksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssSUFBSSxFQUFFO1lBQ2xDLElBQUksQ0FBQztnQkFDSixNQUFNLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLEVBQUUsT0FBTyxDQUFDLENBQUM7WUFDckQsQ0FBQztZQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7Z0JBQ2hCLElBQUksT0FBTyxDQUFDLGdCQUFnQixFQUFFLENBQUM7b0JBQzlCLE1BQU0sS0FBSyxDQUFDO2dCQUNiLENBQUM7Z0JBQ0QsTUFBTSxJQUFJLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxTQUFTLEVBQUUsT0FBTyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3RELENBQUM7UUFDRixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxLQUFLLENBQUMsb0JBQW9CLENBQUMsU0FBc0MsRUFBRSxPQUFxQztRQUMvRyxNQUFNLElBQUksQ0FBQyxRQUFRLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxTQUFTLEVBQUUsQ0FBQyxPQUFPLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxNQUFNLElBQUksRUFBRSxDQUFDLENBQUM7UUFDakcsTUFBTSxRQUFRLEdBQVEsU0FBUyxDQUFDLFFBQVMsQ0FBQztRQUMxQyxNQUFNLFNBQVMsR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM3RCxJQUFJLENBQUM7WUFDSixNQUFNLGlCQUFpQixHQUFHLElBQUksQ0FBQyxvQkFBb0IsQ0FBQyxTQUFTLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDO1lBQ3RGLE1BQU0sSUFBSSxDQUFDLG1CQUFtQixDQUFDLFNBQVMsRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLGVBQWUsRUFBRSxpQkFBaUIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUN6RyxDQUFDO2dCQUFTLENBQUM7WUFDVixTQUFTLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDckIsQ0FBQztJQUNGLENBQUM7SUFFTyxLQUFLLENBQUMsbUJBQW1CLENBQUMsU0FBc0MsRUFBRSxLQUFpQixFQUFFLGlCQUFvQyxFQUFFLE9BQXFDO1FBQ3ZLLElBQUksSUFBSSxDQUFDLGNBQWMsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUUsU0FBUyxDQUFDLEVBQUUsQ0FBQztZQUN0RCxNQUFNLElBQUksQ0FBQywyQkFBMkIscUVBQTRELFNBQVMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDaEksQ0FBQztRQUVELElBQUksSUFBSSxDQUFDLGVBQWUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztZQUN4RSxRQUFRLE9BQU8sQ0FBQyxlQUFlLEVBQUUsQ0FBQztnQkFDakMsS0FBSyxNQUFNO29CQUFFLE1BQU0sSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7b0JBQUMsTUFBTTtnQkFDdEQsS0FBSyxRQUFRO29CQUFFLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO29CQUFDLE1BQU07WUFDcEUsQ0FBQztRQUNGLENBQUM7UUFFRCxNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxLQUFLLENBQUMsUUFBUSxFQUFFLEVBQUUsaUJBQWlCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5RSxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1YsSUFBSSxVQUFtQyxDQUFDO1lBQ3hDLElBQUksQ0FBQztnQkFDSiwyREFBMkQ7Z0JBQzNELDJEQUEyRDtnQkFDM0QsNkRBQTZEO2dCQUM3RCx3REFBd0Q7Z0JBQ3hELFVBQVUsR0FBRyxJQUFJLENBQUMseUJBQXlCLENBQUMsNkJBQTZCLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2dCQUNyRixJQUFJLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLEVBQUUsQ0FBQztvQkFDMUMsTUFBTSxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDbkMsQ0FBQztZQUNGLENBQUM7b0JBQVMsQ0FBQztnQkFDVixVQUFVLEVBQUUsT0FBTyxFQUFFLENBQUM7WUFDdkIsQ0FBQztRQUNGLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLElBQUksQ0FBQyxLQUFpQixFQUFFLFNBQXNDO1FBQzNFLElBQUksQ0FBQztZQUNKLE1BQU0sSUFBSSxDQUFDLGVBQWUsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxFQUFFLGtCQUFrQixFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7UUFDMUUsQ0FBQztRQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7WUFDaEIsSUFBeUIsS0FBTSxDQUFDLG1CQUFtQixvREFBNEMsRUFBRSxDQUFDO2dCQUNqRyxNQUFNLElBQUksQ0FBQywyQkFBMkIsaUZBQXdFLFNBQVMsQ0FBQyxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUksQ0FBQztZQUNELE1BQU0sSUFBSSx5QkFBeUIsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxpQ0FBaUMsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsRUFBRSxLQUFLLENBQUMsT0FBTyxDQUFDLHdEQUErQyxDQUFDO1FBQ3RNLENBQUM7SUFDRixDQUFDO0lBRU8sa0JBQWtCLENBQUMsSUFBVSxFQUFFLEtBQWlCO1FBQ3ZELE1BQU0sYUFBYSxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3ZELE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxhQUFhLENBQUMsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbkUsTUFBTSxLQUFLLEdBQUcsSUFBSSxLQUFLLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRSxhQUFhLENBQUMsTUFBTSxFQUFFLFdBQVcsQ0FBQyxVQUFVLEVBQUUsV0FBVyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BILE1BQU0sV0FBVyxHQUFHLEtBQUssQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDakQsSUFBSSxJQUFJLENBQUMsT0FBTyxLQUFLLFdBQVcsRUFBRSxDQUFDO1lBQ2xDLE1BQU0sYUFBYSxHQUFHLFdBQVcsQ0FBQyxDQUFDLENBQUMsYUFBYSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLGFBQWEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7WUFDbkksS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUMsSUFBSSxTQUFTLENBQUMsYUFBYSxDQUFDLFVBQVUsRUFBRSxhQUFhLENBQUMsTUFBTSxFQUFFLGFBQWEsQ0FBQyxVQUFVLEVBQUUsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztZQUNySyxPQUFPLElBQUksQ0FBQztRQUNiLENBQUM7UUFDRCxPQUFPLEtBQUssQ0FBQztJQUNkLENBQUM7SUFFTyxRQUFRLENBQUMsRUFBRSxLQUFLLEVBQUUsUUFBUSxFQUErQixFQUFFLFlBQW9CLEVBQUUsaUJBQW9DO1FBQzVILElBQUksUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQ3JCLE9BQU8sV0FBVyxDQUFDLFlBQVksRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLGlCQUFpQixDQUFDLENBQUM7UUFDdEUsQ0FBQztRQUVELG1HQUFtRztRQUNuRyxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsaUJBQWlCLENBQUMsWUFBWSxJQUFJLGlCQUFpQixDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7UUFDeEosT0FBTyxDQUFDO2dCQUNQLE9BQU87Z0JBQ1AsTUFBTSxFQUFFLFlBQVksQ0FBQyxNQUFNO2dCQUMzQixNQUFNLEVBQUUsQ0FBQzthQUNULENBQUMsQ0FBQztJQUNKLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxLQUFpQjtRQUM3QyxNQUFNLEVBQUUsWUFBWSxFQUFFLE9BQU8sRUFBRSxHQUFHLEtBQUssQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNyRCxNQUFNLEdBQUcsR0FBRyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDM0IsT0FBTyxFQUFFLFlBQVksRUFBRSxPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUM7SUFDdkMsQ0FBQztJQUVPLEtBQUssQ0FBQyxPQUFPLENBQUMsS0FBZ0MsRUFBRSxTQUFzQyxFQUFFLE1BQWlEO1FBQ2hKLFFBQVEsS0FBSyxDQUFDLElBQUksRUFBRSxDQUFDO1lBQ3BCO2dCQUNDLElBQUksQ0FBQywyQkFBMkIsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ25ELE1BQU07WUFDUDtnQkFDQyxJQUFJLENBQUMsNkJBQTZCLENBQUMsS0FBSyxFQUFFLFNBQVMsRUFBRSxNQUFNLENBQUMsQ0FBQztnQkFDN0QsTUFBTTtZQUNQO2dCQUNDLE9BQU8sSUFBSSxDQUFDLG9CQUFvQixDQUFDLFNBQVMsRUFBRSxFQUFFLE1BQU0sRUFBRSxlQUFlLEVBQUUsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUNwRjtnQkFDQyxJQUFJLENBQUMsbUJBQW1CLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNoRCxDQUFDO0lBQ0YsQ0FBQztJQUVPLDJCQUEyQixDQUFDLEtBQWdDLEVBQUUsU0FBc0M7UUFDM0csTUFBTSxzQ0FBc0MsR0FBRyxTQUFTLENBQUMsbUNBQW1DLEtBQUssdUJBQXVCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsMEJBQTBCLENBQUM7WUFDNUwsQ0FBQyxDQUFDLFNBQVMsQ0FBQyxtQ0FBbUMsS0FBSyx3QkFBd0IsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyx5QkFBeUIsRUFBRSwyQkFBMkIsQ0FBQztnQkFDbEosQ0FBQyxDQUFDLFNBQVMsQ0FBQyxtQ0FBbUMsS0FBSyxxQkFBcUIsQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLFFBQVEsQ0FBQyxzQkFBc0IsRUFBRSx3QkFBd0IsQ0FBQztvQkFDekksQ0FBQyxDQUFDLElBQUksQ0FBQztRQUNWLElBQUksc0NBQXNDLEVBQUUsQ0FBQztZQUM1QyxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFDNUQsQ0FBQztvQkFDQSxLQUFLLEVBQUUsc0NBQXNDO29CQUM3QyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxTQUFTLENBQUMsUUFBUyxDQUFDO2lCQUM3QyxDQUFDLENBQ0YsQ0FBQztRQUNILENBQUM7YUFBTSxDQUFDO1lBQ1AsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQzVELENBQUM7b0JBQ0EsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsTUFBTSxFQUFFLGVBQWUsQ0FBQztvQkFDNUMsR0FBRyxFQUFFLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsU0FBUyxDQUFDO2lCQUN2QyxDQUFDLENBQ0YsQ0FBQztRQUNILENBQUM7SUFDRixDQUFDO0lBRU8sNkJBQTZCLENBQUMsS0FBZ0MsRUFBRSxTQUFzQyxFQUFFLE1BQWlEO1FBQ2hLLE1BQU0sc0NBQXNDLEdBQUcsU0FBUyxDQUFDLG1DQUFtQyxLQUFLLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLHdCQUF3QixFQUFFLDBCQUEwQixDQUFDO1lBQzVMLENBQUMsQ0FBQyxTQUFTLENBQUMsbUNBQW1DLEtBQUssd0JBQXdCLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMseUJBQXlCLEVBQUUsMkJBQTJCLENBQUM7Z0JBQ2xKLENBQUMsQ0FBQyxJQUFJLENBQUM7UUFDVCxJQUFJLHNDQUFzQyxFQUFFLENBQUM7WUFDNUMsSUFBSSxDQUFDLG1CQUFtQixDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxPQUFPLEVBQzVELENBQUM7b0JBQ0EsS0FBSyxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLGdCQUFnQixDQUFDO29CQUNyRCxHQUFHLEVBQUUsR0FBRyxFQUFFO3dCQUNULE1BQU0sR0FBRyxHQUFHLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEdBQUcsU0FBUyxDQUFDLG1DQUFtQyxJQUFJLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLG1DQUFvQyxDQUFDO3dCQUNqSixJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLEVBQUUsU0FBUyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsZUFBZSxFQUFFLE1BQU0sRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO29CQUNqSCxDQUFDO2lCQUNEO2dCQUNEO29CQUNDLEtBQUssRUFBRSxzQ0FBc0M7b0JBQzdDLEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxRQUFTLENBQUM7aUJBQzdDLENBQUMsQ0FDRixDQUFDO1FBQ0gsQ0FBQzthQUFNLENBQUM7WUFDUCxJQUFJLENBQUMsbUJBQW1CLENBQUMsTUFBTSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsS0FBSyxDQUFDLE9BQU8sRUFDNUQsQ0FBQztvQkFDQSxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxjQUFjLEVBQUUsZ0JBQWdCLENBQUM7b0JBQ3JELEdBQUcsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLE1BQU0sRUFBRSxFQUFFLEdBQUcsRUFBRSxTQUFTLENBQUMsR0FBRyxFQUFFLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxlQUFlLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxDQUFDO2lCQUN6STtnQkFDRDtvQkFDQyxLQUFLLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsZUFBZSxDQUFDO29CQUM1QyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxTQUFTLENBQUM7aUJBQ3ZDLENBQUMsQ0FDRixDQUFDO1FBQ0gsQ0FBQztJQUNGLENBQUM7SUFFTyxZQUFZLENBQUMsU0FBc0M7UUFDMUQsTUFBTSxPQUFPLEdBQXlCLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDO1FBQzNELFFBQVEsU0FBUyxDQUFDLE1BQU0sRUFBRSxDQUFDO1lBQzFCO2dCQUNDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDbEQsTUFBTTtZQUNQO2dCQUNDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxrQkFBa0IsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDcEQsTUFBTTtZQUNQO2dCQUNDLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxxQkFBcUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDdkQsTUFBTTtZQUNQO2dCQUNDLElBQUksU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO29CQUN4QixNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsY0FBYyxDQUFDLGtCQUFrQixDQUFDLFNBQVMsQ0FBQyxRQUFRLENBQUMsQ0FBQztvQkFDbkYsSUFBSSxlQUFlLEVBQUUsQ0FBQzt3QkFDckIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLGtCQUFrQixDQUFDLEVBQUUsU0FBUyxFQUFFLGVBQWUsQ0FBQyxHQUFHLEVBQUUsVUFBVSxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7b0JBQ2xHLENBQUM7Z0JBQ0YsQ0FBQztnQkFDRCxNQUFNO1FBQ1IsQ0FBQztJQUNGLENBQUM7SUFFTyxRQUFRLENBQUMsUUFBYTtRQUM3QixJQUFJLENBQUMsYUFBYSxDQUFDLFVBQVUsQ0FBQyxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3hFLENBQUM7SUFFTywyQkFBMkIsQ0FBQyxJQUFtQyxFQUFFLE1BQW1DLEVBQUUsU0FBc0M7UUFDbkosTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzdELE9BQU8sSUFBSSx5QkFBeUIsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDckQsQ0FBQztJQUVPLGNBQWMsQ0FBQyxLQUFvQyxFQUFFLE1BQW1DLEVBQUUsU0FBc0M7UUFDdkksUUFBUSxLQUFLLEVBQUUsQ0FBQztZQUVmLGtCQUFrQjtZQUNsQixzRUFBNkQsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxnRUFBZ0UsRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDaE0sNERBQW9ELENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsaUJBQWlCLEVBQUUsdUVBQXVFLEVBQUUsSUFBSSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDbk4sNEZBQW9GLENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsK0NBQStDLEVBQUUsaUdBQWlHLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzdRLHdGQUFnRixDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLGlHQUFpRyxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUNyUSw2RUFBcUUsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSw0RkFBNEYsRUFBRSxTQUFTLENBQUMsR0FBRyxDQUFDLENBQUM7WUFDM08sb0VBQTRELENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsd0JBQXdCLEVBQUUsaUZBQWlGLEVBQUUsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQzlNLHlFQUFpRSxDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLHFIQUFxSCxFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUM1UCxzRUFBOEQsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQywwQkFBMEIsRUFBRSxxRUFBcUUsQ0FBQyxDQUFDO1lBQ3ZMLHdGQUFnRixDQUFDLENBQUMsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLDJDQUEyQyxFQUFFLHNGQUFzRixFQUFFLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQztZQUMxUCxvRUFBNEQsQ0FBQyxDQUFDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyx3QkFBd0IsRUFBRSxxR0FBcUcsRUFBRSxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFFalAsY0FBYztZQUNkLHVFQUE4RCxDQUFDLENBQUMsQ0FBQztnQkFDaEUsSUFBSSxTQUFTLENBQUMsbUNBQW1DLEtBQUssdUJBQXVCLEVBQUUsQ0FBQztvQkFDL0UsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLCtCQUErQixFQUFFLG1IQUFtSCxDQUFDLENBQUM7Z0JBQzNLLENBQUM7Z0JBQ0QsSUFBSSxTQUFTLENBQUMsbUNBQW1DLEtBQUssd0JBQXdCLEVBQUUsQ0FBQztvQkFDaEYsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGlDQUFpQyxFQUFFLG9IQUFvSCxDQUFDLENBQUM7Z0JBQzlLLENBQUM7Z0JBQ0QsSUFBSSxTQUFTLENBQUMsbUNBQW1DLEtBQUsscUJBQXFCLEVBQUUsQ0FBQztvQkFDN0UsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLDhCQUE4QixFQUFFLGlIQUFpSCxDQUFDLENBQUM7Z0JBQ3hLLENBQUM7Z0JBQ0QsUUFBUSxNQUFNLEVBQUUsQ0FBQztvQkFDaEI7d0JBQ0MsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLDJCQUEyQixFQUFFLG1IQUFtSCxDQUFDLENBQUM7b0JBQ3ZLO3dCQUNDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxpQ0FBaUMsRUFBRSxpSUFBaUksQ0FBQyxDQUFDO29CQUMzTDt3QkFDQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsb0NBQW9DLEVBQUUsbUlBQW1JLENBQUMsQ0FBQztvQkFDaE0seURBQWlELENBQUMsQ0FBQyxDQUFDO3dCQUNuRCxJQUFJLG1CQUFtQixHQUFXLGFBQWEsQ0FBQzt3QkFDaEQsSUFBSSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7NEJBQ3hCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDOzRCQUMxRSxJQUFJLE1BQU0sRUFBRSxDQUFDO2dDQUNaLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7NEJBQ25DLENBQUM7d0JBQ0YsQ0FBQzt3QkFDRCxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsaUNBQWlDLEVBQUUsNkhBQTZILEVBQUUsbUJBQW1CLENBQUMsQ0FBQztvQkFDNU0sQ0FBQztvQkFDRDt3QkFDQyxPQUFPLEVBQUUsQ0FBQztnQkFDWixDQUFDO1lBQ0YsQ0FBQztZQUNELHlFQUFpRSxDQUFDLENBQUMsQ0FBQztnQkFDbkUsSUFBSSxTQUFTLENBQUMsbUNBQW1DLEtBQUssdUJBQXVCLEVBQUUsQ0FBQztvQkFDL0UsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGtDQUFrQyxFQUFFLDhIQUE4SCxDQUFDLENBQUM7Z0JBQ3pMLENBQUM7Z0JBQ0QsSUFBSSxTQUFTLENBQUMsbUNBQW1DLEtBQUssd0JBQXdCLEVBQUUsQ0FBQztvQkFDaEYsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLG1DQUFtQyxFQUFFLCtIQUErSCxDQUFDLENBQUM7Z0JBQzNMLENBQUM7Z0JBQ0QsSUFBSSxTQUFTLENBQUMsbUNBQW1DLEtBQUsscUJBQXFCLEVBQUUsQ0FBQztvQkFDN0UsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGdDQUFnQyxFQUFFLDRIQUE0SCxDQUFDLENBQUM7Z0JBQ3JMLENBQUM7Z0JBQ0QsUUFBUSxNQUFNLEVBQUUsQ0FBQztvQkFDaEI7d0JBQ0MsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLDZCQUE2QixFQUFFLHVJQUF1SSxDQUFDLENBQUM7b0JBQzdMO3dCQUNDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxtQ0FBbUMsRUFBRSxxSkFBcUosQ0FBQyxDQUFDO29CQUNqTjt3QkFDQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsc0NBQXNDLEVBQUUsaUpBQWlKLENBQUMsQ0FBQztvQkFDaE4seURBQWlELENBQUMsQ0FBQyxDQUFDO3dCQUNuRCxJQUFJLG1CQUFtQixHQUFXLGFBQWEsQ0FBQzt3QkFDaEQsSUFBSSxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7NEJBQ3hCLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsU0FBUyxDQUFDLFFBQVEsQ0FBQyxDQUFDOzRCQUMxRSxJQUFJLE1BQU0sRUFBRSxDQUFDO2dDQUNaLG1CQUFtQixHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7NEJBQ25DLENBQUM7d0JBQ0YsQ0FBQzt3QkFDRCxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsbUNBQW1DLEVBQUUsaUpBQWlKLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztvQkFDbE8sQ0FBQztvQkFDRDt3QkFDQyxPQUFPLEVBQUUsQ0FBQztnQkFDWixDQUFDO1lBQ0YsQ0FBQztZQUNEO2dCQUNDLElBQUksU0FBUyxDQUFDLG1DQUFtQyxLQUFLLHVCQUF1QixFQUFFLENBQUM7b0JBQy9FLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQywwQ0FBMEMsRUFBRSx5RkFBeUYsQ0FBQyxDQUFDO2dCQUM1SixDQUFDO2dCQUNELElBQUksU0FBUyxDQUFDLG1DQUFtQyxLQUFLLHdCQUF3QixFQUFFLENBQUM7b0JBQ2hGLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSwwRkFBMEYsQ0FBQyxDQUFDO2dCQUM5SixDQUFDO2dCQUNELElBQUksU0FBUyxDQUFDLG1DQUFtQyxLQUFLLHFCQUFxQixFQUFFLENBQUM7b0JBQzdFLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyx3Q0FBd0MsRUFBRSx1RkFBdUYsQ0FBQyxDQUFDO2dCQUN4SixDQUFDO2dCQUNELFFBQVEsTUFBTSxFQUFFLENBQUM7b0JBQ2hCO3dCQUNDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxxQ0FBcUMsRUFBRSw4RUFBOEUsQ0FBQyxDQUFDO29CQUM1STt3QkFDQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsMkNBQTJDLEVBQUUscUZBQXFGLENBQUMsQ0FBQztvQkFDeko7d0JBQ0MsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLDhDQUE4QyxFQUFFLG1GQUFtRixDQUFDLENBQUM7b0JBQzFKO3dCQUNDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSxnRkFBZ0YsQ0FBQyxDQUFDO2dCQUNySixDQUFDO1lBQ0YsMERBQWlELENBQUMsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxRQUFRLENBQUMsY0FBYyxFQUFFLHNEQUFzRCxFQUFFLElBQUksQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztRQUM5SyxDQUFDO0lBQ0YsQ0FBQztJQUVPLGVBQWUsQ0FBQyxNQUFtQztRQUMxRCxRQUFRLE1BQU0sRUFBRSxDQUFDO1lBQ2hCO2dCQUNDLE9BQU8sR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFZLEVBQUUsZUFBZSxDQUFDLENBQUM7WUFDcEQ7Z0JBQ0MsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLHNCQUFzQixDQUFDLENBQUM7WUFDakU7Z0JBQ0MsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGlCQUFpQixFQUFFLG9CQUFvQixDQUFDLENBQUM7WUFDOUQ7Z0JBQ0MsT0FBTyxHQUFHLENBQUMsUUFBUSxDQUFDLGNBQWMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO1lBQ3hEO2dCQUNDLE9BQU8sRUFBRSxDQUFDO1FBQ1osQ0FBQztJQUNGLENBQUM7SUFFTyxvQkFBb0IsQ0FBQyxRQUFhO1FBQ3pDLE1BQU0sUUFBUSxHQUFXLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1FBQzNFLE1BQU0sa0JBQWtCLEdBQVcsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUUsUUFBUSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNqSSxRQUFRLGtCQUFrQixFQUFFLENBQUM7WUFDNUIsS0FBSyx1QkFBdUIsQ0FBQyxDQUFDLE9BQU8sYUFBYSxDQUFDO1lBQ25ELE9BQU8sQ0FBQyxDQUFDLE9BQU8sSUFBSSxDQUFDO1FBQ3RCLENBQUM7SUFDRixDQUFDO0lBRU8sS0FBSyxDQUFDLHFCQUFxQixDQUFDLFFBQWE7UUFDaEQsTUFBTSxNQUFNLEdBQUcsTUFBTSxJQUFJLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDYixNQUFNLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLEVBQUUsRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLENBQUMsQ0FBQztRQUN2RyxDQUFDO1FBQ0QsT0FBTyxJQUFJLENBQUMsd0JBQXdCLENBQUMsb0JBQW9CLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDckUsQ0FBQztJQUVPLGNBQWMsQ0FBQyxPQUFlLEVBQUUsU0FBc0M7UUFDN0UsK0ZBQStGO1FBQy9GLG9HQUFvRztRQUNwRyxJQUFJLFNBQVMsQ0FBQyxtQ0FBbUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNyRSxPQUFPLEtBQUssQ0FBQztRQUNkLENBQUM7UUFDRCxNQUFNLFdBQVcsR0FBc0IsRUFBRSxDQUFDO1FBQzFDLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxFQUFFLGtCQUFrQixFQUFFLElBQUksRUFBRSxpQkFBaUIsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQ3hGLE9BQU8sV0FBVyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDL0IsQ0FBQztJQUVPLEtBQUssQ0FBQyxRQUFRLENBQUMsTUFBbUMsRUFBRSxTQUFzQyxFQUFFLFVBQW1CLEVBQUUsU0FBd0M7UUFFaEssSUFBSSxJQUFJLENBQUMsb0JBQW9CLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxXQUFXLEtBQUssU0FBUyxFQUFFLENBQUM7WUFDaEYsTUFBTSxJQUFJLENBQUMsMkJBQTJCLG9FQUEyRCxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDckgsQ0FBQztRQUVELE1BQU0sdUJBQXVCLEdBQUcsUUFBUSxDQUFDLEVBQUUsQ0FBeUIsdUJBQXVCLENBQUMsYUFBYSxDQUFDLENBQUMsMEJBQTBCLEVBQUUsQ0FBQztRQUN4SSxNQUFNLGtCQUFrQixHQUFHLHVCQUF1QixDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUM7UUFFekU7Ozs7O1dBS0c7UUFDSCxJQUFJLENBQUMsU0FBUyxDQUFDLG1DQUFtQyxFQUFFLENBQUM7WUFDcEQsTUFBTSxTQUFTLEdBQUcsSUFBSSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxDQUFDLE9BQU8sQ0FBQztZQUMzRCxJQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsR0FBRyxDQUFDLElBQUksU0FBUyxDQUFDLEtBQUssS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDM0gsTUFBTSxJQUFJLENBQUMsMkJBQTJCLDBEQUFrRCxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDNUcsQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLFNBQVMsQ0FBQyxtQ0FBbUMsRUFBRSxDQUFDO1lBQ25ELG9DQUFvQztZQUNwQyxJQUFJLENBQUMsU0FBUyxDQUFDLG1DQUFtQyxLQUFLLHVCQUF1QixDQUFDLElBQUksQ0FBQyxTQUFTLENBQUMsbUNBQW1DLEtBQUsscUJBQXFCLENBQUMsSUFBSSxDQUFDLE1BQU0sbURBQTJDLElBQUksTUFBTSxvREFBNEMsQ0FBQyxFQUFFLENBQUM7Z0JBQzNRLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixrRUFBMEQsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3BILENBQUM7UUFDRixDQUFDO1FBRUQsOERBQThEO1FBQzlELElBQUksQ0FBQyxNQUFNLGtEQUEwQyxJQUFJLE1BQU0seURBQWlELENBQUMsSUFBSSxJQUFJLENBQUMsY0FBYyxDQUFDLGlCQUFpQixFQUFFLGlDQUF5QixFQUFFLENBQUM7WUFDdkwsTUFBTSxJQUFJLENBQUMsMkJBQTJCLGtFQUEwRCxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDcEgsQ0FBQztRQUVELElBQUksTUFBTSxrREFBMEMsRUFBRSxDQUFDO1lBQ3RELElBQUksQ0FBQyxTQUFTLENBQUMsbUNBQW1DLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BHLElBQUksa0JBQWtCLElBQUksa0JBQWtCLENBQUMsUUFBUSxDQUFDLGtCQUFrQixDQUFDLEVBQUUsQ0FBQztvQkFDM0UsTUFBTSxJQUFJLENBQUMsMkJBQTJCLDBGQUFrRixNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQzVJLENBQUM7Z0JBQ0QsSUFBSSxrQkFBa0IsdUNBQStCLEVBQUUsQ0FBQztvQkFDdkQsTUFBTSxJQUFJLENBQUMsMkJBQTJCLHNGQUE4RSxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7Z0JBQ3hJLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUVELElBQUksTUFBTSx5REFBaUQsRUFBRSxDQUFDO1lBQzdELElBQUksQ0FBQyxTQUFTLENBQUMsUUFBUSxFQUFFLENBQUM7Z0JBQ3pCLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixvRUFBNEQsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBQ3RILENBQUM7WUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLG1DQUFtQyxJQUFJLENBQUMsdUJBQXVCLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUNwRyxJQUFJLGtCQUFrQixLQUFLLFNBQVMsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDO29CQUNyRixNQUFNLElBQUksQ0FBQywyQkFBMkIsMkVBQW1FLE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztnQkFDN0gsQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsSUFBSSxTQUFTLENBQUMsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLENBQUM7WUFDM0MsSUFBSSxrQkFBa0Isb0RBQTRDLEVBQUUsQ0FBQztnQkFDcEUsTUFBTSxJQUFJLENBQUMsMkJBQTJCLHNGQUE4RSxNQUFNLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFDeEksQ0FBQztRQUNGLENBQUM7UUFFRCxJQUFJLENBQUMsU0FBUyxDQUFDLFFBQVEsRUFBRSxDQUFDO1lBQ3pCLE1BQU0sSUFBSSxDQUFDLDJCQUEyQixvRUFBNEQsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQ3RILENBQUM7UUFFRCxJQUFJLFVBQVUsSUFBSSxJQUFJLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNwRSxNQUFNLElBQUksQ0FBQywyQkFBMkIsdUVBQStELE1BQU0sRUFBRSxTQUFTLENBQUMsQ0FBQztRQUN6SCxDQUFDO0lBRUYsQ0FBQztJQUVPLDZCQUE2QixDQUFDLE1BQW1DLEVBQUUsTUFBMkIsRUFBRSxTQUF3QztRQUUvSSxnREFBZ0Q7UUFDaEQsSUFBSSxNQUFNLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDaEIsTUFBTSwwQkFBMEIsR0FBRyxNQUFNLG1EQUEyQyxDQUFDLENBQUMsQ0FBQyw4QkFBOEIsQ0FBQyxDQUFDLENBQUMsbUNBQW1DLENBQUM7WUFDNUosTUFBTSwyQkFBMkIsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUFDLENBQUM7WUFDNUUsS0FBSyxNQUFNLEdBQUcsSUFBSSwyQkFBMkIsRUFBRSxDQUFDO2dCQUMvQyxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSwwQkFBMEIsQ0FBQyxHQUFHLENBQUMsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLFNBQVMsQ0FBQyxDQUFDO2dCQUVoSSxtQkFBbUI7Z0JBQ25CLElBQUksTUFBTSxDQUFDLEdBQUcsS0FBSyxHQUFHLEVBQUUsQ0FBQztvQkFDeEIsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLGdDQUFnQyxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7b0JBQzlFLE9BQU8sRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRLElBQUksU0FBUyxFQUFFLG1DQUFtQyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsQ0FBQztnQkFDakssQ0FBQztnQkFFRCw2QkFBNkI7Z0JBQzdCLE1BQU0sU0FBUyxHQUFHLEdBQUcsR0FBRyxHQUFHLENBQUM7Z0JBQzVCLElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUM7b0JBQ3pDLE1BQU0sUUFBUSxHQUFHLElBQUksQ0FBQyxnQ0FBZ0MsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLEVBQUUsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7b0JBQzVKLE9BQU8sRUFBRSxHQUFHLEVBQUUsUUFBUSxDQUFDLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxRQUFRLElBQUksU0FBUyxFQUFFLG1DQUFtQyxFQUFFLEdBQUcsRUFBRSxNQUFNLEVBQUUsQ0FBQztnQkFDakssQ0FBQztZQUNGLENBQUM7UUFDRixDQUFDO1FBRUQsTUFBTSxHQUFHLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQztRQUN2QixNQUFNLHVCQUF1QixHQUFHLFFBQVEsQ0FBQyxFQUFFLENBQXlCLHVCQUF1QixDQUFDLGFBQWEsQ0FBQyxDQUFDLDBCQUEwQixFQUFFLENBQUM7UUFDeEksTUFBTSxrQkFBa0IsR0FBRyx1QkFBdUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxLQUFLLENBQUM7UUFDL0QsSUFBSSxRQUFRLEdBQUcsU0FBUyxDQUFDLG1CQUFtQixFQUFFLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQywwQkFBMEIsQ0FBQyxTQUFTLENBQUMsbUJBQW1CLENBQUMsRUFBRSxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNoSSxJQUFJLE1BQU0sbURBQTJDLElBQUksTUFBTSxvREFBNEMsRUFBRSxDQUFDO1lBQzdHLE9BQU8sRUFBRSxHQUFHLEVBQUUsUUFBUSxFQUFFLEtBQUssRUFBRSxNQUFNLENBQUMsS0FBSyxFQUFFLFFBQVEsRUFBRSxJQUFJLENBQUMsNEJBQTRCLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsSUFBSSxFQUFFLGtCQUFrQixDQUFDLElBQUksU0FBUyxFQUFFLE1BQU0sRUFBRSxDQUFDO1FBQzVKLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxJQUFJLENBQUMsNEJBQTRCLENBQUMsTUFBTSxFQUFFLEdBQUcsRUFBRSxvQkFBb0IsRUFBRSxTQUFTLENBQUMsUUFBUSxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDOUgsSUFBSSxJQUFJLENBQUMsZ0NBQWdDLENBQUMsUUFBUSxDQUFDLEVBQUUsQ0FBQztZQUNyRCxRQUFRLEdBQUcsQ0FBQyxVQUFVLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQztRQUN0QyxDQUFDO1FBQ0QsT0FBTyxFQUFFLEdBQUcsRUFBRSxRQUFRLEVBQUUsS0FBSyxFQUFFLE1BQU0sQ0FBQyxLQUFLLEVBQUUsUUFBUSxFQUFFLFFBQVEsSUFBSSxTQUFTLEVBQUUsTUFBTSxFQUFFLENBQUM7SUFDeEYsQ0FBQztJQUVPLGdDQUFnQyxDQUFDLFFBQW9CO1FBQzVELE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDckQsT0FBTyxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsYUFBYSxJQUFJLFFBQVEsSUFBSSxTQUFTLENBQUMsYUFBYSxDQUFDLE1BQU0sS0FBSyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7SUFDdEcsQ0FBQztJQUVPLDRCQUE0QixDQUFDLE1BQW1DLEVBQUUsR0FBVyxFQUFFLFlBQW9CLEVBQUUsUUFBZ0MsRUFBRSxLQUFxQztRQUNuTCxJQUFJLE1BQU0sbURBQTJDLEVBQUUsQ0FBQztZQUN2RCxJQUFJLEdBQUcsS0FBSyx1QkFBdUIsRUFBRSxDQUFDO2dCQUNyQyxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsYUFBYSxDQUFDO1lBQ2pFLENBQUM7WUFBQyxJQUFJLEdBQUcsS0FBSyxxQkFBcUIsRUFBRSxDQUFDO2dCQUNyQyxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsV0FBVyxDQUFDO1lBQy9ELENBQUM7aUJBQU0sQ0FBQztnQkFDUCxJQUFJLENBQUMsSUFBSSxDQUFDLHNCQUFzQixDQUFDLGNBQWMsQ0FBQyxTQUFTLElBQUksSUFBSSxDQUFDLG9CQUFvQixDQUFDLDhCQUE4QixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUM7b0JBQzVILE9BQU8sSUFBSSxDQUFDLHVCQUF1QixDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQztnQkFDckUsQ0FBQztnQkFDRCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxjQUFjLENBQUMsZ0JBQWdCLENBQUM7WUFDcEUsQ0FBQztRQUNGLENBQUM7UUFDRCxJQUFJLE1BQU0sb0RBQTRDLEVBQUUsQ0FBQztZQUN4RCxPQUFPLElBQUksQ0FBQyxzQkFBc0IsQ0FBQztRQUNwQyxDQUFDO1FBQ0QsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLGNBQWMsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO1FBQy9ELElBQUksY0FBYyxpQ0FBeUIsRUFBRSxDQUFDO1lBRTdDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsWUFBWSxFQUFFLENBQUM7WUFFckQsSUFBSSxNQUFNLGtEQUEwQyxFQUFFLENBQUM7Z0JBQ3RELElBQUksY0FBYyxxQ0FBNkIsRUFBRSxDQUFDO29CQUNqRCxPQUFPLFNBQVMsQ0FBQyxhQUFhLElBQUksSUFBSSxDQUFDO2dCQUN4QyxDQUFDO2dCQUNELElBQUksY0FBYyxrQ0FBMEIsRUFBRSxDQUFDO29CQUM5QyxPQUFPLFNBQVMsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO2dCQUN0RCxDQUFDO1lBQ0YsQ0FBQztZQUVELElBQUksTUFBTSx5REFBaUQsRUFBRSxDQUFDO2dCQUM3RCxJQUFJLFFBQVEsRUFBRSxDQUFDO29CQUNkLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQyxjQUFjLENBQUMsa0JBQWtCLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ2hFLElBQUksTUFBTSxFQUFFLENBQUM7d0JBQ1osT0FBTyxNQUFNLENBQUMsVUFBVSxDQUFDLFlBQVksQ0FBQyxDQUFDO29CQUN4QyxDQUFDO2dCQUNGLENBQUM7WUFDRixDQUFDO1FBQ0YsQ0FBQztRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztDQUNELENBQUE7QUFqaEJZLG9CQUFvQjtJQVE5QixXQUFBLDhCQUE4QixDQUFBO0lBQzlCLFdBQUEsd0JBQXdCLENBQUE7SUFDeEIsV0FBQSx1QkFBdUIsQ0FBQTtJQUN2QixXQUFBLHdCQUF3QixDQUFBO0lBQ3hCLFdBQUEsWUFBWSxDQUFBO0lBQ1osV0FBQSxpQkFBaUIsQ0FBQTtJQUNqQixXQUFBLGdCQUFnQixDQUFBO0lBQ2hCLFdBQUEsb0JBQW9CLENBQUE7SUFDcEIsV0FBQSxtQkFBbUIsQ0FBQTtJQUNuQixZQUFBLGNBQWMsQ0FBQTtJQUNkLFlBQUEsbUJBQW1CLENBQUE7SUFDbkIsWUFBQSwwQkFBMEIsQ0FBQTtHQW5CaEIsb0JBQW9CLENBaWhCaEMifQ==