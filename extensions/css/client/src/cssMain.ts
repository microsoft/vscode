/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import {languages, window, commands, ExtensionContext} from 'vscode';
import {LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, NotificationType, Range, TextEdit, Protocol2Code} from 'vscode-languageclient';

namespace ColorDecorationNotification {
	export const type: NotificationType<Range[]> = { get method() { return 'css/colorDecorations'; } };
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

	client.onNotification(ColorDecorationNotification.type, ranges => {

	});

	let disposable = client.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	languages.setLanguageConfiguration('css', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|((::|[@#.!:])?[\w-?]+%?)|::|[@#.!:]/g,
		comments: {
			blockComment: ['/*', '*/']
		},
		brackets: [['{','}'], ['[',']'], ['(',')']],
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
		brackets: [['{','}'], ['[',']'], ['(',')'], ['<','>']],
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
		wordPattern: /(#?-?\d*\.\d\w*%?)|([@#!.:]?[\w-?]+%?)|[@#!.]/g,
		comments: {
			blockComment: ['/*', '*/'],
			lineComment: '//'
		},
		brackets: [['{','}'], ['[',']'], ['(',')'], ['<','>']],
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

// 	let decorationType : vscode.DecorationRenderOptions = {
// 		before: {
// //			content: "url(\"data:image/svg+xml;charset=utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1.2em' height='0.9em' viewBox='0 0 16 16'%3E%3Crect x='1' y='1' stroke='white' style='stroke-width: 1;' width='14' height='14' fill='#FFB6C1' shape-rendering='crispEdges' /%3E%3C/svg%3E\")",
// 			content: '" "',
// 			borderStyle: 'solid',
// 			borderWidth: '0.1em',
// 			borderColor: '#000',
// 			margin: '0.1em 0.2em 0 0.2em',
// 			width: '0.8em',
// 			height: '0.8em'
// 		},
// 		dark: {
// 			before: {
// 				borderColor: '#eee'
// 			}
// 		}
// 	};

// 	var colorsDecorationType = vscode.window.createTextEditorDecorationType(decorationType);

// 	var activeEditor = vscode.window.activeTextEditor;
// 	if (activeEditor) {
// 		triggerUpdateDecorations();
// 	}

// 	vscode.window.onDidChangeActiveTextEditor(editor => {
// 		activeEditor = editor;
// 		if (editor) {
// 			triggerUpdateDecorations();
// 		}
// 	}, null, context.subscriptions);

// 	vscode.workspace.onDidChangeTextDocument(event => {
// 		if (activeEditor && event.document === activeEditor.document) {
// 			triggerUpdateDecorations();
// 		}
// 	}, null, context.subscriptions);

// 	var timeout = null;
// 	function triggerUpdateDecorations() {
// 		if (timeout) {
// 			clearTimeout(timeout);
// 		}
// 		timeout = setTimeout(updateDecorations, 500);
// 	}

// 	function updateDecorations() {
// 		if (!activeEditor) {
// 			return;
// 		}
// 		var regEx = /#[a-fA-F0-9]{6}/g;
// 		var text = activeEditor.document.getText();
// 		var colors : vscode.DecorationOptions[] = [];
// 		var match;
// 		while (match = regEx.exec(text)) {
// 			var startPos = activeEditor.document.positionAt(match.index);
// 			var endPos = activeEditor.document.positionAt(match.index + 1);
// 			var decoration : vscode.DecorationOptions = {
// 				range: new vscode.Range(startPos, endPos),
// 				hoverMessage: 'Color **' + match[0] + '**',
// 				renderOptions: {
// 					before: {
// 						backgroundColor: match[0]
// 					}
// 				}
// 			};
// 			colors.push(decoration);


// 		}
// 		activeEditor.setDecorations(colorsDecorationType, colors);
// 	}
//}
