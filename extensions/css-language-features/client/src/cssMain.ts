/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { isArray } from 'util';
import { commands, CompletionItem, CompletionItemKind, ConfigurationTarget, ExtensionContext, languages, MarkdownString, Position, Range, SnippetString, TextEdit, window, workspace } from 'vscode';
import { Disposable, LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from 'vscode-languageclient';
import * as nls from 'vscode-nls';
import { getCustomDataPathsFromAllExtensions, getCustomDataPathsInAllWorkspaces } from './customData';
import { filterLinks } from './markdownLinks';

const localize = nls.loadMessageBundle();

export function activate(context: ExtensionContext) {
	/**
	 * Link whitelisting for hover / completion
	 */
	let whiteList: string[] = workspace.getConfiguration('css').get('trustedDomains', []);
	commands.registerCommand('css.askLinkPermission', async ({ domain, linkValue }) => {
		const results = await window.showInformationMessage(
			`Opening link ${linkValue}. Trust links from ${domain}?`,
			'Yes',
			'Dismiss'
		);
		if (results === 'Yes') {
			whiteList.push(domain);
			await workspace.getConfiguration('css').update('trustedDomains', whiteList, ConfigurationTarget.Global);
		}
	});

	workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('css.trustedDomains')) {
			whiteList = workspace.getConfiguration('css').get('trustedDomains', []);
		}
	});

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
		},
		middleware: {
			async provideHover(document, position, token, next) {
				const originalHover = await next(document, position, token);
				if (originalHover) {
					originalHover.contents.forEach(c => {
						if (c instanceof MarkdownString) {
							c.value = filterLinks(c.value, whiteList);
							c.isTrusted = true;
						}
					});
				}

				return originalHover;
			},
			async provideCompletionItem(document, position, context, token, next) {
				const originalCompletionItems = await next(document, position, context, token);
				if (originalCompletionItems) {
					const items = isArray(originalCompletionItems) ? originalCompletionItems : originalCompletionItems.items;

					items.forEach(c => {
						if (c.documentation instanceof MarkdownString) {
							c.documentation.value = filterLinks(c.documentation.value, whiteList);
							c.documentation.isTrusted = true;
						}
					});
				}
				return originalCompletionItems;
			}
		}
	};

	// Create the language client and start the client.
	let client = new LanguageClient(
		'css',
		localize('cssserver.name', 'CSS Language Server'),
		serverOptions,
		clientOptions
	);
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
					beginProposal.range = range;
					TextEdit.replace(range, '/* #region */');
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
			textEditor
				.edit(mutator => {
					for (let edit of edits) {
						mutator.replace(client.protocol2CodeConverter.asRange(edit.range), edit.newText);
					}
				})
				.then(success => {
					if (!success) {
						window.showErrorMessage(
							'Failed to apply CSS fix to the document. Please consider opening an issue with steps to reproduce.'
						);
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
