/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getLocation, Location } from 'jsonc-parser';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();

export class SettingsDocument {

	constructor(private document: vscode.TextDocument) { }

	public provideCompletionItems(position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[]> {
		const location = getLocation(this.document.getText(), this.document.offsetAt(position));
		const range = this.document.getWordRangeAtPosition(position) || new vscode.Range(position, position);

		// window.title
		if (location.path[0] === 'window.title') {
			return this.provideWindowTitleCompletionItems(location, range);
		}

		// files.association
		if (location.path[0] === 'files.associations') {
			return this.provideFilesAssociationsCompletionItems(location, range);
		}

		// files.exclude, search.exclude
		if (location.path[0] === 'files.exclude' || location.path[0] === 'search.exclude') {
			return this.provideExcludeCompletionItems(location, range);
		}

		// files.defaultLanguage
		if (location.path[0] === 'files.defaultLanguage') {
			return this.provideLanguageCompletionItems(location, range);
		}

		return this.provideLanguageOverridesCompletionItems(location, position);
	}

	private provideWindowTitleCompletionItems(location: Location, range: vscode.Range): vscode.ProviderResult<vscode.CompletionItem[]> {
		const completions: vscode.CompletionItem[] = [];

		completions.push(this.newSimpleCompletionItem('${activeEditorShort}', range, localize('activeEditorShort', "e.g. myFile.txt")));
		completions.push(this.newSimpleCompletionItem('${activeEditorMedium}', range, localize('activeEditorMedium', "e.g. myFolder/myFile.txt")));
		completions.push(this.newSimpleCompletionItem('${activeEditorLong}', range, localize('activeEditorLong', "e.g. /Users/Development/myProject/myFolder/myFile.txt")));
		completions.push(this.newSimpleCompletionItem('${rootName}', range, localize('rootName', "e.g. myProject")));
		completions.push(this.newSimpleCompletionItem('${rootPath}', range, localize('rootPath', "e.g. /Users/Development/myProject")));
		completions.push(this.newSimpleCompletionItem('${appName}', range, localize('appName', "e.g. VS Code")));
		completions.push(this.newSimpleCompletionItem('${dirty}', range, localize('dirty', "a dirty indicator if the active editor is dirty")));
		completions.push(this.newSimpleCompletionItem('${separator}', range, localize('separator', "a conditional separator (' - ') that only shows when surrounded by variables with values")));

		return Promise.resolve(completions);
	}

	private provideFilesAssociationsCompletionItems(location: Location, range: vscode.Range): vscode.ProviderResult<vscode.CompletionItem[]> {
		const completions: vscode.CompletionItem[] = [];

		// Key
		if (location.path.length === 1) {
			completions.push(this.newSnippetCompletionItem({
				label: localize('assocLabelFile', "Files with Extension"),
				documentation: localize('assocDescriptionFile', "Map all files matching the glob pattern in their filename to the language with the given identifier."),
				snippet: location.isAtPropertyKey ? '"*.${1:extension}": "${2:language}"' : '{ "*.${1:extension}": "${2:language}" }',
				range
			}));

			completions.push(this.newSnippetCompletionItem({
				label: localize('assocLabelPath', "Files with Path"),
				documentation: localize('assocDescriptionPath', "Map all files matching the absolute path glob pattern in their path to the language with the given identifier."),
				snippet: location.isAtPropertyKey ? '"/${1:path to file}/*.${2:extension}": "${3:language}"' : '{ "/${1:path to file}/*.${2:extension}": "${3:language}" }',
				range
			}));
		}

		// Value
		else if (location.path.length === 2 && !location.isAtPropertyKey) {
			return this.provideLanguageCompletionItems(location, range);
		}

		return Promise.resolve(completions);
	}

	private provideExcludeCompletionItems(location: Location, range: vscode.Range): vscode.ProviderResult<vscode.CompletionItem[]> {
		const completions: vscode.CompletionItem[] = [];

		// Key
		if (location.path.length === 1) {
			completions.push(this.newSnippetCompletionItem({
				label: localize('fileLabel', "Files by Extension"),
				documentation: localize('fileDescription', "Match all files of a specific file extension."),
				snippet: location.isAtPropertyKey ? '"**/*.${1:extension}": true' : '{ "**/*.${1:extension}": true }',
				range
			}));

			completions.push(this.newSnippetCompletionItem({
				label: localize('filesLabel', "Files with Multiple Extensions"),
				documentation: localize('filesDescription', "Match all files with any of the file extensions."),
				snippet: location.isAtPropertyKey ? '"**/*.{ext1,ext2,ext3}": true' : '{ "**/*.{ext1,ext2,ext3}": true }',
				range
			}));

			completions.push(this.newSnippetCompletionItem({
				label: localize('derivedLabel', "Files with Siblings by Name"),
				documentation: localize('derivedDescription', "Match files that have siblings with the same name but a different extension."),
				snippet: location.isAtPropertyKey ? '"**/*.${1:source-extension}": { "when": "$(basename).${2:target-extension}" }' : '{ "**/*.${1:source-extension}": { "when": "$(basename).${2:target-extension}" } }',
				range
			}));

			completions.push(this.newSnippetCompletionItem({
				label: localize('topFolderLabel', "Folder by Name (Top Level)"),
				documentation: localize('topFolderDescription', "Match a top level folder with a specific name."),
				snippet: location.isAtPropertyKey ? '"${1:name}": true' : '{ "${1:name}": true }',
				range
			}));

			completions.push(this.newSnippetCompletionItem({
				label: localize('topFoldersLabel', "Folders with Multiple Names (Top Level)"),
				documentation: localize('topFoldersDescription', "Match multiple top level folders."),
				snippet: location.isAtPropertyKey ? '"{folder1,folder2,folder3}": true' : '{ "{folder1,folder2,folder3}": true }',
				range
			}));

			completions.push(this.newSnippetCompletionItem({
				label: localize('folderLabel', "Folder by Name (Any Location)"),
				documentation: localize('folderDescription', "Match a folder with a specific name in any location."),
				snippet: location.isAtPropertyKey ? '"**/${1:name}": true' : '{ "**/${1:name}": true }',
				range
			}));
		}

		// Value
		else {
			completions.push(this.newSimpleCompletionItem('false', range, localize('falseDescription', "Disable the pattern.")));
			completions.push(this.newSimpleCompletionItem('true', range, localize('trueDescription', "Enable the pattern.")));

			completions.push(this.newSnippetCompletionItem({
				label: localize('derivedLabel', "Files with Siblings by Name"),
				documentation: localize('siblingsDescription', "Match files that have siblings with the same name but a different extension."),
				snippet: '{ "when": "$(basename).${1:extension}" }',
				range
			}));
		}

		return Promise.resolve(completions);
	}

	private provideLanguageCompletionItems(location: Location, range: vscode.Range, formatFunc: (string) => string = (l) => JSON.stringify(l)): vscode.ProviderResult<vscode.CompletionItem[]> {
		return vscode.languages.getLanguages().then(languages => {
			return languages.map(l => {
				return this.newSimpleCompletionItem(formatFunc(l), range);
			});
		});
	}

	private provideLanguageOverridesCompletionItems(location: Location, position: vscode.Position): vscode.ProviderResult<vscode.CompletionItem[]> {
		let range = this.document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
		const text = this.document.getText(range);

		if (location.path.length === 0) {

			let snippet = '"[${1:language}]": {\n\t"$0"\n}';

			// Suggestion model word matching includes quotes,
			// hence exclude the starting quote from the snippet and the range
			// ending quote gets replaced
			if (text && text.startsWith('"')) {
				range = new vscode.Range(new vscode.Position(range.start.line, range.start.character + 1), range.end);
				snippet = snippet.substring(1);
			}

			return Promise.resolve([this.newSnippetCompletionItem({
				label: localize('languageSpecificEditorSettings', "Language specific editor settings"),
				documentation: localize('languageSpecificEditorSettingsDescription', "Override editor settings for language"),
				snippet,
				range
			})]);
		}

		if (location.path.length === 1 && location.previousNode && typeof location.previousNode.value === 'string' && location.previousNode.value.startsWith('[')) {
			// Suggestion model word matching includes closed sqaure bracket and ending quote
			// Hence include them in the proposal to replace
			return this.provideLanguageCompletionItems(location, range, language => `"[${language}]"`);
		}
		return Promise.resolve([]);
	}

	private newSimpleCompletionItem(text: string, range: vscode.Range, description?: string, insertText?: string): vscode.CompletionItem {
		const item = new vscode.CompletionItem(text);
		item.kind = vscode.CompletionItemKind.Value;
		item.detail = description;
		item.insertText = insertText ? insertText : text;
		item.range = range;
		return item;
	}

	private newSnippetCompletionItem(o: { label: string; documentation?: string; snippet: string; range: vscode.Range; }): vscode.CompletionItem {
		const item = new vscode.CompletionItem(o.label);
		item.kind = vscode.CompletionItemKind.Value;
		item.documentation = o.documentation;
		item.insertText = new vscode.SnippetString(o.snippet);
		item.range = o.range;
		return item;
	}
}
