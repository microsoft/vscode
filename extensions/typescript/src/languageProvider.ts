/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { languages, workspace, Diagnostic, Disposable, Uri, TextDocument, DocumentFilter } from 'vscode';
import { basename } from 'path';

import TypeScriptServiceClient from './typescriptServiceClient';

import BufferSyncSupport from './features/bufferSyncSupport';

import TypingsStatus from './utils/typingsStatus';
import FormattingConfigurationManager from './features/formattingConfigurationManager';
import * as languageConfigurations from './utils/languageConfigurations';
import { CommandManager } from './utils/commandManager';
import DiagnosticsManager from './features/diagnostics';
import { LanguageDescription } from './utils/languageDescription';
import * as fileSchemes from './utils/fileSchemes';
import { CachedNavTreeResponse } from './features/baseCodeLensProvider';

const validateSetting = 'validate.enable';

export default class LanguageProvider {
	private readonly diagnosticsManager: DiagnosticsManager;
	private readonly bufferSyncSupport: BufferSyncSupport;
	private readonly formattingOptionsManager: FormattingConfigurationManager;

	private readonly toUpdateOnConfigurationChanged: ({ updateConfiguration: () => void })[] = [];

	private _validate: boolean = true;

	private _documentSelector?: DocumentFilter[];

	private readonly disposables: Disposable[] = [];
	private readonly versionDependentDisposables: Disposable[] = [];

	constructor(
		private readonly client: TypeScriptServiceClient,
		private readonly description: LanguageDescription,
		commandManager: CommandManager,
		typingsStatus: TypingsStatus
	) {
		this.formattingOptionsManager = new FormattingConfigurationManager(client);
		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds, {
			delete: (file: string) => {
				this.diagnosticsManager.delete(file);
			}
		}, this._validate);

		this.diagnosticsManager = new DiagnosticsManager(description.id, this.client);

		workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables);
		this.configurationChanged();

		client.onReady(async () => {
			await this.registerProviders(client, commandManager, typingsStatus);
			this.bufferSyncSupport.listen();
		});
	}

	public dispose(): void {
		while (this.disposables.length) {
			const obj = this.disposables.pop();
			if (obj) {
				obj.dispose();
			}
		}

		while (this.versionDependentDisposables.length) {
			const obj = this.versionDependentDisposables.pop();
			if (obj) {
				obj.dispose();
			}
		}

		this.diagnosticsManager.dispose();
		this.bufferSyncSupport.dispose();
		this.formattingOptionsManager.dispose();
	}

	private get documentSelector(): DocumentFilter[] {
		if (!this._documentSelector) {
			this._documentSelector = [];
			for (const language of this.description.modeIds) {
				for (const scheme of fileSchemes.supportedSchemes) {
					this._documentSelector.push({ language, scheme });
				}
			}
		}
		return this._documentSelector;
	}

	private async registerProviders(
		client: TypeScriptServiceClient,
		commandManager: CommandManager,
		typingsStatus: TypingsStatus
	): Promise<void> {
		const selector = this.documentSelector;
		const config = workspace.getConfiguration(this.id);

		this.disposables.push(languages.registerCompletionItemProvider(selector,
			new (await import('./features/completionItemProvider')).default(client, typingsStatus, commandManager),
			'.', '"', '\'', '/', '@'));

		this.disposables.push(languages.registerCompletionItemProvider(selector, new (await import('./features/directiveCommentCompletionProvider')).default(client), '@'));

		const { TypeScriptFormattingProvider, FormattingProviderManager } = await import('./features/formattingProvider');
		const formattingProvider = new TypeScriptFormattingProvider(client, this.formattingOptionsManager);
		formattingProvider.updateConfiguration(config);
		this.disposables.push(languages.registerOnTypeFormattingEditProvider(selector, formattingProvider, ';', '}', '\n'));

		const formattingProviderManager = new FormattingProviderManager(this.description.id, formattingProvider, selector);
		formattingProviderManager.updateConfiguration();
		this.disposables.push(formattingProviderManager);
		this.toUpdateOnConfigurationChanged.push(formattingProviderManager);

		this.disposables.push(languages.registerCompletionItemProvider(selector, new (await import('./features/jsDocCompletionProvider')).default(client, commandManager), '*'));
		this.disposables.push(languages.registerHoverProvider(selector, new (await import('./features/hoverProvider')).default(client)));
		this.disposables.push(languages.registerDefinitionProvider(selector, new (await import('./features/definitionProvider')).default(client)));
		this.disposables.push(languages.registerDocumentHighlightProvider(selector, new (await import('./features/documentHighlightProvider')).default(client)));
		this.disposables.push(languages.registerReferenceProvider(selector, new (await import('./features/referenceProvider')).default(client)));
		this.disposables.push(languages.registerDocumentSymbolProvider(selector, new (await import('./features/documentSymbolProvider')).default(client)));
		this.disposables.push(languages.registerSignatureHelpProvider(selector, new (await import('./features/signatureHelpProvider')).default(client), '(', ','));
		this.disposables.push(languages.registerRenameProvider(selector, new (await import('./features/renameProvider')).default(client)));
		this.disposables.push(languages.registerCodeActionsProvider(selector, new (await import('./features/quickFixProvider')).default(client, this.formattingOptionsManager, commandManager, this.diagnosticsManager)));
		this.disposables.push(languages.registerCodeActionsProvider(selector, new (await import('./features/refactorProvider')).default(client, this.formattingOptionsManager, commandManager)));

		if (workspace.getConfiguration('typescript').get('enableExperimentalFolding', false)) {
			this.disposables.push(languages.registerFoldingProvider(selector, new (await import('./features/folderingProvider')).default(client)));
		}

		this.registerVersionDependentProviders();

		const cachedResponse = new CachedNavTreeResponse();

		const referenceCodeLensProvider = new (await import('./features/referencesCodeLensProvider')).default(client, this.description.id, cachedResponse);
		referenceCodeLensProvider.updateConfiguration();
		this.toUpdateOnConfigurationChanged.push(referenceCodeLensProvider);
		this.disposables.push(languages.registerCodeLensProvider(selector, referenceCodeLensProvider));

		const implementationCodeLensProvider = new (await import('./features/implementationsCodeLensProvider')).default(client, this.description.id, cachedResponse);
		implementationCodeLensProvider.updateConfiguration();
		this.toUpdateOnConfigurationChanged.push(implementationCodeLensProvider);
		this.disposables.push(languages.registerCodeLensProvider(selector, implementationCodeLensProvider));

		this.disposables.push(languages.registerWorkspaceSymbolProvider(new (await import('./features/workspaceSymbolProvider')).default(client, this.description.modeIds)));

		if (!this.description.isExternal) {
			for (const modeId of this.description.modeIds) {
				this.disposables.push(languages.setLanguageConfiguration(modeId, languageConfigurations.jsTsLanguageConfiguration));
			}
		}
	}

	private configurationChanged(): void {
		const config = workspace.getConfiguration(this.id);
		this.updateValidate(config.get(validateSetting, true));

		for (const toUpdate of this.toUpdateOnConfigurationChanged) {
			toUpdate.updateConfiguration();
		}
	}

	public handles(file: string, doc: TextDocument): boolean {
		if (doc && this.description.modeIds.indexOf(doc.languageId) >= 0) {
			return true;
		}

		if (this.bufferSyncSupport.handles(file)) {
			return true;
		}

		const base = basename(file);
		return !!base && base === this.description.configFile;
	}

	public get id(): string {
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

	public reInitialize(): void {
		this.diagnosticsManager.reInitialize();
		this.bufferSyncSupport.reOpenDocuments();
		this.bufferSyncSupport.requestAllDiagnostics();
		this.formattingOptionsManager.reset();
		this.registerVersionDependentProviders();
	}

	private async registerVersionDependentProviders(): Promise<void> {
		while (this.versionDependentDisposables.length) {
			const obj = this.versionDependentDisposables.pop();
			if (obj) {
				obj.dispose();
			}
		}

		if (!this.client) {
			return;
		}

		const selector = this.documentSelector;
		if (this.client.apiVersion.has220Features()) {
			this.versionDependentDisposables.push(languages.registerImplementationProvider(selector, new (await import('./features/implementationProvider')).default(this.client)));
		}

		if (this.client.apiVersion.has213Features()) {
			this.versionDependentDisposables.push(languages.registerTypeDefinitionProvider(selector, new (await import('./features/typeDefinitionProvider')).default(this.client)));
		}
	}

	public triggerAllDiagnostics(): void {
		this.bufferSyncSupport.requestAllDiagnostics();
	}

	public syntaxDiagnosticsReceived(file: Uri, syntaxDiagnostics: Diagnostic[]): void {
		this.diagnosticsManager.syntaxDiagnosticsReceived(file, syntaxDiagnostics);
	}

	public semanticDiagnosticsReceived(file: Uri, semanticDiagnostics: Diagnostic[]): void {
		this.diagnosticsManager.semanticDiagnosticsReceived(file, semanticDiagnostics);
	}

	public configFileDiagnosticsReceived(file: Uri, diagnostics: Diagnostic[]): void {
		this.diagnosticsManager.configFileDiagnosticsReceived(file, diagnostics);
	}
}