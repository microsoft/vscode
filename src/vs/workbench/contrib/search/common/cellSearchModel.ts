/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DefaultEndOfLine, FindMatch, IReadonlyTextBuffer } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { SearchParams } from 'vs/editor/common/model/textModelSearch';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI, UriComponents } from 'vs/base/common/uri';
import { IOutputItemDto } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { IFileMatch, ITextSearchMatch } from 'vs/workbench/services/search/common/search';

export type IRawClosedNotebookFileMatch = IIncompleteNotebookFileMatch<UriComponents>;

export interface IIncompleteNotebookFileMatch<U extends UriComponents = URI> extends IFileMatch<U> {
	cellResults: IIncompleteNotebookCellMatch<U>[];
}

export interface IIncompleteNotebookCellMatch<U extends UriComponents = URI> {
	index: number;
	contentResults: ITextSearchMatch<U>[];
	webviewResults: ITextSearchMatch<U>[];
}
export function isIIncompleteNotebookFileMatch(object: IFileMatch): object is IIncompleteNotebookFileMatch {
	return 'cellResults' in object;
}
export function reviveIClosedNotebookCellMatch(cellMatch: IIncompleteNotebookCellMatch<UriComponents>): IIncompleteNotebookCellMatch<URI> {
	return {
		index: cellMatch.index,
		contentResults: cellMatch.contentResults.map(e => {
			return {
				...e,
				...{ uri: URI.revive(e.uri) }
			};
		}),
		webviewResults: cellMatch.webviewResults.map(e => {
			return {
				...e,
				...{ uri: URI.revive(e.uri) }
			};
		})
	};
}
// export function reviveIFileMatchWithRawCells(fileMatch: IRawNotebookFileMatch): IFileMatchWithRawCells<URI> {
// 	const resource = URI.revive(fileMatch.resource);
// 	const bleh = {
// 		...fileMatch,
// 		...{
// 			resource,
// 			cellResults: fileMatch.cellResults.map(e => reviveICellSearchMatch(e))
// 		},
// 	};
// 	return bleh;
// }

interface RawOutputFindMatch {
	textBuffer: IReadonlyTextBuffer;
	matches: FindMatch[];
}

export const rawCellPrefix = 'rawCell#';

export interface ICellSearchModel {
	inputTextBuffer: IReadonlyTextBuffer;
	outputTextBuffers: IReadonlyTextBuffer[];
	findInInputs(target: string): FindMatch[];
	findInOutputs(target: string): RawOutputFindMatch[];
}

export class CellSearchModel extends Disposable implements ICellSearchModel {
	private _outputTextBuffers: IReadonlyTextBuffer[] | undefined = undefined;
	constructor(readonly _source: string, private _inputTextBuffer: IReadonlyTextBuffer | undefined, private _outputs: IOutputItemDto[]) {
		super();
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
