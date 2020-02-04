/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import 'vs/css!./media/searchEditor';
import { coalesce, flatten } from 'vs/base/common/arrays';
import { repeat } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { Range } from 'vs/editor/common/core/range';
import { FileMatch, Match, searchMatchComparer, SearchResult } from 'vs/workbench/contrib/search/common/searchModel';
import { ITextQuery } from 'vs/workbench/services/search/common/search';
import { localize } from 'vs/nls';
import type { ITextModel } from 'vs/editor/common/model';
import type { SearchConfiguration } from 'vs/workbench/contrib/search/browser/searchEditorInput';

// Using \r\n on Windows inserts an extra newline between results.
const lineDelimiter = '\n';

const translateRangeLines =
	(n: number) =>
		(range: Range) =>
			new Range(range.startLineNumber + n, range.startColumn, range.endLineNumber + n, range.endColumn);

const matchToSearchResultFormat = (match: Match): { line: string, ranges: Range[], lineNumber: string }[] => {
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

			const line = (prefix + sourceLine).replace(/\r?\n?$/, '');

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
};

type SearchResultSerialization = { text: string[], matchRanges: Range[] };

function fileMatchToSearchResultFormat(fileMatch: FileMatch, labelFormatter: (x: URI) => string): SearchResultSerialization {
	const serializedMatches = flatten(fileMatch.matches()
		.sort(searchMatchComparer)
		.map(match => matchToSearchResultFormat(match)));

	const uriString = labelFormatter(fileMatch.resource);
	let text: string[] = [`${uriString}:`];
	let matchRanges: Range[] = [];

	const targetLineNumberToOffset: Record<string, number> = {};

	const context: { line: string, lineNumber: number }[] = [];
	fileMatch.context.forEach((line, lineNumber) => context.push({ line, lineNumber }));
	context.sort((a, b) => a.lineNumber - b.lineNumber);

	let lastLine: number | undefined = undefined;

	const seenLines = new Set<string>();
	serializedMatches.forEach(match => {
		if (!seenLines.has(match.line)) {
			while (context.length && context[0].lineNumber < +match.lineNumber) {
				const { line, lineNumber } = context.shift()!;
				if (lastLine !== undefined && lineNumber !== lastLine + 1) {
					text.push('');
				}
				text.push(`  ${lineNumber}  ${line}`);
				lastLine = lineNumber;
			}

			targetLineNumberToOffset[match.lineNumber] = text.length;
			seenLines.add(match.line);
			text.push(match.line);
			lastLine = +match.lineNumber;
		}

		matchRanges.push(...match.ranges.map(translateRangeLines(targetLineNumberToOffset[match.lineNumber])));
	});

	while (context.length) {
		const { line, lineNumber } = context.shift()!;
		text.push(`  ${lineNumber}  ${line}`);
	}

	return { text, matchRanges };
}

const contentPatternToSearchResultHeader = (pattern: ITextQuery | null, includes: string, excludes: string, contextLines: number): string[] => {
	return serializeSearchConfiguration({
		query: pattern?.contentPattern.pattern,
		regexp: pattern?.contentPattern.isRegExp,
		caseSensitive: pattern?.contentPattern.isCaseSensitive,
		wholeWord: pattern?.contentPattern.isWordMatch,
		excludes, includes,
		showIncludesExcludes: !!(includes || excludes || pattern?.userDisabledExcludesAndIgnoreFiles),
		useIgnores: pattern?.userDisabledExcludesAndIgnoreFiles === undefined ? undefined : !pattern.userDisabledExcludesAndIgnoreFiles,
		contextLines,
	}).split(lineDelimiter);
};

export const serializeSearchConfiguration = (config: Partial<SearchConfiguration>): string => {
	const removeNullFalseAndUndefined = <T>(a: (T | null | false | undefined)[]) => a.filter(a => a !== false && a !== null && a !== undefined) as T[];

	const escapeNewlines = (str: string) => str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');

	return removeNullFalseAndUndefined([
		`# Query: ${escapeNewlines(config.query ?? '')}`,

		(config.caseSensitive || config.wholeWord || config.regexp || config.useIgnores === false)
		&& `# Flags: ${coalesce([
			config.caseSensitive && 'CaseSensitive',
			config.wholeWord && 'WordMatch',
			config.regexp && 'RegExp',
			(config.useIgnores === false) && 'IgnoreExcludeSettings'
		]).join(' ')}`,
		config.includes ? `# Including: ${config.includes}` : undefined,
		config.excludes ? `# Excluding: ${config.excludes}` : undefined,
		config.contextLines ? `# ContextLines: ${config.contextLines}` : undefined,
		''
	]).join(lineDelimiter);
};


export const extractSearchQuery = (model: ITextModel | string): SearchConfiguration => {
	const header = (typeof model === 'string')
		? model
		: model.getValueInRange(new Range(1, 1, 6, 1)).split(lineDelimiter);

	const query: SearchConfiguration = {
		query: '',
		includes: '',
		excludes: '',
		regexp: false,
		caseSensitive: false,
		useIgnores: true,
		wholeWord: false,
		contextLines: 0,
		showIncludesExcludes: false,
	};

	const unescapeNewlines = (str: string) => {
		let out = '';
		for (let i = 0; i < str.length; i++) {
			if (str[i] === '\\') {
				i++;
				const escaped = str[i];

				if (escaped === 'n') {
					out += '\n';
				}
				else if (escaped === '\\') {
					out += '\\';
				}
				else {
					throw Error(localize('invalidQueryStringError', "All backslashes in Query string must be escaped (\\\\)"));
				}
			} else {
				out += str[i];
			}
		}
		return out;
	};

	const parseYML = /^# ([^:]*): (.*)$/;
	for (const line of header) {
		const parsed = parseYML.exec(line);
		if (!parsed) { continue; }
		const [, key, value] = parsed;
		switch (key) {
			case 'Query': query.query = unescapeNewlines(value); break;
			case 'Including': query.includes = value; break;
			case 'Excluding': query.excludes = value; break;
			case 'ContextLines': query.contextLines = +value; break;
			case 'Flags': {
				query.regexp = value.indexOf('RegExp') !== -1;
				query.caseSensitive = value.indexOf('CaseSensitive') !== -1;
				query.useIgnores = value.indexOf('IgnoreExcludeSettings') === -1;
				query.wholeWord = value.indexOf('WordMatch') !== -1;
			}
		}
	}

	query.showIncludesExcludes = !!(query.includes || query.excludes || !query.useIgnores);

	return query;
};

export const serializeSearchResultForEditor =
	(searchResult: SearchResult, rawIncludePattern: string, rawExcludePattern: string, contextLines: number, labelFormatter: (x: URI) => string, includeHeader: boolean): { matchRanges: Range[], text: string } => {
		const header = includeHeader
			? contentPatternToSearchResultHeader(searchResult.query, rawIncludePattern, rawExcludePattern, contextLines)
			: [];

		const allResults =
			flattenSearchResultSerializations(
				flatten(
					searchResult.folderMatches().sort(searchMatchComparer)
						.map(folderMatch => folderMatch.matches().sort(searchMatchComparer)
							.map(fileMatch => fileMatchToSearchResultFormat(fileMatch, labelFormatter)))));

		return {
			matchRanges: allResults.matchRanges.map(translateRangeLines(header.length)),
			text: header
				.concat(allResults.text.length ? allResults.text : ['No Results'])
				.join(lineDelimiter)
		};
	};

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
