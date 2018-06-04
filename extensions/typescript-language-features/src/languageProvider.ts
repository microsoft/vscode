/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { basename } from 'path';

import TypeScriptServiceClient from './typescriptServiceClient';

import BufferSyncSupport from './features/bufferSyncSupport';

import TypingsStatus from './utils/typingsStatus';
import FileConfigurationManager from './features/fileConfigurationManager';
import { CommandManager } from './utils/commandManager';
import { DiagnosticsManager, DiagnosticKind } from './features/diagnostics';
import { LanguageDescription } from './utils/languageDescription';
import * as fileSchemes from './utils/fileSchemes';
import { CachedNavTreeResponse } from './features/baseCodeLensProvider';
import { memoize } from './utils/memoize';
import { disposeAll } from './utils/dispose';
import TelemetryReporter from './utils/telemetry';
import { UpdateImportsOnFileRenameHandler } from './features/updatePathsOnRename';

const validateSetting = 'validate.enable';
const suggestionSetting = 'suggestionActions.enabled';
const foldingSetting = 'typescript.experimental.syntaxFolding';

export default class LanguageProvider {
	private readonly diagnosticsManager: DiagnosticsManager;
	private readonly bufferSyncSupport: BufferSyncSupport;
	private readonly fileConfigurationManager: FileConfigurationManager;

	private readonly toUpdateOnConfigurationChanged: ({ updateConfiguration: () => void })[] = [];

	private _validate: boolean = true;
	private _enableSuggestionDiagnostics: boolean = true;

	private readonly disposables: vscode.Disposable[] = [];
	private readonly versionDependentDisposables: vscode.Disposable[] = [];

	private foldingProviderRegistration: vscode.Disposable | undefined = void 0;
	private readonly renameHandler: UpdateImportsOnFileRenameHandler;

	constructor(
		private readonly client: TypeScriptServiceClient,
		private readonly description: LanguageDescription,
		private readonly commandManager: CommandManager,
		private readonly telemetryReporter: TelemetryReporter,
		typingsStatus: TypingsStatus,
	) {
		this.fileConfigurationManager = new FileConfigurationManager(client);
		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds, this._validate);
		this.bufferSyncSupport.onDelete(resource => {
			this.diagnosticsManager.delete(resource);
		}, null, this.disposables);

		this.diagnosticsManager = new DiagnosticsManager(description.diagnosticOwner);

		vscode.workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables);
		this.configurationChanged();

		client.onReady(async () => {
			await this.registerProviders(client, commandManager, typingsStatus);
			this.bufferSyncSupport.listen();
		});

		this.renameHandler = new UpdateImportsOnFileRenameHandler(this.client, this.bufferSyncSupport, this.fileConfigurationManager, async uri => {
			try {
				const doc = await vscode.workspace.openTextDocument(uri);
				return this.handles(uri, doc);
			} catch {
				return false;
			}
		});
	}

	public dispose(): void {
		disposeAll(this.disposables);
		disposeAll(this.versionDependentDisposables);

		this.diagnosticsManager.dispose();
		this.bufferSyncSupport.dispose();
		this.fileConfigurationManager.dispose();
		this.renameHandler.dispose();
	}

	@memoize
	private get documentSelector(): vscode.DocumentFilter[] {
		const documentSelector = [];
		for (const language of this.description.modeIds) {
			for (const scheme of fileSchemes.supportedSchemes) {
				documentSelector.push({ language, scheme });
			}
		}
		return documentSelector;
	}

	private async registerProviders(
		client: TypeScriptServiceClient,
		commandManager: CommandManager,
		typingsStatus: TypingsStatus
	): Promise<void> {
		const selector = this.documentSelector;
		const config = vscode.workspace.getConfiguration(this.id);

		const TypeScriptCompletionItemProvider = (await import('./features/completionItemProvider')).default;
		this.disposables.push(vscode.languages.registerCompletionItemProvider(selector,
			new TypeScriptCompletionItemProvider(client, typingsStatus, this.fileConfigurationManager, commandManager),
			...TypeScriptCompletionItemProvider.triggerCharacters));

		this.disposables.push(vscode.languages.registerCompletionItemProvider(selector, new (await import('./features/directiveCommentCompletionProvider')).default(client), '@'));

		const { TypeScriptFormattingProvider, FormattingProviderManager } = await import('./features/formattingProvider');
		const formattingProvider = new TypeScriptFormattingProvider(client, this.fileConfigurationManager);
		formattingProvider.updateConfiguration(config);
		this.disposables.push(vscode.languages.registerOnTypeFormattingEditProvider(selector, formattingProvider, ';', '}', '\n'));

		const formattingProviderManager = new FormattingProviderManager(this.description.id, formattingProvider, selector);
		formattingProviderManager.updateConfiguration();
		this.disposables.push(formattingProviderManager);
		this.toUpdateOnConfigurationChanged.push(formattingProviderManager);

		const cachedResponse = new CachedNavTreeResponse();

		this.disposables.push(vscode.languages.registerCompletionItemProvider(selector, new (await import('./features/jsDocCompletionProvider')).default(client, commandManager), '*'));
		this.disposables.push(vscode.languages.registerHoverProvider(selector, new (await import('./features/hoverProvider')).default(client)));
		this.disposables.push(vscode.languages.registerDefinitionProvider(selector, new (await import('./features/definitionProvider')).default(client)));
		this.disposables.push(vscode.languages.registerDocumentHighlightProvider(selector, new (await import('./features/documentHighlightProvider')).default(client)));
		this.disposables.push(vscode.languages.registerReferenceProvider(selector, new (await import('./features/referenceProvider')).default(client)));
		this.disposables.push(vscode.languages.registerDocumentSymbolProvider(selector, new (await import('./features/documentSymbolProvider')).default(client)));


		this.disposables.push(vscode.languages.registerRenameProvider(selector, new (await import('./features/renameProvider')).default(client)));
		this.disposables.push(vscode.languages.registerCodeActionsProvider(selector, new (await import('./features/quickFixProvider')).default(client, this.fileConfigurationManager, commandManager, this.diagnosticsManager, this.bufferSyncSupport, this.telemetryReporter)));

		const TypescriptSignatureHelpProvider = (await import('./features/signatureHelpProvider')).default;
		this.disposables.push(vscode.languages.registerSignatureHelpProvider(selector, new TypescriptSignatureHelpProvider(client), ...TypescriptSignatureHelpProvider.triggerCharacters));
		const refactorProvider = new (await import('./features/refactorProvider')).default(client, this.fileConfigurationManager, commandManager);
		this.disposables.push(vscode.languages.registerCodeActionsProvider(selector, refactorProvider, refactorProvider.metadata));

		await this.initFoldingProvider();
		this.disposables.push(vscode.workspace.onDidChangeConfiguration(c => {
			if (c.affectsConfiguration(foldingSetting)) {
				this.initFoldingProvider();
			}
		}));
		this.disposables.push({ dispose: () => this.foldingProviderRegistration && this.foldingProviderRegistration.dispose() });

		this.registerVersionDependentProviders();

		const referenceCodeLensProvider = new (await import('./features/referencesCodeLensProvider')).default(client, this.description.id, cachedResponse);
		referenceCodeLensProvider.updateConfiguration();
		this.toUpdateOnConfigurationChanged.push(referenceCodeLensProvider);
		this.disposables.push(vscode.languages.registerCodeLensProvider(selector, referenceCodeLensProvider));

		const implementationCodeLensProvider = new (await import('./features/implementationsCodeLensProvider')).default(client, this.description.id, cachedResponse);
		implementationCodeLensProvider.updateConfiguration();
		this.toUpdateOnConfigurationChanged.push(implementationCodeLensProvider);
		this.disposables.push(vscode.languages.registerCodeLensProvider(selector, implementationCodeLensProvider));

		this.disposables.push(vscode.languages.registerWorkspaceSymbolProvider(new (await import('./features/workspaceSymbolProvider')).default(client, this.description.modeIds)));
	}

	private async initFoldingProvider(): Promise<void> {
		let enable = vscode.workspace.getConfiguration().get(foldingSetting, false);
		if (enable && this.client.apiVersion.has280Features()) {
			if (!this.foldingProviderRegistration) {
				this.foldingProviderRegistration = vscode.languages.registerFoldingRangeProvider(this.documentSelector, new (await import('./features/foldingProvider')).default(this.client));
			}
		} else {
			if (this.foldingProviderRegistration) {
				this.foldingProviderRegistration.dispose();
				this.foldingProviderRegistration = void 0;
			}
		}
	}

	private configurationChanged(): void {
		const config = vscode.workspace.getConfiguration(this.id, null);
		this.updateValidate(config.get(validateSetting, true));
		this.updateSuggestionDiagnostics(config.get(suggestionSetting, true));

		for (const toUpdate of this.toUpdateOnConfigurationChanged) {
			toUpdate.updateConfiguration();
		}
	}

	public handles(resource: vscode.Uri, doc: vscode.TextDocument): boolean {
		if (doc && this.description.modeIds.indexOf(doc.languageId) >= 0) {
			return true;
		}

		if (this.bufferSyncSupport.handles(resource)) {
			return true;
		}

		const base = basename(resource.fsPath);
		return !!base && base === this.description.configFile;
	}

	private get id(): string {
		return this.description.id;
	}

	public get diagnosticSource(): string {
		return this.description.diagnosticSource;
	}

	private updateValidate(value: boolean) {
		if (this._validate === value) {
			return;
		}
		this._validate = value;
		this.bufferSyncSupport.validate = value;
		this.diagnosticsManager.validate = value;
		if (value) {
			this.triggerAllDiagnostics();
		}
	}

	private updateSuggestionDiagnostics(value: boolean) {
		if (this._enableSuggestionDiagnostics === value) {
			return;
		}

		this._enableSuggestionDiagnostics = value;
		this.diagnosticsManager.enableSuggestions = value;
		if (value) {
			this.triggerAllDiagnostics();
		}
	}

	public reInitialize(): void {
		this.diagnosticsManager.reInitialize();
		this.bufferSyncSupport.reOpenDocuments();
		this.bufferSyncSupport.requestAllDiagnostics();
		this.fileConfigurationManager.reset();
		this.registerVersionDependentProviders();
	}

	public getErr(resources: vscode.Uri[]) {
		this.bufferSyncSupport.getErr(resources);
	}

	private async registerVersionDependentProviders(): Promise<void> {
		disposeAll(this.versionDependentDisposables);

		if (!this.client) {
			return;
		}

		const selector = this.documentSelector;
		if (this.client.apiVersion.has220Features()) {
			this.versionDependentDisposables.push(vscode.languages.registerImplementationProvider(selector, new (await import('./features/implementationProvider')).default(this.client)));
		}

		if (this.client.apiVersion.has213Features()) {
			this.versionDependentDisposables.push(vscode.languages.registerTypeDefinitionProvider(selector, new (await import('./features/typeDefinitionProvider')).default(this.client)));
		}

		if (this.client.apiVersion.has280Features()) {
			const organizeImportsProvider = new (await import('./features/organizeImports')).OrganizeImportsCodeActionProvider(this.client, this.commandManager, this.fileConfigurationManager);
			this.versionDependentDisposables.push(vscode.languages.registerCodeActionsProvider(selector, organizeImportsProvider, organizeImportsProvider.metadata));
		}
	}

	public triggerAllDiagnostics(): void {
		this.bufferSyncSupport.requestAllDiagnostics();
	}

	public diagnosticsReceived(diagnosticsKind: DiagnosticKind, file: vscode.Uri, diagnostics: (vscode.Diagnostic & { reportUnnecessary: any })[]): void {
		const config = vscode.workspace.getConfiguration(this.id, file);
		const reportUnnecessary = config.get<boolean>('showUnused', true);
		this.diagnosticsManager.diagnosticsReceived(diagnosticsKind, file, diagnostics.filter(diag => {
			if (!reportUnnecessary) {
				diag.customTags = undefined;
				if (diag.reportUnnecessary && diag.severity === vscode.DiagnosticSeverity.Hint) {
					return false;
				}
			}
			return true;
		}));
	}

	public configFileDiagnosticsReceived(file: vscode.Uri, diagnostics: vscode.Diagnostic[]): void {
		this.diagnosticsManager.configFileDiagnosticsReceived(file, diagnostics);
	}
}