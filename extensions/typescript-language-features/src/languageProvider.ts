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
import { typeScriptDocumentSymbolProvider } from './languageFeatures/documentSymbol';


const validateSetting = 'validate.enable';
const suggestionSetting = 'suggestionActions.enabled';

export default class LanguageProvider extends Disposable {

	private readonly _classFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '60px', fontWeight: 'bold', fontFamily: 'Arial' });
	private readonly _interfaceFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '80px', fontWeight: 'bold' }); // fontFamily: 'Times New Roman'
	private readonly _functionFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 50, fontSize: '40px', fontWeight: 'italic', fontFamily: 'Courier New' });
	private readonly _methodFontSizeDecorationType1: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 30, fontSize: '20px', fontWeight: 'italic', fontFamily: 'Georgia' });

	private readonly _classFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '60px', fontWeight: 'italic', fontFamily: 'Georgia' });
	private readonly _interfaceFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '60px', fontWeight: 'italic' }); //  fontFamily: 'Arial'
	private readonly _functionFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 50, fontSize: '30px', fontWeight: 'bold', fontFamily: 'Times New Roman' });
	private readonly _methodFontSizeDecorationType2: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 30, fontSize: '10px', fontWeight: 'bold', fontFamily: 'Courier New' });

	private readonly _classFontSizeDecorationType3: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '20px', fontWeight: 'bold', fontFamily: 'Consolas' });
	private readonly _interfaceFontSizeDecorationType3: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '20px', fontWeight: 'bold', fontFamily: 'Consolas' });
	private readonly _functionFontSizeDecorationType3: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 50, fontSize: '20px', fontWeight: 'italic', fontFamily: 'Consolas' });
	private readonly _methodFontSizeDecorationType3: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 30, fontSize: '10px', fontWeight: 'italic', fontFamily: 'Consolas' });

	private readonly _classFontSizeDecorationType4: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '20px', fontWeight: 'italic', fontFamily: 'Consolas' });
	private readonly _interfaceFontSizeDecorationType4: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 70, fontSize: '20px', fontWeight: 'italic', fontFamily: 'Consolas' });
	private readonly _functionFontSizeDecorationType4: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 50, fontSize: '20px', fontWeight: 'bold', fontFamily: 'Consolas' });
	private readonly _methodFontSizeDecorationType4: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 30, fontSize: '10px', fontWeight: 'bold', fontFamily: 'Consolas' });

	// private readonly _classFontSizeDecorationTypeInjectedText: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ after: { contentText: 'AFTER CLASS', fontWeight: 'italic', fontFamily: 'Segoe' } });
	// private readonly _interfaceFontSizeDecorationTypeInjectedText: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ after: { contentText: 'AFTER INTERFACE', fontWeight: 'italic', fontFamily: 'Roboto' } });
	// private readonly _functionFontSizeDecorationTypeInjectedText: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ after: { contentText: 'AFTER FUNCTION', fontWeight: 'bold', fontFamily: 'Nunito' } });
	// private readonly _methodFontSizeDecorationTypeInjectedText: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ after: { contentText: 'AFTER METHOD', fontWeight: 'bold', fontFamily: 'Arial' } });

	// PROD CODE

	// private readonly _classLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 22 });
	// private readonly _interfaceLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 22 });
	// private readonly _functionLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 20 });
	// private readonly _methodLineHeightDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ lineHeight: 20 });

	// private readonly _classFontSizeDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 20 });
	// private readonly _interfaceFontSizeDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 20 });
	// private readonly _functionFontSizeDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 18 });
	// private readonly _methodFontSizeDecorationType: vscode.TextEditorDecorationType = vscode.window.createTextEditorDecorationType({ fontSize: 18 });

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

		client.onReady(async () => {
			await this.registerProviders();
			vscode.window.onDidChangeVisibleTextEditors(e => {
				e.forEach(async editor => {
					this._registerDecorationsForEditor(editor);
					setTimeout(() => {
						console.log('Changing decorations after 5 seconds');
						this._clearDecorationsForEditor(editor);
						this._registerDecorationsForEditor2(editor);
					}, 5000);
				});
			});
			vscode.window.visibleTextEditors.forEach(async editor => {
				this._registerDecorationsForEditor(editor);
				setTimeout(() => {
					console.log('Changing decorations after 5 seconds');
					this._clearDecorationsForEditor(editor);
					this._registerDecorationsForEditor2(editor);
				}, 5000);
			});
			vscode.workspace.onDidChangeTextDocument(_ => {
				const activeTextEditor = vscode.window.activeTextEditor;
				if (!activeTextEditor) {
					return;
				}
			});
		});
	}


	private async _registerDecorationsForEditor(editor: vscode.TextEditor): Promise<void> {
		if (!typeScriptDocumentSymbolProvider) {
			return;
		}
		const document = editor.document;
		const token = new vscode.CancellationTokenSource().token;
		const result = await typeScriptDocumentSymbolProvider.provideDocumentSymbols(document, token);
		if (result === undefined) {
			return;
		}

		const classRangesFonts1: vscode.Range[] = [];
		const classRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Class, classRangesFonts1, classRangesFonts2);

		const interfaceRangesFonts1: vscode.Range[] = [];
		const interfaceRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Interface, interfaceRangesFonts1, interfaceRangesFonts2);

		const functionRangesFonts1: vscode.Range[] = [];
		const functionRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Function, functionRangesFonts1, functionRangesFonts2);

		const methodRangesFonts1: vscode.Range[] = [];
		const methodRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Method, methodRangesFonts1, methodRangesFonts2);

		editor.setDecorations(this._classFontSizeDecorationType1, classRangesFonts1);
		editor.setDecorations(this._interfaceFontSizeDecorationType1, interfaceRangesFonts1);
		editor.setDecorations(this._functionFontSizeDecorationType1, functionRangesFonts1);
		editor.setDecorations(this._methodFontSizeDecorationType1, methodRangesFonts1);

		editor.setDecorations(this._classFontSizeDecorationType2, classRangesFonts2);
		editor.setDecorations(this._interfaceFontSizeDecorationType2, interfaceRangesFonts2);
		editor.setDecorations(this._functionFontSizeDecorationType2, functionRangesFonts2);
		editor.setDecorations(this._methodFontSizeDecorationType2, methodRangesFonts2);

		// editor.setDecorations(this._classFontSizeDecorationTypeInjectedText, classRangesFonts2);
		// editor.setDecorations(this._interfaceFontSizeDecorationTypeInjectedText, interfaceRangesFonts2);
		// editor.setDecorations(this._functionFontSizeDecorationTypeInjectedText, functionRangesFonts2);
		// editor.setDecorations(this._methodFontSizeDecorationTypeInjectedText, methodRangesFonts2);
	}

	private _clearDecorationsForEditor(editor: vscode.TextEditor): void {
		editor.setDecorations(this._classFontSizeDecorationType1, []);
		editor.setDecorations(this._interfaceFontSizeDecorationType1, []);
		editor.setDecorations(this._functionFontSizeDecorationType1, []);
		editor.setDecorations(this._methodFontSizeDecorationType1, []);

		editor.setDecorations(this._classFontSizeDecorationType2, []);
		editor.setDecorations(this._interfaceFontSizeDecorationType2, []);
		editor.setDecorations(this._functionFontSizeDecorationType2, []);
		editor.setDecorations(this._methodFontSizeDecorationType2, []);
	}

	private async _registerDecorationsForEditor2(editor: vscode.TextEditor): Promise<void> {
		if (!typeScriptDocumentSymbolProvider) {
			return;
		}
		const document = editor.document;
		const token = new vscode.CancellationTokenSource().token;
		const result = await typeScriptDocumentSymbolProvider.provideDocumentSymbols(document, token);
		if (result === undefined) {
			return;
		}

		const classRangesFonts1: vscode.Range[] = [];
		const classRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Class, classRangesFonts1, classRangesFonts2);

		const interfaceRangesFonts1: vscode.Range[] = [];
		const interfaceRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Interface, interfaceRangesFonts1, interfaceRangesFonts2);

		const functionRangesFonts1: vscode.Range[] = [];
		const functionRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Function, functionRangesFonts1, functionRangesFonts2);

		const methodRangesFonts1: vscode.Range[] = [];
		const methodRangesFonts2: vscode.Range[] = [];
		this._getRanges(editor, result, vscode.SymbolKind.Method, methodRangesFonts1, methodRangesFonts2);

		editor.setDecorations(this._classFontSizeDecorationType3, classRangesFonts1);
		editor.setDecorations(this._interfaceFontSizeDecorationType3, interfaceRangesFonts1);
		editor.setDecorations(this._functionFontSizeDecorationType3, functionRangesFonts1);
		editor.setDecorations(this._methodFontSizeDecorationType3, methodRangesFonts1);

		editor.setDecorations(this._classFontSizeDecorationType4, classRangesFonts2);
		editor.setDecorations(this._interfaceFontSizeDecorationType4, interfaceRangesFonts2);
		editor.setDecorations(this._functionFontSizeDecorationType4, functionRangesFonts2);
		editor.setDecorations(this._methodFontSizeDecorationType4, methodRangesFonts2);
	}

	private _getRanges(activeTextEditor: vscode.TextEditor, symbols: vscode.DocumentSymbol[], kind: vscode.SymbolKind, rangesForFontSize1: vscode.Range[], rangesForFontSize2: vscode.Range[]) {
		const border = 10; // Infinity in production
		for (const symbol of symbols) {
			if (symbol.kind === kind) {
				const line = symbol.range.start.line;
				rangesForFontSize1.push(activeTextEditor.document.validateRange(new vscode.Range(line, 0, line, border)));
				rangesForFontSize2.push(activeTextEditor.document.validateRange(new vscode.Range(line, border - 5, line, Infinity)));
			}
			this._getRanges(activeTextEditor, symbol.children, kind, rangesForFontSize1, rangesForFontSize2);
		}
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
			import('./languageFeatures/copyPaste').then(provider => this._register(provider.register(selector, this.description, this.client, this.fileConfigurationManager))),
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
