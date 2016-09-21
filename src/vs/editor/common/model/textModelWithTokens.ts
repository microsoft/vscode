/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IDisposable} from 'vs/base/common/lifecycle';
import {StopWatch} from 'vs/base/common/stopwatch';
import * as timer from 'vs/base/common/timer';
import {Range} from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import {ModelLine} from 'vs/editor/common/model/modelLine';
import {TextModel} from 'vs/editor/common/model/textModel';
import {WordHelper} from 'vs/editor/common/model/textModelWithTokensHelpers';
import {TokenIterator} from 'vs/editor/common/model/tokenIterator';
import {ITokenizationSupport, ILineContext, ILineTokens, IMode, IState, TokenizationRegistry} from 'vs/editor/common/modes';
import {NULL_MODE_ID, nullTokenize} from 'vs/editor/common/modes/nullMode';
import {ignoreBracketsInToken} from 'vs/editor/common/modes/supports';
import {BracketsUtils} from 'vs/editor/common/modes/supports/richEditBrackets';
import {ModeTransition} from 'vs/editor/common/core/modeTransition';
import {TokensInflatorMap} from 'vs/editor/common/model/tokensBinaryEncoding';
import {Position} from 'vs/editor/common/core/position';
import {LanguageConfigurationRegistry} from 'vs/editor/common/modes/languageConfigurationRegistry';
import {Token} from 'vs/editor/common/core/token';
import {LineTokens} from 'vs/editor/common/core/lineTokens';

class Mode implements IMode {

	private _languageId:string;

	constructor(languageId:string) {
		this._languageId = languageId;
	}

	getId(): string {
		return this._languageId;
	}
}

/**
 * TODO@Alex: remove this wrapper
 */
class LineContext implements ILineContext {

	public modeTransitions:ModeTransition[];
	private _text:string;
	private _lineTokens:LineTokens;

	constructor (topLevelModeId:string, line:ModelLine, map:TokensInflatorMap) {
		this.modeTransitions = line.getModeTransitions(topLevelModeId);
		this._text = line.text;
		this._lineTokens = line.getTokens(map);
	}

	public getLineContent(): string {
		return this._text;
	}

	public getTokenCount(): number {
		return this._lineTokens.getTokenCount();
	}

	public getTokenStartOffset(tokenIndex:number): number {
		return this._lineTokens.getTokenStartOffset(tokenIndex);
	}

	public getTokenType(tokenIndex:number): string {
		return this._lineTokens.getTokenType(tokenIndex);
	}

	public findIndexOfOffset(offset:number): number {
		return this._lineTokens.findTokenIndexAtOffset(offset);
	}
}

export class TextModelWithTokens extends TextModel implements editorCommon.ITokenizedModel {

	private static MODE_TOKENIZATION_FAILED_MSG = nls.localize('mode.tokenizationSupportFailed', "The mode has failed while tokenizing the input.");

	private _languageId: string;
	private _tokenizationListener: IDisposable;
	private _tokenizationSupport: ITokenizationSupport;
	private _tokensInflatorMap:TokensInflatorMap;

	private _invalidLineStartIndex:number;
	private _lastState:IState;

	private _revalidateTokensTimeout:number;

	constructor(allowedEventTypes:string[], rawText:editorCommon.IRawText, languageId:string) {
		allowedEventTypes.push(editorCommon.EventType.ModelTokensChanged);
		allowedEventTypes.push(editorCommon.EventType.ModelModeChanged);
		super(allowedEventTypes, rawText);

		this._languageId = languageId || NULL_MODE_ID;
		this._tokenizationListener = TokenizationRegistry.onDidChange((e) => {
			if (e.languageId !== this._languageId) {
				return;
			}

			this._resetTokenizationState();
			this.emitModelTokensChangedEvent(1, this.getLineCount());
		});
		this._tokensInflatorMap = null;

		this._invalidLineStartIndex = 0;
		this._lastState = null;

		this._revalidateTokensTimeout = -1;

		this._resetTokenizationState();
	}

	public dispose(): void {
		this._tokenizationListener.dispose();
		this._clearTimers();
		this._lastState = null;
		this._tokensInflatorMap = null;

		super.dispose();
	}

	protected _shouldAutoTokenize(): boolean {
		return false;
	}

	protected _resetValue(e:editorCommon.IModelContentChangedFlushEvent, newValue:editorCommon.IRawText): void {
		super._resetValue(e, newValue);
		// Cancel tokenization, clear all tokens and begin tokenizing
		this._resetTokenizationState();
	}

	protected _resetTokenizationState(): void {
		this._clearTimers();
		for (let i = 0; i < this._lines.length; i++) {
			this._lines[i].resetTokenizationState();
		}

		this._tokenizationSupport = null;
		if (!this.isTooLargeForHavingAMode()) {
			this._tokenizationSupport = TokenizationRegistry.get(this._languageId);
		}

		if (this._tokenizationSupport) {
			let initialState:IState = null;
			try {
				initialState = this._tokenizationSupport.getInitialState();
			} catch (e) {
				e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
				onUnexpectedError(e);
				this._tokenizationSupport = null;
			}

			if (initialState) {
				this._lines[0].setState(initialState);
			}
		}

		this._lastState = null;
		this._tokensInflatorMap = new TokensInflatorMap(this.getModeId());
		this._invalidLineStartIndex = 0;
		this._beginBackgroundTokenization();
	}

	private _clearTimers(): void {
		if (this._revalidateTokensTimeout !== -1) {
			clearTimeout(this._revalidateTokensTimeout);
			this._revalidateTokensTimeout = -1;
		}
	}

	public getLineTokens(lineNumber:number, inaccurateTokensAcceptable:boolean = false): LineTokens {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		if (!inaccurateTokensAcceptable) {
			this._updateTokensUntilLine(lineNumber, true);
		}
		return this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
	}

	public getLineContext(lineNumber:number): ILineContext {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		this._updateTokensUntilLine(lineNumber, true);

		return new LineContext(this.getModeId(), this._lines[lineNumber - 1], this._tokensInflatorMap);
	}

	public getMode(): IMode {
		return new Mode(this._languageId);
	}

	public getModeId(): string {
		return this.getMode().getId();
	}

	public setMode(languageId:string): void {
		if (this._languageId === languageId) {
			// There's nothing to do
			return;
		}

		let e:editorCommon.IModelModeChangedEvent = {
			oldMode: new Mode(this._languageId),
			newMode: new Mode(languageId)
		};

		this._languageId = languageId;

		// Cancel tokenization, clear all tokens and begin tokenizing
		this._resetTokenizationState();

		this.emitModelTokensChangedEvent(1, this.getLineCount());
		this._emitModelModeChangedEvent(e);
	}

	public getModeIdAtPosition(_lineNumber:number, _column:number): string {
		if (!this._tokenizationSupport) {
			return this.getModeId();
		}
		var validPosition = this.validatePosition({
			lineNumber: _lineNumber,
			column: _column
		});

		var lineNumber = validPosition.lineNumber;
		var column = validPosition.column;

		if (column === 1) {
			return this.getStateBeforeLine(lineNumber).getModeId();
		} else if (column === this.getLineMaxColumn(lineNumber)) {
			return this.getStateAfterLine(lineNumber).getModeId();
		} else {
			var modeTransitions = this._getLineModeTransitions(lineNumber);
			var modeTransitionIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, column - 1);
			return modeTransitions[modeTransitionIndex].modeId;
		}
	}

	protected _invalidateLine(lineIndex:number): void {
		this._lines[lineIndex].isInvalid = true;
		if (lineIndex < this._invalidLineStartIndex) {
			if (this._invalidLineStartIndex < this._lines.length) {
				this._lines[this._invalidLineStartIndex].isInvalid = true;
			}
			this._invalidLineStartIndex = lineIndex;
			this._beginBackgroundTokenization();
		}
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
		return this._lines[lineNumber - 1].getModeTransitions(this.getModeId());
	}

	private _updateTokensUntilLine(lineNumber:number, emitEvents:boolean): void {
		if (!this._tokenizationSupport) {
			this._invalidLineStartIndex = this._lines.length;
			return;
		}

		var linesLength = this._lines.length;
		var endLineIndex = lineNumber - 1;
		var stopLineTokenizationAfter = 1000000000; // 1 billion, if a line is so long, you have other trouble :).

		var fromLineNumber = this._invalidLineStartIndex + 1, toLineNumber = lineNumber;

		// Validate all states up to and including endLineIndex
		for (var lineIndex = this._invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			var endStateIndex = lineIndex + 1;
			var r:ILineTokens = null;
			var text = this._lines[lineIndex].text;

			try {
				// Tokenize only the first X characters
				r = this._tokenizationSupport.tokenize(this._lines[lineIndex].text, this._lines[lineIndex].getState(), 0, stopLineTokenizationAfter);
			} catch (e) {
				e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
				onUnexpectedError(e);
			}

			if (r && r.tokens && r.tokens.length > 0) {
				// Cannot have a stop offset before the last token
				r.actualStopOffset = Math.max(r.actualStopOffset, r.tokens[r.tokens.length - 1].startIndex + 1);
			}

			if (r && r.actualStopOffset < text.length) {
				// Treat the rest of the line (if above limit) as one default token
				r.tokens.push(new Token(r.actualStopOffset, ''));

				// Use as end state the starting state
				r.endState = this._lines[lineIndex].getState();
			}

			if (!r) {
				r = nullTokenize(this.getModeId(), text, this._lines[lineIndex].getState());
			}
			if (!r.modeTransitions) {
				r.modeTransitions = [];
			}
			if (r.modeTransitions.length === 0) {
				// Make sure there is at least the transition to the top-most mode
				r.modeTransitions.push(new ModeTransition(0, this.getModeId()));
			}
			this._lines[lineIndex].setTokens(this._tokensInflatorMap, r.tokens, r.modeTransitions);
			this._lines[lineIndex].isInvalid = false;

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

	// Having tokens allows implementing additional helper methods

	_lineIsTokenized(lineNumber:number): boolean {
		return this._invalidLineStartIndex > lineNumber - 1;
	}

	protected _getWordDefinition(): RegExp {
		return WordHelper.massageWordDefinitionOf(this.getModeId());
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

	public findMatchingBracketUp(_bracket:string, _position:editorCommon.IPosition): Range {
		let bracket = _bracket.toLowerCase();
		let position = this.validatePosition(_position);

		let modeTransitions = this._lines[position.lineNumber - 1].getModeTransitions(this.getModeId());
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
		const lineNumber = position.lineNumber;
		const lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
		const lineText = this._lines[lineNumber - 1].text;

		const currentToken = lineTokens.findTokenAtOffset(position.column - 1);
		const currentModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(currentToken.modeId);

		// If position is in between two tokens, try first looking in the previous token
		if (currentToken.hasPrev && currentToken.startOffset === position.column - 1) {
			const prevToken = currentToken.prev();
			const prevModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(prevToken.modeId);

			// check that previous token is not to be ignored
			if (prevModeBrackets && !ignoreBracketsInToken(prevToken.type)) {
				// limit search in case previous token is very large, there's no need to go beyond `maxBracketLength`
				const searchStartOffset = Math.max(prevToken.startOffset, position.column - 1 - prevModeBrackets.maxBracketLength);
				const searchEndOffset = currentToken.startOffset;
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

		// check that the token is not to be ignored
		if (currentModeBrackets && !ignoreBracketsInToken(currentToken.type)) {
			// limit search to not go before `maxBracketLength`
			let searchStartOffset = Math.max(currentToken.startOffset, position.column - 1 - currentModeBrackets.maxBracketLength);
			// limit search to not go after `maxBracketLength`
			const searchEndOffset = Math.min(currentToken.endOffset, position.column - 1 + currentModeBrackets.maxBracketLength);

			// it might still be the case that [currentTokenStart -> currentTokenEnd] contains multiple brackets
			while (true) {
				let foundBracket = BracketsUtils.findNextBracketInText(currentModeBrackets.forwardRegex, lineNumber, lineText.substring(searchStartOffset, searchEndOffset), searchStartOffset);
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
			let lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			let lineText = this._lines[lineNumber - 1].text;
			let modeTransitions = this._lines[lineNumber - 1].getModeTransitions(this.getModeId());
			let currentModeIndex = modeTransitions.length - 1;
			let currentModeStart = modeTransitions[currentModeIndex].startIndex;
			let currentModeId = modeTransitions[currentModeIndex].modeId;

			let tokensLength = lineTokens.getTokenCount() - 1;
			let currentTokenEndOffset = lineText.length;
			if (lineNumber === position.lineNumber) {
				tokensLength = lineTokens.findTokenIndexAtOffset(position.column - 1);
				currentTokenEndOffset = position.column - 1;

				currentModeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, position.column - 1);
				currentModeStart = modeTransitions[currentModeIndex].startIndex;
				currentModeId = modeTransitions[currentModeIndex].modeId;
			}

			for (let tokenIndex = tokensLength; tokenIndex >= 0; tokenIndex--) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenStartOffset = lineTokens.getTokenStartOffset(tokenIndex);

				if (currentTokenStartOffset < currentModeStart) {
					currentModeIndex--;
					currentModeStart = modeTransitions[currentModeIndex].startIndex;
					currentModeId = modeTransitions[currentModeIndex].modeId;
				}

				if (currentModeId === modeId && !ignoreBracketsInToken(currentTokenType)) {

					while (true) {
						let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, lineNumber, lineText, currentTokenStartOffset, currentTokenEndOffset);
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

						currentTokenEndOffset = r.startColumn - 1;
					}
				}

				currentTokenEndOffset = currentTokenStartOffset;
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
			let lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			let lineText = this._lines[lineNumber - 1].text;
			let modeTransitions = this._lines[lineNumber - 1].getModeTransitions(this.getModeId());
			let currentModeIndex = 0;
			let nextModeStart = (currentModeIndex + 1 < modeTransitions.length ? modeTransitions[currentModeIndex + 1].startIndex : lineText.length + 1);
			let currentModeId = modeTransitions[currentModeIndex].modeId;

			let startTokenIndex = 0;
			let currentTokenStartOffset = lineTokens.getTokenStartOffset(startTokenIndex);
			if (lineNumber === position.lineNumber) {
				startTokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				currentTokenStartOffset = Math.max(currentTokenStartOffset, position.column - 1);

				currentModeIndex = ModeTransition.findIndexInSegmentsArray(modeTransitions, position.column - 1);
				nextModeStart = (currentModeIndex + 1 < modeTransitions.length ? modeTransitions[currentModeIndex + 1].startIndex : lineText.length + 1);
				currentModeId = modeTransitions[currentModeIndex].modeId;
			}

			for (let tokenIndex = startTokenIndex, tokensLength = lineTokens.getTokenCount(); tokenIndex < tokensLength; tokenIndex++) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenEndOffset = lineTokens.getTokenEndOffset(tokenIndex);

				if (currentTokenStartOffset >= nextModeStart) {
					currentModeIndex++;
					nextModeStart = (currentModeIndex + 1 < modeTransitions.length ? modeTransitions[currentModeIndex + 1].startIndex : lineText.length + 1);
					currentModeId = modeTransitions[currentModeIndex].modeId;
				}

				if (currentModeId === modeId && !ignoreBracketsInToken(currentTokenType)) {
					while (true) {
						let r = BracketsUtils.findNextBracketInToken(bracketRegex, lineNumber, lineText, currentTokenStartOffset, currentTokenEndOffset);
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

						currentTokenStartOffset = r.endColumn - 1;
					}
				}

				currentTokenStartOffset = currentTokenEndOffset;
			}
		}

		return null;
	}

	public findPrevBracket(_position:editorCommon.IPosition): editorCommon.IFoundBracket {
		let position = this.validatePosition(_position);

		let reversedBracketRegex = /[\(\)\[\]\{\}]/; // TODO@Alex: use mode's brackets

		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			let lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			let lineText = this._lines[lineNumber - 1].text;

			let tokensLength = lineTokens.getTokenCount() - 1;
			let currentTokenEndOffset = lineText.length;
			if (lineNumber === position.lineNumber) {
				tokensLength = lineTokens.findTokenIndexAtOffset(position.column - 1);
				currentTokenEndOffset = position.column - 1;
			}

			for (let tokenIndex = tokensLength; tokenIndex >= 0; tokenIndex--) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenStartOffset = lineTokens.getTokenStartOffset(tokenIndex);

				if (!ignoreBracketsInToken(currentTokenType)) {
					let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, lineNumber, lineText, currentTokenStartOffset, currentTokenEndOffset);
					if (r) {
						return this._toFoundBracket(r);
					}
				}

				currentTokenEndOffset = currentTokenStartOffset;
			}
		}

		return null;
	}

	public findNextBracket(_position:editorCommon.IPosition): editorCommon.IFoundBracket {
		let position = this.validatePosition(_position);

		let bracketRegex = /[\(\)\[\]\{\}]/; // TODO@Alex: use mode's brackets

		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			let lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			let lineText = this._lines[lineNumber - 1].text;

			let startTokenIndex = 0;
			let currentTokenStartOffset = lineTokens.getTokenStartOffset(startTokenIndex);
			if (lineNumber === position.lineNumber) {
				startTokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				currentTokenStartOffset = Math.max(currentTokenStartOffset, position.column - 1);
			}

			for (let tokenIndex = startTokenIndex, tokensLength = lineTokens.getTokenCount(); tokenIndex < tokensLength; tokenIndex++) {
				let currentTokenType = lineTokens.getTokenType(tokenIndex);
				let currentTokenEndOffset = lineTokens.getTokenEndOffset(tokenIndex);

				if (!ignoreBracketsInToken(currentTokenType)) {
					let r = BracketsUtils.findNextBracketInToken(bracketRegex, lineNumber, lineText, currentTokenStartOffset, currentTokenEndOffset);
					if (r) {
						return this._toFoundBracket(r);
					}
				}

				currentTokenStartOffset = currentTokenEndOffset;
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
