/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { getLocation, Location, parse } from 'jsonc-parser';
import * as nls from 'vscode-nls';
import { provideInstalledExtensionProposals } from './extensionsProposals';

const localize = nls.loadMessageBundle();
const OVERRIDE_IDENTIFIER_REGEX = /\[([^\[\]]*)\]/g;

export class SettingsDocument {

	constructor(private document: vscode.TextDocument) { }

	public provideCompletionItems(position: vscode.Position, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
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
			return this.provideLanguageCompletionItems(location, range).then(items => {

				// Add special item '${activeEditorLanguage}'
				return [this.newSimpleCompletionItem(JSON.stringify('${activeEditorLanguage}'), range, localize('activeEditor', "Use the language of the currently active text editor if any")), ...items];
			});
		}

		// settingsSync.ignoredExtensions
		if (location.path[0] === 'settingsSync.ignoredExtensions') {
			let ignoredExtensions = [];
			try {
				ignoredExtensions = parse(this.document.getText())['settingsSync.ignoredExtensions'];
			} catch (e) {/* ignore error */ }
			return provideInstalledExtensionProposals(ignoredExtensions, '', range, true);
		}

		// remote.extensionKind
		if (location.path[0] === 'remote.extensionKind' && location.path.length === 2 && location.isAtPropertyKey) {
			let alreadyConfigured: string[] = [];
			try {
				alreadyConfigured = Object.keys(parse(this.document.getText())['remote.extensionKind']);
			} catch (e) {/* ignore error */ }
			return provideInstalledExtensionProposals(alreadyConfigured, `: [\n\t"ui"\n]`, range, true);
		}

		// remote.portsAttributes
		if (location.path[0] === 'remote.portsAttributes' && location.path.length === 2 && location.isAtPropertyKey) {
			return this.providePortsAttributesCompletionItem(range);
		}

		return this.provideLanguageOverridesCompletionItems(location, position);
	}

	private provideWindowTitleCompletionItems(_location: Location, range: vscode.Range): vscode.ProviderResult<vscode.CompletionItem[]> {
		const completions: vscode.CompletionItem[] = [];

		completions.push(this.newSimpleCompletionItem('${activeEditorShort}', range, localize('activeEditorShort', "the file name (e.g. myFile.txt)")));
		completions.push(this.newSimpleCompletionItem('${activeEditorMedium}', range, localize('activeEditorMedium', "the path of the file relative to the workspace folder (e.g. myFolder/myFileFolder/myFile.txt)")));
		completions.push(this.newSimpleCompletionItem('${activeEditorLong}', range, localize('activeEditorLong', "the full path of the file (e.g. /Users/Development/myFolder/myFileFolder/myFile.txt)")));
		completions.push(this.newSimpleCompletionItem('${activeFolderShort}', range, localize('activeFolderShort', "the name of the folder the file is contained in (e.g. myFileFolder)")));
		completions.push(this.newSimpleCompletionItem('${activeFolderMedium}', range, localize('activeFolderMedium', "the path of the folder the file is contained in, relative to the workspace folder (e.g. myFolder/myFileFolder)")));
		completions.push(this.newSimpleCompletionItem('${activeFolderLong}', range, localize('activeFolderLong', "the full path of the folder the file is contained in (e.g. /Users/Development/myFolder/myFileFolder)")));
		completions.push(this.newSimpleCompletionItem('${rootName}', range, localize('rootName', "name of the workspace (e.g. myFolder or myWorkspace)")));
		completions.push(this.newSimpleCompletionItem('${rootPath}', range, localize('rootPath', "file path of the workspace (e.g. /Users/Development/myWorkspace)")));
		completions.push(this.newSimpleCompletionItem('${folderName}', range, localize('folderName', "name of the workspace folder the file is contained in (e.g. myFolder)")));
		completions.push(this.newSimpleCompletionItem('${folderPath}', range, localize('folderPath', "file path of the workspace folder the file is contained in (e.g. /Users/Development/myFolder)")));
		completions.push(this.newSimpleCompletionItem('${appName}', range, localize('appName', "e.g. VS Code")));
		completions.push(this.newSimpleCompletionItem('${remoteName}', range, localize('remoteName', "e.g. SSH")));
		completions.push(this.newSimpleCompletionItem('${dirty}', range, localize('dirty', "an indicator for when the active editor has unsaved changes")));
		completions.push(this.newSimpleCompletionItem('${separator}', range, localize('separator', "a conditional separator (' - ') that only shows when surrounded by variables with values")));

		return Promise.resolve(completions);
	}

	private provideFilesAssociationsCompletionItems(location: Location, range: vscode.Range): vscode.ProviderResult<vscode.CompletionItem[]> {
		const completions: vscode.CompletionItem[] = [];

		if (location.path.length === 2) {
			// Key
			if (!location.isAtPropertyKey || location.path[1] === '') {
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
			} else {
				// Value
				return this.provideLanguageCompletionItemsForLanguageOverrides(location, range);
			}
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

	private provideLanguageCompletionItems(_location: Location, range: vscode.Range, formatFunc: (string: string) => string = (l) => JSON.stringify(l)): Thenable<vscode.CompletionItem[]> {
		return vscode.languages.getLanguages()
			.then(languages => languages.map(l => this.newSimpleCompletionItem(formatFunc(l), range)));
	}

	private async provideLanguageCompletionItemsForLanguageOverrides(_location: Location, range: vscode.Range): Promise<vscode.CompletionItem[]> {
		const languages = await vscode.languages.getLanguages();
		const completionItems = [];
		for (const language of languages) {
			const item = new vscode.CompletionItem(JSON.stringify(language));
			item.kind = vscode.CompletionItemKind.Property;
			item.range = range;
			completionItems.push(item);
		}
		return completionItems;
	}

	private async provideLanguageOverridesCompletionItems(location: Location, position: vscode.Position): Promise<vscode.CompletionItem[]> {
		if (location.path.length === 1 && location.previousNode && typeof location.previousNode.value === 'string' && location.previousNode.value.startsWith('[')) {
			const startPosition = this.document.positionAt(location.previousNode.offset + 1);
			const endPosition = startPosition.translate(undefined, location.previousNode.value.length);
			const donotSuggestLanguages: string[] = [];
			const languageOverridesRanges: vscode.Range[] = [];
			let matches = OVERRIDE_IDENTIFIER_REGEX.exec(location.previousNode.value);
			let lastLanguageOverrideRange: vscode.Range | undefined;
			while (matches?.length) {
				lastLanguageOverrideRange = new vscode.Range(this.document.positionAt(location.previousNode.offset + 1 + matches.index), this.document.positionAt(location.previousNode.offset + 1 + matches.index + matches[0].length));
				languageOverridesRanges.push(lastLanguageOverrideRange);
				/* Suggest the configured language if the position is in the match range */
				if (!lastLanguageOverrideRange.contains(position)) {
					donotSuggestLanguages.push(matches[1].trim());
				}
				matches = OVERRIDE_IDENTIFIER_REGEX.exec(location.previousNode.value);
			}
			const lastLanguageOverrideEndPosition = lastLanguageOverrideRange ? lastLanguageOverrideRange.end : startPosition;
			if (lastLanguageOverrideEndPosition.isBefore(endPosition)) {
				languageOverridesRanges.push(new vscode.Range(lastLanguageOverrideEndPosition, endPosition));
			}
			const languageOverrideRange = languageOverridesRanges.find(range => range.contains(position));

			/**
			 *  Skip if suggestsions are for first language override range
			 *  Since VSCode registers language overrides to the schema, JSON language server does suggestions for first language override.
			 */
			if (languageOverrideRange && !languageOverrideRange.isEqual(languageOverridesRanges[0])) {
				const languages = await vscode.languages.getLanguages();
				const completionItems = [];
				for (const language of languages) {
					if (!donotSuggestLanguages.includes(language)) {
						const item = new vscode.CompletionItem(`[${language}]`);
						item.kind = vscode.CompletionItemKind.Property;
						item.range = languageOverrideRange;
						completionItems.push(item);
					}
				}
				return completionItems;
			}
		}
		return [];
	}

	private providePortsAttributesCompletionItem(range: vscode.Range): vscode.CompletionItem[] {
		return [this.newSnippetCompletionItem(
			{
				label: '\"3000\"',
				documentation: 'Single Port Attribute',
				range,
				snippet: '\n  \"${1:3000}\": {\n    \"label\": \"${2:Application}\",\n    \"onAutoForward\": \"${3:openPreview}\"\n  }\n'
			}),
		this.newSnippetCompletionItem(
			{
				label: '\"5000-6000\"',
				documentation: 'Ranged Port Attribute',
				range,
				snippet: '\n  \"${1:40000-55000}\": {\n    \"onAutoForward\": \"${2:ignore}\"\n  }\n'
			}),
		this.newSnippetCompletionItem(
			{
				label: '\".+\\\\/server.js\"',
				documentation: 'Command Match Port Attribute',
				range,
				snippet: '\n  \"${1:.+\\\\/server.js\}\": {\n    \"label\": \"${2:Application}\",\n    \"onAutoForward\": \"${3:openPreview}\"\n  }\n'
			})
		];
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
