/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as path from 'path';
import * as fs from 'fs';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();

import { languages, window, commands, ExtensionContext, Range, Position, CompletionItem, CompletionItemKind, TextEdit, SnippetString, workspace, TextDocument, SelectionRange, SelectionRangeKind } from 'vscode';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Disposable, TextDocumentIdentifier } from 'vscode-languageclient';
import { getCustomDataPathsInAllWorkspaces, getCustomDataPathsFromAllExtensions } from './customData';

// this method is called when vs code is activated
export function activate(context: ExtensionContext) {

	let serverMain = readJSONFile(context.asAbsolutePath('./server/package.json')).main;
	let serverModule = context.asAbsolutePath(path.join('server', serverMain));

	// The debug options for the server
	let debugOptions = { execArgv: ['--nolazy', '--inspect=6044'] };

	// If the extension is launch in debug mode the debug server options are use
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	};

	let documentSelector = ['css', 'scss', 'less'];

	let dataPaths = [
		...getCustomDataPathsInAllWorkspaces(workspace.workspaceFolders),
		...getCustomDataPathsFromAllExtensions()
	];

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector,
		synchronize: {
			configurationSection: ['css', 'scss', 'less']
		},
		initializationOptions: {
			dataPaths
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient('css', localize('cssserver.name', 'CSS Language Server'), serverOptions, clientOptions);
	client.registerProposedFeatures();

	let disposable = client.start();
	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

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

	client.onReady().then(() => {
		context.subscriptions.push(initCompletionProvider());

		documentSelector.forEach(selector => {
			context.subscriptions.push(languages.registerSelectionRangeProvider(selector, {
				async provideSelectionRanges(document: TextDocument, positions: Position[]): Promise<SelectionRange[][]> {
					const textDocument = client.code2ProtocolConverter.asTextDocumentIdentifier(document);
					return Promise.all(positions.map(async position => {
						const rawRanges = await client.sendRequest<Range[]>('$/textDocument/selectionRange', { textDocument, position });
						if (Array.isArray(rawRanges)) {
							return rawRanges.map(r => {
								return {
									range: client.protocol2CodeConverter.asRange(r),
									kind: SelectionRangeKind.Declaration
								};
							});
						}
						return [];
					}));
				}
			}));
		});
	});

	const selectionRangeProvider = {
		async provideSelectionRanges(document: TextDocument, positions: Position[]): Promise<SelectionRange[][]> {
			const textDocument = TextDocumentIdentifier.create(document.uri.toString());
			return Promise.all(positions.map(async position => {
				const rawRanges: Range[] = await client.sendRequest('$/textDocument/selectionRange', { textDocument, position });

				return rawRanges.map(r => {
					const actualRange = new Range(new Position(r.start.line, r.start.character), new Position(r.end.line, r.end.character));
					return {
						range: actualRange,
						kind: SelectionRangeKind.Declaration
					};
				});
			}));
		}
	};
	documentSelector.forEach(selector => {
		languages.registerSelectionRangeProvider(selector, selectionRangeProvider);
	});

	function initCompletionProvider(): Disposable {
		const regionCompletionRegExpr = /^(\s*)(\/(\*\s*(#\w*)?)?)?$/;

		return languages.registerCompletionItemProvider(documentSelector, {
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
	}

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

function readJSONFile(location: string) {
	try {
		return JSON.parse(fs.readFileSync(location).toString());
	} catch (e) {
		console.log(`Problems reading ${location}: ${e}`);
		return {};
	}
}

