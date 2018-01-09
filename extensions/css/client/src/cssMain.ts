/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as path from 'path';

import { languages, window, commands, ExtensionContext, TextDocument, ColorInformation, ColorPresentation, Color, Range, Position, CompletionItem, CompletionItemKind, TextEdit, SnippetString } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';

import { ConfigurationFeature } from 'vscode-languageclient/lib/configuration.proposed';
import { DocumentColorRequest, DocumentColorParams, ColorPresentationRequest, ColorPresentationParams } from 'vscode-languageserver-protocol/lib/protocol.colorProvider.proposed';

import * as nls from 'vscode-nls';
let localize = nls.loadMessageBundle();

// this method is called when vs code is activated
export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('server', 'out', 'cssServerMain.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6044'] };

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
			provideDocumentColors(document: TextDocument): Thenable<ColorInformation[]> {
				let params: DocumentColorParams = {
					textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(document)
				};
				return client.sendRequest(DocumentColorRequest.type, params).then(symbols => {
					return symbols.map(symbol => {
						let range = client.protocol2CodeConverter.asRange(symbol.range);
						let color = new Color(symbol.color.red, symbol.color.green, symbol.color.blue, symbol.color.alpha);
						return new ColorInformation(range, color);
					});
				});
			},
			provideColorPresentations(color: Color, context): ColorPresentation[] | Thenable<ColorPresentation[]> {
				let params: ColorPresentationParams = {
					textDocument: client.code2ProtocolConverter.asTextDocumentIdentifier(context.document),
					color,
					range: client.code2ProtocolConverter.asRange(context.range)
				};
				return client.sendRequest(ColorPresentationRequest.type, params).then(presentations => {
					return presentations.map(p => {
						let presentation = new ColorPresentation(p.label);
						presentation.textEdit = p.textEdit && client.protocol2CodeConverter.asTextEdit(p.textEdit);
						presentation.additionalTextEdits = p.additionalTextEdits && client.protocol2CodeConverter.asTextEdits(p.additionalTextEdits);
						return presentation;
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

	const regionCompletionRegExpr = /^(\s*)(\/(\*\s*(#\w*)?)?)?/;
	languages.registerCompletionItemProvider(documentSelector, {
		provideCompletionItems(doc, pos) {
			let lineUntilPos = doc.getText(new Range(new Position(pos.line, 0), pos));
			let match = lineUntilPos.match(regionCompletionRegExpr);
			if (match) {
				let range = new Range(new Position(pos.line, match[1].length), pos);
				let beginProposal = new CompletionItem('#region', CompletionItemKind.Snippet);
				beginProposal.range = range; TextEdit.replace(range, '/* #region */');
				beginProposal.insertText = new SnippetString('/* #region $1*/');
				beginProposal.documentation = localize('folding.start', 'Folding Region Start');
				beginProposal.filterText = match[2];
				beginProposal.sortText = 'za';
				let endProposal = new CompletionItem('#endregion', CompletionItemKind.Snippet);
				endProposal.range = range;
				endProposal.insertText = '/* #endregion */';
				endProposal.documentation = localize('folding.end', 'Folding Region End');
				endProposal.sortText = 'zb';
				endProposal.filterText = match[2];
				return [beginProposal, endProposal];
			}
			return null;
		}
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

