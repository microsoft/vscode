/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { env, languages, commands, workspace, window, ExtensionContext, Memento, IndentAction, Diagnostic, DiagnosticCollection, Range, DocumentFilter, Disposable, Uri } from 'vscode';

// This must be the first statement otherwise modules might got loaded with
// the wrong locale.
import * as nls from 'vscode-nls';
nls.config({ locale: env.language });

import * as path from 'path';

import * as Proto from './protocol';

import TypeScriptServiceClient from './typescriptServiceClient';
import { ITypescriptServiceClientHost } from './typescriptService';

import HoverProvider from './features/hoverProvider';
import DefinitionProvider from './features/definitionProvider';
import ImplementationProvider from './features/ImplementationProvider';
import TypeDefintionProvider from './features/typeDefinitionProvider';
import DocumentHighlightProvider from './features/documentHighlightProvider';
import ReferenceProvider from './features/referenceProvider';
import DocumentSymbolProvider from './features/documentSymbolProvider';
import SignatureHelpProvider from './features/signatureHelpProvider';
import RenameProvider from './features/renameProvider';
import FormattingProvider from './features/formattingProvider';
import BufferSyncSupport from './features/bufferSyncSupport';
import CompletionItemProvider from './features/completionItemProvider';
import WorkspaceSymbolProvider from './features/workspaceSymbolProvider';
import CodeActionProvider from './features/codeActionProvider';
import ReferenceCodeLensProvider from './features/referencesCodeLensProvider';

import * as BuildStatus from './utils/buildStatus';
import * as ProjectStatus from './utils/projectStatus';
import TypingsStatus, { AtaProgressReporter } from './utils/typingsStatus';
import * as VersionStatus from './utils/versionStatus';

interface LanguageDescription {
	id: string;
	diagnosticSource: string;
	modeIds: string[];
	extensions: string[];
	configFile: string;
}

export function activate(context: ExtensionContext): void {
	const MODE_ID_TS = 'typescript';
	const MODE_ID_TSX = 'typescriptreact';
	const MODE_ID_JS = 'javascript';
	const MODE_ID_JSX = 'javascriptreact';

	const clientHost = new TypeScriptServiceClientHost([
		{
			id: 'typescript',
			diagnosticSource: 'ts',
			modeIds: [MODE_ID_TS, MODE_ID_TSX],
			extensions: ['.ts', '.tsx'],
			configFile: 'tsconfig.json'
		},
		{
			id: 'javascript',
			diagnosticSource: 'js',
			modeIds: [MODE_ID_JS, MODE_ID_JSX],
			extensions: ['.js', '.jsx'],
			configFile: 'jsconfig.json'
		}
	], context.storagePath, context.globalState, context.workspaceState);

	const client = clientHost.serviceClient;

	context.subscriptions.push(commands.registerCommand('typescript.reloadProjects', () => {
		clientHost.reloadProjects();
	}));

	context.subscriptions.push(commands.registerCommand('javascript.reloadProjects', () => {
		clientHost.reloadProjects();
	}));

	context.subscriptions.push(commands.registerCommand('typescript.selectTypeScriptVersion', () => {
		client.onVersionStatusClicked();
	}));

	window.onDidChangeActiveTextEditor(VersionStatus.showHideStatus, null, context.subscriptions);
	client.onReady().then(() => {
		context.subscriptions.push(ProjectStatus.create(client,
			path => new Promise(resolve => setTimeout(() => resolve(clientHost.handles(path)), 750)),
			context.workspaceState));
	}, () => {
		// Nothing to do here. The client did show a message;
	});
	BuildStatus.update({ queueLength: 0 });
}

const validateSetting = 'validate.enable';

class LanguageProvider {

	private extensions: ObjectMap<boolean>;
	private syntaxDiagnostics: ObjectMap<Diagnostic[]>;
	private currentDiagnostics: DiagnosticCollection;
	private bufferSyncSupport: BufferSyncSupport;

	private completionItemProvider: CompletionItemProvider;
	private formattingProvider: FormattingProvider;
	private formattingProviderRegistration: Disposable | null;
	private typingsStatus: TypingsStatus;
	private referenceCodeLensProvider: ReferenceCodeLensProvider;

	private _validate: boolean;

	constructor(
		private client: TypeScriptServiceClient,
		private description: LanguageDescription
	) {
		this.extensions = Object.create(null);
		description.extensions.forEach(extension => this.extensions[extension] = true);
		this._validate = true;

		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds, {
			delete: (file: string) => {
				this.currentDiagnostics.delete(client.asUrl(file));
			}
		}, this.extensions);
		this.syntaxDiagnostics = Object.create(null);
		this.currentDiagnostics = languages.createDiagnosticCollection(description.id);

		this.typingsStatus = new TypingsStatus(client);
		new AtaProgressReporter(client);

		workspace.onDidChangeConfiguration(this.configurationChanged, this);
		this.configurationChanged();

		client.onReady().then(() => {
			this.registerProviders(client);
			this.bufferSyncSupport.listen();
		}, () => {
			// Nothing to do here. The client did show a message;
		});
	}

	private registerProviders(client: TypeScriptServiceClient): void {
		const config = workspace.getConfiguration(this.id);

		this.completionItemProvider = new CompletionItemProvider(client, this.typingsStatus);
		this.completionItemProvider.updateConfiguration();

		let hoverProvider = new HoverProvider(client);
		let definitionProvider = new DefinitionProvider(client);
		let implementationProvider = new ImplementationProvider(client);
		const typeDefinitionProvider = new TypeDefintionProvider(client);
		let documentHighlightProvider = new DocumentHighlightProvider(client);
		let referenceProvider = new ReferenceProvider(client);
		let documentSymbolProvider = new DocumentSymbolProvider(client);
		let signatureHelpProvider = new SignatureHelpProvider(client);
		let renameProvider = new RenameProvider(client);
		this.formattingProvider = new FormattingProvider(client);
		this.formattingProvider.updateConfiguration(config);
		if (this.formattingProvider.isEnabled()) {
			this.formattingProviderRegistration = languages.registerDocumentRangeFormattingEditProvider(this.description.modeIds, this.formattingProvider);
		}

		this.referenceCodeLensProvider = new ReferenceCodeLensProvider(client);
		this.referenceCodeLensProvider.updateConfiguration();
		if (client.apiVersion.has206Features()) {
			languages.registerCodeLensProvider(this.description.modeIds, this.referenceCodeLensProvider);
		}

		this.description.modeIds.forEach(modeId => {
			const selector: DocumentFilter = modeId;
			languages.registerCompletionItemProvider(selector, this.completionItemProvider, '.');
			languages.registerHoverProvider(selector, hoverProvider);
			languages.registerDefinitionProvider(selector, definitionProvider);
			if (client.apiVersion.has220Features()) {
				// TODO: TS 2.1.5 returns incorrect results for implementation locations.
				languages.registerImplementationProvider(selector, implementationProvider);
			}
			if (client.apiVersion.has213Features()) {
				languages.registerTypeDefinitionProvider(selector, typeDefinitionProvider);
			}
			languages.registerDocumentHighlightProvider(selector, documentHighlightProvider);
			languages.registerReferenceProvider(selector, referenceProvider);
			languages.registerDocumentSymbolProvider(selector, documentSymbolProvider);
			languages.registerSignatureHelpProvider(selector, signatureHelpProvider, '(', ',');
			languages.registerRenameProvider(selector, renameProvider);
			languages.registerOnTypeFormattingEditProvider(selector, this.formattingProvider, ';', '}', '\n');
			languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider(client, modeId));
			if (client.apiVersion.has213Features()) {
				languages.registerCodeActionsProvider(selector, new CodeActionProvider(client, modeId));
			}

			languages.setLanguageConfiguration(modeId, {
				indentationRules: {
					// ^(.*\*/)?\s*\}.*$
					decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/,
					// ^.*\{[^}"']*$
					increaseIndentPattern: /^.*\{[^}"']*$/
				},
				wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
				onEnterRules: [
					{
						// e.g. /** | */
						beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
						afterText: /^\s*\*\/$/,
						action: { indentAction: IndentAction.IndentOutdent, appendText: ' * ' }
					},
					{
						// e.g. /** ...|
						beforeText: /^\s*\/\*\*(?!\/)([^\*]|\*(?!\/))*$/,
						action: { indentAction: IndentAction.None, appendText: ' * ' }
					},
					{
						// e.g.  * ...|
						beforeText: /^(\t|(\ \ ))*\ \*(\ ([^\*]|\*(?!\/))*)?$/,
						action: { indentAction: IndentAction.None, appendText: '* ' }
					},
					{
						// e.g.  */|
						beforeText: /^(\t|(\ \ ))*\ \*\/\s*$/,
						action: { indentAction: IndentAction.None, removeText: 1 }
					},
					{
						// e.g.  *-----*/|
						beforeText: /^(\t|(\ \ ))*\ \*[^/]*\*\/\s*$/,
						action: { indentAction: IndentAction.None, removeText: 1 }
					}
				]
			});

			const EMPTY_ELEMENTS: string[] = ['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'menuitem', 'meta', 'param', 'source', 'track', 'wbr'];

			languages.setLanguageConfiguration('jsx-tags', {
				wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
				onEnterRules: [
					{
						beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
						afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
						action: { indentAction: IndentAction.IndentOutdent }
					},
					{
						beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
						action: { indentAction: IndentAction.Indent }
					}
				],
			});
		});
	}

	private configurationChanged(): void {
		const config = workspace.getConfiguration(this.id);
		this.updateValidate(config.get(validateSetting, true));
		if (this.completionItemProvider) {
			this.completionItemProvider.updateConfiguration();
		}
		if (this.referenceCodeLensProvider) {
			this.referenceCodeLensProvider.updateConfiguration();
		}
		if (this.formattingProvider) {
			this.formattingProvider.updateConfiguration(config);
			if (!this.formattingProvider.isEnabled() && this.formattingProviderRegistration) {
				this.formattingProviderRegistration.dispose();
				this.formattingProviderRegistration = null;

			} else if (this.formattingProvider.isEnabled() && !this.formattingProviderRegistration) {
				this.formattingProviderRegistration = languages.registerDocumentRangeFormattingEditProvider(this.description.modeIds, this.formattingProvider);
			}
		}
	}

	public handles(file: string): boolean {
		const extension = path.extname(file);
		if ((extension && this.extensions[extension]) || this.bufferSyncSupport.handles(file)) {
			return true;
		}
		const basename = path.basename(file);
		return !!basename && basename === this.description.configFile;
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
		if (value) {
			this.triggerAllDiagnostics();
		} else {
			this.syntaxDiagnostics = Object.create(null);
			this.currentDiagnostics.clear();
		}
	}

	public reInitialize(): void {
		this.currentDiagnostics.clear();
		this.syntaxDiagnostics = Object.create(null);
		this.bufferSyncSupport.reOpenDocuments();
		this.bufferSyncSupport.requestAllDiagnostics();
	}

	public triggerAllDiagnostics(): void {
		this.bufferSyncSupport.requestAllDiagnostics();
	}

	public syntaxDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		this.syntaxDiagnostics[file] = diagnostics;
	}

	public semanticDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		const syntaxMarkers = this.syntaxDiagnostics[file];
		if (syntaxMarkers) {
			delete this.syntaxDiagnostics[file];
			diagnostics = syntaxMarkers.concat(diagnostics);
		}
		this.currentDiagnostics.set(this.client.asUrl(file), diagnostics);
	}

	public configFileDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		this.currentDiagnostics.set(this.client.asUrl(file), diagnostics);
	}
}

class TypeScriptServiceClientHost implements ITypescriptServiceClientHost {
	private client: TypeScriptServiceClient;
	private languages: LanguageProvider[];
	private languagePerId: ObjectMap<LanguageProvider>;

	constructor(descriptions: LanguageDescription[], storagePath: string | undefined, globalState: Memento, workspaceState: Memento) {
		let handleProjectCreateOrDelete = () => {
			this.client.execute('reloadProjects', null, false);
			this.triggerAllDiagnostics();
		};
		let handleProjectChange = () => {
			setTimeout(() => {
				this.triggerAllDiagnostics();
			}, 1500);
		};
		let watcher = workspace.createFileSystemWatcher('**/[tj]sconfig.json');
		watcher.onDidCreate(handleProjectCreateOrDelete);
		watcher.onDidDelete(handleProjectCreateOrDelete);
		watcher.onDidChange(handleProjectChange);

		this.client = new TypeScriptServiceClient(this, storagePath, globalState, workspaceState);
		this.languages = [];
		this.languagePerId = Object.create(null);
		descriptions.forEach(description => {
			let manager = new LanguageProvider(this.client, description);
			this.languages.push(manager);
			this.languagePerId[description.id] = manager;
		});
	}

	public get serviceClient(): TypeScriptServiceClient {
		return this.client;
	}

	public reloadProjects(): void {
		this.client.execute('reloadProjects', null, false);
		this.triggerAllDiagnostics();
	}

	public handles(file: string): boolean {
		return !!this.findLanguage(file);
	}

	private findLanguage(file: string): LanguageProvider | null {
		for (let i = 0; i < this.languages.length; i++) {
			let language = this.languages[i];
			if (language.handles(file)) {
				return language;
			}
		}
		return null;
	}

	private triggerAllDiagnostics() {
		Object.keys(this.languagePerId).forEach(key => this.languagePerId[key].triggerAllDiagnostics());
	}

	/* internal */ populateService(): void {
		// See https://github.com/Microsoft/TypeScript/issues/5530
		workspace.saveAll(false).then(_ => {
			Object.keys(this.languagePerId).forEach(key => this.languagePerId[key].reInitialize());
		});
	}

	/* internal */ syntaxDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		let body = event.body;
		if (body && body.diagnostics) {
			let language = this.findLanguage(body.file);
			if (language) {
				language.syntaxDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
			}
		}
	}

	/* internal */ semanticDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		let body = event.body;
		if (body && body.diagnostics) {
			let language = this.findLanguage(body.file);
			if (language) {
				language.semanticDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
			}
		}
		/*
		if (Is.defined(body.queueLength)) {
			BuildStatus.update({ queueLength: body.queueLength });
		}
		*/
	}

	/* internal */ configFileDiagnosticsReceived(event: Proto.ConfigFileDiagnosticEvent): void {
		// See https://github.com/Microsoft/TypeScript/issues/10384
		const body = event.body;
		if (!body || !body.diagnostics || !body.configFile) {
			return;
		}

		const language = body.triggerFile ? this.findLanguage(body.triggerFile) : this.findLanguage(body.configFile);
		if (!language) {
			return;
		}
		if (body.diagnostics.length === 0) {
			language.configFileDiagnosticsReceived(body.configFile, []);
		} else if (body.diagnostics.length >= 1) {
			workspace.openTextDocument(Uri.file(body.configFile)).then((document) => {
				let curly: [number, number, number] | undefined = undefined;
				let nonCurly: [number, number, number] | undefined = undefined;
				let diagnostic: Diagnostic;
				for (let index = 0; index < document.lineCount; index++) {
					const line = document.lineAt(index);
					const text = line.text;
					const firstNonWhitespaceCharacterIndex = line.firstNonWhitespaceCharacterIndex;
					if (firstNonWhitespaceCharacterIndex < text.length) {
						if (text.charAt(firstNonWhitespaceCharacterIndex) === '{') {
							curly = [index, firstNonWhitespaceCharacterIndex, firstNonWhitespaceCharacterIndex + 1];
							break;
						} else {
							const matches = /\s*([^\s]*)(?:\s*|$)/.exec(text.substr(firstNonWhitespaceCharacterIndex));
							if (matches && matches.length >= 1) {
								nonCurly = [index, firstNonWhitespaceCharacterIndex, firstNonWhitespaceCharacterIndex + matches[1].length];
							}
						}
					}
				}
				const match = curly || nonCurly;
				if (match) {
					diagnostic = new Diagnostic(new Range(match[0], match[1], match[0], match[2]), body.diagnostics[0].text);
				} else {
					diagnostic = new Diagnostic(new Range(0, 0, 0, 0), body.diagnostics[0].text);
				}
				if (diagnostic) {
					diagnostic.source = language.diagnosticSource;
					language.configFileDiagnosticsReceived(body.configFile, [diagnostic]);
				}
			}, _error => {
				language.configFileDiagnosticsReceived(body.configFile, [new Diagnostic(new Range(0, 0, 0, 0), body.diagnostics[0].text)]);
			});
		}
	}

	private createMarkerDatas(diagnostics: Proto.Diagnostic[], source: string): Diagnostic[] {
		const result: Diagnostic[] = [];
		for (let diagnostic of diagnostics) {
			let { start, end, text } = diagnostic;
			let range = new Range(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1);
			let converted = new Diagnostic(range, text);
			converted.source = source;
			converted.code = '' + diagnostic.code;
			result.push(converted);
		}
		return result;
	}
}
