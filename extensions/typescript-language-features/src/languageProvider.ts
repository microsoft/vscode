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

export default class LanguageProvider {
	private readonly diagnosticsManager: DiagnosticsManager;
	private readonly bufferSyncSupport: BufferSyncSupport;
	private readonly fileConfigurationManager: FileConfigurationManager;

	private readonly toUpdateOnConfigurationChanged: ({ updateConfiguration: () => void })[] = [];

	private _validate: boolean = true;
	private _enableSuggestionDiagnostics: boolean = true;

	private readonly disposables: vscode.Disposable[] = [];

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

		const cachedResponse = new CachedNavTreeResponse();

		this.disposables.push((await import('./features/completionItemProvider')).register(selector, client, typingsStatus, this.fileConfigurationManager, commandManager));
		this.disposables.push((await import('./features/definitionProvider')).register(selector, client));
		this.disposables.push((await import('./features/directiveCommentCompletionProvider')).register(selector, client));
		this.disposables.push((await import('./features/documentHighlightProvider')).register(selector, client));
		this.disposables.push((await import('./features/documentSymbolProvider')).register(selector, client));
		this.disposables.push((await import('./features/foldingProvider')).register(selector, client));
		this.disposables.push((await import('./features/formattingProvider')).register(selector, this.description.id, config, client, this.fileConfigurationManager));
		this.disposables.push((await import('./features/hoverProvider')).register(selector, client));
		this.disposables.push((await import('./features/implementationProvider')).register(selector, this.client));
		this.disposables.push((await import('./features/jsDocCompletionProvider')).register(selector, client, commandManager));
		this.disposables.push((await import('./features/organizeImports')).register(selector, this.client, this.commandManager, this.fileConfigurationManager));
		this.disposables.push((await import('./features/quickFixProvider')).register(selector, client, this.fileConfigurationManager, commandManager, this.diagnosticsManager, this.bufferSyncSupport, this.telemetryReporter));
		this.disposables.push((await import('./features/refactorProvider')).register(selector, client, this.fileConfigurationManager, commandManager));
		this.disposables.push((await import('./features/referenceProvider')).register(selector, client));
		this.disposables.push((await import('./features/renameProvider')).register(selector, client));
		this.disposables.push((await import('./features/signatureHelpProvider')).register(selector, client));
		this.disposables.push((await import('./features/typeDefinitionProvider')).register(selector, this.client));

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
	}

	public getErr(resources: vscode.Uri[]) {
		this.bufferSyncSupport.getErr(resources);
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