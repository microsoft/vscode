/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../base/common/map.js';
import { URI } from '../../../../base/common/uri.js';
import { Queue } from '../../../../base/common/async.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { JSONPath, ParseError, parse } from '../../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../../base/common/jsonEdit.js';
import { Edit, FormattingOptions } from '../../../../base/common/jsonFormatter.js';
import { equals } from '../../../../base/common/objects.js';
import { distinct, equals as arrayEquals } from '../../../../base/common/arrays.js';
import { OS, OperatingSystem } from '../../../../base/common/platform.js';
import { IConfigurationChange, IConfigurationChangeEvent, IConfigurationData, IConfigurationOverrides, IConfigurationUpdateOptions, IConfigurationUpdateOverrides, IConfigurationValue, ConfigurationTarget, isConfigurationOverrides, isConfigurationUpdateOverrides } from '../../../../platform/configuration/common/configuration.js';
import { ConfigurationChangeEvent, ConfigurationModel } from '../../../../platform/configuration/common/configurationModels.js';
import { DefaultConfiguration, IPolicyConfiguration, NullPolicyConfiguration, PolicyConfiguration } from '../../../../platform/configuration/common/configurations.js';
import { Extensions, IConfigurationRegistry, keyFromOverrideIdentifiers } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IFileService, FileOperationError, FileOperationResult } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IPolicyService, NullPolicyService } from '../../../../platform/policy/common/policy.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { IWorkspaceContextService, IWorkspaceFoldersChangeEvent, IWorkspaceFolder, WorkbenchState, Workspace } from '../../../../platform/workspace/common/workspace.js';
import { FolderConfiguration, UserConfiguration } from '../../../../workbench/services/configuration/browser/configuration.js';
import { APPLICATION_SCOPES, APPLY_ALL_PROFILES_SETTING, FOLDER_CONFIG_FOLDER_NAME, FOLDER_SETTINGS_PATH, IWorkbenchConfigurationService, RestrictedSettings } from '../../../../workbench/services/configuration/common/configuration.js';
import { Configuration } from '../../../../workbench/services/configuration/common/configurationModels.js';
import { IUserDataProfileService } from '../../../../workbench/services/userDataProfile/common/userDataProfile.js';

// Import to register configuration contributions
import '../../../../workbench/services/configuration/browser/configurationService.js';

export class ConfigurationService extends Disposable implements IWorkbenchConfigurationService {

	declare readonly _serviceBrand: undefined;

	private _configuration: Configuration;
	private readonly defaultConfiguration: DefaultConfiguration;
	private readonly policyConfiguration: IPolicyConfiguration;
	private readonly userConfiguration: UserConfiguration;
	private readonly cachedFolderConfigs = this._register(new DisposableMap<URI, FolderConfiguration>(new ResourceMap()));

	private readonly _onDidChangeConfiguration = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	readonly onDidChangeRestrictedSettings = Event.None;
	readonly restrictedSettings: RestrictedSettings = { default: [] };

	private readonly configurationRegistry = Registry.as<IConfigurationRegistry>(Extensions.Configuration);

	private readonly settingsResource: URI;
	private readonly configurationEditing: ConfigurationEditing;

	constructor(
		userDataProfileService: IUserDataProfileService,
		private readonly workspaceService: IWorkspaceContextService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly fileService: IFileService,
		policyService: IPolicyService,
		private readonly logService: ILogService,
	) {
		super();

		this.settingsResource = userDataProfileService.currentProfile.settingsResource;
		this.defaultConfiguration = this._register(new DefaultConfiguration(logService));
		this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
		this.userConfiguration = this._register(new UserConfiguration(userDataProfileService.currentProfile.settingsResource, userDataProfileService.currentProfile.tasksResource, userDataProfileService.currentProfile.mcpResource, {}, fileService, uriIdentityService, logService));
		this.configurationEditing = new ConfigurationEditing(fileService, this);

		this._configuration = new Configuration(
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			new ResourceMap(),
			ConfigurationModel.createEmptyModel(logService),
			new ResourceMap<ConfigurationModel>(),
			this.workspaceService.getWorkspace() as Workspace,
			this.logService
		);

		this._register(this.defaultConfiguration.onDidChangeConfiguration(({ defaults, properties }) => this.onDefaultConfigurationChanged(defaults, properties)));
		this._register(this.policyConfiguration.onDidChangeConfiguration(configurationModel => this.onPolicyConfigurationChanged(configurationModel)));
		this._register(this.userConfiguration.onDidChangeConfiguration(userConfiguration => this.onUserConfigurationChanged(userConfiguration)));
		this._register(this.workspaceService.onWillChangeWorkspaceFolders(e => e.join(this.loadFolderConfigurations(e.changes.added))));
		this._register(this.workspaceService.onDidChangeWorkspaceFolders(e => this.onWorkspaceFoldersChanged(e)));
	}

	async initialize(): Promise<void> {
		const [defaultModel, policyModel, userModel] = await Promise.all([
			this.defaultConfiguration.initialize(),
			this.policyConfiguration.initialize(),
			this.userConfiguration.initialize()
		]);
		const workspace = this.workspaceService.getWorkspace() as Workspace;
		this._configuration = new Configuration(
			defaultModel,
			policyModel,
			ConfigurationModel.createEmptyModel(this.logService),
			userModel,
			ConfigurationModel.createEmptyModel(this.logService),
			ConfigurationModel.createEmptyModel(this.logService),
			new ResourceMap(),
			ConfigurationModel.createEmptyModel(this.logService),
			new ResourceMap<ConfigurationModel>(),
			workspace,
			this.logService
		);
		await this.loadFolderConfigurations(workspace.folders);
	}

	// #region IWorkbenchConfigurationService

	getConfigurationData(): IConfigurationData {
		return this._configuration.toData();
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: unknown, arg2?: unknown): unknown {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : undefined;
		return this._configuration.getValue(section, overrides);
	}

	updateValue(key: string, value: unknown): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	updateValue(key: string, value: unknown, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: unknown, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	async updateValue(key: string, value: unknown, arg3?: unknown, arg4?: unknown, _options?: IConfigurationUpdateOptions): Promise<void> {
		const overrides: IConfigurationUpdateOverrides | undefined = isConfigurationUpdateOverrides(arg3) ? arg3
			: isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : undefined } : undefined;
		const target: ConfigurationTarget | undefined = (overrides ? arg4 : arg3) as ConfigurationTarget | undefined;

		if (overrides?.overrideIdentifiers) {
			overrides.overrideIdentifiers = distinct(overrides.overrideIdentifiers);
			overrides.overrideIdentifiers = overrides.overrideIdentifiers.length ? overrides.overrideIdentifiers : undefined;
		}

		const inspect = this.inspect(key, { resource: overrides?.resource, overrideIdentifier: overrides?.overrideIdentifiers ? overrides.overrideIdentifiers[0] : undefined });
		if (inspect.policyValue !== undefined) {
			throw new Error(`Unable to write ${key} because it is configured in system policy.`);
		}

		// Remove the setting, if the value is same as default value
		if (equals(value, inspect.defaultValue)) {
			value = undefined;
		}

		if (overrides?.overrideIdentifiers?.length && overrides.overrideIdentifiers.length > 1) {
			const overrideIdentifiers = overrides.overrideIdentifiers.sort();
			const existingOverrides = this._configuration.localUserConfiguration.overrides.find(override => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
			if (existingOverrides) {
				overrides.overrideIdentifiers = existingOverrides.identifiers;
			}
		}

		const path = overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];

		const settingsResource = this.getSettingsResource(target, overrides?.resource ?? undefined);
		await this.configurationEditing.write(settingsResource, path, value);
		await this.reloadConfiguration();
	}

	private getSettingsResource(target: ConfigurationTarget | undefined, resource: URI | undefined): URI {
		if (target === ConfigurationTarget.WORKSPACE_FOLDER || target === ConfigurationTarget.WORKSPACE) {
			if (resource) {
				const folder = this.workspaceService.getWorkspaceFolder(resource);
				if (folder) {
					return this.uriIdentityService.extUri.joinPath(folder.uri, FOLDER_SETTINGS_PATH);
				}
			}
		}
		return this.settingsResource;
	}

	inspect<T>(key: string, overrides?: IConfigurationOverrides): IConfigurationValue<T> {
		return this._configuration.inspect<T>(key, overrides);
	}

	keys(): { default: string[]; policy: string[]; user: string[]; workspace: string[]; workspaceFolder: string[] } {
		return this._configuration.keys();
	}

	async reloadConfiguration(_target?: ConfigurationTarget | IWorkspaceFolder): Promise<void> {
		const userModel = await this.userConfiguration.initialize();
		const previousData = this._configuration.toData();
		const change = this._configuration.compareAndUpdateLocalUserConfiguration(userModel);

		// Reload folder configurations
		for (const folder of this.workspaceService.getWorkspace().folders) {
			const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
			if (folderConfiguration) {
				const folderModel = await folderConfiguration.loadConfiguration();
				const folderChange = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, folderModel);
				change.keys.push(...folderChange.keys);
				change.overrides.push(...folderChange.overrides);
			}
		}

		this.triggerConfigurationChange(change, previousData, ConfigurationTarget.USER);
	}

	hasCachedConfigurationDefaultsOverrides(): boolean {
		return false;
	}

	async whenRemoteConfigurationLoaded(): Promise<void> { }

	isSettingAppliedForAllProfiles(key: string): boolean {
		const scope = this.configurationRegistry.getConfigurationProperties()[key]?.scope;
		if (scope && APPLICATION_SCOPES.includes(scope)) {
			return true;
		}
		const allProfilesSettings = this.getValue<string[]>(APPLY_ALL_PROFILES_SETTING) ?? [];
		return Array.isArray(allProfilesSettings) && allProfilesSettings.includes(key);
	}

	// #endregion

	// #region Configuration change handlers

	private onDefaultConfigurationChanged(defaults: ConfigurationModel, properties?: string[]): void {
		const previousData = this._configuration.toData();
		const change = this._configuration.compareAndUpdateDefaultConfiguration(defaults, properties);
		this._configuration.updateLocalUserConfiguration(this.userConfiguration.reparse());
		for (const folder of this.workspaceService.getWorkspace().folders) {
			const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
			if (folderConfiguration) {
				this._configuration.updateFolderConfiguration(folder.uri, folderConfiguration.reparse());
			}
		}
		this.triggerConfigurationChange(change, previousData, ConfigurationTarget.DEFAULT);
	}

	private onPolicyConfigurationChanged(policyConfiguration: ConfigurationModel): void {
		const previousData = this._configuration.toData();
		const change = this._configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
		this.triggerConfigurationChange(change, previousData, ConfigurationTarget.DEFAULT);
	}

	private onUserConfigurationChanged(userConfiguration: ConfigurationModel): void {
		const previousData = this._configuration.toData();
		const change = this._configuration.compareAndUpdateLocalUserConfiguration(userConfiguration);
		this.triggerConfigurationChange(change, previousData, ConfigurationTarget.USER);
	}

	private onWorkspaceFoldersChanged(e: IWorkspaceFoldersChangeEvent): void {
		// Remove configurations for removed folders
		const previousData = this._configuration.toData();
		const keys: string[] = [];
		const overrides: [string, string[]][] = [];
		for (const folder of e.removed) {
			const change = this._configuration.compareAndDeleteFolderConfiguration(folder.uri);
			keys.push(...change.keys);
			overrides.push(...change.overrides);
			this.cachedFolderConfigs.deleteAndDispose(folder.uri);
		}
		if (keys.length || overrides.length) {
			this.triggerConfigurationChange({ keys, overrides }, previousData, ConfigurationTarget.WORKSPACE_FOLDER);
		}
	}

	private onWorkspaceFolderConfigurationChanged(folder: IWorkspaceFolder): void {
		const folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
		if (folderConfiguration) {
			folderConfiguration.loadConfiguration().then(configurationModel => {
				const previousData = this._configuration.toData();
				const change = this._configuration.compareAndUpdateFolderConfiguration(folder.uri, configurationModel);
				this.triggerConfigurationChange(change, previousData, ConfigurationTarget.WORKSPACE_FOLDER);
			}, onUnexpectedError);
		}
	}

	private async loadFolderConfigurations(folders: readonly IWorkspaceFolder[]): Promise<void> {
		for (const folder of folders) {
			let folderConfiguration = this.cachedFolderConfigs.get(folder.uri);
			if (!folderConfiguration) {
				folderConfiguration = new FolderConfiguration(false, folder, FOLDER_CONFIG_FOLDER_NAME, WorkbenchState.WORKSPACE, true, this.fileService, this.uriIdentityService, this.logService, { needsCaching: () => false, read: async () => '', write: async () => { }, remove: async () => { } });
				folderConfiguration.addRelated(folderConfiguration.onDidChange(() => this.onWorkspaceFolderConfigurationChanged(folder)));
				this.cachedFolderConfigs.set(folder.uri, folderConfiguration);
			}
			const configurationModel = await folderConfiguration.loadConfiguration();
			this._configuration.updateFolderConfiguration(folder.uri, configurationModel);
		}
	}

	private triggerConfigurationChange(change: IConfigurationChange, previousData: IConfigurationData, target: ConfigurationTarget): void {
		if (change.keys.length) {
			const workspace = this.workspaceService.getWorkspace() as Workspace;
			const event = new ConfigurationChangeEvent(change, { data: previousData, workspace }, this._configuration, workspace, this.logService);
			event.source = target;
			this._onDidChangeConfiguration.fire(event);
		}
	}

	// #endregion
}

class ConfigurationEditing {

	private readonly queue = new Queue<void>();

	constructor(
		private readonly fileService: IFileService,
		private readonly configurationService: ConfigurationService,
	) { }

	write(settingsResource: URI, path: JSONPath, value: unknown): Promise<void> {
		return this.queue.queue(() => this.doWriteConfiguration(settingsResource, path, value));
	}

	private async doWriteConfiguration(settingsResource: URI, path: JSONPath, value: unknown): Promise<void> {
		let content: string;
		try {
			const fileContent = await this.fileService.readFile(settingsResource);
			content = fileContent.value.toString();
		} catch (error) {
			if ((error as FileOperationError).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
				content = '{}';
			} else {
				throw error;
			}
		}

		const parseErrors: ParseError[] = [];
		parse(content, parseErrors, { allowTrailingComma: true, allowEmptyContent: true });
		if (parseErrors.length > 0) {
			throw new Error('Unable to write into the settings file. Please open the file to correct errors/warnings in the file and try again.');
		}

		const edits = this.getEdits(content, path, value);
		content = applyEdits(content, edits);

		await this.fileService.writeFile(settingsResource, VSBuffer.fromString(content));
	}

	private getEdits(content: string, path: JSONPath, value: unknown): Edit[] {
		const { tabSize, insertSpaces, eol } = this.formattingOptions;

		if (!path.length) {
			const newContent = JSON.stringify(value, null, insertSpaces ? ' '.repeat(tabSize) : '\t');
			return [{
				content: newContent,
				length: content.length,
				offset: 0
			}];
		}

		return setProperty(content, path, value, { tabSize, insertSpaces, eol });
	}

	private _formattingOptions: Required<FormattingOptions> | undefined;
	private get formattingOptions(): Required<FormattingOptions> {
		if (!this._formattingOptions) {
			let eol = OS === OperatingSystem.Linux || OS === OperatingSystem.Macintosh ? '\n' : '\r\n';
			const configuredEol = this.configurationService.getValue<string>('files.eol', { overrideIdentifier: 'jsonc' });
			if (configuredEol && typeof configuredEol === 'string' && configuredEol !== 'auto') {
				eol = configuredEol;
			}
			this._formattingOptions = {
				eol,
				insertSpaces: !!this.configurationService.getValue('editor.insertSpaces', { overrideIdentifier: 'jsonc' }),
				tabSize: this.configurationService.getValue('editor.tabSize', { overrideIdentifier: 'jsonc' })
			};
		}
		return this._formattingOptions;
	}
}
