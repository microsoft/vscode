/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { env, languages, commands, workspace, window, Uri, ExtensionContext, IndentAction, Diagnostic, DiagnosticCollection, Range, DocumentFilter } from 'vscode';

// This must be the first statement otherwise modules might got loaded with
// the wrong locale.
import * as nls from 'vscode-nls';
nls.config({locale: env.language});

import * as path from 'path';

import * as Proto from './protocol';

import * as Is from './utils/is';

import TypeScriptServiceClient from './typescriptServiceClient';
import { ITypescriptServiceClientHost } from './typescriptService';

import HoverProvider from './features/hoverProvider';
import DefinitionProvider from './features/definitionProvider';
import DocumentHighlightProvider from './features/documentHighlightProvider';
import ReferenceProvider from './features/referenceProvider';
import DocumentSymbolProvider from './features/documentSymbolProvider';
import SignatureHelpProvider from './features/signatureHelpProvider';
import RenameProvider from './features/renameProvider';
import FormattingProvider from './features/formattingProvider';
import BufferSyncSupport from './features/bufferSyncSupport';
import CompletionItemProvider from './features/completionItemProvider';
import WorkspaceSymbolProvider from './features/workspaceSymbolProvider';

import * as VersionStatus from './utils/versionStatus';
import * as ProjectStatus from './utils/projectStatus';
import * as BuildStatus from './utils/buildStatus';

interface LanguageDescription {
	id: string;
	diagnosticSource: string;
	modeIds: string[];
	extensions: string[];
}

export function activate(context: ExtensionContext): void {
	let MODE_ID_TS = 'typescript';
	let MODE_ID_TSX = 'typescriptreact';
	let MODE_ID_JS = 'javascript';
	let MODE_ID_JSX = 'javascriptreact';

	let clientHost = new TypeScriptServiceClientHost([
		{
			id: 'typescript',
			diagnosticSource: 'ts',
			modeIds: [MODE_ID_TS, MODE_ID_TSX],
			extensions: ['.ts', '.tsx']
		},
		{
			id: 'javascript',
			diagnosticSource: 'js',
			modeIds: [MODE_ID_JS, MODE_ID_JSX],
			extensions: ['.js', '.jsx']
		}
	], context.storagePath);

	let client = clientHost.serviceClient;

	context.subscriptions.push(commands.registerCommand('typescript.reloadProjects', () => {
		clientHost.reloadProjects();
	}));

	context.subscriptions.push(commands.registerCommand('javascript.reloadProjects', () => {
		clientHost.reloadProjects();
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

	private description: LanguageDescription;
	private extensions: Map<boolean>;
	private syntaxDiagnostics: Map<Diagnostic[]>;
	private currentDiagnostics: DiagnosticCollection;
	private bufferSyncSupport: BufferSyncSupport;

	private completionItemProvider: CompletionItemProvider;
	private formattingProvider: FormattingProvider;

	private _validate: boolean;

	constructor(client: TypeScriptServiceClient, description: LanguageDescription) {
		this.description = description;
		this.extensions = Object.create(null);
		description.extensions.forEach(extension => this.extensions[extension] = true);
		this._validate = true;

		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds, {
			delete: (file: string) => {
				this.currentDiagnostics.delete(Uri.file(file));
			}
		}, this.extensions);
		this.syntaxDiagnostics = Object.create(null);
		this.currentDiagnostics = languages.createDiagnosticCollection(description.id);


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
		let config = workspace.getConfiguration(this.id);

		this.completionItemProvider = new CompletionItemProvider(client);
		this.completionItemProvider.updateConfiguration(config);

		let hoverProvider = new HoverProvider(client);
		let definitionProvider = new DefinitionProvider(client);
		let documentHighlightProvider = new DocumentHighlightProvider(client);
		let referenceProvider = new ReferenceProvider(client);
		let documentSymbolProvider = new DocumentSymbolProvider(client);
		let signatureHelpProvider = new SignatureHelpProvider(client);
		let renameProvider = new RenameProvider(client);
		this.formattingProvider = new FormattingProvider(client);
		this.formattingProvider.updateConfiguration(config);

		this.description.modeIds.forEach(modeId => {
			let selector: DocumentFilter = { scheme: 'file', language: modeId };
			languages.registerCompletionItemProvider(selector, this.completionItemProvider, '.');
			languages.registerHoverProvider(selector, hoverProvider);
			languages.registerDefinitionProvider(selector, definitionProvider);
			languages.registerDocumentHighlightProvider(selector, documentHighlightProvider);
			languages.registerReferenceProvider(selector, referenceProvider);
			languages.registerDocumentSymbolProvider(selector, documentSymbolProvider);
			languages.registerSignatureHelpProvider(selector, signatureHelpProvider, '(', ',');
			languages.registerRenameProvider(selector, renameProvider);
			languages.registerDocumentRangeFormattingEditProvider(selector, this.formattingProvider);
			languages.registerOnTypeFormattingEditProvider(selector, this.formattingProvider, ';', '}', '\n');
			languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider(client, modeId));
			languages.setLanguageConfiguration(modeId, {
				indentationRules: {
					// ^(.*\*/)?\s*\}.*$
					decreaseIndentPattern: /^(.*\*\/)?\s*\}.*$/,
					// ^.*\{[^}"']*$
					increaseIndentPattern: /^.*\{[^}"']*$/
				},
				wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\#\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/g,
				comments: {
					lineComment: '//',
					blockComment: ['/*', '*/']
				},
				brackets: [
					['{', '}'],
					['[', ']'],
					['(', ')'],
				],
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
				],

				__electricCharacterSupport: {
					docComment: { scope: 'comment.documentation', open: '/**', lineStart: ' * ', close: ' */' }
				},

				__characterPairSupport: {
					autoClosingPairs: [
						{ open: '{', close: '}' },
						{ open: '[', close: ']' },
						{ open: '(', close: ')' },
						{ open: '"', close: '"', notIn: ['string'] },
						{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
						{ open: '`', close: '`', notIn: ['string', 'comment'] }
					]
				}
			});
		});
	}

	private configurationChanged(): void {
		let config = workspace.getConfiguration(this.id);
		this.updateValidate(config.get(validateSetting, true));
		if (this.completionItemProvider) {
			this.completionItemProvider.updateConfiguration(config);
		}
		if (this.formattingProvider) {
			this.formattingProvider.updateConfiguration(config);
		}
	}

	public handles(file: string): boolean {
		let extension = path.extname(file);
		return (extension && this.extensions[extension]) || this.bufferSyncSupport.handles(file);
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
		this.currentDiagnostics.set(Uri.file(file), diagnostics);
	}

	public semanticDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		let syntaxMarkers = this.syntaxDiagnostics[file];
		if (syntaxMarkers) {
			delete this.syntaxDiagnostics[file];
			diagnostics = syntaxMarkers.concat(diagnostics);
		}
		this.currentDiagnostics.set(Uri.file(file), diagnostics);
	}
}

class TypeScriptServiceClientHost implements ITypescriptServiceClientHost {
	private client: TypeScriptServiceClient;
	private languages: LanguageProvider[];
	private languagePerId: Map<LanguageProvider>;

	constructor(descriptions: LanguageDescription[], storagePath: string) {
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

		this.client = new TypeScriptServiceClient(this, storagePath);
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

	private findLanguage(file: string): LanguageProvider {
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
		workspace.saveAll(false).then((value) => {
			Object.keys(this.languagePerId).forEach(key => this.languagePerId[key].reInitialize());
		});
	}

	/* internal */ syntaxDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		let body = event.body;
		if (body.diagnostics) {
			let language = this.findLanguage(body.file);
			if (language) {
				language.syntaxDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
			}
		}
	}

	/* internal */ semanticDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		let body = event.body;
		if (body.diagnostics) {
			let language = this.findLanguage(body.file);
			if (language) {
				language.semanticDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics, language.diagnosticSource));
			}
		}
		if (Is.defined(body.queueLength)) {
			BuildStatus.update( { queueLength: body.queueLength });
		}
	}

	private createMarkerDatas(diagnostics: Proto.Diagnostic[], source: string): Diagnostic[] {
		let result: Diagnostic[] = [];
		for (let diagnostic of diagnostics) {
			let { start, end, text } = diagnostic;
			let range = new Range(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1);
			let converted = new Diagnostic(range, text);
			converted.source = source;
			result.push(converted);
		}
		return result;
	}
}