/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as objects from '../utils/objects';

export enum TsServerLogLevel {
	Off,
	Normal,
	Terse,
	Verbose,
}

export namespace TsServerLogLevel {
	export function fromString(value: string): TsServerLogLevel {
		switch (value && value.toLowerCase()) {
			case 'normal':
				return TsServerLogLevel.Normal;
			case 'terse':
				return TsServerLogLevel.Terse;
			case 'verbose':
				return TsServerLogLevel.Verbose;
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
			case TsServerLogLevel.Off:
			default:
				return 'off';
		}
	}
}

export const enum SeparateSyntaxServerConfiguration {
	Disabled,
	Enabled,
}

export class ImplicitProjectConfiguration {

	public readonly checkJs: boolean;
	public readonly experimentalDecorators: boolean;
	public readonly strictNullChecks: boolean;
	public readonly strictFunctionTypes: boolean;

	constructor(configuration: vscode.WorkspaceConfiguration) {
		this.checkJs = ImplicitProjectConfiguration.readCheckJs(configuration);
		this.experimentalDecorators = ImplicitProjectConfiguration.readExperimentalDecorators(configuration);
		this.strictNullChecks = ImplicitProjectConfiguration.readImplicitStrictNullChecks(configuration);
		this.strictFunctionTypes = ImplicitProjectConfiguration.readImplicitStrictFunctionTypes(configuration);
	}

	public isEqualTo(other: ImplicitProjectConfiguration): boolean {
		return objects.equals(this, other);
	}

	private static readCheckJs(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.checkJs')
			?? configuration.get<boolean>('javascript.implicitProjectConfig.checkJs', false);
	}

	private static readExperimentalDecorators(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.experimentalDecorators')
			?? configuration.get<boolean>('javascript.implicitProjectConfig.experimentalDecorators', false);
	}

	private static readImplicitStrictNullChecks(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.strictNullChecks', false);
	}

	private static readImplicitStrictFunctionTypes(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('js/ts.implicitProjectConfig.strictFunctionTypes', true);
	}
}

export class TypeScriptServiceConfiguration {
	public readonly locale: string | null;
	public readonly globalTsdk: string | null;
	public readonly localTsdk: string | null;
	public readonly npmLocation: string | null;
	public readonly tsServerLogLevel: TsServerLogLevel = TsServerLogLevel.Off;
	public readonly tsServerPluginPaths: readonly string[];
	public readonly implictProjectConfiguration: ImplicitProjectConfiguration;
	public readonly disableAutomaticTypeAcquisition: boolean;
	public readonly separateSyntaxServer: SeparateSyntaxServerConfiguration;
	public readonly enableProjectDiagnostics: boolean;
	public readonly maxTsServerMemory: number;
	public readonly enablePromptUseWorkspaceTsdk: boolean;
	public readonly watchOptions: protocol.WatchOptions | undefined;
	public readonly includePackageJsonAutoImports: 'auto' | 'on' | 'off' | undefined;
	public readonly enableTsServerTracing: boolean;
	public readonly includeInlineParameterNameHints: boolean | undefined;
	public readonly includeInlineFunctionParameterTypeHints: boolean | undefined;
	public readonly includeInlineVariableTypeHints: boolean | undefined;
	public readonly includeInlineNonLiteralParameterNameHints: boolean | undefined;
	public readonly includeInlineDuplicatedParameterNameHints: boolean | undefined;
	public readonly includeInlineRequireAssignedVariableTypeHints: boolean | undefined;
	public readonly includeInlinePropertyDeclarationTypeHints: boolean | undefined;
	public readonly includeInlineFunctionLikeReturnTypeHints: boolean | undefined;
	public readonly includeInlineEnumMemberValueHints: boolean | undefined;
	public readonly includeInlineCallChainsHints: boolean | undefined;

	public static loadFromWorkspace(): TypeScriptServiceConfiguration {
		return new TypeScriptServiceConfiguration();
	}

	private constructor() {
		const configuration = vscode.workspace.getConfiguration();

		this.locale = TypeScriptServiceConfiguration.extractLocale(configuration);
		this.globalTsdk = TypeScriptServiceConfiguration.extractGlobalTsdk(configuration);
		this.localTsdk = TypeScriptServiceConfiguration.extractLocalTsdk(configuration);
		this.npmLocation = TypeScriptServiceConfiguration.readNpmLocation(configuration);
		this.tsServerLogLevel = TypeScriptServiceConfiguration.readTsServerLogLevel(configuration);
		this.tsServerPluginPaths = TypeScriptServiceConfiguration.readTsServerPluginPaths(configuration);
		this.implictProjectConfiguration = new ImplicitProjectConfiguration(configuration);
		this.disableAutomaticTypeAcquisition = TypeScriptServiceConfiguration.readDisableAutomaticTypeAcquisition(configuration);
		this.separateSyntaxServer = TypeScriptServiceConfiguration.readUseSeparateSyntaxServer(configuration);
		this.enableProjectDiagnostics = TypeScriptServiceConfiguration.readEnableProjectDiagnostics(configuration);
		this.maxTsServerMemory = TypeScriptServiceConfiguration.readMaxTsServerMemory(configuration);
		this.enablePromptUseWorkspaceTsdk = TypeScriptServiceConfiguration.readEnablePromptUseWorkspaceTsdk(configuration);
		this.watchOptions = TypeScriptServiceConfiguration.readWatchOptions(configuration);
		this.includePackageJsonAutoImports = TypeScriptServiceConfiguration.readIncludePackageJsonAutoImports(configuration);
		this.enableTsServerTracing = TypeScriptServiceConfiguration.readEnableTsServerTracing(configuration);
		this.includeInlineParameterNameHints = TypeScriptServiceConfiguration.readIncludeInlineParameterNameHints(configuration);
		this.includeInlineFunctionParameterTypeHints = TypeScriptServiceConfiguration.readIncludeInlineFunctionParameterTypeHints(configuration);
		this.includeInlineVariableTypeHints = TypeScriptServiceConfiguration.readIncludeInlineVariableTypeHints(configuration);
		this.includeInlineNonLiteralParameterNameHints = TypeScriptServiceConfiguration.readIncludeInlineNonLiteralParameterNameHints(configuration);
		this.includeInlineDuplicatedParameterNameHints = TypeScriptServiceConfiguration.readIncludeInlineDuplicatedParameterNameHints(configuration);
		this.includeInlineRequireAssignedVariableTypeHints = TypeScriptServiceConfiguration.readIncludeInlineRequireAssignedVariableTypeHints(configuration);
		this.includeInlinePropertyDeclarationTypeHints = TypeScriptServiceConfiguration.readIncludeInlinePropertyDeclarationTypeHints(configuration);
		this.includeInlineFunctionLikeReturnTypeHints = TypeScriptServiceConfiguration.readIncludeInlineFunctionLikeReturnTypeHints(configuration);
		this.includeInlineEnumMemberValueHints = TypeScriptServiceConfiguration.readIncludeInlineEnumMemberValueHints(configuration);
		this.includeInlineCallChainsHints = TypeScriptServiceConfiguration.readIncludeInlineCallChainsHints(configuration);
	}

	public isEqualTo(other: TypeScriptServiceConfiguration): boolean {
		return objects.equals(this, other);
	}

	private static fixPathPrefixes(inspectValue: string): string {
		const pathPrefixes = ['~' + path.sep];
		for (const pathPrefix of pathPrefixes) {
			if (inspectValue.startsWith(pathPrefix)) {
				return path.join(os.homedir(), inspectValue.slice(pathPrefix.length));
			}
		}
		return inspectValue;
	}

	private static extractGlobalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsdk');
		if (inspect && typeof inspect.globalValue === 'string') {
			return this.fixPathPrefixes(inspect.globalValue);
		}
		return null;
	}

	private static extractLocalTsdk(configuration: vscode.WorkspaceConfiguration): string | null {
		const inspect = configuration.inspect('typescript.tsdk');
		if (inspect && typeof inspect.workspaceValue === 'string') {
			return this.fixPathPrefixes(inspect.workspaceValue);
		}
		return null;
	}

	private static readTsServerLogLevel(configuration: vscode.WorkspaceConfiguration): TsServerLogLevel {
		const setting = configuration.get<string>('typescript.tsserver.log', 'off');
		return TsServerLogLevel.fromString(setting);
	}

	private static readTsServerPluginPaths(configuration: vscode.WorkspaceConfiguration): string[] {
		return configuration.get<string[]>('typescript.tsserver.pluginPaths', []);
	}

	private static readNpmLocation(configuration: vscode.WorkspaceConfiguration): string | null {
		return configuration.get<string | null>('typescript.npm', null);
	}

	private static readDisableAutomaticTypeAcquisition(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.disableAutomaticTypeAcquisition', false);
	}

	private static extractLocale(configuration: vscode.WorkspaceConfiguration): string | null {
		return configuration.get<string | null>('typescript.locale', null);
	}

	private static readUseSeparateSyntaxServer(configuration: vscode.WorkspaceConfiguration): SeparateSyntaxServerConfiguration {
		const value = configuration.get('typescript.tsserver.useSeparateSyntaxServer', true);
		if (value === true) {
			return SeparateSyntaxServerConfiguration.Enabled;
		}
		return SeparateSyntaxServerConfiguration.Disabled;
	}

	private static readEnableProjectDiagnostics(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.tsserver.experimental.enableProjectDiagnostics', false);
	}

	private static readWatchOptions(configuration: vscode.WorkspaceConfiguration): protocol.WatchOptions | undefined {
		return configuration.get<protocol.WatchOptions>('typescript.tsserver.watchOptions');
	}

	private static readIncludePackageJsonAutoImports(configuration: vscode.WorkspaceConfiguration): 'auto' | 'on' | 'off' | undefined {
		return configuration.get<'auto' | 'on' | 'off'>('typescript.preferences.includePackageJsonAutoImports');
	}

	private static readMaxTsServerMemory(configuration: vscode.WorkspaceConfiguration): number {
		const defaultMaxMemory = 3072;
		const minimumMaxMemory = 128;
		const memoryInMB = configuration.get<number>('typescript.tsserver.maxTsServerMemory', defaultMaxMemory);
		if (!Number.isSafeInteger(memoryInMB)) {
			return defaultMaxMemory;
		}
		return Math.max(memoryInMB, minimumMaxMemory);
	}

	private static readEnablePromptUseWorkspaceTsdk(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.enablePromptUseWorkspaceTsdk', false);
	}

	private static readEnableTsServerTracing(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.tsserver.enableTracing', false);
	}

	private static readIncludeInlineParameterNameHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineParameterNameHints', true);
	}

	private static readIncludeInlineFunctionParameterTypeHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineFunctionParameterTypeHints', true);
	}

	private static readIncludeInlineVariableTypeHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineVariableTypeHints', false);
	}

	private static readIncludeInlineNonLiteralParameterNameHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineNonLiteralParameterNameHints', false);
	}

	private static readIncludeInlineDuplicatedParameterNameHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineDuplicatedParameterNameHints', false);
	}

	private static readIncludeInlineRequireAssignedVariableTypeHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineRequireAssignedVariableTypeHints', false);
	}

	private static readIncludeInlinePropertyDeclarationTypeHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlinePropertyDeclarationTypeHints', false);
	}

	private static readIncludeInlineFunctionLikeReturnTypeHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineFunctionLikeReturnTypeHints', false);
	}

	private static readIncludeInlineEnumMemberValueHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineEnumMemberValueHints', true);
	}

	private static readIncludeInlineCallChainsHints(configuration: vscode.WorkspaceConfiguration): boolean {
		return configuration.get<boolean>('typescript.inlineHints.includeInlineCallChainsHints', false);
	}
}
