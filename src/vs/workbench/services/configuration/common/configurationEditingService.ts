/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import { URI } from 'vs/base/common/uri';
import * as json from 'vs/base/common/json';
import * as strings from 'vs/base/common/strings';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Queue } from 'vs/base/common/async';
import { Edit } from 'vs/base/common/jsonFormatter';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Registry } from 'vs/platform/registry/common/platform';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { ITextFileService } from 'vs/workbench/services/textfile/common/textfiles';
import { IConfigurationService, IConfigurationOverrides, keyFromOverrideIdentifier } from 'vs/platform/configuration/common/configuration';
import { FOLDER_SETTINGS_PATH, WORKSPACE_STANDALONE_CONFIGURATIONS, TASKS_CONFIGURATION_KEY, LAUNCH_CONFIGURATION_KEY, USER_CONFIGURATION_KEY } from 'vs/workbench/services/configuration/common/configuration';
import { IFileService } from 'vs/platform/files/common/files';
import { ITextModelService } from 'vs/editor/common/services/resolverService';
import { OVERRIDE_PROPERTY_PATTERN, IConfigurationRegistry, Extensions as ConfigurationExtensions, ConfigurationScope } from 'vs/platform/configuration/common/configurationRegistry';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { ITextModel } from 'vs/editor/common/model';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { IPreferencesService } from 'vs/workbench/services/preferences/common/preferences';
import { withUndefinedAsNull, withNullAsUndefined } from 'vs/base/common/types';
import { IRemoteAgentService } from 'vs/workbench/services/remote/common/remoteAgentService';
import { IUserDataService } from 'vs/workbench/services/userData/common/userData';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { Emitter } from 'vs/base/common/event';
import { LanguageIdentifier } from 'vs/editor/common/modes';
import { IDisposable, Disposable, toDisposable } from 'vs/base/common/lifecycle';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Schemas } from 'vs/base/common/network';

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
	 * If `true`, do not notifies the error to user by showing the message box. Default is `false`.
	 */
	donotNotifyError?: boolean;
	/**
	 * Scope of configuration to be written into.
	 */
	scopes?: IConfigurationOverrides;
}

export const enum EditableConfigurationTarget {
	USER_LOCAL = 1,
	USER_REMOTE,
	WORKSPACE,
	WORKSPACE_FOLDER
}

interface IConfigurationEditOperation extends IDisposable {
	value: IConfigurationValue;
	target: EditableConfigurationTarget;
	jsonPath: json.JSONPath;
	resource: URI | null;
	workspaceStandAloneConfigurationKey?: string;
	apply(save: boolean): Promise<void>;
}

interface ConfigurationEditingOptions extends IConfigurationEditingOptions {
	donotSave?: boolean;
	force?: boolean;
}

function toConfigurationEditingError(error: ConfigurationEditingErrorCode, operation: IConfigurationEditOperation, contextService: IWorkspaceContextService): ConfigurationEditingError {
	switch (error) {

		// API constraints
		case ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY: return new ConfigurationEditingError(nls.localize('errorUnknownKey', "Unable to write to {0} because {1} is not a registered configuration.", stringifyTarget(operation.target), operation.value.key), error);
		case ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION: return new ConfigurationEditingError(nls.localize('errorInvalidWorkspaceConfigurationApplication', "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.value.key), error);
		case ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE: return new ConfigurationEditingError(nls.localize('errorInvalidWorkspaceConfigurationMachine', "Unable to write {0} to Workspace Settings. This setting can be written only into User settings.", operation.value.key), error);
		case ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION: return new ConfigurationEditingError(nls.localize('errorInvalidFolderConfiguration', "Unable to write to Folder Settings because {0} does not support the folder resource scope.", operation.value.key), error);
		case ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET: return new ConfigurationEditingError(nls.localize('errorInvalidUserTarget', "Unable to write to User Settings because {0} does not support for global scope.", operation.value.key), error);
		case ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_TARGET: return new ConfigurationEditingError(nls.localize('errorInvalidWorkspaceTarget', "Unable to write to Workspace Settings because {0} does not support for workspace scope in a multi folder workspace.", operation.value.key), error);
		case ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET: return new ConfigurationEditingError(nls.localize('errorInvalidFolderTarget', "Unable to write to Folder Settings because no resource is provided."), error);
		case ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED: return new ConfigurationEditingError(nls.localize('errorNoWorkspaceOpened', "Unable to write to {0} because no workspace is opened. Please open a workspace first and try again.", stringifyTarget(operation.target)), error);

		// User issues
		case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION: {
			if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
				return new ConfigurationEditingError(nls.localize('errorInvalidTaskConfiguration', "Unable to write into the tasks configuration file. Please open it to correct errors/warnings in it and try again."), error);
			}
			if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
				return new ConfigurationEditingError(nls.localize('errorInvalidLaunchConfiguration', "Unable to write into the launch configuration file. Please open it to correct errors/warnings in it and try again."), error);
			}
			switch (operation.target) {
				case EditableConfigurationTarget.USER_LOCAL:
					return new ConfigurationEditingError(nls.localize('errorInvalidConfiguration', "Unable to write into user settings. Please open the user settings to correct errors/warnings in it and try again."), error);
				case EditableConfigurationTarget.USER_REMOTE:
					return new ConfigurationEditingError(nls.localize('errorInvalidRemoteConfiguration', "Unable to write into remote user settings. Please open the remote user settings to correct errors/warnings in it and try again."), error);
				case EditableConfigurationTarget.WORKSPACE:
					return new ConfigurationEditingError(nls.localize('errorInvalidConfigurationWorkspace', "Unable to write into workspace settings. Please open the workspace settings to correct errors/warnings in the file and try again."), error);
				case EditableConfigurationTarget.WORKSPACE_FOLDER:
					let workspaceFolderName: string = '<<unknown>>';
					if (operation.resource) {
						const folder = contextService.getWorkspaceFolder(operation.resource);
						if (folder) {
							workspaceFolderName = folder.name;
						}
					}
					return new ConfigurationEditingError(nls.localize('errorInvalidConfigurationFolder', "Unable to write into folder settings. Please open the '{0}' folder settings to correct errors/warnings in it and try again.", workspaceFolderName), error);
			}
			return new ConfigurationEditingError('', error);
		}
		case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY: {
			if (operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY) {
				return new ConfigurationEditingError(nls.localize('errorTasksConfigurationFileDirty', "Unable to write into tasks configuration file because the file is dirty. Please save it first and then try again."), error);
			}
			if (operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY) {
				return new ConfigurationEditingError(nls.localize('errorLaunchConfigurationFileDirty', "Unable to write into launch configuration file because the file is dirty. Please save it first and then try again."), error);
			}
			switch (operation.target) {
				case EditableConfigurationTarget.USER_LOCAL:
					return new ConfigurationEditingError(nls.localize('errorConfigurationFileDirty', "Unable to write into user settings because the file is dirty. Please save the user settings file first and then try again."), error);
				case EditableConfigurationTarget.USER_REMOTE:
					return new ConfigurationEditingError(nls.localize('errorRemoteConfigurationFileDirty', "Unable to write into remote user settings because the file is dirty. Please save the remote user settings file first and then try again."), error);
				case EditableConfigurationTarget.WORKSPACE:
					return new ConfigurationEditingError(nls.localize('errorConfigurationFileDirtyWorkspace', "Unable to write into workspace settings because the file is dirty. Please save the workspace settings file first and then try again."), error);
				case EditableConfigurationTarget.WORKSPACE_FOLDER:
					let workspaceFolderName: string = '<<unknown>>';
					if (operation.resource) {
						const folder = contextService.getWorkspaceFolder(operation.resource);
						if (folder) {
							workspaceFolderName = folder.name;
						}
					}
					return new ConfigurationEditingError(nls.localize('errorConfigurationFileDirtyFolder', "Unable to write into folder settings because the file is dirty. Please save the '{0}' folder settings file first and then try again.", workspaceFolderName), error);
			}
			return new ConfigurationEditingError('', error);
		}
	}
}

function stringifyTarget(target: EditableConfigurationTarget): string {
	switch (target) {
		case EditableConfigurationTarget.USER_LOCAL:
			return nls.localize('userTarget', "User Settings");
		case EditableConfigurationTarget.USER_REMOTE:
			return nls.localize('remoteUserTarget', "Remote User Settings");
		case EditableConfigurationTarget.WORKSPACE:
			return nls.localize('workspaceTarget', "Workspace Settings");
		case EditableConfigurationTarget.WORKSPACE_FOLDER:
			return nls.localize('folderTarget', "Folder Settings");
	}
	return '';
}

abstract class ConfigurationEditOperation extends Disposable implements IConfigurationEditOperation {

	constructor(
		readonly value: IConfigurationValue,
		readonly target: EditableConfigurationTarget,
		readonly jsonPath: json.JSONPath,
		readonly resource: URI | null,
		readonly workspaceStandAloneConfigurationKey: string | undefined,
		protected readonly contextService: IWorkspaceContextService
	) {
		super();
	}

	async apply(save: boolean): Promise<void> {
		this.validate();
		const model = await this.resolve();
		if (this.hasParseErrors(model)) {
			throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION, this, this.contextService);
		}
		const edit = this.getEdits(model)[0];
		if (edit && this.applyEditsToBuffer(edit, model) && save) {
			await this.save(model);
		}

	}

	private applyEditsToBuffer(edit: Edit, model: ITextModel): boolean {
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

	private getEdits(model: ITextModel): Edit[] {
		const { tabSize, insertSpaces } = model.getOptions();
		const eol = model.getEOL();

		// Without jsonPath, the entire configuration file is being replaced, so we just use JSON.stringify
		if (!this.jsonPath.length) {
			const content = JSON.stringify(this.value.value, null, insertSpaces ? strings.repeat(' ', tabSize) : '\t');
			return [{
				content,
				length: model.getValue().length,
				offset: 0
			}];
		}

		return setProperty(model.getValue(), this.jsonPath, this.value.value, { tabSize, insertSpaces, eol });
	}

	private hasParseErrors(model: ITextModel): boolean {
		// If we write to a workspace standalone file and replace the entire contents (no key provided)
		// we can return here because any parse errors can safely be ignored since all contents are replaced
		if (this.workspaceStandAloneConfigurationKey && !this.value.key) {
			return false;
		}
		const parseErrors: json.ParseError[] = [];
		json.parse(model.getValue(), parseErrors);
		return parseErrors.length > 0;
	}

	protected abstract validate(): void;
	protected abstract save(model: ITextModel): Promise<void>;
	protected abstract resolve(): Promise<ITextModel>;
}

class ResourceConfigurationEditOperation extends ConfigurationEditOperation {

	private resolvePromise: Promise<ITextModel> | undefined = undefined;

	constructor(
		value: IConfigurationValue,
		target: EditableConfigurationTarget,
		jsonPath: json.JSONPath,
		readonly resource: URI,
		workspaceStandAloneConfigurationKey: string | undefined,
		private readonly checkDirty: boolean,
		@IFileService private readonly fileService: IFileService,
		@ITextFileService private readonly textFileService: ITextFileService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(
			value,
			target,
			jsonPath,
			resource,
			workspaceStandAloneConfigurationKey,
			contextService
		);
	}

	protected async save(model: ITextModel): Promise<void> {
		await this.textFileService.save(this.resource, { skipSaveParticipants: true /* programmatic change */ });
	}

	protected async resolve(): Promise<ITextModel> {
		if (!this.resolvePromise) {
			this.resolvePromise = this._resolve();
		}
		return this.resolvePromise;
	}

	protected validate(): void {
		if (this.checkDirty && this.textFileService.isDirty(this.resource)) {
			throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY, this, this.contextService);
		}

		// Any key must be a known setting from the registry (unless this is a standalone config)
		if (!this.workspaceStandAloneConfigurationKey) {
			const validKeys = this.configurationService.keys().default;
			if (validKeys.indexOf(this.value.key) < 0 && !OVERRIDE_PROPERTY_PATTERN.test(this.value.key)) {
				throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY, this, this.contextService);
			}
		}

		if (this.workspaceStandAloneConfigurationKey) {
			// Global tasks and launches are not supported
			if (this.target === EditableConfigurationTarget.USER_LOCAL || this.target === EditableConfigurationTarget.USER_REMOTE) {
				throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_USER_TARGET, this, this.contextService);
			}

			// Workspace tasks are not supported
			if (this.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY && this.contextService.getWorkbenchState() === WorkbenchState.WORKSPACE && this.target === EditableConfigurationTarget.WORKSPACE) {
				throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_TARGET, this, this.contextService);
			}
		}

		// Target cannot be workspace or folder if no workspace opened
		if ((this.target === EditableConfigurationTarget.WORKSPACE || this.target === EditableConfigurationTarget.WORKSPACE_FOLDER) && this.contextService.getWorkbenchState() === WorkbenchState.EMPTY) {
			throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_NO_WORKSPACE_OPENED, this, this.contextService);
		}

		if (this.target === EditableConfigurationTarget.WORKSPACE) {
			if (!this.workspaceStandAloneConfigurationKey) {
				const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
				if (configurationProperties[this.value.key].scope === ConfigurationScope.APPLICATION) {
					throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_APPLICATION, this, this.contextService);
				}
				if (configurationProperties[this.value.key].scope === ConfigurationScope.MACHINE) {
					throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_WORKSPACE_CONFIGURATION_MACHINE, this, this.contextService);
				}
			}
		}

		if (this.target === EditableConfigurationTarget.WORKSPACE_FOLDER) {
			if (!this.resource) {
				throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET, this, this.contextService);
			}

			if (!this.workspaceStandAloneConfigurationKey) {
				const configurationProperties = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).getConfigurationProperties();
				if (configurationProperties[this.value.key].scope !== ConfigurationScope.RESOURCE) {
					throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_CONFIGURATION, this, this.contextService);
				}
			}
		}

		if (!this.resource) {
			throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_INVALID_FOLDER_TARGET, this, this.contextService);
		}
	}

	private async _resolve(): Promise<ITextModel> {
		const exists = await this.fileService.exists(this.resource);
		if (!exists) {
			await this.textFileService.write(this.resource, '{}', { encoding: 'utf8' });
		}
		const reference = this._register(await this.textModelResolverService.createModelReference(this.resource));
		return reference.object.textEditorModel;
	}
}

class UserConfigurationEditOperation extends ConfigurationEditOperation {

	private resolvePromise: Promise<ITextModel> | undefined = undefined;

	constructor(
		value: IConfigurationValue,
		jsonPath: json.JSONPath,
		@IUserDataService private readonly userDataService: IUserDataService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IWorkspaceContextService contextService: IWorkspaceContextService
	) {
		super(
			value,
			EditableConfigurationTarget.USER_LOCAL,
			jsonPath,
			null,
			undefined,
			contextService
		);
	}

	protected async save(model: ITextModel): Promise<void> {
		await this.userDataService.write(USER_CONFIGURATION_KEY, model.getValue());
	}

	protected validate(): void {
		// Any key must be a known setting from the registry
		const validKeys = this.configurationService.keys().default;
		if (validKeys.indexOf(this.value.key) < 0 && !OVERRIDE_PROPERTY_PATTERN.test(this.value.key)) {
			throw toConfigurationEditingError(ConfigurationEditingErrorCode.ERROR_UNKNOWN_KEY, this, this.contextService);
		}
	}

	protected resolve(): Promise<ITextModel> {
		if (!this.resolvePromise) {
			this.resolvePromise = this._resolve();
		}
		return this.resolvePromise;
	}

	private async _resolve(): Promise<ITextModel> {
		const content = (await this.userDataService.read(USER_CONFIGURATION_KEY)) || '{}';
		const languageIdentifier = this.modeService.getLanguageIdentifier('jsonc');
		const model = this.modelService.createModel(content, languageIdentifier ? { languageIdentifier, onDidChange: new Emitter<LanguageIdentifier>().event, dispose: () => { } } : null, this.configurationService.userSettingsResource.with({ scheme: Schemas.vscode }));
		this._register(toDisposable(() => {
			model.dispose();
			this.modelService.destroyModel(model.uri);
		}));
		return model;
	}
}

export class ConfigurationEditingService {

	public _serviceBrand: any;

	private queue: Queue<void>;
	private remoteSettingsResource: URI | null;

	constructor(
		@IWorkspaceContextService private readonly contextService: IWorkspaceContextService,
		@INotificationService private readonly notificationService: INotificationService,
		@IPreferencesService private readonly preferencesService: IPreferencesService,
		@IEditorService private readonly editorService: IEditorService,
		@IRemoteAgentService remoteAgentService: IRemoteAgentService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		this.queue = new Queue<void>();
		remoteAgentService.getEnvironment().then(environment => {
			if (environment) {
				this.remoteSettingsResource = environment.settingsPath;
			}
		});
	}

	writeConfiguration(target: EditableConfigurationTarget, value: IConfigurationValue, options: ConfigurationEditingOptions = {}): Promise<void> {
		return this.queue.queue(async () => {  // queue up writes to prevent race conditions
			const operation = this.getConfigurationEditOperation(target, value, options.scopes || {}, !(options.force || options.donotSave));
			try {
				await operation.apply(options.force || !options.donotSave);
				operation.dispose();
			} catch (error) {
				if (!options.donotNotifyError) {
					this.onError(error, operation, options.scopes);
				}
				return Promise.reject(error);
			}
		});
	}

	private onError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, scopes: IConfigurationOverrides | undefined): void {
		switch (error.code) {
			case ConfigurationEditingErrorCode.ERROR_INVALID_CONFIGURATION:
				this.onInvalidConfigurationError(error, operation);
				break;
			case ConfigurationEditingErrorCode.ERROR_CONFIGURATION_FILE_DIRTY:
				this.onConfigurationFileDirtyError(error, operation, scopes);
				break;
			default:
				this.notificationService.error(error.message);
		}
	}

	private onInvalidConfigurationError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, ): void {
		const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
			: operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
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

	private onConfigurationFileDirtyError(error: ConfigurationEditingError, operation: IConfigurationEditOperation, scopes: IConfigurationOverrides | undefined): void {
		const openStandAloneConfigurationActionLabel = operation.workspaceStandAloneConfigurationKey === TASKS_CONFIGURATION_KEY ? nls.localize('openTasksConfiguration', "Open Tasks Configuration")
			: operation.workspaceStandAloneConfigurationKey === LAUNCH_CONFIGURATION_KEY ? nls.localize('openLaunchConfiguration', "Open Launch Configuration")
				: null;
		if (openStandAloneConfigurationActionLabel) {
			this.notificationService.prompt(Severity.Error, error.message,
				[{
					label: nls.localize('saveAndRetry', "Save and Retry"),
					run: () => {
						const key = operation.value.key ? `${operation.workspaceStandAloneConfigurationKey}.${operation.value.key}` : operation.workspaceStandAloneConfigurationKey!;
						this.writeConfiguration(operation.target, { key, value: operation.value }, <ConfigurationEditingOptions>{ force: true, scopes });
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
					run: () => this.writeConfiguration(operation.target, { key: operation.value.key, value: operation.value }, <ConfigurationEditingOptions>{ force: true, scopes })
				},
				{
					label: nls.localize('open', "Open Settings"),
					run: () => this.openSettings(operation)
				}]
			);
		}
	}

	private openSettings(operation: IConfigurationEditOperation): void {
		switch (operation.target) {
			case EditableConfigurationTarget.USER_LOCAL:
				this.preferencesService.openGlobalSettings(true);
				break;
			case EditableConfigurationTarget.USER_REMOTE:
				this.preferencesService.openRemoteSettings();
				break;
			case EditableConfigurationTarget.WORKSPACE:
				this.preferencesService.openWorkspaceSettings(true);
				break;
			case EditableConfigurationTarget.WORKSPACE_FOLDER:
				if (operation.resource) {
					const workspaceFolder = this.contextService.getWorkspaceFolder(operation.resource);
					if (workspaceFolder) {
						this.preferencesService.openFolderSettings(workspaceFolder.uri, true);
					}
				}
				break;
		}
	}

	private openFile(resource: URI): void {
		this.editorService.openEditor({ resource });
	}

	private getConfigurationEditOperation(target: EditableConfigurationTarget, config: IConfigurationValue, overrides: IConfigurationOverrides, checkDirty: boolean): IConfigurationEditOperation {

		// Check for standalone workspace configurations
		if (config.key) {
			const standaloneConfigurationKeys = Object.keys(WORKSPACE_STANDALONE_CONFIGURATIONS);
			for (const key of standaloneConfigurationKeys) {
				const resource = this.getConfigurationFileResource(target, config, WORKSPACE_STANDALONE_CONFIGURATIONS[key], overrides.resource);

				// Check for prefix
				if (config.key === key) {
					const jsonPath = this.isWorkspaceConfigurationResource(resource) ? [key] : [];
					return this.instantiationService.createInstance(ResourceConfigurationEditOperation, { key: jsonPath[jsonPath.length - 1], value: config.value }, target, jsonPath, resource, key, checkDirty);
				}

				// Check for prefix.<setting>
				const keyPrefix = `${key}.`;
				if (config.key.indexOf(keyPrefix) === 0) {
					const jsonPath = this.isWorkspaceConfigurationResource(resource) ? [key, config.key.substr(keyPrefix.length)] : [config.key.substr(keyPrefix.length)];
					return this.instantiationService.createInstance(ResourceConfigurationEditOperation, { key: jsonPath[jsonPath.length - 1], value: config.value }, target, jsonPath, resource, key, checkDirty);
				}
			}
		}

		let key = config.key;
		let jsonPath = overrides.overrideIdentifier ? [keyFromOverrideIdentifier(overrides.overrideIdentifier), key] : [key];
		if (target === EditableConfigurationTarget.USER_LOCAL) {
			return this.instantiationService.createInstance(UserConfigurationEditOperation, { key, value: config.value }, jsonPath);
		}
		if (target === EditableConfigurationTarget.USER_REMOTE) {
			return this.instantiationService.createInstance(ResourceConfigurationEditOperation, { key, value: config.value }, target, jsonPath, withNullAsUndefined(this.getConfigurationFileResource(target, config, '', null)), undefined, checkDirty);
		}

		const resource = this.getConfigurationFileResource(target, config, FOLDER_SETTINGS_PATH, overrides.resource);
		if (this.isWorkspaceConfigurationResource(resource)) {
			jsonPath = ['settings', ...jsonPath];
		}
		return this.instantiationService.createInstance(ResourceConfigurationEditOperation, { key, value: config.value }, target, jsonPath, withNullAsUndefined(resource), undefined, checkDirty);
	}

	private isWorkspaceConfigurationResource(resource: URI | null): boolean {
		const workspace = this.contextService.getWorkspace();
		return !!(workspace.configuration && resource && workspace.configuration.fsPath === resource.fsPath);
	}

	private getConfigurationFileResource(target: EditableConfigurationTarget, config: IConfigurationValue, relativePath: string, resource: URI | null | undefined): URI | null {
		if (target === EditableConfigurationTarget.USER_LOCAL) {
			return null;
		}
		if (target === EditableConfigurationTarget.USER_REMOTE) {
			return this.remoteSettingsResource;
		}
		const workbenchState = this.contextService.getWorkbenchState();
		if (workbenchState !== WorkbenchState.EMPTY) {

			const workspace = this.contextService.getWorkspace();

			if (target === EditableConfigurationTarget.WORKSPACE) {
				if (workbenchState === WorkbenchState.WORKSPACE) {
					return withUndefinedAsNull(workspace.configuration);
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
