/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {RunOnceScheduler} from 'vs/base/common/async';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IDisposable, dispose} from 'vs/base/common/lifecycle';
import {StopWatch} from 'vs/base/common/stopwatch';
import * as timer from 'vs/base/common/timer';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import {TextModel} from 'vs/editor/common/model/textModel';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {TokenIterator} from 'vs/editor/common/model/tokenIterator';
import {ILineContext, ILineTokens, IToken, IModeTransition, IMode, IState} from 'vs/editor/common/modes';
import {NullMode, NullState, nullTokenize} from 'vs/editor/common/modes/nullMode';
import {ignoreBracketsInToken} from 'vs/editor/common/modes/supports';
import {BracketsUtils} from 'vs/editor/common/modes/supports/richEditBrackets';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {LineToken} from 'vs/editor/common/model/lineToken';
import {TokensInflatorMap} from 'vs/editor/common/model/tokensBinaryEncoding';
import {Position} from 'vs/editor/common/core/position';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';

class ModeToModelBinder implements IDisposable {

	private _modePromise:TPromise<IMode>;
	private _externalModePromise:TPromise<boolean>;
	private _externalModePromise_c:(value:boolean)=>void;
	private _externalModePromise_e:(err:any)=>void;
	private _model:TextModelWithTokens;
	private _isDisposed:boolean;

	constructor(modePromise:TPromise<IMode>, model:TextModelWithTokens) {
		this._modePromise = modePromise;
		// Create an external mode promise that fires after the mode is set to the model
		this._externalModePromise = new TPromise<boolean>((c, e, p) => {
			this._externalModePromise_c = c;
			this._externalModePromise_e = e;
		}, () => {
			// this promise cannot be canceled
		});
		this._model = model;
		this._isDisposed = false;

		// Ensure asynchronicity
		TPromise.timeout(0).then(() => {
			return this._modePromise;
		}).then((mode:IMode) => {
			if (this._isDisposed) {
				this._externalModePromise_c(false);
				return;
			}
			var model = this._model;
			this.dispose();
			model.setMode(mode);
			model._warmUpTokens();
			this._externalModePromise_c(true);
		}).done(null, (err) => {
			this._externalModePromise_e(err);
			onUnexpectedError(err);
		});
	}

	public getModePromise(): TPromise<boolean> {
		return this._externalModePromise;
	}

	public dispose(): void {
		this._modePromise = null;
		this._model = null;
		this._isDisposed = true;
	}
}

export interface IRetokenizeRequest extends IDisposable {

	isFulfilled: boolean;

	/**
	 * If null, the entire model will be retokenzied, use null with caution
	 */
	getRange(): editorCommon.IRange;
}

export class FullModelRetokenizer implements IRetokenizeRequest {

	public isFulfilled: boolean;

	_model:TextModelWithTokens;
	private _retokenizePromise:TPromise<void>;
	private _isDisposed: boolean;

	constructor(retokenizePromise:TPromise<void>, model:TextModelWithTokens) {
		this._retokenizePromise = retokenizePromise;
		this._model = model;
		this._isDisposed = false;
		this.isFulfilled = false;

		// Ensure asynchronicity
		TPromise.timeout(0).then(() => {
			return this._retokenizePromise;
		}).then(() => {
			if (this._isDisposed) {
				return;
			}
			this.isFulfilled = true;
			this._model.onRetokenizerFulfilled();
		}).done(null, onUnexpectedError);
	}

	public getRange(): editorCommon.IRange {
		return null;
	}

	public dispose(): void {
		this._retokenizePromise = null;
		this._model = null;
		this._isDisposed = true;
	}
}

class LineContext implements ILineContext {

	public modeTransitions:ModeTransition[];
	private _text:string;
	private _lineTokens:editorCommon.ILineTokens;

	constructor (topLevelMode:IMode, line:ModelLine) {
		this.modeTransitions = line.getModeTransitions(topLevelMode);
		this._text = line.text;
		this._lineTokens = line.getTokens();
	}

	public getLineContent(): string {
		return this._text;
	}

	public getTokenCount(): number {
		return this._lineTokens.getTokenCount();
	}

	public getTokenStartIndex(tokenIndex:number): number {
		return this._lineTokens.getTokenStartIndex(tokenIndex);
	}

	public getTokenEndIndex(tokenIndex:number): number {
		return this._lineTokens.getTokenEndIndex(tokenIndex, this._text.length);
	}

	public getTokenType(tokenIndex:number): string {
		return this._lineTokens.getTokenType(tokenIndex);
	}

	public getTokenText(tokenIndex:number): string {
		var startIndex = this._lineTokens.getTokenStartIndex(tokenIndex);
		var endIndex = this._lineTokens.getTokenEndIndex(tokenIndex, this._text.length);
		return this._text.substring(startIndex, endIndex);
	}

	public findIndexOfOffset(offset:number): number {
		return this._lineTokens.findIndexOfOffset(offset);
	}
}

export class TextModelWithTokens extends TextModel implements editorCommon.ITokenizedModel {

	private static MODE_TOKENIZATION_FAILED_MSG = nls.localize('mode.tokenizationSupportFailed', "The mode has failed while tokenizing the input.");

	private _mode: IMode;
	private _modeListener: IDisposable;
	private _modeToModelBinder:ModeToModelBinder;
	private _tokensInflatorMap:TokensInflatorMap;

	private _invalidLineStartIndex:number;
	private _lastState:IState;

	private _revalidateTokensTimeout:number;
	private _scheduleRetokenizeNow: RunOnceScheduler;
	private _retokenizers:IRetokenizeRequest[];

	constructor(allowedEventTypes:string[], rawText:editorCommon.IRawText, modeOrPromise:IMode|TPromise<IMode>) {
		allowedEventTypes.push(editorCommon.EventType.ModelTokensChanged);
		allowedEventTypes.push(editorCommon.EventType.ModelModeChanged);
		allowedEventTypes.push(editorCommon.EventType.ModelModeSupportChanged);
		super(allowedEventTypes, rawText);

		this._mode = null;
		this._modeListener = null;
		this._modeToModelBinder = null;
		this._tokensInflatorMap = null;

		this._invalidLineStartIndex = 0;
		this._lastState = null;

		this._revalidateTokensTimeout = -1;
		this._scheduleRetokenizeNow = null;
		this._retokenizers = null;

		if (!modeOrPromise) {
			this._mode = new NullMode();
		} else if (TPromise.is(modeOrPromise)) {
			// TODO@Alex: To avoid mode id changes, we check if this promise is resolved
			let promiseValue = <IMode>(<any>modeOrPromise)._value;

			if (promiseValue && typeof promiseValue.getId === 'function') {
				// The promise is already resolved
				this._mode = this._massageMode(promiseValue);
				this._resetModeListener(this._mode);
			} else {
				var modePromise = <TPromise<IMode>>modeOrPromise;
				this._modeToModelBinder = new ModeToModelBinder(modePromise, this);
				this._mode = new NullMode();
			}
		} else {
			this._mode = this._massageMode(<IMode>modeOrPromise);
			this._resetModeListener(this._mode);
		}

		this._revalidateTokensTimeout = -1;
		this._scheduleRetokenizeNow = new RunOnceScheduler(() => this._retokenizeNow(), 200);
		this._retokenizers = [];

		this._resetTokenizationState();
	}

	public dispose(): void {
		if (this._modeToModelBinder) {
			this._modeToModelBinder.dispose();
			this._modeToModelBinder = null;
		}
		this._resetModeListener(null);
		this._clearTimers();
		this._mode = null;
		this._lastState = null;
		this._tokensInflatorMap = null;
		this._retokenizers = dispose(this._retokenizers);
		this._scheduleRetokenizeNow.dispose();

		super.dispose();
	}

	protected _shouldAutoTokenize(): boolean {
		return false;
	}

	private _massageMode(mode: IMode): IMode {
		if (this.isTooLargeForHavingAMode()) {
			return new NullMode();
		}
		if (this.isTooLargeForHavingARichMode()) {
			return mode.toSimplifiedMode();
		}
		return mode;
	}

	public whenModeIsReady(): TPromise<IMode> {
		if (this._modeToModelBinder) {
			// Still waiting for some mode to load
			return this._modeToModelBinder.getModePromise().then(() => this._mode);
		}
		return TPromise.as(this._mode);
	}

	public onRetokenizerFulfilled(): void {
		this._scheduleRetokenizeNow.schedule();
	}

	private _retokenizeNow(): void {
		var fulfilled = this._retokenizers.filter(r => r.isFulfilled);
		this._retokenizers = this._retokenizers.filter(r => !r.isFulfilled);

		var hasFullModel = false;
		for (var i = 0; i < fulfilled.length; i++) {
			if (!fulfilled[i].getRange()) {
				hasFullModel = true;
			}
		}

		if (hasFullModel) {
			// Just invalidate all the lines
			for (var i = 0, len = this._lines.length; i < len; i++) {
				this._lines[i].isInvalid = true;
			}
			this._invalidLineStartIndex = 0;
		} else {
			var minLineNumber = Number.MAX_VALUE;
			for (var i = 0; i < fulfilled.length; i++) {
				var range = fulfilled[i].getRange();
				minLineNumber = Math.min(minLineNumber, range.startLineNumber);
				for (var lineNumber = range.startLineNumber; lineNumber <= range.endLineNumber; lineNumber++) {
					this._lines[lineNumber - 1].isInvalid = true;
				}
			}
			if (minLineNumber - 1 < this._invalidLineStartIndex) {
				if (this._invalidLineStartIndex < this._lines.length) {
					this._lines[this._invalidLineStartIndex].isInvalid = true;
				}
				this._invalidLineStartIndex = minLineNumber - 1;
			}
		}

		this._beginBackgroundTokenization();

		for (var i = 0; i < fulfilled.length; i++) {
			fulfilled[i].dispose();
		}
	}

	_createRetokenizer(retokenizePromise:TPromise<void>, lineNumber:number): IRetokenizeRequest {
		return new FullModelRetokenizer(retokenizePromise, this);
	}

	_resetValue(e:editorCommon.IModelContentChangedFlushEvent, newValue:editorCommon.IRawText): void {
		super._resetValue(e, newValue);
		// Cancel tokenization, clear all tokens and begin tokenizing
		this._resetTokenizationState();
	}

	_resetMode(e:editorCommon.IModelModeChangedEvent, newMode:IMode): void {
		// Cancel tokenization, clear all tokens and begin tokenizing
		this._mode = newMode;
		this._resetModeListener(newMode);
		this._resetTokenizationState();

		this.emitModelTokensChangedEvent(1, this.getLineCount());
	}

	private _resetModeListener(newMode: IMode): void {
		if (this._modeListener) {
			this._modeListener.dispose();
			this._modeListener = null;
		}
		if (newMode && typeof newMode.addSupportChangedListener === 'function') {
			this._modeListener = newMode.addSupportChangedListener( (e) => this._onModeSupportChanged(e) );
		}
	}

	private _onModeSupportChanged(e: editorCommon.IModeSupportChangedEvent): void {
		this._emitModelModeSupportChangedEvent(e);
		if (e.tokenizationSupport) {
			this._resetTokenizationState();
			this.emitModelTokensChangedEvent(1, this.getLineCount());
		}
	}

	_resetTokenizationState(): void {
		this._retokenizers = dispose(this._retokenizers);
		this._scheduleRetokenizeNow.cancel();
		this._clearTimers();
		for (var i = 0; i < this._lines.length; i++) {
			this._lines[i].setState(null);
		}
		this._initializeTokenizationState();
	}

	private _clearTimers(): void {
		if (this._revalidateTokensTimeout !== -1) {
			clearTimeout(this._revalidateTokensTimeout);
			this._revalidateTokensTimeout = -1;
		}
	}

	private _initializeTokenizationState(): void {
		// Initialize tokenization states
		var initialState:IState = null;
		if (this._mode.tokenizationSupport) {
			try {
				initialState = this._mode.tokenizationSupport.getInitialState();
			} catch (e) {
				e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
				onUnexpectedError(e);
				this._mode = new NullMode();
			}
		}
		if (!initialState) {
			initialState = new NullState(this._mode, null);
		}

		this._lines[0].setState(initialState);
		this._lastState = null;
		this._tokensInflatorMap = new TokensInflatorMap();
		this._invalidLineStartIndex = 0;
		this._beginBackgroundTokenization();
	}

	public getLineTokens(lineNumber:number, inaccurateTokensAcceptable:boolean = false): editorCommon.ILineTokens {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		if (!inaccurateTokensAcceptable) {
			this._updateTokensUntilLine(lineNumber, true);
		}
		return this._lines[lineNumber - 1].getTokens();
	}

	public getLineContext(lineNumber:number): ILineContext {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		this._updateTokensUntilLine(lineNumber, true);

		return new LineContext(this._mode, this._lines[lineNumber - 1]);
	}

	_getInternalTokens(lineNumber:number): editorCommon.ILineTokens {
		this._updateTokensUntilLine(lineNumber, true);
		return this._lines[lineNumber - 1].getTokens();
	}

	public getMode(): IMode {
		return this._mode;
	}

	public setMode(newModeOrPromise:IMode|TPromise<IMode>): void {
		if (!newModeOrPromise) {
			// There's nothing to do
			return;
		}
		if (this._modeToModelBinder) {
			this._modeToModelBinder.dispose();
			this._modeToModelBinder = null;
		}
		if (TPromise.is(newModeOrPromise)) {
			this._modeToModelBinder = new ModeToModelBinder(<TPromise<IMode>>newModeOrPromise, this);
		} else {
			var actualNewMode = this._massageMode(<IMode>newModeOrPromise);
			if (this._mode !== actualNewMode) {
				var e2:editorCommon.IModelModeChangedEvent = {
					oldMode: this._mode,
					newMode: actualNewMode
				};
				this._resetMode(e2, actualNewMode);
				this._emitModelModeChangedEvent(e2);
			}
		}
	}

	public getModeIdAtPosition(_lineNumber:number, _column:number): string {
		var validPosition = this.validatePosition({
			lineNumber: _lineNumber,
			column: _column
		});

		var lineNumber = validPosition.lineNumber;
		var column = validPosition.column;

		if (column === 1) {
			return this.getStateBeforeLine(lineNumber).getMode().getId();
		} else if (column === this.getLineMaxColumn(lineNumber)) {
			return this.getStateAfterLine(lineNumber).getMode().getId();
		} else {
			var modeTransitions = this._getLineModeTransitions(lineNumber);
			var modeTransitionIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, column - 1);
			return modeTransitions[modeTransitionIndex].modeId;
		}
	}

	_invalidateLine(lineIndex:number): void {
		this._lines[lineIndex].isInvalid = true;
		if (lineIndex < this._invalidLineStartIndex) {
			if (this._invalidLineStartIndex < this._lines.length) {
				this._lines[this._invalidLineStartIndex].isInvalid = true;
			}
			this._invalidLineStartIndex = lineIndex;
			this._beginBackgroundTokenization();
		}
	}

	private static _toLineTokens(tokens:IToken[]): LineToken[] {
		if (!tokens || tokens.length === 0) {
			return [];
		}
		if (tokens[0] instanceof LineToken) {
			return <LineToken[]>tokens;
		}
		let result:LineToken[] = [];
		for (let i = 0, len = tokens.length; i < len; i++) {
			result[i] = new LineToken(tokens[i].startIndex, tokens[i].type);
		}
		return result;
	}

	private static _toModeTransitions(modeTransitions:IModeTransition[]): ModeTransition[] {
		if (!modeTransitions || modeTransitions.length === 0) {
			return [];
		}
		if (modeTransitions[0] instanceof ModeTransition) {
			return <ModeTransition[]>modeTransitions;
		}
		let result:ModeTransition[] = [];
		for (let i = 0, len = modeTransitions.length; i < len; i++) {
			result[i] = new ModeTransition(modeTransitions[i].startIndex, modeTransitions[i].mode);
		}
		return result;
	}

	private _updateLineTokens(lineIndex:number, map:TokensInflatorMap, topLevelMode:IMode, r:ILineTokens): void {
		this._lines[lineIndex].setTokens(map, TextModelWithTokens._toLineTokens(r.tokens), topLevelMode, TextModelWithTokens._toModeTransitions(r.modeTransitions));
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
		var maxLineNumber = Math.min(100, this.getLineCount());
		var toLineNumber = maxLineNumber;
		for (var lineNumber = 1; lineNumber <= maxLineNumber; lineNumber++) {
			var text = this._lines[lineNumber - 1].text;
			if (text.length >= 200) {
				// This line is over 200 chars long, so warm up without it
				toLineNumber = lineNumber - 1;
				break;
			}
		}
		this._revalidateTokensNow(toLineNumber);

		if (this._invalidLineStartIndex < this._lines.length) {
			this._beginBackgroundTokenization();
		}
	}

	private _revalidateTokensNow(toLineNumber:number = this._invalidLineStartIndex + 1000000): void {

		var t1 = timer.start(timer.Topic.EDITOR, 'backgroundTokenization');
		toLineNumber = Math.min(this._lines.length, toLineNumber);

		var MAX_ALLOWED_TIME = 20,
			fromLineNumber = this._invalidLineStartIndex + 1,
			tokenizedChars = 0,
			currentCharsToTokenize = 0,
			currentEstimatedTimeToTokenize = 0,
			sw = StopWatch.create(false),
			elapsedTime: number;

		// Tokenize at most 1000 lines. Estimate the tokenization speed per character and stop when:
		// - MAX_ALLOWED_TIME is reached
		// - tokenizing the next line would go above MAX_ALLOWED_TIME

		for (var lineNumber = fromLineNumber; lineNumber <= toLineNumber; lineNumber++) {
			elapsedTime = sw.elapsed();
			if (elapsedTime > MAX_ALLOWED_TIME) {
				// Stop if MAX_ALLOWED_TIME is reached
				toLineNumber = lineNumber - 1;
				break;
			}

			// Compute how many characters will be tokenized for this line
			currentCharsToTokenize = this._lines[lineNumber - 1].text.length;

			if (tokenizedChars > 0) {
				// If we have enough history, estimate how long tokenizing this line would take
				currentEstimatedTimeToTokenize = (elapsedTime / tokenizedChars) * currentCharsToTokenize;
				if (elapsedTime + currentEstimatedTimeToTokenize > MAX_ALLOWED_TIME) {
					// Tokenizing this line will go above MAX_ALLOWED_TIME
					toLineNumber = lineNumber - 1;
					break;
				}
			}

			this._updateTokensUntilLine(lineNumber, false);
			tokenizedChars += currentCharsToTokenize;
		}

		elapsedTime = sw.elapsed();

		if (fromLineNumber <= toLineNumber) {
			this.emitModelTokensChangedEvent(fromLineNumber, toLineNumber);
		}

		if (this._invalidLineStartIndex < this._lines.length) {
			this._beginBackgroundTokenization();
		}

		t1.stop();
	}

	private getStateBeforeLine(lineNumber:number): IState {
		this._updateTokensUntilLine(lineNumber - 1, true);
		return this._lines[lineNumber - 1].getState();
	}

	private getStateAfterLine(lineNumber:number): IState {
		this._updateTokensUntilLine(lineNumber, true);
		return lineNumber < this._lines.length ? this._lines[lineNumber].getState() : this._lastState;
	}

	_getLineModeTransitions(lineNumber:number): ModeTransition[] {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}
		this._updateTokensUntilLine(lineNumber, true);
		return this._lines[lineNumber - 1].getModeTransitions(this._mode);
	}

	private _updateTokensUntilLine(lineNumber:number, emitEvents:boolean): void {
		var linesLength = this._lines.length;
		var endLineIndex = lineNumber - 1;
		var stopLineTokenizationAfter = 1000000000; // 1 billion, if a line is so long, you have other trouble :).

		var fromLineNumber = this._invalidLineStartIndex + 1, toLineNumber = lineNumber;

		// Validate all states up to and including endLineIndex
		for (var lineIndex = this._invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			var endStateIndex = lineIndex + 1;
			var r:ILineTokens = null;
			var text = this._lines[lineIndex].text;
			if (this._mode.tokenizationSupport) {

				try {
					// Tokenize only the first X characters
					r = this._mode.tokenizationSupport.tokenize(this._lines[lineIndex].text, this._lines[lineIndex].getState(), 0, stopLineTokenizationAfter);
				} catch (e) {
					e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
					onUnexpectedError(e);
				}

				if (r && r.retokenize) {
					this._retokenizers.push(this._createRetokenizer(r.retokenize, lineIndex + 1));
				}

				if (r && r.tokens && r.tokens.length > 0) {
					// Cannot have a stop offset before the last token
					r.actualStopOffset = Math.max(r.actualStopOffset, r.tokens[r.tokens.length - 1].startIndex + 1);
				}

				if (r && r.actualStopOffset < text.length) {
					// Treat the rest of the line (if above limit) as one default token
					r.tokens.push({
						startIndex: r.actualStopOffset,
						type: ''
					});

					// Use as end state the starting state
					r.endState = this._lines[lineIndex].getState();
				}
			}

			if (!r) {
				r = nullTokenize(this._mode, text, this._lines[lineIndex].getState());
			}
			if (!r.modeTransitions) {
				r.modeTransitions = [];
			}
			if (r.modeTransitions.length === 0) {
				// Make sure there is at least the transition to the top-most mode
				r.modeTransitions.push({
					startIndex: 0,
					mode: this._mode
				});
			}
			this._updateLineTokens(lineIndex, this._tokensInflatorMap, this._mode, r);

			if (this._lines[lineIndex].isInvalid) {
				this._lines[lineIndex].isInvalid = false;
			}

			if (endStateIndex < linesLength) {
				if (this._lines[endStateIndex].getState() !== null && r.endState.equals(this._lines[endStateIndex].getState())) {
					// The end state of this line remains the same
					var nextInvalidLineIndex = lineIndex + 1;
					while (nextInvalidLineIndex < linesLength) {
						if (this._lines[nextInvalidLineIndex].isInvalid) {
							break;
						}
						if (nextInvalidLineIndex + 1 < linesLength) {
							if (this._lines[nextInvalidLineIndex + 1].getState() === null) {
								break;
							}
						} else {
							if (this._lastState === null) {
								break;
							}
						}
						nextInvalidLineIndex++;
					}
					this._invalidLineStartIndex = Math.max(this._invalidLineStartIndex, nextInvalidLineIndex);
					lineIndex = nextInvalidLineIndex - 1; // -1 because the outer loop increments it
				} else {
					this._lines[endStateIndex].setState(r.endState);
				}
			} else {
				this._lastState = r.endState;
			}
		}
		this._invalidLineStartIndex = Math.max(this._invalidLineStartIndex, endLineIndex + 1);

		if (emitEvents && fromLineNumber <= toLineNumber) {
			this.emitModelTokensChangedEvent(fromLineNumber, toLineNumber);
		}
	}

	private emitModelTokensChangedEvent(fromLineNumber:number, toLineNumber:number): void {
		var e:editorCommon.IModelTokensChangedEvent = {
			fromLineNumber: fromLineNumber,
			toLineNumber: toLineNumber
		};
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelTokensChanged, e);
		}
	}

	private _emitModelModeChangedEvent(e:editorCommon.IModelModeChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelModeChanged, e);
		}
	}

	private _emitModelModeSupportChangedEvent(e:editorCommon.IModeSupportChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelModeSupportChanged, e);
		}
	}

	// Having tokens allows implementing additional helper methods

	_lineIsTokenized(lineNumber:number): boolean {
		return this._invalidLineStartIndex > lineNumber - 1;
	}

	_getWordDefinition(): RegExp {
		return WordHelper.massageWordDefinitionOf(this._mode);
	}

	public getWordAtPosition(position:editorCommon.IPosition): editorCommon.IWordAtPosition {
		return WordHelper.getWordAtPosition(this, this.validatePosition(position));
	}

	public getWordUntilPosition(position: editorCommon.IPosition): editorCommon.IWordAtPosition {
		var wordAtPosition = this.getWordAtPosition(position);
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

	public tokenIterator(position:editorCommon.IPosition, callback:(it:TokenIterator)=>any): any {
		var iter = new TokenIterator(this, this.validatePosition(position));
		var result = callback(iter);
		iter._invalidate();
		return result;
	}

	public findMatchingBracketUp(bracket:string, _position:editorCommon.IPosition): Range {
		let position = this.validatePosition(_position);
		let modeTransitions = this._lines[position.lineNumber - 1].getModeTransitions(this._mode);
		let currentModeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, position.column - 1);
		let currentMode = modeTransitions[currentModeIndex];
		let currentModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(currentMode.modeId);

		if (!currentModeBrackets) {
			return null;
		}

		let data = currentModeBrackets.textIsBracket[bracket];

		if (!data) {
			return null;
		}

		return this._findMatchingBracketUp(data, position);
	}

	public matchBracket(position:editorCommon.IPosition): [Range,Range] {
		return this._matchBracket(this.validatePosition(position));
	}

	private _matchBracket(position:Position): [Range,Range] {
		let lineNumber = position.lineNumber;
		let lineText = this._lines[lineNumber - 1].text;

		let lineTokens = this._lines[lineNumber - 1].getTokens();
		let currentTokenIndex = lineTokens.findIndexOfOffset(position.column - 1);
		let currentTokenStart = lineTokens.getTokenStartIndex(currentTokenIndex);

		let modeTransitions = this._lines[lineNumber - 1].getModeTransitions(this._mode);
		let currentModeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, position.column - 1);
		let currentMode = modeTransitions[currentModeIndex];
		let currentModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(currentMode.modeId);

		// If position is in between two tokens, try first looking in the previous token
		if (currentTokenIndex > 0 && currentTokenStart === position.column - 1) {
			let prevTokenIndex = currentTokenIndex - 1;
			let prevTokenType = lineTokens.getTokenType(prevTokenIndex);

			// check that previous token is not to be ignored
			if (!ignoreBracketsInToken(prevTokenType)) {
				let prevTokenStart = lineTokens.getTokenStartIndex(prevTokenIndex);

				let prevMode = currentMode;
				let prevModeBrackets = currentModeBrackets;
				// check if previous token is in a different mode
				if (currentModeIndex > 0 && currentMode.startIndex === position.column - 1) {
					prevMode = modeTransitions[currentModeIndex - 1];
					prevModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(prevMode.modeId);
				}

				if (prevModeBrackets) {
					// limit search in case previous token is very large, there's no need to go beyond `maxBracketLength`
					prevTokenStart = Math.max(prevTokenStart, position.column - 1 - prevModeBrackets.maxBracketLength);

					let foundBracket = BracketsUtils.findPrevBracketInToken(prevModeBrackets.reversedRegex, lineNumber, lineText, prevTokenStart, currentTokenStart);

					// check that we didn't hit a bracket too far away from position
					if (foundBracket && foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
						let foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1);
						let r = this._matchFoundBracket(foundBracket, prevModeBrackets.textIsBracket[foundBracketText], prevModeBrackets.textIsOpenBracket[foundBracketText]);

						// check that we can actually match this bracket
						if (r) {
							return r;
						}
					}
				}
			}
		}

		// check that the token is not to be ignored
		if (!ignoreBracketsInToken(lineTokens.getTokenType(currentTokenIndex))) {

			if (currentModeBrackets) {
				// limit search to not go before `maxBracketLength`
				currentTokenStart = Math.max(currentTokenStart, position.column - 1 - currentModeBrackets.maxBracketLength);

				// limit search to not go after `maxBracketLength`
				let currentTokenEnd = lineTokens.getTokenEndIndex(currentTokenIndex, lineText.length);
				currentTokenEnd = Math.min(currentTokenEnd, position.column - 1 + currentModeBrackets.maxBracketLength);

				// it might still be the case that [currentTokenStart -> currentTokenEnd] contains multiple brackets
				while(true) {
					let foundBracket = BracketsUtils.findNextBracketInText(currentModeBrackets.forwardRegex, lineNumber, lineText.substring(currentTokenStart, currentTokenEnd), currentTokenStart);
					if (!foundBracket) {
						// there are no brackets in this text
						break;
					}

					// check that we didn't hit a bracket too far away from position
					if (foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
						let foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1);
						let r = this._matchFoundBracket(foundBracket, currentModeBrackets.textIsBracket[foundBracketText], currentModeBrackets.textIsOpenBracket[foundBracketText]);

						// check that we can actually match this bracket
						if (r) {
							return r;
						}
					}

					currentTokenStart = foundBracket.endColumn - 1;
				}
			}
		}

		return null;
	}

	private _matchFoundBracket(foundBracket:Range, data:editorCommon.IRichEditBracket, isOpen:boolean): [Range,Range] {
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

	private _findMatchingBracketUp(bracket:editorCommon.IRichEditBracket, position:Position): Range {
		// console.log('_findMatchingBracketUp: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		let modeId = bracket.modeId;
		let reversedBracketRegex = bracket.reversedRegex;
		let count = -1;

		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			let lineTokens = this._lines[lineNumber - 1].getTokens();
			let lineText = this._lines[lineNumber - 1].text;
			let modeTransitions = this._lines[lineNumber - 1].getModeTransitions(this._mode);
			let currentModeIndex = modeTransitions.length - 1;
			let currentModeStart = modeTransitions[currentModeIndex].startIndex;
			let currentModeId = modeTransitions[currentModeIndex].modeId;

			let tokensLength = lineTokens.getTokenCount() - 1;
			let currentTokenEnd = lineText.length;
			if (lineNumber === position.lineNumber) {
				tokensLength = lineTokens.findIndexOfOffset(position.column - 1);
				currentTokenEnd = position.column - 1;

				currentModeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, position.column - 1);
				currentModeStart = modeTransitions[currentModeIndex].startIndex;
				currentModeId = modeTransitions[currentModeIndex].modeId;
			}

			for (let tokenIndex = tokensLength; tokenIndex >= 0; tokenIndex--) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenStart = lineTokens.getTokenStartIndex(tokenIndex);

				if (currentTokenStart < currentModeStart) {
					currentModeIndex--;
					currentModeStart = modeTransitions[currentModeIndex].startIndex;
					currentModeId = modeTransitions[currentModeIndex].modeId;
				}

				if (currentModeId === modeId && !ignoreBracketsInToken(currentTokenType)) {

					while (true) {
						let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, lineNumber, lineText, currentTokenStart, currentTokenEnd);
						if (!r) {
							break;
						}

						let hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1);

						if (hitText === bracket.open) {
							count++;
						} else if (hitText === bracket.close) {
							count--;
						}

						if (count === 0) {
							return r;
						}

						currentTokenEnd = r.startColumn - 1;
					}
				}

				currentTokenEnd = currentTokenStart;
			}
		}

		return null;
	}

	private _findMatchingBracketDown(bracket:editorCommon.IRichEditBracket, position:Position): Range {
		// console.log('_findMatchingBracketDown: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		let modeId = bracket.modeId;
		let bracketRegex = bracket.forwardRegex;
		let count = 1;

		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			let lineTokens = this._lines[lineNumber - 1].getTokens();
			let lineText = this._lines[lineNumber - 1].text;
			let modeTransitions = this._lines[lineNumber - 1].getModeTransitions(this._mode);
			let currentModeIndex = 0;
			let nextModeStart = (currentModeIndex + 1 < modeTransitions.length ? modeTransitions[currentModeIndex + 1].startIndex : lineText.length + 1);
			let currentModeId = modeTransitions[currentModeIndex].modeId;

			let startTokenIndex = 0;
			let currentTokenStart = lineTokens.getTokenStartIndex(startTokenIndex);
			if (lineNumber === position.lineNumber) {
				startTokenIndex = lineTokens.findIndexOfOffset(position.column - 1);
				currentTokenStart = Math.max(currentTokenStart, position.column - 1);

				currentModeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, position.column - 1);
				nextModeStart = (currentModeIndex + 1 < modeTransitions.length ? modeTransitions[currentModeIndex + 1].startIndex : lineText.length + 1);
				currentModeId = modeTransitions[currentModeIndex].modeId;
			}

			for (let tokenIndex = startTokenIndex, tokensLength = lineTokens.getTokenCount(); tokenIndex < tokensLength; tokenIndex++) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenEnd = lineTokens.getTokenEndIndex(tokenIndex, lineText.length);

				if (currentTokenStart >= nextModeStart) {
					currentModeIndex++;
					nextModeStart = (currentModeIndex + 1 < modeTransitions.length ? modeTransitions[currentModeIndex + 1].startIndex : lineText.length + 1);
					currentModeId = modeTransitions[currentModeIndex].modeId;
				}

				if (currentModeId === modeId && !ignoreBracketsInToken(currentTokenType)) {
					while (true) {
						let r = BracketsUtils.findNextBracketInToken(bracketRegex, lineNumber, lineText, currentTokenStart, currentTokenEnd);
						if (!r) {
							break;
						}

						let hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1);

						if (hitText === bracket.open) {
							count++;
						} else if (hitText === bracket.close) {
							count--;
						}

						if (count === 0) {
							return r;
						}

						currentTokenStart = r.endColumn - 1;
					}
				}

				currentTokenStart = currentTokenEnd;
			}
		}

		return null;
	}

	public findPrevBracket(_position:editorCommon.IPosition): editorCommon.IFoundBracket {
		let position = this.validatePosition(_position);

		let reversedBracketRegex = /[\(\)\[\]\{\}]/; // TODO@Alex: use mode's brackets

		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			let lineTokens = this._lines[lineNumber - 1].getTokens();
			let lineText = this._lines[lineNumber - 1].text;

			let tokensLength = lineTokens.getTokenCount() - 1;
			let currentTokenEnd = lineText.length;
			if (lineNumber === position.lineNumber) {
				tokensLength = lineTokens.findIndexOfOffset(position.column - 1);
				currentTokenEnd = position.column - 1;
			}

			for (let tokenIndex = tokensLength; tokenIndex >= 0; tokenIndex--) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenStart = lineTokens.getTokenStartIndex(tokenIndex);

				if (!ignoreBracketsInToken(currentTokenType)) {
					let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, lineNumber, lineText, currentTokenStart, currentTokenEnd);
					if (r) {
						return this._toFoundBracket(r);
					}
				}

				currentTokenEnd = currentTokenStart;
			}
		}

		return null;
	}

	public findNextBracket(_position:editorCommon.IPosition): editorCommon.IFoundBracket {
		let position = this.validatePosition(_position);

		let bracketRegex = /[\(\)\[\]\{\}]/; // TODO@Alex: use mode's brackets

		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			let lineTokens = this._lines[lineNumber - 1].getTokens();
			let lineText = this._lines[lineNumber - 1].text;

			let startTokenIndex = 0;
			let currentTokenStart = lineTokens.getTokenStartIndex(startTokenIndex);
			if (lineNumber === position.lineNumber) {
				startTokenIndex = lineTokens.findIndexOfOffset(position.column - 1);
				currentTokenStart = Math.max(currentTokenStart, position.column - 1);
			}

			for (let tokenIndex = startTokenIndex, tokensLength = lineTokens.getTokenCount(); tokenIndex < tokensLength; tokenIndex++) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenEnd = lineTokens.getTokenEndIndex(tokenIndex, lineText.length);

				if (!ignoreBracketsInToken(currentTokenType)) {
					let r = BracketsUtils.findNextBracketInToken(bracketRegex, lineNumber, lineText, currentTokenStart, currentTokenEnd);
					if (r) {
						return this._toFoundBracket(r);
					}
				}

				currentTokenStart = currentTokenEnd;
			}
		}

		return null;
	}

	private _toFoundBracket(r:Range): editorCommon.IFoundBracket {
		if (!r) {
			return null;
		}

		let text = this.getValueInRange(r);

		// TODO@Alex: use mode's brackets
		switch (text) {
			case '(': return { range: r, open: '(', close: ')', isOpen: true };
			case ')': return { range: r, open: '(', close: ')', isOpen: false };
			case '[': return { range: r, open: '[', close: ']', isOpen: true };
			case ']': return { range: r, open: '[', close: ']', isOpen: false };
			case '{': return { range: r, open: '{', close: '}', isOpen: true };
			case '}': return { range: r, open: '{', close: '}', isOpen: false };
		}
		return null;
	}
}
