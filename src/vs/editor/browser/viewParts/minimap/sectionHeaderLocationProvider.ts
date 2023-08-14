/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from 'vs/base/common/lifecycle';
import { StandardTokenType } from 'vs/editor/common/encodedTokenAttributes';
import { FoldingMarkers } from 'vs/editor/common/languages/languageConfiguration';
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

	private readonly disposables: DisposableStore;

	constructor(
		private readonly model: ITextModel,
		private readonly showRegionSectionHeaders: boolean,
		private readonly showMarkSectionHeaders: boolean,
		private readonly languageConfigurationService: ILanguageConfigurationService,
	) {
		this.disposables = new DisposableStore();
	}

	/**
	 * Find lines that have section headers and return them in a sparse array.
	 *
	 * @param startLineNumber the first line number to compute from, inclusive
	 * @param endLineNumber the last line number to compute from, inclusive
	 * @returns a sparse array where one-based index are populated with the header
	 * on the corresponding line
	 */
	compute(startLineNumber: number, endLineNumber: number): SectionHeader[] | null {
		const headers: SectionHeader[] = [];
		if (this.showRegionSectionHeaders) {
			const regionHeaders = this._collectRegionHeaders(startLineNumber, endLineNumber);
			for (const header of regionHeaders) {
				headers[header.lineNumber] = header;
			}
		}
		if (this.showMarkSectionHeaders) {
			const markHeaders = collectMarkHeaders(startLineNumber, endLineNumber, this.model);
			for (const header of markHeaders) {
				headers[header.lineNumber] = header;
			}
		}
		return headers;
	}

	dispose() {
		this.disposables.dispose();
	}

	private _getFoldingMarkers(languageId: string): FoldingMarkers | undefined {
		const foldingRules = this.languageConfigurationService.getLanguageConfiguration(languageId).foldingRules;
		return foldingRules?.markers;
	}

	private _collectRegionHeaders(startLineNumber: number, endLineNumber: number): SectionHeader[] {
		const regionHeaders: SectionHeader[] = [];
		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			this.model.tokenization.tokenizeIfCheap(lineNumber);
			const languageId = this.model.getLanguageIdAtPosition(lineNumber, 0);
			const markers = this._getFoldingMarkers(languageId);
			if (!markers) {
				continue;
			}

			const lineContent = this.model.getLineContent(lineNumber);
			const match = lineContent.match(markers.start);
			if (match) {
				const headerText = lineContent.substring(match[0].length).trim();
				regionHeaders?.push({ header: headerText, lineNumber: lineNumber, hasSeparatorLine: false });
			}
		}
		return regionHeaders;
	}

}

const markRegex = /^\s*MARK:\s*(-)?/m;

function collectMarkHeaders(startLineNumber: number, endLineNumber: number, model: ITextModel): SectionHeader[] {
	const markHeaders: SectionHeader[] = [];
	for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
		const nonWhitespaceColumn = model.getLineFirstNonWhitespaceColumn(lineNumber);
		if (nonWhitespaceColumn === 0) {
			continue;
		}

		model.tokenization.tokenizeIfCheap(lineNumber);
		const tokens = model.tokenization.getLineTokens(lineNumber);
		if (tokens.getCount() > 0) {
			const firstNonWhitespaceTokenIndex = tokens.findTokenIndexAtOffset(nonWhitespaceColumn);
			if (firstNonWhitespaceTokenIndex >= 0 && tokens.getStandardTokenType(firstNonWhitespaceTokenIndex) === StandardTokenType.Comment) {
				const commentEndOffset = tokens.getEndOffset(firstNonWhitespaceTokenIndex);
				const commentText = model.getLineContent(lineNumber);
				const match = commentText.substring(commentEndOffset).match(markRegex);
				if (match) {
					const headerText = commentText.substring(commentEndOffset + match[0].length).trim();
					const hasSeparatorLine = !!match[1];
					markHeaders.push({ header: headerText, lineNumber: lineNumber, hasSeparatorLine: hasSeparatorLine });
				}
			}
		}
	}
	return markHeaders;
}
