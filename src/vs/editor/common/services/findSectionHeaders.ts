/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeRegExpCharacters, isFalsyOrWhitespace } from 'vs/base/common/strings';
import { IRange } from 'vs/editor/common/core/range';
import { FoldingRules } from 'vs/editor/common/languages/languageConfiguration';
import { ICommentsConfiguration } from 'vs/editor/common/languages/languageConfigurationRegistry';

export interface ISectionHeaderFinderTarget {
	getLineCount(): number;
	getLineContent(lineNumber: number): string;
}

export interface FindSectionHeaderOptions {
	languageId: string;
	commentsConfiguration?: ICommentsConfiguration | null;
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
}

interface CommentRegExps {
	lineCommentRegExp?: RegExp;
	startBlockCommentRegExp?: RegExp;
	endBlockCommentRegExp?: RegExp;
}

const languageCommentRegExps: { [languageId: string]: CommentRegExps } = {};
const markRegex = /\bMARK:\s*(.*)$/d;
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
	if (options.findMarkSectionHeaders && options.commentsConfiguration) {
		const markHeaders = collectMarkHeaders(model, options);
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
			const range = { startLineNumber: lineNumber, startColumn: match[0].length, endLineNumber: lineNumber, endColumn: lineContent.length - match[0].length };
			if (range.endColumn > range.startColumn) {
				const sectionHeader = { range, ...getHeaderText(lineContent.substring(match[0].length)) };
				if (sectionHeader.text || sectionHeader.hasSeparatorLine) {
					regionHeaders.push(sectionHeader);
				}
			}
		}
	}
	return regionHeaders;
}

function collectMarkHeaders(model: ISectionHeaderFinderTarget, options: FindSectionHeaderOptions): SectionHeader[] {
	const markHeaders: SectionHeader[] = [];
	const endLineNumber = model.getLineCount();
	const commentRegExps = getCommentRegExps(options);
	let inBlockComment = false;
	for (let lineNumber = 1; lineNumber <= endLineNumber; lineNumber++) {

		let lineContent = model.getLineContent(lineNumber);

		if (!inBlockComment && commentRegExps.lineCommentRegExp) {
			commentRegExps.lineCommentRegExp.lastIndex = 0;
			const match = commentRegExps.lineCommentRegExp.exec(lineContent);
			if (match) {
				addMarkHeaderIfFound(lineContent, lineNumber, markHeaders);
			}
		}

		if (commentRegExps.startBlockCommentRegExp) {
			if (!inBlockComment) {
				const startBlockMatch = lastMatch(lineContent, commentRegExps.startBlockCommentRegExp);
				if (startBlockMatch) {
					inBlockComment = true;
					lineContent = lineContent.substring(startBlockMatch.index + startBlockMatch[0].length);
				}
			}

			if (inBlockComment) {
				commentRegExps.endBlockCommentRegExp!.lastIndex = 0;
				const endBlockMatch = commentRegExps.endBlockCommentRegExp!.exec(lineContent);
				if (endBlockMatch) {
					inBlockComment = false;
					lineContent = lineContent.substring(0, endBlockMatch.index);
				}

				addMarkHeaderIfFound(lineContent, lineNumber, markHeaders);
			}
		}

	}
	return markHeaders;
}

function getCommentRegExps(options: FindSectionHeaderOptions): CommentRegExps {
	if (!languageCommentRegExps[options.languageId]) {
		const commentsConfiguration = options.commentsConfiguration!;
		const regExps: CommentRegExps = {};
		if (!isFalsyOrWhitespace(commentsConfiguration.lineCommentToken)) {
			// only match line comments at the start of the line
			regExps.lineCommentRegExp = new RegExp('^\\s*' + escapeRegExpCharacters(commentsConfiguration.lineCommentToken!));
		}
		if (!isFalsyOrWhitespace(commentsConfiguration.blockCommentStartToken) && !isFalsyOrWhitespace(commentsConfiguration.blockCommentEndToken)) {
			regExps.startBlockCommentRegExp = new RegExp(escapeRegExpCharacters(commentsConfiguration.blockCommentStartToken!), 'g');
			regExps.endBlockCommentRegExp = new RegExp(escapeRegExpCharacters(commentsConfiguration.blockCommentEndToken!), 'g');
		}
		languageCommentRegExps[options.languageId] = regExps;
	}
	return languageCommentRegExps[options.languageId];
}

function lastMatch(lineContent: string, regExp: RegExp): RegExpExecArray | null {
	regExp.lastIndex = 0;
	let match: RegExpExecArray | null = null;
	let result: RegExpExecArray | null;
	do {
		result = match;
		match = regExp.exec(lineContent);
	} while (match);
	return result;
}

function addMarkHeaderIfFound(lineContent: string, lineNumber: number, sectionHeaders: SectionHeader[]) {
	markRegex.lastIndex = 0;
	const match = markRegex.exec(lineContent);
	if (match) {
		const column = match.indices![1][0] + 1;
		const endColumn = match.indices![1][1] + 1;
		const range = { startLineNumber: lineNumber, startColumn: column, endLineNumber: lineNumber, endColumn: endColumn };
		if (range.endColumn > range.startColumn) {
			const sectionHeader = { range, ...getHeaderText(match[1]) };
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
