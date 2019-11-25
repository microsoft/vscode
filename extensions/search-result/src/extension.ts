/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as pathUtils from 'path';

const FILE_LINE_REGEX = /^(\S.*):$/;
const RESULT_LINE_REGEX = /^(\s+)(\d+):(\s+)(.*)$/;
const LANGUAGE_SELECTOR = { language: 'search-result' };

let cachedLastParse: { version: number, parse: ParsedSearchResults } | undefined;

export function activate() {

	vscode.commands.registerCommand('searchResult.rerunSearch', () => vscode.commands.executeCommand('search.action.rerunEditorSearch'));

	vscode.languages.registerCompletionItemProvider(LANGUAGE_SELECTOR, {
		provideCompletionItems(document: vscode.TextDocument, position: vscode.Position): vscode.CompletionItem[] {
			const line = document.lineAt(position.line);
			if (line.text.indexOf('# Flags:') === -1) { return []; }

			return ['RegExp', 'CaseSensitive', 'IgnoreExcludeSettings', 'WordMatch']
				.filter(flag => line.text.indexOf(flag) === -1)
				.map(flag => ({ label: flag, insertText: flag + ' ' }));
		}
	});

	vscode.languages.registerDefinitionProvider(LANGUAGE_SELECTOR, {
		provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.DefinitionLink[] {
			const lineResult = parseSearchResults(document, token)[position.line];
			if (!lineResult) { return []; }
			if (lineResult.type === 'file') {
				// TODO: The multi-match peek UX isnt very smooth.
				// return lineResult.allLocations.length > 1 ? lineResult.allLocations : [lineResult.location];
				return [];
			}

			return [lineResult.location];
		}
	});

	vscode.languages.registerDocumentLinkProvider(LANGUAGE_SELECTOR, {
		async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentLink[]> {
			return parseSearchResults(document, token)
				.filter(({ type }) => type === 'file')
				.map(({ location }) => ({ range: location.originSelectionRange!, target: location.targetUri }));
		}
	});

	vscode.window.onDidChangeActiveTextEditor(e => {
		if (e?.document.languageId === 'search-result') {
			// Clear the parse whenever we open a new editor.
			// Conservative because things like the URI might remain constant even if the contents change, and re-parsing even large files is relatively fast.
			cachedLastParse = undefined;
		}
	});
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

type ParsedSearchResults = Array<
	{ type: 'file', location: vscode.LocationLink, allLocations: vscode.LocationLink[] } |
	{ type: 'result', location: vscode.LocationLink }
>;

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


			links[i] = { type: 'file', location, allLocations: currentTargetLocations };
		}

		if (!currentTarget) { continue; }

		const resultLine = RESULT_LINE_REGEX.exec(line);
		if (resultLine) {
			const [, indentation, _lineNumber, resultIndentation] = resultLine;
			const lineNumber = +_lineNumber - 1;
			const resultStart = (indentation + _lineNumber + ':' + resultIndentation).length;

			const location: vscode.LocationLink = {
				targetRange: new vscode.Range(Math.max(lineNumber - 3, 0), 0, lineNumber + 3, line.length),
				targetSelectionRange: new vscode.Range(lineNumber, 0, lineNumber, line.length),
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
