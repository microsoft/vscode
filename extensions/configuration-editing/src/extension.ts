/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getLocation, parse, visit } from 'jsonc-parser';
import * as path from 'path';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls';
import { SettingsDocument } from './settingsDocumentHelper';
const localize = nls.loadMessageBundle();

const fadedDecoration = vscode.window.createTextEditorDecorationType({
	light: {
		color: '#757575'
	},
	dark: {
		color: '#878787'
	}
});

let pendingLaunchJsonDecoration: NodeJS.Timer;

export function activate(context: vscode.ExtensionContext): void {
	//settings.json suggestions
	context.subscriptions.push(registerSettingsCompletions());

	//extensions suggestions
	context.subscriptions.push(...registerExtensionsCompletions());

	// launch.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/launch.json'));

	// task.json variable suggestions
	context.subscriptions.push(registerVariableCompletions('**/tasks.json'));

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
}

function registerSettingsCompletions(): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern: '**/settings.json' }, {
		provideCompletionItems(document, position, token) {
			return new SettingsDocument(document).provideCompletionItems(position, token);
		}
	});
}

function registerVariableCompletions(pattern: string): vscode.Disposable {
	return vscode.languages.registerCompletionItemProvider({ language: 'jsonc', pattern }, {
		provideCompletionItems(document, position, _token) {
			const location = getLocation(document.getText(), document.offsetAt(position));
			if (!location.isAtPropertyKey && location.previousNode && location.previousNode.type === 'string') {
				const indexOf$ = document.lineAt(position.line).text.indexOf('$');
				const startPosition = indexOf$ >= 0 ? new vscode.Position(position.line, indexOf$) : position;

				return [
					{ label: 'workspaceFolder', detail: localize('workspaceFolder', "The path of the folder opened in VS Code") },
					{ label: 'workspaceFolderBasename', detail: localize('workspaceFolderBasename', "The name of the folder opened in VS Code without any slashes (/)") },
					{ label: 'relativeFile', detail: localize('relativeFile', "The current opened file relative to ${workspaceFolder}") },
					{ label: 'relativeFileDirname', detail: localize('relativeFileDirname', "The current opened file's dirname relative to ${workspaceFolder}") },
					{ label: 'file', detail: localize('file', "The current opened file") },
					{ label: 'cwd', detail: localize('cwd', "The task runner's current working directory on startup") },
					{ label: 'lineNumber', detail: localize('lineNumber', "The current selected line number in the active file") },
					{ label: 'selectedText', detail: localize('selectedText', "The current selected text in the active file") },
					{ label: 'fileDirname', detail: localize('fileDirname', "The current opened file's dirname") },
					{ label: 'fileExtname', detail: localize('fileExtname', "The current opened file's extension") },
					{ label: 'fileBasename', detail: localize('fileBasename', "The current opened file's basename") },
					{ label: 'fileBasenameNoExtension', detail: localize('fileBasenameNoExtension', "The current opened file's basename with no file extension") }
				].map(variable => ({
					label: '${' + variable.label + '}',
					range: new vscode.Range(startPosition, position),
					detail: variable.detail
				}));
			}

			return [];
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
		provideCompletionItems(document, position, _token) {
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
		provideCompletionItems(document, position, _token) {
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
	return undefined;
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
		onLiteralValue: (_value, offset, length) => {
			if (addPropertyAndValue) {
				ranges.push(new vscode.Range(editor.document.positionAt(offset), editor.document.positionAt(offset + length)));
			}
		},
		onArrayBegin: (_offset: number, _length: number) => {
			depthInArray++;
		},
		onArrayEnd: (_offset: number, _length: number) => {
			depthInArray--;
		}
	});

	editor.setDecorations(fadedDecoration, ranges);
}

vscode.languages.registerDocumentSymbolProvider({ pattern: '**/launch.json', language: 'jsonc' }, {
	provideDocumentSymbols(document: vscode.TextDocument, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.SymbolInformation[]> {
		const result: vscode.SymbolInformation[] = [];
		let name: string = '';
		let lastProperty = '';
		let startOffset = 0;
		let depthInObjects = 0;

		visit(document.getText(), {
			onObjectProperty: (property, _offset, _length) => {
				lastProperty = property;
			},
			onLiteralValue: (value: any, _offset: number, _length: number) => {
				if (lastProperty === 'name') {
					name = value;
				}
			},
			onObjectBegin: (offset: number, _length: number) => {
				depthInObjects++;
				if (depthInObjects === 2) {
					startOffset = offset;
				}
			},
			onObjectEnd: (offset: number, _length: number) => {
				if (name && depthInObjects === 2) {
					result.push(new vscode.SymbolInformation(name, vscode.SymbolKind.Object, new vscode.Range(document.positionAt(startOffset), document.positionAt(offset))));
				}
				depthInObjects--;
			},
		});

		return result;
	}
}, { label: 'Launch Targets' });
