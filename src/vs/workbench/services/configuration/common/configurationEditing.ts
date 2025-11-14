/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls.js';
import { URI } from '../../../../base/common/uri.js';
import * as json from '../../../../base/common/json.js';
import { setProperty } from '../../../../base/common/jsonEdit.js';
import { Queue } from '../../../../base/common/async.js';
import { Edit, FormattingOptions } from '../../../../base/common/jsonFormatter.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { ITextFileService } from '../../textfile/common/textfiles.js';
import { IConfigurationUpdateOptions, IConfigurationUpdateOverrides } from '../../../../platform/configuration/common/configuration.js';
import { FOLDER_SETTINGS_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, USER_STANDALONE_CONFIGURATIONS, TASKS_DEFAULT, FOLDER_SCOPES, IWorkbenchConfigurationService, APPLICATION_SCOPES, MCP_CONFIGURATION_KEY } from './configuration.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../../../platform/files/common/files.js';
import { IResolvedTextEditorModel, ITextModelService } from '../../../../editor/common/services/resolverService.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope, keyFromOverrideIdentifiers, OVERRIDE_PROPERTY_REGEX } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IEditorService } from '../../editor/common/editorService.js';
import { INotificationService, Severity } from '../../../../platform/notification/common/notification.js';
import { IOpenSettingsOptions, IPreferencesService } from '../../preferences/common/preferences.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITextModel } from '../../../../editor/common/model.js';
import { IDisposable, IReference } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import { EditOperation } from '../../../../editor/common/core/editOperation.js';
import { Selection } from '../../../../editor/common/core/selection.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { ErrorNoTelemetry } from '../../../../base/common/errors.js';
import { IFilesConfigurationService } from '../../filesConfiguration/common/filesConfigurationService.js';

export const enum ConfigurationEditingErrorCode {

	/**
	 * Error when trying to write a configuration key that is not registered.
	 */
	ERROR_UNKNOWN_KEY,

	/**
	 * Error when trying to write an application setting into workspace settings.
	 */
	ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION,

	/**
	 * Error when trying to write a machne setting into workspace settings.
	 */
	ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE,

	/**
	 * Error when trying to write an invalid folder configuration key to folder settings.
	 */
	ERROR_INVALID_FOLDER_CONFIGURATION,

	/**
	 * Error when trying to write to user target but not supported for provided key.
	 */
	ERROR_INVALID_USER_TARGET,

	/**
	 * Error when trying to write to user target but not supported for provided key.
	 */
	ERROR_INVALID_WORKSPACE_TARGET,

	/**
	 * Error when trying to write a configuration key to folder target
	 */
	ERROR_INVALID_FOLDER_TARGET,

	/**
	 * Error when trying to write to language specific setting but not supported for preovided key
	 */
	ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION,

	/**
	 * Error when trying to write to the workspace configuration without having a workspace opened.
	 */
	ERROR_NO_WORKSPACE_OPENED,

	/**
	 * Error when trying to write and save to the configuration file while it is dirty in the editor.
	 */
	ERROR_CONFIGURATION_FILE_DIRTY,

	/**
	 * Error when trying to write and save to the configuration file while it is not the latest in the disk.
	 */
	ERROR_CONFIGURATION_FILE_MODIFIED_SINCE,

	/**
	 * Error when trying to write to a configuration file that contains JSON errors.
	 */
	ERROR_INVALID_CONFIGURATION,

	/**
	 * Error when trying to write a policy configuration
	 */
	ERROR_POLICY_CONFIGURATION,

	/**
	 * Internal Error.
	 */
	ERROR_INTERNAL
}

export class ConfigurationEditingError extends ErrorNoTelemetry {
	constructor(message: string, public code: ConfigurationEditingErrorCode) {
		super(message);
	}
}

export interface IConfigurationValue {
	key: string;
	value: unknown;
}

export interface IConfigurationEditingOptions extends IConfigurationUpdateOptions {
	/**
	 * Scope of configuration to be written into.
	 */
	scopes?: IConfigurationUpdateOverrides;
}

export const enum EditableConfigurationTarget {
	USER_LOCAL = 1,
	USER_REMOTE,
	WORKSPACE,
	WORKSPACE_FOLDER
}

interface IConfigurationEditOperation extends IConfigurationValue {
	target: EditableConfigurationTarget;
	jsonPath: json.JSONPath;
	resource?: URI;
	workspaceStandAloneConfigurationKey?: string;
}

export class ConfigurationEditing {

	public _serviceBrand: undefined;

	private queue: Queue<void>;

	constructor(
		private readonly remoteSettingsResource: URI | null,
		@IWorkbenchConfigurationService private readonly configurationService: IWorkbenchConfigurationService,
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IFileService private readonly fileService: IFileService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@INotificationService private readonly notificationService: INotificationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IEditorService private readonly editorService: IEditorService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFilesConfigurationService private readonly filesConfigurationService: IFilesConfigurationService
	) {
		this.queue = new Queue<void>();
	}

	async writeConfiguration(target: EditableConfigurationTarget, value: IConfigurationValue, options: IConfigurationEditingOptions = {}): Promise<void> {
		const operation = this.getConfigurationEditOperation(target, value, options.scopes || {});
		// queue up writes to prevent race conditions
		return this.queue.queue(async () => {
			try {
				await this.doWriteConfiguration(operation, options);
			} catch (error) {
				if (options.donotNotifyError) {
					throw error;
				}
				await this.onError(error, operation, options.scopes);
			}
		});
	}

	private async doWriteConfiguration(operation: IConfigurationEditOperation, options: IConfigurationEditingOptions): Promise<void> {
		await this.validate(operation.target, operation, !options.handleDirtyFile, options.scopes || {});
		const resource: URI = operation.resource!;
		const reference = await this.resolveModelReference(resource);
		try {
			const formattingOptions = this.getFormattingOptions(reference.object.textEditorModel);
			await this.updateConfiguration(operation, reference.object.textEditorModel, formattingOptions, options);
		} finally {
			reference.dispose();
		}
	}

	private async updateConfiguration(operation: IConfigurationEditOperation, model: ITextModel, formattingOptions: FormattingOptions, options: IConfigurationEditingOptions): Promise<void> {
		if (this.hasParseErrors(model.getValue(), operation)) {
			throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION, operation.target, operation);
		}

		if (this.textFileService.isDirty(model.uri) && options.handleDirtyFile) {
			switch (options.handleDirtyFile) {
				case 'save': await this.save(model, operation); break;
				case 'revert': await this.textFileService.revert(model.uri); break;
			}
		}

		const edit = this.getEdits(operation, model.getValue(), formattingOptions)[0];
		if (edit) {
			let disposable: IDisposable | undefined;
			try {
				// Optimization: we apply edits to a text model and save it
				// right after. Use the files config service to signal this
				// to the workbench to optimise the UI during this operation.
				// For example, avoids to briefly show dirty indicators.
				disposable = this.filesConfigurationService.enableAutoSaveAfterShortDelay(model.uri);
				if (this.applyEditsToBuffer(edit, model)) {
					await this.save(model, operation);
				}
			} finally {
				disposable?.dispose();
			}
		}
	}

	private async save(model: ITextModel, operation: IConfigurationEditOperation): Promise<void> {
		try {
			await this.textFileService.save(model.uri, { ignoreErrorHandler: true });
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE) {
				throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_MODIFIED_SINCE, operation.target, operation);
			}
			throw new ConfigurationEditingError(nls.localize('fsError', "Error while writing to {0}. {1}", this.stringifyTarget(operation.target), error.message), ConfigurationEditingErrorCode.ERROR_INTERNAL);
		}
	}

	private applyEditsToBuffer(edit: Edit, model: ITextModel): boolean {
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

	private getEdits({ value, jsonPath }: IConfigurationEditOperation, modelContent: string, formattingOptions: FormattingOptions): Edit[] {
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

	private getFormattingOptions(model: ITextModel): FormattingOptions {
		const { insertSpaces, tabSize } = model.getOptions();
		const eol = model.getEOL();
		return { insertSpaces, tabSize, eol };
	}

	private async onError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, scopes: IConfigurationUpdateOverrides | undefined): Promise<void> {
		switch (error.code) {
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION:
				this.onInvalidConfigurationError(error, operation);
				break;
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY:
				this.onConfigurationFileDirtyError(error, operation, scopes);
				break;
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_MODIFIED_SINCE:
				return this.doWriteConfiguration(operation, { scopes, handleDirtyFile: 'revert' });
			default:
				this.notificationService.error(error.message);
		}
	}

	private onInvalidConfigurationError(error: ConfigurationEditingError, operation: IConfigurationEditOperation,): void {
		const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
			: operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
				: operation.workspaceStandAloneConfigurationKey === MCP_CONFIGURATION_KEY ? nls.localize('openMcpConfiguration', "Open MCP Configuration")
					: null;
		if (openStandAloneConfigurationActionLabel) {
			this.notificationService.prompt(Severity.Error, error.message,
				[{
					label: openStandAloneConfigurationActionLabel,
					run: () => this.openFile(operation.resource!)
				}]
			);
		} else {
			this.notificationService.prompt(Severity.Error, error.message,
				[{
					label: nls.localize('open', "Open Settings"),
					run: () => this.openSettings(operation)
				}]
			);
		}
	}

	private onConfigurationFileDirtyError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, scopes: IConfigurationUpdateOverrides | undefined): void {
		const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
			: operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
				: null;
		if (openStandAloneConfigurationActionLabel) {
			this.notificationService.prompt(Severity.Error, error.message,
				[{
					label: nls.localize('saveAndRetry', "Save and Retry"),
					run: () => {
						const key = operation.key ? `${operation.workspaceStandAloneConfigurationKey}.${operation.key}` : operation.workspaceStandAloneConfigurationKey!;
						this.writeConfiguration(operation.target, { key, value: operation.value }, { handleDirtyFile: 'save', scopes });
					}
				},
				{
					label: openStandAloneConfigurationActionLabel,
					run: () => this.openFile(operation.resource!)
				}]
			);
		} else {
			this.notificationService.prompt(Severity.Error, error.message,
				[{
					label: nls.localize('saveAndRetry', "Save and Retry"),
					run: () => this.writeConfiguration(operation.target, { key: operation.key, value: operation.value }, { handleDirtyFile: 'save', scopes })
				},
				{
					label: nls.localize('open', "Open Settings"),
					run: () => this.openSettings(operation)
				}]
			);
		}
	}

	private openSettings(operation: IConfigurationEditOperation): void {
		const options: IOpenSettingsOptions = { jsonEditor: true };
		switch (operation.target) {
			case EditableConfigurationTarget.USER_LOCAL:
				this.preferencesService.openUserSettings(options);
				break;
			case EditableConfigurationTarget.USER_REMOTE:
				this.preferencesService.openRemoteSettings(options);
				break;
			case EditableConfigurationTarget.WORKSPACE:
				this.preferencesService.openWorkspaceSettings(options);
				break;
			case EditableConfigurationTarget.WORKSPACE_FOLDER:
				if (operation.resource) {
					const workspaceFolder = this.contextService.getWorkspaceFolder(operation.resource);
					if (workspaceFolder) {
						this.preferencesService.openFolderSettings({ folderUri: workspaceFolder.uri, jsonEditor: true });
					}
				}
				break;
		}
	}

	private openFile(resource: URI): void {
		this.editorService.openEditor({ resource, options: { pinned: true } });
	}

	private toConfigurationEditingError(code: ConfigurationEditingErrorCode, target: EditableConfigurationTarget, operation: IConfigurationEditOperation): ConfigurationEditingError {
		const message = this.toErrorMessage(code, target, operation);
		return new ConfigurationEditingError(message, code);
	}

	private toErrorMessage(error: ConfigurationEditingErrorCode, target: EditableConfigurationTarget, operation: IConfigurationEditOperation): string {
		switch (error) {

			// API constraints
			case ConfigurationEditingErrorCode.ERROR_POLICY_CONFIGURATION: return nls.localize('errorPolicyConfiguration', "Unable to write {0} because it is configured in system policy.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY: return nls.localize('errorUnknownKey', "Unable to write to {0} because {1} is not a registered configuration.", this.stringifyTarget(target), operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION: return nls.localize('errorInvalidWorkspaceConfigurationApplication', "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE: return nls.localize('errorInvalidWorkspaceConfigurationMachine', "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION: return nls.localize('errorInvalidFolderConfiguration', "Unable to write to Folder Settings because {0} does not support the folder resource scope.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET: return nls.localize('errorInvalidUserTarget', "Unable to write to User Settings because {0} does not support for global scope.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_TARGET: return nls.localize('errorInvalidWorkspaceTarget', "Unable to write to Workspace Settings because {0} does not support for workspace scope in a multi folder workspace.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET: return nls.localize('errorInvalidFolderTarget', "Unable to write to Folder Settings because no resource is provided.");
			case ConfigurationEditingErrorCode.ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION: return nls.localize('errorInvalidResourceLanguageConfiguration', "Unable to write to Language Settings because {0} is not a resource language setting.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED: return nls.localize('errorNoWorkspaceOpened', "Unable to write to {0} because no workspace is opened. Please open a workspace first and try again.", this.stringifyTarget(target));

			// User issues
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION: {
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
					case EditableConfigurationTarget.USER_LOCAL:
						return nls.localize('errorInvalidConfiguration', "Unable to write into user settings. Please open the user settings to correct errors/warnings in it and try again.");
					case EditableConfigurationTarget.USER_REMOTE:
						return nls.localize('errorInvalidRemoteConfiguration', "Unable to write into remote user settings. Please open the remote user settings to correct errors/warnings in it and try again.");
					case EditableConfigurationTarget.WORKSPACE:
						return nls.localize('errorInvalidConfigurationWorkspace', "Unable to write into workspace settings. Please open the workspace settings to correct errors/warnings in the file and try again.");
					case EditableConfigurationTarget.WORKSPACE_FOLDER: {
						let workspaceFolderName: string = '<<unknown>>';
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
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY: {
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
					case EditableConfigurationTarget.USER_LOCAL:
						return nls.localize('errorConfigurationFileDirty', "Unable to write into user settings because the file has unsaved changes. Please save the user settings file first and then try again.");
					case EditableConfigurationTarget.USER_REMOTE:
						return nls.localize('errorRemoteConfigurationFileDirty', "Unable to write into remote user settings because the file has unsaved changes. Please save the remote user settings file first and then try again.");
					case EditableConfigurationTarget.WORKSPACE:
						return nls.localize('errorConfigurationFileDirtyWorkspace', "Unable to write into workspace settings because the file has unsaved changes. Please save the workspace settings file first and then try again.");
					case EditableConfigurationTarget.WORKSPACE_FOLDER: {
						let workspaceFolderName: string = '<<unknown>>';
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
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_MODIFIED_SINCE:
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
					case EditableConfigurationTarget.USER_LOCAL:
						return nls.localize('errorConfigurationFileModifiedSince', "Unable to write into user settings because the content of the file is newer.");
					case EditableConfigurationTarget.USER_REMOTE:
						return nls.localize('errorRemoteConfigurationFileModifiedSince', "Unable to write into remote user settings because the content of the file is newer.");
					case EditableConfigurationTarget.WORKSPACE:
						return nls.localize('errorConfigurationFileModifiedSinceWorkspace', "Unable to write into workspace settings because the content of the file is newer.");
					case EditableConfigurationTarget.WORKSPACE_FOLDER:
						return nls.localize('errorConfigurationFileModifiedSinceFolder', "Unable to write into folder settings because the content of the file is newer.");
				}
			case ConfigurationEditingErrorCode.ERROR_INTERNAL: return nls.localize('errorUnknown', "Unable to write to {0} because of an internal error.", this.stringifyTarget(target));
		}
	}

	private stringifyTarget(target: EditableConfigurationTarget): string {
		switch (target) {
			case EditableConfigurationTarget.USER_LOCAL:
				return nls.localize('userTarget', "User Settings");
			case EditableConfigurationTarget.USER_REMOTE:
				return nls.localize('remoteUserTarget', "Remote User Settings");
			case EditableConfigurationTarget.WORKSPACE:
				return nls.localize('workspaceTarget', "Workspace Settings");
			case EditableConfigurationTarget.WORKSPACE_FOLDER:
				return nls.localize('folderTarget', "Folder Settings");
			default:
				return '';
		}
	}

	private defaultResourceValue(resource: URI): string {
		const basename: string = this.uriIdentityService.extUri.basename(resource);
		const configurationValue: string = basename.substr(0, basename.length - this.uriIdentityService.extUri.extname(resource).length);
		switch (configurationValue) {
			case TASKS_CONFIGURATION_KEY: return TASKS_DEFAULT;
			default: return '{}';
		}
	}

	private async resolveModelReference(resource: URI): Promise<IReference<IResolvedTextEditorModel>> {
		const exists = await this.fileService.exists(resource);
		if (!exists) {
			await this.textFileService.write(resource, this.defaultResourceValue(resource), { encoding: 'utf8' });
		}
		return this.textModelResolverService.createModelReference(resource);
	}

	private hasParseErrors(content: string, operation: IConfigurationEditOperation): boolean {
		// If we write to a workspace standalone file and replace the entire contents (no key provided)
		// we can return here because any parse errors can safely be ignored since all contents are replaced
		if (operation.workspaceStandAloneConfigurationKey && !operation.key) {
			return false;
		}
		const parseErrors: json.ParseError[] = [];
		json.parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
		return parseErrors.length > 0;
	}

	private async validate(target: EditableConfigurationTarget, operation: IConfigurationEditOperation, checkDirty: boolean, overrides: IConfigurationUpdateOverrides): Promise<void> {

		if (this.configurationService.inspect(operation.key).policyValue !== undefined) {
			throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_POLICY_CONFIGURATION, target, operation);
		}

		const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
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
				throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY, target, operation);
			}
		}

		if (operation.workspaceStandAloneConfigurationKey) {
			// Global launches are not supported
			if ((operation.workspaceStandAloneConfigurationKey !== TASKS_CONFIGURATION_KEY) && (operation.workspaceStandAloneConfigurationKey !== MCP_CONFIGURATION_KEY) && (target === EditableConfigurationTarget.USER_LOCAL || target === EditableConfigurationTarget.USER_REMOTE)) {
				throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET, target, operation);
			}
		}

		// Target cannot be workspace or folder if no workspace opened
		if ((target === EditableConfigurationTarget.WORKSPACE || target === EditableConfigurationTarget.WORKSPACE_FOLDER) && this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED, target, operation);
		}

		if (target === EditableConfigurationTarget.WORKSPACE) {
			if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
				if (configurationScope && APPLICATION_SCOPES.includes(configurationScope)) {
					throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION, target, operation);
				}
				if (configurationScope === ConfigurationScope.MACHINE) {
					throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE, target, operation);
				}
			}
		}

		if (target === EditableConfigurationTarget.WORKSPACE_FOLDER) {
			if (!operation.resource) {
				throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET, target, operation);
			}

			if (!operation.workspaceStandAloneConfigurationKey && !OVERRIDE_PROPERTY_REGEX.test(operation.key)) {
				if (configurationScope !== undefined && !FOLDER_SCOPES.includes(configurationScope)) {
					throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION, target, operation);
				}
			}
		}

		if (overrides.overrideIdentifiers?.length) {
			if (configurationScope !== ConfigurationScope.LANGUAGE_OVERRIDABLE) {
				throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_RESOURCE_LANGUAGE_CONFIGURATION, target, operation);
			}
		}

		if (!operation.resource) {
			throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET, target, operation);
		}

		if (checkDirty && this.textFileService.isDirty(operation.resource)) {
			throw this.toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY, target, operation);
		}

	}

	private getConfigurationEditOperation(target: EditableConfigurationTarget, config: IConfigurationValue, overrides: IConfigurationUpdateOverrides): IConfigurationEditOperation {

		// Check for standalone workspace configurations
		if (config.key) {
			const standaloneConfigurationMap = target === EditableConfigurationTarget.USER_LOCAL ? USER_STANDALONE_CONFIGURATIONS : WORKSPACE_STANDALONE_CONFIGURATIONS;
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
		const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
		const configurationScope = configurationProperties[key]?.scope;
		let jsonPath = overrides.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];
		if (target === EditableConfigurationTarget.USER_LOCAL || target === EditableConfigurationTarget.USER_REMOTE) {
			return { key, jsonPath, value: config.value, resource: this.getConfigurationFileResource(target, key, '', null, configurationScope) ?? undefined, target };
		}

		const resource = this.getConfigurationFileResource(target, key, FOLDER_SETTINGS_PATH, overrides.resource, configurationScope);
		if (this.isWorkspaceConfigurationResource(resource)) {
			jsonPath = ['settings', ...jsonPath];
		}
		return { key, jsonPath, value: config.value, resource: resource ?? undefined, target };
	}

	private isWorkspaceConfigurationResource(resource: URI | null): boolean {
		const workspace = this.contextService.getWorkspace();
		return !!(workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath);
	}

	private getConfigurationFileResource(target: EditableConfigurationTarget, key: string, relativePath: string, resource: URI | null | undefined, scope: ConfigurationScope | undefined): URI | null {
		if (target === EditableConfigurationTarget.USER_LOCAL) {
			if (key === TASKS_CONFIGURATION_KEY) {
				return this.userDataProfileService.currentProfile.tasksResource;
			} if (key === MCP_CONFIGURATION_KEY) {
				return this.userDataProfileService.currentProfile.mcpResource;
			} else {
				if (!this.userDataProfileService.currentProfile.isDefault && this.configurationService.isSettingAppliedForAllProfiles(key)) {
					return this.userDataProfilesService.defaultProfile.settingsResource;
				}
				return this.userDataProfileService.currentProfile.settingsResource;
			}
		}
		if (target === EditableConfigurationTarget.USER_REMOTE) {
			return this.remoteSettingsResource;
		}
		const workbenchState = this.contextService.getWorkbenchState();
		if (workbenchState !== WorkbenchState.EMPTY) {

			const workspace = this.contextService.getWorkspace();

			if (target === EditableConfigurationTarget.WORKSPACE) {
				if (workbenchState === WorkbenchState.WORKSPACE) {
					return workspace.configuration ?? null;
				}
				if (workbenchState === WorkbenchState.FOLDER) {
					return workspace.folders[0].toResource(relativePath);
				}
			}

			if (target === EditableConfigurationTarget.WORKSPACE_FOLDER) {
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
}
