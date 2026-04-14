/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ConfigurationChangeEvent, ConfigurationScope } from 'vscode';
import { createServiceIdentifier } from '../../../util/common/services';
import { BugIndicatingError } from '../../../util/vs/base/common/errors';
import { Emitter, Event } from '../../../util/vs/base/common/event';
import { Disposable } from '../../../util/vs/base/common/lifecycle';
import * as objects from '../../../util/vs/base/common/objects';
import { IObservable, observableFromEventOpts } from '../../../util/vs/base/common/observable';
import * as types from '../../../util/vs/base/common/types';
import { ICopilotTokenStore } from '../../authentication/common/copilotTokenStore';
import { packageJson } from '../../env/common/packagejson';
import { ImportChanges } from '../../inlineEdits/common/dataTypes/importFilteringOptions';
import { JointCompletionsProviderStrategy, JointCompletionsProviderTriggerChangeStrategy } from '../../inlineEdits/common/dataTypes/jointCompletionsProviderOptions';
import { NextCursorLinePredictionCursorPlacement } from '../../inlineEdits/common/dataTypes/nextCursorLinePrediction';
import * as triggerOptions from '../../inlineEdits/common/dataTypes/triggerOptions';
import * as xtabHistoryOptions from '../../inlineEdits/common/dataTypes/xtabHistoryOptions';
import * as xtabPromptOptions from '../../inlineEdits/common/dataTypes/xtabPromptOptions';
import { LANGUAGE_CONTEXT_ENABLED_LANGUAGES, LanguageContextLanguages, SpeculativeRequestsAutoExpandEditWindowLines, SpeculativeRequestsCursorPlacement, SpeculativeRequestsEnablement } from '../../inlineEdits/common/dataTypes/xtabPromptOptions';
import { ResponseProcessor } from '../../inlineEdits/common/responseProcessor';
import { FetcherId } from '../../networking/common/fetcherService';
import { AlternativeNotebookFormat } from '../../notebook/common/alternativeContentFormat';
import { IExperimentationService } from '../../telemetry/common/nullExperimentationService';
import { IValidator, vBoolean, vNumber, vString } from './validator';

export const CopilotConfigPrefix = 'github.copilot';

export const IConfigurationService = createServiceIdentifier<IConfigurationService>('IConfigurationService');

export type ExperimentBasedConfigType = boolean | number | (string | undefined);

export interface InspectConfigResult<T> {

	/**
	 * The default value which is used when no other value is defined
	 */
	defaultValue?: T;

	/**
	 * The global or installation-wide value.
	 */
	globalValue?: T;

	/**
	 * The workspace-specific value.
	 */
	workspaceValue?: T;

	/**
	 * The workspace-folder-specific value.
	 */
	workspaceFolderValue?: T;

	/**
	 * Language specific default value when this configuration value is created for a {@link ConfigurationScope language scope}.
	 */
	defaultLanguageValue?: T;

	/**
	 * Language specific global value when this configuration value is created for a {@link ConfigurationScope language scope}.
	 */
	globalLanguageValue?: T;

	/**
	 * Language specific workspace value when this configuration value is created for a {@link ConfigurationScope language scope}.
	 */
	workspaceLanguageValue?: T;

	/**
	 * Language specific workspace-folder value when this configuration value is created for a {@link ConfigurationScope language scope}.
	 */
	workspaceFolderLanguageValue?: T;

	/**
	 * All language identifiers for which this configuration is defined.
	 */
	languageIds?: string[];
}

export interface IConfigurationService {

	readonly _serviceBrand: undefined;

	/**
	 * Gets user configuration for a key from vscode (which if not defined, pulls default value from package.json).
	 * If not defined, returns the default value.
	 *
	 * @remark For object values, the user config will replace the default config.
	 */
	getConfig<T>(key: Config<T>, scope?: ConfigurationScope): T;

	/**
	 * Gets an observable for the configuration of a key from vscode (which if not defined, pulls default value from package.json).
	 * If not defined, returns the default value.
	 *
	 * @remark For object values, the user config will replace the default config.
	 */
	getConfigObservable<T>(key: Config<T>): IObservable<T>;

	/**
	 * Retrieve all information about a configuration setting. A configuration value
	 * often consists of a *default* value, a global or installation-wide value,
	 * a workspace-specific value and folder-specific value
	 * @param configKey The config key to look up
	 * @returns Information about a configuration setting or `undefined`.
	 */
	inspectConfig<T>(key: BaseConfig<T>, scope?: ConfigurationScope): InspectConfigResult<T> | undefined;

	/**
	 * Checks if the key is configured by the user in any of the configuration scopes.
	 */
	isConfigured<T>(key: BaseConfig<T>, scope?: ConfigurationScope): boolean;

	/**
	 * Proxies vscode.workspace.getConfiguration to allow getting a configuration value that is not in the Copilot namespace.
	 * @param configKey The config key to look up
	 */
	getNonExtensionConfig<T>(configKey: string): T | undefined;

	/**
	 * Sets user configuration for a key in vscode.
	 */
	setConfig<T>(key: BaseConfig<T>, value: T): Thenable<void>;

	/**
	 * Gets user configuration for a key from vscode (which if not defined, pulls default value from package.json).
	 * If not defined, returns the experimentation based value or falls back to the default value.
	 *
	 * @remark For object values, the user config will replace the default config.
	 */
	getExperimentBasedConfig<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService, scope?: ConfigurationScope): T;

	/**
	 * Gets the observable of a user configuration for a key from vscode (which if not defined, pulls default value from package.json).
	 * If not defined, returns the experimentation based value or falls back to the default value.
	 *
	 * @remark For object values, the user config will replace the default config.
	 */
	getExperimentBasedConfigObservable<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService): IObservable<T>;

	/**
	 * For object values, the user config will be mixed in with the default config.
	 */
	getConfigMixedWithDefaults<T>(key: Config<T>): T;

	getDefaultValue<T>(key: Config<T>): T;
	getDefaultValue<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>): T;

	/**
	 * Emitted whenever a configuration value changes.
	 * This emits for all changes, not just changes to the Copilot settings.
	 */
	onDidChangeConfiguration: Event<ConfigurationChangeEvent>;


	/**
	 * Called by experimentation service to trigger updates to ExP based configurations
	 *
	 * @param treatments List of treatments that have been changed
	 */
	updateExperimentBasedConfiguration(treatments: string[]): void;

	dumpConfig(): { [key: string]: string };
}



export abstract class AbstractConfigurationService extends Disposable implements IConfigurationService {
	declare readonly _serviceBrand: undefined;

	protected _onDidChangeConfiguration = this._register(new Emitter<ConfigurationChangeEvent>());
	readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

	protected _isInternal: boolean = false;

	constructor(copilotTokenStore?: ICopilotTokenStore) {
		super();
		if (copilotTokenStore) {
			this._register(copilotTokenStore.onDidStoreUpdate(() => {
				this._setUserInfo({
					isInternal: !!copilotTokenStore.copilotToken?.isInternal
				});
			}));
		}
	}

	getConfigMixedWithDefaults<T>(key: Config<T>): T {
		if (key.options?.valueIgnoredForExternals && !this._isInternal) {
			return this.getDefaultValue(key);
		}

		const userValue = this.getConfig(key);

		// if user doesn't override the setting, return the default
		if (userValue === undefined) {
			return this.getDefaultValue(key);
		}

		// if user overrides the setting and the setting is an object, combine default with user value, with the preference to user settings
		if (types.isObject(userValue) && types.isObject(key.defaultValue)) {
			// If default is an object apply the default and then apply the setting
			return { ...key.defaultValue, ...userValue };
		}

		return userValue;
	}

	public getDefaultValue<T>(key: BaseConfig<T>): T {
		const defaultValueFromConfig = this.getDefaultValueForConfig(key);

		// Preserve legacy behavior for settings whose code default is undefined.
		// VS Code may return type-default sentinels (false/0/''/null/undefined) from inspect().defaultValue,
		// which should not override an intentional undefined default in code.
		const isTypeDefaultSentinel = defaultValueFromConfig === undefined || defaultValueFromConfig === null || defaultValueFromConfig === false || defaultValueFromConfig === 0 || defaultValueFromConfig === '';
		if (key.defaultValue === undefined && isTypeDefaultSentinel) {
			return key.defaultValue;
		}

		if (defaultValueFromConfig !== undefined) {
			return defaultValueFromConfig;
		}

		return key.defaultValue;
	}

	protected _setUserInfo(userInfo: { isInternal: boolean }): void {
		if (this._isInternal === userInfo.isInternal) {
			// no change
			return;
		}

		const internalChanged = this._isInternal !== userInfo.isInternal;

		this._isInternal = userInfo.isInternal;

		// collect potential affected settings
		const potentialAffectedKeys = new Set<string>();
		for (const config of globalConfigRegistry.configs.values()) {
			if (internalChanged && config.options?.valueIgnoredForExternals) {
				potentialAffectedKeys.add(config.fullyQualifiedId);
			}
		}

		if (potentialAffectedKeys.size > 0) {
			// fire a fake change event to refresh potential affected settings
			this._onDidChangeConfiguration.fire({
				affectsConfiguration: (section) => {
					// Check for exact match or prefix match with dot separator
					for (const key of potentialAffectedKeys) {
						if (key === section || key.startsWith(section + '.') || section.startsWith(key + '.')) {
							return true;
						}
					}
					return false;
				}
			});
		}
	}

	abstract getConfig<T>(key: Config<T>, scope?: ConfigurationScope): T;
	abstract inspectConfig<T>(key: BaseConfig<T>, scope?: ConfigurationScope): InspectConfigResult<T> | undefined;
	abstract getNonExtensionConfig<T>(configKey: string): T | undefined;
	abstract setConfig<T>(key: BaseConfig<T>, value: T): Thenable<void>;
	abstract getExperimentBasedConfig<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService): T;
	abstract dumpConfig(): { [key: string]: string };
	public updateExperimentBasedConfiguration(treatments: string[]): void {
		if (treatments.length === 0) {
			return;
		}
		this._onDidChangeConfiguration.fire({ affectsConfiguration: () => true });
	}

	public getConfigObservable<T>(key: Config<T>): IObservable<T> {
		return this._getObservable_$show2FramesUp(key, () => this.getConfig(key));
	}

	public getExperimentBasedConfigObservable<T extends ExperimentBasedConfigType>(key: ExperimentBasedConfig<T>, experimentationService: IExperimentationService): IObservable<T> {
		return this._getObservable_$show2FramesUp(key, () => this.getExperimentBasedConfig(key, experimentationService));
	}

	private observables = new Map<string, IObservable<any>>();

	private _getObservable_$show2FramesUp<T>(key: BaseConfig<T>, getValue: () => T): IObservable<T> {
		let observable = this.observables.get(key.id);
		if (!observable) {
			observable = observableFromEventOpts(
				{ debugName: () => `Configuration Key "${key.id}"` },
				(handleChange) => this._register(this.onDidChangeConfiguration(e => {
					if (e.affectsConfiguration(key.fullyQualifiedId)) {
						handleChange(e);
					}
				})),
				getValue
			);
			this.observables.set(key.id, observable);
		}
		return observable;
	}

	/**
	 * Checks if the key is configured by the user in any of the configuration scopes.
	 */
	public isConfigured<T>(key: BaseConfig<T>, scope?: ConfigurationScope): boolean {
		const inspect = this.inspectConfig<T>(key, scope);
		const isConfigured = (
			inspect?.globalValue !== undefined
			|| inspect?.globalLanguageValue !== undefined
			|| inspect?.workspaceFolderValue !== undefined
			|| inspect?.workspaceFolderLanguageValue !== undefined
			|| inspect?.workspaceValue !== undefined
			|| inspect?.workspaceLanguageValue !== undefined
		);
		return isConfigured;
	}

	protected getDefaultValueForConfig<T>(key: BaseConfig<T>): T | undefined {
		return undefined;
	}

}

export interface BaseConfig<T> {
	/**
	 * Key as it appears in settings.json minus the "github.copilot." prefix.
	 * e.g. "advanced.debug.overrideProxyUrl"
	 */
	readonly id: string;

	/**
	 * The old key as it appears in settings.json minus the "github.copilot." prefix.
	 */
	readonly oldId?: string;

	/**
	 * This setting is present in package.json and is visible to the general public.
	 */
	readonly isPublic: boolean;

	/**
	 * The fully qualified id, e.g. "github.copilot.advanced.debug.overrideProxyUrl".
	 * Use this with `affectsConfiguration` from the ConfigurationChangeEvent
	 */
	readonly fullyQualifiedId: string;

	/**
	 * The fully qualified old id, e.g. "github.copilot.advanced.debug.overrideProxyUrl".
	 */
	readonly fullyQualifiedOldId?: string | undefined;

	/**
	 * The `X` in `github.copilot.advanced.X` settings.
	 */
	readonly advancedSubKey: string | undefined;

	/**
	 * The default value (defined either in code for hidden settings, or in package.json for non-hidden settings)
	 */
	readonly defaultValue: T;

	/**
	 * Setting options
	 */
	readonly options?: ConfigOptions;

	readonly validator?: IValidator<T>;
}

export const enum ConfigType {
	Simple,
	ExperimentBased
}

export interface ConfigOptions {
	readonly oldKey?: string;
	readonly valueIgnoredForExternals?: boolean;
}

export interface Config<T> extends BaseConfig<T> {
	readonly configType: ConfigType.Simple;
}

export interface ExperimentBasedConfig<T extends ExperimentBasedConfigType> extends BaseConfig<T> {
	readonly configType: ConfigType.ExperimentBased;
	readonly experimentName: string | undefined;
}

let packageJsonDefaults: Map<string, any> | undefined = undefined;
function getPackageJsonDefaults(): Map<string, any> {
	if (!packageJsonDefaults) {
		packageJsonDefaults = new Map<string, any>();

		// Use the information in packageJson
		const config = packageJson.contributes.configuration;
		const propertyGroups = config.map((c) => c.properties);
		const configProps = Object.assign({}, ...propertyGroups);
		for (const key in configProps) {
			packageJsonDefaults.set(key, configProps[key].default);
		}
	}
	return packageJsonDefaults;
}

function toBaseConfig<T>(key: string, defaultValue: T, options: ConfigOptions | undefined): BaseConfig<T> {
	const fullyQualifiedId = `${CopilotConfigPrefix}.${key}`;
	const fullyQualifiedOldId = options?.oldKey ? `${CopilotConfigPrefix}.${options.oldKey}` : undefined;
	const packageJsonDefaults = getPackageJsonDefaults();
	const isPublic = packageJsonDefaults.has(fullyQualifiedId);
	const packageJsonDefaultValue = packageJsonDefaults.get(fullyQualifiedId);
	if (isPublic) {
		// make sure the default in the code matches the default in packageJson
		if (!objects.equals(defaultValue, packageJsonDefaultValue)) {
			throw new BugIndicatingError(`The default value for setting ${key} is different in packageJson and in code`);
		}
	}
	if (isPublic && options?.valueIgnoredForExternals) {
		throw new BugIndicatingError(`The setting ${key} is public, it therefore cannot be restricted to internal!`);
	}
	const advancedSubKey = fullyQualifiedId.startsWith('github.copilot.advanced.') ? fullyQualifiedId.substring('github.copilot.advanced.'.length) : undefined;
	return { id: key, oldId: options?.oldKey, isPublic, fullyQualifiedId, fullyQualifiedOldId, advancedSubKey, defaultValue, options };
}

class ConfigRegistry {
	/**
	 * A map of all registered configs, keyed by their full id, eg `github.copilot.advanced.debug.overrideProxyUrl`.
	 */
	public readonly configs: Map<string, Config<any> | ExperimentBasedConfig<any>> = new Map();

	registerConfig(config: Config<any> | ExperimentBasedConfig<any>): void {
		this.configs.set(config.fullyQualifiedId, config);
	}
}

export const globalConfigRegistry = new ConfigRegistry();

// Configuration Migration Types and Registry
export type ConfigurationValue = { value: any | undefined /* Remove */ };
export type ConfigurationKeyValuePairs = [string, ConfigurationValue][];
export type ConfigurationMigrationFn = (value: any) => ConfigurationValue | ConfigurationKeyValuePairs | Promise<ConfigurationValue | ConfigurationKeyValuePairs>;
export type ConfigurationMigration = { key: string; migrateFn: ConfigurationMigrationFn };

export interface IConfigurationMigrationRegistry {
	registerConfigurationMigrations(configurationMigrations: ConfigurationMigration[]): void;
}

class ConfigurationMigrationRegistryImpl implements IConfigurationMigrationRegistry {
	readonly migrations: ConfigurationMigration[] = [];

	private readonly _onDidRegisterConfigurationMigrations = new Emitter<ConfigurationMigration[]>();
	readonly onDidRegisterConfigurationMigration = this._onDidRegisterConfigurationMigrations.event;

	registerConfigurationMigrations(configurationMigrations: ConfigurationMigration[]): void {
		this.migrations.push(...configurationMigrations);
		this._onDidRegisterConfigurationMigrations.fire(configurationMigrations);
	}
}

export const ConfigurationMigrationRegistry = new ConfigurationMigrationRegistryImpl();

function defineSetting<T>(key: string, configType: ConfigType.Simple, defaultValue: T, validator?: IValidator<T>, options?: ConfigOptions): Config<T>;
function defineSetting<T extends ExperimentBasedConfigType>(key: string, configType: ConfigType.ExperimentBased, defaultValue: T, validator?: IValidator<T>, options?: ConfigOptions, expOptions?: { experimentName?: string }): ExperimentBasedConfig<T>;
function defineSetting<T extends ExperimentBasedConfigType>(key: string, configType: ConfigType, defaultValue: T, validator?: IValidator<T>, options?: ConfigOptions, expOptions?: { experimentName?: string }): Config<T> | ExperimentBasedConfig<T> {
	if (configType === ConfigType.ExperimentBased) {
		const value: ExperimentBasedConfig<T> = { ...toBaseConfig(key, defaultValue, options), configType: ConfigType.ExperimentBased, experimentName: expOptions?.experimentName, validator };
		if (value.advancedSubKey) {
			// This is a `github.copilot.advanced.*` setting
			throw new BugIndicatingError('Shared settings cannot be experiment based');
		}
		globalConfigRegistry.registerConfig(value);
		return value;
	}

	const value: Config<T> = { ...toBaseConfig(key, defaultValue, options), configType: ConfigType.Simple, validator };
	globalConfigRegistry.registerConfig(value);
	return value;
}

function defineTeamInternalSetting<T>(key: string, configType: ConfigType.Simple, defaultValue: T, validator?: IValidator<T>, options?: ConfigOptions): Config<T>;
function defineTeamInternalSetting<T extends ExperimentBasedConfigType>(key: string, configType: ConfigType.ExperimentBased, defaultValue: T, validator?: IValidator<T>, options?: ConfigOptions, expOptions?: { experimentName?: string }): ExperimentBasedConfig<T>;
function defineTeamInternalSetting<T extends ExperimentBasedConfigType>(key: string, configType: ConfigType, defaultValue: T, validator?: IValidator<T>, options?: ConfigOptions, expOptions?: { experimentName?: string }): Config<T> | ExperimentBasedConfig<T> {
	options = { ...options, valueIgnoredForExternals: true };
	return configType === ConfigType.Simple ? defineSetting(key, configType, defaultValue, validator, options) : defineSetting(key, configType, defaultValue, validator, options, expOptions);
}

function migrateSetting(newKey: string, oldKey: string): void {
	ConfigurationMigrationRegistry.registerConfigurationMigrations([{
		key: `${CopilotConfigPrefix}.${oldKey}`,
		migrateFn: async (migrationValue: any) => {
			return [
				[`${CopilotConfigPrefix}.${newKey}`, { value: migrationValue }],
				[`${CopilotConfigPrefix}.${oldKey}`, { value: undefined }]
			];
		}
	}]);
}

function defineAndMigrateSetting<T>(oldKey: string, newKey: string, defaultValue: T, options?: ConfigOptions): Config<T> {
	migrateSetting(newKey, oldKey);
	return defineSetting(newKey, ConfigType.Simple, defaultValue, undefined, { ...options, oldKey });
}

function defineAndMigrateExpSetting<T extends ExperimentBasedConfigType>(oldKey: string, newKey: string, defaultValue: T, options?: ConfigOptions, expOptions?: { experimentName?: string }): ExperimentBasedConfig<T> {
	migrateSetting(newKey, oldKey);
	return defineSetting(newKey, ConfigType.ExperimentBased, defaultValue, undefined, { ...options, oldKey }, expOptions);
}

// Max CAPI tool count limit
export const HARD_TOOL_LIMIT = 128;

// WARNING
// These values are used in the request and are case sensitive. Do not change them unless advised by CAPI.
// It is also not recommended to use this as a type as it will never be an exhaustive list
export const enum CHAT_MODEL {
	GPT41 = 'gpt-4.1-2025-04-14',
	GPT4OMINI = 'gpt-4o-mini',
	NES_XTAB = 'copilot-nes-xtab', // xtab model hosted in prod in proxy
	CUSTOM_NES = 'custom-nes',
	XTAB_4O_MINI_FINETUNED = 'xtab-4o-mini-finetuned',
	GPT4OPROXY = 'gpt-4o-instant-apply-full-ft-v66',
	SHORT_INSTANT_APPLY = 'gpt-4o-instant-apply-full-ft-v66-short',
	CLAUDE_SONNET = 'claude-3.5-sonnet',
	CLAUDE_37_SONNET = 'claude-3.7-sonnet',
	DEEPSEEK_CHAT = 'deepseek-chat',
	GEMINI_25_PRO = 'gemini-2.5-pro',
	GEMINI_20_PRO = 'gemini-2.0-pro-exp-02-05',
	GEMINI_FLASH = 'gemini-2.0-flash-001',
	O1 = 'o1',
	O3MINI = 'o3-mini',
	O1MINI = 'o1-mini',
	// A placeholder model that is used for just quickly testing new Azure endpoints.
	// This model is not intended to be used for any real work.
	EXPERIMENTAL = 'experimental-01'
}

export enum AuthProviderId {
	GitHub = 'github',
	GitHubEnterprise = 'github-enterprise',
	Microsoft = 'microsoft',
}

export enum AuthPermissionMode {
	Default = 'default',
	Minimal = 'minimal'
}

export enum AzureAuthMode {
	EntraId = 'entraId',
	ApiKey = 'apiKey'
}

export namespace AzureAuthMode {
	/** Microsoft authentication provider ID for VS Code authentication API */
	export const MICROSOFT_AUTH_PROVIDER = 'microsoft';
	/** Azure Cognitive Services scope for Entra ID authentication */
	export const COGNITIVE_SERVICES_SCOPE = 'https://cognitiveservices.azure.com/.default';
}

export type CodeGenerationImportInstruction = { language?: string; file: string };
export type CodeGenerationTextInstruction = { language?: string; text: string };
export type CodeGenerationInstruction = CodeGenerationImportInstruction | CodeGenerationTextInstruction;

export type CommitMessageGenerationInstruction = { file: string } | { text: string };

export const XTabProviderId = 'XtabProvider';

export namespace ConfigKey {

	/**
	 * These settings are defined in the completions extensions and shared.
	 *
	 * We should not change the names of these settings without coordinating with Completions extension.
	*/
	export namespace Shared {
		/** Allows for overriding the base domain we use for making requests to the CAPI. This helps CAPI devs develop against a local instance. */
		export const DebugOverrideProxyUrl = defineSetting<string | undefined>('advanced.debug.overrideProxyUrl', ConfigType.Simple, undefined);
		export const DebugOverrideCAPIUrl = defineSetting<string | undefined>('advanced.debug.overrideCapiUrl', ConfigType.Simple, undefined);
		export const DebugUseNodeFetchFetcher = defineSetting('advanced.debug.useNodeFetchFetcher', ConfigType.Simple, true);
		export const DebugUseNodeFetcher = defineSetting('advanced.debug.useNodeFetcher', ConfigType.Simple, false);
		export const DebugUseElectronFetcher = defineSetting('advanced.debug.useElectronFetcher', ConfigType.Simple, true);
		export const AuthProvider = defineSetting<AuthProviderId>('advanced.authProvider', ConfigType.Simple, AuthProviderId.GitHub);
		export const AuthPermissions = defineSetting<AuthPermissionMode>('advanced.authPermissions', ConfigType.Simple, AuthPermissionMode.Default);
	}

	/**
	 * Advanced settings that are available for all users to configure.
	 */
	export namespace Advanced {
		/** Allows forcing a particular model.
		 * Note: this should not be used while self-hosting because it might lead to
		 * a fundamental different experience compared to our end-users.
		*/
		export const DebugPromptOverrideString = defineSetting<string | null>('chat.debug.promptOverrideString', ConfigType.Simple, null);
		export const DebugPromptOverrideFile = defineSetting<string | null>('chat.debug.promptOverrideFile', ConfigType.Simple, null);
		export const WorkspacePrototypeAdoCodeSearchEndpointOverride = defineAndMigrateSetting<string>('chat.advanced.workspace.prototypeAdoCodeSearchEndpointOverride', 'chat.workspace.prototypeAdoCodeSearchEndpointOverride', '');
		export const FeedbackOnChange = defineAndMigrateSetting('chat.advanced.feedback.onChange', 'chat.feedback.onChange', false);
		export const ReviewIntent = defineAndMigrateSetting('chat.advanced.review.intent', 'chat.review.intent', false);
		/** Enable the new notebook priorities experiment */
		export const NotebookSummaryExperimentEnabled = defineAndMigrateSetting('chat.advanced.notebook.summaryExperimentEnabled', 'chat.notebook.summaryExperimentEnabled', false);
		/** Enable filtering variables by cell document symbols */
		export const NotebookVariableFilteringEnabled = defineAndMigrateSetting('chat.advanced.notebook.variableFilteringEnabled', 'chat.notebook.variableFilteringEnabled', false);
		export const TerminalToDebuggerPatterns = defineAndMigrateSetting<string[]>('chat.advanced.debugTerminalCommandPatterns', 'chat.debugTerminalCommandPatterns', []);
		export const WorkspaceRecordingEnabled = defineAndMigrateSetting('chat.advanced.localWorkspaceRecording.enabled', 'chat.localWorkspaceRecording.enabled', false);
		export const EditRecordingEnabled = defineAndMigrateSetting('chat.advanced.editRecording.enabled', 'chat.editRecording.enabled', false);
		export const CodeSearchAgentEnabled = defineAndMigrateSetting<boolean | undefined>('chat.advanced.codesearch.agent.enabled', 'chat.codesearch.agent.enabled', true);
		export const AgentTemperature = defineAndMigrateSetting<number | undefined>('chat.advanced.agent.temperature', 'chat.agent.temperature', undefined);
		export const EnableUserPreferences = defineAndMigrateSetting<boolean>('chat.advanced.enableUserPreferences', 'chat.enableUserPreferences', false);
		export const SummarizeAgentConversationHistoryThreshold = defineAndMigrateSetting<number | undefined>('chat.advanced.summarizeAgentConversationHistoryThreshold', 'chat.summarizeAgentConversationHistoryThreshold', undefined);
		export const AgentHistorySummarizationMode = defineAndMigrateSetting<string | undefined>('chat.advanced.agentHistorySummarizationMode', 'chat.agentHistorySummarizationMode', undefined);
		export const UseResponsesApiTruncation = defineAndMigrateSetting<boolean | undefined>('chat.advanced.useResponsesApiTruncation', 'chat.useResponsesApiTruncation', false);
		export const OmitBaseAgentInstructions = defineAndMigrateSetting<boolean>('chat.advanced.omitBaseAgentInstructions', 'chat.omitBaseAgentInstructions', false);
		export const CLIPlanExitModeEnabled = defineSetting<boolean>('chat.cli.planExitMode.enabled', ConfigType.Simple, true);
		export const CLIPlanCommandEnabled = defineSetting<boolean>('chat.cli.planCommand.enabled', ConfigType.Simple, true);
		export const CLIAIGenerateBranchNames = defineSetting<boolean>('chat.cli.aiGenerateBranchNames.enabled', ConfigType.Simple, true);
		export const CLIForkSessionsEnabled = defineSetting<boolean>('chat.cli.forkSessions.enabled', ConfigType.Simple, true);
		export const CLIMCPServerEnabled = defineAndMigrateSetting<boolean | undefined>('chat.advanced.cli.mcp.enabled', 'chat.cli.mcp.enabled', true);
		export const CLIBranchSupport = defineSetting<boolean>('chat.cli.branchSupport.enabled', ConfigType.Simple, false);
		export const CLIIsolationOption = defineSetting<boolean>('chat.cli.isolationOption.enabled', ConfigType.Simple, true);
		export const CLIAutoCommitEnabled = defineSetting<boolean>('chat.cli.autoCommit.enabled', ConfigType.Simple, true);
		export const CLISessionController = defineSetting<boolean>('chat.cli.sessionController.enabled', ConfigType.Simple, false);
		export const CLIThinkingEffortEnabled = defineSetting<boolean>('chat.cli.thinkingEffort.enabled', ConfigType.Simple, true);
		export const CLISessionControllerForSessionsApp = defineSetting<boolean>('chat.cli.sessionControllerForSessionsApp.enabled', ConfigType.Simple, false);
		export const CLITerminalLinks = defineSetting<boolean>('chat.cli.terminalLinks.enabled', ConfigType.Simple, true);
		export const RequestLoggerMaxEntries = defineAndMigrateSetting<number>('chat.advanced.debug.requestLogger.maxEntries', 'chat.debug.requestLogger.maxEntries', 100);

		// Experiment-based settings
		/** Uses new expanded project labels */
		export const ProjectLabelsExpanded = defineAndMigrateExpSetting<boolean>('chat.advanced.projectLabels.expanded', 'chat.projectLabels.expanded', false);
		/** Add project labels in default agent */
		export const ProjectLabelsChat = defineAndMigrateExpSetting<boolean>('chat.advanced.projectLabels.chat', 'chat.projectLabels.chat', false);
		/** Add project labels in default agent */
		export const ProjectLabelsInline = defineAndMigrateExpSetting<boolean>('chat.advanced.projectLabels.inline', 'chat.projectLabels.inline', false);
		export const WorkspaceMaxLocalIndexSize = defineAndMigrateExpSetting<number>('chat.advanced.workspace.maxLocalIndexSize', 'chat.workspace.maxLocalIndexSize', 100_000);
		export const WorkspaceEnableCodeSearch = defineAndMigrateExpSetting<boolean>('chat.advanced.workspace.enableCodeSearch', 'chat.workspace.enableCodeSearch', true);
		export const WorkspaceMaxDiffSizeBeforeUsingExternalIngest = defineAndMigrateExpSetting<number>('chat.advanced.workspace.maxDiffSizeBeforeUsingExternalIngest', 'chat.workspace.maxDiffSizeBeforeUsingExternalIngest', 100);
		export const WorkspacePreferredEmbeddingsModel = defineAndMigrateExpSetting<string>('chat.advanced.workspace.preferredEmbeddingsModel', 'chat.workspace.preferredEmbeddingsModel', '');
		export const NotebookAlternativeDocumentFormat = defineAndMigrateExpSetting<AlternativeNotebookFormat>('chat.advanced.notebook.alternativeFormat', 'chat.notebook.alternativeFormat', AlternativeNotebookFormat.xml);
		export const UseAlternativeNESNotebookFormat = defineAndMigrateExpSetting<boolean>('chat.advanced.notebook.alternativeNESFormat.enabled', 'chat.notebook.alternativeNESFormat.enabled', false);

		export const InlineChatSelectionRatioThreshold = defineSetting<number>('chat.inlineChat.selectionRatioThreshold', ConfigType.ExperimentBased, 0);

		export const InstantApplyShortModelName = defineAndMigrateExpSetting<string>('chat.advanced.instantApply.shortContextModelName', 'chat.instantApply.shortContextModelName', CHAT_MODEL.SHORT_INSTANT_APPLY);
		export const InstantApplyShortContextLimit = defineAndMigrateExpSetting<number>('chat.advanced.instantApply.shortContextLimit', 'chat.instantApply.shortContextLimit', 8000);
		export const AgentHistorySummarizationInline = defineAndMigrateExpSetting<boolean>('chat.advanced.agentHistorySummarizationInline', 'chat.agentHistorySummarizationInline', false);
		export const PromptFileContext = defineAndMigrateExpSetting<boolean>('chat.advanced.promptFileContextProvider.enabled', 'chat.promptFileContextProvider.enabled', true);
		export const DefaultToolsGrouped = defineAndMigrateExpSetting<boolean>('chat.advanced.tools.defaultToolsGrouped', 'chat.tools.defaultToolsGrouped', false);
		export const Gpt5AlternativePatch = defineAndMigrateExpSetting<boolean>('chat.advanced.gpt5AlternativePatch', 'chat.gpt5AlternativePatch', false);
		export const SearchSubagentToolEnabled = defineSetting<boolean>('chat.searchSubagent.enabled', ConfigType.ExperimentBased, false);
		/** Use the agentic proxy for the search subagent tool */
		export const SearchSubagentUseAgenticProxy = defineSetting<boolean>('chat.searchSubagent.useAgenticProxy', ConfigType.ExperimentBased, false);
		/** Model to use for the search subagent. When useAgenticProxy is true, defaults to 'agentic-search-v3'. When false, defaults to the main agent model. */
		export const SearchSubagentModel = defineSetting<string>('chat.searchSubagent.model', ConfigType.ExperimentBased, '');
		/** Maximum number of tool calls the search subagent can make */
		export const SearchSubagentToolCallLimit = defineSetting<number>('chat.searchSubagent.toolCallLimit', ConfigType.ExperimentBased, 4);

		export const ExecutionSubagentToolEnabled = defineSetting<boolean>('chat.executionSubagent.enabled', ConfigType.ExperimentBased, false);
		/** Model to use for the execution subagent */
		export const ExecutionSubagentModel = defineSetting<string>('chat.executionSubagent.model', ConfigType.ExperimentBased, '');
		/** Maximum number of tool calls the execution subagent can make */
		export const ExecutionSubagentToolCallLimit = defineSetting<number>('chat.executionSubagent.toolCallLimit', ConfigType.ExperimentBased, 10);

		export const InlineEditsTriggerOnEditorChangeAfterSeconds = defineAndMigrateExpSetting<number | undefined>('chat.advanced.inlineEdits.triggerOnEditorChangeAfterSeconds', 'chat.inlineEdits.triggerOnEditorChangeAfterSeconds', 10);
		export const InlineEditsNextCursorPredictionDisplayLine = defineAndMigrateExpSetting<boolean>('chat.advanced.inlineEdits.nextCursorPrediction.displayLine', 'chat.inlineEdits.nextCursorPrediction.displayLine', true);
		export const InlineEditsNextCursorPredictionCurrentFileMaxTokens = defineAndMigrateExpSetting<number>('chat.advanced.inlineEdits.nextCursorPrediction.currentFileMaxTokens', 'chat.inlineEdits.nextCursorPrediction.currentFileMaxTokens', 3000);
		export const InlineEditsRenameSymbolSuggestions = defineSetting<boolean>('chat.inlineEdits.renameSymbolSuggestions', ConfigType.ExperimentBased, true);
		export const InlineEditsPreferredModel = defineSetting<string | 'none'>('nextEditSuggestions.preferredModel', ConfigType.ExperimentBased, 'none');
		export const InlineEditsAggressiveness = defineSetting<xtabPromptOptions.AggressivenessSetting>('nextEditSuggestions.eagerness', ConfigType.ExperimentBased, xtabPromptOptions.AggressivenessSetting.Default, xtabPromptOptions.AggressivenessSetting.VALIDATOR);
		export const DiagnosticsContextProvider = defineAndMigrateExpSetting<boolean>('chat.advanced.inlineEdits.diagnosticsContextProvider.enabled', 'chat.inlineEdits.diagnosticsContextProvider.enabled', false);
		export const ChatSessionContextProvider = defineSetting<boolean>('chat.inlineEdits.chatSessionContextProvider.enabled', ConfigType.ExperimentBased, false);
		export const Gemini3MultiReplaceString = defineSetting<boolean>('chat.edits.gemini3MultiReplaceString', ConfigType.ExperimentBased, false);
		export const BatchReplaceStringDescriptions = defineSetting<boolean>('chat.edits.batchReplaceStringDescriptions', ConfigType.ExperimentBased, false);
		export const AgentOmitFileAttachmentContents = defineSetting<boolean>('chat.agent.omitFileAttachmentContents', ConfigType.ExperimentBased, false);

		/**
		 * Settings for switch between old tools and new skills
		 */
		export const InstallExtensionSkillEnabled = defineSetting<boolean>('chat.installExtensionSkill.enabled', ConfigType.ExperimentBased, false);
		export const ProjectSetupInfoSkillEnabled = defineSetting<boolean>('chat.projectSetupInfoSkill.enabled', ConfigType.ExperimentBased, false);

		/**
		 * When enabled, large tool results (above the threshold in bytes) are written to disk
		 * instead of being included directly in the prompt. This helps manage context window usage.
		 */
		export const LargeToolResultsToDiskEnabled = defineSetting<boolean>('chat.agent.largeToolResultsToDisk.enabled', ConfigType.ExperimentBased, true);
		/**
		 * The size threshold in bytes above which tool results are written to disk.
		 * Only applies when LargeToolResultsToDiskEnabled is true.
		 */
		export const LargeToolResultsToDiskThreshold = defineSetting<number>('chat.agent.largeToolResultsToDisk.thresholdBytes', ConfigType.ExperimentBased, 8 * 1024);

		/** Simulate GitHub authentication failures for testing. Can't be TeamInternal because we lose these flags as part of testing. */
		export const DebugGitHubAuthFailWith = defineSetting<'NotAuthorized' | 'RequestFailed' | 'ParseFailed' | 'HTTP401' | 'RateLimited' | 'GitHubLoginFailed' | null>('chat.debug.githubAuthFailWith', ConfigType.Simple, null);

		// Agent debug logging settings — fileLogging.enabled is the canonical toggle
		/** @deprecated Use ChatDebugFileLogging instead. Kept during experiment transition. */
		export const AgentDebugLogEnabled = defineAndMigrateExpSetting<boolean>('agentDebugLog.enabled', 'chat.agentDebugLog.enabled', false);
		export const ChatDebugFileLogging = defineAndMigrateExpSetting<boolean>('chat.chatDebug.fileLogging.enabled', 'chat.agentDebugLog.fileLogging.enabled', false);
		export const ChatDebugFileLoggingFlushInterval = defineAndMigrateSetting<number>('chat.chatDebug.fileLogging.flushIntervalMs', 'chat.agentDebugLog.fileLogging.flushIntervalMs', 4000);
		export const ChatDebugFileLoggingMaxRetainedSessionLogs = defineSetting<number>('chat.agentDebugLog.fileLogging.maxRetainedSessionLogs', ConfigType.ExperimentBased, 50);
		export const ChatDebugFileLoggingMaxSessionLogSizeMB = defineSetting<number>('chat.agentDebugLog.fileLogging.maxSessionLogSizeMB', ConfigType.ExperimentBased, 100);

		// OTel settings
		export const OTelEnabled = defineSetting<boolean>('chat.otel.enabled', ConfigType.Simple, false);
		export const OTelExporterType = defineSetting<string>('chat.otel.exporterType', ConfigType.Simple, 'otlp-http');
		export const OTelOtlpEndpoint = defineSetting<string>('chat.otel.otlpEndpoint', ConfigType.Simple, 'http://localhost:4318');
		export const OTelCaptureContent = defineSetting<boolean>('chat.otel.captureContent', ConfigType.Simple, false);
		export const OTelOutfile = defineSetting<string>('chat.otel.outfile', ConfigType.Simple, '');
		export const OTelDbSpanExporter = defineSetting<boolean>('chat.otel.dbSpanExporter.enabled', ConfigType.Simple, false);
	}

	/**
	 * Internal settings those only team members can configure
	 * Features should only be in this list temporarily, moving on to experimental to be accessible to early adopters.
	*/
	export namespace TeamInternal {
		/** Allows forcing a particular context window size.
		 * This setting doesn't validate values so large windows may not be supported by the model.
		 * Note: this should not be used while self-hosting because it might lead to
		 * a fundamental different experience compared to our end-users.
		 */
		export const DebugOverrideChatMaxTokenNum = defineTeamInternalSetting<number>('chat.advanced.debug.overrideChatMaxTokenNum', ConfigType.Simple, 0);
		/** Allow reporting issue when clicking on the Unhelpful button
		 * Requires a window reload to take effect
		 */
		export const DebugReportFeedback = defineTeamInternalSetting<boolean>('chat.advanced.debug.reportFeedback', ConfigType.Simple, false);
		export const DisableRepoInfoTelemetry = defineTeamInternalSetting<boolean>('chat.advanced.debug.disableRepoInfoTelemetry', ConfigType.Simple, false);
		export const InlineEditsIgnoreCompletionsDisablement = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.ignoreCompletionsDisablement', ConfigType.Simple, false, vBoolean());
		export const InlineEditsModelPickerEnabled = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.modelPicker.enabled', ConfigType.ExperimentBased, false, vBoolean());
		export const InlineEditsUseSlashModels = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.useSlashModels', ConfigType.ExperimentBased, true);
		export const InlineEditsLogContextRecorderEnabled = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.logContextRecorder.enabled', ConfigType.Simple, false);
		export const InlineEditsHideInternalInterface = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.hideInternalInterface', ConfigType.Simple, false, vBoolean());
		export const InlineEditsLogCancelledRequests = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.logCancelledRequests', ConfigType.Simple, false, vBoolean());
		export const InlineEditsNextCursorPredictionUrl = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.nextCursorPrediction.url', ConfigType.Simple, undefined, vString());
		export const InlineEditsNextCursorPredictionApiKey = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.nextCursorPrediction.apiKey', ConfigType.Simple, undefined, vString());
		export const InlineEditsXtabProviderUrl = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.xtabProvider.url', ConfigType.Simple, undefined, vString());
		export const InlineEditsXtabProviderApiKey = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.xtabProvider.apiKey', ConfigType.Simple, undefined, vString());
		export const InlineEditsXtabProviderModelConfiguration = defineTeamInternalSetting<xtabPromptOptions.ModelConfiguration | undefined>('chat.advanced.inlineEdits.xtabProvider.modelConfiguration', ConfigType.Simple, undefined, xtabPromptOptions.MODEL_CONFIGURATION_VALIDATOR);
		export const InlineEditsNextCursorPredictionLintOptions = defineTeamInternalSetting<Partial<xtabPromptOptions.LintOptions> | undefined>('chat.advanced.inlineEdits.nextCursorPrediction.lintOptions', ConfigType.Simple, undefined, xtabPromptOptions.LINT_OPTIONS_VALIDATOR);
		export const InlineEditsInlineCompletionsEnabled = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.inlineCompletions.enabled', ConfigType.Simple, true, vBoolean());
		export const InlineEditsInlineCompletionsAdvanced = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.inlineCompletions.advancedDetection', ConfigType.ExperimentBased, true, vBoolean());
		export const InlineEditsXtabProviderUsePrediction = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.usePrediction', ConfigType.ExperimentBased, true, vBoolean());
		export const InlineEditsXtabLanguageContextEnabledLanguages = defineTeamInternalSetting<LanguageContextLanguages>('chat.advanced.inlineEdits.xtabProvider.languageContext.enabledLanguages', ConfigType.Simple, LANGUAGE_CONTEXT_ENABLED_LANGUAGES);
		export const InlineEditsXtabLanguageContextTraitsPosition = defineTeamInternalSetting<'before' | 'after'>('chat.advanced.inlineEdits.xtabProvider.languageContext.traitsPosition', ConfigType.ExperimentBased, 'before');
		export const InlineEditsDiagnosticsExplorationEnabled = defineTeamInternalSetting<boolean | undefined>('chat.advanced.inlineEdits.inlineEditsDiagnosticsExplorationEnabled', ConfigType.Simple, false);
		export const InternalWelcomeHintEnabled = defineTeamInternalSetting<boolean>('chat.advanced.welcomePageHint.enabled', ConfigType.Simple, false);
		export const InlineChatUseCodeMapper = defineTeamInternalSetting<boolean>('chat.advanced.inlineChat.useCodeMapper', ConfigType.Simple, false);
		export const EnablePromptRendererTracing = defineTeamInternalSetting<boolean>('chat.advanced.promptRenderer.trace', ConfigType.Simple, false);
		// Backed by Experiments
		export const DebugCollectFetcherTelemetry = defineTeamInternalSetting<boolean>('chat.advanced.debug.collectFetcherTelemetry', ConfigType.ExperimentBased, true);
		export const DebugShowNetworkStatus = defineTeamInternalSetting<boolean>('chat.advanced.debug.showNetworkStatus', ConfigType.ExperimentBased, false);
		export const GeminiFunctionCallingMode = defineTeamInternalSetting<'auto' | 'none' | 'required' | 'validated' | undefined>('chat.advanced.gemini.functionCallingMode', ConfigType.ExperimentBased, 'validated');
		export const ModelProviderPreference = defineTeamInternalSetting<string | undefined>('chat.advanced.modelProviderPreference', ConfigType.Simple, undefined, vString());
		export const UseVSCodeTelemetryLibForGH = defineTeamInternalSetting<boolean>('chat.advanced.telemetry.useVSCodeTelemetryLibForGH', ConfigType.ExperimentBased, false);

		export const DebugExpUseNodeFetchFetcher = defineTeamInternalSetting<boolean | undefined>('chat.advanced.debug.useNodeFetchFetcher', ConfigType.ExperimentBased, undefined);
		export const DebugExpUseNodeFetcher = defineTeamInternalSetting<boolean | undefined>('chat.advanced.debug.useNodeFetcher', ConfigType.ExperimentBased, undefined);
		export const DebugExpUseElectronFetcher = defineTeamInternalSetting<boolean | undefined>('chat.advanced.debug.useElectronFetcher', ConfigType.ExperimentBased, undefined);
		export const InlineEditsAsyncCompletions = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.asyncCompletions', ConfigType.ExperimentBased, true);
		export const InlineEditsEagerBackupRequest = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.eagerBackupRequest', ConfigType.ExperimentBased, false);
		export const InlineEditsCheckEditWindowOnReuse = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.checkEditWindowOnReuse', ConfigType.ExperimentBased, true);
		export const InlineEditsDebounceUseCoreRequestTime = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.debounceUseCoreRequestTime', ConfigType.ExperimentBased, false);
		export const InlineEditsYieldToCopilot = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.yieldToCopilot', ConfigType.ExperimentBased, false);
		export const InlineEditsExcludedProviders = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.excludedProviders', ConfigType.ExperimentBased, undefined);
		export const InlineEditsEnableGhCompletionsProvider = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.githubCompletionsProvider.enabled', ConfigType.ExperimentBased, false);
		export const InlineEditsCompletionsUrl = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.completionsProvider.url', ConfigType.ExperimentBased, undefined);
		export const InlineEditsDebounce = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.debounce', ConfigType.ExperimentBased, 100);
		export const InlineEditsCacheCursorDistanceCheck = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.cacheCursorDistanceCheck', ConfigType.ExperimentBased, false);
		export const InlineEditsCacheDelay = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.cacheDelay', ConfigType.ExperimentBased, 200);
		export const InlineEditsSubsequentCacheDelay = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.subsequentCacheDelay', ConfigType.ExperimentBased, 0);
		export const InlineEditsSpeculativeRequestDelay = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.speculativeRequestDelay', ConfigType.ExperimentBased, 0);
		export const InlineEditsRebasedCacheDelay = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.rebasedCacheDelay', ConfigType.ExperimentBased, 0);
		export const InlineEditsAbsorbSubsequenceTyping = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.absorbSubsequenceTyping', ConfigType.ExperimentBased, false);
		export const InlineEditsBackoffDebounceEnabled = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.backoffDebounceEnabled', ConfigType.ExperimentBased, true);
		export const InlineEditsExtraDebounceEndOfLine = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.extraDebounceEndOfLine', ConfigType.ExperimentBased, 2000);
		export const InlineEditsSpeculativeRequests = defineTeamInternalSetting<SpeculativeRequestsEnablement>('chat.advanced.inlineEdits.speculativeRequests', ConfigType.ExperimentBased, SpeculativeRequestsEnablement.Off, SpeculativeRequestsEnablement.VALIDATOR);
		export const InlineEditsSpeculativeRequestsCursorPlacement = defineTeamInternalSetting<SpeculativeRequestsCursorPlacement>('chat.advanced.inlineEdits.speculativeRequestsCursorPlacement', ConfigType.ExperimentBased, SpeculativeRequestsCursorPlacement.AfterEditApplied, SpeculativeRequestsCursorPlacement.VALIDATOR);
		export const InlineEditsSpeculativeRequestsAutoExpandEditWindowLines = defineTeamInternalSetting<SpeculativeRequestsAutoExpandEditWindowLines>('chat.advanced.inlineEdits.speculativeRequestsAutoExpandEditWindowLines', ConfigType.ExperimentBased, SpeculativeRequestsAutoExpandEditWindowLines.Off, SpeculativeRequestsAutoExpandEditWindowLines.VALIDATOR);
		export const InlineEditsExtraDebounceInlineSuggestion = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.extraDebounceInlineSuggestion', ConfigType.ExperimentBased, 0);
		export const InlineEditsDebounceOnSelectionChange = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.debounceOnSelectionChange', ConfigType.ExperimentBased, undefined);
		export const InlineEditsTriggerOnEditorChangeStrategy = defineTeamInternalSetting<triggerOptions.DocumentSwitchTriggerStrategy>('chat.advanced.inlineEdits.triggerOnEditorChangeStrategy', ConfigType.ExperimentBased, triggerOptions.DocumentSwitchTriggerStrategy.AfterAcceptance, triggerOptions.DocumentSwitchTriggerStrategy.VALIDATOR);
		export const InlineEditsProviderId = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.providerId', ConfigType.ExperimentBased, undefined);
		export const InlineEditsUnification = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.unification', ConfigType.ExperimentBased, false);
		export const InlineEditsNextCursorPredictionModelName = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.nextCursorPrediction.modelName', ConfigType.ExperimentBased, 'copilot-suggestions-himalia-001');
		export const InlineEditsNextCursorPredictionUseEndpointProvider = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.nextCursorPrediction.useEndpointProvider', ConfigType.Simple, false, vBoolean());
		export const InlineEditsNextCursorPredictionMaxResponseTokens = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.nextCursorPrediction.maxResponseTokens', ConfigType.ExperimentBased, 40);
		export const InlineEditsNextCursorPredictionLintOptionsString = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.nextCursorPrediction.lintOptionsString', ConfigType.ExperimentBased, undefined);
		export const InlineEditsXtabProviderModelConfigurationString = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.xtabProvider.modelConfigurationString', ConfigType.ExperimentBased, undefined);
		export const InlineEditsXtabProviderDefaultModelConfigurationString = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.xtabProvider.defaultModelConfigurationString', ConfigType.ExperimentBased, undefined);
		export const InlineEditsXtabProviderUseVaryingLinesAbove = defineTeamInternalSetting<boolean | undefined>('chat.advanced.inlineEdits.xtabProvider.useVaryingLinesAbove', ConfigType.ExperimentBased, undefined);
		export const InlineEditsXtabProviderNLinesAbove = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.xtabProvider.nLinesAbove', ConfigType.ExperimentBased, undefined);
		export const InlineEditsXtabProviderNLinesBelow = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.xtabProvider.nLinesBelow', ConfigType.ExperimentBased, undefined);
		export const InlineEditsAutoExpandEditWindowLines = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.autoExpandEditWindowLines', ConfigType.ExperimentBased, 10);
		export const InlineEditsXtabNRecentlyViewedDocuments = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.nRecentlyViewedDocuments', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.recentlyViewedDocuments.nDocuments);
		export const InlineEditsXtabRecentlyViewedDocumentsMaxTokens = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.recentlyViewedDocuments.maxTokens', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.recentlyViewedDocuments.maxTokens);
		export const InlineEditsXtabRecentlyViewedIncludeLineNumbers = defineTeamInternalSetting<xtabPromptOptions.IncludeLineNumbersOption>('chat.advanced.inlineEdits.xtabProvider.recentlyViewedDocuments.includeLineNumbers', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.recentlyViewedDocuments.includeLineNumbers);
		export const InlineEditsNextCursorPredictionRecentSnippetsIncludeLineNumbers = defineTeamInternalSetting<xtabPromptOptions.IncludeLineNumbersOption>('chat.advanced.inlineEdits.nextCursorPrediction.recentSnippets.includeLineNumbers', ConfigType.ExperimentBased, xtabPromptOptions.IncludeLineNumbersOption.None);
		export const InlineEditsNextCursorPredictionCursorPlacement = defineTeamInternalSetting<NextCursorLinePredictionCursorPlacement>('chat.advanced.inlineEdits.nextCursorPrediction.cursorPlacement', ConfigType.ExperimentBased, NextCursorLinePredictionCursorPlacement.AfterLine, NextCursorLinePredictionCursorPlacement.VALIDATOR);
		export const InlineEditsXtabDiffNEntries = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.diffNEntries', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.diffHistory.nEntries);
		export const InlineEditsXtabDiffMaxTokens = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.diffMaxTokens', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.diffHistory.maxTokens);
		export const InlineEditsXtabDiffMergeStrategy = defineTeamInternalSetting<xtabHistoryOptions.DiffHistoryMergeStrategy>('chat.advanced.inlineEdits.xtabProvider.diffMergeStrategy', ConfigType.ExperimentBased, xtabHistoryOptions.DiffHistoryMergeStrategy.SameStartLine, xtabHistoryOptions.DiffHistoryMergeStrategy.VALIDATOR);
		export const InlineEditsXtabDiffMergeLineGap = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.diffMergeLineGap', ConfigType.ExperimentBased, 0, vNumber());
		export const InlineEditsXtabDiffMergeSplitAfterMs = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.diffMergeSplitAfterMs', ConfigType.ExperimentBased, 100, vNumber());
		export const InlineEditsXtabProviderEmitFastCursorLineChange = defineTeamInternalSetting<ResponseProcessor.EmitFastCursorLineChange>('chat.advanced.inlineEdits.xtabProvider.emitFastCursorLineChange', ConfigType.ExperimentBased, ResponseProcessor.EmitFastCursorLineChange.AdditiveOnly);
		export const InlineEditsXtabIncludeViewedFiles = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.includeViewedFiles', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.recentlyViewedDocuments.includeViewedFiles);
		export const InlineEditsXtabRecentlyViewedClippingStrategy = defineTeamInternalSetting<xtabPromptOptions.RecentFileClippingStrategy>('chat.advanced.inlineEdits.xtabProvider.recentlyViewedDocuments.clippingStrategy', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.recentlyViewedDocuments.clippingStrategy, xtabPromptOptions.RecentFileClippingStrategy.VALIDATOR);
		export const InlineEditsXtabPageSize = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.pageSize', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.pagedClipping.pageSize);
		export const InlineEditsXtabEditWindowMaxTokens = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.xtabProvider.editWindowMaxTokens', ConfigType.ExperimentBased, 2000);
		export const InlineEditsXtabIncludeTagsInCurrentFile = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.includeTagsInCurrentFile', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.currentFile.includeTags);
		export const InlineEditsXtabIncludeLineNumbersInCurrentFile = defineTeamInternalSetting<xtabPromptOptions.IncludeLineNumbersOption>('chat.advanced.inlineEdits.xtabProvider.includeLineNumbersInCurrentFile', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.currentFile.includeLineNumbers);
		export const InlineEditsXtabIncludeCursorTagInCurrentFile = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.includeCursorTagInCurrentFile', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.currentFile.includeCursorTag);
		export const InlineEditsXtabCurrentFileMaxTokens = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.currentFileMaxTokens', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.currentFile.maxTokens);
		export const InlineEditsXtabPrioritizeAboveCursor = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.currentFile.prioritizeAboveCursor', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.currentFile.prioritizeAboveCursor);
		export const InlineEditsXtabDiffOnlyForDocsInPrompt = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.diffOnlyForDocsInPrompt', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.diffHistory.onlyForDocsInPrompt);
		export const InlineEditsXtabDiffUseRelativePaths = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.diffUseRelativePaths', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.diffHistory.useRelativePaths);
		export const InlineEditsXtabNNonSignificantLinesToConverge = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.nNonSignificantLinesToConverge', ConfigType.ExperimentBased, ResponseProcessor.DEFAULT_DIFF_PARAMS.nLinesToConverge);
		export const InlineEditsXtabNSignificantLinesToConverge = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.nSignificantLinesToConverge', ConfigType.ExperimentBased, ResponseProcessor.DEFAULT_DIFF_PARAMS.nSignificantLinesToConverge);
		export const InlineEditsXtabEarlyCursorLineDivergenceCancellation = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.earlyCursorLineDivergenceCancellation', ConfigType.ExperimentBased, false);
		export const InlineEditsXtabLanguageContextEnabled = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.languageContext.enabled', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.languageContext.enabled);
		export const InlineEditsXtabLanguageContextMaxTokens = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.xtabProvider.languageContext.maxTokens', ConfigType.ExperimentBased, xtabPromptOptions.DEFAULT_OPTIONS.languageContext.maxTokens);
		export const InlineEditsXtabMaxMergeConflictLines = defineTeamInternalSetting<number | undefined>('chat.advanced.inlineEdits.xtabProvider.maxMergeConflictLines', ConfigType.ExperimentBased, undefined);
		export const InlineEditsXtabOnlyMergeConflictLines = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.xtabProvider.onlyMergeConflictLines', ConfigType.ExperimentBased, false);
		export const InlineEditsXtabAggressivenessLevel = defineTeamInternalSetting<xtabPromptOptions.AggressivenessLevel | undefined>('chat.advanced.inlineEdits.xtabProvider.aggressivenessLevel', ConfigType.ExperimentBased, undefined);
		export const InlineEditsAggressivenessLowMinResponseTimeMs = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.aggressiveness.lowMinResponseTimeMs', ConfigType.ExperimentBased, 1500);
		export const InlineEditsAggressivenessMediumMinResponseTimeMs = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.aggressiveness.mediumMinResponseTimeMs', ConfigType.ExperimentBased, 700);
		export const InlineEditsAggressivenessHighDebounceMs = defineTeamInternalSetting<number>('chat.advanced.inlineEdits.aggressiveness.highDebounceMs', ConfigType.ExperimentBased, 0);
		export const InlineEditsUserHappinessScoreConfigurationString = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineEdits.adaptiveAggressivenessConfigurationString', ConfigType.ExperimentBased, undefined);
		export const InlineEditsUndoInsertionFiltering = defineTeamInternalSetting<'v1' | 'v2' | undefined>('chat.advanced.inlineEdits.undoInsertionFiltering', ConfigType.ExperimentBased, 'v1');
		export const InlineEditsFilterOutEditsWithSubstrings = defineTeamInternalSetting<string>('chat.advanced.inlineEdits.filterOutEditsWithSubstrings', ConfigType.ExperimentBased, '<|current_file_content|>,<|/current_file_content|>,<|diff_marker|>');
		export const InlineEditsAllowImportChanges = defineTeamInternalSetting<ImportChanges>('chat.advanced.inlineEdits.allowImportChanges', ConfigType.ExperimentBased, ImportChanges.None, ImportChanges.VALIDATOR);
		export const InlineEditsIgnoreWhenSuggestVisible = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.ignoreWhenSuggestVisible', ConfigType.ExperimentBased, true);
		export const InlineEditsJointCompletionsProviderEnabled = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.jointCompletionsProvider.enabled', ConfigType.ExperimentBased, false);
		export const InlineEditsJointCompletionsProviderStrategy = defineTeamInternalSetting<JointCompletionsProviderStrategy>('chat.advanced.inlineEdits.jointCompletionsProvider.strategy', ConfigType.ExperimentBased, JointCompletionsProviderStrategy.Regular);
		export const InlineEditsJointCompletionsProviderTriggerChangeStrategy = defineTeamInternalSetting<JointCompletionsProviderTriggerChangeStrategy>('chat.advanced.inlineEdits.jointCompletionsProvider.triggerChangeStrategy', ConfigType.ExperimentBased, JointCompletionsProviderTriggerChangeStrategy.NoTriggerOnCompletionsRequestInFlight);
		export const InstantApplyModelName = defineTeamInternalSetting<string>('chat.advanced.instantApply.modelName', ConfigType.ExperimentBased, CHAT_MODEL.GPT4OPROXY);
		export const VerifyTextDocumentChanges = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.verifyTextDocumentChanges', ConfigType.ExperimentBased, false);
		export const UseAutoModeRouting = defineTeamInternalSetting<boolean>('chat.advanced.useAutoModeRouter', ConfigType.ExperimentBased, false);
		/** Controls which `routing_method` value is sent to the auto-intent-service per request
		 * when `UseAutoModeRouting` is enabled.
		 * '' (empty/default) = omit `routing_method` and use the server default.
		 * 'binary' = binary classifier v1.
		 * 'hydra' = HYDRA multi-head capability matching.
		 * For experiments, this setting selects the routing method only when router usage is enabled;
		 * it does not by itself determine whether the router is called. */
		export const AutoModeRoutingMethod = defineTeamInternalSetting<string>('chat.advanced.autoModeRoutingMethod', ConfigType.ExperimentBased, '', undefined, undefined, { experimentName: 'copilotchat.autoModeRoutingMethod' });

		/** Inline Completions */
		export const InlineCompletionsDefaultDiagnosticsOptions = defineTeamInternalSetting<string | undefined>('chat.advanced.inlineCompletions.defaultDiagnosticsOptionsString', ConfigType.ExperimentBased, undefined);
		export const RecordExpectedEditEnabled = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.recordExpectedEdit.enabled', ConfigType.Simple, false);
		export const RecordExpectedEditOnReject = defineTeamInternalSetting<boolean>('chat.advanced.inlineEdits.recordExpectedEdit.onReject', ConfigType.Simple, false);

		export const ReadFileCodeFences = defineTeamInternalSetting<boolean>('chat.advanced.readFileCodeFences', ConfigType.ExperimentBased, false);

		// TODO: @sandy081 - These should be moved away from this namespace
		export const EnableReadFileV2 = defineSetting<boolean>('chat.advanced.enableReadFileV2', ConfigType.ExperimentBased, false);
		export const AskAgent = defineSetting<boolean>('chat.advanced.enableAskAgent', ConfigType.ExperimentBased, false);
		export const RetryNetworkErrors = defineSetting<boolean>('chat.advanced.enableRetryNetworkErrors', ConfigType.ExperimentBased, true);
		export const RetryServerErrorStatusCodes = defineSetting<string>('chat.advanced.retryServerErrorStatusCodes', ConfigType.ExperimentBased, '500,502');
		export const FallbackNodeFetchOnNetworkProcessCrash = defineSetting<boolean>('chat.advanced.enableFallbackNodeFetchOnNetworkProcessCrash', ConfigType.ExperimentBased, true);
		export const WorkspaceEnableCodeSearchExternalIngest = defineTeamInternalSetting<boolean>('chat.advanced.workspace.codeSearchExternalIngest.enabled', ConfigType.ExperimentBased, false);
		export const ChatRequestPowerSaveBlocker = defineTeamInternalSetting<boolean>('chat.advanced.chatRequestPowerSaveBlocker', ConfigType.ExperimentBased, true);
		/** Enable WebSocket transport for Responses API requests. When enabled, uses a persistent WebSocket connection per conversation instead of individual HTTP requests. */
		export const ResponsesApiWebSocketEnabled = defineTeamInternalSetting<boolean>('chat.advanced.responsesApi.webSocket.enabled', ConfigType.ExperimentBased, false);
		export const DebugSimulateWebSocketResponse = defineTeamInternalSetting<string>('chat.advanced.debug.simulateWebSocketResponse', ConfigType.Simple, '');
		/** Internal: configure reasoning effort for Responses API. Used by evals. */
		export const ResponsesApiReasoningEffort = defineTeamInternalSetting<'low' | 'medium' | 'high' | 'xhigh' | undefined>('chat.advanced.responsesApiReasoningEffort', ConfigType.Simple, undefined);
		/** Internal: configure reasoning effort for Anthropic thinking. Used by evals. */
		export const AnthropicThinkingEffort = defineTeamInternalSetting<'low' | 'medium' | 'high' | undefined>('chat.advanced.anthropicThinkingEffort', ConfigType.Simple, undefined);
	}

	/**
	 * Deprecated settings that are no longer in use.
	 */
	export namespace Deprecated {
		/** Model override for Plan agent — migrated to core `chat.planAgent.defaultModel` */
		export const PlanAgentModel = defineSetting<string>('chat.planAgent.model', ConfigType.Simple, '');
		export const OllamaEndpoint = defineSetting<string>('chat.byok.ollamaEndpoint', ConfigType.Simple, 'http://localhost:11434');
		export const AzureModels = defineSetting<Record<string, { name: string; url: string; toolCalling: boolean; vision: boolean; maxInputTokens: number; maxOutputTokens: number; requiresAPIKey?: boolean; thinking?: boolean; streaming?: boolean; zeroDataRetentionEnabled?: boolean }>>('chat.azureModels', ConfigType.Simple, {});
		export const CustomOAIModels = defineSetting<Record<string, { name: string; url: string; toolCalling: boolean; vision: boolean; maxInputTokens: number; maxOutputTokens: number; requiresAPIKey?: boolean; thinking?: boolean; streaming?: boolean; requestHeaders?: Record<string, string>; zeroDataRetentionEnabled?: boolean }>>('chat.customOAIModels', ConfigType.Simple, {});
		export const AzureAuthType = defineSetting<AzureAuthMode>('chat.azureAuthType', ConfigType.Simple, AzureAuthMode.EntraId);
	}

	export const Enable = defineSetting<{ [key: string]: boolean }>('enable', ConfigType.Simple, {
		'*': true,
		'plaintext': false,
		'markdown': false,
		'scminput': false
	});
	export const selectedCompletionsModel = defineSetting<string>('selectedCompletionModel', ConfigType.Simple, '');

	export const RateLimitAutoSwitchToAuto = defineSetting<boolean>('chat.rateLimitAutoSwitchToAuto', ConfigType.Simple, false, vBoolean());

	/** Use the Messages API instead of Chat Completions when supported */
	export const UseAnthropicMessagesApi = defineSetting<boolean | undefined>('chat.anthropic.useMessagesApi', ConfigType.ExperimentBased, true);
	/** Context editing mode for Anthropic Messages API. 'off' disables context editing. */
	export const AnthropicContextEditingMode = defineSetting<'off' | 'clear-thinking' | 'clear-tooluse' | 'clear-both'>('chat.anthropic.contextEditing.mode', ConfigType.ExperimentBased, 'off');
	/** Enable tool search for Anthropic Messages API (deferred tool loading). Uses BM25 for natural language search. */
	export const AnthropicToolSearchEnabled = defineSetting<boolean>('chat.anthropic.toolSearchTool.enabled', ConfigType.Simple, true);
	/** Tool search mode for Anthropic Messages API. 'server' uses server-side regex, 'client' uses local embeddings-based search. */
	export const AnthropicToolSearchMode = defineSetting<'server' | 'client'>('chat.anthropic.toolSearchTool.mode', ConfigType.ExperimentBased, 'server');
	/** Configure reasoning summary style sent to Responses API */
	export const ResponsesApiReasoningSummary = defineSetting<'off' | 'detailed'>('chat.responsesApiReasoningSummary', ConfigType.ExperimentBased, 'detailed');
	/** Enable context_management sent to Responses API */
	export const ResponsesApiContextManagementEnabled = defineSetting<boolean>('chat.responsesApiContextManagement.enabled', ConfigType.ExperimentBased, false);
	/** Enable client-side prompt_cache_key (conversationId:modelFamily) sent to Responses API */
	export const ResponsesApiPromptCacheKeyEnabled = defineSetting<boolean>('chat.responsesApi.promptCacheKey.enabled', ConfigType.ExperimentBased, false);
	/** Enable updated prompt for 5.3Codex model */
	export const Updated53CodexPromptEnabled = defineSetting<boolean>('chat.updated53CodexPrompt.enabled', ConfigType.ExperimentBased, true);
	/** Enable concise prompt experiment for GPT-5.4 model */
	export const EnableGpt54ConcisePromptExp = defineSetting<boolean>('chat.gpt54ConcisePrompt.enabled', ConfigType.ExperimentBased, false);
	/** Enable large prompt experiment for GPT-5.4 model */
	export const EnableGpt54LargePromptExp = defineSetting<boolean>('chat.gpt54LargePrompt.enabled', ConfigType.ExperimentBased, false);
	export const EnableChatImageUpload = defineSetting<boolean>('chat.imageUpload.enabled', ConfigType.ExperimentBased, true);
	/** Thinking token budget for Anthropic extended thinking. If set, enables extended thinking. */
	export const AnthropicThinkingBudget = defineSetting<number>('chat.anthropic.thinking.budgetTokens', ConfigType.Simple, 16000);
	/** Enable Anthropic web search tool for BYOK Claude models */
	export const AnthropicWebSearchToolEnabled = defineSetting<boolean>('chat.anthropic.tools.websearch.enabled', ConfigType.ExperimentBased, false);
	/** Maximum number of web searches allowed per request */
	export const AnthropicWebSearchMaxUses = defineSetting<number>('chat.anthropic.tools.websearch.maxUses', ConfigType.Simple, 5);
	/** List of domains to restrict web search results to */
	export const AnthropicWebSearchAllowedDomains = defineSetting<string[]>('chat.anthropic.tools.websearch.allowedDomains', ConfigType.Simple, []);
	/** List of domains to exclude from web search results */
	export const AnthropicWebSearchBlockedDomains = defineSetting<string[]>('chat.anthropic.tools.websearch.blockedDomains', ConfigType.Simple, []);
	/** User location for personalizing web search results */
	export const AnthropicWebSearchUserLocation = defineSetting<{
		city?: string;
		region?: string;
		country?: string;
		timezone?: string;
	} | null>('chat.anthropic.tools.websearch.userLocation', ConfigType.Simple, null);

	/** User provided code generation instructions for the chat */
	export const CodeGenerationInstructions = defineSetting('chat.codeGeneration.instructions', ConfigType.Simple, [] as CodeGenerationInstruction[]);
	export const TestGenerationInstructions = defineSetting('chat.testGeneration.instructions', ConfigType.Simple, [] as CodeGenerationInstruction[]);
	export const CommitMessageGenerationInstructions = defineSetting('chat.commitMessageGeneration.instructions', ConfigType.Simple, [] as CommitMessageGenerationInstruction[]);
	export const PullRequestDescriptionGenerationInstructions = defineSetting('chat.pullRequestDescriptionGeneration.instructions', ConfigType.Simple, [] as CommitMessageGenerationInstruction[]);
	/** Whether new flows around setting up tests are enabled */
	export const SetupTests = defineSetting<boolean>('chat.setupTests.enabled', ConfigType.Simple, true);
	/** Whether the Copilot TypeScript context provider is enabled and if how */
	export const TypeScriptLanguageContext = defineSetting<boolean>('chat.languageContext.typescript.enabled', ConfigType.ExperimentBased, true);
	export const TypeScriptLanguageContextMode = defineSetting<'minimal' | 'double' | 'fillHalf' | 'fill'>('chat.languageContext.typescript.items', ConfigType.ExperimentBased, 'double');
	export const TypeScriptLanguageContextIncludeDocumentation = defineSetting<boolean>('chat.languageContext.typescript.includeDocumentation', ConfigType.ExperimentBased, false);
	export const TypeScriptLanguageContextCacheTimeout = defineSetting<number>('chat.languageContext.typescript.cacheTimeout', ConfigType.ExperimentBased, 500);
	export const TypeScriptLanguageContextFix = defineSetting<boolean>('chat.languageContext.fix.typescript.enabled', ConfigType.ExperimentBased, false);
	export const TypeScriptLanguageContextInline = defineSetting<boolean>('chat.languageContext.inline.typescript.enabled', ConfigType.ExperimentBased, false);

	export const UseInstructionFiles = defineSetting('chat.codeGeneration.useInstructionFiles', ConfigType.Simple, true);
	export const ReviewAgent = defineSetting('chat.reviewAgent.enabled', ConfigType.Simple, true);
	export const CodeFeedback = defineSetting('chat.reviewSelection.enabled', ConfigType.Simple, true);
	export const CodeFeedbackInstructions = defineSetting('chat.reviewSelection.instructions', ConfigType.Simple, [] as CodeGenerationInstruction[]);

	export const UseProjectTemplates = defineSetting('chat.useProjectTemplates', ConfigType.Simple, true);
	export const ExplainScopeSelection = defineSetting('chat.scopeSelection', ConfigType.Simple, false);
	export const EnableCodeActions = defineSetting('editor.enableCodeActions', ConfigType.Simple, true);
	export const LocaleOverride = defineSetting('chat.localeOverride', ConfigType.Simple, 'auto');
	export const TerminalChatLocation = defineSetting('chat.terminalChatLocation', ConfigType.Simple, 'chatView');
	export const AutomaticRenameSuggestions = defineSetting('renameSuggestions.triggerAutomatically', ConfigType.Simple, true);
	export const TerminalToDebuggerEnabled = defineSetting('chat.copilotDebugCommand.enabled', ConfigType.Simple, true);
	export const CodeSearchAgentEnabled = defineSetting<boolean>('chat.codesearch.enabled', ConfigType.Simple, false);
	export const ClaudeAgentEnabled = defineSetting<boolean>('chat.claudeAgent.enabled', ConfigType.Simple, true);
	export const ClaudeAgentAllowDangerouslySkipPermissions = defineSetting<boolean>('chat.claudeAgent.allowDangerouslySkipPermissions', ConfigType.Simple, false);
	export const InlineEditsEnabled = defineSetting<boolean>('nextEditSuggestions.enabled', ConfigType.ExperimentBased, true);
	export const InlineEditsEnableDiagnosticsProvider = defineSetting<boolean>('nextEditSuggestions.fixes', ConfigType.ExperimentBased, true);
	export const InlineEditsAllowWhitespaceOnlyChanges = defineSetting<boolean>('nextEditSuggestions.allowWhitespaceOnlyChanges', ConfigType.ExperimentBased, true);
	/** Because of migration the value returned may be `boolean | "onlyWithEdit" | "jump" | undefined` */
	export const InlineEditsNextCursorPredictionEnabled = defineSetting<boolean>('nextEditSuggestions.extendedRange', ConfigType.ExperimentBased, false, undefined, { oldKey: 'chat.advanced.inlineEdits.nextCursorPrediction.enabled' });
	export const NewWorkspaceCreationAgentEnabled = defineSetting<boolean>('chat.newWorkspaceCreation.enabled', ConfigType.Simple, true);
	export const NewWorkspaceUseContext7 = defineSetting<boolean>('chat.newWorkspace.useContext7', ConfigType.Simple, false);
	export const SummarizeAgentConversationHistory = defineSetting<boolean>('chat.summarizeAgentConversationHistory.enabled', ConfigType.Simple, true);
	export const VirtualToolThreshold = defineSetting<number>('chat.virtualTools.threshold', ConfigType.ExperimentBased, HARD_TOOL_LIMIT);
	export const CurrentEditorAgentContext = defineSetting<boolean>('chat.agent.currentEditorContext.enabled', ConfigType.Simple, true);
	/** BYOK  */
	export const AutoFixDiagnostics = defineSetting<boolean>('chat.agent.autoFix', ConfigType.ExperimentBased, false);
	export const NotebookFollowCellExecution = defineSetting<boolean>('chat.notebook.followCellExecution.enabled', ConfigType.Simple, false);
	export const UseAlternativeNESNotebookFormat = defineSetting<boolean>('chat.notebook.enhancedNextEditSuggestions.enabled', ConfigType.ExperimentBased, false);
	export const CustomInstructionsInSystemMessage = defineSetting<boolean>('chat.customInstructionsInSystemMessage', ConfigType.Simple, true);

	export const EnableAlternateGptPrompt = defineSetting<boolean>('chat.alternateGptPrompt.enabled', ConfigType.ExperimentBased, false);
	export const EnableAlternateGeminiModelFPrompt = defineSetting<boolean>('chat.alternateGeminiModelFPrompt.enabled', ConfigType.ExperimentBased, false);

	export const EnableOrganizationCustomAgents = defineSetting<boolean>('chat.organizationCustomAgents.enabled', ConfigType.Simple, true);
	export const EnableOrganizationInstructions = defineSetting<boolean>('chat.organizationInstructions.enabled', ConfigType.Simple, true);

	export const CompletionsFetcher = defineSetting<FetcherId | undefined>('chat.completionsFetcher', ConfigType.ExperimentBased, undefined);
	export const NextEditSuggestionsFetcher = defineSetting<FetcherId | undefined>('chat.nesFetcher', ConfigType.ExperimentBased, undefined);

	export const GitHubMcpEnabled = defineSetting<boolean>('chat.githubMcpServer.enabled', ConfigType.ExperimentBased, false);
	export const GitHubMcpToolsets = defineSetting<string[]>('chat.githubMcpServer.toolsets', ConfigType.Simple, ['default']);
	export const GitHubMcpReadonly = defineSetting<boolean>('chat.githubMcpServer.readonly', ConfigType.Simple, false);
	export const GitHubMcpLockdown = defineSetting<boolean>('chat.githubMcpServer.lockdown', ConfigType.Simple, false);
	export type GitHubMcpChannelValue = 'stable' | 'insiders';
	export const GitHubMcpChannel = defineSetting<GitHubMcpChannelValue>('chat.githubMcpServer.channel', ConfigType.Simple, 'stable');

	export const GetSearchResultsViewSkill = defineSetting<boolean>('chat.getSearchViewResultsSkill.enabled', ConfigType.ExperimentBased, false);

	export const BackgroundAgentEnabled = defineSetting<boolean>('chat.backgroundAgent.enabled', ConfigType.Simple, true);
	export const CloudAgentEnabled = defineSetting<boolean>('chat.cloudAgent.enabled', ConfigType.Simple, true);
	export const AdditionalReadAccessPaths = defineSetting<string[]>('chat.additionalReadAccessPaths', ConfigType.Simple, []);
	export const SwitchAgentEnabled = defineSetting<boolean>('chat.switchAgent.enabled', ConfigType.ExperimentBased, false);

	/** Additional tools to enable for the Plan agent (additive to base tools) */
	export const PlanAgentAdditionalTools = defineSetting<string[]>('chat.planAgent.additionalTools', ConfigType.Simple, []);

	/** Model override for Implement agent (empty = use default) */
	export const ImplementAgentModel = defineSetting<string>('chat.implementAgent.model', ConfigType.Simple, '');

	/** Additional tools to enable for the Ask agent (additive to base tools) */
	export const AskAgentAdditionalTools = defineSetting<string[]>('chat.askAgent.additionalTools', ConfigType.Simple, []);
	/** Model override for Ask agent (empty = use default) */
	export const AskAgentModel = defineSetting<string>('chat.askAgent.model', ConfigType.Simple, '');

	/** Whether the Explore (Code Research) subagent is enabled */
	export const ExploreAgentEnabled = defineSetting<boolean>('chat.exploreAgent.enabled', ConfigType.ExperimentBased, true);
	/** Model override for Explore (Code Research) agent — reads from core `chat.exploreAgent.defaultModel` */
	export const ExploreAgentModel = defineSetting<string>('chat.exploreAgent.model', ConfigType.Simple, '');

	export const CopilotMemoryEnabled = defineSetting<boolean>('chat.copilotMemory.enabled', ConfigType.ExperimentBased, false);
	export const MemoryToolEnabled = defineSetting<boolean>('chat.tools.memory.enabled', ConfigType.ExperimentBased, true);
	export const ViewImageToolEnabled = defineSetting<boolean>('chat.tools.viewImage.enabled', ConfigType.ExperimentBased, true);
}

export function getAllConfigKeys(): string[] {
	return Object.values(ConfigKey).flatMap(namespace =>
		Object.values(namespace).map(setting => setting.fullyQualifiedId)
	);
}

const nextEditProviderIds: string[] = [];
export function registerNextEditProviderId(providerId: string): string {
	nextEditProviderIds.push(providerId);
	return providerId;
}
