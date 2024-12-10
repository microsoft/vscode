/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct, equals as arrayEquals } from '../../../base/common/arrays.js';
import { Queue, RunOnceScheduler } from '../../../base/common/async.js';
import { VSBuffer } from '../../../base/common/buffer.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { JSONPath, ParseError, parse } from '../../../base/common/json.js';
import { applyEdits, setProperty } from '../../../base/common/jsonEdit.js';
import { Edit, FormattingOptions } from '../../../base/common/jsonFormatter.js';
import { Disposable, IDisposable } from '../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../base/common/map.js';
import { equals } from '../../../base/common/objects.js';
import { OS, OperatingSystem } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ConfigurationTarget, IConfigurationChange, IConfigurationChangeEvent, IConfigurationData, IConfigurationOverrides, IConfigurationService, IConfigurationUpdateOptions, IConfigurationUpdateOverrides, IConfigurationValue, isConfigurationOverrides, isConfigurationUpdateOverrides } from './configuration.js';
import { Configuration, ConfigurationChangeEvent, ConfigurationModel, UserSettings } from './configurationModels.js';
import { keyFromOverrideIdentifiers } from './configurationRegistry.js';
import { DefaultConfiguration, IPolicyConfiguration, NullPolicyConfiguration, PolicyConfiguration } from './configurations.js';
import { FileOperationError, FileOperationResult, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IPolicyService, NullPolicyService } from '../../policy/common/policy.js';

export class ConfigurationService extends Disposable implements IConfigurationService, IDisposable {

	declare readonly _serviceBrand: undefined;

	private configuration: Configuration;
	private readonly defaultConfiguration: DefaultConfiguration;
	private readonly policyConfiguration: IPolicyConfiguration;
	private readonly userConfiguration: UserSettings;
	private readonly reloadConfigurationScheduler: RunOnceScheduler;

	private readonly _onDidChangeConfiguration: Emitter<IConfigurationChangeEvent> = this._register(new Emitter<IConfigurationChangeEvent>());
	readonly onDidChangeConfiguration: Event<IConfigurationChangeEvent> = this._onDidChangeConfiguration.event;

	private readonly configurationEditing: ConfigurationEditing;

	constructor(
		private readonly settingsResource: URI,
		fileService: IFileService,
		policyService: IPolicyService,
		private readonly logService: ILogService,
	) {
		super();
		this.defaultConfiguration = this._register(new DefaultConfiguration(logService));
		this.policyConfiguration = policyService instanceof NullPolicyService ? new NullPolicyConfiguration() : this._register(new PolicyConfiguration(this.defaultConfiguration, policyService, logService));
		this.userConfiguration = this._register(new UserSettings(this.settingsResource, {}, extUriBiasedIgnorePathCase, fileService, logService));
		this.configuration = new Configuration(
			this.defaultConfiguration.configurationModel,
			this.policyConfiguration.configurationModel,
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			ConfigurationModel.createEmptyModel(logService),
			new ResourceMap<ConfigurationModel>(),
			ConfigurationModel.createEmptyModel(logService),
			new ResourceMap<ConfigurationModel>(),
			logService
		);
		this.configurationEditing = new ConfigurationEditing(settingsResource, fileService, this);

		this.reloadConfigurationScheduler = this._register(new RunOnceScheduler(() => this.reloadConfiguration(), 50));
		this._register(this.defaultConfiguration.onDidChangeConfiguration(({ defaults, properties }) => this.onDidDefaultConfigurationChange(defaults, properties)));
		this._register(this.policyConfiguration.onDidChangeConfiguration(model => this.onDidPolicyConfigurationChange(model)));
		this._register(this.userConfiguration.onDidChange(() => this.reloadConfigurationScheduler.schedule()));
	}

	async initialize(): Promise<void> {
		const [defaultModel, policyModel, userModel] = await Promise.all([this.defaultConfiguration.initialize(), this.policyConfiguration.initialize(), this.userConfiguration.loadConfiguration()]);
		this.configuration = new Configuration(
			defaultModel,
			policyModel,
			ConfigurationModel.createEmptyModel(this.logService),
			userModel,
			ConfigurationModel.createEmptyModel(this.logService),
			ConfigurationModel.createEmptyModel(this.logService),
			new ResourceMap<ConfigurationModel>(),
			ConfigurationModel.createEmptyModel(this.logService),
			new ResourceMap<ConfigurationModel>(),
			this.logService
		);
	}

	getConfigurationData(): IConfigurationData {
		return this.configuration.toData();
	}

	getValue<T>(): T;
	getValue<T>(section: string): T;
	getValue<T>(overrides: IConfigurationOverrides): T;
	getValue<T>(section: string, overrides: IConfigurationOverrides): T;
	getValue(arg1?: any, arg2?: any): any {
		const section = typeof arg1 === 'string' ? arg1 : undefined;
		const overrides = isConfigurationOverrides(arg1) ? arg1 : isConfigurationOverrides(arg2) ? arg2 : {};
		return this.configuration.getValue(section, overrides, undefined);
	}

	updateValue(key: string, value: any): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides): Promise<void>;
	updateValue(key: string, value: any, target: ConfigurationTarget): Promise<void>;
	updateValue(key: string, value: any, overrides: IConfigurationOverrides | IConfigurationUpdateOverrides, target: ConfigurationTarget, options?: IConfigurationUpdateOptions): Promise<void>;
	async updateValue(key: string, value: any, arg3?: any, arg4?: any, options?: any): Promise<void> {
		const overrides: IConfigurationUpdateOverrides | undefined = isConfigurationUpdateOverrides(arg3) ? arg3
			: isConfigurationOverrides(arg3) ? { resource: arg3.resource, overrideIdentifiers: arg3.overrideIdentifier ? [arg3.overrideIdentifier] : undefined } : undefined;

		const target: ConfigurationTarget | undefined = overrides ? arg4 : arg3;
		if (target !== undefined) {
			if (target !== ConfigurationTarget.USER_LOCAL && target !== ConfigurationTarget.USER) {
				throw new Error(`Unable to write ${key} to target ${target}.`);
			}
		}

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
			const existingOverrides = this.configuration.localUserConfiguration.overrides.find(override => arrayEquals([...override.identifiers].sort(), overrideIdentifiers));
			if (existingOverrides) {
				overrides.overrideIdentifiers = existingOverrides.identifiers;
			}
		}

		const path = overrides?.overrideIdentifiers?.length ? [keyFromOverrideIdentifiers(overrides.overrideIdentifiers), key] : [key];

		await this.configurationEditing.write(path, value);
		await this.reloadConfiguration();
	}

	inspect<T>(key: string, overrides: IConfigurationOverrides = {}): IConfigurationValue<T> {
		return this.configuration.inspect<T>(key, overrides, undefined);
	}

	keys(): {
		default: string[];
		user: string[];
		workspace: string[];
		workspaceFolder: string[];
	} {
		return this.configuration.keys(undefined);
	}

	async reloadConfiguration(): Promise<void> {
		const configurationModel = await this.userConfiguration.loadConfiguration();
		this.onDidChangeUserConfiguration(configurationModel);
	}

	private onDidChangeUserConfiguration(userConfigurationModel: ConfigurationModel): void {
		const previous = this.configuration.toData();
		const change = this.configuration.compareAndUpdateLocalUserConfiguration(userConfigurationModel);
		this.trigger(change, previous, ConfigurationTarget.USER);
	}

	private onDidDefaultConfigurationChange(defaultConfigurationModel: ConfigurationModel, properties: string[]): void {
		const previous = this.configuration.toData();
		const change = this.configuration.compareAndUpdateDefaultConfiguration(defaultConfigurationModel, properties);
		this.trigger(change, previous, ConfigurationTarget.DEFAULT);
	}

	private onDidPolicyConfigurationChange(policyConfiguration: ConfigurationModel): void {
		const previous = this.configuration.toData();
		const change = this.configuration.compareAndUpdatePolicyConfiguration(policyConfiguration);
		this.trigger(change, previous, ConfigurationTarget.DEFAULT);
	}

	private trigger(configurationChange: IConfigurationChange, previous: IConfigurationData, source: ConfigurationTarget): void {
		const event = new ConfigurationChangeEvent(configurationChange, { data: previous }, this.configuration, undefined, this.logService);
		event.source = source;
		this._onDidChangeConfiguration.fire(event);
	}
}

class ConfigurationEditing {

	private readonly queue: Queue<void>;

	constructor(
		private readonly settingsResource: URI,
		private readonly fileService: IFileService,
		private readonly configurationService: IConfigurationService,
	) {
		this.queue = new Queue<void>();
	}

	write(path: JSONPath, value: any): Promise<void> {
		return this.queue.queue(() => this.doWriteConfiguration(path, value)); // queue up writes to prevent race conditions
	}

	private async doWriteConfiguration(path: JSONPath, value: any): Promise<void> {
		let content: string;
		try {
			const fileContent = await this.fileService.readFile(this.settingsResource);
			content = fileContent.value.toString();
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult === FileOperationResult.FILE_NOT_FOUND) {
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

		await this.fileService.writeFile(this.settingsResource, VSBuffer.fromString(content));
	}

	private getEdits(content: string, path: JSONPath, value: any): Edit[] {
		const { tabSize, insertSpaces, eol } = this.formattingOptions;

		// With empty path the entire file is being replaced, so we just use JSON.stringify
		if (!path.length) {
			const content = JSON.stringify(value, null, insertSpaces ? ' '.repeat(tabSize) : '\t');
			return [{
				content,
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
			const configuredEol = this.configurationService.getValue('files.eol', { overrideIdentifier: 'jsonc' });
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
