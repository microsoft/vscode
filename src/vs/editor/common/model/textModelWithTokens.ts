/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import nls = require('vs/nls');

import Timer = require('vs/base/common/timer');
import {NullMode, NullState, nullTokenize} from 'vs/editor/common/modes/nullMode';
import {WordHelper, BracketsHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {TokenIterator} from 'vs/editor/common/model/tokenIterator';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import {TextModel} from 'vs/editor/common/model/textModel';
import {DefaultConfig} from 'vs/editor/common/config/defaultConfig';
import Modes = require('vs/editor/common/modes');
import EditorCommon = require('vs/editor/common/editorCommon');
import {RunOnceScheduler} from 'vs/base/common/async';
import {Arrays} from 'vs/editor/common/core/arrays';
import Errors = require('vs/base/common/errors');
import {IDisposable, disposeAll} from 'vs/base/common/lifecycle';
import {StopWatch} from 'vs/base/common/stopwatch';
import {TPromise} from 'vs/base/common/winjs.base';

export class TokensInflatorMap implements EditorCommon.ITokensInflatorMap {

	public _inflate:string[];

	public _deflate: {
		[token:string]:number;
	};

	constructor() {
		this._inflate = [ '' ];
		this._deflate = { '': 0 };
	}
}

class ModeToModelBinder implements IDisposable {

	private _modePromise:TPromise<Modes.IMode>;
	private _externalModePromise:TPromise<boolean>;
	private _externalModePromise_c:(value:boolean)=>void;
	private _externalModePromise_e:(err:any)=>void;
	private _model:TextModelWithTokens;
	private _isDisposed:boolean;

	constructor(modePromise:TPromise<Modes.IMode>, model:TextModelWithTokens) {
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
		}).then((mode:Modes.IMode) => {
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
			Errors.onUnexpectedError(err);
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
	getRange(): EditorCommon.IRange;
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
		}).done(null, Errors.onUnexpectedError);
	}

	public getRange(): EditorCommon.IRange {
		return null;
	}

	public dispose(): void {
		this._retokenizePromise = null;
		this._model = null;
		this._isDisposed = true;
	}
}

class LineContext implements Modes.ILineContext {

	public modeTransitions:Modes.IModeTransition[];
	private _text:string;
	private _lineTokens:EditorCommon.ILineTokens;

	constructor (topLevelMode:Modes.IMode, line:ModelLine) {
		this.modeTransitions = line.getModeTransitions().toArray(topLevelMode);
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

	public getTokenBracket(tokenIndex:number): Modes.Bracket {
		return this._lineTokens.getTokenBracket(tokenIndex);
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

export class TextModelWithTokens extends TextModel implements EditorCommon.ITokenizedModel {

	private static MODE_TOKENIZATION_FAILED_MSG = nls.localize('mode.tokenizationSupportFailed', "The mode has failed while tokenizing the input.");
	private static MODEL_SYNC_LIMIT = 5 * 1024 * 1024; // 5 MB
	private static MODEL_TOKENIZATION_LIMIT = 50 * 1024 * 1024; // 50 MB

	private _shouldAutoTokenize:boolean;
	private _mode: Modes.IMode;
	private _modeListener: IDisposable;
	private _modeToModelBinder:ModeToModelBinder;
	private _tokensInflatorMap:EditorCommon.ITokensInflatorMap;
	private _stopLineTokenizationAfter:number;

	private _invalidLineStartIndex:number;
	private _lastState:Modes.IState;

	private _revalidateTokensTimeout:number;
	private _scheduleRetokenizeNow: RunOnceScheduler;
	private _retokenizers:IRetokenizeRequest[];

	private _tokenizationElapsedTime: number;
	private _tokenizationTotalCharacters: number;

	private _shouldSimplifyMode: boolean;
	private _shouldDenyMode: boolean;

	constructor(allowedEventTypes:string[], rawText:EditorCommon.IRawText, shouldAutoTokenize:boolean, modeOrPromise:Modes.IMode|TPromise<Modes.IMode>) {
		allowedEventTypes.push(EditorCommon.EventType.ModelTokensChanged);
		allowedEventTypes.push(EditorCommon.EventType.ModelModeChanged);
		allowedEventTypes.push(EditorCommon.EventType.ModelModeSupportChanged);
		super(allowedEventTypes, rawText);

		this._shouldAutoTokenize = shouldAutoTokenize;
		this._shouldSimplifyMode = (rawText.length > TextModelWithTokens.MODEL_SYNC_LIMIT);
		this._shouldDenyMode = (rawText.length > TextModelWithTokens.MODEL_TOKENIZATION_LIMIT);

		this._stopLineTokenizationAfter = DefaultConfig.editor.stopLineTokenizationAfter;

		if (!modeOrPromise) {
			this._mode = new NullMode();
		} else if (TPromise.is(modeOrPromise)) {
			// TODO@Alex: To avoid mode id changes, we check if this promise is resolved
			let promiseValue = <Modes.IMode>(<any>modeOrPromise)._value;

			if (promiseValue && typeof promiseValue.getId === 'function') {
				// The promise is already resolved
				this._mode = this._massageMode(promiseValue);
				this._resetModeListener(this._mode);
			} else {
				var modePromise = <TPromise<Modes.IMode>>modeOrPromise;
				this._modeToModelBinder = new ModeToModelBinder(modePromise, this);
				this._mode = new NullMode();
			}
		} else {
			this._mode = this._massageMode(<Modes.IMode>modeOrPromise);
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
		this._retokenizers = disposeAll(this._retokenizers);
		this._scheduleRetokenizeNow.dispose();

		super.dispose();
	}

	private _massageMode(mode: Modes.IMode): Modes.IMode {
		if (this._shouldDenyMode) {
			return new NullMode();
		}
		if (this._shouldSimplifyMode) {
			return new SimplifiedMode(mode);
		}
		return mode;
	}

	public whenModeIsReady(): TPromise<Modes.IMode> {
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

	_resetValue(e:EditorCommon.IModelContentChangedFlushEvent, newValue:string): void {
		super._resetValue(e, newValue);
		// Cancel tokenization, clear all tokens and begin tokenizing
		this._resetTokenizationState();
	}

	_resetMode(e:EditorCommon.IModelModeChangedEvent, newMode:Modes.IMode): void {
		// Cancel tokenization, clear all tokens and begin tokenizing
		this._mode = newMode;
		this._resetModeListener(newMode);
		this._resetTokenizationState();

		this.emitModelTokensChangedEvent(1, this.getLineCount());
	}

	private _resetModeListener(newMode: Modes.IMode): void {
		if (this._modeListener) {
			this._modeListener.dispose();
			this._modeListener = null;
		}
		if (newMode && typeof newMode.addSupportChangedListener === 'function') {
			this._modeListener = newMode.addSupportChangedListener( (e) => this._onModeSupportChanged(e) );
		}
	}

	private _onModeSupportChanged(e: EditorCommon.IModeSupportChangedEvent): void {
		this._emitModelModeSupportChangedEvent(e);
		if (e.tokenizationSupport) {
			this._resetTokenizationState();
			this.emitModelTokensChangedEvent(1, this.getLineCount());
		}
	}

	_resetTokenizationState(): void {
		this._retokenizers = disposeAll(this._retokenizers);
		this._scheduleRetokenizeNow.cancel();
		this._clearTimers();
		for (var i = 0; i < this._lines.length; i++) {
			this._lines[i].setState(null);
		}
		this._initializeTokenizationState();
		this._tokenizationElapsedTime = 0;
		this._tokenizationTotalCharacters = 1;
	}

	private _clearTimers(): void {
		if (this._revalidateTokensTimeout !== -1) {
			clearTimeout(this._revalidateTokensTimeout);
			this._revalidateTokensTimeout = -1;
		}
	}

	private _initializeTokenizationState(): void {
		// Initialize tokenization states
		var initialState:Modes.IState = null;
		if (this._mode.tokenizationSupport) {
			try {
				initialState = this._mode.tokenizationSupport.getInitialState();
			} catch (e) {
				e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
				Errors.onUnexpectedError(e);
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

	public setStopLineTokenizationAfter(stopLineTokenizationAfter:number): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.setStopLineTokenizationAfter: Model is disposed');
		}

		this._stopLineTokenizationAfter = stopLineTokenizationAfter;
	}

	public getLineTokens(lineNumber:number, inaccurateTokensAcceptable:boolean = false): EditorCommon.ILineTokens {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.getLineTokens: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		if (!inaccurateTokensAcceptable) {
			this._updateTokensUntilLine(lineNumber, true);
		}
		return this._lines[lineNumber - 1].getTokens();
	}

	public getLineContext(lineNumber:number): Modes.ILineContext {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.getLineContext: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		this._updateTokensUntilLine(lineNumber, true);

		return new LineContext(this._mode, this._lines[lineNumber - 1]);
	}

	_getInternalTokens(lineNumber:number): EditorCommon.ILineTokens {
		this._updateTokensUntilLine(lineNumber, true);
		return this._lines[lineNumber - 1].getTokens();
	}

	public setValue(value:string, newMode?:Modes.IMode): void;
	public setValue(value:string, newModePromise?:TPromise<Modes.IMode>): void;
	public setValue(value:string, newModeOrPromise:any=null): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.setValue: Model is disposed');
		}

		if (value !== null) {
			super.setValue(value);
		}

		if (newModeOrPromise) {
			if (this._modeToModelBinder) {
				this._modeToModelBinder.dispose();
				this._modeToModelBinder = null;
			}
			if (TPromise.is(newModeOrPromise)) {
				this._modeToModelBinder = new ModeToModelBinder(<TPromise<Modes.IMode>>newModeOrPromise, this);
			} else {
				var actualNewMode = this._massageMode(<Modes.IMode>newModeOrPromise);
				if (this._mode !== actualNewMode) {
					var e2:EditorCommon.IModelModeChangedEvent = {
						oldMode: this._mode,
						newMode: actualNewMode
					};
					this._resetMode(e2, actualNewMode);
					this._emitModelModeChangedEvent(e2);
				}
			}
		}
	}

	public getMode(): Modes.IMode {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.getMode: Model is disposed');
		}

		return this._mode;
	}

	public setMode(newMode:Modes.IMode): void;
	public setMode(newModePromise:TPromise<Modes.IMode>): void;
	public setMode(newModeOrPromise:any): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.setMode: Model is disposed');
		}

		if (!newModeOrPromise) {
			// There's nothing to do
			return;
		}
		this.setValue(null, newModeOrPromise);
	}

	public getModeAtPosition(_lineNumber:number, _column:number): Modes.IMode {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.getModeAtPosition: Model is disposed');
		}

		var validPosition = this.validatePosition({
			lineNumber: _lineNumber,
			column: _column
		});

		var lineNumber = validPosition.lineNumber;
		var column = validPosition.column;

		if (column === 1) {
			return this.getStateBeforeLine(lineNumber).getMode();
		} else if (column === this.getLineMaxColumn(lineNumber)) {
			return this.getStateAfterLine(lineNumber).getMode();
		} else {
			var modeTransitions = this._getLineModeTransitions(lineNumber);
			var modeTransitionIndex = Arrays.findIndexInSegmentsArray(modeTransitions, column - 1);
			return modeTransitions[modeTransitionIndex].mode;
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

	_updateLineTokens(lineIndex:number, map:EditorCommon.ITokensInflatorMap, topLevelMode:Modes.IMode, r:Modes.ILineTokens): void {
		this._lines[lineIndex].setTokens(map, r.tokens, topLevelMode, r.modeTransitions);
	}

	private _beginBackgroundTokenization(): void {
		if (this._shouldAutoTokenize && this._revalidateTokensTimeout === -1) {
			this._revalidateTokensTimeout = setTimeout(() => {
				this._revalidateTokensTimeout = -1;
				this._revalidateTokensNow();
			}, 0);
		}
	}

	_warmUpTokens(): void {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens._warmUpTokens: Model is disposed');
		}

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
	}

	private _revalidateTokensNow(toLineNumber:number = this._invalidLineStartIndex + 1000000): void {

		var timer = Timer.start(Timer.Topic.EDITOR, 'backgroundTokenization');
		toLineNumber = Math.min(this._lines.length, toLineNumber);

		var MAX_ALLOWED_TIME = 20,
			fromLineNumber = this._invalidLineStartIndex + 1,
			tokenizedChars = 0,
			currentCharsToTokenize = 0,
			currentEstimatedTimeToTokenize = 0,
			stopLineTokenizationAfter = this._stopLineTokenizationAfter,
			sw = StopWatch.create(),
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
			if (stopLineTokenizationAfter !== -1 && currentCharsToTokenize > stopLineTokenizationAfter) {
				currentCharsToTokenize = stopLineTokenizationAfter;
			}

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
//		console.log('TOKENIZED LOCAL (' + this._mode.getId() + ') ' + tokenizedChars + '\t in \t' + elapsedTime + '\t speed \t' + tokenizedChars/elapsedTime);
//		console.log('TOKENIZED GLOBAL(' + this._mode.getId() + ') ' + this._tokenizationTotalCharacters + '\t in*\t' + this._tokenizationElapsedTime + '\t speed*\t' + this._tokenizationTotalCharacters/this._tokenizationElapsedTime);

		var t2 = Timer.start(Timer.Topic.EDITOR, '**speed: ' + this._tokenizationTotalCharacters / this._tokenizationElapsedTime);
		t2.stop();

		if (fromLineNumber <= toLineNumber) {
			this.emitModelTokensChangedEvent(fromLineNumber, toLineNumber);
		}

		if (this._invalidLineStartIndex < this._lines.length) {
			this._beginBackgroundTokenization();
		}

		timer.stop();
	}

	private getStateBeforeLine(lineNumber:number): Modes.IState {
		this._updateTokensUntilLine(lineNumber - 1, true);
		return this._lines[lineNumber - 1].getState();
	}

	private getStateAfterLine(lineNumber:number): Modes.IState {
		this._updateTokensUntilLine(lineNumber, true);
		return lineNumber < this._lines.length ? this._lines[lineNumber].getState() : this._lastState;
	}

	_getLineModeTransitions(lineNumber:number): Modes.IModeTransition[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens._getLineModeTransitions: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}
		this._updateTokensUntilLine(lineNumber, true);
		return this._lines[lineNumber - 1].getModeTransitions().toArray(this._mode);
	}

	private _updateTokensUntilLine(lineNumber:number, emitEvents:boolean): void {
		var linesLength = this._lines.length;
		var endLineIndex = lineNumber - 1;
		var stopLineTokenizationAfter = this._stopLineTokenizationAfter;
		if (stopLineTokenizationAfter === -1) {
			stopLineTokenizationAfter = 1000000000; // 1 billion, if a line is so long, you have other trouble :).
		}

		var sw = StopWatch.create();
		var tokenizedCharacters = 0;

		var fromLineNumber = this._invalidLineStartIndex + 1, toLineNumber = lineNumber;

		// Validate all states up to and including endLineIndex
		for (var lineIndex = this._invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			var endStateIndex = lineIndex + 1;
			var r:Modes.ILineTokens = null;
			var text = this._lines[lineIndex].text;
			if (this._mode.tokenizationSupport) {

				try {
					// Tokenize only the first X characters
					r = this._mode.tokenizationSupport.tokenize(this._lines[lineIndex].text, this._lines[lineIndex].getState(), 0, stopLineTokenizationAfter);
					tokenizedCharacters = r ? r.actualStopOffset : this._lines[lineIndex].text.length;
				} catch (e) {
					e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
					Errors.onUnexpectedError(e);
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
						type: '',
						bracket: 0
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

		this._tokenizationElapsedTime += sw.elapsed();
		this._tokenizationTotalCharacters += tokenizedCharacters;

		if (emitEvents && fromLineNumber <= toLineNumber) {
			this.emitModelTokensChangedEvent(fromLineNumber, toLineNumber);
		}
	}

	private emitModelTokensChangedEvent(fromLineNumber:number, toLineNumber:number): void {
		var e:EditorCommon.IModelTokensChangedEvent = {
			fromLineNumber: fromLineNumber,
			toLineNumber: toLineNumber
		};
		if (!this._isDisposing) {
			this.emit(EditorCommon.EventType.ModelTokensChanged, e);
		}
	}

	private _emitModelModeChangedEvent(e:EditorCommon.IModelModeChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(EditorCommon.EventType.ModelModeChanged, e);
		}
	}

	private _emitModelModeSupportChangedEvent(e:EditorCommon.IModeSupportChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(EditorCommon.EventType.ModelModeSupportChanged, e);
		}
	}

	// Having tokens allows implementing additional helper methods

	_lineIsTokenized(lineNumber:number): boolean {
		return this._invalidLineStartIndex > lineNumber - 1;
	}

	_getWordDefinition(): RegExp {
		return WordHelper.massageWordDefinitionOf(this._mode);
	}

	public getWordAtPosition(position:EditorCommon.IPosition): EditorCommon.IWordAtPosition {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.getWordAtPosition: Model is disposed');
		}

		return WordHelper.getWordAtPosition(this, this.validatePosition(position));
	}

	public getWordUntilPosition(position: EditorCommon.IPosition): EditorCommon.IWordAtPosition {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.getWordUntilPosition: Model is disposed');
		}

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

	public getWords(lineNumber:number): EditorCommon.IWordRange[] {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.getWords: Model is disposed');
		}
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return WordHelper.getWords(this, this.validateLineNumber(lineNumber));
	}

	public tokenIterator(position:EditorCommon.IPosition, callback:(it:TokenIterator)=>any): any {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.tokenIterator: Model is disposed');
		}

		var iter = new TokenIterator(this, this.validatePosition(position));
		var result = callback(iter);
		iter._invalidate();
		return result;
	}

	public findMatchingBracketUp(tokenType:string, position:EditorCommon.IPosition): EditorCommon.IEditorRange {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.findMatchingBracketUp: Model is disposed');
		}

		return BracketsHelper.findMatchingBracketUp(this, tokenType, this.validatePosition(position));
	}

	public matchBracket(position:EditorCommon.IPosition, inaccurateResultAcceptable:boolean = false): EditorCommon.IMatchBracketResult {
		if (this._isDisposed) {
			throw new Error('TextModelWithTokens.matchBracket: Model is disposed');
		}

		return BracketsHelper.matchBracket(this, this.validatePosition(position), inaccurateResultAcceptable);
	}
}

class SimplifiedMode implements Modes.IMode {

	tokenizationSupport: Modes.ITokenizationSupport;
	electricCharacterSupport: Modes.IElectricCharacterSupport;
	commentsSupport: Modes.ICommentsSupport;
	characterPairSupport: Modes.ICharacterPairSupport;
	tokenTypeClassificationSupport: Modes.ITokenTypeClassificationSupport;

	private _id: string;

	constructor(sourceMode: Modes.IMode) {
		this._id = 'vs.editor.modes.simplifiedMode:' + sourceMode.getId();
		this.tokenizationSupport = sourceMode.tokenizationSupport;
		this.electricCharacterSupport = sourceMode.electricCharacterSupport;
		this.commentsSupport = sourceMode.commentsSupport;
		this.characterPairSupport = sourceMode.characterPairSupport;
		this.tokenTypeClassificationSupport = sourceMode.tokenTypeClassificationSupport;
	}

	public getId(): string {
		return this._id;
	}
}