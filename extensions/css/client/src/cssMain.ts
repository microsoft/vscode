/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { languages, window, commands, ExtensionContext, TextDocument, ColorInformation, ColorPresentation, Color, TextEdit as CodeTextEdit } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, TextEdit } from 'vscode-languageclient';

import { ConfigurationFeature } from 'vscode-languageclient/lib/proposed';
import { DocumentColorRequest } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';

import * as nls from 'vscode-nls';
import * as convert from 'color-convert';
let localize = nls.loadMessageBundle();

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

	var _toTwoDigitHex = function (n: number): string {
		const r = n.toString(16);
		return r.length !== 2 ? '0' + r : r;
	};

	client.onReady().then(_ => {
		// register color provider
		context.subscriptions.push(languages.registerColorProvider(documentSelector, {
			provideDocumentColors(document: TextDocument): Thenable<ColorInformation[]> {
				let params = client.code2ProtocolConverter.asDocumentSymbolParams(document);
				return client.sendRequest(DocumentColorRequest.type, params).then(symbols => {
					return symbols.map(symbol => {
						let range = client.protocol2CodeConverter.asRange(symbol.range);
						let color = new Color(symbol.color.red, symbol.color.green, symbol.color.blue, symbol.color.alpha);
						return new ColorInformation(range, color);
					});
				});
			},
			provideColorPresentations(document: TextDocument, colorInfo: ColorInformation): ColorPresentation[] | Thenable<ColorPresentation[]> {
				let result: ColorPresentation[] = [];
				let color = colorInfo.color;
				let label;
				if (color.alpha === 1) {
					label = `rgb(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)})`;
				} else {
					label = `rgba(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)}, ${color.alpha})`;
				}

				result.push({ label: label, textEdit: new CodeTextEdit(colorInfo.range, label) });

				if (color.alpha === 1) {
					label = `#${_toTwoDigitHex(Math.round(color.red * 255))}${_toTwoDigitHex(Math.round(color.green * 255))}${_toTwoDigitHex(Math.round(color.blue * 255))}`;
				} else {
					label = `#${_toTwoDigitHex(Math.round(color.red * 255))}${_toTwoDigitHex(Math.round(color.green * 255))}${_toTwoDigitHex(Math.round(color.blue * 255))}${_toTwoDigitHex(Math.round(color.alpha * 255))}`;
				}

				result.push({ label: label, textEdit: new CodeTextEdit(colorInfo.range, label) });

				const hsl = convert.rgb.hsl(Math.round(color.red * 255), Math.round(color.green * 255), Math.round(color.blue * 255));
				if (color.alpha === 1) {
					label = `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`;
				} else {
					label = `hsla(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%, ${color.alpha})`;
				}

				result.push({ label: label, textEdit: new CodeTextEdit(colorInfo.range, label) });
				return result;
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

