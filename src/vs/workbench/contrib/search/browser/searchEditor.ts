/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Match, searchMatchComparer, FolderMatchWithResource, FolderMatch, FileMatch, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { repeat } from 'vs/base/common/strings';
import { ILabelService } from 'vs/platform/label/common/label';
import { coalesce } from 'vs/base/common/arrays';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { URI } from 'vs/base/common/uri';
import { isWindows } from 'vs/base/common/platform';
import { ITextQuery, ISearchConfigurationProperties } from 'vs/workbench/services/search/common/search';
import * as network from 'vs/base/common/network';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

const lineDelimiter = isWindows ? '\r\n' : '\n';

function matchToSearchResultFormat(match: Match, indent = 0): string {
	const getLinePrefix = (i: number) => `${match.range().startLineNumber + i}`;

	const fullMatchLines = match.fullPreviewLines();
	const largestPrefixSize = fullMatchLines.reduce((largest, _, i) => Math.max(getLinePrefix(i).length, largest), 0);

	const formattedLines = fullMatchLines
		.map((line, i) => {
			const prefix = getLinePrefix(i);
			const paddingStr = repeat(' ', largestPrefixSize - prefix.length);
			const indentStr = repeat(' ', indent);
			return `${indentStr}${prefix}: ${paddingStr}${line}`;
		});

	return formattedLines.join(lineDelimiter);
}

function fileMatchToSearchResultFormat(fileMatch: FileMatch, labelFormatter: (x: URI) => string): string {
	const matchTextRows = fileMatch.matches()
		.sort(searchMatchComparer)
		.map(match => matchToSearchResultFormat(match, 2));

	const matches = new Set<string>();
	const deduped = matchTextRows.filter(str => {
		const existing = matches.has(str);
		matches.add(str);
		return !existing;
	});

	const uriString = labelFormatter(fileMatch.resource);
	return `${uriString}:${lineDelimiter}${deduped.join(lineDelimiter)}`;
}

const folderMatchToSearchResultFormat = (folderMatch: FolderMatchWithResource | FolderMatch, labelFormatter: (x: URI) => string) =>
	folderMatch
		.matches()
		.sort(searchMatchComparer)
		.map(match => fileMatchToSearchResultFormat(match, labelFormatter))
		.join(lineDelimiter + lineDelimiter);

const allFolderMatchesToSearchResultFormat = (folderMatches: Array<FolderMatchWithResource | FolderMatch>, labelFormatter: (x: URI) => string) =>
	folderMatches
		.sort(searchMatchComparer)
		.map(match => folderMatchToSearchResultFormat(match, labelFormatter))
		.filter(x => x.length)
		.join(lineDelimiter + lineDelimiter);

function contentPatternToSearchResultHeader(pattern: ITextQuery | null, includes: string, excludes: string) {
	if (!pattern) { return ''; }

	const escapeNewlines = (str: string) => str.replace(/\\n/g, '\\\\n').replace(/\n/g, '\\n');
	return coalesce([
		`# Query: ${escapeNewlines(pattern.contentPattern.pattern)}`,
		...coalesce([
			(pattern.contentPattern.isCaseSensitive || pattern.contentPattern.isWordMatch || pattern.contentPattern.isRegExp) && `# Flags: ${coalesce([
				pattern.contentPattern.isCaseSensitive && 'CaseSensitive',
				pattern.contentPattern.isWordMatch && 'WordMatch',
				pattern.contentPattern.isRegExp && 'RegExp'
			]).join(' ')}`,
			includes && `# Including: ${includes}`,
			excludes && `# Excluding: ${excludes}`
		])
	]).join(lineDelimiter);
}

const serializeSearchResultForEditor = (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, labelFormatter: (x: URI) => string) => {
	const header = contentPatternToSearchResultHeader(searchResult.query, rawIncludePattern, rawExcludePattern);
	const results = allFolderMatchesToSearchResultFormat(searchResult.folderMatches(), labelFormatter);
	return `${header}${lineDelimiter}${lineDelimiter}${results}`;
};

export const createEditorFromSearchResult =
	async (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, labelService: ILabelService, editorService: IEditorService, configurationService: IConfigurationService) => {
		const searchTerm = JSON.stringify(searchResult.query?.contentPattern.pattern).replace(/^"|"$/g, '');

		const forceAbsolute = configurationService.getValue<ISearchConfigurationProperties>('search').searchEditorPreviewForceAbsolutePaths;

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: !forceAbsolute, noPrefix: forceAbsolute });

		let id = 0;
		let possible = {
			contents: serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, labelFormatter),
			mode: 'search-result',
			resource: URI.from({ scheme: network.Schemas.untitled, path: searchTerm, query: JSON.stringify({ skipPromptOnDiscardChanges: true }) })
		};
		while (editorService.getOpened(possible)) {
			possible.resource = possible.resource.with({ path: searchTerm + '-' + ++id });
		}

		const editor = await editorService.openEditor(possible);
		editor?.getControl()?.updateOptions({ lineNumbers: 'off' });
	};
