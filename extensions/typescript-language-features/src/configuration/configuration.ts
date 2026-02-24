/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as Proto from '../tsServer/protocol/protocol';
import { readUnifiedConfig } from '../utils/configuration';
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
			locale: this.readLocale(),
			globalTsdk: this.readGlobalTsdk(configuration),
			localTsdk: this.readLocalTsdk(configuration),
			npmLocation: this.readNpmLocation(),
			tsServerLogLevel: this.readTsServerLogLevel(),
			tsServerPluginPaths: this.readTsServerPluginPaths(),
			implicitProjectConfiguration: new ImplicitProjectConfiguration(configuration),
			disableAutomaticTypeAcquisition: this.readDisableAutomaticTypeAcquisition(configuration),
			useSyntaxServer: this.readUseSyntaxServer(configuration),
			webProjectWideIntellisenseEnabled: this.readWebProjectWideIntellisenseEnable(),
			webProjectWideIntellisenseSuppressSemanticErrors: this.readWebProjectWideIntellisenseSuppressSemanticErrors(),
			webTypeAcquisitionEnabled: this.readWebTypeAcquisition(),
			enableDiagnosticsTelemetry: this.readEnableDiagnosticsTelemetry(),
			enableProjectDiagnostics: this.readEnableProjectDiagnostics(),
			maxTsServerMemory: this.readMaxTsServerMemory(),
			enablePromptUseWorkspaceTsdk: this.readEnablePromptUseWorkspaceTsdk(),
			useVsCodeWatcher: this.readUseVsCodeWatcher(configuration),
			watchOptions: this.readWatchOptions(),
			includePackageJsonAutoImports: this.readIncludePackageJsonAutoImports(),
			enableTsServerTracing: this.readEnableTsServerTracing(),
			localNodePath: this.readLocalNodePath(configuration),
			globalNodePath: this.readGlobalNodePath(configuration),
			workspaceSymbolsExcludeLibrarySymbols: this.readWorkspaceSymbolsExcludeLibrarySymbols(),
		};
	}

	protected abstract readGlobalTsdk(configuration: vscode.WorkspaceConfiguration): string | null;
	protected abstract readLocalTsdk(configuration: vscode.WorkspaceConfiguration): string | null;
	protected abstract readLocalNodePath(configuration: vscode.WorkspaceConfiguration): string | null;
	protected abstract readGlobalNodePath(configuration: vscode.WorkspaceConfiguration): string | null;

	protected readTsServerLogLevel(): TsServerLogLevel {
		const setting = readUnifiedConfig<string>('tsserver.log', 'off', { fallbackSection: 'typescript' });
		return TsServerLogLevel.fromString(setting);
	}

	protected readTsServerPluginPaths(): string[] {
		return readUnifiedConfig<string[]>('tsserver.pluginPaths', [], { fallbackSection: 'typescript' });
	}

	protected readNpmLocation(): string | null {
		return readUnifiedConfig<string | null>('tsserver.npm.path', null, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'npm' });
	}

	protected readDisableAutomaticTypeAcquisition(configuration: vscode.WorkspaceConfiguration): boolean {
		const enabled = readUnifiedConfig<boolean | undefined>('tsserver.automaticTypeAcquisition.enabled', undefined, { fallbackSection: 'typescript' });
		if (enabled !== undefined) {
			return !enabled;
		}
		// Fall back to the old deprecated setting
		return configuration.get<boolean>('typescript.disableAutomaticTypeAcquisition', false);
	}

	protected readLocale(): string | null {
		const value = readUnifiedConfig<string>('locale', 'auto', { fallbackSection: 'typescript' });
		return !value || value === 'auto' ? null : value;
	}

	protected readUseSyntaxServer(configuration: vscode.WorkspaceConfiguration): SyntaxServerConfiguration {
		const value = readUnifiedConfig<string | undefined>('tsserver.useSyntaxServer', undefined, { fallbackSection: 'typescript' });
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

	protected readEnableDiagnosticsTelemetry(): boolean {
		// This setting does not appear in the settings view, as it is not to be enabled by users outside the team
		return readUnifiedConfig<boolean>('enableDiagnosticsTelemetry', false, { fallbackSection: 'typescript' });
	}

	protected readEnableProjectDiagnostics(): boolean {
		return readUnifiedConfig<boolean>('tsserver.experimental.enableProjectDiagnostics', false, { fallbackSection: 'typescript' });
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

		return readUnifiedConfig<Proto.WatchOptions | vscodeWatcherName>('tsserver.watchOptions', vscodeWatcherName, { fallbackSection: 'typescript' }) === vscodeWatcherName;
	}

	private readWatchOptions(): Proto.WatchOptions | undefined {
		const watchOptions = readUnifiedConfig<Proto.WatchOptions | vscodeWatcherName | undefined>('tsserver.watchOptions', undefined, { fallbackSection: 'typescript' });
		if (!watchOptions || watchOptions === vscodeWatcherName) {
			return undefined;
		}

		// Returned value may be a proxy. Clone it into a normal object
		return { ...(watchOptions ?? {}) };
	}

	protected readIncludePackageJsonAutoImports(): 'auto' | 'on' | 'off' | undefined {
		return readUnifiedConfig<'auto' | 'on' | 'off' | undefined>('preferences.includePackageJsonAutoImports', undefined, { fallbackSection: 'typescript' });
	}

	protected readMaxTsServerMemory(): number {
		const defaultMaxMemory = 3072;
		const minimumMaxMemory = 128;
		const memoryInMB = readUnifiedConfig<number>('tsserver.maxMemory', defaultMaxMemory, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'tsserver.maxTsServerMemory' });
		if (!Number.isSafeInteger(memoryInMB)) {
			return defaultMaxMemory;
		}
		return Math.max(memoryInMB, minimumMaxMemory);
	}

	protected readEnablePromptUseWorkspaceTsdk(): boolean {
		return readUnifiedConfig<boolean>('tsdk.promptToUseWorkspaceVersion', false, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'enablePromptUseWorkspaceTsdk' });
	}

	protected readEnableTsServerTracing(): boolean {
		return readUnifiedConfig<boolean>('tsserver.tracing.enabled', false, { fallbackSection: 'typescript', fallbackSubSectionNameOverride: 'tsserver.enableTracing' });
	}

	private readWorkspaceSymbolsExcludeLibrarySymbols(): boolean {
		return readUnifiedConfig<boolean>('workspaceSymbols.excludeLibrarySymbols', true, { scope: null, fallbackSection: 'typescript' });
	}

	private readWebProjectWideIntellisenseEnable(): boolean {
		return readUnifiedConfig<boolean>('tsserver.web.projectWideIntellisense.enabled', true, { fallbackSection: 'typescript' });
	}

	private readWebProjectWideIntellisenseSuppressSemanticErrors(): boolean {
		return this.readWebTypeAcquisition() && readUnifiedConfig<boolean>('tsserver.web.projectWideIntellisense.suppressSemanticErrors', false, { fallbackSection: 'typescript' });
	}

	private readWebTypeAcquisition(): boolean {
		return readUnifiedConfig<boolean>('tsserver.web.typeAcquisition.enabled', true, { fallbackSection: 'typescript' });
	}
}
