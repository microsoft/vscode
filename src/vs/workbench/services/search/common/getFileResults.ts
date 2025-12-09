/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ITextSearchMatch, ITextSearchPreviewOptions, ITextSearchResult } from './search.js';
import { Range } from '../../../../editor/common/core/range.js';

export const getFileResults = (
	bytes: Uint8Array,
	pattern: RegExp,
	options: {
		surroundingContext: number;
		previewOptions: ITextSearchPreviewOptions | undefined;
		remainingResultQuota: number;
	}
): ITextSearchResult[] => {

	let text: string;
	if (bytes[0] === 0xff && bytes[1] === 0xfe) {
		text = new TextDecoder('utf-16le').decode(bytes);
	} else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
		text = new TextDecoder('utf-16be').decode(bytes);
	} else {
		text = new TextDecoder('utf8').decode(bytes);
		if (text.slice(0, 1000).includes('\uFFFD') && bytes.includes(0)) {
			return [];
		}
	}

	const results: ITextSearchResult[] = [];

	const patternIndices: { matchStartIndex: number; matchedText: string }[] = [];

	let patternMatch: RegExpExecArray | null = null;
	let remainingResultQuota = options.remainingResultQuota;
	while (remainingResultQuota >= 0 && (patternMatch = pattern.exec(text))) {
		patternIndices.push({ matchStartIndex: patternMatch.index, matchedText: patternMatch[0] });
		remainingResultQuota--;
	}

	if (patternIndices.length) {
		const contextLinesNeeded = new Set<number>();
		const resultLines = new Set<number>();

		const lineRanges: { start: number; end: number }[] = [];
		const readLine = (lineNumber: number) => text.slice(lineRanges[lineNumber].start, lineRanges[lineNumber].end);

		let prevLineEnd = 0;
		let lineEndingMatch: RegExpExecArray | null = null;
		const lineEndRegex = /\r?\n/g;
		while ((lineEndingMatch = lineEndRegex.exec(text))) {
			lineRanges.push({ start: prevLineEnd, end: lineEndingMatch.index });
			prevLineEnd = lineEndingMatch.index + lineEndingMatch[0].length;
		}
		if (prevLineEnd < text.length) { lineRanges.push({ start: prevLineEnd, end: text.length }); }

		let startLine = 0;
		for (const { matchStartIndex, matchedText } of patternIndices) {
			if (remainingResultQuota < 0) {
				break;
			}

			while (Boolean(lineRanges[startLine + 1]) && matchStartIndex > lineRanges[startLine].end) {
				startLine++;
			}
			let endLine = startLine;
			while (Boolean(lineRanges[endLine + 1]) && matchStartIndex + matchedText.length > lineRanges[endLine].end) {
				endLine++;
			}

			if (options.surroundingContext) {
				for (let contextLine = Math.max(0, startLine - options.surroundingContext); contextLine < startLine; contextLine++) {
					contextLinesNeeded.add(contextLine);
				}
			}

			let previewText = '';
			let offset = 0;
			let prefixLenForFirstLine = 0;
			for (let matchLine = startLine; matchLine <= endLine; matchLine++) {
				let previewLine = readLine(matchLine);
				if (options.previewOptions?.charsPerLine && previewLine.length > options.previewOptions.charsPerLine) {
					const charsPerLine = options.previewOptions.charsPerLine;
					const leadingChars = Math.floor(charsPerLine / 5);
					const truncationMode = options.previewOptions.truncationMode ?? 'start';
					if (matchLine === startLine) {
						// compute match column within the start line
						const matchColumnInLine = matchStartIndex - lineRanges[startLine].start;
						offset = Math.max(matchColumnInLine - leadingChars, 0);
						let prefix = '';
						if ((truncationMode === 'start' || truncationMode === 'both')) {
							const leftOmitted = offset;
							const SEARCH_ELIDED_PREFIX = '⟪ ';
							const SEARCH_ELIDED_SUFFIX = ' characters skipped ⟫';
							const SEARCH_ELIDED_MIN_LEN = (SEARCH_ELIDED_PREFIX.length + SEARCH_ELIDED_SUFFIX.length + 5) * 2;
							if (leftOmitted > leadingChars + SEARCH_ELIDED_MIN_LEN) {
								prefix = SEARCH_ELIDED_PREFIX + leftOmitted + SEARCH_ELIDED_SUFFIX;
							}
						}

						let lineSegment = previewLine.substr(offset, charsPerLine);
						let suffix = '';
						if (truncationMode === 'end' || truncationMode === 'both') {
							const rightOmitted = Math.max(previewLine.length - (offset + charsPerLine), 0);
							const SEARCH_ELIDED_PREFIX = '⟪ ';
							const SEARCH_ELIDED_SUFFIX = ' characters skipped ⟫';
							const SEARCH_ELIDED_MIN_LEN = (SEARCH_ELIDED_PREFIX.length + SEARCH_ELIDED_SUFFIX.length + 5) * 2;
							if (rightOmitted > leadingChars + SEARCH_ELIDED_MIN_LEN) {
								suffix = SEARCH_ELIDED_PREFIX + rightOmitted + SEARCH_ELIDED_SUFFIX;
							}
						}

						prefixLenForFirstLine = prefix.length;
						previewLine = `${prefix}${lineSegment}${suffix}`;
					} else {
						// subsequent lines: simple window from start
						previewLine = previewLine.substr(0, charsPerLine);
					}
				}
				previewText += `${previewLine}\n`;
				resultLines.add(matchLine);
			}

			const fileRange = new Range(
				startLine,
				matchStartIndex - lineRanges[startLine].start,
				endLine,
				matchStartIndex + matchedText.length - lineRanges[endLine].start
			);
			const previewRange = new Range(
				0,
				matchStartIndex - lineRanges[startLine].start - offset + prefixLenForFirstLine,
				endLine - startLine,
				matchStartIndex + matchedText.length - lineRanges[endLine].start - (endLine === startLine ? offset : 0) + (endLine === startLine ? prefixLenForFirstLine : 0)
			);

			const match: ITextSearchMatch = {
				rangeLocations: [{
					source: fileRange,
					preview: previewRange,
				}],
				previewText: previewText
			};

			results.push(match);

			if (options.surroundingContext) {
				for (let contextLine = endLine + 1; contextLine <= Math.min(endLine + options.surroundingContext, lineRanges.length - 1); contextLine++) {
					contextLinesNeeded.add(contextLine);
				}
			}
		}
		for (const contextLine of contextLinesNeeded) {
			if (!resultLines.has(contextLine)) {

				results.push({
					text: readLine(contextLine),
					lineNumber: contextLine + 1,
				});
			}
		}
	}
	return results;
};
