/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as pathUtils from 'path';

const FILE_LINE_REGEX = /^(\S.*):$/;
const RESULT_LINE_REGEX = /^(\s+)(\d+)(:| )(\s+)(.*)$/;
const SEARCH_RESULT_SELECTOR = { language: 'search-result' };
const DIRECTIVES = ['# Query:', '# Flags:', '# Including:', '# Excluding:', '# ContextLines:'];
const FLAGS = ['RegExp', 'CaseSensitive', 'IgnoreExcludeSettings', 'WordMatch'];

let cachedLastParse: { version: number, parse: ParsedSearchResults } | undefined;

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(
		vscode.commands.registerCommand('searchResult.rerunSearch', () => vscode.commands.executeCommand('search.action.rerunEditorSearch')),
		vscode.commands.registerCommand('searchResult.rerunSearchWithContext', () => vscode.commands.executeCommand('search.action.rerunEditorSearchWithContext')),

		vscode.languages.registerDocumentSymbolProvider(SEARCH_RESULT_SELECTOR, {
			provideDocumentSymbols(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.DocumentSymbol[] {
				const results = parseSearchResults(document, token)
					.filter(isFileLine)
					.map(line => new vscode.DocumentSymbol(
						line.path,
						'',
						vscode.SymbolKind.File,
						line.allLocations.map(({ originSelectionRange }) => originSelectionRange!).reduce((p, c) => p.union(c), line.location.originSelectionRange!),
						line.location.originSelectionRange!,
					));

				return results;
			}
		}),

		vscode.languages.registerCompletionItemProvider(SEARCH_RESULT_SELECTOR, {
			provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {

				const line = document.lineAt(position.line);
				if (position.line > 3) { return []; }
				if (position.character === 0 || (position.character === 1 && line.text === '#')) {
					const header = Array.from({ length: DIRECTIVES.length }).map((_, i) => document.lineAt(i).text);

					return DIRECTIVES
						.filter(suggestion => header.every(line => line.indexOf(suggestion) === -1))
						.map(flag => ({ label: flag, insertText: (flag.slice(position.character)) + ' ' }));
				}

				if (line.text.indexOf('# Flags:') === -1) { return []; }

				return FLAGS
					.filter(flag => line.text.indexOf(flag) === -1)
					.map(flag => ({ label: flag, insertText: flag + ' ' }));
			}
		}, '#'),

		vscode.languages.registerDefinitionProvider(SEARCH_RESULT_SELECTOR, {
			provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.DefinitionLink[] {
				const lineResult = parseSearchResults(document, token)[position.line];
				if (!lineResult) { return []; }
				if (lineResult.type === 'file') {
					// TODO: The multi-match peek UX isnt very smooth.
					// return lineResult.allLocations.length > 1 ? lineResult.allLocations : [lineResult.location];
					return [];
				}

				const translateRangeSidewaysBy = (r: vscode.Range, n: number) =>
					r.with({ start: new vscode.Position(r.start.line, Math.max(0, n - r.start.character)), end: new vscode.Position(r.end.line, Math.max(0, n - r.end.character)) });

				return [{
					...lineResult.location,
					targetSelectionRange: translateRangeSidewaysBy(lineResult.location.targetSelectionRange!, position.character - 1)
				}];
			}
		}),

		vscode.languages.registerDocumentLinkProvider(SEARCH_RESULT_SELECTOR, {
			async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentLink[]> {
				return parseSearchResults(document, token)
					.filter(({ type }) => type === 'file')
					.map(({ location }) => ({ range: location.originSelectionRange!, target: location.targetUri }));
			}
		}),

		vscode.window.onDidChangeActiveTextEditor(e => {
			if (e?.document.languageId === 'search-result') {
				// Clear the parse whenever we open a new editor.
				// Conservative because things like the URI might remain constant even if the contents change, and re-parsing even large files is relatively fast.
				cachedLastParse = undefined;
			}
		}),

		{ dispose() { cachedLastParse = undefined; } }
	);
}


function relativePathToUri(path: string, resultsUri: vscode.Uri): vscode.Uri | undefined {
	if (pathUtils.isAbsolute(path)) { return vscode.Uri.file(path); }
	if (path.indexOf('~/') === 0) {
		return vscode.Uri.file(pathUtils.join(process.env.HOME!, path.slice(2)));
	}


	if (vscode.workspace.workspaceFolders) {
		const multiRootFormattedPath = /^(.*) • (.*)$/.exec(path);
		if (multiRootFormattedPath) {
			const [, workspaceName, workspacePath] = multiRootFormattedPath;
			const folder = vscode.workspace.workspaceFolders.filter(wf => wf.name === workspaceName)[0];
			if (folder) {
				return vscode.Uri.file(pathUtils.join(folder.uri.fsPath, workspacePath));
			}
		}

		else if (vscode.workspace.workspaceFolders.length === 1) {
			return vscode.Uri.file(pathUtils.join(vscode.workspace.workspaceFolders[0].uri.fsPath, path));
		} else if (resultsUri.scheme !== 'untitled') {
			// We're in a multi-root workspace, but the path is not multi-root formatted
			// Possibly a saved search from a single root session. Try checking if the search result document's URI is in a current workspace folder.
			const prefixMatch = vscode.workspace.workspaceFolders.filter(wf => resultsUri.toString().startsWith(wf.uri.toString()))[0];
			if (prefixMatch) { return vscode.Uri.file(pathUtils.join(prefixMatch.uri.fsPath, path)); }
		}
	}

	console.error(`Unable to resolve path ${path}`);
	return undefined;
}

type ParsedSearchFileLine = { type: 'file', location: vscode.LocationLink, allLocations: vscode.LocationLink[], path: string };
type ParsedSearchResultLine = { type: 'result', location: vscode.LocationLink };
type ParsedSearchResults = Array<ParsedSearchFileLine | ParsedSearchResultLine>;
const isFileLine = (line: ParsedSearchResultLine | ParsedSearchFileLine): line is ParsedSearchFileLine => line.type === 'file';


function parseSearchResults(document: vscode.TextDocument, token: vscode.CancellationToken): ParsedSearchResults {

	if (cachedLastParse && cachedLastParse.version === document.version) {
		return cachedLastParse.parse;
	}

	const lines = document.getText().split(/\r?\n/);
	const links: ParsedSearchResults = [];

	let currentTarget: vscode.Uri | undefined = undefined;
	let currentTargetLocations: vscode.LocationLink[] | undefined = undefined;

	for (let i = 0; i < lines.length; i++) {
		if (token.isCancellationRequested) { return []; }
		const line = lines[i];

		const fileLine = FILE_LINE_REGEX.exec(line);
		if (fileLine) {
			const [, path] = fileLine;

			currentTarget = relativePathToUri(path, document.uri);
			if (!currentTarget) { continue; }
			currentTargetLocations = [];

			const location: vscode.LocationLink = {
				targetRange: new vscode.Range(0, 0, 0, 1),
				targetUri: currentTarget,
				originSelectionRange: new vscode.Range(i, 0, i, line.length),
			};


			links[i] = { type: 'file', location, allLocations: currentTargetLocations, path };
		}

		if (!currentTarget) { continue; }

		const resultLine = RESULT_LINE_REGEX.exec(line);
		if (resultLine) {
			const [, indentation, _lineNumber, seperator, resultIndentation] = resultLine;
			const lineNumber = +_lineNumber - 1;
			const resultStart = (indentation + _lineNumber + seperator + resultIndentation).length;
			const metadataOffset = (indentation + _lineNumber + seperator).length;

			const location: vscode.LocationLink = {
				targetRange: new vscode.Range(Math.max(lineNumber - 3, 0), 0, lineNumber + 3, line.length),
				targetSelectionRange: new vscode.Range(lineNumber, metadataOffset, lineNumber, metadataOffset),
				targetUri: currentTarget,
				originSelectionRange: new vscode.Range(i, resultStart, i, line.length),
			};

			currentTargetLocations?.push(location);

			links[i] = { type: 'result', location };
		}
	}

	cachedLastParse = {
		version: document.version,
		parse: links
	};

	return links;
}
