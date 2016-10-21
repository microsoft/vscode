/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { languages, workspace, ExtensionContext, IndentAction, commands, CompletionList, Hover } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Position, RequestType, Protocol2Code, Code2Protocol } from 'vscode-languageclient';
import { CompletionList as LSCompletionList, Hover as LSHover } from 'vscode-languageserver-types';
import { EMPTY_ELEMENTS } from './htmlEmptyTagsShared';
import { initializeEmbeddedContentDocuments } from './embeddedContentDocuments';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

interface EmbeddedCompletionParams {
	uri: string;
	version: number;
	embeddedLanguageId: string;
	position: Position;
}

namespace EmbeddedCompletionRequest {
	export const type: RequestType<EmbeddedCompletionParams, LSCompletionList, any> = { get method() { return 'embedded/completion'; } };
}

interface EmbeddedHoverParams {
	uri: string;
	version: number;
	embeddedLanguageId: string;
	position: Position;
}

namespace EmbeddedHoverRequest {
	export const type: RequestType<EmbeddedHoverParams, LSHover, any> = { get method() { return 'embedded/hover'; } };
}

export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'htmlServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--debug=6004'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for json documents
		documentSelector: ['html', 'handlebars', 'razor'],
		synchronize: {
			// Synchronize the setting section 'html' to the server
			configurationSection: ['html'],
		},

		initializationOptions: {
			embeddedLanguages: { 'css': true },
			['format.enable']: workspace.getConfiguration('html').get('format.enable')
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('html', localize('htmlserver.name', 'HTML Language Server'), serverOptions, clientOptions);

	let embeddedDocuments = initializeEmbeddedContentDocuments('html-embedded', client);
	context.subscriptions.push(embeddedDocuments);

	client.onRequest(EmbeddedCompletionRequest.type, params => {
		let position = Protocol2Code.asPosition(params.position);
		let virtualDocumentURI = embeddedDocuments.getVirtualDocumentUri(params.uri, params.embeddedLanguageId);

		return embeddedDocuments.openVirtualDocument(virtualDocumentURI, params.version).then(document => {
			if (document) {
				return commands.executeCommand<CompletionList>('vscode.executeCompletionItemProvider', virtualDocumentURI, position).then(completionList => {
					if (completionList) {
						return {
							isIncomplete: completionList.isIncomplete,
							items: completionList.items.map(Code2Protocol.asCompletionItem)
						};
					}
					return { isIncomplete: true, items: [] };
				});
			}
			return { isIncomplete: true, items: [] };
		});
	});

	client.onRequest(EmbeddedHoverRequest.type, params => {
		let position = Protocol2Code.asPosition(params.position);
		let virtualDocumentURI = embeddedDocuments.getVirtualDocumentUri(params.uri, params.embeddedLanguageId);
		return embeddedDocuments.openVirtualDocument(virtualDocumentURI, params.version).then(document => {
			if (document) {
				return commands.executeCommand<Hover[]>('vscode.executeHoverProvider', virtualDocumentURI, position).then(hover => {
					if (hover && hover.length > 0) {
						return <LSHover>{
							contents: hover[0].contents,
							range: Code2Protocol.asRange(hover[0].range)
						};
					}
					return void 0;
				});
			}
			return void 0;
		});
	});

	let disposable = client.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	languages.setLanguageConfiguration('html', {
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

	languages.setLanguageConfiguration('handlebars', {
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

	languages.setLanguageConfiguration('razor', {
		wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
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
}