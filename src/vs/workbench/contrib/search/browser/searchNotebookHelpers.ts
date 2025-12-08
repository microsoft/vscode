/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefaultEndOfLine, FindMatch, IReadonlyTextBuffer } from 'vs/editor/common/model';
import { CellWebviewFindMatch, ICellViewModel } from 'vs/workbench/contrib/notebook/browser/notebookBrowser';
import { IFileMatch, ITextSearchMatch, TextSearchMatch } from 'vs/workbench/services/search/common/search';
import { Range } from 'vs/editor/common/core/range';
import { PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { SearchParams } from 'vs/editor/common/model/textModelSearch';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';

export interface IFileMatchWithCells extends IFileMatch {
	cellResults: ICellMatch[];
}

export interface ICellMatch {
	cell: ICellViewModel | CellSearchModel;
	index: number;
	contentResults: ITextSearchMatch[];
	webviewResults: ITextSearchMatch[];
}
export function isIFileMatchWithCells(object: IFileMatch): object is IFileMatchWithCells {
	return 'cellResults' in object;
}

// to text search results

export function contentMatchesToTextSearchMatches(contentMatches: FindMatch[], cell: ICellViewModel | CellSearchModel): ITextSearchMatch[] {
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
			lineTexts.push(cell.textBuffer.getLineContent(i));
		}
		return new TextSearchMatch(
			lineTexts.join('\n') + '\n',
			grouping.map(m => new Range(m.range.startLineNumber - 1, m.range.startColumn - 1, m.range.endLineNumber - 1, m.range.endColumn - 1)),
		);
	});

	return textSearchResults;
}

export function webviewMatchesToTextSearchMatches(webviewMatches: CellWebviewFindMatch[]): ITextSearchMatch[] {
	return webviewMatches
		.map(rawMatch =>
			(rawMatch.searchPreviewInfo) ?
				new TextSearchMatch(
					rawMatch.searchPreviewInfo.line,
					new Range(0, rawMatch.searchPreviewInfo.range.start, 0, rawMatch.searchPreviewInfo.range.end),
					undefined,
					rawMatch.index) : undefined
		).filter((e): e is ITextSearchMatch => !!e);
}

// experimental

export const rawCellPrefix = 'rawCell#';
export class CellSearchModel extends Disposable {
	constructor(readonly _source: string, private _textBuffer: IReadonlyTextBuffer | undefined, private _uri: URI, private _cellIndex: number) {
		super();
	}

	get id() {
		return `${rawCellPrefix}${this._cellIndex}`;
	}

	get uri() {
		return this._uri;
	}

	public getFullModelRange(): Range {
		const lineCount = this.textBuffer.getLineCount();
		return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
	}

	public getLineMaxColumn(lineNumber: number): number {
		if (lineNumber < 1 || lineNumber > this.textBuffer.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}
		return this.textBuffer.getLineLength(lineNumber) + 1;
	}

	get textBuffer() {
		if (this._textBuffer) {
			return this._textBuffer;
		}

		const builder = new PieceTreeTextBufferBuilder();
		builder.acceptChunk(this._source);
		const bufferFactory = builder.finish(true);
		const { textBuffer, disposable } = bufferFactory.create(DefaultEndOfLine.LF);
		this._textBuffer = textBuffer;
		this._register(disposable);

		return this._textBuffer;
	}

	find(target: string): FindMatch[] {
		const searchParams = new SearchParams(target, false, false, null);
		const searchData = searchParams.parseSearchRequest();
		if (!searchData) {
			return [];
		}
		const fullRange = this.getFullModelRange();
		return this.textBuffer.findMatchesLineByLine(fullRange, searchData, true, 5000);
	}
}
