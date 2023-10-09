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
import { IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';

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
	return genericCellMatchesToTextSearchMatches(
		contentMatches,
		cell instanceof CellSearchModel ? cell.inputTextBuffer : cell.textBuffer,
		cell
	);
}

export function genericCellMatchesToTextSearchMatches(contentMatches: FindMatch[], buffer: IReadonlyTextBuffer, cell: ICellViewModel | CellSearchModel) {
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

interface RawOutputFindMatch {
	textBuffer: IReadonlyTextBuffer;
	matches: FindMatch[];
}

export const rawCellPrefix = 'rawCell#';
export class CellSearchModel extends Disposable {
	private _outputTextBuffers: IReadonlyTextBuffer[] | undefined = undefined;
	constructor(readonly _source: string, private _inputTextBuffer: IReadonlyTextBuffer | undefined, private _outputs: IOutputItemDto[], private _uri: URI, private _cellIndex: number) {
		super();
	}

	get id() {
		return `${rawCellPrefix}${this._cellIndex}`;
	}

	get uri() {
		return this._uri;
	}

	private _getFullModelRange(buffer: IReadonlyTextBuffer): Range {
		const lineCount = buffer.getLineCount();
		return new Range(1, 1, lineCount, this._getLineMaxColumn(buffer, lineCount));
	}

	private _getLineMaxColumn(buffer: IReadonlyTextBuffer, lineNumber: number): number {
		if (lineNumber < 1 || lineNumber > buffer.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}
		return buffer.getLineLength(lineNumber) + 1;
	}

	get inputTextBuffer(): IReadonlyTextBuffer {
		if (!this._inputTextBuffer) {
			const builder = new PieceTreeTextBufferBuilder();
			builder.acceptChunk(this._source);
			const bufferFactory = builder.finish(true);
			const { textBuffer, disposable } = bufferFactory.create(DefaultEndOfLine.LF);
			this._inputTextBuffer = textBuffer;
			this._register(disposable);
		}

		return this._inputTextBuffer;
	}

	get outputTextBuffers(): IReadonlyTextBuffer[] {
		if (!this._outputTextBuffers) {
			this._outputTextBuffers = this._outputs.map((output) => {
				const builder = new PieceTreeTextBufferBuilder();
				builder.acceptChunk(output.data.toString());
				const bufferFactory = builder.finish(true);
				const { textBuffer, disposable } = bufferFactory.create(DefaultEndOfLine.LF);
				this._register(disposable);
				return textBuffer;
			});
		}
		return this._outputTextBuffers;
	}

	findInInputs(target: string): FindMatch[] {
		const searchParams = new SearchParams(target, false, false, null);
		const searchData = searchParams.parseSearchRequest();
		if (!searchData) {
			return [];
		}
		const fullInputRange = this._getFullModelRange(this.inputTextBuffer);
		return this.inputTextBuffer.findMatchesLineByLine(fullInputRange, searchData, true, 5000);
	}

	findInOutputs(target: string): RawOutputFindMatch[] {
		const searchParams = new SearchParams(target, false, false, null);
		const searchData = searchParams.parseSearchRequest();
		if (!searchData) {
			return [];
		}
		return this.outputTextBuffers.map(buffer => {
			const matches = buffer.findMatchesLineByLine(
				this._getFullModelRange(buffer),
				searchData,
				true,
				5000
			);
			if (matches.length === 0) {
				return undefined;
			}
			return {
				textBuffer: buffer,
				matches
			};
		}).filter((item): item is RawOutputFindMatch => !!item);
	}
}
