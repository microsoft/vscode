/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { packageJson } from '../../../../../platform/env/common/packagejson';
import { createServiceIdentifier } from '../../../../../util/common/services';
import { ServicesAccessor } from '../../../../../util/vs/platform/instantiation/common/instantiation';
import { CopilotConfigPrefix } from './constants';
import { Filter } from './experiments/filters';
import { Emitter, Event } from './util/event';

export { packageJson };

export const ConfigKey = {
	Enable: 'enable',
	UserSelectedCompletionModel: 'selectedCompletionModel',

	ShowEditorCompletions: 'editor.showEditorCompletions',
	EnableAutoCompletions: 'editor.enableAutoCompletions',
	DelayCompletions: 'editor.delayCompletions',
	FilterCompletions: 'editor.filterCompletions',
	CompletionsDelay: 'completionsDelay',
	CompletionsDebounce: 'completionsDebounce',

	// Advanced config (don't add new config here)
	RelatedFilesVSCodeCSharp: 'advanced.relatedFilesVSCodeCSharp',
	RelatedFilesVSCodeTypeScript: 'advanced.relatedFilesVSCodeTypeScript',
	RelatedFilesVSCode: 'advanced.relatedFilesVSCode',
	ContextProviders: 'advanced.contextProviders',
	DebugFilterLogCategories: 'advanced.debug.filterLogCategories',
	DebugSnippyOverrideUrl: 'advanced.debug.codeRefOverrideUrl',
	UseSubsetMatching: 'advanced.useSubsetMatching',
	ContextProviderTimeBudget: 'advanced.contextProviderTimeBudget',

	// Internal config
	DebugOverrideCapiUrl: 'internal.capiUrl',
	DebugOverrideCapiUrlLegacy: 'advanced.debug.overrideCapiUrl',
	DebugTestOverrideCapiUrl: 'internal.capiTestUrl',
	DebugTestOverrideCapiUrlLegacy: 'advanced.debug.testOverrideCapiUrl',
	DebugOverrideProxyUrl: 'internal.completionsUrl',
	DebugOverrideProxyUrlLegacy: 'advanced.debug.overrideProxyUrl',
	DebugTestOverrideProxyUrl: 'internal.completionsTestUrl',
	DebugTestOverrideProxyUrlLegacy: 'advanced.debug.testOverrideProxyUrl',
	DebugOverrideEngine: 'internal.completionModel',
	DebugOverrideEngineLegacy: 'advanced.debug.overrideEngine',
	/**
	 * Internal experiment for always requesting multiline completions.
	 * This might not result always in a multiline suggestion, but most often will.
	 */
	AlwaysRequestMultiline: 'internal.alwaysRequestMultiline',
	/**
	 * Let the model terminate single line completions when AlwaysRequestMultiline is enabled.
	 */
	ModelAlwaysTerminatesSingleline: 'internal.modelAlwaysTerminatesSingleline',

	/**
	 * Overrides whether to use the Workspace Context Coordinator to coordinate workspace context.
	 * This setting takes precedence over the value from ExP.
	 */
	UseWorkspaceContextCoordinator: 'internal.useWorkspaceContextCoordinator',

	/**
	 * Overrides whether to include neighboring files in the prompt
	 * alongside context providers.
	 * This setting takes precedence over the value from ExP.
	 */
	IncludeNeighboringFiles: 'internal.includeNeighboringFiles',
	ExcludeRelatedFiles: 'internal.excludeRelatedFiles',
	DebugOverrideCppHeadersEnableSwitch: 'internal.cppHeadersEnableSwitch',

	/**
	 * Internal config for using the completions prompt with split context.
	 * https://github.com/github/copilot/issues/19286
	 */
	UseSplitContextPrompt: 'internal.useSplitContextPrompt',
};

export type ConfigKeyType = string;

// How to determine where to terminate the completion to the current block.
export enum BlockMode {
	/**
	 * Parse the context + completion on the client using treesitter to
	 * determine blocks.
	 */
	Parsing = 'parsing',
	/**
	 * Let the server parse out blocks and assume that the completion terminates
	 * at the end of a block.
	 */
	Server = 'server',
	/**
	 * Runs both the treesitter parsing on the client plus indentation-based
	 * truncation on the proxy.
	 */
	ParsingAndServer = 'parsingandserver',
	/**
	 * Client-based heuristic to display more multiline completions.
	 * It almost always requests a multiline completion from the server and tries to break it up to something useful on the client.
	 *
	 * This should not be rolled out at the moment (latency impact is high, UX needs further fine-tuning),
	 * but can  be used for internal experimentation.
	 */
	MoreMultiline = 'moremultiline',
}

export function shouldDoServerTrimming(blockMode: BlockMode): boolean {
	return [BlockMode.Server, BlockMode.ParsingAndServer].includes(blockMode);
}

// TODO rework this enum so that the normal/nightly and prod/dev distinctions are orthogonal. (dev builds should behave like nightly?)
export enum BuildType {
	DEV = 'dev',
	PROD = 'prod',
	NIGHTLY = 'nightly',
}

export const ICompletionsConfigProvider = createServiceIdentifier<ICompletionsConfigProvider>('ICompletionsConfigProvider');
export interface ICompletionsConfigProvider {
	readonly _serviceBrand: undefined;

	getConfig<T>(key: ConfigKeyType): T;
	getOptionalConfig<T>(key: ConfigKeyType): T | undefined;
	dumpForTelemetry(): { [key: string]: string };
	onDidChangeCopilotSettings: Event<ConfigProvider>;
}

export abstract class ConfigProvider implements ICompletionsConfigProvider {
	declare _serviceBrand: undefined;
	abstract getConfig<T>(key: ConfigKeyType): T;
	abstract getOptionalConfig<T>(key: ConfigKeyType): T | undefined;
	abstract dumpForTelemetry(): { [key: string]: string };
	abstract onDidChangeCopilotSettings: Event<ConfigProvider>;

	// The language server receives workspace configuration *after* it is fully initialized, which creates a race
	// condition where an incoming request immediately after initialization might have the default values. Awaiting
	// this promise allows consumers to ensure that the configuration is ready before using it.
	requireReady(): Promise<void> {
		return Promise.resolve();
	}
}

/** Provides only the default values, ignoring the user's settings.
 * @public KEEPING FOR TESTS
*/
export class DefaultsOnlyConfigProvider extends ConfigProvider {
	override getConfig<T>(key: ConfigKeyType): T {
		// hardcode default values for the agent, for now
		return getConfigDefaultForKey<T>(key);
	}

	override getOptionalConfig<T>(key: ConfigKeyType): T | undefined {
		return getOptionalConfigDefaultForKey<T>(key);
	}

	override dumpForTelemetry(): { [key: string]: string } {
		return {};
	}

	override onDidChangeCopilotSettings = () => {
		// no-op, since this provider does not support changing settings
		return {
			dispose: () => { },
		};
	};
}

/**
 * A ConfigProvider that allows overriding of config values.
 * @public KEEPING FOR TESTS
*/
export class InMemoryConfigProvider extends ConfigProvider {
	protected readonly copilotEmitter = new Emitter<this>();
	readonly onDidChangeCopilotSettings = this.copilotEmitter.event;
	private overrides: Map<ConfigKeyType, unknown> = new Map();

	constructor(
		private readonly baseConfigProvider: ConfigProvider,
	) {
		super();
	}

	setOverrides(overrides: Map<ConfigKeyType, unknown>): void {
		this.overrides = overrides;
	}

	clearOverrides(): void {
		this.overrides.clear();
	}

	protected getOptionalOverride<T>(key: ConfigKeyType): T | undefined {
		return this.overrides.get(key) as T | undefined;
	}

	override getConfig<T>(key: ConfigKeyType): T {
		return this.getOptionalOverride(key) ?? this.baseConfigProvider.getConfig(key);
	}

	override getOptionalConfig<T>(key: ConfigKeyType): T | undefined {
		return this.getOptionalOverride(key) ?? this.baseConfigProvider.getOptionalConfig(key);
	}

	setConfig(key: ConfigKeyType, value: unknown): void {
		this.setCopilotSettings({ [key]: value });
	}

	setCopilotSettings(settings: Record<ConfigKeyType, unknown>): void {
		for (const [key, value] of Object.entries(settings)) {
			if (value !== undefined) {
				this.overrides.set(key, value);
			} else {
				this.overrides.delete(key);
			}
		}
		this.copilotEmitter.fire(this);
	}

	override dumpForTelemetry(): { [key: string]: string } {
		const config = this.baseConfigProvider.dumpForTelemetry();
		// reflects what's mapped in Hydro
		for (const key of [
			ConfigKey.ShowEditorCompletions,
			ConfigKey.EnableAutoCompletions,
			ConfigKey.DelayCompletions,
			ConfigKey.FilterCompletions,
		]) {
			const value = this.overrides.get(key);
			if (value !== undefined) {
				config[key] = JSON.stringify(value);
			}
		}
		return config;
	}


}

export function getConfigKeyRecursively<T>(config: Record<string, unknown>, key: string): T | undefined {
	let value: unknown = config;
	const prefix: string[] = [];
	for (const segment of key.split('.')) {
		const child = [...prefix, segment].join('.');
		if (value && typeof value === 'object' && child in value) {
			value = (value as { [key: string]: unknown })[child];
			prefix.length = 0;
		} else {
			prefix.push(segment);
		}
	}
	if (value === undefined || prefix.length > 0) { return; }
	return value as T;
}

export function getConfigDefaultForKey<T>(key: string): T {
	if (configDefaults.has(key)) {
		return configDefaults.get(key) as T;
	}
	throw new Error(`Missing config default value: ${CopilotConfigPrefix}.${key}`);
}

export function getOptionalConfigDefaultForKey<T>(key: string): T | undefined {
	return <T>configDefaults.get(key);
}

/**
 * Defaults for "hidden" config keys.  These are supplemented by the defaults in package.json.
 */
const configDefaults = new Map<ConfigKeyType, unknown>([
	[ConfigKey.DebugOverrideCppHeadersEnableSwitch, false],
	[ConfigKey.RelatedFilesVSCodeCSharp, false],
	[ConfigKey.RelatedFilesVSCodeTypeScript, false],
	[ConfigKey.RelatedFilesVSCode, false],
	[ConfigKey.IncludeNeighboringFiles, false],
	[ConfigKey.ExcludeRelatedFiles, false],
	[ConfigKey.ContextProviders, []],
	[ConfigKey.DebugSnippyOverrideUrl, ''],
	[ConfigKey.UseSubsetMatching, null],
	[ConfigKey.ContextProviderTimeBudget, undefined],
	[ConfigKey.DebugOverrideCapiUrl, ''],
	[ConfigKey.DebugTestOverrideCapiUrl, ''],
	[ConfigKey.DebugOverrideProxyUrl, ''],
	[ConfigKey.DebugTestOverrideProxyUrl, ''],
	[ConfigKey.DebugOverrideEngine, ''],
	[ConfigKey.AlwaysRequestMultiline, undefined],
	[ConfigKey.CompletionsDebounce, undefined],
	[ConfigKey.CompletionsDelay, undefined],
	[ConfigKey.ModelAlwaysTerminatesSingleline, undefined],
	[ConfigKey.UseWorkspaceContextCoordinator, undefined],


	// These are only used for telemetry from LSP based editors and do not affect any behavior.
	[ConfigKey.ShowEditorCompletions, undefined],
	[ConfigKey.EnableAutoCompletions, undefined],
	[ConfigKey.DelayCompletions, undefined],
	[ConfigKey.FilterCompletions, undefined],
	[ConfigKey.UseSplitContextPrompt, true],

	// These are defaults from package.json
	[ConfigKey.Enable, { '*': true, 'plaintext': false, 'markdown': false, 'scminput': false }],
	[ConfigKey.UserSelectedCompletionModel, ''],

	// These are advanced defaults from package.json
	[ConfigKey.DebugOverrideEngineLegacy, ''],
	[ConfigKey.DebugOverrideProxyUrlLegacy, ''],
	[ConfigKey.DebugTestOverrideProxyUrlLegacy, ''],
	[ConfigKey.DebugOverrideCapiUrlLegacy, ''],
	[ConfigKey.DebugTestOverrideCapiUrlLegacy, ''],
	[ConfigKey.DebugFilterLogCategories, []],
]);

export function getConfig<T>(accessor: ServicesAccessor, key: ConfigKeyType): T {
	return accessor.get(ICompletionsConfigProvider).getConfig(key);
}

export function dumpForTelemetry(accessor: ServicesAccessor) {
	try {
		return accessor.get(ICompletionsConfigProvider).dumpForTelemetry();
	} catch (e) {
		console.error(`Error dumping config for telemetry: ${e}`);
		return {};
	}
}

export class BuildInfo {

	static isPreRelease(): boolean {
		return this.getBuildType() === BuildType.NIGHTLY;
	}

	static isProduction(): boolean {
		return this.getBuildType() !== BuildType.DEV;
	}

	static getBuildType(): BuildType {
		const buildType = <'dev' | 'prod'>packageJson.buildType;
		if (buildType === 'prod') {
			return BuildInfo.getVersion().length === 15 ? BuildType.NIGHTLY : BuildType.PROD;
		}
		return BuildType.DEV;
	}

	static getVersion(): string {
		return packageJson.version;
	}

	static getBuild(): string {
		return packageJson.build;
	}
}

type NameAndVersion = {
	name: string;
	version: string;
};

export type EditorInfo = NameAndVersion & {
	// The root directory of the installation, currently only used to simplify stack traces.
	root?: string;
	// A programmatic name, used for error reporting.
	devName?: string;
};

export type EditorPluginInfo = NameAndVersion;

export type EditorPluginFilter = { filter: Filter; value: string; isVersion?: boolean };

export function formatNameAndVersion({ name, version }: NameAndVersion): string {
	return `${name}/${version}`;
}

export const ICompletionsEditorAndPluginInfo = createServiceIdentifier<ICompletionsEditorAndPluginInfo>('ICompletionsEditorAndPluginInfo');
export interface ICompletionsEditorAndPluginInfo {
	readonly _serviceBrand: undefined;

	getEditorInfo(): EditorInfo;
	getEditorPluginInfo(): EditorPluginInfo;
	getRelatedPluginInfo(): EditorPluginInfo[];
}

/**
 * Do not use this in new code.  Every endpoint has its own unique versioning.
 * Centralizing in a single constant was a mistake.
 * @deprecated
 */
export const apiVersion = '2025-05-01';

export function editorVersionHeaders(accessor: ServicesAccessor): { [key: string]: string } {
	const info = accessor.get(ICompletionsEditorAndPluginInfo);
	return {
		'Editor-Version': formatNameAndVersion(info.getEditorInfo()),
		'Editor-Plugin-Version': formatNameAndVersion(info.getEditorPluginInfo()),
		'Copilot-Language-Server-Version': BuildInfo.getVersion(),
	};
}
