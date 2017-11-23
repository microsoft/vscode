/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import nls = require('vs/nls');
import { TPromise } from 'vs/base/common/winjs.base';
import URI from 'vs/base/common/uri';
import * as json from 'vs/base/common/json';
import * as encoding from 'vs/base/node/encoding';
import strings = require('vs/base/common/strings');
import { setProperty } from 'vs/base/common/jsonEdit';
import { Queue } from 'vs/base/common/async';
import { Edit } from 'vs/base/common/jsonFormatter';
import { IReference } from 'vs/base/common/lifecycle';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService, IConfigurationOverrides, keyFromOverrideIdentifier, ConfigurationTarget } from 'vs/platform/configuration/common/configuration';
import { FOLDER_SETTINGS_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY } from 'vs/workbench/services/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { ITextModelService, ITextEditorModel } from 'vs/editor/common/services/resolverService';
import { OVERRIDE_PROPERTY_PATTERN, IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IChoiceService, IMessageService, Severity } from 'vs/platform/message/common/message';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';

export enum ConfigurationEditingErrorCode {

	/**
	 * Error when trying to write a configuration key that is not registered.
	 */
	ERROR_UNKNOWN_KEY,

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
	 * Error when trying to write to the workspace configuration without having a workspace opened.
	 */
	ERROR_NO_WORKSPACE_OPENED,

	/**
	 * Error when trying to write and save to the configuration file while it is dirty in the editor.
	 */
	ERROR_CONFIGURATION_FILE_DIRTY,

	/**
	 * Error when trying to write to a configuration file that contains JSON errors.
	 */
	ERROR_INVALID_CONFIGURATION
}

export class ConfigurationEditingError extends Error {
	constructor(message: string, public code: ConfigurationEditingErrorCode) {
		super(message);
	}
}

export interface IConfigurationValue {
	key: string;
	value: any;
}

export interface IConfigurationEditingOptions {
	/**
	 * If `true`, do not saves the configuration. Default is `false`.
	 */
	donotSave?: boolean;
	/**
	 * If `true`, do not notifies the error to user by showing the message box. Default is `false`.
	 */
	donotNotifyError?: boolean;
	/**
	 * Scope of configuration to be written into.
	 */
	scopes?: IConfigurationOverrides;
}

interface IConfigurationEditOperation extends IConfigurationValue {
	target: ConfigurationTarget;
	jsonPath: json.JSONPath;
	resource: URI;
	workspaceStandAloneConfigurationKey?: string;

}

interface ConfigurationEditingOptions extends IConfigurationEditingOptions {
	force?: boolean;
}

export class ConfigurationEditingService {

	public _serviceBrand: any;

	private queue: Queue<void>;

	constructor(
		@IConfigurationService private configurationService: IConfigurationService,
		@IWorkspaceContextService private contextService: IWorkspaceContextService,
		@IEnvironmentService private environmentService: IEnvironmentService,
		@IFileService private fileService: IFileService,
		@ITextModelService private textModelResolverService: ITextModelService,
		@ITextFileService private textFileService: ITextFileService,
		@IChoiceService private choiceService: IChoiceService,
		@IMessageService private messageService: IMessageService,
		@ICommandService private commandService: ICommandService,
		@IWorkbenchEditorService private editorService: IWorkbenchEditorService
	) {
		this.queue = new Queue<void>();
	}

	writeConfiguration(target: ConfigurationTarget, value: IConfigurationValue, options: IConfigurationEditingOptions = {}): TPromise<void> {
		const operation = this.getConfigurationEditOperation(target, value, options.scopes || {});
		return this.queue.queue(() => this.doWriteConfiguration(operation, options) // queue up writes to prevent race conditions
			.then(() => null,
			error => {
				if (!options.donotNotifyError) {
					this.onError(error, operation, options.scopes);
				}
				return TPromise.wrapError(error);
			}));
	}

	private doWriteConfiguration(operation: IConfigurationEditOperation, options: ConfigurationEditingOptions): TPromise<void> {
		const checkDirtyConfiguration = !(options.force || options.donotSave);
		const saveConfiguration = options.force || !options.donotSave;
		return this.resolveAndValidate(operation.target, operation, checkDirtyConfiguration, options.scopes || {})
			.then(reference => this.writeToBuffer(reference.object.textEditorModel, operation, saveConfiguration)
				.then(() => reference.dispose()));
	}

	private writeToBuffer(model: editorCommon.IModel, operation: IConfigurationEditOperation, save: boolean): TPromise<any> {
		const edit = this.getEdits(model, operation)[0];
		if (this.applyEditsToBuffer(edit, model) && save) {
			return this.textFileService.save(operation.resource, { skipSaveParticipants: true /* programmatic change */ });
		}
		return TPromise.as(null);
	}

	private applyEditsToBuffer(edit: Edit, model: editorCommon.IModel): boolean {
		const startPosition = model.getPositionAt(edit.offset);
		const endPosition = model.getPositionAt(edit.offset + edit.length);
		const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		let currentText = model.getValueInRange(range);
		if (edit.content !== currentText) {
			const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
			model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
			return true;
		}
		return false;
	}

	private onError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, scopes: IConfigurationOverrides): void {
		switch (error.code) {
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION:
				this.onInvalidConfigurationError(error, operation);
				break;
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY:
				this.onConfigurationFileDirtyError(error, operation, scopes);
				break;
			default:
				this.messageService.show(Severity.Error, error.message);
		}
	}

	private onInvalidConfigurationError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, ): void {
		const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
			: operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
				: null;
		if (openStandAloneConfigurationActionLabel) {
			this.choiceService.choose(Severity.Error, error.message, [openStandAloneConfigurationActionLabel, nls.localize('close', "Close")], 1)
				.then(option => {
					switch (option) {
						case 0:
							this.openFile(operation.resource);
							break;
					}
				});
		} else {
			this.choiceService.choose(Severity.Error, error.message, [nls.localize('open', "Open Settings"), nls.localize('close', "Close")], 1)
				.then(option => {
					switch (option) {
						case 0:
							this.openSettings(operation);
							break;
					}
				});
		}
	}

	private onConfigurationFileDirtyError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, scopes: IConfigurationOverrides): void {
		const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
			: operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
				: null;
		if (openStandAloneConfigurationActionLabel) {
			this.choiceService.choose(Severity.Error, error.message, [nls.localize('saveAndRetry', "Save and Retry"), openStandAloneConfigurationActionLabel, nls.localize('close', "Close")], 2)
				.then(option => {
					switch (option) {
						case 0:
							const key = operation.key ? `${operation.workspaceStandAloneConfigurationKey}.${operation.key}` : operation.workspaceStandAloneConfigurationKey;
							this.writeConfiguration(operation.target, { key, value: operation.value }, <ConfigurationEditingOptions>{ force: true, scopes });
							break;
						case 1:
							this.openFile(operation.resource);
							break;
					}
				});
		} else {
			this.choiceService.choose(Severity.Error, error.message, [nls.localize('saveAndRetry', "Save and Retry"), nls.localize('open', "Open Settings"), nls.localize('close', "Close")], 2)
				.then(option => {
					switch (option) {
						case 0:
							this.writeConfiguration(operation.target, { key: operation.key, value: operation.value }, <ConfigurationEditingOptions>{ force: true, scopes });
							break;
						case 1:
							this.openSettings(operation);
							break;
					}
				});
		}
	}

	private openSettings(operation: IConfigurationEditOperation): void {
		switch (operation.target) {
			case ConfigurationTarget.USER:
				this.commandService.executeCommand('workbench.action.openGlobalSettings');
				break;
			case ConfigurationTarget.WORKSPACE:
				this.commandService.executeCommand('workbench.action.openWorkspaceSettings');
				break;
			case ConfigurationTarget.WORKSPACE_FOLDER:
				if (operation.resource) {
					const workspaceFolder = this.contextService.getWorkspaceFolder(operation.resource);
					if (workspaceFolder) {
						this.commandService.executeCommand('_workbench.action.openFolderSettings', workspaceFolder);
					}
				}
				break;
		}
	}

	private openFile(resource: URI): void {
		this.editorService.openEditor({ resource });
	}

	private wrapError<T = never>(code: ConfigurationEditingErrorCode, target: ConfigurationTarget, operation: IConfigurationEditOperation): TPromise<T> {
		const message = this.toErrorMessage(code, target, operation);

		return TPromise.wrapError<T>(new ConfigurationEditingError(message, code));
	}

	private toErrorMessage(error: ConfigurationEditingErrorCode, target: ConfigurationTarget, operation: IConfigurationEditOperation): string {
		switch (error) {

			// API constraints
			case ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY: return nls.localize('errorUnknownKey', "Unable to write to {0} because {1} is not a registered configuration.", this.stringifyTarget(target), operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION: return nls.localize('errorInvalidFolderConfiguration', "Unable to write to Folder Settings because {0} does not support the folder resource scope.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET: return nls.localize('errorInvalidUserTarget', "Unable to write to User Settings because {0} does not support for global scope.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_TARGET: return nls.localize('errorInvalidWorkspaceTarget', "Unable to write to Workspace Settings because {0} does not support for workspace scope in a multi folder workspace.", operation.key);
			case ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET: return nls.localize('errorInvalidFolderTarget', "Unable to write to Folder Settings because no resource is provided.");
			case ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED: return nls.localize('errorNoWorkspaceOpened', "Unable to write to {0} because no workspace is opened. Please open a workspace first and try again.", this.stringifyTarget(target));

			// User issues
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION: {
				if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
					return nls.localize('errorInvalidTaskConfiguration', "Unable to write into tasks file. Please open **Tasks** file to correct errors/warnings in it and try again.");
				}
				if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
					return nls.localize('errorInvalidLaunchConfiguration', "Unable to write into launch file. Please open **Launch** file to correct errors/warnings in it and try again.");
				}
				switch (target) {
					case ConfigurationTarget.USER:
						return nls.localize('errorInvalidConfiguration', "Unable to write into user settings. Please open **User Settings** file to correct errors/warnings in it and try again.");
					case ConfigurationTarget.WORKSPACE:
						return nls.localize('errorInvalidConfigurationWorkspace', "Unable to write into workspace settings. Please open **Workspace Settings** file to correct errors/warnings in the file and try again.");
					case ConfigurationTarget.WORKSPACE_FOLDER:
						const workspaceFolderName = this.contextService.getWorkspaceFolder(operation.resource).name;
						return nls.localize('errorInvalidConfigurationFolder', "Unable to write into folder settings. Please open **Folder Settings** file under **{0}** folder to correct errors/warnings in it and try again.", workspaceFolderName);
				}
				return '';
			}
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY: {
				if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
					return nls.localize('errorTasksConfigurationFileDirty', "Unable to write into tasks file because the file is dirty. Please save the **Tasks Configuration** file and try again.");
				}
				if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
					return nls.localize('errorLaunchConfigurationFileDirty', "Unable to write into launch file because the file is dirty. Please save the **Launch Configuration** file and try again.");
				}
				switch (target) {
					case ConfigurationTarget.USER:
						return nls.localize('errorConfigurationFileDirty', "Unable to write into user settings because the file is dirty. Please save the **User Settings** file and try again.");
					case ConfigurationTarget.WORKSPACE:
						return nls.localize('errorConfigurationFileDirtyWorkspace', "Unable to write into workspace settings because the file is dirty. Please save the **Workspace Settings** file and try again.");
					case ConfigurationTarget.WORKSPACE_FOLDER:
						const workspaceFolderName = this.contextService.getWorkspaceFolder(operation.resource).name;
						return nls.localize('errorConfigurationFileDirtyFolder', "Unable to write into folder settings because the file is dirty. Please save the **Folder Settings** file under **{0}** folder and try again.", workspaceFolderName);
				}
				return '';
			}
		}
	}

	private stringifyTarget(target: ConfigurationTarget): string {
		switch (target) {
			case ConfigurationTarget.USER:
				return nls.localize('userTarget', "User Settings");
			case ConfigurationTarget.WORKSPACE:
				return nls.localize('workspaceTarget', "Workspace Settings");
			case ConfigurationTarget.WORKSPACE_FOLDER:
				return nls.localize('folderTarget', "Folder Settings");
		}
		return '';
	}

	private getEdits(model: editorCommon.IModel, edit: IConfigurationEditOperation): Edit[] {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();
		const { value, jsonPath } = edit;

		// Without jsonPath, the entire configuration file is being replaced, so we just use JSON.stringify
		if (!jsonPath.length) {
			const content = JSON.stringify(value, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t');
			return [{
				content,
				length: model.getValue().length,
				offset: 0
			}];
		}

		return setProperty(model.getValue(), jsonPath, value, { tabSize, insertSpaces, eol });
	}

	private resolveModelReference(resource: URI): TPromise<IReference<ITextEditorModel>> {
		return this.fileService.existsFile(resource)
			.then(exists => {
				const result = exists ? TPromise.as(null) : this.fileService.updateContent(resource, '{}', { encoding: encoding.UTF8 });
				return result.then(() => this.textModelResolverService.createModelReference(resource));
			});
	}

	private hasParseErrors(model: editorCommon.IModel, operation: IConfigurationEditOperation): boolean {
		// If we write to a workspace standalone file and replace the entire contents (no key provided)
		// we can return here because any parse errors can safely be ignored since all contents are replaced
		if (operation.workspaceStandAloneConfigurationKey && !operation.key) {
			return false;
		}
		const parseErrors: json.ParseError[] = [];
		json.parse(model.getValue(), parseErrors, { allowTrailingComma: true });
		return parseErrors.length > 0;
	}

	private resolveAndValidate(target: ConfigurationTarget, operation: IConfigurationEditOperation, checkDirty: boolean, overrides: IConfigurationOverrides): TPromise<IReference<ITextEditorModel>> {

		// Any key must be a known setting from the registry (unless this is a standalone config)
		if (!operation.workspaceStandAloneConfigurationKey) {
			const validKeys = this.configurationService.keys().default;
			if (validKeys.indexOf(operation.key) < 0 && !OVERRIDE_PROPERTY_PATTERN.test(operation.key)) {
				return this.wrapError(ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY, target, operation);
			}
		}

		if (operation.workspaceStandAloneConfigurationKey) {
			// Global tasks and launches are not supported
			if (target === ConfigurationTarget.USER) {
				return this.wrapError(ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET, target, operation);
			}

			// Workspace tasks and launches are not supported
			if (this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && operation.target === ConfigurationTarget.WORKSPACE) {
				return this.wrapError(ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_TARGET, target, operation);
			}
		}

		// Target cannot be workspace or folder if no workspace opened
		if ((target === ConfigurationTarget.WORKSPACE || target === ConfigurationTarget.WORKSPACE_FOLDER) && this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			return this.wrapError(ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED, target, operation);
		}

		if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
			if (!operation.resource) {
				return this.wrapError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET, target, operation);
			}

			if (!operation.workspaceStandAloneConfigurationKey) {
				const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
				if (configurationProperties[operation.key].scope !== ConfigurationScope.RESOURCE) {
					return this.wrapError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION, target, operation);
				}
			}
		}

		return this.resolveModelReference(operation.resource)
			.then(reference => {
				const model = reference.object.textEditorModel;

				if (this.hasParseErrors(model, operation)) {
					return this.wrapError<typeof reference>(ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION, target, operation);
				}

				// Target cannot be dirty if not writing into buffer
				if (checkDirty && this.textFileService.isDirty(operation.resource)) {
					return this.wrapError<typeof reference>(ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY, target, operation);
				}
				return reference;
			});
	}

	private getConfigurationEditOperation(target: ConfigurationTarget, config: IConfigurationValue, overrides: IConfigurationOverrides): IConfigurationEditOperation {

		const workspace = this.contextService.getWorkspace();

		// Check for standalone workspace configurations
		if (config.key) {
			const standaloneConfigurationKeys = Object.keys(WORKSPACE_STANDALONE_CONFIGURATIONS);
			for (let i = 0; i < standaloneConfigurationKeys.length; i++) {
				const key = standaloneConfigurationKeys[i];
				const resource = this.getConfigurationFileResource(target, WORKSPACE_STANDALONE_CONFIGURATIONS[key], overrides.resource);

				// Check for prefix
				if (config.key === key) {
					const jsonPath = workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath ? [key] : [];
					return { key: jsonPath[jsonPath.length - 1], jsonPath, value: config.value, resource, workspaceStandAloneConfigurationKey: key, target };
				}

				// Check for prefix.<setting>
				const keyPrefix = `${key}.`;
				if (config.key.indexOf(keyPrefix) === 0) {
					const jsonPath = workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath ? [key, config.key.substr(keyPrefix.length)] : [config.key.substr(keyPrefix.length)];
					return { key: jsonPath[jsonPath.length - 1], jsonPath, value: config.value, resource, workspaceStandAloneConfigurationKey: key, target };
				}
			}
		}

		let key = config.key;
		let jsonPath = overrides.overrideIdentifier ? [keyFromOverrideIdentifier(overrides.overrideIdentifier), key] : [key];
		if (target === ConfigurationTarget.USER) {
			return { key, jsonPath, value: config.value, resource: URI.file(this.environmentService.appSettingsPath), target };
		}

		const resource = this.getConfigurationFileResource(target, FOLDER_SETTINGS_PATH, overrides.resource);
		if (workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath) {
			jsonPath = ['settings', ...jsonPath];
		}
		return { key, jsonPath, value: config.value, resource, target };
	}

	private getConfigurationFileResource(target: ConfigurationTarget, relativePath: string, resource: URI): URI {
		if (target === ConfigurationTarget.USER) {
			return URI.file(this.environmentService.appSettingsPath);
		}

		const workbenchState = this.contextService.getWorkbenchState();
		if (workbenchState !== WorkbenchState.EMPTY) {

			const workspace = this.contextService.getWorkspace();

			if (target === ConfigurationTarget.WORKSPACE) {
				if (workbenchState === WorkbenchState.WORKSPACE) {
					return workspace.configuration;
				}
				if (workbenchState === WorkbenchState.FOLDER) {
					return workspace.folders[0].toResource(relativePath);
				}
			}

			if (target === ConfigurationTarget.WORKSPACE_FOLDER) {
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
