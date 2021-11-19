/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { hash } from 'vs/base/common/hash';
import { Disposable, DisposableStore, dispose } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import * as UUID from 'vs/base/common/uuid';
import { Range } from 'vs/editor/common/core/range';
import * as model from 'vs/editor/common/model';
import { PieceTreeTextBuffer } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer';
import { PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IModeService } from 'vs/editor/common/services/modeService';
import { NotebookCellOutputTextModel } from 'vs/workbench/contrib/notebook/common/model/notebookCellOutputTextModel';
import { CellInternalMetadataChangedEvent, CellKind, ICell, ICellOutput, IOutputDto, NotebookCellInternalMetadata, NotebookCellMetadata, NotebookCellOutputsSplice, TransientOptions } from 'vs/workbench/contrib/notebook/common/notebookCommon';

export class NotebookCellTextModel extends Disposable implements ICell {
	private readonly _onDidChangeOutputs = this._register(new Emitter<NotebookCellOutputsSplice>());
	onDidChangeOutputs: Event<NotebookCellOutputsSplice> = this._onDidChangeOutputs.event;

	private readonly _onDidChangeContent = this._register(new Emitter<'content' | 'language' | 'mime'>());
	onDidChangeContent: Event<'content' | 'language' | 'mime'> = this._onDidChangeContent.event;

	private readonly _onDidChangeMetadata = this._register(new Emitter<void>());
	onDidChangeMetadata: Event<void> = this._onDidChangeMetadata.event;

	private readonly _onDidChangeInternalMetadata = this._register(new Emitter<CellInternalMetadataChangedEvent>());
	onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent> = this._onDidChangeInternalMetadata.event;

	private readonly _onDidChangeLanguage = this._register(new Emitter<string>());
	onDidChangeLanguage: Event<string> = this._onDidChangeLanguage.event;

	private _outputs: NotebookCellOutputTextModel[];

	get outputs(): ICellOutput[] {
		return this._outputs;
	}

	private _metadata: NotebookCellMetadata;

	get metadata() {
		return this._metadata;
	}

	set metadata(newMetadata: NotebookCellMetadata) {
		this._metadata = newMetadata;
		this._hash = null;
		this._onDidChangeMetadata.fire();
	}

	private _internalMetadata: NotebookCellInternalMetadata;

	get internalMetadata() {
		return this._internalMetadata;
	}

	set internalMetadata(newInternalMetadata: NotebookCellInternalMetadata) {
		const runStateChanged = this._internalMetadata.runState !== newInternalMetadata.runState;
		const lastRunSuccessChanged = this._internalMetadata.lastRunSuccess !== newInternalMetadata.lastRunSuccess;
		newInternalMetadata = {
			...newInternalMetadata,
			...{ runStartTimeAdjustment: computeRunStartTimeAdjustment(this._internalMetadata, newInternalMetadata) }
		};
		this._internalMetadata = newInternalMetadata;
		this._hash = null;
		this._onDidChangeInternalMetadata.fire({ runStateChanged, lastRunSuccessChanged });
	}

	get language() {
		return this._language;
	}

	set language(newLanguage: string) {
		if (this._textModel
			// 1. the language update is from workspace edit, checking if it's the same as text model's mode
			&& this._textModel.getLanguageId() === this._modeService.getModeIdForLanguageName(newLanguage)
			// 2. the text model's mode might be the same as the `this.language`, even if the language friendly name is not the same, we should not trigger an update
			&& this._textModel.getLanguageId() === this._modeService.getModeIdForLanguageName(this.language)) {
			return;
		}

		const newMode = this._modeService.getModeIdForLanguageName(newLanguage);

		if (newMode === null) {
			return;
		}

		if (this._textModel) {
			const languageId = this._modeService.create(newMode);
			this._textModel.setMode(languageId.languageId);
		}

		if (this._language === newLanguage) {
			return;
		}

		this._language = newLanguage;
		this._hash = null;
		this._onDidChangeLanguage.fire(newLanguage);
		this._onDidChangeContent.fire('language');
	}

	public get mime(): string | undefined {
		return this._mime;
	}

	public set mime(newMime: string | undefined) {
		if (this._mime === newMime) {
			return;
		}
		this._mime = newMime;
		this._hash = null;
		this._onDidChangeContent.fire('mime');
	}

	private _textBuffer!: model.IReadonlyTextBuffer;

	get textBuffer() {
		if (this._textBuffer) {
			return this._textBuffer;
		}

		const builder = new PieceTreeTextBufferBuilder();
		builder.acceptChunk(this._source);
		const bufferFactory = builder.finish(true);
		const { textBuffer, disposable } = bufferFactory.create(model.DefaultEndOfLine.LF);
		this._textBuffer = textBuffer;
		this._register(disposable);

		this._register(this._textBuffer.onDidChangeContent(() => {
			this._hash = null;
			if (!this._textModel) {
				this._onDidChangeContent.fire('content');
			}
		}));

		return this._textBuffer;
	}

	private _hash: number | null = null;

	private _versionId: number = 1;
	private _alternativeId: number = 1;
	get alternativeId(): number {
		return this._alternativeId;
	}

	private readonly _textModelDisposables = this._register(new DisposableStore());
	private _textModel: TextModel | undefined = undefined;
	get textModel(): TextModel | undefined {
		return this._textModel;
	}

	set textModel(m: TextModel | undefined) {
		if (this._textModel === m) {
			return;
		}

		this._textModelDisposables.clear();
		this._textModel = m;
		if (this._textModel) {
			// Init language from text model
			// The language defined in the cell might not be supported in the editor so the text model might be using the default fallback (plaintext)
			// If so let's not modify the language
			if (!(this._modeService.getModeId(this.language) === null && this._textModel.getLanguageId() === 'plaintext')) {
				this.language = this._textModel.getLanguageId();
			}

			// Listen to language changes on the model
			this._textModelDisposables.add(this._textModel.onDidChangeLanguage(e => {
				this.language = e.newLanguage;
			}));
			this._textModelDisposables.add(this._textModel.onWillDispose(() => this.textModel = undefined));
			this._textModelDisposables.add(this._textModel.onDidChangeContent(() => {
				if (this._textModel) {
					this._versionId = this._textModel.getVersionId();
					this._alternativeId = this._textModel.getAlternativeVersionId();
				}
				this._onDidChangeContent.fire('content');
			}));

			this._textModel._overwriteVersionId(this._versionId);
			this._textModel._overwriteAlternativeVersionId(this._versionId);
		}
	}

	constructor(
		readonly uri: URI,
		public handle: number,
		private _source: string,
		private _language: string,
		private _mime: string | undefined,
		public cellKind: CellKind,
		outputs: IOutputDto[],
		metadata: NotebookCellMetadata | undefined,
		internalMetadata: NotebookCellInternalMetadata | undefined,
		public readonly transientOptions: TransientOptions,
		private readonly _modeService: IModeService
	) {
		super();
		this._outputs = outputs.map(op => new NotebookCellOutputTextModel(op));
		this._metadata = metadata ?? {};
		this._internalMetadata = internalMetadata ?? {};
	}

	resetTextBuffer(textBuffer: model.ITextBuffer) {
		this._textBuffer = textBuffer;
	}

	getValue(): string {
		const fullRange = this.getFullModelRange();
		const eol = this.textBuffer.getEOL();
		if (eol === '\n') {
			return this.textBuffer.getValueInRange(fullRange, model.EndOfLinePreference.LF);
		} else {
			return this.textBuffer.getValueInRange(fullRange, model.EndOfLinePreference.CRLF);
		}
	}

	getHashValue(): number {
		if (this._hash !== null) {
			return this._hash;
		}

		this._hash = hash([hash(this.language), hash(this.getValue()), this._getPersisentMetadata(), this.transientOptions.transientOutputs ? [] : this._outputs.map(op => ({
			outputs: op.outputs.map(output => ({
				mime: output.mime,
				data: Array.from(output.data.buffer)
			})),
			metadata: op.metadata
		}))]);
		return this._hash;
	}

	private _getPersisentMetadata() {
		let filteredMetadata: { [key: string]: any; } = {};
		const transientCellMetadata = this.transientOptions.transientCellMetadata;

		const keys = new Set([...Object.keys(this.metadata)]);
		for (let key of keys) {
			if (!(transientCellMetadata[key as keyof NotebookCellMetadata])
			) {
				filteredMetadata[key] = this.metadata[key as keyof NotebookCellMetadata];
			}
		}

		return filteredMetadata;
	}

	getTextLength(): number {
		return this.textBuffer.getLength();
	}

	getFullModelRange() {
		const lineCount = this.textBuffer.getLineCount();
		return new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1);
	}

	spliceNotebookCellOutputs(splice: NotebookCellOutputsSplice): void {
		this.outputs.splice(splice.start, splice.deleteCount, ...splice.newOutputs);
		this._onDidChangeOutputs.fire(splice);
	}

	private _outputNotEqualFastCheck(left: ICellOutput[], right: ICellOutput[]) {
		if (left.length !== right.length) {
			return false;
		}

		for (let i = 0; i < this.outputs.length; i++) {
			const l = left[i];
			const r = right[i];

			if (l.outputs.length !== r.outputs.length) {
				return false;
			}

			for (let k = 0; k < l.outputs.length; k++) {
				if (l.outputs[k].mime !== r.outputs[k].mime) {
					return false;
				}

				if (l.outputs[k].data.byteLength !== r.outputs[k].data.byteLength) {
					return false;
				}
			}
		}

		return true;
	}

	equal(b: NotebookCellTextModel): boolean {
		if (this.language !== b.language) {
			return false;
		}

		if (this.getTextLength() !== b.getTextLength()) {
			return false;
		}

		if (!this.transientOptions.transientOutputs) {
			// compare outputs

			if (!this._outputNotEqualFastCheck(this.outputs, b.outputs)) {
				return false;
			}
		}

		return this.getHashValue() === b.getHashValue();
	}

	override dispose() {
		dispose(this._outputs);
		// Manually release reference to previous text buffer to avoid large leaks
		// in case someone leaks a CellTextModel reference
		const emptyDisposedTextBuffer = new PieceTreeTextBuffer([], '', '\n', false, false, true, true);
		emptyDisposedTextBuffer.dispose();
		this._textBuffer = emptyDisposedTextBuffer;
		super.dispose();
	}
}

export function cloneNotebookCellTextModel(cell: NotebookCellTextModel) {
	return {
		source: cell.getValue(),
		language: cell.language,
		mime: cell.mime,
		cellKind: cell.cellKind,
		outputs: cell.outputs.map(output => ({
			outputs: output.outputs,
			/* paste should generate new outputId */ outputId: UUID.generateUuid()
		})),
		metadata: { ...cell.metadata },
		// Don't include internalMetadata, ie execution state, this is not to be shared
	};
}

function computeRunStartTimeAdjustment(oldMetadata: NotebookCellInternalMetadata, newMetadata: NotebookCellInternalMetadata): number | undefined {
	if (oldMetadata.runStartTime !== newMetadata.runStartTime && typeof newMetadata.runStartTime === 'number') {
		const offset = Date.now() - newMetadata.runStartTime;
		return offset < 0 ? Math.abs(offset) : 0;
	} else {
		return newMetadata.runStartTimeAdjustment;
	}
}
