/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toFormattedString } from '../../../../../base/common/jsonFormatter.js';
import { INotebookDocumentMetadataTextModel, INotebookTextModel, NotebookCellMetadata, NotebookCellsChangeType, NotebookDocumentMetadata, NotebookMetadataUri, TransientDocumentMetadata } from '../notebookCommon.js';
import { StringSHA1 } from '../../../../../base/common/hash.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { DefaultEndOfLine, EndOfLinePreference, ITextBuffer } from '../../../../../editor/common/model.js';
import { Emitter } from '../../../../../base/common/event.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { createTextBuffer } from '../../../../../editor/common/model/textModel.js';

export function getFormattedNotebookMetadataJSON(transientMetadata: TransientDocumentMetadata | undefined, metadata: NotebookDocumentMetadata) {
	let filteredMetadata: { [key: string]: any } = {};

	if (transientMetadata) {
		const keys = new Set([...Object.keys(metadata)]);
		for (const key of keys) {
			if (!(transientMetadata[key as keyof NotebookCellMetadata])
			) {
				filteredMetadata[key] = metadata[key as keyof NotebookCellMetadata];
			}
		}
	} else {
		filteredMetadata = metadata;
	}

	const metadataSource = toFormattedString(filteredMetadata, {});

	return metadataSource;
}

export class NotebookDocumentMetadataTextModel extends Disposable implements INotebookDocumentMetadataTextModel {
	public readonly uri: URI;
	public get metadata(): NotebookDocumentMetadata {
		return this.notebookModel.metadata;
	}
	private readonly _onDidChange = this._register(new Emitter<void>());
	public readonly onDidChange = this._onDidChange.event;

	private _textBufferHash: string | null = null;
	private _textBuffer?: ITextBuffer;
	get textBuffer() {
		if (this._textBuffer) {
			return this._textBuffer;
		}

		const source = getFormattedNotebookMetadataJSON(this.notebookModel.transientOptions.transientDocumentMetadata, this.metadata);
		this._textBuffer = this._register(createTextBuffer(source, DefaultEndOfLine.LF).textBuffer);

		this._register(this._textBuffer.onDidChangeContent(() => {
			this._onDidChange.fire();
		}));

		return this._textBuffer;
	}

	constructor(public readonly notebookModel: INotebookTextModel) {
		super();
		this.uri = NotebookMetadataUri.generate(this.notebookModel.uri);
		this._register(this.notebookModel.onDidChangeContent((e) => {
			if (e.rawEvents.some(event => event.kind === NotebookCellsChangeType.ChangeDocumentMetadata || event.kind === NotebookCellsChangeType.ModelChange)) {
				this._textBuffer?.dispose();
				this._textBuffer = undefined;
				this._textBufferHash = null;
				this._onDidChange.fire();
			}
		}));
	}

	getHash() {
		if (this._textBufferHash !== null) {
			return this._textBufferHash;
		}

		const shaComputer = new StringSHA1();
		const snapshot = this.textBuffer.createSnapshot(false);
		let text: string | null;
		while ((text = snapshot.read())) {
			shaComputer.update(text);
		}
		this._textBufferHash = shaComputer.digest();
		return this._textBufferHash;
	}

	public getValue() {
		const fullRange = this.getFullModelRange();
		const eol = this.textBuffer.getEOL();
		if (eol === '\n') {
			return this.textBuffer.getValueInRange(fullRange, EndOfLinePreference.LF);
		} else {
			return this.textBuffer.getValueInRange(fullRange, EndOfLinePreference.CRLF);
		}
	}
	private getFullModelRange() {
		const lineCount = this.textBuffer.getLineCount();
		return new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1);
	}

}
