/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { Event, Emitter } from 'vs/base/common/event';
import * as model from 'vs/editor/common/model';
import { LanguageIdentifier, TokenizationRegistry, LanguageId } from 'vs/editor/common/modes';
import { EditStack } from 'vs/editor/common/model/editStack';
import { Range, IRange } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ModelRawContentChangedEvent, IModelDecorationsChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent, IModelTokensChangedEvent, IModelOptionsChangedEvent, IModelContentChangedEvent, InternalModelContentChangeEvent, ModelRawFlush, ModelRawEOLChanged, ModelRawChange, ModelRawLineChanged, ModelRawLinesDeleted, ModelRawLinesInserted } from 'vs/editor/common/model/textModelEvents';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IMarkdownString } from 'vs/base/common/htmlContent';
import * as strings from 'vs/base/common/strings';
import { CharCode } from 'vs/base/common/charCode';
import { ThemeColor } from 'vs/platform/theme/common/themeService';
import { IntervalNode, IntervalTree, recomputeMaxEnd, getNodeIsInOverviewRuler } from 'vs/editor/common/model/intervalTree';
import { Disposable, IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { NULL_LANGUAGE_IDENTIFIER } from 'vs/editor/common/modes/nullMode';
import { ignoreBracketsInToken } from 'vs/editor/common/modes/supports';
import { BracketsUtils, RichEditBrackets, RichEditBracket } from 'vs/editor/common/modes/supports/richEditBrackets';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { getWordAtText } from 'vs/editor/common/model/wordHelper';
import { ModelLinesTokens, ModelTokensChangedEventBuilder } from 'vs/editor/common/model/textModelTokens';
import { guessIndentation } from 'vs/editor/common/model/indentationGuesser';
import { EDITOR_MODEL_DEFAULTS } from 'vs/editor/common/config/editorOptions';
import { TextModelSearch, SearchParams, SearchData } from 'vs/editor/common/model/textModelSearch';
import { TPromise } from 'vs/base/common/winjs.base';
import { IStringStream, ITextSnapshot } from 'vs/platform/files/common/files';
import { PieceTreeTextBufferBuilder } from 'vs/editor/common/model/pieceTreeTextBuffer/pieceTreeTextBufferBuilder';

function createTextBufferBuilder() {
	return new PieceTreeTextBufferBuilder();
}

export function createTextBufferFactory(text: string): model.ITextBufferFactory {
	const builder = createTextBufferBuilder();
	builder.acceptChunk(text);
	return builder.finish();
}

export function createTextBufferFactoryFromStream(stream: IStringStream, filter?: (chunk: string) => string): TPromise<model.ITextBufferFactory> {
	return new TPromise<model.ITextBufferFactory>((c, e, p) => {
		let done = false;
		let builder = createTextBufferBuilder();

		stream.on('data', (chunk) => {
			if (filter) {
				chunk = filter(chunk);
			}

			builder.acceptChunk(chunk);
		});

		stream.on('error', (error) => {
			if (!done) {
				done = true;
				e(error);
			}
		});

		stream.on('end', () => {
			if (!done) {
				done = true;
				c(builder.finish());
			}
		});
	});
}

export function createTextBufferFactoryFromSnapshot(snapshot: ITextSnapshot): model.ITextBufferFactory {
	let builder = createTextBufferBuilder();

	let chunk: string;
	while (typeof (chunk = snapshot.read()) === 'string') {
		builder.acceptChunk(chunk);
	}

	return builder.finish();
}

export function createTextBuffer(value: string | model.ITextBufferFactory, defaultEOL: model.DefaultEndOfLine): model.ITextBuffer {
	const factory = (typeof value === 'string' ? createTextBufferFactory(value) : value);
	return factory.create(defaultEOL);
}

let MODEL_ID = 0;

/**
 * Produces 'a'-'z', followed by 'A'-'Z'... followed by 'a'-'z', etc.
 */
function singleLetter(result: number): string {
	const LETTERS_CNT = (CharCode.Z - CharCode.A + 1);

	result = result % (2 * LETTERS_CNT);

	if (result < LETTERS_CNT) {
		return String.fromCharCode(CharCode.a + result);
	}

	return String.fromCharCode(CharCode.A + result - LETTERS_CNT);
}

const LIMIT_FIND_COUNT = 999;
export const LONG_LINE_BOUNDARY = 10000;

class TextModelSnapshot implements ITextSnapshot {

	private readonly _source: ITextSnapshot;
	private _eos: boolean;

	constructor(source: ITextSnapshot) {
		this._source = source;
		this._eos = false;
	}

	public read(): string {
		if (this._eos) {
			return null;
		}

		let result: string[] = [], resultCnt = 0, resultLength = 0;

		do {
			let tmp = this._source.read();

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

export class TextModel extends Disposable implements model.ITextModel {

	private static readonly MODEL_SYNC_LIMIT = 50 * 1024 * 1024; // 50 MB

	public static DEFAULT_CREATION_OPTIONS: model.ITextModelCreationOptions = {
		isForSimpleWidget: false,
		tabSize: EDITOR_MODEL_DEFAULTS.tabSize,
		insertSpaces: EDITOR_MODEL_DEFAULTS.insertSpaces,
		detectIndentation: false,
		defaultEOL: model.DefaultEndOfLine.LF,
		trimAutoWhitespace: EDITOR_MODEL_DEFAULTS.trimAutoWhitespace,
		largeFileSize: EDITOR_MODEL_DEFAULTS.largeFileSize,
		largeFileLineCount: EDITOR_MODEL_DEFAULTS.largeFileLineCount,
	};

	public static createFromString(text: string, options: model.ITextModelCreationOptions = TextModel.DEFAULT_CREATION_OPTIONS, languageIdentifier: LanguageIdentifier = null, uri: URI = null): TextModel {
		return new TextModel(text, options, languageIdentifier, uri);
	}

	public static resolveOptions(textBuffer: model.ITextBuffer, options: model.ITextModelCreationOptions): model.TextModelResolvedOptions {
		if (options.detectIndentation) {
			const guessedIndentation = guessIndentation(textBuffer, options.tabSize, options.insertSpaces);
			return new model.TextModelResolvedOptions({
				tabSize: guessedIndentation.tabSize,
				insertSpaces: guessedIndentation.insertSpaces,
				trimAutoWhitespace: options.trimAutoWhitespace,
				defaultEOL: options.defaultEOL
			});
		}

		return new model.TextModelResolvedOptions({
			tabSize: options.tabSize,
			insertSpaces: options.insertSpaces,
			trimAutoWhitespace: options.trimAutoWhitespace,
			defaultEOL: options.defaultEOL
		});

	}

	//#region Events
	private readonly _onWillDispose: Emitter<void> = this._register(new Emitter<void>());
	public readonly onWillDispose: Event<void> = this._onWillDispose.event;

	private readonly _onDidChangeDecorations: DidChangeDecorationsEmitter = this._register(new DidChangeDecorationsEmitter());
	public readonly onDidChangeDecorations: Event<IModelDecorationsChangedEvent> = this._onDidChangeDecorations.event;

	private readonly _onDidChangeLanguage: Emitter<IModelLanguageChangedEvent> = this._register(new Emitter<IModelLanguageChangedEvent>());
	public readonly onDidChangeLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeLanguage.event;

	private readonly _onDidChangeLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent> = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>());
	public readonly onDidChangeLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeLanguageConfiguration.event;

	private readonly _onDidChangeTokens: Emitter<IModelTokensChangedEvent> = this._register(new Emitter<IModelTokensChangedEvent>());
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	private readonly _onDidChangeOptions: Emitter<IModelOptionsChangedEvent> = this._register(new Emitter<IModelOptionsChangedEvent>());
	public readonly onDidChangeOptions: Event<IModelOptionsChangedEvent> = this._onDidChangeOptions.event;

	private readonly _eventEmitter: DidChangeContentEmitter = this._register(new DidChangeContentEmitter());
	public onDidChangeRawContentFast(listener: (e: ModelRawContentChangedEvent) => void): IDisposable {
		return this._eventEmitter.fastEvent((e: InternalModelContentChangeEvent) => listener(e.rawContentChangedEvent));
	}
	public onDidChangeRawContent(listener: (e: ModelRawContentChangedEvent) => void): IDisposable {
		return this._eventEmitter.slowEvent((e: InternalModelContentChangeEvent) => listener(e.rawContentChangedEvent));
	}
	public onDidChangeContent(listener: (e: IModelContentChangedEvent) => void): IDisposable {
		return this._eventEmitter.slowEvent((e: InternalModelContentChangeEvent) => listener(e.contentChangedEvent));
	}
	//#endregion

	public readonly id: string;
	public readonly isForSimpleWidget: boolean;
	private readonly _associatedResource: URI;
	private _attachedEditorCount: number;
	private _buffer: model.ITextBuffer;
	private _options: model.TextModelResolvedOptions;

	private _isDisposed: boolean;
	private _isDisposing: boolean;
	private _versionId: number;
	/**
	 * Unlike, versionId, this can go down (via undo) or go to previous values (via redo)
	 */
	private _alternativeVersionId: number;
	private readonly _shouldSimplifyMode: boolean;
	private readonly _isTooLargeForTokenization: boolean;

	//#region Editing
	private _commandManager: EditStack;
	private _isUndoing: boolean;
	private _isRedoing: boolean;
	private _trimAutoWhitespaceLines: number[];
	//#endregion

	//#region Decorations
	/**
	 * Used to workaround broken clients that might attempt using a decoration id generated by a different model.
	 * It is not globally unique in order to limit it to one character.
	 */
	private readonly _instanceId: string;
	private _lastDecorationId: number;
	private _decorations: { [decorationId: string]: IntervalNode; };
	private _decorationsTree: DecorationsTrees;
	//#endregion

	//#region Tokenization
	private _languageIdentifier: LanguageIdentifier;
	private _tokenizationListener: IDisposable;
	private _languageRegistryListener: IDisposable;
	private _revalidateTokensTimeout: number;
	/*private*/_tokens: ModelLinesTokens;
	//#endregion

	constructor(source: string | model.ITextBufferFactory, creationOptions: model.ITextModelCreationOptions, languageIdentifier: LanguageIdentifier, associatedResource: URI = null) {
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

		this._buffer = createTextBuffer(source, creationOptions.defaultEOL);

		this._options = TextModel.resolveOptions(this._buffer, creationOptions);

		const bufferLineCount = this._buffer.getLineCount();
		const bufferTextLength = this._buffer.getValueLengthInRange(new Range(1, 1, bufferLineCount, this._buffer.getLineLength(bufferLineCount) + 1), model.EndOfLinePreference.TextDefined);
		// !!! Make a decision in the ctor and permanently respect this decision !!!
		// If a model is too large at construction time, it will never get tokenized,
		// under no circumstances.
		this._isTooLargeForTokenization = (
			(bufferTextLength > creationOptions.largeFileSize)
			|| (bufferLineCount > creationOptions.largeFileLineCount)
		);

		this._shouldSimplifyMode = (
			this._isTooLargeForTokenization
			|| (bufferTextLength > TextModel.MODEL_SYNC_LIMIT)
		);

		this._setVersionId(1);
		this._isDisposed = false;
		this._isDisposing = false;

		this._languageIdentifier = languageIdentifier || NULL_LANGUAGE_IDENTIFIER;
		this._tokenizationListener = TokenizationRegistry.onDidChange((e) => {
			if (e.changedLanguages.indexOf(this._languageIdentifier.language) === -1) {
				return;
			}

			this._resetTokenizationState();
			this.emitModelTokensChangedEvent({
				ranges: [{
					fromLineNumber: 1,
					toLineNumber: this.getLineCount()
				}]
			});

			if (this._shouldAutoTokenize()) {
				this._warmUpTokens();
			}
		});
		this._revalidateTokensTimeout = -1;
		this._languageRegistryListener = LanguageConfigurationRegistry.onDidChange((e) => {
			if (e.languageIdentifier.id === this._languageIdentifier.id) {
				this._onDidChangeLanguageConfiguration.fire({});
			}
		});
		this._resetTokenizationState();

		this._instanceId = singleLetter(MODEL_ID);
		this._lastDecorationId = 0;
		this._decorations = Object.create(null);
		this._decorationsTree = new DecorationsTrees();

		this._commandManager = new EditStack(this);
		this._isUndoing = false;
		this._isRedoing = false;
		this._trimAutoWhitespaceLines = null;
	}

	public dispose(): void {
		this._isDisposing = true;
		this._onWillDispose.fire();
		this._commandManager = null;
		this._decorations = null;
		this._decorationsTree = null;
		this._tokenizationListener.dispose();
		this._languageRegistryListener.dispose();
		this._clearTimers();
		this._tokens = null;
		this._isDisposed = true;
		// Null out members, such that any use of a disposed model will throw exceptions sooner rather than later
		this._buffer = null;
		super.dispose();
		this._isDisposing = false;
	}

	private _assertNotDisposed(): void {
		if (this._isDisposed) {
			throw new Error('Model is disposed!');
		}
	}

	public equalsTextBuffer(other: model.ITextBuffer): boolean {
		this._assertNotDisposed();
		return this._buffer.equals(other);
	}

	private _emitContentChangedEvent(rawChange: ModelRawContentChangedEvent, change: IModelContentChangedEvent): void {
		if (this._isDisposing) {
			// Do not confuse listeners by emitting any event after disposing
			return;
		}
		this._eventEmitter.fire(new InternalModelContentChangeEvent(rawChange, change));
	}

	public setValue(value: string): void {
		this._assertNotDisposed();
		if (value === null) {
			// There's nothing to do
			return;
		}

		const textBuffer = createTextBuffer(value, this._options.defaultEOL);
		this.setValueFromTextBuffer(textBuffer);
	}

	private _createContentChanged2(range: Range, rangeOffset: number, rangeLength: number, text: string, isUndoing: boolean, isRedoing: boolean, isFlush: boolean): IModelContentChangedEvent {
		return {
			changes: [{
				range: range,
				rangeOffset: rangeOffset,
				rangeLength: rangeLength,
				text: text,
			}],
			eol: this._buffer.getEOL(),
			versionId: this.getVersionId(),
			isUndoing: isUndoing,
			isRedoing: isRedoing,
			isFlush: isFlush
		};
	}

	public setValueFromTextBuffer(textBuffer: model.ITextBuffer): void {
		this._assertNotDisposed();
		if (textBuffer === null) {
			// There's nothing to do
			return;
		}
		const oldFullModelRange = this.getFullModelRange();
		const oldModelValueLength = this.getValueLengthInRange(oldFullModelRange);
		const endLineNumber = this.getLineCount();
		const endColumn = this.getLineMaxColumn(endLineNumber);

		this._buffer = textBuffer;
		this._increaseVersionId();

		// Cancel tokenization, clear all tokens and begin tokenizing
		this._resetTokenizationState();

		// Destroy all my decorations
		this._decorations = Object.create(null);
		this._decorationsTree = new DecorationsTrees();

		// Destroy my edit history and settings
		this._commandManager = new EditStack(this);
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
			this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, this.getValue(), false, false, true)
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
			this._createContentChanged2(new Range(1, 1, endLineNumber, endColumn), 0, oldModelValueLength, this.getValue(), false, false, false)
		);
	}

	private _onBeforeEOLChange(): void {
		// Ensure all decorations get their `range` set.
		const versionId = this.getVersionId();
		const allDecorations = this._decorationsTree.search(0, false, false, versionId);
		this._ensureNodesHaveRanges(allDecorations);
	}

	private _onAfterEOLChange(): void {
		// Transform back `range` to offsets
		const versionId = this.getVersionId();
		const allDecorations = this._decorationsTree.collectNodesPostOrder();
		for (let i = 0, len = allDecorations.length; i < len; i++) {
			const node = allDecorations[i];

			const delta = node.cachedAbsoluteStart - node.start;

			const startOffset = this._buffer.getOffsetAt(node.range.startLineNumber, node.range.startColumn);
			const endOffset = this._buffer.getOffsetAt(node.range.endLineNumber, node.range.endColumn);

			node.cachedAbsoluteStart = startOffset;
			node.cachedAbsoluteEnd = endOffset;
			node.cachedVersionId = versionId;

			node.start = startOffset - delta;
			node.end = endOffset - delta;

			recomputeMaxEnd(node);
		}
	}

	private _resetTokenizationState(): void {
		this._clearTimers();
		let tokenizationSupport = (
			this._isTooLargeForTokenization
				? null
				: TokenizationRegistry.get(this._languageIdentifier.language)
		);
		this._tokens = new ModelLinesTokens(this._languageIdentifier, tokenizationSupport);
		this._beginBackgroundTokenization();
	}

	private _clearTimers(): void {
		if (this._revalidateTokensTimeout !== -1) {
			clearTimeout(this._revalidateTokensTimeout);
			this._revalidateTokensTimeout = -1;
		}
	}

	public onBeforeAttached(): void {
		this._attachedEditorCount++;
		// Warm up tokens for the editor
		this._warmUpTokens();
	}

	public onBeforeDetached(): void {
		this._attachedEditorCount--;
	}

	private _shouldAutoTokenize(): boolean {
		return this.isAttachedToEditor();
	}

	public isAttachedToEditor(): boolean {
		return this._attachedEditorCount > 0;
	}

	public getAttachedEditorCount(): number {
		return this._attachedEditorCount;
	}

	public isTooLargeForHavingARichMode(): boolean {
		return this._shouldSimplifyMode;
	}

	public isTooLargeForTokenization(): boolean {
		return this._isTooLargeForTokenization;
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

	public updateOptions(_newOpts: model.ITextModelUpdateOptions): void {
		this._assertNotDisposed();
		let tabSize = (typeof _newOpts.tabSize !== 'undefined') ? _newOpts.tabSize : this._options.tabSize;
		let insertSpaces = (typeof _newOpts.insertSpaces !== 'undefined') ? _newOpts.insertSpaces : this._options.insertSpaces;
		let trimAutoWhitespace = (typeof _newOpts.trimAutoWhitespace !== 'undefined') ? _newOpts.trimAutoWhitespace : this._options.trimAutoWhitespace;

		let newOpts = new model.TextModelResolvedOptions({
			tabSize: tabSize,
			insertSpaces: insertSpaces,
			defaultEOL: this._options.defaultEOL,
			trimAutoWhitespace: trimAutoWhitespace
		});

		if (this._options.equals(newOpts)) {
			return;
		}

		let e = this._options.createChangeEvent(newOpts);
		this._options = newOpts;

		this._onDidChangeOptions.fire(e);
	}

	public detectIndentation(defaultInsertSpaces: boolean, defaultTabSize: number): void {
		this._assertNotDisposed();
		let guessedIndentation = guessIndentation(this._buffer, defaultTabSize, defaultInsertSpaces);
		this.updateOptions({
			insertSpaces: guessedIndentation.insertSpaces,
			tabSize: guessedIndentation.tabSize
		});
	}

	private static _normalizeIndentationFromWhitespace(str: string, tabSize: number, insertSpaces: boolean): string {
		let spacesCnt = 0;
		for (let i = 0; i < str.length; i++) {
			if (str.charAt(i) === '\t') {
				spacesCnt += tabSize;
			} else {
				spacesCnt++;
			}
		}

		let result = '';
		if (!insertSpaces) {
			let tabsCnt = Math.floor(spacesCnt / tabSize);
			spacesCnt = spacesCnt % tabSize;
			for (let i = 0; i < tabsCnt; i++) {
				result += '\t';
			}
		}

		for (let i = 0; i < spacesCnt; i++) {
			result += ' ';
		}

		return result;
	}

	public static normalizeIndentation(str: string, tabSize: number, insertSpaces: boolean): string {
		let firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(str);
		if (firstNonWhitespaceIndex === -1) {
			firstNonWhitespaceIndex = str.length;
		}
		return TextModel._normalizeIndentationFromWhitespace(str.substring(0, firstNonWhitespaceIndex), tabSize, insertSpaces) + str.substring(firstNonWhitespaceIndex);
	}

	public normalizeIndentation(str: string): string {
		this._assertNotDisposed();
		return TextModel.normalizeIndentation(str, this._options.tabSize, this._options.insertSpaces);
	}

	public getOneIndent(): string {
		this._assertNotDisposed();
		let tabSize = this._options.tabSize;
		let insertSpaces = this._options.insertSpaces;

		if (insertSpaces) {
			let result = '';
			for (let i = 0; i < tabSize; i++) {
				result += ' ';
			}
			return result;
		} else {
			return '\t';
		}
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

	public mightContainNonBasicASCII(): boolean {
		return this._buffer.mightContainNonBasicASCII();
	}

	public getAlternativeVersionId(): number {
		this._assertNotDisposed();
		return this._alternativeVersionId;
	}

	public getOffsetAt(rawPosition: IPosition): number {
		this._assertNotDisposed();
		let position = this._validatePosition(rawPosition.lineNumber, rawPosition.column, false);
		return this._buffer.getOffsetAt(position.lineNumber, position.column);
	}

	public getPositionAt(rawOffset: number): Position {
		this._assertNotDisposed();
		let offset = (Math.min(this._buffer.getLength(), Math.max(0, rawOffset)));
		return this._buffer.getPositionAt(offset);
	}

	private _increaseVersionId(): void {
		this._setVersionId(this._versionId + 1);
	}

	private _setVersionId(newVersionId: number): void {
		this._versionId = newVersionId;
		this._alternativeVersionId = this._versionId;
	}

	private _overwriteAlternativeVersionId(newAlternativeVersionId: number): void {
		this._alternativeVersionId = newAlternativeVersionId;
	}

	public getValue(eol?: model.EndOfLinePreference, preserveBOM: boolean = false): string {
		this._assertNotDisposed();
		const fullModelRange = this.getFullModelRange();
		const fullModelValue = this.getValueInRange(fullModelRange, eol);

		if (preserveBOM) {
			return this._buffer.getBOM() + fullModelValue;
		}

		return fullModelValue;
	}

	public createSnapshot(preserveBOM: boolean = false): ITextSnapshot {
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

	public getLineCount(): number {
		this._assertNotDisposed();
		return this._buffer.getLineCount();
	}

	public getLineContent(lineNumber: number): string {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}

		return this._buffer.getLineContent(lineNumber);
	}

	public getLineLength(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}

		return this._buffer.getLineLength(lineNumber);
	}

	public getLinesContent(): string[] {
		this._assertNotDisposed();
		return this._buffer.getLinesContent();
	}

	public getEOL(): string {
		this._assertNotDisposed();
		return this._buffer.getEOL();
	}

	public getLineMinColumn(lineNumber: number): number {
		this._assertNotDisposed();
		return 1;
	}

	public getLineMaxColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}
		return this._buffer.getLineLength(lineNumber) + 1;
	}

	public getLineFirstNonWhitespaceColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}
		return this._buffer.getLineFirstNonWhitespaceColumn(lineNumber);
	}

	public getLineLastNonWhitespaceColumn(lineNumber: number): number {
		this._assertNotDisposed();
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}
		return this._buffer.getLineLastNonWhitespaceColumn(lineNumber);
	}

	/**
	 * Validates `range` is within buffer bounds, but allows it to sit in between surrogate pairs, etc.
	 * Will try to not allocate if possible.
	 */
	private _validateRangeRelaxedNoAllocations(range: IRange): Range {
		const linesCount = this._buffer.getLineCount();

		const initialStartLineNumber = range.startLineNumber;
		const initialStartColumn = range.startColumn;
		let startLineNumber: number;
		let startColumn: number;

		if (initialStartLineNumber < 1) {
			startLineNumber = 1;
			startColumn = 1;
		} else if (initialStartLineNumber > linesCount) {
			startLineNumber = linesCount;
			startColumn = this.getLineMaxColumn(startLineNumber);
		} else {
			startLineNumber = initialStartLineNumber | 0;
			if (initialStartColumn <= 1) {
				startColumn = 1;
			} else {
				const maxColumn = this.getLineMaxColumn(startLineNumber);
				if (initialStartColumn >= maxColumn) {
					startColumn = maxColumn;
				} else {
					startColumn = initialStartColumn | 0;
				}
			}
		}

		const initialEndLineNumber = range.endLineNumber;
		const initialEndColumn = range.endColumn;
		let endLineNumber: number;
		let endColumn: number;

		if (initialEndLineNumber < 1) {
			endLineNumber = 1;
			endColumn = 1;
		} else if (initialEndLineNumber > linesCount) {
			endLineNumber = linesCount;
			endColumn = this.getLineMaxColumn(endLineNumber);
		} else {
			endLineNumber = initialEndLineNumber | 0;
			if (initialEndColumn <= 1) {
				endColumn = 1;
			} else {
				const maxColumn = this.getLineMaxColumn(endLineNumber);
				if (initialEndColumn >= maxColumn) {
					endColumn = maxColumn;
				} else {
					endColumn = initialEndColumn | 0;
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

	/**
	 * @param strict Do NOT allow a position inside a high-low surrogate pair
	 */
	private _isValidPosition(lineNumber: number, column: number, strict: boolean): boolean {

		if (lineNumber < 1) {
			return false;
		}

		const lineCount = this._buffer.getLineCount();
		if (lineNumber > lineCount) {
			return false;
		}

		if (column < 1) {
			return false;
		}

		const maxColumn = this.getLineMaxColumn(lineNumber);
		if (column > maxColumn) {
			return false;
		}

		if (strict) {
			if (column > 1) {
				const charCodeBefore = this._buffer.getLineCharCode(lineNumber, column - 2);
				if (strings.isHighSurrogate(charCodeBefore)) {
					return false;
				}
			}
		}

		return true;
	}

	/**
	 * @param strict Do NOT allow a position inside a high-low surrogate pair
	 */
	private _validatePosition(_lineNumber: number, _column: number, strict: boolean): Position {
		const lineNumber = Math.floor(typeof _lineNumber === 'number' ? _lineNumber : 1);
		const column = Math.floor(typeof _column === 'number' ? _column : 1);
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

		if (strict) {
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
		this._assertNotDisposed();

		// Avoid object allocation and cover most likely case
		if (position instanceof Position) {
			if (this._isValidPosition(position.lineNumber, position.column, true)) {
				return position;
			}
		}

		return this._validatePosition(position.lineNumber, position.column, true);
	}

	/**
	 * @param strict Do NOT allow a range to have its boundaries inside a high-low surrogate pair
	 */
	private _isValidRange(range: Range, strict: boolean): boolean {
		const startLineNumber = range.startLineNumber;
		const startColumn = range.startColumn;
		const endLineNumber = range.endLineNumber;
		const endColumn = range.endColumn;

		if (!this._isValidPosition(startLineNumber, startColumn, false)) {
			return false;
		}
		if (!this._isValidPosition(endLineNumber, endColumn, false)) {
			return false;
		}

		if (strict) {
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
		this._assertNotDisposed();

		// Avoid object allocation and cover most likely case
		if ((_range instanceof Range) && !(_range instanceof Selection)) {
			if (this._isValidRange(_range, true)) {
				return _range;
			}
		}

		const start = this._validatePosition(_range.startLineNumber, _range.startColumn, false);
		const end = this._validatePosition(_range.endLineNumber, _range.endColumn, false);

		const startLineNumber = start.lineNumber;
		const startColumn = start.column;
		const endLineNumber = end.lineNumber;
		const endColumn = end.column;

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

	public modifyPosition(rawPosition: IPosition, offset: number): Position {
		this._assertNotDisposed();
		let candidate = this.getOffsetAt(rawPosition) + offset;
		return this.getPositionAt(Math.min(this._buffer.getLength(), Math.max(0, candidate)));
	}

	public getFullModelRange(): Range {
		this._assertNotDisposed();
		const lineCount = this.getLineCount();
		return new Range(1, 1, lineCount, this.getLineMaxColumn(lineCount));
	}

	private findMatchesLineByLine(searchRange: Range, searchData: SearchData, captureMatches: boolean, limitResultCount: number): model.FindMatch[] {
		return this._buffer.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
	}

	public findMatches(searchString: string, rawSearchScope: any, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean, limitResultCount: number = LIMIT_FIND_COUNT): model.FindMatch[] {
		this._assertNotDisposed();

		let searchRange: Range;
		if (Range.isIRange(rawSearchScope)) {
			searchRange = this.validateRange(rawSearchScope);
		} else {
			searchRange = this.getFullModelRange();
		}

		if (!isRegex && searchString.indexOf('\n') < 0) {
			// not regex, not multi line
			const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
			const searchData = searchParams.parseSearchRequest();

			if (!searchData) {
				return [];
			}

			return this.findMatchesLineByLine(searchRange, searchData, captureMatches, limitResultCount);
		}

		return TextModelSearch.findMatches(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchRange, captureMatches, limitResultCount);
	}

	public findNextMatch(searchString: string, rawSearchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean): model.FindMatch {
		this._assertNotDisposed();
		const searchStart = this.validatePosition(rawSearchStart);

		if (!isRegex && searchString.indexOf('\n') < 0) {
			const searchParams = new SearchParams(searchString, isRegex, matchCase, wordSeparators);
			const searchData = searchParams.parseSearchRequest();
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

	public findPreviousMatch(searchString: string, rawSearchStart: IPosition, isRegex: boolean, matchCase: boolean, wordSeparators: string, captureMatches: boolean): model.FindMatch {
		this._assertNotDisposed();
		const searchStart = this.validatePosition(rawSearchStart);
		return TextModelSearch.findPreviousMatch(this, new SearchParams(searchString, isRegex, matchCase, wordSeparators), searchStart, captureMatches);
	}

	//#endregion

	//#region Editing

	public pushStackElement(): void {
		this._commandManager.pushStackElement();
	}

	public pushEditOperations(beforeCursorState: Selection[], editOperations: model.IIdentifiedSingleEditOperation[], cursorStateComputer: model.ICursorStateComputer): Selection[] {
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			return this._pushEditOperations(beforeCursorState, editOperations, cursorStateComputer);
		} finally {
			this._eventEmitter.endDeferredEmit();
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private _pushEditOperations(beforeCursorState: Selection[], editOperations: model.IIdentifiedSingleEditOperation[], cursorStateComputer: model.ICursorStateComputer): Selection[] {
		if (this._options.trimAutoWhitespace && this._trimAutoWhitespaceLines) {
			// Go through each saved line number and insert a trim whitespace edit
			// if it is safe to do so (no conflicts with other edits).

			let incomingEdits = editOperations.map((op) => {
				return {
					range: this.validateRange(op.range),
					text: op.text
				};
			});

			// Sometimes, auto-formatters change ranges automatically which can cause undesired auto whitespace trimming near the cursor
			// We'll use the following heuristic: if the edits occur near the cursor, then it's ok to trim auto whitespace
			let editsAreNearCursors = true;
			for (let i = 0, len = beforeCursorState.length; i < len; i++) {
				let sel = beforeCursorState[i];
				let foundEditNearSel = false;
				for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
					let editRange = incomingEdits[j].range;
					let selIsAbove = editRange.startLineNumber > sel.endLineNumber;
					let selIsBelow = sel.startLineNumber > editRange.endLineNumber;
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

			if (editsAreNearCursors) {
				for (let i = 0, len = this._trimAutoWhitespaceLines.length; i < len; i++) {
					let trimLineNumber = this._trimAutoWhitespaceLines[i];
					let maxLineColumn = this.getLineMaxColumn(trimLineNumber);

					let allowTrimLine = true;
					for (let j = 0, lenJ = incomingEdits.length; j < lenJ; j++) {
						let editRange = incomingEdits[j].range;
						let editText = incomingEdits[j].text;

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

						// Looks like we can't trim this line as it would interfere with an incoming edit
						allowTrimLine = false;
						break;
					}

					if (allowTrimLine) {
						editOperations.push({
							range: new Range(trimLineNumber, 1, trimLineNumber, maxLineColumn),
							text: null
						});
					}

				}
			}

			this._trimAutoWhitespaceLines = null;
		}
		return this._commandManager.pushEditOperation(beforeCursorState, editOperations, cursorStateComputer);
	}

	public applyEdits(rawOperations: model.IIdentifiedSingleEditOperation[]): model.IIdentifiedSingleEditOperation[] {
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			return this._applyEdits(rawOperations);
		} finally {
			this._eventEmitter.endDeferredEmit();
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private static _eolCount(text: string): [number, number] {
		let eolCount = 0;
		let firstLineLength = 0;
		for (let i = 0, len = text.length; i < len; i++) {
			const chr = text.charCodeAt(i);

			if (chr === CharCode.CarriageReturn) {
				if (eolCount === 0) {
					firstLineLength = i;
				}
				eolCount++;
				if (i + 1 < len && text.charCodeAt(i + 1) === CharCode.LineFeed) {
					// \r\n... case
					i++; // skip \n
				} else {
					// \r... case
				}
			} else if (chr === CharCode.LineFeed) {
				if (eolCount === 0) {
					firstLineLength = i;
				}
				eolCount++;
			}
		}
		if (eolCount === 0) {
			firstLineLength = text.length;
		}
		return [eolCount, firstLineLength];
	}

	private _applyEdits(rawOperations: model.IIdentifiedSingleEditOperation[]): model.IIdentifiedSingleEditOperation[] {
		for (let i = 0, len = rawOperations.length; i < len; i++) {
			rawOperations[i].range = this.validateRange(rawOperations[i].range);
		}

		const oldLineCount = this._buffer.getLineCount();
		const result = this._buffer.applyEdits(rawOperations, this._options.trimAutoWhitespace);
		const newLineCount = this._buffer.getLineCount();

		const contentChanges = result.changes;
		this._trimAutoWhitespaceLines = result.trimAutoWhitespaceLineNumbers;

		if (contentChanges.length !== 0) {
			let rawContentChanges: ModelRawChange[] = [];

			let lineCount = oldLineCount;
			for (let i = 0, len = contentChanges.length; i < len; i++) {
				const change = contentChanges[i];
				const [eolCount, firstLineLength] = TextModel._eolCount(change.text);
				this._tokens.applyEdits(change.range, eolCount, firstLineLength);
				this._onDidChangeDecorations.fire();
				this._decorationsTree.acceptReplace(change.rangeOffset, change.rangeLength, change.text.length, change.forceMoveMarkers);

				const startLineNumber = change.range.startLineNumber;
				const endLineNumber = change.range.endLineNumber;

				const deletingLinesCnt = endLineNumber - startLineNumber;
				const insertingLinesCnt = eolCount;
				const editingLinesCnt = Math.min(deletingLinesCnt, insertingLinesCnt);

				const changeLineCountDelta = (insertingLinesCnt - deletingLinesCnt);

				for (let j = editingLinesCnt; j >= 0; j--) {
					const editLineNumber = startLineNumber + j;
					const currentEditLineNumber = newLineCount - lineCount - changeLineCountDelta + editLineNumber;
					rawContentChanges.push(new ModelRawLineChanged(editLineNumber, this.getLineContent(currentEditLineNumber)));
				}

				if (editingLinesCnt < deletingLinesCnt) {
					// Must delete some lines
					const spliceStartLineNumber = startLineNumber + editingLinesCnt;
					rawContentChanges.push(new ModelRawLinesDeleted(spliceStartLineNumber + 1, endLineNumber));
				}

				if (editingLinesCnt < insertingLinesCnt) {
					// Must insert some lines
					const spliceLineNumber = startLineNumber + editingLinesCnt;
					const cnt = insertingLinesCnt - editingLinesCnt;
					const fromLineNumber = newLineCount - lineCount - cnt + spliceLineNumber + 1;
					let newLines: string[] = [];
					for (let i = 0; i < cnt; i++) {
						let lineNumber = fromLineNumber + i;
						newLines[lineNumber - fromLineNumber] = this.getLineContent(lineNumber);
					}
					rawContentChanges.push(new ModelRawLinesInserted(spliceLineNumber + 1, startLineNumber + insertingLinesCnt, newLines));
				}

				lineCount += changeLineCountDelta;
			}

			this._increaseVersionId();

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
					versionId: this.getVersionId(),
					isUndoing: this._isUndoing,
					isRedoing: this._isRedoing,
					isFlush: false
				}
			);
		}

		if (this._tokens.hasLinesToTokenize(this._buffer)) {
			this._beginBackgroundTokenization();
		}

		return result.reverseEdits;
	}

	private _undo(): Selection[] {
		this._isUndoing = true;
		let r = this._commandManager.undo();
		this._isUndoing = false;

		if (!r) {
			return null;
		}

		this._overwriteAlternativeVersionId(r.recordedVersionId);

		return r.selections;
	}

	public undo(): Selection[] {
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			return this._undo();
		} finally {
			this._eventEmitter.endDeferredEmit();
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private _redo(): Selection[] {
		this._isRedoing = true;
		let r = this._commandManager.redo();
		this._isRedoing = false;

		if (!r) {
			return null;
		}

		this._overwriteAlternativeVersionId(r.recordedVersionId);

		return r.selections;
	}

	public redo(): Selection[] {
		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			this._eventEmitter.beginDeferredEmit();
			return this._redo();
		} finally {
			this._eventEmitter.endDeferredEmit();
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	//#endregion

	//#region Decorations

	public changeDecorations<T>(callback: (changeAccessor: model.IModelDecorationsChangeAccessor) => T, ownerId: number = 0): T {
		this._assertNotDisposed();

		try {
			this._onDidChangeDecorations.beginDeferredEmit();
			return this._changeDecorations(ownerId, callback);
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	private _changeDecorations<T>(ownerId: number, callback: (changeAccessor: model.IModelDecorationsChangeAccessor) => T): T {
		let changeAccessor: model.IModelDecorationsChangeAccessor = {
			addDecoration: (range: IRange, options: model.IModelDecorationOptions): string => {
				this._onDidChangeDecorations.fire();
				return this._deltaDecorationsImpl(ownerId, [], [{ range: range, options: options }])[0];
			},
			changeDecoration: (id: string, newRange: IRange): void => {
				this._onDidChangeDecorations.fire();
				this._changeDecorationImpl(id, newRange);
			},
			changeDecorationOptions: (id: string, options: model.IModelDecorationOptions) => {
				this._onDidChangeDecorations.fire();
				this._changeDecorationOptionsImpl(id, _normalizeOptions(options));
			},
			removeDecoration: (id: string): void => {
				this._onDidChangeDecorations.fire();
				this._deltaDecorationsImpl(ownerId, [id], []);
			},
			deltaDecorations: (oldDecorations: string[], newDecorations: model.IModelDeltaDecoration[]): string[] => {
				if (oldDecorations.length === 0 && newDecorations.length === 0) {
					// nothing to do
					return [];
				}
				this._onDidChangeDecorations.fire();
				return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
			}
		};
		let result: T = null;
		try {
			result = callback(changeAccessor);
		} catch (e) {
			onUnexpectedError(e);
		}
		// Invalidate change accessor
		changeAccessor.addDecoration = null;
		changeAccessor.changeDecoration = null;
		changeAccessor.removeDecoration = null;
		changeAccessor.deltaDecorations = null;
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
			this._onDidChangeDecorations.beginDeferredEmit();
			this._onDidChangeDecorations.fire();
			return this._deltaDecorationsImpl(ownerId, oldDecorations, newDecorations);
		} finally {
			this._onDidChangeDecorations.endDeferredEmit();
		}
	}

	_getTrackedRange(id: string): Range {
		return this.getDecorationRange(id);
	}

	_setTrackedRange(id: string, newRange: Range, newStickiness: model.TrackedRangeStickiness): string {
		const node = (id ? this._decorations[id] : null);

		if (!node) {
			if (!newRange) {
				// node doesn't exist, the request is to delete => nothing to do
				return null;
			}
			// node doesn't exist, the request is to set => add the tracked range
			return this._deltaDecorationsImpl(0, [], [{ range: newRange, options: TRACKED_RANGE_OPTIONS[newStickiness] }])[0];
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

	public getDecorationOptions(decorationId: string): model.IModelDecorationOptions {
		const node = this._decorations[decorationId];
		if (!node) {
			return null;
		}
		return node.options;
	}

	public getDecorationRange(decorationId: string): Range {
		const node = this._decorations[decorationId];
		if (!node) {
			return null;
		}
		const versionId = this.getVersionId();
		if (node.cachedVersionId !== versionId) {
			this._decorationsTree.resolveNode(node, versionId);
		}
		if (node.range === null) {
			node.range = this._getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
		}
		return node.range;
	}

	public getLineDecorations(lineNumber: number, ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			return [];
		}

		return this.getLinesDecorations(lineNumber, lineNumber, ownerId, filterOutValidation);
	}

	public getLinesDecorations(_startLineNumber: number, _endLineNumber: number, ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		let lineCount = this.getLineCount();
		let startLineNumber = Math.min(lineCount, Math.max(1, _startLineNumber));
		let endLineNumber = Math.min(lineCount, Math.max(1, _endLineNumber));
		let endColumn = this.getLineMaxColumn(endLineNumber);
		return this._getDecorationsInRange(new Range(startLineNumber, 1, endLineNumber, endColumn), ownerId, filterOutValidation);
	}

	public getDecorationsInRange(range: IRange, ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		let validatedRange = this.validateRange(range);
		return this._getDecorationsInRange(validatedRange, ownerId, filterOutValidation);
	}

	public getOverviewRulerDecorations(ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		const versionId = this.getVersionId();
		const result = this._decorationsTree.search(ownerId, filterOutValidation, true, versionId);
		return this._ensureNodesHaveRanges(result);
	}

	public getAllDecorations(ownerId: number = 0, filterOutValidation: boolean = false): model.IModelDecoration[] {
		const versionId = this.getVersionId();
		const result = this._decorationsTree.search(ownerId, filterOutValidation, false, versionId);
		return this._ensureNodesHaveRanges(result);
	}

	private _getDecorationsInRange(filterRange: Range, filterOwnerId: number, filterOutValidation: boolean): IntervalNode[] {
		const startOffset = this._buffer.getOffsetAt(filterRange.startLineNumber, filterRange.startColumn);
		const endOffset = this._buffer.getOffsetAt(filterRange.endLineNumber, filterRange.endColumn);

		const versionId = this.getVersionId();
		const result = this._decorationsTree.intervalSearch(startOffset, endOffset, filterOwnerId, filterOutValidation, versionId);

		return this._ensureNodesHaveRanges(result);
	}

	private _ensureNodesHaveRanges(nodes: IntervalNode[]): IntervalNode[] {
		for (let i = 0, len = nodes.length; i < len; i++) {
			const node = nodes[i];
			if (node.range === null) {
				node.range = this._getRangeAt(node.cachedAbsoluteStart, node.cachedAbsoluteEnd);
			}
		}
		return nodes;
	}

	private _getRangeAt(start: number, end: number): Range {
		return this._buffer.getRangeAt(start, end - start);
	}

	private _changeDecorationImpl(decorationId: string, _range: IRange): void {
		const node = this._decorations[decorationId];
		if (!node) {
			return;
		}
		const range = this._validateRangeRelaxedNoAllocations(_range);
		const startOffset = this._buffer.getOffsetAt(range.startLineNumber, range.startColumn);
		const endOffset = this._buffer.getOffsetAt(range.endLineNumber, range.endColumn);

		this._decorationsTree.delete(node);
		node.reset(this.getVersionId(), startOffset, endOffset, range);
		this._decorationsTree.insert(node);
	}

	private _changeDecorationOptionsImpl(decorationId: string, options: ModelDecorationOptions): void {
		const node = this._decorations[decorationId];
		if (!node) {
			return;
		}

		const nodeWasInOverviewRuler = (node.options.overviewRuler.color ? true : false);
		const nodeIsInOverviewRuler = (options.overviewRuler.color ? true : false);

		if (nodeWasInOverviewRuler !== nodeIsInOverviewRuler) {
			// Delete + Insert due to an overview ruler status change
			this._decorationsTree.delete(node);
			node.setOptions(options);
			this._decorationsTree.insert(node);
		} else {
			node.setOptions(options);
		}
	}

	private _deltaDecorationsImpl(ownerId: number, oldDecorationsIds: string[], newDecorations: model.IModelDeltaDecoration[]): string[] {
		const versionId = this.getVersionId();

		const oldDecorationsLen = oldDecorationsIds.length;
		let oldDecorationIndex = 0;

		const newDecorationsLen = newDecorations.length;
		let newDecorationIndex = 0;

		let result = new Array<string>(newDecorationsLen);
		while (oldDecorationIndex < oldDecorationsLen || newDecorationIndex < newDecorationsLen) {

			let node: IntervalNode = null;

			if (oldDecorationIndex < oldDecorationsLen) {
				// (1) get ourselves an old node
				do {
					node = this._decorations[oldDecorationsIds[oldDecorationIndex++]];
				} while (!node && oldDecorationIndex < oldDecorationsLen);

				// (2) remove the node from the tree (if it exists)
				if (node) {
					this._decorationsTree.delete(node);
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
	}

	//#endregion

	//#region Tokenization

	public tokenizeViewport(startLineNumber: number, endLineNumber: number): void {
		if (!this._tokens.tokenizationSupport) {
			return;
		}

		// we tokenize `this._tokens.inValidLineStartIndex` lines in around 20ms so it's a good baseline.
		const contextBefore = Math.floor(this._tokens.inValidLineStartIndex * 0.3);
		startLineNumber = Math.max(1, startLineNumber - contextBefore);

		if (startLineNumber <= this._tokens.inValidLineStartIndex) {
			this.forceTokenization(endLineNumber);
			return;
		}

		const eventBuilder = new ModelTokensChangedEventBuilder();
		let nonWhitespaceColumn = this.getLineFirstNonWhitespaceColumn(startLineNumber);
		let fakeLines = [];
		let i = startLineNumber - 1;
		let initialState = null;
		if (nonWhitespaceColumn > 0) {
			while (nonWhitespaceColumn > 0 && i >= 1) {
				let newNonWhitespaceIndex = this.getLineFirstNonWhitespaceColumn(i);

				if (newNonWhitespaceIndex === 0) {
					i--;
					continue;
				}

				if (newNonWhitespaceIndex < nonWhitespaceColumn) {
					initialState = this._tokens._getState(i - 1);
					if (initialState) {
						break;
					}
					fakeLines.push(this.getLineContent(i));
					nonWhitespaceColumn = newNonWhitespaceIndex;
				}

				i--;
			}
		}

		if (!initialState) {
			initialState = this._tokens.tokenizationSupport.getInitialState();
		}

		let state = initialState.clone();
		for (let i = fakeLines.length - 1; i >= 0; i--) {
			let r = this._tokens._tokenizeText(this._buffer, fakeLines[i], state);
			if (r) {
				state = r.endState.clone();
			} else {
				state = initialState.clone();
			}
		}

		const contextAfter = Math.floor(this._tokens.inValidLineStartIndex * 0.4);
		endLineNumber = Math.min(this.getLineCount(), endLineNumber + contextAfter);
		for (let i = startLineNumber; i <= endLineNumber; i++) {
			let text = this.getLineContent(i);
			let r = this._tokens._tokenizeText(this._buffer, text, state);
			if (r) {
				this._tokens._setTokens(this._tokens.languageIdentifier.id, i - 1, text.length, r.tokens);
				/*
				 * we think it's valid and give it a state but we don't update `_invalidLineStartIndex` then the top-to-bottom tokenization
				 * goes through the viewport, it can skip them if they already have correct tokens and state, and the lines after the viewport
				 * can still be tokenized.
				 */
				this._tokens._setIsInvalid(i - 1, false);
				this._tokens._setState(i - 1, state);
				state = r.endState.clone();
				eventBuilder.registerChangedTokens(i);
			} else {
				state = initialState.clone();
			}
		}

		const e = eventBuilder.build();
		if (e) {
			this._onDidChangeTokens.fire(e);
		}
	}

	public forceTokenization(lineNumber: number): void {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}

		const eventBuilder = new ModelTokensChangedEventBuilder();

		this._tokens._updateTokensUntilLine(this._buffer, eventBuilder, lineNumber);

		const e = eventBuilder.build();
		if (e) {
			this._onDidChangeTokens.fire(e);
		}
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		return this._tokens.isCheapToTokenize(lineNumber);
	}

	public tokenizeIfCheap(lineNumber: number): void {
		if (this.isCheapToTokenize(lineNumber)) {
			this.forceTokenization(lineNumber);
		}
	}

	public getLineTokens(lineNumber: number): LineTokens {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value for lineNumber');
		}

		return this._getLineTokens(lineNumber);
	}

	private _getLineTokens(lineNumber: number): LineTokens {
		const lineText = this._buffer.getLineContent(lineNumber);
		return this._tokens.getTokens(this._languageIdentifier.id, lineNumber - 1, lineText);
	}

	public getLanguageIdentifier(): LanguageIdentifier {
		return this._languageIdentifier;
	}

	public getModeId(): string {
		return this._languageIdentifier.language;
	}

	public setMode(languageIdentifier: LanguageIdentifier): void {
		if (this._languageIdentifier.id === languageIdentifier.id) {
			// There's nothing to do
			return;
		}

		let e: IModelLanguageChangedEvent = {
			oldLanguage: this._languageIdentifier.language,
			newLanguage: languageIdentifier.language
		};

		this._languageIdentifier = languageIdentifier;

		// Cancel tokenization, clear all tokens and begin tokenizing
		this._resetTokenizationState();

		this.emitModelTokensChangedEvent({
			ranges: [{
				fromLineNumber: 1,
				toLineNumber: this.getLineCount()
			}]
		});
		this._onDidChangeLanguage.fire(e);
		this._onDidChangeLanguageConfiguration.fire({});
	}

	public getLanguageIdAtPosition(_lineNumber: number, _column: number): LanguageId {
		if (!this._tokens.tokenizationSupport) {
			return this._languageIdentifier.id;
		}
		let { lineNumber, column } = this.validatePosition({ lineNumber: _lineNumber, column: _column });

		let lineTokens = this._getLineTokens(lineNumber);
		return lineTokens.getLanguageId(lineTokens.findTokenIndexAtOffset(column - 1));
	}

	private _beginBackgroundTokenization(): void {
		if (this._shouldAutoTokenize() && this._revalidateTokensTimeout === -1) {
			this._revalidateTokensTimeout = setTimeout(() => {
				this._revalidateTokensTimeout = -1;
				this._revalidateTokensNow();
			}, 0);
		}
	}

	_warmUpTokens(): void {
		// Warm up first 100 lines (if it takes less than 50ms)
		const maxLineNumber = Math.min(100, this.getLineCount());
		this._revalidateTokensNow(maxLineNumber);

		if (this._tokens.hasLinesToTokenize(this._buffer)) {
			this._beginBackgroundTokenization();
		}
	}

	private _revalidateTokensNow(toLineNumber: number = this._buffer.getLineCount()): void {
		const MAX_ALLOWED_TIME = 20;
		const eventBuilder = new ModelTokensChangedEventBuilder();
		const sw = StopWatch.create(false);

		while (this._tokens.hasLinesToTokenize(this._buffer)) {
			if (sw.elapsed() > MAX_ALLOWED_TIME) {
				// Stop if MAX_ALLOWED_TIME is reached
				break;
			}

			const tokenizedLineNumber = this._tokens._tokenizeOneLine(this._buffer, eventBuilder);

			if (tokenizedLineNumber >= toLineNumber) {
				break;
			}
		}

		if (this._tokens.hasLinesToTokenize(this._buffer)) {
			this._beginBackgroundTokenization();
		}

		const e = eventBuilder.build();
		if (e) {
			this._onDidChangeTokens.fire(e);
		}
	}

	private emitModelTokensChangedEvent(e: IModelTokensChangedEvent): void {
		if (!this._isDisposing) {
			this._onDidChangeTokens.fire(e);
		}
	}

	// Having tokens allows implementing additional helper methods

	public getWordAtPosition(_position: IPosition): model.IWordAtPosition {
		this._assertNotDisposed();
		const position = this.validatePosition(_position);
		const lineContent = this.getLineContent(position.lineNumber);
		const lineTokens = this._getLineTokens(position.lineNumber);
		const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);

		// (1). First try checking right biased word
		const [rbStartOffset, rbEndOffset] = TextModel._findLanguageBoundaries(lineTokens, tokenIndex);
		const rightBiasedWord = getWordAtText(
			position.column,
			LanguageConfigurationRegistry.getWordDefinition(lineTokens.getLanguageId(tokenIndex)),
			lineContent.substring(rbStartOffset, rbEndOffset),
			rbStartOffset
		);
		if (rightBiasedWord) {
			return rightBiasedWord;
		}

		// (2). Else, if we were at a language boundary, check the left biased word
		if (tokenIndex > 0 && rbStartOffset === position.column - 1) {
			// edge case, where `position` sits between two tokens belonging to two different languages
			const [lbStartOffset, lbEndOffset] = TextModel._findLanguageBoundaries(lineTokens, tokenIndex - 1);
			const leftBiasedWord = getWordAtText(
				position.column,
				LanguageConfigurationRegistry.getWordDefinition(lineTokens.getLanguageId(tokenIndex - 1)),
				lineContent.substring(lbStartOffset, lbEndOffset),
				lbStartOffset
			);
			if (leftBiasedWord) {
				return leftBiasedWord;
			}
		}

		return null;
	}

	private static _findLanguageBoundaries(lineTokens: LineTokens, tokenIndex: number): [number, number] {
		const languageId = lineTokens.getLanguageId(tokenIndex);

		// go left until a different language is hit
		let startOffset: number;
		for (let i = tokenIndex; i >= 0 && lineTokens.getLanguageId(i) === languageId; i--) {
			startOffset = lineTokens.getStartOffset(i);
		}

		// go right until a different language is hit
		let endOffset: number;
		for (let i = tokenIndex, tokenCount = lineTokens.getCount(); i < tokenCount && lineTokens.getLanguageId(i) === languageId; i++) {
			endOffset = lineTokens.getEndOffset(i);
		}

		return [startOffset, endOffset];
	}

	public getWordUntilPosition(position: IPosition): model.IWordAtPosition {
		const wordAtPosition = this.getWordAtPosition(position);
		if (!wordAtPosition) {
			return {
				word: '',
				startColumn: position.column,
				endColumn: position.column
			};
		}
		return {
			word: wordAtPosition.word.substr(0, position.column - wordAtPosition.startColumn),
			startColumn: wordAtPosition.startColumn,
			endColumn: position.column
		};
	}

	public findMatchingBracketUp(_bracket: string, _position: IPosition): Range {
		let bracket = _bracket.toLowerCase();
		let position = this.validatePosition(_position);

		let lineTokens = this._getLineTokens(position.lineNumber);
		let languageId = lineTokens.getLanguageId(lineTokens.findTokenIndexAtOffset(position.column - 1));
		let bracketsSupport = LanguageConfigurationRegistry.getBracketsSupport(languageId);

		if (!bracketsSupport) {
			return null;
		}

		let data = bracketsSupport.textIsBracket[bracket];

		if (!data) {
			return null;
		}

		return this._findMatchingBracketUp(data, position);
	}

	public matchBracket(position: IPosition): [Range, Range] {
		return this._matchBracket(this.validatePosition(position));
	}

	private _matchBracket(position: Position): [Range, Range] {
		const lineNumber = position.lineNumber;
		const lineTokens = this._getLineTokens(lineNumber);
		const lineText = this._buffer.getLineContent(lineNumber);

		let tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
		if (tokenIndex < 0) {
			return null;
		}
		const currentModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(lineTokens.getLanguageId(tokenIndex));

		// check that the token is not to be ignored
		if (currentModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex))) {
			// limit search to not go before `maxBracketLength`
			let searchStartOffset = Math.max(lineTokens.getStartOffset(tokenIndex), position.column - 1 - currentModeBrackets.maxBracketLength);
			// limit search to not go after `maxBracketLength`
			const searchEndOffset = Math.min(lineTokens.getEndOffset(tokenIndex), position.column - 1 + currentModeBrackets.maxBracketLength);

			// first, check if there is a bracket to the right of `position`
			let foundBracket = BracketsUtils.findNextBracketInToken(currentModeBrackets.forwardRegex, lineNumber, lineText, position.column - 1, searchEndOffset);
			if (foundBracket && foundBracket.startColumn === position.column) {
				let foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1);
				foundBracketText = foundBracketText.toLowerCase();

				let r = this._matchFoundBracket(foundBracket, currentModeBrackets.textIsBracket[foundBracketText], currentModeBrackets.textIsOpenBracket[foundBracketText]);

				// check that we can actually match this bracket
				if (r) {
					return r;
				}
			}

			// it might still be the case that [currentTokenStart -> currentTokenEnd] contains multiple brackets
			while (true) {
				let foundBracket = BracketsUtils.findNextBracketInToken(currentModeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (!foundBracket) {
					// there are no brackets in this text
					break;
				}

				// check that we didn't hit a bracket too far away from position
				if (foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
					let foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1);
					foundBracketText = foundBracketText.toLowerCase();

					let r = this._matchFoundBracket(foundBracket, currentModeBrackets.textIsBracket[foundBracketText], currentModeBrackets.textIsOpenBracket[foundBracketText]);

					// check that we can actually match this bracket
					if (r) {
						return r;
					}
				}

				searchStartOffset = foundBracket.endColumn - 1;
			}
		}

		// If position is in between two tokens, try also looking in the previous token
		if (tokenIndex > 0 && lineTokens.getStartOffset(tokenIndex) === position.column - 1) {
			const searchEndOffset = lineTokens.getStartOffset(tokenIndex);
			tokenIndex--;
			const prevModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(lineTokens.getLanguageId(tokenIndex));

			// check that previous token is not to be ignored
			if (prevModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex))) {
				// limit search in case previous token is very large, there's no need to go beyond `maxBracketLength`
				const searchStartOffset = Math.max(lineTokens.getStartOffset(tokenIndex), position.column - 1 - prevModeBrackets.maxBracketLength);
				const foundBracket = BracketsUtils.findPrevBracketInToken(prevModeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);

				// check that we didn't hit a bracket too far away from position
				if (foundBracket && foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
					let foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1);
					foundBracketText = foundBracketText.toLowerCase();

					let r = this._matchFoundBracket(foundBracket, prevModeBrackets.textIsBracket[foundBracketText], prevModeBrackets.textIsOpenBracket[foundBracketText]);

					// check that we can actually match this bracket
					if (r) {
						return r;
					}
				}
			}
		}

		return null;
	}

	private _matchFoundBracket(foundBracket: Range, data: RichEditBracket, isOpen: boolean): [Range, Range] {
		if (isOpen) {
			let matched = this._findMatchingBracketDown(data, foundBracket.getEndPosition());
			if (matched) {
				return [foundBracket, matched];
			}
		} else {
			let matched = this._findMatchingBracketUp(data, foundBracket.getStartPosition());
			if (matched) {
				return [foundBracket, matched];
			}
		}

		return null;
	}

	private _findMatchingBracketUp(bracket: RichEditBracket, position: Position): Range {
		// console.log('_findMatchingBracketUp: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		const languageId = bracket.languageIdentifier.id;
		const reversedBracketRegex = bracket.reversedRegex;
		let count = -1;

		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			const lineTokens = this._getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this._buffer.getLineContent(lineNumber);

			let tokenIndex = tokenCount - 1;
			let searchStopOffset = -1;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStopOffset = position.column - 1;
			}

			for (; tokenIndex >= 0; tokenIndex--) {
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
				const tokenType = lineTokens.getStandardTokenType(tokenIndex);
				const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
				const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);

				if (searchStopOffset === -1) {
					searchStopOffset = tokenEndOffset;
				}

				if (tokenLanguageId === languageId && !ignoreBracketsInToken(tokenType)) {

					while (true) {
						let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, lineNumber, lineText, tokenStartOffset, searchStopOffset);
						if (!r) {
							break;
						}

						let hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1);
						hitText = hitText.toLowerCase();

						if (hitText === bracket.open) {
							count++;
						} else if (hitText === bracket.close) {
							count--;
						}

						if (count === 0) {
							return r;
						}

						searchStopOffset = r.startColumn - 1;
					}
				}

				searchStopOffset = -1;
			}
		}

		return null;
	}

	private _findMatchingBracketDown(bracket: RichEditBracket, position: Position): Range {
		// console.log('_findMatchingBracketDown: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		const languageId = bracket.languageIdentifier.id;
		const bracketRegex = bracket.forwardRegex;
		let count = 1;

		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this._getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this._buffer.getLineContent(lineNumber);

			let tokenIndex = 0;
			let searchStartOffset = 0;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
			}

			for (; tokenIndex < tokenCount; tokenIndex++) {
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
				const tokenType = lineTokens.getStandardTokenType(tokenIndex);
				const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
				const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);

				if (searchStartOffset === 0) {
					searchStartOffset = tokenStartOffset;
				}

				if (tokenLanguageId === languageId && !ignoreBracketsInToken(tokenType)) {
					while (true) {
						let r = BracketsUtils.findNextBracketInToken(bracketRegex, lineNumber, lineText, searchStartOffset, tokenEndOffset);
						if (!r) {
							break;
						}

						let hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1);
						hitText = hitText.toLowerCase();

						if (hitText === bracket.open) {
							count++;
						} else if (hitText === bracket.close) {
							count--;
						}

						if (count === 0) {
							return r;
						}

						searchStartOffset = r.endColumn - 1;
					}
				}

				searchStartOffset = 0;
			}
		}

		return null;
	}

	public findPrevBracket(_position: IPosition): model.IFoundBracket {
		const position = this.validatePosition(_position);

		let languageId: LanguageId = -1;
		let modeBrackets: RichEditBrackets = null;
		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			const lineTokens = this._getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this._buffer.getLineContent(lineNumber);

			let tokenIndex = tokenCount - 1;
			let searchStopOffset = -1;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStopOffset = position.column - 1;
			}

			for (; tokenIndex >= 0; tokenIndex--) {
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
				const tokenType = lineTokens.getStandardTokenType(tokenIndex);
				const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
				const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);

				if (searchStopOffset === -1) {
					searchStopOffset = tokenEndOffset;
				}
				if (languageId !== tokenLanguageId) {
					languageId = tokenLanguageId;
					modeBrackets = LanguageConfigurationRegistry.getBracketsSupport(languageId);
				}
				if (modeBrackets && !ignoreBracketsInToken(tokenType)) {
					let r = BracketsUtils.findPrevBracketInToken(modeBrackets.reversedRegex, lineNumber, lineText, tokenStartOffset, searchStopOffset);
					if (r) {
						return this._toFoundBracket(modeBrackets, r);
					}
				}

				searchStopOffset = -1;
			}
		}

		return null;
	}

	public findNextBracket(_position: IPosition): model.IFoundBracket {
		const position = this.validatePosition(_position);

		let languageId: LanguageId = -1;
		let modeBrackets: RichEditBrackets = null;
		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this._getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this._buffer.getLineContent(lineNumber);

			let tokenIndex = 0;
			let searchStartOffset = 0;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
			}

			for (; tokenIndex < tokenCount; tokenIndex++) {
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
				const tokenType = lineTokens.getStandardTokenType(tokenIndex);
				const tokenStartOffset = lineTokens.getStartOffset(tokenIndex);
				const tokenEndOffset = lineTokens.getEndOffset(tokenIndex);

				if (searchStartOffset === 0) {
					searchStartOffset = tokenStartOffset;
				}

				if (languageId !== tokenLanguageId) {
					languageId = tokenLanguageId;
					modeBrackets = LanguageConfigurationRegistry.getBracketsSupport(languageId);
				}
				if (modeBrackets && !ignoreBracketsInToken(tokenType)) {
					let r = BracketsUtils.findNextBracketInToken(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, tokenEndOffset);
					if (r) {
						return this._toFoundBracket(modeBrackets, r);
					}
				}

				searchStartOffset = 0;
			}
		}

		return null;
	}

	private _toFoundBracket(modeBrackets: RichEditBrackets, r: Range): model.IFoundBracket {
		if (!r) {
			return null;
		}

		let text = this.getValueInRange(r);
		text = text.toLowerCase();

		let data = modeBrackets.textIsBracket[text];
		if (!data) {
			return null;
		}

		return {
			range: r,
			open: data.open,
			close: data.close,
			isOpen: modeBrackets.textIsOpenBracket[text]
		};
	}

	/**
	 * Returns:
	 *  - -1 => the line consists of whitespace
	 *  - otherwise => the indent level is returned value
	 */
	public static computeIndentLevel(line: string, tabSize: number): number {
		let indent = 0;
		let i = 0;
		let len = line.length;

		while (i < len) {
			let chCode = line.charCodeAt(i);
			if (chCode === CharCode.Space) {
				indent++;
			} else if (chCode === CharCode.Tab) {
				indent = indent - indent % tabSize + tabSize;
			} else {
				break;
			}
			i++;
		}

		if (i === len) {
			return -1; // line only consists of whitespace
		}

		return indent;
	}

	private _computeIndentLevel(lineIndex: number): number {
		return TextModel.computeIndentLevel(this._buffer.getLineContent(lineIndex + 1), this._options.tabSize);
	}

	public getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[] {
		this._assertNotDisposed();
		const lineCount = this.getLineCount();

		if (startLineNumber < 1 || startLineNumber > lineCount) {
			throw new Error('Illegal value for startLineNumber');
		}
		if (endLineNumber < 1 || endLineNumber > lineCount) {
			throw new Error('Illegal value for endLineNumber');
		}

		const foldingRules = LanguageConfigurationRegistry.getFoldingRules(this._languageIdentifier.id);
		const offSide = foldingRules && foldingRules.offSide;

		let result: number[] = new Array<number>(endLineNumber - startLineNumber + 1);

		let aboveContentLineIndex = -2; /* -2 is a marker for not having computed it */
		let aboveContentLineIndent = -1;

		let belowContentLineIndex = -2; /* -2 is a marker for not having computed it */
		let belowContentLineIndent = -1;

		for (let lineNumber = startLineNumber; lineNumber <= endLineNumber; lineNumber++) {
			let resultIndex = lineNumber - startLineNumber;

			const currentIndent = this._computeIndentLevel(lineNumber - 1);
			if (currentIndent >= 0) {
				// This line has content (besides whitespace)
				// Use the line's indent
				aboveContentLineIndex = lineNumber - 1;
				aboveContentLineIndent = currentIndent;
				result[resultIndex] = Math.ceil(currentIndent / this._options.tabSize);
				continue;
			}

			if (aboveContentLineIndex === -2) {
				aboveContentLineIndex = -1;
				aboveContentLineIndent = -1;

				// must find previous line with content
				for (let lineIndex = lineNumber - 2; lineIndex >= 0; lineIndex--) {
					let indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						aboveContentLineIndex = lineIndex;
						aboveContentLineIndent = indent;
						break;
					}
				}
			}

			if (belowContentLineIndex !== -1 && (belowContentLineIndex === -2 || belowContentLineIndex < lineNumber - 1)) {
				belowContentLineIndex = -1;
				belowContentLineIndent = -1;

				// must find next line with content
				for (let lineIndex = lineNumber; lineIndex < lineCount; lineIndex++) {
					let indent = this._computeIndentLevel(lineIndex);
					if (indent >= 0) {
						belowContentLineIndex = lineIndex;
						belowContentLineIndent = indent;
						break;
					}
				}
			}

			if (aboveContentLineIndent === -1 || belowContentLineIndent === -1) {
				// At the top or bottom of the file
				result[resultIndex] = 0;

			} else if (aboveContentLineIndent < belowContentLineIndent) {
				// we are inside the region above
				result[resultIndex] = (1 + Math.floor(aboveContentLineIndent / this._options.tabSize));

			} else if (aboveContentLineIndent === belowContentLineIndent) {
				// we are in between two regions
				result[resultIndex] = Math.ceil(belowContentLineIndent / this._options.tabSize);

			} else {

				if (offSide) {
					// same level as region below
					result[resultIndex] = Math.ceil(belowContentLineIndent / this._options.tabSize);
				} else {
					// we are inside the region that ends below
					result[resultIndex] = (1 + Math.floor(belowContentLineIndent / this._options.tabSize));
				}

			}
		}
		return result;
	}
	//#endregion
}

//#region Decorations

class DecorationsTrees {

	/**
	 * This tree holds decorations that do not show up in the overview ruler.
	 */
	private _decorationsTree0: IntervalTree;

	/**
	 * This tree holds decorations that show up in the overview ruler.
	 */
	private _decorationsTree1: IntervalTree;

	constructor() {
		this._decorationsTree0 = new IntervalTree();
		this._decorationsTree1 = new IntervalTree();
	}

	public intervalSearch(start: number, end: number, filterOwnerId: number, filterOutValidation: boolean, cachedVersionId: number): IntervalNode[] {
		const r0 = this._decorationsTree0.intervalSearch(start, end, filterOwnerId, filterOutValidation, cachedVersionId);
		const r1 = this._decorationsTree1.intervalSearch(start, end, filterOwnerId, filterOutValidation, cachedVersionId);
		return r0.concat(r1);
	}

	public search(filterOwnerId: number, filterOutValidation: boolean, overviewRulerOnly: boolean, cachedVersionId: number): IntervalNode[] {
		if (overviewRulerOnly) {
			return this._decorationsTree1.search(filterOwnerId, filterOutValidation, cachedVersionId);
		} else {
			const r0 = this._decorationsTree0.search(filterOwnerId, filterOutValidation, cachedVersionId);
			const r1 = this._decorationsTree1.search(filterOwnerId, filterOutValidation, cachedVersionId);
			return r0.concat(r1);
		}
	}

	public collectNodesFromOwner(ownerId: number): IntervalNode[] {
		const r0 = this._decorationsTree0.collectNodesFromOwner(ownerId);
		const r1 = this._decorationsTree1.collectNodesFromOwner(ownerId);
		return r0.concat(r1);
	}

	public collectNodesPostOrder(): IntervalNode[] {
		const r0 = this._decorationsTree0.collectNodesPostOrder();
		const r1 = this._decorationsTree1.collectNodesPostOrder();
		return r0.concat(r1);
	}

	public insert(node: IntervalNode): void {
		if (getNodeIsInOverviewRuler(node)) {
			this._decorationsTree1.insert(node);
		} else {
			this._decorationsTree0.insert(node);
		}
	}

	public delete(node: IntervalNode): void {
		if (getNodeIsInOverviewRuler(node)) {
			this._decorationsTree1.delete(node);
		} else {
			this._decorationsTree0.delete(node);
		}
	}

	public resolveNode(node: IntervalNode, cachedVersionId: number): void {
		if (getNodeIsInOverviewRuler(node)) {
			this._decorationsTree1.resolveNode(node, cachedVersionId);
		} else {
			this._decorationsTree0.resolveNode(node, cachedVersionId);
		}
	}

	public acceptReplace(offset: number, length: number, textLength: number, forceMoveMarkers: boolean): void {
		this._decorationsTree0.acceptReplace(offset, length, textLength, forceMoveMarkers);
		this._decorationsTree1.acceptReplace(offset, length, textLength, forceMoveMarkers);
	}
}

function cleanClassName(className: string): string {
	return className.replace(/[^a-z0-9\-]/gi, ' ');
}

export class ModelDecorationOverviewRulerOptions implements model.IModelDecorationOverviewRulerOptions {
	readonly color: string | ThemeColor;
	readonly darkColor: string | ThemeColor;
	readonly hcColor: string | ThemeColor;
	readonly position: model.OverviewRulerLane;
	_resolvedColor: string;

	constructor(options: model.IModelDecorationOverviewRulerOptions) {
		this.color = strings.empty;
		this.darkColor = strings.empty;
		this.hcColor = strings.empty;
		this.position = model.OverviewRulerLane.Center;
		this._resolvedColor = null;

		if (options && options.color) {
			this.color = options.color;
		}
		if (options && options.darkColor) {
			this.darkColor = options.darkColor;
			this.hcColor = options.darkColor;
		}
		if (options && options.hcColor) {
			this.hcColor = options.hcColor;
		}
		if (options && options.hasOwnProperty('position')) {
			this.position = options.position;
		}
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

	readonly stickiness: model.TrackedRangeStickiness;
	readonly zIndex: number;
	readonly className: string;
	readonly hoverMessage: IMarkdownString | IMarkdownString[];
	readonly glyphMarginHoverMessage: IMarkdownString | IMarkdownString[];
	readonly isWholeLine: boolean;
	readonly showIfCollapsed: boolean;
	readonly overviewRuler: ModelDecorationOverviewRulerOptions;
	readonly glyphMarginClassName: string;
	readonly linesDecorationsClassName: string;
	readonly marginClassName: string;
	readonly inlineClassName: string;
	readonly beforeContentClassName: string;
	readonly afterContentClassName: string;

	private constructor(options: model.IModelDecorationOptions) {
		this.stickiness = options.stickiness || model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges;
		this.zIndex = options.zIndex || 0;
		this.className = options.className ? cleanClassName(options.className) : strings.empty;
		this.hoverMessage = options.hoverMessage || [];
		this.glyphMarginHoverMessage = options.glyphMarginHoverMessage || [];
		this.isWholeLine = options.isWholeLine || false;
		this.showIfCollapsed = options.showIfCollapsed || false;
		this.overviewRuler = new ModelDecorationOverviewRulerOptions(options.overviewRuler);
		this.glyphMarginClassName = options.glyphMarginClassName ? cleanClassName(options.glyphMarginClassName) : strings.empty;
		this.linesDecorationsClassName = options.linesDecorationsClassName ? cleanClassName(options.linesDecorationsClassName) : strings.empty;
		this.marginClassName = options.marginClassName ? cleanClassName(options.marginClassName) : strings.empty;
		this.inlineClassName = options.inlineClassName ? cleanClassName(options.inlineClassName) : strings.empty;
		this.beforeContentClassName = options.beforeContentClassName ? cleanClassName(options.beforeContentClassName) : strings.empty;
		this.afterContentClassName = options.afterContentClassName ? cleanClassName(options.afterContentClassName) : strings.empty;
	}
}
ModelDecorationOptions.EMPTY = ModelDecorationOptions.register({});

/**
 * The order carefully matches the values of the enum.
 */
const TRACKED_RANGE_OPTIONS = [
	ModelDecorationOptions.register({ stickiness: model.TrackedRangeStickiness.AlwaysGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ stickiness: model.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges }),
	ModelDecorationOptions.register({ stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingBefore }),
	ModelDecorationOptions.register({ stickiness: model.TrackedRangeStickiness.GrowsOnlyWhenTypingAfter }),
];

function _normalizeOptions(options: model.IModelDecorationOptions): ModelDecorationOptions {
	if (options instanceof ModelDecorationOptions) {
		return options;
	}
	return ModelDecorationOptions.createDynamic(options);
}

export class DidChangeDecorationsEmitter extends Disposable {

	private readonly _actual: Emitter<IModelDecorationsChangedEvent> = this._register(new Emitter<IModelDecorationsChangedEvent>());
	public readonly event: Event<IModelDecorationsChangedEvent> = this._actual.event;

	private _deferredCnt: number;
	private _shouldFire: boolean;

	constructor() {
		super();
		this._deferredCnt = 0;
		this._shouldFire = false;
	}

	public beginDeferredEmit(): void {
		this._deferredCnt++;
	}

	public endDeferredEmit(): void {
		this._deferredCnt--;
		if (this._deferredCnt === 0) {
			if (this._shouldFire) {
				this._shouldFire = false;
				this._actual.fire({});
			}
		}
	}

	public fire(): void {
		this._shouldFire = true;
	}
}

//#endregion

export class DidChangeContentEmitter extends Disposable {

	/**
	 * Both `fastEvent` and `slowEvent` work the same way and contain the same events, but first we invoke `fastEvent` and then `slowEvent`.
	 */
	private readonly _fastEmitter: Emitter<InternalModelContentChangeEvent> = this._register(new Emitter<InternalModelContentChangeEvent>());
	public readonly fastEvent: Event<InternalModelContentChangeEvent> = this._fastEmitter.event;
	private readonly _slowEmitter: Emitter<InternalModelContentChangeEvent> = this._register(new Emitter<InternalModelContentChangeEvent>());
	public readonly slowEvent: Event<InternalModelContentChangeEvent> = this._slowEmitter.event;

	private _deferredCnt: number;
	private _deferredEvent: InternalModelContentChangeEvent;

	constructor() {
		super();
		this._deferredCnt = 0;
		this._deferredEvent = null;
	}

	public beginDeferredEmit(): void {
		this._deferredCnt++;
	}

	public endDeferredEmit(): void {
		this._deferredCnt--;
		if (this._deferredCnt === 0) {
			if (this._deferredEvent !== null) {
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
