/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vscode-nls';
const localize = nls.loadMessageBundle();
import * as vscode from 'vscode';
import { getLocation, visit, parse, ParseErrorCode } from 'jsonc-parser';
import * as path from 'path';
import { SettingsDocument } from './settingsDocumentHelper';

const decoration = vscode.window.createTextEditorDecorationType({
	color: '#9e9e9e'
});

let pendingLaunchJsonDecoration: NodeJS.Timer;

export function activate(context: vscode.ExtensionContext): void {

	//keybindings.json command-suggestions
	context.subscriptions.push(registerKeybindingsCompletions());

	//settings.json suggestions
	context.subscriptions.push(registerSettingsCompletions());

	//extensions suggestions
	context.subscriptions.push(...registerExtensionsCompletions());

	// launch.json decorations
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => updateLaunchJsonDecorations(editor), null, context.subscriptions));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
			if (pendingLaunchJsonDecoration) {
				clearTimeout(pendingLaunchJsonDecoration);
			}
			pendingLaunchJsonDecoration = setTimeout(() => updateLaunchJsonDecorations(vscode.window.activeTextEditor), 1000);
		}
	}, null, context.subscriptions));
	updateLaunchJsonDecorations(vscode.window.activeTextEditor);

	context.subscriptions.push(vscode.workspace.onWillSaveTextDocument(e => {
		if (!e.document.fileName.endsWith('/settings.json')) {
			return;
		}

		autoFixSettingsJSON(e);
	}));
}

function autoFixSettingsJSON(willSaveEvent: vscode.TextDocumentWillSaveEvent): void {
	const document = willSaveEvent.document;
	const text = document.getText();
	const edit = new vscode.WorkspaceEdit();

	let lastEndOfSomething = -1;
	visit(text, {
		onArrayEnd(offset: number, length: number): void {
			lastEndOfSomething = offset + length;
		},

		onLiteralValue(value: any, offset: number, length: number): void {
			lastEndOfSomething = offset + length;
		},

		onObjectEnd(offset: number, length: number): void {
			lastEndOfSomething = offset + length;
		},

		onError(error: ParseErrorCode, offset: number, length: number): void {
			if (error === ParseErrorCode.CommaExpected && lastEndOfSomething > -1) {
				const fixPosition = document.positionAt(lastEndOfSomething);
				edit.insert(document.uri, fixPosition, ',');
			}
		}
	});

	willSaveEvent.waitUntil(
		vscode.workspace.applyEdit(edit));
}

function registerKeybindingsCompletions(): vscode.Disposable {
	const commands = vscode.commands.getCommands(true);

	return vscode.languages.registerCompletionItemProvider({ pattern: '**/keybindings.json' }, {

		provideCompletionItems(document, position, token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (location.path[1] === 'command') {

				const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
				return commands.then(ids => ids.map(id => newSimpleCompletionItem(JSON.stringify(id), range)));
			}
		}
	});
}

function registerSettingsCompletions(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern: '**/settings.json' }, {
		provideCompletionItems(document, position, token) {
			return new SettingsDocument(document).provideCompletionItems(position, token);
		}
	});
}

interface IExtensionsContent {
	recommendations: string[];
}

function registerExtensionsCompletions(): vscode.Disposable[] {
	return [registerExtensionsCompletionsInExtensionsDocument(), registerExtensionsCompletionsInWorkspaceConfigurationDocument()];
}

function registerExtensionsCompletionsInExtensionsDocument(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ pattern: '**/extensions.json' }, {
		provideCompletionItems(document, position, token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
			if (location.path[0] === 'recommendations') {
				const extensionsContent = <IExtensionsContent>parse(document.getText());
				return provideInstalledExtensionProposals(extensionsContent, range);
			}
			return [];
		}
	});
}

function registerExtensionsCompletionsInWorkspaceConfigurationDocument(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ pattern: '**/*.code-workspace' }, {
		provideCompletionItems(document, position, token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
			if (location.path[0] === 'extensions' && location.path[1] === 'recommendations') {
				const extensionsContent = <IExtensionsContent>parse(document.getText())['extensions'];
				return provideInstalledExtensionProposals(extensionsContent, range);
			}
			return [];
		}
	});
}

function provideInstalledExtensionProposals(extensionsContent: IExtensionsContent, range: vscode.Range): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
	const alreadyEnteredExtensions = extensionsContent && extensionsContent.recommendations || [];
	if (Array.isArray(alreadyEnteredExtensions)) {
		const knownExtensionProposals = vscode.extensions.all.filter(e =>
			!(e.id.startsWith('vscode.')
				|| e.id === 'Microsoft.vscode-markdown'
				|| alreadyEnteredExtensions.indexOf(e.id) > -1));
		if (knownExtensionProposals.length) {
			return knownExtensionProposals.map(e => {
				const item = new vscode.CompletionItem(e.id);
				const insertText = `"${e.id}"`;
				item.kind = vscode.CompletionItemKind.Value;
				item.insertText = insertText;
				item.range = range;
				item.filterText = insertText;
				return item;
			});
		} else {
			const example = new vscode.CompletionItem(localize('exampleExtension', "Example"));
			example.insertText = '"vscode.csharp"';
			example.kind = vscode.CompletionItemKind.Value;
			example.range = range;
			return [example];
		}
	}
}

function newSimpleCompletionItem(label: string, range: vscode.Range, description?: string, insertText?: string): vscode.CompletionItem {
	const item = new vscode.CompletionItem(label);
	item.kind = vscode.CompletionItemKind.Value;
	item.detail = description;
	item.insertText = insertText || label;
	item.range = range;

	return item;
}

function updateLaunchJsonDecorations(editor: vscode.TextEditor | undefined): void {
	if (!editor || path.basename(editor.document.fileName) !== 'launch.json') {
		return;
	}

	const ranges: vscode.Range[] = [];
	let addPropertyAndValue = false;
	let depthInArray = 0;
	visit(editor.document.getText(), {
		onObjectProperty: (property, offset, length) => {
			// Decorate attributes which are unlikely to be edited by the user.
			// Only decorate "configurations" if it is not inside an array (compounds have a configurations property which should not be decorated).
			addPropertyAndValue = property === 'version' || property === 'type' || property === 'request' || property === 'compounds' || (property === 'configurations' && depthInArray === 0);
			if (addPropertyAndValue) {
				ranges.push(new vscode.Range(editor.document.positionAt(offset), editor.document.positionAt(offset + length)));
			}
		},
		onLiteralValue: (value, offset, length) => {
			if (addPropertyAndValue) {
				ranges.push(new vscode.Range(editor.document.positionAt(offset), editor.document.positionAt(offset + length)));
			}
		},
		onArrayBegin: (offset: number, length: number) => {
			depthInArray++;
		},
		onArrayEnd: (offset: number, length: number) => {
			depthInArray--;
		}
	});

	editor.setDecorations(decoration, ranges);
}

vscode.languages.registerDocumentSymbolProvider({ pattern: '**/launch.json', language: 'jsonc' }, {
	provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[]> {
		const result: vscode.SymbolInformation[] = [];
		let name: string = '';
		let lastProperty = '';
		let startOffset = 0;
		let depthInObjects = 0;

		visit(document.getText(), {
			onObjectProperty: (property, offset, length) => {
				lastProperty = property;
			},
			onLiteralValue: (value: any, offset: number, length: number) => {
				if (lastProperty === 'name') {
					name = value;
				}
			},
			onObjectBegin: (offset: number, length: number) => {
				depthInObjects++;
				if (depthInObjects === 2) {
					startOffset = offset;
				}
			},
			onObjectEnd: (offset: number, length: number) => {
				if (name && depthInObjects === 2) {
					result.push(new vscode.SymbolInformation(name, vscode.SymbolKind.Object, new vscode.Range(document.positionAt(startOffset), document.positionAt(offset))));
				}
				depthInObjects--;
			},
		});

		return result;
	}
});
