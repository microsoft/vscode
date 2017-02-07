/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as vscode from 'vscode';
import { getLocation, visit } from 'jsonc-parser';
import * as path from 'path';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

const decoration = vscode.window.createTextEditorDecorationType({
	color: '#b1b1b1'
});

export function activate(context): void {

	//keybindings.json command-suggestions
	context.subscriptions.push(registerKeybindingsCompletions());

	//settings.json suggestions
	context.subscriptions.push(registerSettingsCompletions());

	// launch.json decorations
	context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(editor => updateLaunchJsonDecorations(editor), null, context.subscriptions));
	context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(event => {
		if (vscode.window.activeTextEditor && event.document === vscode.window.activeTextEditor.document) {
			updateLaunchJsonDecorations(vscode.window.activeTextEditor);
		}
	}, null, context.subscriptions));
	updateLaunchJsonDecorations(vscode.window.activeTextEditor);
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
	return vscode.languages.registerCompletionItemProvider({ language: 'json', pattern: '**/settings.json' }, {

		provideCompletionItems(document, position, token) {
			const completions: vscode.CompletionItem[] = [];
			const location = getLocation(document.getText(), document.offsetAt(position));

			// window.title
			if (location.path[0] === 'window.title') {
				const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);

				completions.push(newSimpleCompletionItem('${activeEditorName}', range, localize('activeEditorName', "e.g. myFile.txt")));
				completions.push(newSimpleCompletionItem('${activeFilePath}', range, localize('activeFilePath', "e.g. /Users/Development/myProject/myFile.txt")));
				completions.push(newSimpleCompletionItem('${rootName}', range, localize('rootName', "e.g. myProject")));
				completions.push(newSimpleCompletionItem('${rootPath}', range, localize('rootPath', "e.g. /Users/Development/myProject")));
				completions.push(newSimpleCompletionItem('${appName}', range, localize('appName', "e.g. VS Code")));
				completions.push(newSimpleCompletionItem('${dirty}', range, localize('dirty', "a dirty indicator if the active editor is dirty")));
				completions.push(newSimpleCompletionItem('${separator}', range, localize('separator', "a conditional separator (' - ') that only shows when surrounded by variables with values")));
			}

			// files.association
			else if (location.path[0] === 'files.associations') {
				const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);

				// Key
				if (location.path.length === 1) {
					completions.push(newSnippetCompletionItem({
						label: localize('assocLabelFile', "Files with Extension"),
						documentation: localize('assocDescriptionFile', "Map all files matching the glob pattern in their filename to the language with the given identifier."),
						snippet: '"*.${1:extension}": "${2:language}"',
						range
					}));

					completions.push(newSnippetCompletionItem({
						label: localize('assocLabelPath', "Files with Path"),
						documentation: localize('assocDescriptionPath', "Map all files matching the absolute path glob pattern in their path to the language with the given identifier."),
						snippet: '"/${1:path to file}/*.${2:extension}": "${3:language}"',
						range
					}));
				}

				// Value
				else if (location.path.length === 2 && !location.isAtPropertyKey) {
					return vscode.languages.getLanguages().then(languages => {
						return languages.map(l => {
							return newSimpleCompletionItem(JSON.stringify(l), range);
						});
					});
				}
			}

			// files.exclude, search.exclude
			else if (location.path[0] === 'files.exclude' || location.path[0] === 'search.exclude') {
				const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);

				// Key
				if (location.path.length === 1) {
					completions.push(newSnippetCompletionItem({
						label: localize('fileLabel', "Files by Extension"),
						documentation: localize('fileDescription', "Match all files of a specific file extension."),
						snippet: '"**/*.${1:extension}": true',
						range
					}));

					completions.push(newSnippetCompletionItem({
						label: localize('filesLabel', "Files with Multiple Extensions"),
						documentation: localize('filesDescription', "Match all files with any of the file extensions."),
						snippet: '"**/*.{ext1,ext2,ext3}": true',
						range
					}));

					completions.push(newSnippetCompletionItem({
						label: localize('derivedLabel', "Files with Siblings by Name"),
						documentation: localize('derivedDescription', "Match files that have siblings with the same name but a different extension."),
						snippet: '"**/*.${1:source-extension}": { "when": "$(basename).${2:target-extension}" }',
						range
					}));

					completions.push(newSnippetCompletionItem({
						label: localize('topFolderLabel', "Folder by Name (Top Level)"),
						documentation: localize('topFolderDescription', "Match a top level folder with a specific name."),
						snippet: '"${1:name}": true',
						range
					}));

					completions.push(newSnippetCompletionItem({
						label: localize('topFoldersLabel', "Folders with Multiple Names (Top Level)"),
						documentation: localize('topFoldersDescription', "Match multiple top level folders."),
						snippet: '"{folder1,folder2,folder3}": true',
						range
					}));

					completions.push(newSnippetCompletionItem({
						label: localize('folderLabel', "Folder by Name (Any Location)"),
						documentation: localize('folderDescription', "Match a folder with a specific name in any location."),
						snippet: '"**/${1:name}": true',
						range
					}));
				}

				// Value
				else {
					completions.push(newSimpleCompletionItem('false', range, localize('falseDescription', "Disable the pattern.")));
					completions.push(newSimpleCompletionItem('true', range, localize('trueDescription', "Enable the pattern.")));

					completions.push(newSnippetCompletionItem({
						label: localize('derivedLabel', "Files with Siblings by Name"),
						documentation: localize('siblingsDescription', "Match files that have siblings with the same name but a different extension."),
						snippet: '{ "when": "$(basename).${1:extension}" }',
						range
					}));
				}
			}

			return Promise.resolve(completions);
		}
	});
}

function newSimpleCompletionItem(text: string, range: vscode.Range, description?: string): vscode.CompletionItem {
	const item = new vscode.CompletionItem(text);
	item.kind = vscode.CompletionItemKind.Value;
	item.detail = description;
	item.insertText = text;
	item.range = range;

	return item;
}

function newSnippetCompletionItem(o: { label: string; documentation?: string; snippet: string; range: vscode.Range; }): vscode.CompletionItem {
	const item = new vscode.CompletionItem(o.label);
	item.kind = vscode.CompletionItemKind.Value;
	item.documentation = o.documentation;
	item.insertText = new vscode.SnippetString(o.snippet);
	item.range = o.range;

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