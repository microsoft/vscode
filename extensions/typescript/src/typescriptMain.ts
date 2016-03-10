/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* --------------------------------------------------------------------------------------------
 * Includes code from typescript-sublime-plugin project, obtained from
 * https://github.com/Microsoft/TypeScript-Sublime-Plugin/blob/master/TypeScript%20Indent.tmPreferences
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { env, languages, commands, workspace, window, Uri, ExtensionContext, IndentAction, Diagnostic, DiagnosticCollection, Range } from 'vscode';

import * as Proto from './protocol';
import TypeScriptServiceClient from './typescriptServiceClient';
import { ITypescriptServiceClientHost } from './typescriptService';

import * as Configuration from './features/configuration';

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

import * as nls from 'vscode-nls';

interface LanguageDescription {
	id: string;
	modeIds: string[];
}

export function activate(context: ExtensionContext): void {
	nls.config({locale: env.language});

	let MODE_ID_TS = 'typescript';
	let MODE_ID_TSX = 'typescriptreact';
	let MODE_ID_JS = 'javascript';
	let MODE_ID_JSX = 'javascriptreact';

	let clientHost = new TypeScriptServiceClientHost([
		{
			id: 'typescript',
			modeIds: [MODE_ID_TS, MODE_ID_TSX]
		},
		{
			id: 'javascript',
			modeIds: [MODE_ID_JS, MODE_ID_JSX]
		}
	]);

	let client = clientHost.serviceClient;

	context.subscriptions.push(commands.registerCommand('typescript.reloadProjects', () => {
		clientHost.reloadProjects();
	}));

	context.subscriptions.push(commands.registerCommand('javascript.reloadProjects', () => {
		clientHost.reloadProjects();
	}));

	window.onDidChangeActiveTextEditor(VersionStatus.showHideStatus, null, context.subscriptions);

	// Register the supports for both TS and TSX so that we can have separate grammars but share the mode
	client.onReady().then(() => {
		registerSupports(MODE_ID_TS, clientHost, client);
		registerSupports(MODE_ID_TSX, clientHost, client);
		registerSupports(MODE_ID_JS, clientHost, client);
		registerSupports(MODE_ID_JSX, clientHost, client);
	}, () => {
		// Nothing to do here. The client did show a message;
	});
}

function registerSupports(modeID: string, host: TypeScriptServiceClientHost, client: TypeScriptServiceClient) {

	languages.registerHoverProvider(modeID, new HoverProvider(client));
	languages.registerDefinitionProvider(modeID, new DefinitionProvider(client));
	languages.registerDocumentHighlightProvider(modeID, new DocumentHighlightProvider(client));
	languages.registerReferenceProvider(modeID, new ReferenceProvider(client));
	languages.registerDocumentSymbolProvider(modeID, new DocumentSymbolProvider(client));
	languages.registerSignatureHelpProvider(modeID, new SignatureHelpProvider(client), '(', ',');
	languages.registerRenameProvider(modeID, new RenameProvider(client));
	languages.registerDocumentRangeFormattingEditProvider(modeID, new FormattingProvider(client));
	languages.registerOnTypeFormattingEditProvider(modeID, new FormattingProvider(client), ';', '}', '\n');
	languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider(client, modeID));

	languages.setLanguageConfiguration(modeID, {
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

	// Register suggest support as soon as possible and load configuration lazily
	let completionItemProvider = new CompletionItemProvider(client);
	languages.registerCompletionItemProvider(modeID, completionItemProvider, '.');
	let reloadConfig = () => {
		completionItemProvider.setConfiguration(Configuration.load(modeID));
	};
	workspace.onDidChangeConfiguration(() => {
		reloadConfig();
	});
	reloadConfig();
}

class LanguageManager {

	private description: LanguageDescription;
	private syntaxDiagnostics: Map<Diagnostic[]>;
	private currentDiagnostics: DiagnosticCollection;
	private bufferSyncSupport: BufferSyncSupport;

	private _validate: boolean;

	constructor(client: TypeScriptServiceClient, description: LanguageDescription, validate: boolean = true) {
		this.description = description;
		this.bufferSyncSupport = new BufferSyncSupport(client, description.modeIds);
		this.syntaxDiagnostics = Object.create(null);
		this.currentDiagnostics = languages.createDiagnosticCollection(description.id);
		this._validate = validate;
	}

	public handles(file: string): boolean {
		return this.bufferSyncSupport.handles(file);
	}

	public get validate(): boolean {
		return this._validate;
	}

	public set validate(value: boolean) {
		this._validate = value;
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
		if (!this._validate) {
			return;
		}
		this.bufferSyncSupport.requestAllDiagnostics();
	}

	public syntaxDiagnosticsReceived(file: string, diagnostics: Diagnostic[]): void {
		this.syntaxDiagnostics[file] = diagnostics;
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
	private languages: LanguageManager[];
	private languagePerId: Map<LanguageManager>;

	constructor(descriptions: LanguageDescription[]) {
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

		this.client = new TypeScriptServiceClient(this);
		this.languages = [];
		this.languagePerId = Object.create(null);
		descriptions.forEach(description => {
			let manager = new LanguageManager(this.client, description);
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

	private findLanguage(file: string): LanguageManager {
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
				language.syntaxDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics));
			}
		}
	}

	/* internal */ semanticDiagnosticsReceived(event: Proto.DiagnosticEvent): void {
		let body = event.body;
		if (body.diagnostics) {
			let language = this.findLanguage(body.file);
			if (language) {
				language.semanticDiagnosticsReceived(body.file, this.createMarkerDatas(body.diagnostics));
			}
		}
	}

	private createMarkerDatas(diagnostics: Proto.Diagnostic[]): Diagnostic[] {
		let result: Diagnostic[] = [];
		for (let diagnostic of diagnostics) {
			let { start, end, text } = diagnostic;
			let range = new Range(start.line - 1, start.offset - 1, end.line - 1, end.offset - 1);
			result.push(new Diagnostic(range, text));
		}
		return result;
	}
}