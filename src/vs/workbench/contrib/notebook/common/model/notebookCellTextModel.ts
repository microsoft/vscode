/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { hash, StringSHA1 } from '../../../../../base/common/hash.js';
import { Disposable, DisposableStore, dispose } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import * as UUID from '../../../../../base/common/uuid.js';
import { Range } from '../../../../../editor/common/core/range.js';
import * as model from '../../../../../editor/common/model.js';
import { PieceTreeTextBuffer } from '../../../../../editor/common/model/pieceTreeTextBuffer/pieceTreeTextBuffer.js';
import { createTextBuffer, TextModel } from '../../../../../editor/common/model/textModel.js';
import { PLAINTEXT_LANGUAGE_ID } from '../../../../../editor/common/languages/modesRegistry.js';
import { ILanguageService } from '../../../../../editor/common/languages/language.js';
import { NotebookCellOutputTextModel } from './notebookCellOutputTextModel.js';
import { CellInternalMetadataChangedEvent, CellKind, ICell, ICellDto2, ICellOutput, IOutputDto, IOutputItemDto, NotebookCellCollapseState, NotebookCellInternalMetadata, NotebookCellMetadata, NotebookCellOutputsSplice, TransientCellMetadata, TransientOptions } from '../notebookCommon.js';
import { ThrottledDelayer } from '../../../../../base/common/async.js';
import { ILanguageDetectionService } from '../../../../services/languageDetection/common/languageDetectionWorkerService.js';
import { toFormattedString } from '../../../../../base/common/jsonFormatter.js';

export class NotebookCellTextModel extends Disposable implements ICell {
	private readonly _onDidChangeOutputs = this._register(new Emitter<NotebookCellOutputsSplice>());
	readonly onDidChangeOutputs: Event<NotebookCellOutputsSplice> = this._onDidChangeOutputs.event;

	private readonly _onDidChangeOutputItems = this._register(new Emitter<void>());
	readonly onDidChangeOutputItems: Event<void> = this._onDidChangeOutputItems.event;

	private readonly _onDidChangeContent = this._register(new Emitter<'content' | 'language' | 'mime'>());
	readonly onDidChangeContent: Event<'content' | 'language' | 'mime'> = this._onDidChangeContent.event;

	private readonly _onDidChangeMetadata = this._register(new Emitter<void>());
	readonly onDidChangeMetadata: Event<void> = this._onDidChangeMetadata.event;

	private readonly _onDidChangeInternalMetadata = this._register(new Emitter<CellInternalMetadataChangedEvent>());
	readonly onDidChangeInternalMetadata: Event<CellInternalMetadataChangedEvent> = this._onDidChangeInternalMetadata.event;

	private readonly _onDidChangeLanguage = this._register(new Emitter<string>());
	readonly onDidChangeLanguage: Event<string> = this._onDidChangeLanguage.event;

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
		const lastRunSuccessChanged = this._internalMetadata.lastRunSuccess !== newInternalMetadata.lastRunSuccess;
		newInternalMetadata = {
			...newInternalMetadata,
			...{ runStartTimeAdjustment: computeRunStartTimeAdjustment(this._internalMetadata, newInternalMetadata) }
		};
		this._internalMetadata = newInternalMetadata;
		this._hash = null;
		this._onDidChangeInternalMetadata.fire({ lastRunSuccessChanged });
	}

	get language() {
		return this._language;
	}

	set language(newLanguage: string) {
		if (this._textModel
			// 1. the language update is from workspace edit, checking if it's the same as text model's mode
			&& this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(newLanguage)
			// 2. the text model's mode might be the same as the `this.language`, even if the language friendly name is not the same, we should not trigger an update
			&& this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(this.language)) {
			return;
		}


		this._hasLanguageSetExplicitly = true;
		this._setLanguageInternal(newLanguage);
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

		this._textBuffer = this._register(createTextBuffer(this._source, model.DefaultEndOfLine.LF).textBuffer);

		this._register(this._textBuffer.onDidChangeContent(() => {
			this._hash = null;
			if (!this._textModel) {
				this._onDidChangeContent.fire('content');
			}
			this.autoDetectLanguage();
		}));

		return this._textBuffer;
	}

	private _textBufferHash: string | null = null;
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
			this.setRegisteredLanguage(this._languageService, this._textModel.getLanguageId(), this.language);

			// Listen to language changes on the model
			this._textModelDisposables.add(this._textModel.onDidChangeLanguage((e) => this.setRegisteredLanguage(this._languageService, e.newLanguage, this.language)));
			this._textModelDisposables.add(this._textModel.onWillDispose(() => this.textModel = undefined));
			this._textModelDisposables.add(this._textModel.onDidChangeContent(() => {
				if (this._textModel) {
					this._versionId = this._textModel.getVersionId();
					this._alternativeId = this._textModel.getAlternativeVersionId();
				}
				this._textBufferHash = null;
				this._onDidChangeContent.fire('content');
			}));

			this._textModel._overwriteVersionId(this._versionId);
			this._textModel._overwriteAlternativeVersionId(this._versionId);
		}
	}

	private setRegisteredLanguage(languageService: ILanguageService, newLanguage: string, currentLanguage: string) {
		// The language defined in the cell might not be supported in the editor so the text model might be using the default fallback
		// If so let's not modify the language
		const isFallBackLanguage = (newLanguage === PLAINTEXT_LANGUAGE_ID || newLanguage === 'jupyter');
		if (!languageService.isRegisteredLanguageId(currentLanguage) && isFallBackLanguage) {
			// notify to display warning, but don't change the language
			this._onDidChangeLanguage.fire(currentLanguage);
		} else {
			this.language = newLanguage;
		}
	}
	private static readonly AUTO_DETECT_LANGUAGE_THROTTLE_DELAY = 600;
	private readonly autoDetectLanguageThrottler = this._register(new ThrottledDelayer<void>(NotebookCellTextModel.AUTO_DETECT_LANGUAGE_THROTTLE_DELAY));
	private _autoLanguageDetectionEnabled: boolean = false;
	private _hasLanguageSetExplicitly: boolean = false;
	get hasLanguageSetExplicitly(): boolean { return this._hasLanguageSetExplicitly; }

	constructor(
		readonly uri: URI,
		public readonly handle: number,
		private readonly _source: string,
		private _language: string,
		private _mime: string | undefined,
		public readonly cellKind: CellKind,
		outputs: IOutputDto[],
		metadata: NotebookCellMetadata | undefined,
		internalMetadata: NotebookCellInternalMetadata | undefined,
		public readonly collapseState: NotebookCellCollapseState | undefined,
		public readonly transientOptions: TransientOptions,
		private readonly _languageService: ILanguageService,
		private readonly _languageDetectionService: ILanguageDetectionService | undefined = undefined
	) {
		super();
		this._outputs = outputs.map(op => new NotebookCellOutputTextModel(op));
		this._metadata = metadata ?? {};
		this._internalMetadata = internalMetadata ?? {};
	}

	enableAutoLanguageDetection() {
		this._autoLanguageDetectionEnabled = true;
		this.autoDetectLanguage();
	}

	async autoDetectLanguage(): Promise<void> {
		if (this._autoLanguageDetectionEnabled) {
			this.autoDetectLanguageThrottler.trigger(() => this._doAutoDetectLanguage());
		}
	}

	private async _doAutoDetectLanguage(): Promise<void> {
		if (this.hasLanguageSetExplicitly) {
			return;
		}

		const newLanguage = await this._languageDetectionService?.detectLanguage(this.uri);
		if (!newLanguage) {
			return;
		}

		if (this._textModel
			&& this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(newLanguage)
			&& this._textModel.getLanguageId() === this._languageService.getLanguageIdByLanguageName(this.language)) {
			return;
		}

		this._setLanguageInternal(newLanguage);
	}

	private _setLanguageInternal(newLanguage: string) {
		const newLanguageId = this._languageService.getLanguageIdByLanguageName(newLanguage);

		if (newLanguageId === null) {
			return;
		}

		if (this._textModel) {
			const languageId = this._languageService.createById(newLanguageId);
			this._textModel.setLanguage(languageId.languageId);
		}

		if (this._language === newLanguage) {
			return;
		}

		this._language = newLanguage;
		this._hash = null;
		this._onDidChangeLanguage.fire(newLanguage);
		this._onDidChangeContent.fire('language');
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

	getTextBufferHash() {
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

	getHashValue(): number {
		if (this._hash !== null) {
			return this._hash;
		}

		this._hash = hash([hash(this.language), this.getTextBufferHash(), this._getPersisentMetadata(), this.transientOptions.transientOutputs ? [] : this._outputs.map(op => ({
			outputs: op.outputs.map(output => ({
				mime: output.mime,
				data: Array.from(output.data.buffer)
			})),
			metadata: op.metadata
		}))]);
		return this._hash;
	}

	private _getPersisentMetadata() {
		return getFormattedMetadataJSON(this.transientOptions.transientCellMetadata, this.metadata, this.language);
	}

	getTextLength(): number {
		return this.textBuffer.getLength();
	}

	getFullModelRange() {
		const lineCount = this.textBuffer.getLineCount();
		return new Range(1, 1, lineCount, this.textBuffer.getLineLength(lineCount) + 1);
	}

	spliceNotebookCellOutputs(splice: NotebookCellOutputsSplice): void {
		if (splice.deleteCount > 0 && splice.newOutputs.length > 0) {
			const commonLen = Math.min(splice.deleteCount, splice.newOutputs.length);
			// update
			for (let i = 0; i < commonLen; i++) {
				const currentOutput = this.outputs[splice.start + i];
				const newOutput = splice.newOutputs[i];

				this.replaceOutput(currentOutput.outputId, newOutput);
			}

			const removed = this.outputs.splice(splice.start + commonLen, splice.deleteCount - commonLen, ...splice.newOutputs.slice(commonLen));
			removed.forEach(output => output.dispose());
			this._onDidChangeOutputs.fire({ start: splice.start + commonLen, deleteCount: splice.deleteCount - commonLen, newOutputs: splice.newOutputs.slice(commonLen) });
		} else {
			const removed = this.outputs.splice(splice.start, splice.deleteCount, ...splice.newOutputs);
			removed.forEach(output => output.dispose());
			this._onDidChangeOutputs.fire(splice);
		}
	}

	replaceOutput(outputId: string, newOutputItem: ICellOutput) {
		const outputIndex = this.outputs.findIndex(output => output.outputId === outputId);

		if (outputIndex < 0) {
			return false;
		}

		const output = this.outputs[outputIndex];
		// convert to dto and dispose the cell output model
		output.replaceData({
			outputs: newOutputItem.outputs,
			outputId: newOutputItem.outputId,
			metadata: newOutputItem.metadata
		});
		newOutputItem.dispose();
		this._onDidChangeOutputItems.fire();
		return true;
	}

	changeOutputItems(outputId: string, append: boolean, items: IOutputItemDto[]): boolean {
		const outputIndex = this.outputs.findIndex(output => output.outputId === outputId);

		if (outputIndex < 0) {
			return false;
		}

		const output = this.outputs[outputIndex];
		if (append) {
			output.appendData(items);
		} else {
			output.replaceData({ outputId: outputId, outputs: items, metadata: output.metadata });
		}
		this._onDidChangeOutputItems.fire();
		return true;
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

		if (this.outputs.length !== b.outputs.length) {
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

	/**
	 * Only compares
	 * - language
	 * - mime
	 * - cellKind
	 * - internal metadata
	 * - source
	 */
	fastEqual(b: ICellDto2): boolean {
		if (this.language !== b.language) {
			return false;
		}

		if (this.mime !== b.mime) {
			return false;
		}

		if (this.cellKind !== b.cellKind) {
			return false;
		}

		if (this.internalMetadata?.executionOrder !== b.internalMetadata?.executionOrder
			|| this.internalMetadata?.lastRunSuccess !== b.internalMetadata?.lastRunSuccess
			|| this.internalMetadata?.runStartTime !== b.internalMetadata?.runStartTime
			|| this.internalMetadata?.runStartTimeAdjustment !== b.internalMetadata?.runStartTimeAdjustment
			|| this.internalMetadata?.runEndTime !== b.internalMetadata?.runEndTime) {
			return false;
		}

		// Once we attach the cell text buffer to an editor, the source of truth is the text buffer instead of the original source
		if (this._textBuffer && this.getValue() !== b.source) {
			return false;
		} else if (this._source !== b.source) {
			return false;
		}

		return true;
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
		metadata: {}
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


export function getFormattedMetadataJSON(transientCellMetadata: TransientCellMetadata | undefined, metadata: NotebookCellMetadata, language?: string) {
	let filteredMetadata: { [key: string]: any } = {};

	if (transientCellMetadata) {
		const keys = new Set([...Object.keys(metadata)]);
		for (const key of keys) {
			if (!(transientCellMetadata[key as keyof NotebookCellMetadata])
			) {
				filteredMetadata[key] = metadata[key as keyof NotebookCellMetadata];
			}
		}
	} else {
		filteredMetadata = metadata;
	}

	const obj = {
		language,
		...filteredMetadata
	};
	// Give preference to the language we have been given.
	// Metadata can contain `language` due to round-tripping of cell metadata.
	// I.e. we add it here, and then from SCM when we revert the cell, we get this same metadata back with the `language` property.
	if (language) {
		obj.language = language;
	}
	const metadataSource = toFormattedString(obj, {});

	return metadataSource;
}
