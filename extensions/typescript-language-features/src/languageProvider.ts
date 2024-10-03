/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { basename, extname } from 'path';
import * as vscode from 'vscode';
import { CommandManager } from './commands/commandManager';
import { DocumentSelector } from './configuration/documentSelector';
import * as fileSchemes from './configuration/fileSchemes';
import { LanguageDescription } from './configuration/languageDescription';
import { Schemes } from './configuration/schemes';
import { DiagnosticKind } from './languageFeatures/diagnostics';
import FileConfigurationManager from './languageFeatures/fileConfigurationManager';
import { TelemetryReporter } from './logging/telemetry';
import { CachedResponse } from './tsServer/cachedResponse';
import { ClientCapability } from './typescriptService';
import TypeScriptServiceClient from './typescriptServiceClient';
import TypingsStatus from './ui/typingsStatus';
import { Disposable } from './utils/dispose';
import { isWeb, isWebAndHasSharedArrayBuffers, supportsReadableByteStreams } from './utils/platform';


const validateSetting = 'validate.enable';
const suggestionSetting = 'suggestionActions.enabled';

export default class LanguageProvider extends Disposable {

	constructor(
		private readonly client: TypeScriptServiceClient,
		private readonly description: LanguageDescription,
		private readonly commandManager: CommandManager,
		private readonly telemetryReporter: TelemetryReporter,
		private readonly typingsStatus: TypingsStatus,
		private readonly fileConfigurationManager: FileConfigurationManager,
		private readonly onCompletionAccepted: (item: vscode.CompletionItem) => void,
	) {
		super();
		vscode.workspace.onDidChangeConfiguration(this.configurationChanged, this, this._disposables);
		this.configurationChanged();

		client.onReady(() => this.registerProviders());
	}

	private get documentSelector(): DocumentSelector {
		const semantic: vscode.DocumentFilter[] = [];
		const syntax: vscode.DocumentFilter[] = [];
		for (const language of this.description.languageIds) {
			syntax.push({ language });
			for (const scheme of fileSchemes.getSemanticSupportedSchemes()) {
				semantic.push({ language, scheme });
			}
		}

		return { semantic, syntax };
	}

	private async registerProviders(): Promise<void> {
		const selector = this.documentSelector;

		const cachedNavTreeResponse = new CachedResponse();

		await Promise.all([
			import('./languageFeatures/callHierarchy').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/codeLens/implementationsCodeLens').then(provider => this._register(provider.register(selector, this.description, this.client, cachedNavTreeResponse))),
			import('./languageFeatures/codeLens/referencesCodeLens').then(provider => this._register(provider.register(selector, this.description, this.client, cachedNavTreeResponse))),
			import('./languageFeatures/completions').then(provider => this._register(provider.register(selector, this.description, this.client, this.typingsStatus, this.fileConfigurationManager, this.commandManager, this.telemetryReporter, this.onCompletionAccepted))),
			import('./languageFeatures/copyPaste').then(provider => this._register(provider.register(selector, this.description, this.client))),
			import('./languageFeatures/definitions').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/directiveCommentCompletions').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/documentHighlight').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/documentSymbol').then(provider => this._register(provider.register(selector, this.client, cachedNavTreeResponse))),
			import('./languageFeatures/fileReferences').then(provider => this._register(provider.register(this.client, this.commandManager))),
			import('./languageFeatures/fixAll').then(provider => this._register(provider.register(selector, this.client, this.fileConfigurationManager, this.client.diagnosticsManager))),
			import('./languageFeatures/folding').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/formatting').then(provider => this._register(provider.register(selector, this.description, this.client, this.fileConfigurationManager))),
			import('./languageFeatures/hover').then(provider => this._register(provider.register(selector, this.client, this.fileConfigurationManager))),
			import('./languageFeatures/implementations').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/inlayHints').then(provider => this._register(provider.register(selector, this.description, this.client, this.fileConfigurationManager, this.telemetryReporter))),
			import('./languageFeatures/jsDocCompletions').then(provider => this._register(provider.register(selector, this.description, this.client, this.fileConfigurationManager))),
			import('./languageFeatures/linkedEditing').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/mappedCodeEditProvider').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/organizeImports').then(provider => this._register(provider.register(selector, this.client, this.commandManager, this.fileConfigurationManager, this.telemetryReporter))),
			import('./languageFeatures/quickFix').then(provider => this._register(provider.register(selector, this.client, this.fileConfigurationManager, this.commandManager, this.client.diagnosticsManager, this.telemetryReporter))),
			import('./languageFeatures/refactor').then(provider => this._register(provider.register(selector, this.client, cachedNavTreeResponse, this.fileConfigurationManager, this.commandManager, this.telemetryReporter))),
			import('./languageFeatures/references').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/rename').then(provider => this._register(provider.register(selector, this.description, this.client, this.fileConfigurationManager))),
			import('./languageFeatures/semanticTokens').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/signatureHelp').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/smartSelect').then(provider => this._register(provider.register(selector, this.client))),
			import('./languageFeatures/sourceDefinition').then(provider => this._register(provider.register(this.client, this.commandManager))),
			import('./languageFeatures/tagClosing').then(provider => this._register(provider.register(selector, this.description, this.client))),
			import('./languageFeatures/typeDefinitions').then(provider => this._register(provider.register(selector, this.client))),
		]);
	}

	private configurationChanged(): void {
		const config = vscode.workspace.getConfiguration(this.id, null);
		this.updateValidate(config.get(validateSetting, true));
		this.updateSuggestionDiagnostics(config.get(suggestionSetting, true));
	}

	public handlesUri(resource: vscode.Uri): boolean {
		const ext = extname(resource.path).slice(1).toLowerCase();
		return this.description.standardFileExtensions.includes(ext) || this.handlesConfigFile(resource);
	}

	public handlesDocument(doc: vscode.TextDocument): boolean {
		return this.description.languageIds.includes(doc.languageId) || this.handlesConfigFile(doc.uri);
	}

	private handlesConfigFile(resource: vscode.Uri) {
		const base = basename(resource.fsPath);
		return !!base && (!!this.description.configFilePattern && this.description.configFilePattern.test(base));
	}

	private get id(): string {
		return this.description.id;
	}

	public get diagnosticSource(): string {
		return this.description.diagnosticSource;
	}

	private updateValidate(value: boolean) {
		this.client.diagnosticsManager.setValidate(this._diagnosticLanguage, value);
	}

	private updateSuggestionDiagnostics(value: boolean) {
		this.client.diagnosticsManager.setEnableSuggestions(this._diagnosticLanguage, value);
	}

	public reInitialize(): void {
		this.client.diagnosticsManager.reInitialize();
	}

	public triggerAllDiagnostics(): void {
		this.client.bufferSyncSupport.requestAllDiagnostics();
	}

	public diagnosticsReceived(
		diagnosticsKind: DiagnosticKind,
		file: vscode.Uri,
		diagnostics: (vscode.Diagnostic & { reportUnnecessary: any; reportDeprecated: any })[],
		ranges: vscode.Range[] | undefined): void {
		if (diagnosticsKind !== DiagnosticKind.Syntax && !this.client.hasCapabilityForResource(file, ClientCapability.Semantic)) {
			return;
		}

		if (diagnosticsKind === DiagnosticKind.Semantic && isWeb()) {
			if (
				!isWebAndHasSharedArrayBuffers()
				|| !supportsReadableByteStreams() // No ata. Will result in lots of false positives
				|| this.client.configuration.webProjectWideIntellisenseSuppressSemanticErrors
				|| !this.client.configuration.webProjectWideIntellisenseEnabled
			) {
				return;
			}
		}

		// Disable semantic errors in notebooks until we have better notebook support
		if (diagnosticsKind === DiagnosticKind.Semantic && file.scheme === Schemes.notebookCell) {
			return;
		}

		const config = vscode.workspace.getConfiguration(this.id, file);
		const reportUnnecessary = config.get<boolean>('showUnused', true);
		const reportDeprecated = config.get<boolean>('showDeprecated', true);
		this.client.diagnosticsManager.updateDiagnostics(file, this._diagnosticLanguage, diagnosticsKind, diagnostics.filter(diag => {
			// Don't bother reporting diagnostics we know will not be rendered
			if (!reportUnnecessary) {
				if (diag.reportUnnecessary && diag.severity === vscode.DiagnosticSeverity.Hint) {
					return false;
				}
			}
			if (!reportDeprecated) {
				if (diag.reportDeprecated && diag.severity === vscode.DiagnosticSeverity.Hint) {
					return false;
				}
			}
			return true;
		}), ranges);
	}

	public configFileDiagnosticsReceived(file: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
		this.client.diagnosticsManager.configFileDiagnosticsReceived(file, diagnostics);
	}

	private get _diagnosticLanguage() {
		return this.description.diagnosticLanguage;
	}
}
