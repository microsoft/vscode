/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/


import { FindMatch, IReadonlyTextBuffer } from '../../../../editor/common/model.js';
import { TextSearchMatch, IFileMatch, ITextSearchMatch } from '../../../services/search/common/search.js';
import { Range } from '../../../../editor/common/core/range.js';
import { URI, UriComponents } from '../../../../base/common/uri.js';

export type IRawClosedNotebookFileMatch = INotebookFileMatchNoModel<UriComponents>;

export interface INotebookFileMatchNoModel<U extends UriComponents = URI> extends IFileMatch<U> {
	cellResults: INotebookCellMatchNoModel<U>[];
}

export interface INotebookCellMatchNoModel<U extends UriComponents = URI> {
	index: number;
	contentResults: ITextSearchMatch<U>[];
	webviewResults: ITextSearchMatch<U>[];
}

export function isINotebookFileMatchNoModel(object: IFileMatch): object is INotebookFileMatchNoModel {
	return 'cellResults' in object;
}

export const rawCellPrefix = 'rawCell#';

export function genericCellMatchesToTextSearchMatches(contentMatches: FindMatch[], buffer: IReadonlyTextBuffer) {
	let previousEndLine = -1;
	const contextGroupings: FindMatch[][] = [];
	let currentContextGrouping: FindMatch[] = [];

	contentMatches.forEach((match) => {
		if (match.range.startLineNumber !== previousEndLine) {
			if (currentContextGrouping.length > 0) {
				contextGroupings.push([...currentContextGrouping]);
				currentContextGrouping = [];
			}
		}

		currentContextGrouping.push(match);
		previousEndLine = match.range.endLineNumber;
	});

	if (currentContextGrouping.length > 0) {
		contextGroupings.push([...currentContextGrouping]);
	}

	const textSearchResults = contextGroupings.map((grouping) => {
		const lineTexts: string[] = [];
		const firstLine = grouping[0].range.startLineNumber;
		const lastLine = grouping[grouping.length - 1].range.endLineNumber;
		for (let i = firstLine; i <= lastLine; i++) {
			lineTexts.push(buffer.getLineContent(i));
		}
		return new TextSearchMatch(
			lineTexts.join('\n') + '\n',
			grouping.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
		);
	});

	return textSearchResults;
}

