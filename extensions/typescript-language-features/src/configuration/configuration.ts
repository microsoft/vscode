/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../tsServer/protocol/protocol';
import * as objects from '../utils/objects';

export enum TsServerLogLevel {
	Off,
	Normal,
	Terse,
	Verbose,
	RequestTime
}

export namespace TsServerLogLevel {
	export function fromString(value: string): TsServerLogLevel {
		switch (value?.toLowerCase()) {
			case 'normal':
				return TsServerLogLevel.Normal;
			case 'terse':
				return TsServerLogLevel.Terse;
			case 'verbose':
				return TsServerLogLevel.Verbose;
			case 'requestTime':
				return TsServerLogLevel.RequestTime;
			case 'off':
			default:
				return TsServerLogLevel.Off;
		}
	}

	export function toString(value: TsServerLogLevel): string {
		switch (value) {
			case TsServerLogLevel.Normal:
				return 'normal';
			case TsServerLogLevel.Terse:
				return 'terse';
			case TsServerLogLevel.Verbose:
				return 'verbose';
			case TsServerLogLevel.RequestTime:
				return 'requestTime';
			case TsServerLogLevel.Off:
			default:
				return 'off';
		}
	}
}

export const enum SyntaxServerConfiguration {
	Never,
	Always,
	/** Use a single syntax server for every request, even on desktop */
	Auto,
}

export class ImplicitProjectConfiguration {

	public readonly target: string | undefined;
	public readonly module: string | undefined;
	public readonly checkJs: boolean;
	public readonly experimentalDecorators: boolean;
	public readonly strictNullChecks: boolean;
	public readonly strictFunctionTypes: boolean;
	public readonly strict: boolean;

	constructor(configuration: vscode.WorkspaceConfiguration) {
		this.target = ImplicitProjectConfiguration.readTarget(configuration);
		this.module = ImplicitProjectConfiguration.readModule(configuration);
		this.checkJs = ImplicitProjectConfiguration.readCheckJs(configuration);
		this.experimentalDecorators = ImplicitProjectConfiguration.readExperimentalDecorators(configuration);
		this.strictNullChecks = ImplicitProjectConfiguration.readImplicitStrictNullChecks(configuration);
		this.strictFunctionTypes = ImplicitProjectConfiguration.readImplicitStrictFunctionTypes(configuration);
		this.strict = ImplicitProjectConfiguration.readImplicitStrict(configuration);
	}

	public isEqualTo(other: ImplicitProjectConfiguration): boolean {
		return objects.equals(this, other);
	}

	private static readTarget(configuration: vscode.WorkspaceConfiguration): string | undefined {
		return configuration.get<string>('js/ts.implicitProjectConfig.target');
	}

	private static readModule(configuration: vscode.WorkspaceConfiguration): string | undefined {
		return configuration.get<string>('js/ts.implicitProjectConfig.module');
	}

	private static readCheckJs(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.checkJs', false);
	}

	private static readExperimentalDecorators(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.experimentalDecorators', false);
	}

	private static readImplicitStrictNullChecks(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.strictNullChecks', true);
	}

	private static readImplicitStrictFunctionTypes(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.strictFunctionTypes', true);
	}

	private static readImplicitStrict(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.strict', true);
	}
}

export interface TypeScriptServiceConfiguration {
	readonly locale: string | null;
	readonly globalTsdk: string | null;
	readonly localTsdk: string | null;
	readonly npmLocation: string | null;
	readonly tsServerLogLevel: TsServerLogLevel;
	readonly tsServerPluginPaths: readonly string[];
	readonly implicitProjectConfiguration: ImplicitProjectConfiguration;
	readonly disableAutomaticTypeAcquisition: boolean;
	readonly useSyntaxServer: SyntaxServerConfiguration;
	readonly webProjectWideIntellisenseEnabled: boolean;
	readonly webProjectWideIntellisenseSuppressSemanticErrors: boolean;
	readonly webTypeAcquisitionEnabled: boolean;
	readonly enableDiagnosticsTelemetry: boolean;
	readonly enableProjectDiagnostics: boolean;
	readonly maxTsServerMemory: number;
	readonly enablePromptUseWorkspaceTsdk: boolean;
	readonly useVsCodeWatcher: boolean;
	readonly watchOptions: Proto.WatchOptions | undefined;
	readonly includePackageJsonAutoImports: 'auto' | 'on' | 'off' | undefined;
	readonly enableTsServerTracing: boolean;
	readonly localNodePath: string | null;
	readonly globalNodePath: string | null;
	readonly workspaceSymbolsExcludeLibrarySymbols: boolean;
	readonly enableRegionDiagnostics: boolean;
}

export function areServiceConfigurationsEqual(a: TypeScriptServiceConfiguration, b: TypeScriptServiceConfiguration): boolean {
	return objects.equals(a, b);
}

export interface ServiceConfigurationProvider {
	loadFromWorkspace(): TypeScriptServiceConfiguration;
}

const vscodeWatcherName = 'vscode';
type vscodeWatcherName = typeof vscodeWatcherName;


export abstract class BaseServiceConfigurationProvider implements ServiceConfigurationProvider {

	public loadFromWorkspace(): TypeScriptServiceConfiguration {
		const configuration = vscode.workspace.getConfiguration();
		return {
			locale: this.readLocale(configuration),
			globalTsdk: this.readGlobalTsdk(configuration),
			localTsdk: this.readLocalTsdk(configuration),
			npmLocation: this.readNpmLocation(configuration),
			tsServerLogLevel: this.readTsServerLogLevel(configuration),
			tsServerPluginPaths: this.readTsServerPluginPaths(configuration),
			implicitProjectConfiguration: new ImplicitProjectConfiguration(configuration),
			disableAutomaticTypeAcquisition: this.readDisableAutomaticTypeAcquisition(configuration),
			useSyntaxServer: this.readUseSyntaxServer(configuration),
			webProjectWideIntellisenseEnabled: this.readWebProjectWideIntellisenseEnable(configuration),
			webProjectWideIntellisenseSuppressSemanticErrors: this.readWebProjectWideIntellisenseSuppressSemanticErrors(configuration),
			webTypeAcquisitionEnabled: this.readWebTypeAcquisition(configuration),
			enableDiagnosticsTelemetry: this.readEnableDiagnosticsTelemetry(configuration),
			enableProjectDiagnostics: this.readEnableProjectDiagnostics(configuration),
			maxTsServerMemory: this.readMaxTsServerMemory(configuration),
			enablePromptUseWorkspaceTsdk: this.readEnablePromptUseWorkspaceTsdk(configuration),
			useVsCodeWatcher: this.readUseVsCodeWatcher(configuration),
			watchOptions: this.readWatchOptions(configuration),
			includePackageJsonAutoImports: this.readIncludePackageJsonAutoImports(configuration),
			enableTsServerTracing: this.readEnableTsServerTracing(configuration),
			localNodePath: this.readLocalNodePath(configuration),
			globalNodePath: this.readGlobalNodePath(configuration),
			workspaceSymbolsExcludeLibrarySymbols: this.readWorkspaceSymbolsExcludeLibrarySymbols(configuration),
			enableRegionDiagnostics: this.readEnableRegionDiagnostics(configuration),
		};
	}

	protected abstract readGlobalTsdk(configuration: vscode.WorkspaceConfiguration): string | null;
	protected abstract readLocalTsdk(configuration: vscode.WorkspaceConfiguration): string | null;
	protected abstract readLocalNodePath(configuration: vscode.WorkspaceConfiguration): string | null;
	protected abstract readGlobalNodePath(configuration: vscode.WorkspaceConfiguration): string | null;

	protected readTsServerLogLevel(configuration: vscode.WorkspaceConfiguration): TsServerLogLevel {
		const setting = configuration.get<string>('typescript.tsserver.log', 'off');
		return TsServerLogLevel.fromString(setting);
	}

	protected readTsServerPluginPaths(configuration: vscode.WorkspaceConfiguration): string[] {
		return configuration.get<string[]>('typescript.tsserver.pluginPaths', []);
	}

	protected readNpmLocation(configuration: vscode.WorkspaceConfiguration): string | null {
		return configuration.get<string | null>('typescript.npm', null);
	}

	protected readDisableAutomaticTypeAcquisition(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.disableAutomaticTypeAcquisition', false);
	}

	protected readLocale(configuration: vscode.WorkspaceConfiguration): string | null {
		const value = configuration.get<string>('typescript.locale', 'auto');
		return !value || value === 'auto' ? null : value;
	}

	protected readUseSyntaxServer(configuration: vscode.WorkspaceConfiguration): SyntaxServerConfiguration {
		const value = configuration.get<string>('typescript.tsserver.useSyntaxServer');
		switch (value) {
			case 'never': return SyntaxServerConfiguration.Never;
			case 'always': return SyntaxServerConfiguration.Always;
			case 'auto': return SyntaxServerConfiguration.Auto;
		}

		// Fallback to deprecated setting
		const deprecatedValue = configuration.get<boolean | string>('typescript.tsserver.useSeparateSyntaxServer', true);
		if (deprecatedValue === 'forAllRequests') { // Undocumented setting
			return SyntaxServerConfiguration.Always;
		}
		if (deprecatedValue === true) {
			return SyntaxServerConfiguration.Auto;
		}
		return SyntaxServerConfiguration.Never;
	}

	protected readEnableDiagnosticsTelemetry(configuration: vscode.WorkspaceConfiguration): boolean {
		// This setting does not appear in the settings view, as it is not to be enabled by users outside the team
		return configuration.get<boolean>('typescript.enableDiagnosticsTelemetry', false);
	}

	protected readEnableProjectDiagnostics(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.tsserver.experimental.enableProjectDiagnostics', false);
	}

	private readUseVsCodeWatcher(configuration: vscode.WorkspaceConfiguration): boolean {
		const watcherExcludes = configuration.get<Record<string, boolean>>('files.watcherExclude') ?? {};
		if (
			watcherExcludes['**/node_modules/*/**'] === true || // VS Code default prior to 1.94.x
			watcherExcludes['**/node_modules/**'] === true ||
			watcherExcludes['**/node_modules'] === true ||
			watcherExcludes['**'] === true	 					// VS Code Watching is entirely disabled
		) {
			return false;
		}

		const experimentalConfig = configuration.inspect('typescript.tsserver.experimental.useVsCodeWatcher');
		if (typeof experimentalConfig?.globalValue === 'boolean') {
			return experimentalConfig.globalValue;
		}
		if (typeof experimentalConfig?.workspaceValue === 'boolean') {
			return experimentalConfig.workspaceValue;
		}
		if (typeof experimentalConfig?.workspaceFolderValue === 'boolean') {
			return experimentalConfig.workspaceFolderValue;
		}

		return configuration.get<Proto.WatchOptions | vscodeWatcherName>('typescript.tsserver.watchOptions', vscodeWatcherName) === vscodeWatcherName;
	}

	private readWatchOptions(configuration: vscode.WorkspaceConfiguration): Proto.WatchOptions | undefined {
		const watchOptions = configuration.get<Proto.WatchOptions | vscodeWatcherName>('typescript.tsserver.watchOptions');
		if (watchOptions === vscodeWatcherName) {
			return undefined;
		}

		// Returned value may be a proxy. Clone it into a normal object
		return { ...(watchOptions ?? {}) };
	}

	protected readIncludePackageJsonAutoImports(configuration: vscode.WorkspaceConfiguration): 'auto' | 'on' | 'off' | undefined {
		return configuration.get<'auto' | 'on' | 'off'>('typescript.preferences.includePackageJsonAutoImports');
	}

	protected readMaxTsServerMemory(configuration: vscode.WorkspaceConfiguration): number {
		const defaultMaxMemory = 3072;
		const minimumMaxMemory = 128;
		const memoryInMB = configuration.get<number>('typescript.tsserver.maxTsServerMemory', defaultMaxMemory);
		if (!Number.isSafeInteger(memoryInMB)) {
			return defaultMaxMemory;
		}
		return Math.max(memoryInMB, minimumMaxMemory);
	}

	protected readEnablePromptUseWorkspaceTsdk(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.enablePromptUseWorkspaceTsdk', false);
	}

	protected readEnableTsServerTracing(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.tsserver.enableTracing', false);
	}

	private readWorkspaceSymbolsExcludeLibrarySymbols(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.workspaceSymbols.excludeLibrarySymbols', true);
	}

	private readWebProjectWideIntellisenseEnable(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.tsserver.web.projectWideIntellisense.enabled', true);
	}

	private readWebProjectWideIntellisenseSuppressSemanticErrors(configuration: vscode.WorkspaceConfiguration): boolean {
		return this.readWebTypeAcquisition(configuration) && configuration.get<boolean>('typescript.tsserver.web.projectWideIntellisense.suppressSemanticErrors', false);
	}

	private readWebTypeAcquisition(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.tsserver.web.typeAcquisition.enabled', true);
	}

	private readEnableRegionDiagnostics(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.tsserver.enableRegionDiagnostics', true);
	}
}
