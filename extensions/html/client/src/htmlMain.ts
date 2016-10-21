/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { languages, workspace, ExtensionContext, IndentAction, commands, Uri, CompletionList, EventEmitter } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Position, RequestType, Protocol2Code, Code2Protocol } from 'vscode-languageclient';
import { CompletionList as LSCompletionList } from 'vscode-languageserver-types';
import { EMPTY_ELEMENTS } from './htmlEmptyTagsShared';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

interface EmbeddedCompletionParams {
	uri: string;
	embeddedLanguageId: string;
	position: Position;
}

namespace EmbeddedCompletionRequest {
	export const type: RequestType<EmbeddedCompletionParams, LSCompletionList, any> = { get method() { return 'embedded/completion'; } };
}

interface EmbeddedContentParams {
	uri: string;
	embeddedLanguageId: string;
}

namespace EmbeddedContentRequest {
	export const type: RequestType<EmbeddedContentParams, string, any> = { get method() { return 'embedded/content'; } };
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
			['format.enable']: workspace.getConfiguration('html').get('format.enable')
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('html', localize('htmlserver.name', 'HTML Language Server'), serverOptions, clientOptions);

	let embeddedContentChanged = new EventEmitter<Uri>();

	client.onRequest(EmbeddedCompletionRequest.type, params => {
		let position = Protocol2Code.asPosition(params.position);
		let virtualURI = Uri.parse('html-embedded://' + params.embeddedLanguageId + '/' + encodeURIComponent(params.uri) + '.' + params.embeddedLanguageId);

		embeddedContentChanged.fire(virtualURI);
		return workspace.openTextDocument(virtualURI).then(_ => {
			return commands.executeCommand<CompletionList>('vscode.executeCompletionItemProvider', virtualURI, position).then(completionList => {
				if (completionList) {
					return {
						isIncomplete: completionList.isIncomplete,
						items: completionList.items.map(Code2Protocol.asCompletionItem)
					};
				}
				return { isIncomplete: true, items: [] };
			}, error => {
				return Promise.reject(error);
			});
		}, error => {
			return Promise.reject(error);
		});
	});

	let disposable = client.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);


	context.subscriptions.push(workspace.registerTextDocumentContentProvider('html-embedded', {
		provideTextDocumentContent: (uri, ct) => {
			if (uri.scheme === 'html-embedded') {
				let languageId = uri.authority;
				let path = uri.path.substring(1, uri.path.length - languageId.length - 1); // remove leading '/' and new file extension
				let documentURI = decodeURIComponent(path);
				return client.sendRequest(EmbeddedContentRequest.type, { uri: documentURI, embeddedLanguageId: languageId });
			}
			return '';
		},
		onDidChange: embeddedContentChanged.event
	}));

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