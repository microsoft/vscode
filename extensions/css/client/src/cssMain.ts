/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { languages, window, commands, ExtensionContext, TextDocument, ColorRange, Color } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, TextEdit } from 'vscode-languageclient';

import { ConfigurationFeature } from 'vscode-languageclient/lib/proposed';
import { DocumentColorRequest } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

const CSSColorFormats = {
	Hex: '#{red:X}{green:X}{blue:X}',
	RGB: {
		opaque: 'rgb({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]})',
		transparent: 'rgba({red:d[0-255]}, {green:d[0-255]}, {blue:d[0-255]}, {alpha})'
	},
	HSL: {
		opaque: 'hsl({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%)',
		transparent: 'hsla({hue:d[0-360]}, {saturation:d[0-100]}%, {luminance:d[0-100]}%, {alpha})'
	}
};

// this method is called when vs code is activated
export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'cssServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6004'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	let documentSelector = ['css', 'scss', 'less'];

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {
			configurationSection: ['css', 'scss', 'less']
		},
		initializationOptions: {
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('css', localize('cssserver.name', 'CSS Language Server'), serverOptions, clientOptions);
	client.registerFeature(new ConfigurationFeature(client));

	let disposable = client.start();
	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	client.onReady().then(_ => {
		// register color provider
		context.subscriptions.push(languages.registerColorProvider(documentSelector, {
			provideDocumentColors(document: TextDocument): Thenable<ColorRange[]> {
				let params = client.code2ProtocolConverter.asDocumentSymbolParams(document);
				return client.sendRequest(DocumentColorRequest.type, params).then(symbols => {
					return symbols.map(symbol => {
						let range = client.protocol2CodeConverter.asRange(symbol.range);
						let color = new Color(symbol.color.red * 255, symbol.color.green * 255, symbol.color.blue * 255, symbol.color.alpha);
						return new ColorRange(range, color, [CSSColorFormats.Hex, CSSColorFormats.RGB, CSSColorFormats.HSL]);
					});
				});
			}
		}));
	});

	let indentationRules = {
		increaseIndentPattern: /(^.*\{[^}]*$)/,
		decreaseIndentPattern: /^\s*\}/
	};

	languages.setLanguageConfiguration('css', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g,
		indentationRules: indentationRules
	});

	languages.setLanguageConfiguration('less', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]+(?=[^,{;]*[,{]))|(([@#.!])?[\w-?]+%?|[@#!.])/g,
		indentationRules: indentationRules
	});

	languages.setLanguageConfiguration('scss', {
		wordPattern: /(#?-?\d*\.\d\w*%?)|(::?[\w-]*(?=[^,{;]*[,{]))|(([@$#.!])?[\w-?]+%?|[@#!$.])/g,
		indentationRules: indentationRules
	});

	commands.registerCommand('_css.applyCodeAction', applyCodeAction);

	function applyCodeAction(uri: string, documentVersion: number, edits: TextEdit[]) {
		let textEditor = window.activeTextEditor;
		if (textEditor && textEditor.document.uri.toString() === uri) {
			if (textEditor.document.version !== documentVersion) {
				window.showInformationMessage(`CSS fix is outdated and can't be applied to the document.`);
			}
			textEditor.edit(mutator => {
				for (let edit of edits) {
					mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
				}
			}).then(success => {
				if (!success) {
					window.showErrorMessage('Failed to apply CSS fix to the document. Please consider opening an issue with steps to reproduce.');
				}
			});
		}
	}
}

