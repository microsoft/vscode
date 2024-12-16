/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange } from '../core/range.js';
import { FoldingRules } from '../languages/languageConfiguration.js';

export interface ISectionHeaderFinderTarget {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
}

export interface FindSectionHeaderOptions {
	foldingRules?: FoldingRules;
	findRegionSectionHeaders: boolean;
	findMarkSectionHeaders: boolean;
}

export interface SectionHeader {
	/**
	 * The location of the header text in the text model.
	 */
	range: IRange;
	/**
	 * The section header text.
	 */
	text: string;
	/**
	 * Whether the section header includes a separator line.
	 */
	hasSeparatorLine: boolean;
	/**
	 * This section should be omitted before rendering if it's not in a comment.
	 */
	shouldBeInComments: boolean;
}

const markRegex = new RegExp('\\bMARK:\\s*(.*)$', 'd');
const trimDashesRegex = /^-+|-+$/g;

/**
 * Find section headers in the model.
 *
 * @param model the text model to search in
 * @param options options to search with
 * @returns an array of section headers
 */
export function findSectionHeaders(model: ISectionHeaderFinderTarget, options: FindSectionHeaderOptions): SectionHeader[] {
	let headers: SectionHeader[] = [];
	if (options.findRegionSectionHeaders && options.foldingRules?.markers) {
		const regionHeaders = collectRegionHeaders(model, options);
		headers = headers.concat(regionHeaders);
	}
	if (options.findMarkSectionHeaders) {
		const markHeaders = collectMarkHeaders(model);
		headers = headers.concat(markHeaders);
	}
	return headers;
}

function collectRegionHeaders(model: ISectionHeaderFinderTarget, options: FindSectionHeaderOptions): SectionHeader[] {
	const regionHeaders: SectionHeader[] = [];
	const endLineNumber = model.getLineCount();
	for (let lineNumber = 1; lineNumber <= endLineNumber; lineNumber++) {
		const lineContent = model.getLineContent(lineNumber);
		const match = lineContent.match(options.foldingRules!.markers!.start);
		if (match) {
			const range = { startLineNumber: lineNumber, startColumn: match[0].length + 1, endLineNumber: lineNumber, endColumn: lineContent.length + 1 };
			if (range.endColumn > range.startColumn) {
				const sectionHeader = {
					range,
					...getHeaderText(lineContent.substring(match[0].length)),
					shouldBeInComments: false
				};
				if (sectionHeader.text || sectionHeader.hasSeparatorLine) {
					regionHeaders.push(sectionHeader);
				}
			}
		}
	}
	return regionHeaders;
}

function collectMarkHeaders(model: ISectionHeaderFinderTarget): SectionHeader[] {
	const markHeaders: SectionHeader[] = [];
	const endLineNumber = model.getLineCount();
	for (let lineNumber = 1; lineNumber <= endLineNumber; lineNumber++) {
		const lineContent = model.getLineContent(lineNumber);
		addMarkHeaderIfFound(lineContent, lineNumber, markHeaders);
	}
	return markHeaders;
}

function addMarkHeaderIfFound(lineContent: string, lineNumber: number, sectionHeaders: SectionHeader[]) {
	markRegex.lastIndex = 0;
	const match = markRegex.exec(lineContent);
	if (match) {
		const column = match.indices![1][0] + 1;
		const endColumn = match.indices![1][1] + 1;
		const range = { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: endColumn };
		if (range.endColumn > range.startColumn) {
			const sectionHeader = {
				range,
				...getHeaderText(match[1]),
				shouldBeInComments: true
			};
			if (sectionHeader.text || sectionHeader.hasSeparatorLine) {
				sectionHeaders.push(sectionHeader);
			}
		}
	}
}

function getHeaderText(text: string): { text: string; hasSeparatorLine: boolean } {
	text = text.trim();
	const hasSeparatorLine = text.startsWith('-');
	text = text.replace(trimDashesRegex, '');
	return { text, hasSeparatorLine };
}
