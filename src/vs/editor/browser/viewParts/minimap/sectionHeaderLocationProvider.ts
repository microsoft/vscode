/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { escapeRegExpCharacters, isFalsyOrWhitespace } from 'vs/base/common/strings';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { ITextModel } from 'vs/editor/common/model';


export interface SectionHeader {
	/**
	 * The one-based line number of the section header.
	 */
	lineNumber: number;
	/**
	 * The text of the section header, excluding identifying markup.
	 */
	header: string;
	/**
	 * Whether the section header includes a separator line.
	 */
	hasSeparatorLine: boolean;
}


export class SectionHeaderLocationProvider {

	private readonly commentRegExps: { [languageId: string]: CommentRegExps } = {};

	constructor(
		private readonly model: ITextModel,
		private readonly languageConfigurationService: ILanguageConfigurationService,
	) { }

	/**
	 * Find section headers in the model.
	 *
	 * @param startLineNumber the first line number to compute from, inclusive
	 * @param endLineNumber the last line number to compute from, inclusive
	 * @param showRegionSectionHeaders whether to show section headers from regions
	 * @param showMarkSectionHeaders whether to show section headers from MARK comments
	 * @returns an array of section headers
	 */
	compute(startLineNumber: number, endLineNumber: number, showRegionSectionHeaders: boolean, showMarkSectionHeaders: boolean): SectionHeader[] {
		let headers: SectionHeader[] = [];
		if (showRegionSectionHeaders) {
			const regionHeaders = this._collectRegionHeaders(startLineNumber, endLineNumber);
			headers = headers.concat(regionHeaders);
		}
		if (showMarkSectionHeaders) {
			const markHeaders = this._collectMarkHeaders(startLineNumber, endLineNumber);
			headers = headers.concat(markHeaders);
		}
		return headers;
	}

	private _collectRegionHeaders(startLineNumber: number, endLineNumber: number): SectionHeader[] {
		const regionHeaders: SectionHeader[] = [];
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			this.model.tokenization.tokenizeIfCheap(lineNumber);
			const languageId = this.model.getLanguageIdAtPosition(lineNumber, 0);
			const foldingRules = this.languageConfigurationService.getLanguageConfiguration(languageId).foldingRules;
			const markers = foldingRules?.markers;
			if (!markers) {
				continue;
			}

			const lineContent = this.model.getLineContent(lineNumber);
			const match = lineContent.match(markers.start);
			if (match) {
				const headerText = lineContent.substring(match[0].length).trim();
				regionHeaders.push({ header: headerText, lineNumber: lineNumber, hasSeparatorLine: false });
			}
		}
		return regionHeaders;
	}

	private _collectMarkHeaders(startLineNumber: number, endLineNumber: number): SectionHeader[] {
		const markHeaders: SectionHeader[] = [];
		let inBlockComment = false;
		for (let lineNumber = 1; lineNumber <= endLineNumber; lineNumber++) {
			this.model.tokenization.tokenizeIfCheap(lineNumber);
			const languageId = this.model.getLanguageIdAtPosition(lineNumber, 0);
			const commentRegExps = this._getCommentRegExps(languageId);
			if (!commentRegExps) {
				continue;
			}

			let lineContent = this.model.getLineContent(lineNumber);

			if (lineNumber >= startLineNumber && !inBlockComment && commentRegExps.lineCommentRegExp) {
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

					if (lineNumber >= startLineNumber) {
						addMarkHeaderIfFound(lineContent, lineNumber, markHeaders);
					}
				}
			}

		}
		return markHeaders;
	}

	private _getCommentRegExps(languageId: string): CommentRegExps | undefined {
		if (!this.commentRegExps[languageId]) {
			const comments = this.languageConfigurationService.getLanguageConfiguration(languageId).comments;
			if (!comments) {
				return undefined;
			}

			const regExps: CommentRegExps = {};
			if (!isFalsyOrWhitespace(comments.lineCommentToken)) {
				// only match line comments at the start of the line
				regExps.lineCommentRegExp = new RegExp('^\\s*' + escapeRegExpCharacters(comments.lineCommentToken!));
			}
			if (!isFalsyOrWhitespace(comments.blockCommentStartToken) && !isFalsyOrWhitespace(comments.blockCommentEndToken)) {
				regExps.startBlockCommentRegExp = new RegExp(escapeRegExpCharacters(comments.blockCommentStartToken!), 'g');
				regExps.endBlockCommentRegExp = new RegExp(escapeRegExpCharacters(comments.blockCommentEndToken!), 'g');
			}
			this.commentRegExps[languageId] = regExps;
		}
		return this.commentRegExps[languageId];
	}

}

interface CommentRegExps {
	lineCommentRegExp?: RegExp;
	startBlockCommentRegExp?: RegExp;
	endBlockCommentRegExp?: RegExp;
}

const markRegex = /\bMARK:\s*(-\s*)?(.+)$/;

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
		const headerText = match[2];
		sectionHeaders.push({ header: headerText, lineNumber: lineNumber, hasSeparatorLine: !!match[1] });
	}
}
