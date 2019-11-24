/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Match, searchMatchComparer, FileMatch, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { repeat } from 'vs/base/common/strings';
import { ILabelService } from 'vs/platform/label/common/label';
import { coalesce, flatten } from 'vs/base/common/arrays';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { URI } from 'vs/base/common/uri';
import { ITextQuery } from 'vs/workbench/services/search/common/search';
import * as network from 'vs/base/common/network';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel, TrackedRangeStickiness } from 'vs/editor/common/model';

// Using \r\n on Windows inserts an extra newline between results.
const lineDelimiter = '\n';

const translateRangeLines = (n: number) => (range: Range) => new Range(range.startLineNumber + n, range.startColumn, range.endLineNumber + n, range.endColumn);

type SearchResultSerialization = { text: string[], matchRanges: Range[] };

function matchToSearchResultFormat(match: Match): { line: string, ranges: Range[], lineNumber: string }[] {
	const getLinePrefix = (i: number) => `${match.range().startLineNumber + i}`;

	const fullMatchLines = match.fullPreviewLines();
	const largestPrefixSize = fullMatchLines.reduce((largest, _, i) => Math.max(getLinePrefix(i).length, largest), 0);


	const results: { line: string, ranges: Range[], lineNumber: string }[] = [];

	fullMatchLines
		.forEach((sourceLine, i) => {
			const lineNumber = getLinePrefix(i);
			const paddingStr = repeat(' ', largestPrefixSize - lineNumber.length);
			const prefix = `  ${lineNumber}: ${paddingStr}`;
			const prefixOffset = prefix.length;

			const line = (prefix + sourceLine);

			const rangeOnThisLine = ({ start, end }: { start?: number; end?: number; }) => new Range(1, (start ?? 1) + prefixOffset, 1, (end ?? sourceLine.length + 1) + prefixOffset);

			const matchRange = match.range();
			const matchIsSingleLine = matchRange.startLineNumber === matchRange.endLineNumber;

			let lineRange;
			if (matchIsSingleLine) { lineRange = (rangeOnThisLine({ start: matchRange.startColumn, end: matchRange.endColumn })); }
			else if (i === 0) { lineRange = (rangeOnThisLine({ start: matchRange.startColumn })); }
			else if (i === fullMatchLines.length - 1) { lineRange = (rangeOnThisLine({ end: matchRange.endColumn })); }
			else { lineRange = (rangeOnThisLine({})); }

			results.push({ lineNumber: lineNumber, line, ranges: [lineRange] });
		});

	return results;
}

function fileMatchToSearchResultFormat(fileMatch: FileMatch, labelFormatter: (x: URI) => string): SearchResultSerialization {
	const serializedMatches = flatten(fileMatch.matches()
		.sort(searchMatchComparer)
		.map(match => matchToSearchResultFormat(match)));

	const uriString = labelFormatter(fileMatch.resource);
	let text: string[] = [`${uriString}:`];
	let matchRanges: Range[] = [];

	const targetLineNumberToOffset: Record<string, number> = {};

	const seenLines = new Set<string>();
	serializedMatches.forEach(match => {
		if (!seenLines.has(match.line)) {
			targetLineNumberToOffset[match.lineNumber] = text.length;
			seenLines.add(match.line);
			text.push(match.line);
		}

		matchRanges.push(...match.ranges.map(translateRangeLines(targetLineNumberToOffset[match.lineNumber])));
	});


	return { text, matchRanges };
}

const flattenSearchResultSerializations = (serializations: SearchResultSerialization[]): SearchResultSerialization => {
	let text: string[] = [];
	let matchRanges: Range[] = [];

	serializations.forEach(serialized => {
		serialized.matchRanges.map(translateRangeLines(text.length)).forEach(range => matchRanges.push(range));
		serialized.text.forEach(line => text.push(line));
		text.push(''); // new line
	});

	return { text, matchRanges };
};

function contentPatternToSearchResultHeader(pattern: ITextQuery | null, includes: string, excludes: string): string[] {
	if (!pattern) { return []; }

	const removeNullFalseAndUndefined = <T>(a: (T | null | false | undefined)[]) => a.filter(a => a !== false && a !== null && a !== undefined) as T[];

	const escapeNewlines = (str: string) => str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

	return removeNullFalseAndUndefined([
		`# Query: ${escapeNewlines(pattern.contentPattern.pattern)}`,

		(pattern.contentPattern.isCaseSensitive || pattern.contentPattern.isWordMatch || pattern.contentPattern.isRegExp)
		&& `# Flags: ${coalesce([
			pattern.contentPattern.isCaseSensitive && 'CaseSensitive',
			pattern.contentPattern.isWordMatch && 'WordMatch',
			pattern.contentPattern.isRegExp && 'RegExp'
		]).join(' ')}`,
		includes ? `# Including: ${includes}` : undefined,
		excludes ? `# Excluding: ${excludes}` : undefined,
		''
	]);
}

const serializeSearchResultForEditor = (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, labelFormatter: (x: URI) => string): SearchResultSerialization => {
	const header = contentPatternToSearchResultHeader(searchResult.query, rawIncludePattern, rawExcludePattern);
	const allResults =
		flattenSearchResultSerializations(
			flatten(searchResult.folderMatches()
				.map(folderMatch => folderMatch.matches()
					.map(fileMatch => fileMatchToSearchResultFormat(fileMatch, labelFormatter)))));

	return { matchRanges: allResults.matchRanges.map(translateRangeLines(header.length)), text: header.concat(allResults.text) };
};

export const createEditorFromSearchResult =
	async (searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, labelService: ILabelService, editorService: IEditorService) => {
		const searchTerm = searchResult.query?.contentPattern.pattern.replace(/[^\w-_.]/g, '') || 'Search';

		const labelFormatter = (uri: URI): string => labelService.getUriLabel(uri, { relative: true });

		const results = serializeSearchResultForEditor(searchResult, rawIncludePattern, rawExcludePattern, labelFormatter);

		let possible = {
			contents: results.text.join(lineDelimiter),
			mode: 'search-result',
			resource: URI.from({ scheme: network.Schemas.untitled, path: searchTerm })
		};

		let id = 0;
		while (editorService.getOpened(possible)) {
			possible.resource = possible.resource.with({ path: searchTerm + '-' + ++id });
		}

		const editor = await editorService.openEditor(possible);
		const control = editor?.getControl()!;
		control.updateOptions({ lineNumbers: 'off' });

		const model = control.getModel() as ITextModel;

		model.deltaDecorations([], results.matchRanges.map(range => ({ range, options: { className: 'findMatch', stickiness: TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } })));

	};
