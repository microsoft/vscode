/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { basename } from 'path';

import TypeScriptServiceClient from './typescriptServiceClient';
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

const validateSetting = 'validate.enable';
const suggestionSetting = 'suggestionActions.enabled';

export default class LanguageProvider {
	private readonly diagnosticsManager: DiagnosticsManager;

	private _validate: boolean = true;
	private _enableSuggestionDiagnostics: boolean = true;

	private readonly disposables: vscode.Disposable[] = [];

	constructor(
		private readonly client: TypeScriptServiceClient,
		private readonly description: LanguageDescription,
		private readonly commandManager: CommandManager,
		private readonly telemetryReporter: TelemetryReporter,
		private readonly typingsStatus: TypingsStatus,
		private readonly fileConfigurationManager: FileConfigurationManager
	) {
		this.client.bufferSyncSupport.onDelete(resource => {
			this.diagnosticsManager.delete(resource);
		}, null, this.disposables);

		this.diagnosticsManager = new DiagnosticsManager(description.diagnosticOwner);

		vscode.workspace.onDidChangeConfiguration(this.configurationChanged, this, this.disposables);
		this.configurationChanged();

		client.onReady(async () => {
			await this.registerProviders();
		});
	}

	public dispose(): void {
		disposeAll(this.disposables);

		this.diagnosticsManager.dispose();
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

	private async registerProviders(): Promise<void> {
		const selector = this.documentSelector;

		const cachedResponse = new CachedNavTreeResponse();

		this.disposables.push((await import('./features/completions')).register(selector, this.client, this.typingsStatus, this.fileConfigurationManager, this.commandManager));
		this.disposables.push((await import('./features/definitions')).register(selector, this.client));
		this.disposables.push((await import('./features/directiveCommentCompletions')).register(selector, this.client));
		this.disposables.push((await import('./features/documentHighlight')).register(selector, this.client));
		this.disposables.push((await import('./features/documentSymbol')).register(selector, this.client));
		this.disposables.push((await import('./features/folding')).register(selector, this.client));
		this.disposables.push((await import('./features/formatting')).register(selector, this.description.id, this.client, this.fileConfigurationManager));
		this.disposables.push((await import('./features/hover')).register(selector, this.client));
		this.disposables.push((await import('./features/implementations')).register(selector, this.client));
		this.disposables.push((await import('./features/implementationsCodeLens')).register(selector, this.description.id, this.client, cachedResponse));
		this.disposables.push((await import('./features/jsDocCompletions')).register(selector, this.client, this.commandManager));
		this.disposables.push((await import('./features/organizeImports')).register(selector, this.client, this.commandManager, this.fileConfigurationManager));
		this.disposables.push((await import('./features/quickFix')).register(selector, this.client, this.fileConfigurationManager, this.commandManager, this.diagnosticsManager, this.telemetryReporter));
		this.disposables.push((await import('./features/refactor')).register(selector, this.client, this.fileConfigurationManager, this.commandManager));
		this.disposables.push((await import('./features/references')).register(selector, this.client));
		this.disposables.push((await import('./features/referencesCodeLens')).register(selector, this.description.id, this.client, cachedResponse));
		this.disposables.push((await import('./features/rename')).register(selector, this.client));
		this.disposables.push((await import('./features/signatureHelp')).register(selector, this.client));
		this.disposables.push((await import('./features/tagCompletion')).register(selector, this.client));
		this.disposables.push((await import('./features/typeDefinitions')).register(selector, this.client));
		this.disposables.push((await import('./features/workspaceSymbols')).register(this.client, this.description.modeIds));
	}

	private configurationChanged(): void {
		const config = vscode.workspace.getConfiguration(this.id, null);
		this.updateValidate(config.get(validateSetting, true));
		this.updateSuggestionDiagnostics(config.get(suggestionSetting, true));
	}

	public handles(resource: vscode.Uri, doc: vscode.TextDocument): boolean {
		if (doc && this.description.modeIds.indexOf(doc.languageId) >= 0) {
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
	}

	public triggerAllDiagnostics(): void {
		this.client.bufferSyncSupport.requestAllDiagnostics();
	}

	public diagnosticsReceived(diagnosticsKind: DiagnosticKind, file: vscode.Uri, diagnostics: (vscode.Diagnostic & { reportUnnecessary: any })[]): void {
		const config = vscode.workspace.getConfiguration(this.id, file);
		const reportUnnecessary = config.get<boolean>('showUnused', true);
		this.diagnosticsManager.diagnosticsReceived(diagnosticsKind, file, diagnostics.filter(diag => {
			if (!reportUnnecessary) {
				diag.tags = undefined;
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