/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Range } from '../../../../editor/common/core/range.js';
import { DefaultEndOfLine, FindMatch, IReadonlyTextBuffer } from '../../../../editor/common/model.js';
import { PieceTreeTextBufferBuilder } from '../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { SearchParams } from '../../../../editor/common/model/textModelSearch.js';

interface RawOutputFindMatch {
	textBuffer: IReadonlyTextBuffer;
	matches: FindMatch[];
}

export class CellSearchModel extends Disposable {
	private _outputTextBuffers: IReadonlyTextBuffer[] | undefined = undefined;
	constructor(readonly _source: string, private _inputTextBuffer: IReadonlyTextBuffer | undefined, private _outputs: string[]) {
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
				builder.acceptChunk(output);
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
