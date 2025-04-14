/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ArrayQueue, pushMany } from '../../../base/common/arrays.js';
import { VSBuffer, VSBufferReadableStream } from '../../../base/common/buffer.js';
import { Color } from '../../../base/common/color.js';
import { BugIndicatingError, illegalArgument, onUnexpectedError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { IMarkdownString } from '../../../base/common/htmlContent.js';
import { Disposable, IDisposable, MutableDisposable, combinedDisposable } from '../../../base/common/lifecycle.js';
import { listenStream } from '../../../base/common/stream.js';
import * as strings from '../../../base/common/strings.js';
import { ThemeColor } from '../../../base/common/themables.js';
import { Constants } from '../../../base/common/uint.js';
import { URI } from '../../../base/common/uri.js';
import { ISingleEditOperation } from '../core/editOperation.js';
import { countEOL } from '../core/eolCounter.js';
import { normalizeIndentation } from '../core/indentation.js';
import { IPosition, Position } from '../core/position.js';
import { IRange, Range } from '../core/range.js';
import { Selection } from '../core/selection.js';
import { TextChange } from '../core/textChange.js';
import { EDITOR_MODEL_DEFAULTS } from '../core/textModelDefaults.js';
import { IWordAtPosition } from '../core/wordHelper.js';
import { FormattingOptions } from '../languages.js';
import { ILanguageSelection, ILanguageService } from '../languages/language.js';
import { ILanguageConfigurationService } from '../languages/languageConfigurationRegistry.js';
import * as model from '../model.js';
import { BracketPairsTextModelPart } from './bracketPairsTextModelPart/bracketPairsImpl.js';
import { ColorizedBracketPairsDecorationProvider } from './bracketPairsTextModelPart/colorizedBracketPairsDecorationProvider.js';
import { EditStack } from './editStack.js';
import { GuidesTextModelPart } from './guidesTextModelPart.js';
import { guessIndentation } from './indentationGuesser.js';
import { IntervalNode, IntervalTree, recomputeMaxEnd } from './intervalTree.js';
import { PieceTreeTextBuffer } from './pieceTreeTextBuffer/pieceTreeTextBuffer.js';
import { PieceTreeTextBufferBuilder } from './pieceTreeTextBuffer/pieceTreeTextBufferBuilder.js';
import { SearchParams, TextModelSearch } from './textModelSearch.js';
import { TokenizationTextModelPart } from './tokenizationTextModelPart.js';
import { AttachedViews } from './tokens.js';
import { IBracketPairsTextModelPart } from '../textModelBracketPairs.js';
import { IModelContentChangedEvent, IModelDecorationsChangedEvent, IModelOptionsChangedEvent, InternalModelContentChangeEvent, LineInjectedText, ModelInjectedTextChangedEvent, ModelRawChange, ModelRawContentChangedEvent, ModelRawEOLChanged, ModelRawFlush, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted, ModelLineHeightChangedEvent, ModelLineHeightChanged } from '../textModelEvents.js';
import { IGuidesTextModelPart } from '../textModelGuides.js';
import { ITokenizationTextModelPart } from '../tokenizationTextModelPart.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { IColorTheme } from '../../../platform/theme/common/themeService.js';
import { IUndoRedoService, ResourceEditStackSnapshot, UndoRedoGroup } from '../../../platform/undoRedo/common/undoRedo.js';
import { TokenArray } from '../tokens/tokenArray.js';
import { SetWithKey } from '../../../base/common/collections.js';

export function createTextBufferFactory(text: string): model.ITextBufferFactory {
	const builder = new PieceTreeTextBufferBuilder();
	builder.acceptChunk(text);
	return builder.finish();
}

interface ITextStream {
	on(event: 'data', callback: (data: string) => void): void;
	on(event: 'error', callback: (err: Error) => void): void;
	on(event: 'end', callback: () => void): void;
	on(event: string, callback: any): void;
}

export function createTextBufferFactoryFromStream(stream: ITextStream): Promise<model.ITextBufferFactory>;
export function createTextBufferFactoryFromStream(stream: VSBufferReadableStream): Promise<model.ITextBufferFactory>;
export function createTextBufferFactoryFromStream(stream: ITextStream | VSBufferReadableStream): Promise<model.ITextBufferFactory> {
	return new Promise<model.ITextBufferFactory>((resolve, reject) => {
		const builder = new PieceTreeTextBufferBuilder();

		let done = false;

		listenStream<string | VSBuffer>(stream, {
			onData: chunk => {
				builder.acceptChunk((typeof chunk === 'string') ? chunk : chunk.toString());
			},
			onError: error => {
				if (!done) {
					done = true;
					reject(error);
				}
			},
			onEnd: () => {
				if (!done) {
					done = true;
					resolve(builder.finish());
				}
			}
		});
	});
}

export function createTextBufferFactoryFromSnapshot(snapshot: model.ITextSnapshot): model.ITextBufferFactory {
	const builder = new PieceTreeTextBufferBuilder();

	let chunk: string | null;
	while (typeof (chunk = snapshot.read()) === 'string') {
		builder.acceptChunk(chunk);
	}

	return builder.finish();
}

export function createTextBuffer(value: string | model.ITextBufferFactory | model.ITextSnapshot, defaultEOL: model.DefaultEndOfLine): { textBuffer: model.ITextBuffer; disposable: IDisposable } {
	let factory: model.ITextBufferFactory;
	if (typeof value === 'string') {
		factory = createTextBufferFactory(value);
	} else if (model.isITextSnapshot(value)) {
		factory = createTextBufferFactoryFromSnapshot(value);
	} else {
		factory = value;
	}
	return factory.create(defaultEOL);
}

let MODEL_ID = 0;

const LIMIT_FIND_COUNT = 999;
const LONG_LINE_BOUNDARY = 10000;

class TextModelSnapshot implements model.ITextSnapshot {

	private readonly _source: model.ITextSnapshot;
	private _eos: boolean;

	constructor(source: model.ITextSnapshot) {
		this._source = source;
		this._eos = false;
	}

	public read(): string | null {
		if (this._eos) {
			return null;
		}

		const result: string[] = [];
		let resultCnt = 0;
		let resultLength = 0;

		do {
			const tmp = this._source.read();

			if (tmp === null) {
				// end-of-stream
				this._eos = true;
				if (resultCnt === 0) {
					return null;
				} else {
					return result.join('');
				}
			}

			if (tmp.length > 0) {
				result[resultCnt++] = tmp;
				resultLength += tmp.length;
			}

			if (resultLength >= 64 * 1024) {
				return result.join('');
			}
		} while (true);
	}
}

const invalidFunc = () => { throw new Error(`Invalid change accessor`); };

const enum StringOffsetValidationType {
	/**
	 * Even allowed in surrogate pairs
	 */
	Relaxed = 0,
	/**
	 * Not allowed in surrogate pairs
	 */
	SurrogatePairs = 1,
}

export class TextModel extends Disposable implements model.ITextModel, IDecorationsTreesHost {

	static _MODEL_SYNC_LIMIT = 50 * 1024 * 1024; // 50 MB,  // used in tests
	private static readonly LARGE_FILE_SIZE_THRESHOLD = 20 * 1024 * 1024; // 20 MB;
	private static readonly LARGE_FILE_LINE_COUNT_THRESHOLD = 300 * 1000; // 300K lines
	private static readonly LARGE_FILE_HEAP_OPERATION_THRESHOLD = 256 * 1024 * 1024; // 256M characters, usually ~> 512MB memory usage

	public static DEFAULT_CREATION_OPTIONS: model.ITextModelCreationOptions = {
		isForSimpleWidget: false,
		tabSize: EDITOR_MODEL_DEFAULTS.tabSize,
		indentSize: EDITOR_MODEL_DEFAULTS.indentSize,
		insertSpaces: EDITOR_MODEL_DEFAULTS.insertSpaces,
		detectIndentation: false,
		defaultEOL: model.DefaultEndOfLine.LF,
		trimAutoWhitespace: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
		largeFileOptimizations: EDITOR_MODEL_DEFAULTS.largeFileOptimizations,
		bracketPairColorizationOptions: EDITOR_MODEL_DEFAULTS.bracketPairColorizationOptions,
	};

	public static resolveOptions(textBuffer: model.ITextBuffer, options: model.ITextModelCreationOptions): model.TextModelResolvedOptions {
		if (options.detectIndentation) {
			const guessedIndentation = guessIndentation(textBuffer, options.tabSize, options.insertSpaces);
			return new model.TextModelResolvedOptions({
				tabSize: guessedIndentation.tabSize,
				indentSize: 'tabSize', // TODO@Alex: guess indentSize independent of tabSize
				insertSpaces: guessedIndentation.insertSpaces,
				trimAutoWhitespace: options.trimAutoWhitespace,
				defaultEOL: options.defaultEOL,
				bracketPairColorizationOptions: options.bracketPairColorizationOptions,
			});
		}

		return new model.TextModelResolvedOptions(options);
	}

	//#region Events
	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onWillDispose: Event<void> = this._onWillDispose.event;

	private readonly _onDidChangeDecorations: DidChangeDecorationsEmitter = this._register(new DidChangeDecorationsEmitter((affectedInjectedTextLines, affectedLineHeights) => this.handleBeforeFireDecorationsChangedEvent(affectedInjectedTextLines, affectedLineHeights)));
	public readonly onDidChangeDecorations: Event<IModelDecorationsChangedEvent> = this._onDidChangeDecorations.event;

	public get onDidChangeLanguage() { return this._tokenizationTextModelPart.onDidChangeLanguage; }
	public get onDidChangeLanguageConfiguration() { return this._tokenizationTextModelPart.onDidChangeLanguageConfiguration; }
	public get onDidChangeTokens() { return this._tokenizationTextModelPart.onDidChangeTokens; }

	private readonly _onDidChangeOptions: Emitter<IModelOptionsChangedEvent> = this._register(new Emitter<IModelOptionsChangedEvent>());
	public readonly onDidChangeOptions: Event<IModelOptionsChangedEvent> = this._onDidChangeOptions.event;

	private readonly _onDidChangeAttached: Emitter<void> = this._register(new Emitter<void>());
	public readonly onDidChangeAttached: Event<void> = this._onDidChangeAttached.event;

	private readonly _onDidChangeInjectedText: Emitter<ModelInjectedTextChangedEvent> = this._register(new Emitter<ModelInjectedTextChangedEvent>());

	private readonly _onDidChangeLineHeight: Emitter<ModelLineHeightChangedEvent> = this._register(new Emitter<ModelLineHeightChangedEvent>());
	public readonly onDidChangeLineHeight: Event<ModelLineHeightChangedEvent> = this._onDidChangeLineHeight.event;

	private readonly _eventEmitter: DidChangeContentEmitter = this._register(new DidChangeContentEmitter());
	public onDidChangeContent(listener: (e: IModelContentChangedEvent) => void): IDisposable {
		return this._eventEmitter.slowEvent((e: InternalModelContentChangeEvent) => listener(e.contentChangedEvent));
	}
	public onDidChangeContentOrInjectedText(listener: (e: InternalModelContentChangeEvent | ModelInjectedTextChangedEvent) => void): IDisposable {
		return combinedDisposable(
			this._eventEmitter.fastEvent(e => listener(e)),
			this._onDidChangeInjectedText.event(e => listener(e))
		);
	}
	//#endregion

	public readonly id: string;
	public readonly isForSimpleWidget: boolean;
	private readonly _associatedResource: URI;
	private _attachedEditorCount: number;
	private _buffer: model.ITextBuffer;
	private _bufferDisposable: IDisposable;
	private _options: model.TextModelResolvedOptions;
	private readonly _languageSelectionListener = this._register(new MutableDisposable<IDisposable>());

	private _isDisposed: boolean;
	private __isDisposing: boolean;
	public _isDisposing(): boolean { return this.__isDisposing; }
	private _versionId: number;
	/**
	 * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
	 */
	private _alternativeVersionId: number;
	private _initialUndoRedoSnapshot: ResourceEditStackSnapshot | null;
	private readonly _isTooLargeForSyncing: boolean;
	private readonly _isTooLargeForTokenization: boolean;
	private readonly _isTooLargeForHeapOperation: boolean;

	//#region Editing
	private readonly _commandManager: EditStack;
	private _isUndoing: boolean;
	private _isRedoing: boolean;
	private _trimAutoWhitespaceLines: number[] | null;
	//#endregion

	//#region Decorations
	/**
	 * Used to workaround broken clients that might attempt using a decoration id generated by a different model.
	 * It is not globally unique in order to limit it to one character.
	 */
	private readonly _instanceId: string;
	private _deltaDecorationCallCnt: number = 0;
	private _lastDecorationId: number;
	private _decorations: { [decorationId: string]: IntervalNode };
	private _decorationsTree: DecorationsTrees;
	private readonly _decorationProvider: ColorizedBracketPairsDecorationProvider;
	//#endregion

	private readonly _tokenizationTextModelPart: TokenizationTextModelPart;
	public get tokenization(): ITokenizationTextModelPart { return this._tokenizationTextModelPart; }

	private readonly _bracketPairs: BracketPairsTextModelPart;
	public get bracketPairs(): IBracketPairsTextModelPart { return this._bracketPairs; }

	private readonly _guidesTextModelPart: GuidesTextModelPart;
	public get guides(): IGuidesTextModelPart { return this._guidesTextModelPart; }

	private readonly _attachedViews = new AttachedViews();

	constructor(
		source: string | model.ITextBufferFactory,
		languageIdOrSelection: string | ILanguageSelection,
		creationOptions: model.ITextModelCreationOptions,
		associatedResource: URI | null = null,
		@IUndoRedoService private readonly _undoRedoService: IUndoRedoService,
		@ILanguageService private readonly _languageService: ILanguageService,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService,
		@IInstantiationService private readonly instantiationService: IInstantiationService
	) {
		super();

		// Generate a new unique model id
		MODEL_ID++;
		this.id = '$model' + MODEL_ID;
		this.isForSimpleWidget = creationOptions.isForSimpleWidget;
		if (typeof associatedResource === 'undefined' || associatedResource === null) {
			this._associatedResource = URI.parse('inmemory://model/' + MODEL_ID);
		} else {
			this._associatedResource = associatedResource;
		}
		this._attachedEditorCount = 0;

		const { textBuffer, disposable } = createTextBuffer(source, creationOptions.defaultEOL);
		this._buffer = textBuffer;
		this._bufferDisposable = disposable;

		const bufferLineCount = this._buffer.getLineCount();
		const bufferTextLength = this._buffer.getValueLengthInRange(new Range(1, 1, bufferLineCount, this._buffer.getLineLength(bufferLineCount) + 1), model.EndOfLinePreference.TextDefined);

		// !!! Make a decision in the ctor and permanently respect this decision !!!
		// If a model is too large at construction time, it will never get tokenized,
		// under no circumstances.
		if (creationOptions.largeFileOptimizations) {
			this._isTooLargeForTokenization = (
				(bufferTextLength > TextModel.LARGE_FILE_SIZE_THRESHOLD)
				|| (bufferLineCount > TextModel.LARGE_FILE_LINE_COUNT_THRESHOLD)
			);

			this._isTooLargeForHeapOperation = bufferTextLength > TextModel.LARGE_FILE_HEAP_OPERATION_THRESHOLD;
		} else {
			this._isTooLargeForTokenization = false;
			this._isTooLargeForHeapOperation = false;
		}

		this._options = TextModel.resolveOptions(this._buffer, creationOptions);

		const languageId = (typeof languageIdOrSelection === 'string' ? languageIdOrSelection : languageIdOrSelection.languageId);
		if (typeof languageIdOrSelection !== 'string') {
			this._languageSelectionListener.value = languageIdOrSelection.onDidChange(() => this._setLanguage(languageIdOrSelection.languageId));
		}

		this._bracketPairs = this._register(new BracketPairsTextModelPart(this, this._languageConfigurationService));
		this._guidesTextModelPart = this._register(new GuidesTextModelPart(this, this._languageConfigurationService));
		this._decorationProvider = this._register(new ColorizedBracketPairsDecorationProvider(this));
		this._tokenizationTextModelPart = this.instantiationService.createInstance(TokenizationTextModelPart,
			this,
			this._bracketPairs,
			languageId,
			this._attachedViews
		);

		this._isTooLargeForSyncing = (bufferTextLength > TextModel._MODEL_SYNC_LIMIT);

		this._versionId = 1;
		this._alternativeVersionId = 1;
		this._initialUndoRedoSnapshot = null;

		this._isDisposed = false;
		this.__isDisposing = false;

		this._instanceId = strings.singleLetterHash(MODEL_ID);
		this._lastDecorationId = 0;
		this._decorations = Object.create(null);
		this._decorationsTree = new DecorationsTrees();

		this._commandManager = new EditStack(this, this._undoRedoService);
		this._isUndoing = false;
		this._isRedoing = false;
		this._trimAutoWhitespaceLines = null;


		this._register(this._decorationProvider.onDidChange(() => {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._onDidChangeDecorations.fire();
			this._onDidChangeDecorations.endDeferredEmit();
		}));

		this._languageService.requestRichLanguageFeatures(languageId);

		this._register(this._languageConfigurationService.onDidChange(e => {
			this._bracketPairs.handleLanguageConfigurationServiceChange(e);
			this._tokenizationTextModelPart.handleLanguageConfigurationServiceChange(e);
		}));
	}

	public override dispose(): void {
		this.__isDisposing = true;
		this._onWillDispose.fire();
		this._tokenizationTextModelPart.dispose();
		this._isDisposed = true;
		super.dispose();
		this._bufferDisposable.dispose();
		this.__isDisposing = false;
		// Manually release reference to previous text buffer to avoid large leaks
		// in case someone leaks a TextModel reference
		const emptyDisposedTextBuffer = new PieceTreeTextBuffer([], '', '\n', false, false, true, true);
		emptyDisposedTextBuffer.dispose();
		this._buffer = emptyDisposedTextBuffer;
		this._bufferDisposable = Disposable.None;
	}

	_hasListeners(): boolean {
		return (
			this._onWillDispose.hasListeners()
			|| this._onDidChangeDecorations.hasListeners()
			|| this._tokenizationTextModelPart._hasListeners()
			|| this._onDidChangeOptions.hasListeners()
			|| this._onDidChangeAttached.hasListeners()
			|| this._onDidChangeInjectedText.hasListeners()
			|| this._onDidChangeLineHeight.hasListeners()
			|| this._eventEmitter.hasListeners()
		);
	}

	private _assertNotDisposed(): void {
		if (this._isDisposed) {
			throw new BugIndicatingError('Model is disposed!');
		}
	}

	public equalsTextBuffer(other: model.ITextBuffer): boolean {
		this._assertNotDisposed();
		return this._buffer.equals(other);
	}

	public getTextBuffer(): model.ITextBuffer {
		this._assertNotDisposed();
		return this._buffer;
	}

	private _emitContentChangedEvent(rawChange: ModelRawContentChangedEvent, change: IModelContentChangedEvent): void {
		if (this.__isDisposing) {
			// Do not confuse listeners by emitting any event after disposing
			return;
		}
		this._tokenizationTextModelPart.handleDidChangeContent(change);
		this._bracketPairs.handleDidChangeContent(change);
		this._eventEmitter.fire(new InternalModelContentChangeEvent(rawChange, change));
	}

	public setValue(value: string | model.ITextSnapshot): void {
		this._assertNotDisposed();

		if (value === null || value === undefined) {
			throw illegalArgument();
		}

		const { textBuffer, disposable } = createTextBuffer(value, this._options.defaultEOL);
		this._setValueFromTextBuffer(textBuffer, disposable);
	}

	private _createContentChanged2(range: Range, rangeOffset: number, rangeLength: number, rangeEndPosition: Position, text: string, isUndoing: boolean, isRedoing: boolean, isFlush: boolean, isEolChange: boolean): IModelContentChangedEvent {
		return {
			changes: [{
				range: range,
				rangeOffset: rangeOffset,
				rangeLength: rangeLength,
				text: text,
			}],
			eol: this._buffer.getEOL(),
			isEolChange: isEolChange,
			versionId: this.getVersionId(),
			isUndoing: isUndoing,
			isRedoing: isRedoing,
			isFlush: isFlush
		};
	}

	private _setValueFromTextBuffer(textBuffer: model.ITextBuffer, textBufferDisposable: IDisposable): void {
		this._assertNotDisposed();
		const oldFullModelRange = this.getFullModelRange();
		const oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
		const endLineNumber = this.getLineCount();
		const endColumn = this.getLineMaxColumn(endLineNumber);

		this._buffer = textBuffer;
		this._bufferDisposable.dispose();
		this._bufferDisposable = textBufferDisposable;
		this._increaseVersionId();

		// Destroy all my decorations
		this._decorations = Object.create(null);
		this._decorationsTree = new DecorationsTrees();

		// Destroy my edit history and settings
		this._commandManager.clear();
		this._trimAutoWhitespaceLines = null;

		this._emitContentChangedEvent(
			new ModelRawContentChangedEvent(
				[
					new ModelRawFlush()
				],
				this._versionId,
				false,
				false
			),
			this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, new Position(endLineNumber, endColumn), this.getValue(), false, false, true, false)
		);
	}

	public setEOL(eol: model.EndOfLineSequence): void {
		this._assertNotDisposed();
		const newEOL = (eol === model.EndOfLineSequence.CRLF ? '\r\n' : '\n');
		if (this._buffer.getEOL() === newEOL) {
			// Nothing to do
			return;
		}

		const oldFullModelRange = this.getFullModelRange();
		const oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
		const endLineNumber = this.getLineCount();
		const endColumn = this.getLineMaxColumn(endLineNumber);

		this._onBeforeEOLChange();
		this._buffer.setEOL(newEOL);
		this._increaseVersionId();
		this._onAfterEOLChange();

		this._emitContentChangedEvent(
			new ModelRawContentChangedEvent(
				[
					new ModelRawEOLChanged()
				],
				this._versionId,
				false,
				false
			),
			this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, new Position(endLineNumber, endColumn), this.getValue(), false, false, false, true)
		);
	}

	private _onBeforeEOLChange(): void {
		// Ensure all decorations get their `range` set.
		this._decorationsTree.ensureAllNodesHaveRanges(this);
	}

	private _onAfterEOLChange(): void {
		// Transform back `range` to offsets
		const versionId = this.getVersionId();
		const allDecorations = this._decorationsTree.collectNodesPostOrder();
		for (let i = 0, len = allDecorations.length; i < len; i++) {
			const node = allDecorations[i];
			const range = node.range!; // the range is defined due to `_onBeforeEOLChange`

			const delta = node.cachedAbsoluteStart - node.start;

			const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
			const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);

			node.cachedAbsoluteStart = startOffset;
			node.cachedAbsoluteEnd = endOffset;
			node.cachedVersionId = versionId;

			node.start = startOffset - delta;
			node.end = endOffset - delta;

			recomputeMaxEnd(node);
		}
	}

	public onBeforeAttached(): model.IAttachedView {
		this._attachedEditorCount++;
		if (this._attachedEditorCount === 1) {
			this._tokenizationTextModelPart.handleDidChangeAttached();
			this._onDidChangeAttached.fire(undefined);
		}
		return this._attachedViews.attachView();
	}

	public onBeforeDetached(view: model.IAttachedView): void {
		this._attachedEditorCount--;
		if (this._attachedEditorCount === 0) {
			this._tokenizationTextModelPart.handleDidChangeAttached();
			this._onDidChangeAttached.fire(undefined);
		}
		this._attachedViews.detachView(view);
	}

	public isAttachedToEditor(): boolean {
		return this._attachedEditorCount > 0;
	}

	public getAttachedEditorCount(): number {
		return this._attachedEditorCount;
	}

	public isTooLargeForSyncing(): boolean {
		return this._isTooLargeForSyncing;
	}

	public isTooLargeForTokenization(): boolean {
		return this._isTooLargeForTokenization;
	}

	public isTooLargeForHeapOperation(): boolean {
		return this._isTooLargeForHeapOperation;
	}

	public isDisposed(): boolean {
		return this._isDisposed;
	}

	public isDominatedByLongLines(): boolean {
		this._assertNotDisposed();
		if (this.isTooLargeForTokenization()) {
			// Cannot word wrap huge files anyways, so it doesn't really matter
			return false;
		}
		let smallLineCharCount = 0;
		let longLineCharCount = 0;

		const lineCount = this._buffer.getLineCount();
		for (let lineNumber = 1; lineNumber <= lineCount; lineNumber++) {
			const lineLength = this._buffer.getLineLength(lineNumber);
			if (lineLength >= LONG_LINE_BOUNDARY) {
				longLineCharCount += lineLength;
			} else {
				smallLineCharCount += lineLength;
			}
		}

		return (longLineCharCount > smallLineCharCount);
	}

	public get uri(): URI {
		return this._associatedResource;
	}

	//#region Options

	public getOptions(): model.TextModelResolvedOptions {
		this._assertNotDisposed();
		return this._options;
	}

	public getFormattingOptions(): FormattingOptions {
		return {
			tabSize: this._options.indentSize,
			insertSpaces: this._options.insertSpaces
		};
	}

	public updateOptions(_newOpts: model.ITextModelUpdateOptions): void {
		this._assertNotDisposed();
		const tabSize = (typeof _newOpts.tabSize !== 'undefined') ? _newOpts.tabSize : this._options.tabSize;
		const indentSize = (typeof _newOpts.indentSize !== 'undefined') ? _newOpts.indentSize : this._options.originalIndentSize;
		const insertSpaces = (typeof _newOpts.insertSpaces !== 'undefined') ? _newOpts.insertSpaces : this._options.insertSpaces;
		const trimAutoWhitespace = (typeof _newOpts.trimAutoWhitespace !== 'undefined') ? _newOpts.trimAutoWhitespace : this._options.trimAutoWhitespace;
		const bracketPairColorizationOptions = (typeof _newOpts.bracketColorizationOptions !== 'undefined') ? _newOpts.bracketColorizationOptions : this._options.bracketPairColorizationOptions;

		const newOpts = new model.TextModelResolvedOptions({
			tabSize: tabSize,
			indentSize: indentSize,
			insertSpaces: insertSpaces,
			defaultEOL: this._options.defaultEOL,
			trimAutoWhitespace: trimAutoWhitespace,
			bracketPairColorizationOptions,
		});

		if (this._options.equals(newOpts)) {
			return;
		}

		const e = this._options.createChangeEvent(newOpts);
		this._options = newOpts;

		this._bracketPairs.handleDidChangeOptions(e);
		this._decorationProvider.handleDidChangeOptions(e);
		this._onDidChangeOptions.fire(e);
	}

	public detectIndentation(defaultInsertSpaces: boolean, defaultTabSize: number): void {
		this._assertNotDisposed();
		const guessedIndentation = guessIndentation(this._buffer, defaultTabSize, defaultInsertSpaces);
		this.updateOptions({
			insertSpaces: guessedIndentation.insertSpaces,
			tabSize: guessedIndentation.tabSize,
			indentSize: guessedIndentation.tabSize, // TODO@Alex: guess indentSize independent of tabSize
		});
	}

	public normalizeIndentation(str: string): string {
		this._assertNotDisposed();
		return normalizeIndentation(str, this._options.indentSize, this._options.insertSpaces);
	}

	//#endregion

	//#region Reading

	public getVersionId(): number {
		this._assertNotDisposed();
		return this._versionId;
	}

	public mightContainRTL(): boolean {
		return this._buffer.mightContainRTL();
	}

	public mightContainUnusualLineTerminators(): boolean {
		return this._buffer.mightContainUnusualLineTerminators();
	}

	public removeUnusualLineTerminators(selections: Selection[] | null = null): void {
		const matches = this.findMatches(strings.UNUSUAL_LINE_TERMINATORS.source, false, true, false, null, false, Constants.MAX_SAFE_SMALL_INTEGER);
		this._buffer.resetMightContainUnusualLineTerminators();
		this.pushEditOperations(selections, matches.map(m => ({ range: m.range, text: null })), () => null);
	}

	public mightContainNonBasicASCII(): boolean {
		return this._buffer.mightContainNonBasicASCII();
	}

	public getAlternativeVersionId(): number {
		this._assertNotDisposed();
		return this._alternativeVersionId;
	}

	public getInitialUndoRedoSnapshot(): ResourceEditStackSnapshot | null {
		this._assertNotDisposed();
		return this._initialUndoRedoSnapshot;
	}

	public getOffsetAt(rawPosition: IPosition): number {
		this._assertNotDisposed();
		const position = this._validatePosition(rawPosition.lineNumber, rawPosition.column, StringOffsetValidationType.Relaxed);
		return this._buffer.getOffsetAt(position.lineNumber, position.column);
	}

	public getPositionAt(rawOffset: number): Position {
		this._assertNotDisposed();
		const offset = (Math.min(this._buffer.getLength(), Math.max(0, rawOffset)));
		return this._buffer.getPositionAt(offset);
	}

	private _increaseVersionId(): void {
		this._versionId = this._versionId + 1;
		this._alternativeVersionId = this._versionId;
	}

	public _overwriteVersionId(versionId: number): void {
		this._versionId = versionId;
	}

	public _overwriteAlternativeVersionId(newAlternativeVersionId: number): void {
		this._alternativeVersionId = newAlternativeVersionId;
	}

	public _overwriteInitialUndoRedoSnapshot(newInitialUndoRedoSnapshot: ResourceEditStackSnapshot | null): void {
		this._initialUndoRedoSnapshot = newInitialUndoRedoSnapshot;
	}

	public getValue(eol?: model.EndOfLinePreference, preserveBOM: boolean = false): string {
		this._assertNotDisposed();
		if (this.isTooLargeForHeapOperation()) {
			throw new BugIndicatingError('Operation would exceed heap memory limits');
		}

		const fullModelRange = this.getFullModelRange();
		const fullModelValue = this.getValueInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._buffer.getBOM() + fullModelValue;
		}

		return fullModelValue;
	}

	public createSnapshot(preserveBOM: boolean = false): model.ITextSnapshot {
		return new TextModelSnapshot(this._buffer.createSnapshot(preserveBOM));
	}

	public getValueLength(eol?: model.EndOfLinePreference, preserveBOM: boolean = false): number {
		this._assertNotDisposed();
		const fullModelRange = this.getFullModelRange();
		const fullModelValue = this.getValueLengthInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._buffer.getBOM().length + fullModelValue;
		}

		return fullModelValue;
	}

	public getValueInRange(rawRange: IRange, eol: model.EndOfLinePreference = model.EndOfLinePreference.TextDefined): string {
		this._assertNotDisposed();
		return this._buffer.getValueInRange(this.validateRange(rawRange), eol);
	}

	public getValueLengthInRange(rawRange: IRange, eol: model.EndOfLinePreference = model.EndOfLinePreference.TextDefined): number {
		this._assertNotDisposed();
		return this._buffer.getValueLengthInRange(this.validateRange(rawRange), eol);
	}

	public getCharacterCountInRange(rawRange: IRange, eol: model.EndOfLinePreference = model.EndOfLinePreference.TextDefined): number {
		this._assertNotDisposed();
		return this._buffer.getCharacterCountInRange(this.validateRange(rawRange), eol);
	}

	public getLineCount(): number {
		this._assertNotDisposed();
		return this._buffer.getLineCount();
	}

	public getLineContent(lineNumber: number): string {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new BugIndicatingError('Illegal value for lineNumber');
		}

		return this._buffer.getLineContent(lineNumber);
	}

	public getLineLength(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new BugIndicatingError('Illegal value for lineNumber');
		}

		return this._buffer.getLineLength(lineNumber);
	}

	public getLinesContent(): string[] {
		this._assertNotDisposed();
		if (this.isTooLargeForHeapOperation()) {
			throw new BugIndicatingError('Operation would exceed heap memory limits');
		}

		return this._buffer.getLinesContent();
	}

	public getEOL(): string {
		this._assertNotDisposed();
		return this._buffer.getEOL();
	}

	public getEndOfLineSequence(): model.EndOfLineSequence {
		this._assertNotDisposed();
		return (
			this._buffer.getEOL() === '\n'
				? model.EndOfLineSequence.LF
				: model.EndOfLineSequence.CRLF
		);
	}

	public getLineMinColumn(lineNumber: number): number {
		this._assertNotDisposed();
		return 1;
	}

	public getLineMaxColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new BugIndicatingError('Illegal value for lineNumber');
		}
		return this._buffer.getLineLength(lineNumber) + 1;
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new BugIndicatingError('Illegal value for lineNumber');
		}
		return this._buffer.getLineFirstNonWhitespaceColumn(lineNumber);
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new BugIndicatingError('Illegal value for lineNumber');
		}
		return this._buffer.getLineLastNonWhitespaceColumn(lineNumber);
	}

	/**
	 * Validates `range` is within buffer bounds, but allows it to sit in between surrogate pairs, etc.
	 * Will try to not allocate if possible.
	 */
	public _validateRangeRelaxedNoAllocations(range: IRange): Range {
		const linesCount = this._buffer.getLineCount();

		const initialStartLineNumber = range.startLineNumber;
		const initialStartColumn = range.startColumn;
		let startLineNumber = Math.floor((typeof initialStartLineNumber === 'number' && !isNaN(initialStartLineNumber)) ? initialStartLineNumber : 1);
		let startColumn = Math.floor((typeof initialStartColumn === 'number' && !isNaN(initialStartColumn)) ? initialStartColumn : 1);

		if (startLineNumber < 1) {
			startLineNumber = 1;
			startColumn = 1;
		} else if (startLineNumber > linesCount) {
			startLineNumber = linesCount;
			startColumn = this.getLineMaxColumn(startLineNumber);
		} else {
			if (startColumn <= 1) {
				startColumn = 1;
			} else {
				const maxColumn = this.getLineMaxColumn(startLineNumber);
				if (startColumn >= maxColumn) {
					startColumn = maxColumn;
				}
			}
		}

		const initialEndLineNumber = range.endLineNumber;
		const initialEndColumn = range.endColumn;
		let endLineNumber = Math.floor((typeof initialEndLineNumber === 'number' && !isNaN(initialEndLineNumber)) ? initialEndLineNumber : 1);
		let endColumn = Math.floor((typeof initialEndColumn === 'number' && !isNaN(initialEndColumn)) ? initialEndColumn : 1);

		if (endLineNumber < 1) {
			endLineNumber = 1;
			endColumn = 1;
		} else if (endLineNumber > linesCount) {
			endLineNumber = linesCount;
			endColumn = this.getLineMaxColumn(endLineNumber);
		} else {
			if (endColumn <= 1) {
				endColumn = 1;
			} else {
				const maxColumn = this.getLineMaxColumn(endLineNumber);
				if (endColumn >= maxColumn) {
					endColumn = maxColumn;
				}
			}
		}

		if (
			initialStartLineNumber === startLineNumber
			&& initialStartColumn === startColumn
			&& initialEndLineNumber === endLineNumber
			&& initialEndColumn === endColumn
			&& range instanceof Range
			&& !(range instanceof Selection)
		) {
			return range;
		}

		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}

	private _isValidPosition(lineNumber: number, column: number, validationType: StringOffsetValidationType): boolean {
		if (typeof lineNumber !== 'number' || typeof column !== 'number') {
			return false;
		}

		if (isNaN(lineNumber) || isNaN(column)) {
			return false;
		}

		if (lineNumber < 1 || column < 1) {
			return false;
		}

		if ((lineNumber | 0) !== lineNumber || (column | 0) !== column) {
			return false;
		}

		const lineCount = this._buffer.getLineCount();
		if (lineNumber > lineCount) {
			return false;
		}

		if (column === 1) {
			return true;
		}

		const maxColumn = this.getLineMaxColumn(lineNumber);
		if (column > maxColumn) {
			return false;
		}

		if (validationType === StringOffsetValidationType.SurrogatePairs) {
			// !!At this point, column > 1
			const charCodeBefore = this._buffer.getLineCharCode(lineNumber, column - 2);
			if (strings.isHighSurrogate(charCodeBefore)) {
				return false;
			}
		}

		return true;
	}

	private _validatePosition(_lineNumber: number, _column: number, validationType: StringOffsetValidationType): Position {
		const lineNumber = Math.floor((typeof _lineNumber === 'number' && !isNaN(_lineNumber)) ? _lineNumber : 1);
		const column = Math.floor((typeof _column === 'number' && !isNaN(_column)) ? _column : 1);
		const lineCount = this._buffer.getLineCount();

		if (lineNumber < 1) {
			return new Position(1, 1);
		}

		if (lineNumber > lineCount) {
			return new Position(lineCount, this.getLineMaxColumn(lineCount));
		}

		if (column <= 1) {
			return new Position(lineNumber, 1);
		}

		const maxColumn = this.getLineMaxColumn(lineNumber);
		if (column >= maxColumn) {
			return new Position(lineNumber, maxColumn);
		}

		if (validationType === StringOffsetValidationType.SurrogatePairs) {
			// If the position would end up in the middle of a high-low surrogate pair,
			// we move it to before the pair
			// !!At this point, column > 1
			const charCodeBefore = this._buffer.getLineCharCode(lineNumber, column - 2);
			if (strings.isHighSurrogate(charCodeBefore)) {
				return new Position(lineNumber, column - 1);
			}
		}

		return new Position(lineNumber, column);
	}

	public validatePosition(position: IPosition): Position {
		const validationType = StringOffsetValidationType.SurrogatePairs;
		this._assertNotDisposed();

		// Avoid object allocation and cover most likely case
		if (position instanceof Position) {
			if (this._isValidPosition(position.lineNumber, position.column, validationType)) {
				return position;
			}
		}

		return this._validatePosition(position.lineNumber, position.column, validationType);
	}

	public isValidRange(range: Range): boolean {
		return this._isValidRange(range, StringOffsetValidationType.SurrogatePairs);
	}

	private _isValidRange(range: Range, validationType: StringOffsetValidationType): boolean {
		const startLineNumber = range.startLineNumber;
		const startColumn = range.startColumn;
		const endLineNumber = range.endLineNumber;
		const endColumn = range.endColumn;

		if (!this._isValidPosition(startLineNumber, startColumn, StringOffsetValidationType.Relaxed)) {
			return false;
		}
		if (!this._isValidPosition(endLineNumber, endColumn, StringOffsetValidationType.Relaxed)) {
			return false;
		}

		if (validationType === StringOffsetValidationType.SurrogatePairs) {
			const charCodeBeforeStart = (startColumn > 1 ? this._buffer.getLineCharCode(startLineNumber, startColumn - 2) : 0);
			const charCodeBeforeEnd = (endColumn > 1 && endColumn <= this._buffer.getLineLength(endLineNumber) ? this._buffer.getLineCharCode(endLineNumber, endColumn - 2) : 0);

			const startInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeStart);
			const endInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeEnd);

			if (!startInsideSurrogatePair && !endInsideSurrogatePair) {
				return true;
			}
			return false;
		}

		return true;
	}

	public validateRange(_range: IRange): Range {
		const validationType = StringOffsetValidationType.SurrogatePairs;
		this._assertNotDisposed();

		// Avoid object allocation and cover most likely case
		if ((_range instanceof Range) && !(_range instanceof Selection)) {
			if (this._isValidRange(_range, validationType)) {
				return _range;
			}
		}

		const start = this._validatePosition(_range.startLineNumber, _range.startColumn, StringOffsetValidationType.Relaxed);
		const end = this._validatePosition(_range.endLineNumber, _range.endColumn, StringOffsetValidationType.Relaxed);

		const startLineNumber = start.lineNumber;
		const startColumn = start.column;
		const endLineNumber = end.lineNumber;
		const endColumn = end.column;

		if (validationType === StringOffsetValidationType.SurrogatePairs) {
			const charCodeBeforeStart = (startColumn > 1 ? this._buffer.getLineCharCode(startLineNumber, startColumn - 2) : 0);
			const charCodeBeforeEnd = (endColumn > 1 && endColumn <= this._buffer.getLineLength(endLineNumber) ? this._buffer.getLineCharCode(endLineNumber, endColumn - 2) : 0);

			const startInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeStart);
			const endInsideSurrogatePair = strings.isHighSurrogate(charCodeBeforeEnd);

			if (!startInsideSurrogatePair && !endInsideSurrogatePair) {
				return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
			}

			if (startLineNumber === endLineNumber && startColumn === endColumn) {
				// do not expand a collapsed range, simply move it to a valid location
				return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn - 1);
			}

			if (startInsideSurrogatePair && endInsideSurrogatePair) {
				// expand range at both ends
				return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn + 1);
			}

			if (startInsideSurrogatePair) {
				// only expand range at the start
				return new Range(startLineNumber, startColumn - 1, endLineNumber, endColumn);
			}

			// only expand range at the end
			return new Range(startLineNumber, startColumn, endLineNumber, endColumn + 1);
		}

		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}

	public modifyPosition(rawPosition: IPosition, offset: number): Position {
		this._assertNotDisposed();
		const candidate = this.getOffsetAt(rawPosition) + offset;
		return this.getPositionAt(Math.min(this._buffer.getLength(), Math.max(0, candidate)));
	}

	public getFullModelRange(): Range {
		this._assertNotDisposed();
		const lineCount = this.getLineCount();
		return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
	}

	private findMatchesLineByLine(searchRange: Range, searchData: model.SearchData, captureMatches: boolean, limitResultCount: number): model.FindMatch[] {
		return this._buffer.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
	}

	public findMatches(searchString: string, rawSearchScope: any, isRegex: boolean, matchCase: boolean, wordSeparators: string | null, captureMatches: boolean, limitResultCount: number = LIMIT_FIND_COUNT): model.FindMatch[] {
		this._assertNotDisposed();

		let searchRanges: Range[] | null = null;

		if (rawSearchScope !== null) {
			if (!Array.isArray(rawSearchScope)) {
				rawSearchScope = [rawSearchScope];
			}

			if (rawSearchScope.every((searchScope: Range) => Range.isIRange(searchScope))) {
				searchRanges = rawSearchScope.map((searchScope: Range) => this.validateRange(searchScope));
			}
		}

		if (searchRanges === null) {
			searchRanges = [this.getFullModelRange()];
		}

		searchRanges = searchRanges.sort((d1, d2) => d1.startLineNumber - d2.startLineNumber || d1.startColumn - d2.startColumn);

		const uniqueSearchRanges: Range[] = [];
		uniqueSearchRanges.push(searchRanges.reduce((prev, curr) => {
			if (Range.areIntersecting(prev, curr)) {
				return prev.plusRange(curr);
			}

			uniqueSearchRanges.push(prev);
			return curr;
		}));

		let matchMapper: (value: Range, index: number, array: Range[]) => model.FindMatch[];
		if (!isRegex && searchString.indexOf('\n') < 0) {
			// not regex, not multi line
			const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
			const searchData = searchParams.parseSearchRequest();

			if (!searchData) {
				return [];
			}

			matchMapper = (searchRange: Range) => this.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
		} else {
			matchMapper = (searchRange: Range) => TextModelSearch.findMatches(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchRange, captureMatches, limitResultCount);
		}

		return uniqueSearchRanges.map(matchMapper).reduce((arr, matches: model.FindMatch[]) => arr.concat(matches), []);
	}

	public findNextMatch(searchString: string, rawSearchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean): model.FindMatch | null {
		this._assertNotDisposed();
		const searchStart = this.validatePosition(rawSearchStart);

		if (!isRegex && searchString.indexOf('\n') < 0) {
			const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
			const searchData = searchParams.parseSearchRequest();
			if (!searchData) {
				return null;
			}

			const lineCount = this.getLineCount();
			let searchRange = new Range(searchStart.lineNumber, searchStart.column, lineCount, this.getLineMaxColumn(lineCount));
			let ret = this.findMatchesLineByLine(searchRange, searchData, captureMatches, 1);
			TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
			if (ret.length > 0) {
				return ret[0];
			}

			searchRange = new Range(1, 1, searchStart.lineNumber, this.getLineMaxColumn(searchStart.lineNumber));
			ret = this.findMatchesLineByLine(searchRange, searchData, captureMatches, 1);

			if (ret.length > 0) {
				return ret[0];
			}

			return null;
		}

		return TextModelSearch.findNextMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
	}

	public findPreviousMatch(searchString: string, rawSearchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean): model.FindMatch | null {
		this._assertNotDisposed();
		const searchStart = this.validatePosition(rawSearchStart);
		return TextModelSearch.findPreviousMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
	}

	//#endregion

	//#region Editing

	public pushStackElement(): void {
		this._commandManager.pushStackElement();
	}

	public popStackElement(): void {
		this._commandManager.popStackElement();
	}

	public pushEOL(eol: model.EndOfLineSequence): void {
		const currentEOL = (this.getEOL() === '\n' ? model.EndOfLineSequence.LF : model.EndOfLineSequence.CRLF);
		if (currentEOL === eol) {
			return;
		}
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			if (this._initialUndoRedoSnapshot === null) {
				this._initialUndoRedoSnapshot = this._undoRedoService.createSnapshot(this.uri);
			}
			this._commandManager.pushEOL(eol);
		} finally {
			this._eventEmitter.endDeferredEmit();
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private _validateEditOperation(rawOperation: model.IIdentifiedSingleEditOperation): model.ValidAnnotatedEditOperation {
		if (rawOperation instanceof model.ValidAnnotatedEditOperation) {
			return rawOperation;
		}
		return new model.ValidAnnotatedEditOperation(
			rawOperation.identifier || null,
			this.validateRange(rawOperation.range),
			rawOperation.text,
			rawOperation.forceMoveMarkers || false,
			rawOperation.isAutoWhitespaceEdit || false,
			rawOperation._isTracked || false
		);
	}

	private _validateEditOperations(rawOperations: readonly model.IIdentifiedSingleEditOperation[]): model.ValidAnnotatedEditOperation[] {
		const result: model.ValidAnnotatedEditOperation[] = [];
		for (let i = 0, len = rawOperations.length; i < len; i++) {
			result[i] = this._validateEditOperation(rawOperations[i]);
		}
		return result;
	}

	public pushEditOperations(beforeCursorState: Selection[] | null, editOperations: model.IIdentifiedSingleEditOperation[], cursorStateComputer: model.ICursorStateComputer | null, group?: UndoRedoGroup): Selection[] | null {
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			return this._pushEditOperations(beforeCursorState, this._validateEditOperations(editOperations), cursorStateComputer, group);
		} finally {
			this._eventEmitter.endDeferredEmit();
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private _pushEditOperations(beforeCursorState: Selection[] | null, editOperations: model.ValidAnnotatedEditOperation[], cursorStateComputer: model.ICursorStateComputer | null, group?: UndoRedoGroup): Selection[] | null {
		if (this._options.trimAutoWhitespace && this._trimAutoWhitespaceLines) {
			// Go through each saved line number and insert a trim whitespace edit
			// if it is safe to do so (no conflicts with other edits).

			const incomingEdits = editOperations.map((op) => {
				return {
					range: this.validateRange(op.range),
					text: op.text
				};
			});

			// Sometimes, auto-formatters change ranges automatically which can cause undesired auto whitespace trimming near the cursor
			// We'll use the following heuristic: if the edits occur near the cursor, then it's ok to trim auto whitespace
			let editsAreNearCursors = true;
			if (beforeCursorState) {
				for (let i = 0, len = beforeCursorState.length; i < len; i++) {
					const sel = beforeCursorState[i];
					let foundEditNearSel = false;
					for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
						const editRange = incomingEdits[j].range;
						const selIsAbove = editRange.startLineNumber > sel.endLineNumber;
						const selIsBelow = sel.startLineNumber > editRange.endLineNumber;
						if (!selIsAbove && !selIsBelow) {
							foundEditNearSel = true;
							break;
						}
					}
					if (!foundEditNearSel) {
						editsAreNearCursors = false;
						break;
					}
				}
			}

			if (editsAreNearCursors) {
				for (let i = 0, len = this._trimAutoWhitespaceLines.length; i < len; i++) {
					const trimLineNumber = this._trimAutoWhitespaceLines[i];
					const maxLineColumn = this.getLineMaxColumn(trimLineNumber);

					let allowTrimLine = true;
					for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
						const editRange = incomingEdits[j].range;
						const editText = incomingEdits[j].text;

						if (trimLineNumber < editRange.startLineNumber || trimLineNumber > editRange.endLineNumber) {
							// `trimLine` is completely outside this edit
							continue;
						}

						// At this point:
						//   editRange.startLineNumber <= trimLine <= editRange.endLineNumber

						if (
							trimLineNumber === editRange.startLineNumber && editRange.startColumn === maxLineColumn
							&& editRange.isEmpty() && editText && editText.length > 0 && editText.charAt(0) === '\n'
						) {
							// This edit inserts a new line (and maybe other text) after `trimLine`
							continue;
						}

						if (
							trimLineNumber === editRange.startLineNumber && editRange.startColumn === 1
							&& editRange.isEmpty() && editText && editText.length > 0 && editText.charAt(editText.length - 1) === '\n'
						) {
							// This edit inserts a new line (and maybe other text) before `trimLine`
							continue;
						}

						// Looks like we can't trim this line as it would interfere with an incoming edit
						allowTrimLine = false;
						break;
					}

					if (allowTrimLine) {
						const trimRange = new Range(trimLineNumber, 1, trimLineNumber, maxLineColumn);
						editOperations.push(new model.ValidAnnotatedEditOperation(null, trimRange, null, false, false, false));
					}

				}
			}

			this._trimAutoWhitespaceLines = null;
		}
		if (this._initialUndoRedoSnapshot === null) {
			this._initialUndoRedoSnapshot = this._undoRedoService.createSnapshot(this.uri);
		}
		return this._commandManager.pushEditOperation(beforeCursorState, editOperations, cursorStateComputer, group);
	}

	_applyUndo(changes: TextChange[], eol: model.EndOfLineSequence, resultingAlternativeVersionId: number, resultingSelection: Selection[] | null): void {
		const edits = changes.map<ISingleEditOperation>((change) => {
			const rangeStart = this.getPositionAt(change.newPosition);
			const rangeEnd = this.getPositionAt(change.newEnd);
			return {
				range: new Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
				text: change.oldText
			};
		});
		this._applyUndoRedoEdits(edits, eol, true, false, resultingAlternativeVersionId, resultingSelection);
	}

	_applyRedo(changes: TextChange[], eol: model.EndOfLineSequence, resultingAlternativeVersionId: number, resultingSelection: Selection[] | null): void {
		const edits = changes.map<ISingleEditOperation>((change) => {
			const rangeStart = this.getPositionAt(change.oldPosition);
			const rangeEnd = this.getPositionAt(change.oldEnd);
			return {
				range: new Range(rangeStart.lineNumber, rangeStart.column, rangeEnd.lineNumber, rangeEnd.column),
				text: change.newText
			};
		});
		this._applyUndoRedoEdits(edits, eol, false, true, resultingAlternativeVersionId, resultingSelection);
	}

	private _applyUndoRedoEdits(edits: ISingleEditOperation[], eol: model.EndOfLineSequence, isUndoing: boolean, isRedoing: boolean, resultingAlternativeVersionId: number, resultingSelection: Selection[] | null): void {
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			this._isUndoing = isUndoing;
			this._isRedoing = isRedoing;
			this.applyEdits(edits, false);
			this.setEOL(eol);
			this._overwriteAlternativeVersionId(resultingAlternativeVersionId);
		} finally {
			this._isUndoing = false;
			this._isRedoing = false;
			this._eventEmitter.endDeferredEmit(resultingSelection);
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	public applyEdits(operations: readonly model.IIdentifiedSingleEditOperation[]): void;
	public applyEdits(operations: readonly model.IIdentifiedSingleEditOperation[], computeUndoEdits: false): void;
	public applyEdits(operations: readonly model.IIdentifiedSingleEditOperation[], computeUndoEdits: true): model.IValidEditOperation[];
	public applyEdits(rawOperations: readonly model.IIdentifiedSingleEditOperation[], computeUndoEdits: boolean = false): void | model.IValidEditOperation[] {
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			const operations = this._validateEditOperations(rawOperations);
			return this._doApplyEdits(operations, computeUndoEdits);
		} finally {
			this._eventEmitter.endDeferredEmit();
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private _doApplyEdits(rawOperations: model.ValidAnnotatedEditOperation[], computeUndoEdits: boolean): void | model.IValidEditOperation[] {

		const oldLineCount = this._buffer.getLineCount();
		const result = this._buffer.applyEdits(rawOperations, this._options.trimAutoWhitespace, computeUndoEdits);
		const newLineCount = this._buffer.getLineCount();

		const contentChanges = result.changes;
		this._trimAutoWhitespaceLines = result.trimAutoWhitespaceLineNumbers;

		if (contentChanges.length !== 0) {
			// We do a first pass to update decorations
			// because we want to read decorations in the second pass
			// where we will emit content change events
			// and we want to read the final decorations
			for (let i = 0, len = contentChanges.length; i < len; i++) {
				const change = contentChanges[i];
				this._decorationsTree.acceptReplace(change.rangeOffset, change.rangeLength, change.text.length, change.forceMoveMarkers);
			}

			const rawContentChanges: ModelRawChange[] = [];

			this._increaseVersionId();

			let lineCount = oldLineCount;
			for (let i = 0, len = contentChanges.length; i < len; i++) {
				const change = contentChanges[i];
				const [eolCount] = countEOL(change.text);
				this._onDidChangeDecorations.fire();

				const startLineNumber = change.range.startLineNumber;
				const endLineNumber = change.range.endLineNumber;

				const deletingLinesCnt = endLineNumber - startLineNumber;
				const insertingLinesCnt = eolCount;
				const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);

				const changeLineCountDelta = (insertingLinesCnt - deletingLinesCnt);

				const currentEditStartLineNumber = newLineCount - lineCount - changeLineCountDelta + startLineNumber;
				const firstEditLineNumber = currentEditStartLineNumber;
				const lastInsertedLineNumber = currentEditStartLineNumber + insertingLinesCnt;

				const decorationsWithInjectedTextInEditedRange = this._decorationsTree.getInjectedTextInInterval(
					this,
					this.getOffsetAt(new Position(firstEditLineNumber, 1)),
					this.getOffsetAt(new Position(lastInsertedLineNumber, this.getLineMaxColumn(lastInsertedLineNumber))),
					0
				);


				const injectedTextInEditedRange = LineInjectedText.fromDecorations(decorationsWithInjectedTextInEditedRange);
				const injectedTextInEditedRangeQueue = new ArrayQueue(injectedTextInEditedRange);

				for (let j = editingLinesCnt; j >= 0; j--) {
					const editLineNumber = startLineNumber + j;
					const currentEditLineNumber = currentEditStartLineNumber + j;

					injectedTextInEditedRangeQueue.takeFromEndWhile(r => r.lineNumber > currentEditLineNumber);
					const decorationsInCurrentLine = injectedTextInEditedRangeQueue.takeFromEndWhile(r => r.lineNumber === currentEditLineNumber);

					rawContentChanges.push(
						new ModelRawLineChanged(
							editLineNumber,
							this.getLineContent(currentEditLineNumber),
							decorationsInCurrentLine
						));
				}

				if (editingLinesCnt < deletingLinesCnt) {
					// Must delete some lines
					const spliceStartLineNumber = startLineNumber + editingLinesCnt;
					rawContentChanges.push(new ModelRawLinesDeleted(spliceStartLineNumber + 1, endLineNumber));
				}

				if (editingLinesCnt < insertingLinesCnt) {
					const injectedTextInEditedRangeQueue = new ArrayQueue(injectedTextInEditedRange);
					// Must insert some lines
					const spliceLineNumber = startLineNumber + editingLinesCnt;
					const cnt = insertingLinesCnt - editingLinesCnt;
					const fromLineNumber = newLineCount - lineCount - cnt + spliceLineNumber + 1;
					const injectedTexts: (LineInjectedText[] | null)[] = [];
					const newLines: string[] = [];
					for (let i = 0; i < cnt; i++) {
						const lineNumber = fromLineNumber + i;
						newLines[i] = this.getLineContent(lineNumber);

						injectedTextInEditedRangeQueue.takeWhile(r => r.lineNumber < lineNumber);
						injectedTexts[i] = injectedTextInEditedRangeQueue.takeWhile(r => r.lineNumber === lineNumber);
					}

					rawContentChanges.push(
						new ModelRawLinesInserted(
							spliceLineNumber + 1,
							startLineNumber + insertingLinesCnt,
							newLines,
							injectedTexts
						)
					);
				}

				lineCount += changeLineCountDelta;
			}

			this._emitContentChangedEvent(
				new ModelRawContentChangedEvent(
					rawContentChanges,
					this.getVersionId(),
					this._isUndoing,
					this._isRedoing
				),
				{
					changes: contentChanges,
					eol: this._buffer.getEOL(),
					isEolChange: false,
					versionId: this.getVersionId(),
					isUndoing: this._isUndoing,
					isRedoing: this._isRedoing,
					isFlush: false
				}
			);
		}

		return (result.reverseEdits === null ? undefined : result.reverseEdits);
	}

	public undo(): void | Promise<void> {
		return this._undoRedoService.undo(this.uri);
	}

	public canUndo(): boolean {
		return this._undoRedoService.canUndo(this.uri);
	}

	public redo(): void | Promise<void> {
		return this._undoRedoService.redo(this.uri);
	}

	public canRedo(): boolean {
		return this._undoRedoService.canRedo(this.uri);
	}

	//#endregion

	//#region Decorations

	private handleBeforeFireDecorationsChangedEvent(affectedInjectedTextLines: Set<number> | null, affectedLineHeights: Set<LineHeightChangingDecoration> | null): void {
		// This is called before the decoration changed event is fired.

		if (affectedInjectedTextLines && affectedInjectedTextLines.size > 0) {
			const affectedLines = Array.from(affectedInjectedTextLines);
			const lineChangeEvents = affectedLines.map(lineNumber => new ModelRawLineChanged(lineNumber, this.getLineContent(lineNumber), this._getInjectedTextInLine(lineNumber)));
			this._onDidChangeInjectedText.fire(new ModelInjectedTextChangedEvent(lineChangeEvents));
		}
		if (affectedLineHeights && affectedLineHeights.size > 0) {
			const affectedLines = Array.from(affectedLineHeights);
			const lineHeightChangeEvent = affectedLines.map(specialLineHeightChange => new ModelLineHeightChanged(specialLineHeightChange.ownerId, specialLineHeightChange.decorationId, specialLineHeightChange.lineNumber, specialLineHeightChange.lineHeight));
			this._onDidChangeLineHeight.fire(new ModelLineHeightChangedEvent(lineHeightChangeEvent));
		}
	}

	public changeDecorations<T>(callback: (changeAccessor: model.IModelDecorationsChangeAccessor) => T, ownerId: number = 0): T | null {
		this._assertNotDisposed();

		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			return this._changeDecorations(ownerId, callback);
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private _changeDecorations<T>(ownerId: number, callback: (changeAccessor: model.IModelDecorationsChangeAccessor) => T): T | null {
		const changeAccessor: model.IModelDecorationsChangeAccessor = {
			addDecoration: (range: IRange, options: model.IModelDecorationOptions): string => {
				return this._deltaDecorationsImpl(ownerId, [], [{ range: range, options: options }])[0];
			},
			changeDecoration: (id: string, newRange: IRange): void => {
				this._changeDecorationImpl(ownerId, id, newRange);
			},
			changeDecorationOptions: (id: string, options: model.IModelDecorationOptions) => {
				this._changeDecorationOptionsImpl(ownerId, id, _normalizeOptions(options));
			},
			removeDecoration: (id: string): void => {
				this._deltaDecorationsImpl(ownerId, [id], []);
			},
			deltaDecorations: (oldDecorations: string[], newDecorations: model.IModelDeltaDecoration[]): string[] => {
				if (oldDecorations.length === 0 && newDecorations.length === 0) {
					// nothing to do
					return [];
				}
				return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
			}
		};
		let result: T | null = null;
		try {
			result = callback(changeAccessor);
		} catch (e) {
			onUnexpectedError(e);
		}
		// Invalidate change accessor
		changeAccessor.addDecoration = invalidFunc;
		changeAccessor.changeDecoration = invalidFunc;
		changeAccessor.changeDecorationOptions = invalidFunc;
		changeAccessor.removeDecoration = invalidFunc;
		changeAccessor.deltaDecorations = invalidFunc;
		return result;
	}

	public deltaDecorations(oldDecorations: string[], newDecorations: model.IModelDeltaDecoration[], ownerId: number = 0): string[] {
		this._assertNotDisposed();
		if (!oldDecorations) {
			oldDecorations = [];
		}
		if (oldDecorations.length === 0 && newDecorations.length === 0) {
			// nothing to do
			return [];
		}

		try {
			this._deltaDecorationCallCnt++;
			if (this._deltaDecorationCallCnt > 1) {
				console.warn(`Invoking deltaDecorations recursively could lead to leaking decorations.`);
				onUnexpectedError(new Error(`Invoking deltaDecorations recursively could lead to leaking decorations.`));
			}
			this._onDidChangeDecorations.beginDeferredEmit();
			return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
			this._deltaDecorationCallCnt--;
		}
	}

	_getTrackedRange(id: string): Range | null {
		return this.getDecorationRange(id);
	}

	_setTrackedRange(id: string | null, newRange: null, newStickiness: model.TrackedRangeStickiness): null;
	_setTrackedRange(id: string | null, newRange: Range, newStickiness: model.TrackedRangeStickiness): string;
	_setTrackedRange(id: string | null, newRange: Range | null, newStickiness: model.TrackedRangeStickiness): string | null {
		const node = (id ? this._decorations[id] : null);

		if (!node) {
			if (!newRange) {
				// node doesn't exist, the request is to delete => nothing to do
				return null;
			}
			// node doesn't exist, the request is to set => add the tracked range
			return this._deltaDecorationsImpl(0, [], [{ range: newRange, options: TRACKED_RANGE_OPTIONS[newStickiness] }], true)[0];
		}

		if (!newRange) {
			// node exists, the request is to delete => delete node
			this._decorationsTree.delete(node);
			delete this._decorations[node.id];
			return null;
		}

		// node exists, the request is to set => change the tracked range and its options
		const range = this._validateRangeRelaxedNoAllocations(newRange);
		const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
		const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);
		this._decorationsTree.delete(node);
		node.reset(this.getVersionId(), startOffset, endOffset, range);
		node.setOptions(TRACKED_RANGE_OPTIONS[newStickiness]);
		this._decorationsTree.insert(node);
		return node.id;
	}

	public removeAllDecorationsWithOwnerId(ownerId: number): void {
		if (this._isDisposed) {
			return;
		}
		const nodes = this._decorationsTree.collectNodesFromOwner(ownerId);
		for (let i = 0, len = nodes.length; i < len; i++) {
			const node = nodes[i];

			this._decorationsTree.delete(node);
			delete this._decorations[node.id];
		}
	}

	public getDecorationOptions(decorationId: string): model.IModelDecorationOptions | null {
		const node = this._decorations[decorationId];
		if (!node) {
			return null;
		}
		return node.options;
	}

	public getDecorationRange(decorationId: string): Range | null {
		const node = this._decorations[decorationId];
		if (!node) {
			return null;
		}
		return this._decorationsTree.getNodeRange(this, node);
	}

	public getLineDecorations(lineNumber: number, ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			return [];
		}
		return this.getLinesDecorations(lineNumber, lineNumber, ownerId, filterOutValidation);
	}

	public getLinesDecorations(_startLineNumber: number, _endLineNumber: number, ownerId: number = 0, filterOutValidation: boolean = false, onlyMarginDecorations: boolean = false): model.IModelDecoration[] {
		const lineCount = this.getLineCount();
		const startLineNumber = Math.min(lineCount, Math.max(1, _startLineNumber));
		const endLineNumber = Math.min(lineCount, Math.max(1, _endLineNumber));
		const endColumn = this.getLineMaxColumn(endLineNumber);
		const range = new Range(startLineNumber, 1, endLineNumber, endColumn);

		const decorations = this._getDecorationsInRange(range, ownerId, filterOutValidation, onlyMarginDecorations);
		pushMany(decorations, this._decorationProvider.getDecorationsInRange(range, ownerId, filterOutValidation));
		return decorations;
	}

	public getDecorationsInRange(range: IRange, ownerId: number = 0, filterOutValidation: boolean = false, onlyMinimapDecorations: boolean = false, onlyMarginDecorations: boolean = false): model.IModelDecoration[] {
		const validatedRange = this.validateRange(range);

		const decorations = this._getDecorationsInRange(validatedRange, ownerId, filterOutValidation, onlyMarginDecorations);
		pushMany(decorations, this._decorationProvider.getDecorationsInRange(validatedRange, ownerId, filterOutValidation, onlyMinimapDecorations));
		return decorations;
	}

	public getOverviewRulerDecorations(ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		return this._decorationsTree.getAll(this, ownerId, filterOutValidation, true, false);
	}

	public getInjectedTextDecorations(ownerId: number = 0): model.IModelDecoration[] {
		return this._decorationsTree.getAllInjectedText(this, ownerId);
	}

	public getCustomLineHeightsDecorations(ownerId: number = 0): model.IModelDecoration[] {
		return this._decorationsTree.getAllCustomLineHeights(this, ownerId);
	}

	private _getInjectedTextInLine(lineNumber: number): LineInjectedText[] {
		const startOffset = this._buffer.getOffsetAt(lineNumber, 1);
		const endOffset = startOffset + this._buffer.getLineLength(lineNumber);

		const result = this._decorationsTree.getInjectedTextInInterval(this, startOffset, endOffset, 0);
		return LineInjectedText.fromDecorations(result).filter(t => t.lineNumber === lineNumber);
	}

	public getAllDecorations(ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		let result = this._decorationsTree.getAll(this, ownerId, filterOutValidation, false, false);
		result = result.concat(this._decorationProvider.getAllDecorations(ownerId, filterOutValidation));
		return result;
	}

	public getAllMarginDecorations(ownerId: number = 0): model.IModelDecoration[] {
		return this._decorationsTree.getAll(this, ownerId, false, false, true);
	}

	private _getDecorationsInRange(filterRange: Range, filterOwnerId: number, filterOutValidation: boolean, onlyMarginDecorations: boolean): model.IModelDecoration[] {
		const startOffset = this._buffer.getOffsetAt(filterRange.startLineNumber, filterRange.startColumn);
		const endOffset = this._buffer.getOffsetAt(filterRange.endLineNumber, filterRange.endColumn);
		return this._decorationsTree.getAllInInterval(this, startOffset, endOffset, filterOwnerId, filterOutValidation, onlyMarginDecorations);
	}

	public getRangeAt(start: number, end: number): Range {
		return this._buffer.getRangeAt(start, end - start);
	}

	private _changeDecorationImpl(ownerId: number, decorationId: string, _range: IRange): void {
		const node = this._decorations[decorationId];
		if (!node) {
			return;
		}

		if (node.options.after) {
			const oldRange = this.getDecorationRange(decorationId);
			this._onDidChangeDecorations.recordLineAffectedByInjectedText(oldRange!.endLineNumber);
		}
		if (node.options.before) {
			const oldRange = this.getDecorationRange(decorationId);
			this._onDidChangeDecorations.recordLineAffectedByInjectedText(oldRange!.startLineNumber);
		}
		if (node.options.lineHeight !== null) {
			const oldRange = this.getDecorationRange(decorationId);
			this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, oldRange!.startLineNumber, null);
		}

		const range = this._validateRangeRelaxedNoAllocations(_range);
		const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
		const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);

		this._decorationsTree.delete(node);
		node.reset(this.getVersionId(), startOffset, endOffset, range);
		this._decorationsTree.insert(node);
		this._onDidChangeDecorations.checkAffectedAndFire(node.options);

		if (node.options.after) {
			this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.endLineNumber);
		}
		if (node.options.before) {
			this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.startLineNumber);
		}
		if (node.options.lineHeight !== null) {
			this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, range.startLineNumber, node.options.lineHeight);
		}
	}

	private _changeDecorationOptionsImpl(ownerId: number, decorationId: string, options: ModelDecorationOptions): void {
		const node = this._decorations[decorationId];
		if (!node) {
			return;
		}

		const nodeWasInOverviewRuler = (node.options.overviewRuler && node.options.overviewRuler.color ? true : false);
		const nodeIsInOverviewRuler = (options.overviewRuler && options.overviewRuler.color ? true : false);

		this._onDidChangeDecorations.checkAffectedAndFire(node.options);
		this._onDidChangeDecorations.checkAffectedAndFire(options);

		if (node.options.after || options.after) {
			const nodeRange = this._decorationsTree.getNodeRange(this, node);
			this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.endLineNumber);
		}
		if (node.options.before || options.before) {
			const nodeRange = this._decorationsTree.getNodeRange(this, node);
			this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.startLineNumber);
		}
		if (node.options.lineHeight !== null || options.lineHeight !== null) {
			const nodeRange = this._decorationsTree.getNodeRange(this, node);
			this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, nodeRange.startLineNumber, options.lineHeight);
		}

		const movedInOverviewRuler = nodeWasInOverviewRuler !== nodeIsInOverviewRuler;
		const changedWhetherInjectedText = isOptionsInjectedText(options) !== isNodeInjectedText(node);
		if (movedInOverviewRuler || changedWhetherInjectedText) {
			this._decorationsTree.delete(node);
			node.setOptions(options);
			this._decorationsTree.insert(node);
		} else {
			node.setOptions(options);
		}
	}

	private _deltaDecorationsImpl(ownerId: number, oldDecorationsIds: string[], newDecorations: model.IModelDeltaDecoration[], suppressEvents: boolean = false): string[] {
		const versionId = this.getVersionId();

		const oldDecorationsLen = oldDecorationsIds.length;
		let oldDecorationIndex = 0;

		const newDecorationsLen = newDecorations.length;
		let newDecorationIndex = 0;

		this._onDidChangeDecorations.beginDeferredEmit();
		try {
			const result = new Array<string>(newDecorationsLen);
			while (oldDecorationIndex < oldDecorationsLen || newDecorationIndex < newDecorationsLen) {

				let node: IntervalNode | null = null;

				if (oldDecorationIndex < oldDecorationsLen) {
					// (1) get ourselves an old node
					let decorationId: string;
					do {
						decorationId = oldDecorationsIds[oldDecorationIndex++];
						node = this._decorations[decorationId];
					} while (!node && oldDecorationIndex < oldDecorationsLen);

					// (2) remove the node from the tree (if it exists)
					if (node) {
						if (node.options.after) {
							const nodeRange = this._decorationsTree.getNodeRange(this, node);
							this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.endLineNumber);
						}
						if (node.options.before) {
							const nodeRange = this._decorationsTree.getNodeRange(this, node);
							this._onDidChangeDecorations.recordLineAffectedByInjectedText(nodeRange.startLineNumber);
						}
						if (node.options.lineHeight !== null) {
							const nodeRange = this._decorationsTree.getNodeRange(this, node);
							this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, decorationId, nodeRange.startLineNumber, null);
						}
						this._decorationsTree.delete(node);

						if (!suppressEvents) {
							this._onDidChangeDecorations.checkAffectedAndFire(node.options);
						}
					}
				}

				if (newDecorationIndex < newDecorationsLen) {
					// (3) create a new node if necessary
					if (!node) {
						const internalDecorationId = (++this._lastDecorationId);
						const decorationId = `${this._instanceId};${internalDecorationId}`;
						node = new IntervalNode(decorationId, 0, 0);
						this._decorations[decorationId] = node;
					}

					// (4) initialize node
					const newDecoration = newDecorations[newDecorationIndex];
					const range = this._validateRangeRelaxedNoAllocations(newDecoration.range);
					const options = _normalizeOptions(newDecoration.options);
					const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
					const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);

					node.ownerId = ownerId;
					node.reset(versionId, startOffset, endOffset, range);
					node.setOptions(options);

					if (node.options.after) {
						this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.endLineNumber);
					}
					if (node.options.before) {
						this._onDidChangeDecorations.recordLineAffectedByInjectedText(range.startLineNumber);
					}
					if (node.options.lineHeight !== null) {
						this._onDidChangeDecorations.recordLineAffectedByLineHeightChange(ownerId, node.id, range.startLineNumber, node.options.lineHeight);
					}
					if (!suppressEvents) {
						this._onDidChangeDecorations.checkAffectedAndFire(options);
					}

					this._decorationsTree.insert(node);

					result[newDecorationIndex] = node.id;

					newDecorationIndex++;
				} else {
					if (node) {
						delete this._decorations[node.id];
					}
				}
			}

			return result;
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	//#endregion

	//#region Tokenization

	// TODO move them to the tokenization part.
	public getLanguageId(): string {
		return this.tokenization.getLanguageId();
	}

	public setLanguage(languageIdOrSelection: string | ILanguageSelection, source?: string): void {
		if (typeof languageIdOrSelection === 'string') {
			this._languageSelectionListener.clear();
			this._setLanguage(languageIdOrSelection, source);
		} else {
			this._languageSelectionListener.value = languageIdOrSelection.onDidChange(() => this._setLanguage(languageIdOrSelection.languageId, source));
			this._setLanguage(languageIdOrSelection.languageId, source);
		}
	}

	private _setLanguage(languageId: string, source?: string): void {
		this.tokenization.setLanguageId(languageId, source);
		this._languageService.requestRichLanguageFeatures(languageId);
	}

	public getLanguageIdAtPosition(lineNumber: number, column: number): string {
		return this.tokenization.getLanguageIdAtPosition(lineNumber, column);
	}

	public getWordAtPosition(position: IPosition): IWordAtPosition | null {
		return this._tokenizationTextModelPart.getWordAtPosition(position);
	}

	public getWordUntilPosition(position: IPosition): IWordAtPosition {
		return this._tokenizationTextModelPart.getWordUntilPosition(position);
	}

	//#endregion
	normalizePosition(position: Position, affinity: model.PositionAffinity): Position {
		return position;
	}

	/**
	 * Gets the column at which indentation stops at a given line.
	 * @internal
	*/
	public getLineIndentColumn(lineNumber: number): number {
		// Columns start with 1.
		return indentOfLine(this.getLineContent(lineNumber)) + 1;
	}

	public override toString(): string {
		return `TextModel(${this.uri.toString()})`;
	}
}

export function indentOfLine(line: string): number {
	let indent = 0;
	for (const c of line) {
		if (c === ' ' || c === '\t') {
			indent++;
		} else {
			break;
		}
	}
	return indent;
}

//#region Decorations

function isNodeInOverviewRuler(node: IntervalNode): boolean {
	return (node.options.overviewRuler && node.options.overviewRuler.color ? true : false);
}

function isOptionsInjectedText(options: ModelDecorationOptions): boolean {
	return !!options.after || !!options.before;
}

function isNodeInjectedText(node: IntervalNode): boolean {
	return !!node.options.after || !!node.options.before;
}

export interface IDecorationsTreesHost {
	getVersionId(): number;
	getRangeAt(start: number, end: number): Range;
}

class DecorationsTrees {

	/**
	 * This tree holds decorations that do not show up in the overview ruler.
	 */
	private readonly _decorationsTree0: IntervalTree;

	/**
	 * This tree holds decorations that show up in the overview ruler.
	 */
	private readonly _decorationsTree1: IntervalTree;

	/**
	 * This tree holds decorations that contain injected text.
	 */
	private readonly _injectedTextDecorationsTree: IntervalTree;

	constructor() {
		this._decorationsTree0 = new IntervalTree();
		this._decorationsTree1 = new IntervalTree();
		this._injectedTextDecorationsTree = new IntervalTree();
	}

	public ensureAllNodesHaveRanges(host: IDecorationsTreesHost): void {
		this.getAll(host, 0, false, false, false);
	}

	private _ensureNodesHaveRanges(host: IDecorationsTreesHost, nodes: IntervalNode[]): model.IModelDecoration[] {
		for (const node of nodes) {
			if (node.range === null) {
				node.range = host.getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
			}
		}
		return <model.IModelDecoration[]>nodes;
	}

	public getAllInInterval(host: IDecorationsTreesHost, start: number, end: number, filterOwnerId: number, filterOutValidation: boolean, onlyMarginDecorations: boolean): model.IModelDecoration[] {
		const versionId = host.getVersionId();
		const result = this._intervalSearch(start, end, filterOwnerId, filterOutValidation, versionId, onlyMarginDecorations);
		return this._ensureNodesHaveRanges(host, result);
	}

	private _intervalSearch(start: number, end: number, filterOwnerId: number, filterOutValidation: boolean, cachedVersionId: number, onlyMarginDecorations: boolean): IntervalNode[] {
		const r0 = this._decorationsTree0.intervalSearch(start, end, filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
		const r1 = this._decorationsTree1.intervalSearch(start, end, filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
		const r2 = this._injectedTextDecorationsTree.intervalSearch(start, end, filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
		return r0.concat(r1).concat(r2);
	}

	public getInjectedTextInInterval(host: IDecorationsTreesHost, start: number, end: number, filterOwnerId: number): model.IModelDecoration[] {
		const versionId = host.getVersionId();
		const result = this._injectedTextDecorationsTree.intervalSearch(start, end, filterOwnerId, false, versionId, false);
		return this._ensureNodesHaveRanges(host, result).filter((i) => i.options.showIfCollapsed || !i.range.isEmpty());
	}

	public getAllInjectedText(host: IDecorationsTreesHost, filterOwnerId: number): model.IModelDecoration[] {
		const versionId = host.getVersionId();
		const result = this._injectedTextDecorationsTree.search(filterOwnerId, false, versionId, false);
		return this._ensureNodesHaveRanges(host, result).filter((i) => i.options.showIfCollapsed || !i.range.isEmpty());
	}

	public getAllCustomLineHeights(host: IDecorationsTreesHost, filterOwnerId: number): model.IModelDecoration[] {
		const versionId = host.getVersionId();
		const result = this._search(filterOwnerId, false, false, versionId, false);
		return this._ensureNodesHaveRanges(host, result).filter((i) => typeof i.options.lineHeight === 'number');
	}

	public getAll(host: IDecorationsTreesHost, filterOwnerId: number, filterOutValidation: boolean, overviewRulerOnly: boolean, onlyMarginDecorations: boolean): model.IModelDecoration[] {
		const versionId = host.getVersionId();
		const result = this._search(filterOwnerId, filterOutValidation, overviewRulerOnly, versionId, onlyMarginDecorations);
		return this._ensureNodesHaveRanges(host, result);
	}

	private _search(filterOwnerId: number, filterOutValidation: boolean, overviewRulerOnly: boolean, cachedVersionId: number, onlyMarginDecorations: boolean): IntervalNode[] {
		if (overviewRulerOnly) {
			return this._decorationsTree1.search(filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
		} else {
			const r0 = this._decorationsTree0.search(filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
			const r1 = this._decorationsTree1.search(filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
			const r2 = this._injectedTextDecorationsTree.search(filterOwnerId, filterOutValidation, cachedVersionId, onlyMarginDecorations);
			return r0.concat(r1).concat(r2);
		}
	}

	public collectNodesFromOwner(ownerId: number): IntervalNode[] {
		const r0 = this._decorationsTree0.collectNodesFromOwner(ownerId);
		const r1 = this._decorationsTree1.collectNodesFromOwner(ownerId);
		const r2 = this._injectedTextDecorationsTree.collectNodesFromOwner(ownerId);
		return r0.concat(r1).concat(r2);
	}

	public collectNodesPostOrder(): IntervalNode[] {
		const r0 = this._decorationsTree0.collectNodesPostOrder();
		const r1 = this._decorationsTree1.collectNodesPostOrder();
		const r2 = this._injectedTextDecorationsTree.collectNodesPostOrder();
		return r0.concat(r1).concat(r2);
	}

	public insert(node: IntervalNode): void {
		if (isNodeInjectedText(node)) {
			this._injectedTextDecorationsTree.insert(node);
		} else if (isNodeInOverviewRuler(node)) {
			this._decorationsTree1.insert(node);
		} else {
			this._decorationsTree0.insert(node);
		}
	}

	public delete(node: IntervalNode): void {
		if (isNodeInjectedText(node)) {
			this._injectedTextDecorationsTree.delete(node);
		} else if (isNodeInOverviewRuler(node)) {
			this._decorationsTree1.delete(node);
		} else {
			this._decorationsTree0.delete(node);
		}
	}

	public getNodeRange(host: IDecorationsTreesHost, node: IntervalNode): Range {
		const versionId = host.getVersionId();
		if (node.cachedVersionId !== versionId) {
			this._resolveNode(node, versionId);
		}
		if (node.range === null) {
			node.range = host.getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
		}
		return node.range;
	}

	private _resolveNode(node: IntervalNode, cachedVersionId: number): void {
		if (isNodeInjectedText(node)) {
			this._injectedTextDecorationsTree.resolveNode(node, cachedVersionId);
		} else if (isNodeInOverviewRuler(node)) {
			this._decorationsTree1.resolveNode(node, cachedVersionId);
		} else {
			this._decorationsTree0.resolveNode(node, cachedVersionId);
		}
	}

	public acceptReplace(offset: number, length: number, textLength: number, forceMoveMarkers: boolean): void {
		this._decorationsTree0.acceptReplace(offset, length, textLength, forceMoveMarkers);
		this._decorationsTree1.acceptReplace(offset, length, textLength, forceMoveMarkers);
		this._injectedTextDecorationsTree.acceptReplace(offset, length, textLength, forceMoveMarkers);
	}
}

function cleanClassName(className: string): string {
	return className.replace(/[^a-z0-9\-_]/gi, ' ');
}

class DecorationOptions implements model.IDecorationOptions {
	readonly color: string | ThemeColor;
	readonly darkColor: string | ThemeColor;

	constructor(options: model.IDecorationOptions) {
		this.color = options.color || '';
		this.darkColor = options.darkColor || '';

	}
}

export class ModelDecorationOverviewRulerOptions extends DecorationOptions {
	readonly position: model.OverviewRulerLane;
	private _resolvedColor: string | null;

	constructor(options: model.IModelDecorationOverviewRulerOptions) {
		super(options);
		this._resolvedColor = null;
		this.position = (typeof options.position === 'number' ? options.position : model.OverviewRulerLane.Center);
	}

	public getColor(theme: IColorTheme): string {
		if (!this._resolvedColor) {
			if (theme.type !== 'light' && this.darkColor) {
				this._resolvedColor = this._resolveColor(this.darkColor, theme);
			} else {
				this._resolvedColor = this._resolveColor(this.color, theme);
			}
		}
		return this._resolvedColor;
	}

	public invalidateCachedColor(): void {
		this._resolvedColor = null;
	}

	private _resolveColor(color: string | ThemeColor, theme: IColorTheme): string {
		if (typeof color === 'string') {
			return color;
		}
		const c = color ? theme.getColor(color.id) : null;
		if (!c) {
			return '';
		}
		return c.toString();
	}
}

export class ModelDecorationGlyphMarginOptions {
	readonly position: model.GlyphMarginLane;
	readonly persistLane: boolean | undefined;

	constructor(options: model.IModelDecorationGlyphMarginOptions | null | undefined) {
		this.position = options?.position ?? model.GlyphMarginLane.Center;
		this.persistLane = options?.persistLane;
	}
}

export class ModelDecorationMinimapOptions extends DecorationOptions {
	readonly position: model.MinimapPosition;
	readonly sectionHeaderStyle: model.MinimapSectionHeaderStyle | null;
	readonly sectionHeaderText: string | null;
	private _resolvedColor: Color | undefined;

	constructor(options: model.IModelDecorationMinimapOptions) {
		super(options);
		this.position = options.position;
		this.sectionHeaderStyle = options.sectionHeaderStyle ?? null;
		this.sectionHeaderText = options.sectionHeaderText ?? null;
	}

	public getColor(theme: IColorTheme): Color | undefined {
		if (!this._resolvedColor) {
			if (theme.type !== 'light' && this.darkColor) {
				this._resolvedColor = this._resolveColor(this.darkColor, theme);
			} else {
				this._resolvedColor = this._resolveColor(this.color, theme);
			}
		}

		return this._resolvedColor;
	}

	public invalidateCachedColor(): void {
		this._resolvedColor = undefined;
	}

	private _resolveColor(color: string | ThemeColor, theme: IColorTheme): Color | undefined {
		if (typeof color === 'string') {
			return Color.fromHex(color);
		}
		return theme.getColor(color.id);
	}
}

export class ModelDecorationInjectedTextOptions implements model.InjectedTextOptions {
	public static from(options: model.InjectedTextOptions): ModelDecorationInjectedTextOptions {
		if (options instanceof ModelDecorationInjectedTextOptions) {
			return options;
		}
		return new ModelDecorationInjectedTextOptions(options);
	}

	public readonly content: string;
	public readonly tokens: TokenArray | null;
	readonly inlineClassName: string | null;
	readonly inlineClassNameAffectsLetterSpacing: boolean;
	readonly attachedData: unknown | null;
	readonly cursorStops: model.InjectedTextCursorStops | null;

	private constructor(options: model.InjectedTextOptions) {
		this.content = options.content || '';
		this.tokens = options.tokens ?? null;
		this.inlineClassName = options.inlineClassName || null;
		this.inlineClassNameAffectsLetterSpacing = options.inlineClassNameAffectsLetterSpacing || false;
		this.attachedData = options.attachedData || null;
		this.cursorStops = options.cursorStops || null;
	}
}

export class ModelDecorationOptions implements model.IModelDecorationOptions {

	public static EMPTY: ModelDecorationOptions;

	public static register(options: model.IModelDecorationOptions): ModelDecorationOptions {
		return new ModelDecorationOptions(options);
	}

	public static createDynamic(options: model.IModelDecorationOptions): ModelDecorationOptions {
		return new ModelDecorationOptions(options);
	}
	readonly description: string;
	readonly blockClassName: string | null;
	readonly blockIsAfterEnd: boolean | null;
	readonly blockDoesNotCollapse?: boolean | null;
	readonly blockPadding: [top: number, right: number, bottom: number, left: number] | null;
	readonly stickiness: model.TrackedRangeStickiness;
	readonly zIndex: number;
	readonly className: string | null;
	readonly shouldFillLineOnLineBreak: boolean | null;
	readonly hoverMessage: IMarkdownString | IMarkdownString[] | null;
	readonly glyphMarginHoverMessage: IMarkdownString | IMarkdownString[] | null;
	readonly isWholeLine: boolean;
	readonly lineHeight: number | null;
	readonly showIfCollapsed: boolean;
	readonly collapseOnReplaceEdit: boolean;
	readonly overviewRuler: ModelDecorationOverviewRulerOptions | null;
	readonly minimap: ModelDecorationMinimapOptions | null;
	readonly glyphMargin?: model.IModelDecorationGlyphMarginOptions | null | undefined;
	readonly glyphMarginClassName: string | null;
	readonly linesDecorationsClassName: string | null;
	readonly lineNumberClassName: string | null;
	readonly lineNumberHoverMessage: IMarkdownString | IMarkdownString[] | null;
	readonly linesDecorationsTooltip: string | null;
	readonly firstLineDecorationClassName: string | null;
	readonly marginClassName: string | null;
	readonly inlineClassName: string | null;
	readonly inlineClassNameAffectsLetterSpacing: boolean;
	readonly beforeContentClassName: string | null;
	readonly afterContentClassName: string | null;
	readonly after: ModelDecorationInjectedTextOptions | null;
	readonly before: ModelDecorationInjectedTextOptions | null;
	readonly hideInCommentTokens: boolean | null;
	readonly hideInStringTokens: boolean | null;

	private constructor(options: model.IModelDecorationOptions) {
		this.description = options.description;
		this.blockClassName = options.blockClassName ? cleanClassName(options.blockClassName) : null;
		this.blockDoesNotCollapse = options.blockDoesNotCollapse ?? null;
		this.blockIsAfterEnd = options.blockIsAfterEnd ?? null;
		this.blockPadding = options.blockPadding ?? null;
		this.stickiness = options.stickiness || model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
		this.zIndex = options.zIndex || 0;
		this.className = options.className ? cleanClassName(options.className) : null;
		this.shouldFillLineOnLineBreak = options.shouldFillLineOnLineBreak ?? null;
		this.hoverMessage = options.hoverMessage || null;
		this.glyphMarginHoverMessage = options.glyphMarginHoverMessage || null;
		this.lineNumberHoverMessage = options.lineNumberHoverMessage || null;
		this.isWholeLine = options.isWholeLine || false;
		this.lineHeight = options.lineHeight ?? null;
		this.showIfCollapsed = options.showIfCollapsed || false;
		this.collapseOnReplaceEdit = options.collapseOnReplaceEdit || false;
		this.overviewRuler = options.overviewRuler ? new ModelDecorationOverviewRulerOptions(options.overviewRuler) : null;
		this.minimap = options.minimap ? new ModelDecorationMinimapOptions(options.minimap) : null;
		this.glyphMargin = options.glyphMarginClassName ? new ModelDecorationGlyphMarginOptions(options.glyphMargin) : null;
		this.glyphMarginClassName = options.glyphMarginClassName ? cleanClassName(options.glyphMarginClassName) : null;
		this.linesDecorationsClassName = options.linesDecorationsClassName ? cleanClassName(options.linesDecorationsClassName) : null;
		this.lineNumberClassName = options.lineNumberClassName ? cleanClassName(options.lineNumberClassName) : null;
		this.linesDecorationsTooltip = options.linesDecorationsTooltip ? strings.htmlAttributeEncodeValue(options.linesDecorationsTooltip) : null;
		this.firstLineDecorationClassName = options.firstLineDecorationClassName ? cleanClassName(options.firstLineDecorationClassName) : null;
		this.marginClassName = options.marginClassName ? cleanClassName(options.marginClassName) : null;
		this.inlineClassName = options.inlineClassName ? cleanClassName(options.inlineClassName) : null;
		this.inlineClassNameAffectsLetterSpacing = options.inlineClassNameAffectsLetterSpacing || false;
		this.beforeContentClassName = options.beforeContentClassName ? cleanClassName(options.beforeContentClassName) : null;
		this.afterContentClassName = options.afterContentClassName ? cleanClassName(options.afterContentClassName) : null;
		this.after = options.after ? ModelDecorationInjectedTextOptions.from(options.after) : null;
		this.before = options.before ? ModelDecorationInjectedTextOptions.from(options.before) : null;
		this.hideInCommentTokens = options.hideInCommentTokens ?? false;
		this.hideInStringTokens = options.hideInStringTokens ?? false;
	}
}
ModelDecorationOptions.EMPTY = ModelDecorationOptions.register({ description: 'empty' });

/**
 * The order carefully matches the values of the enum.
 */
const TRACKED_RANGE_OPTIONS = [
	ModelDecorationOptions.register({ description: 'tracked-range-always-grows-when-typing-at-edges', stickiness: model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ description: 'tracked-range-never-grows-when-typing-at-edges', stickiness: model.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ description: 'tracked-range-grows-only-when-typing-before', stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore }),
	ModelDecorationOptions.register({ description: 'tracked-range-grows-only-when-typing-after', stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingAfter }),
];

function _normalizeOptions(options: model.IModelDecorationOptions): ModelDecorationOptions {
	if (options instanceof ModelDecorationOptions) {
		return options;
	}
	return ModelDecorationOptions.createDynamic(options);
}

class LineHeightChangingDecoration {

	public static toKey(obj: LineHeightChangingDecoration): string {
		return `${obj.ownerId};${obj.decorationId};${obj.lineNumber}`;
	}

	constructor(
		public readonly ownerId: number,
		public readonly decorationId: string,
		public readonly lineNumber: number,
		public readonly lineHeight: number | null
	) { }
}

class DidChangeDecorationsEmitter extends Disposable {

	private readonly _actual: Emitter<IModelDecorationsChangedEvent> = this._register(new Emitter<IModelDecorationsChangedEvent>());
	public readonly event: Event<IModelDecorationsChangedEvent> = this._actual.event;

	private _deferredCnt: number;
	private _shouldFireDeferred: boolean;
	private _affectsMinimap: boolean;
	private _affectsOverviewRuler: boolean;
	private _affectedInjectedTextLines: Set<number> | null = null;
	private _affectedLineHeights: SetWithKey<LineHeightChangingDecoration> | null = null;
	private _affectsGlyphMargin: boolean;
	private _affectsLineNumber: boolean;

	constructor(private readonly handleBeforeFire: (affectedInjectedTextLines: Set<number> | null, affectedLineHeights: SetWithKey<LineHeightChangingDecoration> | null) => void) {
		super();
		this._deferredCnt = 0;
		this._shouldFireDeferred = false;
		this._affectsMinimap = false;
		this._affectsOverviewRuler = false;
		this._affectsGlyphMargin = false;
		this._affectsLineNumber = false;
	}

	hasListeners(): boolean {
		return this._actual.hasListeners();
	}

	public beginDeferredEmit(): void {
		this._deferredCnt++;
	}

	public endDeferredEmit(): void {
		this._deferredCnt--;
		if (this._deferredCnt === 0) {
			if (this._shouldFireDeferred) {
				this.doFire();
			}

			this._affectedInjectedTextLines?.clear();
			this._affectedInjectedTextLines = null;
			this._affectedLineHeights?.clear();
			this._affectedLineHeights = null;
		}
	}

	public recordLineAffectedByInjectedText(lineNumber: number): void {
		if (!this._affectedInjectedTextLines) {
			this._affectedInjectedTextLines = new Set();
		}
		this._affectedInjectedTextLines.add(lineNumber);
	}

	public recordLineAffectedByLineHeightChange(ownerId: number, decorationId: string, lineNumber: number, lineHeight: number | null): void {
		if (!this._affectedLineHeights) {
			this._affectedLineHeights = new SetWithKey<LineHeightChangingDecoration>([], LineHeightChangingDecoration.toKey);
		}
		this._affectedLineHeights.add(new LineHeightChangingDecoration(ownerId, decorationId, lineNumber, lineHeight));
	}

	public checkAffectedAndFire(options: ModelDecorationOptions): void {
		this._affectsMinimap ||= !!options.minimap?.position;
		this._affectsOverviewRuler ||= !!options.overviewRuler?.color;
		this._affectsGlyphMargin ||= !!options.glyphMarginClassName;
		this._affectsLineNumber ||= !!options.lineNumberClassName;
		this.tryFire();
	}

	public fire(): void {
		this._affectsMinimap = true;
		this._affectsOverviewRuler = true;
		this._affectsGlyphMargin = true;
		this.tryFire();
	}

	private tryFire() {
		if (this._deferredCnt === 0) {
			this.doFire();
		} else {
			this._shouldFireDeferred = true;
		}
	}

	private doFire() {
		this.handleBeforeFire(this._affectedInjectedTextLines, this._affectedLineHeights);

		const event: IModelDecorationsChangedEvent = {
			affectsMinimap: this._affectsMinimap,
			affectsOverviewRuler: this._affectsOverviewRuler,
			affectsGlyphMargin: this._affectsGlyphMargin,
			affectsLineNumber: this._affectsLineNumber,
		};
		this._shouldFireDeferred = false;
		this._affectsMinimap = false;
		this._affectsOverviewRuler = false;
		this._affectsGlyphMargin = false;
		this._actual.fire(event);
	}
}

//#endregion

class DidChangeContentEmitter extends Disposable {

	/**
	 * Both `fastEvent` and `slowEvent` work the same way and contain the same events, but first we invoke `fastEvent` and then `slowEvent`.
	 */
	private readonly _fastEmitter: Emitter<InternalModelContentChangeEvent> = this._register(new Emitter<InternalModelContentChangeEvent>());
	public readonly fastEvent: Event<InternalModelContentChangeEvent> = this._fastEmitter.event;
	private readonly _slowEmitter: Emitter<InternalModelContentChangeEvent> = this._register(new Emitter<InternalModelContentChangeEvent>());
	public readonly slowEvent: Event<InternalModelContentChangeEvent> = this._slowEmitter.event;

	private _deferredCnt: number;
	private _deferredEvent: InternalModelContentChangeEvent | null;

	constructor() {
		super();
		this._deferredCnt = 0;
		this._deferredEvent = null;
	}

	public hasListeners(): boolean {
		return (
			this._fastEmitter.hasListeners()
			|| this._slowEmitter.hasListeners()
		);
	}

	public beginDeferredEmit(): void {
		this._deferredCnt++;
	}

	public endDeferredEmit(resultingSelection: Selection[] | null = null): void {
		this._deferredCnt--;
		if (this._deferredCnt === 0) {
			if (this._deferredEvent !== null) {
				this._deferredEvent.rawContentChangedEvent.resultingSelection = resultingSelection;
				const e = this._deferredEvent;
				this._deferredEvent = null;
				this._fastEmitter.fire(e);
				this._slowEmitter.fire(e);
			}
		}
	}

	public fire(e: InternalModelContentChangeEvent): void {
		if (this._deferredCnt > 0) {
			if (this._deferredEvent) {
				this._deferredEvent = this._deferredEvent.merge(e);
			} else {
				this._deferredEvent = e;
			}
			return;
		}
		this._fastEmitter.fire(e);
		this._slowEmitter.fire(e);
	}
}
