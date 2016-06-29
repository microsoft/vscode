/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import {languages, window, commands, ExtensionContext} from 'vscode';
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, RequestType, Range, TextEdit, Protocol2Code} from 'vscode-languageclient';
import {activateColorDecorations} from './colorDecorators';

namespace ColorSymbolRequest {
	export const type: RequestType<string, Range[], any> = { get method() { return 'css/colorSymbols'; } };
}

// this method is called when vs code is activated
export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'cssServerMain.js'));
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
		documentSelector: ['css', 'less', 'scss'],
		synchronize: {
			configurationSection: ['css', 'scss', 'less']
		},
		initializationOptions: {
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('css', serverOptions, clientOptions);

	let disposable = client.start();
	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	let colorRequestor = (uri: string) => {
		return client.sendRequest(ColorSymbolRequest.type, uri).then(ranges => ranges.map(Protocol2Code.asRange));
	};
	disposable = activateColorDecorations(colorRequestor, { css: true, scss: true, less: true });
	context.subscriptions.push(disposable);

	languages.setLanguageConfiguration('css', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|((::|[@#.!:])?[\w-?]+%?)|::|[@#.!:]/g,
		comments: {
			blockComment: ['/*', '*/']
		},
		brackets: [['{', '}'], ['[', ']'], ['(', ')']],
		autoClosingPairs: [
			{ open: '{', close: '}' },
			{ open: '[', close: ']' },
			{ open: '(', close: ')' },
			{ open: '"', close: '"', notIn: ['string'] },
			{ open: '\'', close: '\'', notIn: ['string'] }
		]
	});

	languages.setLanguageConfiguration('less', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|([@#!.:]?[\w-?]+%?)|[@#!.]/g,
		comments: {
			blockComment: ['/*', '*/'],
			lineComment: '//'
		},
		brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']],
		autoClosingPairs: [
			{ open: '"', close: '"', notIn: ['string', 'comment'] },
			{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
			{ open: '{', close: '}', notIn: ['string', 'comment'] },
			{ open: '[', close: ']', notIn: ['string', 'comment'] },
			{ open: '(', close: ')', notIn: ['string', 'comment'] },
			{ open: '<', close: '>', notIn: ['string', 'comment'] },
		]
	});

	languages.setLanguageConfiguration('scss', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|([@#$!.:]?[\w-?]+%?)|[@#!.]/g,
		comments: {
			blockComment: ['/*', '*/'],
			lineComment: '//'
		},
		brackets: [['{', '}'], ['[', ']'], ['(', ')'], ['<', '>']],
		autoClosingPairs: [
			{ open: '"', close: '"', notIn: ['string', 'comment'] },
			{ open: '\'', close: '\'', notIn: ['string', 'comment'] },
			{ open: '{', close: '}', notIn: ['string', 'comment'] },
			{ open: '[', close: ']', notIn: ['string', 'comment'] },
			{ open: '(', close: ')', notIn: ['string', 'comment'] },
			{ open: '<', close: '>', notIn: ['string', 'comment'] },
		]
	});

	commands.registerCommand('_css.applyCodeAction', applyCodeAction);
}

function applyCodeAction(uri: string, documentVersion: number, edits: TextEdit[]) {
	let textEditor = window.activeTextEditor;
	if (textEditor && textEditor.document.uri.toString() === uri) {
		if (textEditor.document.version !== documentVersion) {
			window.showInformationMessage(`CSS fix is outdated and can't be applied to the document.`);
		}
		textEditor.edit(mutator => {
			for (let edit of edits) {
				mutator.replace(Protocol2Code.asRange(edit.range), edit.newText);
			}
		}).then(success => {
			if (!success) {
				window.showErrorMessage('Failed to apply CSS fix to the document. Please consider opening an issue with steps to reproduce.');
			}
		});
	}
}

