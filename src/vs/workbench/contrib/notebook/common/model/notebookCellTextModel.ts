/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { ICell, IOutput, NotebookCellOutputsSplice, CellKind, NotebookCellMetadata } from 'vs/workbench/contrib/notebook/common/notebookCommon';
import { PieceTreeTextBufferFactory, PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { URI } from 'vs/base/common/uri';

export class NotebookCellTextModel implements ICell {
	private _onDidChangeOutputs = new Emitter<NotebookCellOutputsSplice[]>();
	onDidChangeOutputs: Event<NotebookCellOutputsSplice[]> = this._onDidChangeOutputs.event;

	private _onDidChangeContent = new Emitter<void>();
	onDidChangeContent: Event<void> = this._onDidChangeContent.event;

	private _outputs: IOutput[];

	get outputs(): IOutput[] {
		return this._outputs;
	}

	get source() {
		return this._source;
	}

	set source(newValue: string[]) {
		this._source = newValue;
		this._buffer = null;
	}

	private _buffer: PieceTreeTextBufferFactory | null = null;

	constructor(
		readonly uri: URI,
		public handle: number,
		private _source: string[],
		public language: string,
		public cellKind: CellKind,
		outputs: IOutput[],
		public readonly metadata: NotebookCellMetadata | undefined
	) {
		this._outputs = outputs;
	}

	contentChange() {
		this._onDidChangeContent.fire();

	}

	spliceNotebookCellOutputs(splices: NotebookCellOutputsSplice[]): void {
		splices.reverse().forEach(splice => {
			this.outputs.splice(splice[0], splice[1], ...splice[2]);
		});

		this._onDidChangeOutputs.fire(splices);
	}

	resolveTextBufferFactory(): PieceTreeTextBufferFactory {
		if (this._buffer) {
			return this._buffer;
		}

		let builder = new PieceTreeTextBufferBuilder();
		builder.acceptChunk(this.source.join('\n'));
		this._buffer = builder.finish(true);
		return this._buffer;
	}
}
