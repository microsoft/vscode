/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */

import * as vscode from 'vscode';
import { CommandManager } from './commands/commandManager';
import { ServiceConfigurationProvider } from './configuration/configuration';
import { DiagnosticLanguage, LanguageDescription } from './configuration/languageDescription';
import { IExperimentationTelemetryReporter } from './experimentTelemetryReporter';
import { DiagnosticKind } from './languageFeatures/diagnostics';
import FileConfigurationManager from './languageFeatures/fileConfigurationManager';
import LanguageProvider from './languageProvider';
import { LogLevelMonitor } from './logging/logLevelMonitor';
import { Logger } from './logging/logger';
import { OngoingRequestCancellerFactory } from './tsServer/cancellation';
import { ILogDirectoryProvider } from './tsServer/logDirectoryProvider';
import { PluginManager } from './tsServer/plugins';
import * as errorCodes from './tsServer/protocol/errorCodes';
import * as Proto from './tsServer/protocol/protocol';
import * as PConst from './tsServer/protocol/protocol.const';
import { TsServerProcessFactory } from './tsServer/server';
import { ITypeScriptVersionProvider } from './tsServer/versionProvider';
import * as typeConverters from './typeConverters';
import TypeScriptServiceClient from './typescriptServiceClient';
import { ActiveJsTsEditorTracker } from './ui/activeJsTsEditorTracker';
import { IntellisenseStatus } from './ui/intellisenseStatus';
import * as LargeProjectStatus from './ui/largeProjectStatus';
import TypingsStatus, { AtaProgressReporter } from './ui/typingsStatus';
import { VersionStatus } from './ui/versionStatus';
import { coalesce } from './utils/arrays';
import { Disposable } from './utils/dispose';

// Style check diagnostics that can be reported as warnings
const styleCheckDiagnostics = new Set([
	...errorCodes.variableDeclaredButNeverUsed,
	...errorCodes.propertyDeclaretedButNeverUsed,
	...errorCodes.allImportsAreUnused,
	...errorCodes.unreachableCode,
	...errorCodes.unusedLabel,
	...errorCodes.fallThroughCaseInSwitch,
	...errorCodes.notAllCodePathsReturnAValue,
]);

export default class TypeScriptServiceClientHost extends Disposable {

	private readonly client: TypeScriptServiceClient;
	private readonly languages: LanguageProvider[] = [];
	private readonly languagePerId = new Map<string, LanguageProvider>();

	private readonly typingsStatus: TypingsStatus;

	private readonly fileConfigurationManager: FileConfigurationManager;

	private reportStyleCheckAsWarnings: boolean = true;

	private readonly commandManager: CommandManager;

	constructor(
		descriptions: LanguageDescription[],
		context: vscode.ExtensionContext,
		onCaseInsensitiveFileSystem: boolean,
		services: {
			pluginManager: PluginManager;
			commandManager: CommandManager;
			logDirectoryProvider: ILogDirectoryProvider;
			cancellerFactory: OngoingRequestCancellerFactory;
			versionProvider: ITypeScriptVersionProvider;
			processFactory: TsServerProcessFactory;
			activeJsTsEditorTracker: ActiveJsTsEditorTracker;
			serviceConfigurationProvider: ServiceConfigurationProvider;
			experimentTelemetryReporter: IExperimentationTelemetryReporter | undefined;
			logger: Logger;
		},
		onCompletionAccepted: (item: vscode.CompletionItem) => void,
	) {
		super();

		this.commandManager = services.commandManager;

		const allModeIds = this.getAllModeIds(descriptions, services.pluginManager);
		this.client = this._register(new TypeScriptServiceClient(
			context,
			onCaseInsensitiveFileSystem,
			services,
			allModeIds));

		this.client.onDiagnosticsReceived(({ kind, resource, diagnostics, spans }) => {
			this.diagnosticsReceived(kind, resource, diagnostics, spans);
		}, null, this._disposables);

		this.client.onConfigDiagnosticsReceived(diag => this.configFileDiagnosticsReceived(diag), null, this._disposables);
		this.client.onResendModelsRequested(() => this.populateService(), null, this._disposables);

		this._register(new VersionStatus(this.client));
		this._register(new IntellisenseStatus(this.client, services.commandManager, services.activeJsTsEditorTracker));
		this._register(new AtaProgressReporter(this.client));
		this.typingsStatus = this._register(new TypingsStatus(this.client));
		this._register(LargeProjectStatus.create(this.client));

		this.fileConfigurationManager = this._register(new FileConfigurationManager(this.client, onCaseInsensitiveFileSystem));

		for (const description of descriptions) {
			const manager = new LanguageProvider(this.client, description, this.commandManager, this.client.telemetryReporter, this.typingsStatus, this.fileConfigurationManager, onCompletionAccepted);
			this.languages.push(manager);
			this._register(manager);
			this.languagePerId.set(description.id, manager);
		}

		import('./languageFeatures/updatePathsOnRename').then(module =>
			this._register(module.register(this.client, this.fileConfigurationManager, uri => this.handles(uri))));

		import('./languageFeatures/workspaceSymbols').then(module =>
			this._register(module.register(this.client, allModeIds)));

		this.client.ensureServiceStarted();
		this.client.onReady(() => {
			const languages = new Set<string>();
			for (const plugin of services.pluginManager.plugins) {
				if (plugin.configNamespace && plugin.languages.length) {
					this.registerExtensionLanguageProvider({
						id: plugin.configNamespace,
						languageIds: Array.from(plugin.languages),
						diagnosticSource: 'ts-plugin',
						diagnosticLanguage: DiagnosticLanguage.TypeScript,
						diagnosticOwner: 'typescript',
						isExternal: true,
						standardFileExtensions: [],
					}, onCompletionAccepted);
				} else {
					for (const language of plugin.languages) {
						languages.add(language);
					}
				}
			}

			if (languages.size) {
				this.registerExtensionLanguageProvider({
					id: 'typescript-plugins',
					languageIds: Array.from(languages.values()),
					diagnosticSource: 'ts-plugin',
					diagnosticLanguage: DiagnosticLanguage.TypeScript,
					diagnosticOwner: 'typescript',
					isExternal: true,
					standardFileExtensions: [],
				}, onCompletionAccepted);
			}
		});

		this.client.onTsServerStarted(() => {
			this.triggerAllDiagnostics();
		});

		vscode.workspace.onDidChangeConfiguration(this.configurationChanged, this, this._disposables);
		this.configurationChanged();
		this._register(new LogLevelMonitor(context));
	}

	private registerExtensionLanguageProvider(description: LanguageDescription, onCompletionAccepted: (item: vscode.CompletionItem) => void) {
		const manager = new LanguageProvider(this.client, description, this.commandManager, this.client.telemetryReporter, this.typingsStatus, this.fileConfigurationManager, onCompletionAccepted);
		this.languages.push(manager);
		this._register(manager);
		this.languagePerId.set(description.id, manager);
	}

	private getAllModeIds(descriptions: LanguageDescription[], pluginManager: PluginManager) {
		return [
			...descriptions.map(x => x.languageIds),
			...pluginManager.plugins.map(x => x.languages)
		].flat();
	}

	public get serviceClient(): TypeScriptServiceClient {
		return this.client;
	}

	public reloadProjects(): void {
		this.client.executeWithoutWaitingForResponse('reloadProjects', null);
		this.triggerAllDiagnostics();
	}

	public async handles(resource: vscode.Uri): Promise<boolean> {
		const provider = await this.findLanguage(resource);
		if (provider) {
			return true;
		}
		return this.client.bufferSyncSupport.handles(resource);
	}

	private configurationChanged(): void {
		const typescriptConfig = vscode.workspace.getConfiguration('typescript');

		this.reportStyleCheckAsWarnings = typescriptConfig.get('reportStyleChecksAsWarnings', true);
	}

	private async findLanguage(resource: vscode.Uri): Promise<LanguageProvider | undefined> {
		try {
			// First try finding language just based on the resource.
			// This is not strictly correct but should be in the vast majority of cases
			// (except when someone goes and maps `.js` to `typescript` or something...)
			for (const language of this.languages) {
				if (language.handlesUri(resource)) {
					return language;
				}
			}

			// If that doesn't work, fallback to using a text document language mode.
			// This is not ideal since we have to open the document but should always
			// be correct
			const doc = await vscode.workspace.openTextDocument(resource);
			return this.languages.find(language => language.handlesDocument(doc));
		} catch {
			return undefined;
		}
	}

	private triggerAllDiagnostics() {
		for (const language of this.languagePerId.values()) {
			language.triggerAllDiagnostics();
		}
	}

	private populateService(): void {
		this.fileConfigurationManager.reset();

		for (const language of this.languagePerId.values()) {
			language.reInitialize();
		}
	}

	private async diagnosticsReceived(
		kind: DiagnosticKind,
		resource: vscode.Uri,
		diagnostics: Proto.Diagnostic[],
		spans: Proto.TextSpan[] | undefined,
	): Promise<void> {
		const language = await this.findLanguage(resource);
		if (language) {
			language.diagnosticsReceived(
				kind,
				resource,
				this.createMarkerDatas(diagnostics, language.diagnosticSource),
				spans?.map(span => typeConverters.Range.fromTextSpan(span)));
		}
	}

	private configFileDiagnosticsReceived(event: Proto.ConfigFileDiagnosticEvent): void {
		// See https://github.com/microsoft/TypeScript/issues/10384
		const body = event.body;
		if (!body?.diagnostics || !body.configFile) {
			return;
		}

		this.findLanguage(this.client.toResource(body.configFile)).then(language => {
			language?.configFileDiagnosticsReceived(this.client.toResource(body.configFile), body.diagnostics.map(tsDiag => {
				const range = tsDiag.start && tsDiag.end ? typeConverters.Range.fromTextSpan(tsDiag) : new vscode.Range(0, 0, 0, 1);
				const diagnostic = new vscode.Diagnostic(range, tsDiag.text, this.getDiagnosticSeverity(tsDiag));
				diagnostic.source = language.diagnosticSource;
				return diagnostic;
			}));
		});
	}

	private createMarkerDatas(
		diagnostics: Proto.Diagnostic[],
		source: string
	): (vscode.Diagnostic & { reportUnnecessary: any; reportDeprecated: any })[] {
		return diagnostics.map(tsDiag => this.tsDiagnosticToVsDiagnostic(tsDiag, source));
	}

	private tsDiagnosticToVsDiagnostic(diagnostic: Proto.Diagnostic, source: string): vscode.Diagnostic & { reportUnnecessary: any; reportDeprecated: any } {
		const { start, end, text } = diagnostic;
		const range = new vscode.Range(typeConverters.Position.fromLocation(start), typeConverters.Position.fromLocation(end));
		const converted = new vscode.Diagnostic(range, text, this.getDiagnosticSeverity(diagnostic));
		converted.source = diagnostic.source || source;
		if (diagnostic.code) {
			converted.code = diagnostic.code;
		}
		const relatedInformation = diagnostic.relatedInformation;
		if (relatedInformation) {
			converted.relatedInformation = coalesce(relatedInformation.map((info: any) => {
				const span = info.span;
				if (!span) {
					return undefined;
				}
				return new vscode.DiagnosticRelatedInformation(typeConverters.Location.fromTextSpan(this.client.toResource(span.file), span), info.message);
			}));
		}
		const tags: vscode.DiagnosticTag[] = [];
		if (diagnostic.reportsUnnecessary) {
			tags.push(vscode.DiagnosticTag.Unnecessary);
		}
		if (diagnostic.reportsDeprecated) {
			tags.push(vscode.DiagnosticTag.Deprecated);
		}
		converted.tags = tags.length ? tags : undefined;

		const resultConverted = converted as vscode.Diagnostic & { reportUnnecessary: any; reportDeprecated: any };
		resultConverted.reportUnnecessary = diagnostic.reportsUnnecessary;
		resultConverted.reportDeprecated = diagnostic.reportsDeprecated;
		return resultConverted;
	}

	private getDiagnosticSeverity(diagnostic: Proto.Diagnostic): vscode.DiagnosticSeverity {
		if (this.reportStyleCheckAsWarnings
			&& this.isStyleCheckDiagnostic(diagnostic.code)
			&& diagnostic.category === PConst.DiagnosticCategory.error
		) {
			return vscode.DiagnosticSeverity.Warning;
		}

		switch (diagnostic.category) {
			case PConst.DiagnosticCategory.error:
				return vscode.DiagnosticSeverity.Error;

			case PConst.DiagnosticCategory.warning:
				return vscode.DiagnosticSeverity.Warning;

			case PConst.DiagnosticCategory.suggestion:
				return vscode.DiagnosticSeverity.Hint;

			default:
				return vscode.DiagnosticSeverity.Error;
		}
	}

	private isStyleCheckDiagnostic(code: number | undefined): boolean {
		return typeof code === 'number' && styleCheckDiagnostics.has(code);
	}
}
