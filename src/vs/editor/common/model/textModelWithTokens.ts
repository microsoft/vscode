/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import * as timer from 'vs/base/common/timer';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { ModelLine } from 'vs/editor/common/model/modelLine';
import { TextModel } from 'vs/editor/common/model/textModel';
import { WordHelper } from 'vs/editor/common/model/textModelWithTokensHelpers';
import { TokenIterator } from 'vs/editor/common/model/tokenIterator';
import { ITokenizationSupport, ILineContext, ILineTokens, IMode, IState, TokenizationRegistry, IRichEditBrackets } from 'vs/editor/common/modes';
import { NULL_MODE_ID, nullTokenize } from 'vs/editor/common/modes/nullMode';
import { ignoreBracketsInToken } from 'vs/editor/common/modes/supports';
import { BracketsUtils } from 'vs/editor/common/modes/supports/richEditBrackets';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { TokensInflatorMap } from 'vs/editor/common/model/tokensBinaryEncoding';
import { Position } from 'vs/editor/common/core/position';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { Token } from 'vs/editor/common/core/token';
import { LineTokens, LineToken } from 'vs/editor/common/core/lineTokens';

class Mode implements IMode {

	private _languageId: string;

	constructor(languageId: string) {
		this._languageId = languageId;
	}

	getId(): string {
		return this._languageId;
	}
}

class ModelTokensChangedEventBuilder {

	private _ranges: { fromLineNumber: number; toLineNumber: number; }[];

	constructor() {
		this._ranges = [];
	}

	public registerChangedTokens(lineNumber: number): void {
		const ranges = this._ranges;
		const rangesLength = ranges.length;
		const previousRange = rangesLength > 0 ? ranges[rangesLength - 1] : null;

		if (previousRange && previousRange.toLineNumber === lineNumber - 1) {
			// extend previous range
			previousRange.toLineNumber++;
		} else {
			// insert new range
			ranges[rangesLength] = {
				fromLineNumber: lineNumber,
				toLineNumber: lineNumber
			};
		}
	}

	public build(): editorCommon.IModelTokensChangedEvent {
		if (this._ranges.length === 0) {
			return null;
		}
		return {
			ranges: this._ranges
		};
	}
}

/**
 * TODO@Alex: remove this wrapper
 */
class LineContext implements ILineContext {

	public modeTransitions: ModeTransition[];
	private _text: string;
	private _lineTokens: LineTokens;

	constructor(topLevelModeId: string, line: ModelLine, map: TokensInflatorMap) {
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

	public getTokenStartOffset(tokenIndex: number): number {
		return this._lineTokens.getTokenStartOffset(tokenIndex);
	}

	public getTokenType(tokenIndex: number): string {
		return this._lineTokens.getTokenType(tokenIndex);
	}

	public findIndexOfOffset(offset: number): number {
		return this._lineTokens.findTokenIndexAtOffset(offset);
	}
}

export class TextModelWithTokens extends TextModel implements editorCommon.ITokenizedModel {

	private static MODE_TOKENIZATION_FAILED_MSG = nls.localize('mode.tokenizationSupportFailed', "The mode has failed while tokenizing the input.");

	private _languageId: string;
	private _tokenizationListener: IDisposable;
	private _tokenizationSupport: ITokenizationSupport;
	private _tokensInflatorMap: TokensInflatorMap;

	private _invalidLineStartIndex: number;
	private _lastState: IState;

	private _revalidateTokensTimeout: number;

	constructor(allowedEventTypes: string[], rawText: editorCommon.IRawText, languageId: string) {
		allowedEventTypes.push(editorCommon.EventType.ModelTokensChanged);
		allowedEventTypes.push(editorCommon.EventType.ModelModeChanged);
		super(allowedEventTypes, rawText);

		this._languageId = languageId || NULL_MODE_ID;
		this._tokenizationListener = TokenizationRegistry.onDidChange((e) => {
			if (e.languageId !== this._languageId) {
				return;
			}

			this._resetTokenizationState();
			this.emitModelTokensChangedEvent({
				ranges: [{
					fromLineNumber: 1,
					toLineNumber: this.getLineCount()
				}]
			});
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

	protected _resetValue(newValue: editorCommon.IRawText): void {
		super._resetValue(newValue);
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
			let initialState: IState = null;
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

	private _withModelTokensChangedEventBuilder<T>(callback: (eventBuilder: ModelTokensChangedEventBuilder) => T): T {
		let eventBuilder = new ModelTokensChangedEventBuilder();

		let result = callback(eventBuilder);

		if (!this._isDisposing) {
			let e = eventBuilder.build();
			if (e) {
				this.emit(editorCommon.EventType.ModelTokensChanged, e);
			}
		}

		return result;
	}

	public getLineTokens(lineNumber: number, inaccurateTokensAcceptable: boolean = false): LineTokens {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		if (!inaccurateTokensAcceptable) {
			this._withModelTokensChangedEventBuilder((eventBuilder) => {
				this._updateTokensUntilLine(eventBuilder, lineNumber, true);
			});
		}
		return this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
	}

	public getLineContext(lineNumber: number): ILineContext {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		this._withModelTokensChangedEventBuilder((eventBuilder) => {
			this._updateTokensUntilLine(eventBuilder, lineNumber, true);
		});

		return new LineContext(this.getModeId(), this._lines[lineNumber - 1], this._tokensInflatorMap);
	}

	public getMode(): IMode {
		return new Mode(this._languageId);
	}

	public getModeId(): string {
		return this.getMode().getId();
	}

	public setMode(languageId: string): void {
		if (this._languageId === languageId) {
			// There's nothing to do
			return;
		}

		let e: editorCommon.IModelModeChangedEvent = {
			oldMode: new Mode(this._languageId),
			newMode: new Mode(languageId)
		};

		this._languageId = languageId;

		// Cancel tokenization, clear all tokens and begin tokenizing
		this._resetTokenizationState();

		this.emitModelTokensChangedEvent({
			ranges: [{
				fromLineNumber: 1,
				toLineNumber: this.getLineCount()
			}]
		});
		this._emitModelModeChangedEvent(e);
	}

	public getModeIdAtPosition(_lineNumber: number, _column: number): string {
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

	protected _invalidateLine(lineIndex: number): void {
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

	private _revalidateTokensNow(toLineNumber: number = this._invalidLineStartIndex + 1000000): void {

		this._withModelTokensChangedEventBuilder((eventBuilder) => {

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

				this._updateTokensUntilLine(eventBuilder, lineNumber, false);
				tokenizedChars += currentCharsToTokenize;
			}

			elapsedTime = sw.elapsed();

			if (this._invalidLineStartIndex < this._lines.length) {
				this._beginBackgroundTokenization();
			}

			t1.stop();
		});
	}

	private getStateBeforeLine(lineNumber: number): IState {
		this._withModelTokensChangedEventBuilder((eventBuilder) => {
			this._updateTokensUntilLine(eventBuilder, lineNumber - 1, true);
		});
		return this._lines[lineNumber - 1].getState();
	}

	private getStateAfterLine(lineNumber: number): IState {
		this._withModelTokensChangedEventBuilder((eventBuilder) => {
			this._updateTokensUntilLine(eventBuilder, lineNumber, true);
		});
		return lineNumber < this._lines.length ? this._lines[lineNumber].getState() : this._lastState;
	}

	_getLineModeTransitions(lineNumber: number): ModeTransition[] {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}
		this._withModelTokensChangedEventBuilder((eventBuilder) => {
			this._updateTokensUntilLine(eventBuilder, lineNumber, true);
		});
		return this._lines[lineNumber - 1].getModeTransitions(this.getModeId());
	}

	private _updateTokensUntilLine(eventBuilder: ModelTokensChangedEventBuilder, lineNumber: number, emitEvents: boolean): void {
		if (!this._tokenizationSupport) {
			this._invalidLineStartIndex = this._lines.length;
			return;
		}

		var linesLength = this._lines.length;
		var endLineIndex = lineNumber - 1;
		var stopLineTokenizationAfter = 1000000000; // 1 billion, if a line is so long, you have other trouble :).

		// Validate all states up to and including endLineIndex
		for (var lineIndex = this._invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			var endStateIndex = lineIndex + 1;
			var r: ILineTokens = null;
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
			eventBuilder.registerChangedTokens(lineIndex + 1);
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
	}

	private emitModelTokensChangedEvent(e: editorCommon.IModelTokensChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelTokensChanged, e);
		}
	}

	private _emitModelModeChangedEvent(e: editorCommon.IModelModeChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelModeChanged, e);
		}
	}

	// Having tokens allows implementing additional helper methods

	_lineIsTokenized(lineNumber: number): boolean {
		return this._invalidLineStartIndex > lineNumber - 1;
	}

	protected _getWordDefinition(): RegExp {
		return WordHelper.massageWordDefinitionOf(this.getModeId());
	}

	public getWordAtPosition(position: editorCommon.IPosition): editorCommon.IWordAtPosition {
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

	public tokenIterator(position: editorCommon.IPosition, callback: (it: TokenIterator) => any): any {
		var iter = new TokenIterator(this, this.validatePosition(position));
		var result = callback(iter);
		iter._invalidate();
		return result;
	}

	public findMatchingBracketUp(_bracket: string, _position: editorCommon.IPosition): Range {
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

	public matchBracket(position: editorCommon.IPosition): [Range, Range] {
		return this._matchBracket(this.validatePosition(position));
	}

	private _matchBracket(position: Position): [Range, Range] {
		const lineNumber = position.lineNumber;
		const lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
		const lineText = this._lines[lineNumber - 1].text;

		const currentToken = lineTokens.findTokenAtOffset(position.column - 1);
		if (!currentToken) {
			return null;
		}
		const currentModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(currentToken.modeId);

		// check that the token is not to be ignored
		if (currentModeBrackets && !ignoreBracketsInToken(currentToken.type)) {
			// limit search to not go before `maxBracketLength`
			let searchStartOffset = Math.max(currentToken.startOffset, position.column - 1 - currentModeBrackets.maxBracketLength);
			// limit search to not go after `maxBracketLength`
			const searchEndOffset = Math.min(currentToken.endOffset, position.column - 1 + currentModeBrackets.maxBracketLength);

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

		return null;
	}

	private _matchFoundBracket(foundBracket: Range, data: editorCommon.IRichEditBracket, isOpen: boolean): [Range, Range] {
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

	private _findMatchingBracketUp(bracket: editorCommon.IRichEditBracket, position: Position): Range {
		// console.log('_findMatchingBracketUp: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		const modeId = bracket.modeId;
		const reversedBracketRegex = bracket.reversedRegex;
		let count = -1;

		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			const lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			const lineText = this._lines[lineNumber - 1].text;

			let currentToken: LineToken;
			let searchStopOffset: number;
			if (lineNumber === position.lineNumber) {
				currentToken = lineTokens.findTokenAtOffset(position.column - 1);
				searchStopOffset = position.column - 1;
			} else {
				currentToken = lineTokens.lastToken();
				if (currentToken) {
					searchStopOffset = currentToken.endOffset;
				}
			}

			while (currentToken) {
				if (currentToken.modeId === modeId && !ignoreBracketsInToken(currentToken.type)) {

					while (true) {
						let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, lineNumber, lineText, currentToken.startOffset, searchStopOffset);
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

				currentToken = currentToken.prev();
				if (currentToken) {
					searchStopOffset = currentToken.endOffset;
				}
			}
		}

		return null;
	}

	private _findMatchingBracketDown(bracket: editorCommon.IRichEditBracket, position: Position): Range {
		// console.log('_findMatchingBracketDown: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		const modeId = bracket.modeId;
		const bracketRegex = bracket.forwardRegex;
		let count = 1;

		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			const lineText = this._lines[lineNumber - 1].text;

			let currentToken: LineToken;
			let searchStartOffset: number;
			if (lineNumber === position.lineNumber) {
				currentToken = lineTokens.findTokenAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
			} else {
				currentToken = lineTokens.firstToken();
				if (currentToken) {
					searchStartOffset = currentToken.startOffset;
				}
			}

			while (currentToken) {
				if (currentToken.modeId === modeId && !ignoreBracketsInToken(currentToken.type)) {
					while (true) {
						let r = BracketsUtils.findNextBracketInToken(bracketRegex, lineNumber, lineText, searchStartOffset, currentToken.endOffset);
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

				currentToken = currentToken.next();
				if (currentToken) {
					searchStartOffset = currentToken.startOffset;
				}
			}
		}

		return null;
	}

	public findPrevBracket(_position: editorCommon.IPosition): editorCommon.IFoundBracket {
		const position = this.validatePosition(_position);

		let modeId: string = null;
		let modeBrackets: IRichEditBrackets;
		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			const lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			const lineText = this._lines[lineNumber - 1].text;

			let currentToken: LineToken;
			let searchStopOffset: number;
			if (lineNumber === position.lineNumber) {
				currentToken = lineTokens.findTokenAtOffset(position.column - 1);
				searchStopOffset = position.column - 1;
			} else {
				currentToken = lineTokens.lastToken();
				if (currentToken) {
					searchStopOffset = currentToken.endOffset;
				}
			}

			while (currentToken) {
				if (modeId !== currentToken.modeId) {
					modeId = currentToken.modeId;
					modeBrackets = LanguageConfigurationRegistry.getBracketsSupport(modeId);
				}
				if (modeBrackets && !ignoreBracketsInToken(currentToken.type)) {
					let r = BracketsUtils.findPrevBracketInToken(modeBrackets.reversedRegex, lineNumber, lineText, currentToken.startOffset, searchStopOffset);
					if (r) {
						return this._toFoundBracket(modeBrackets, r);
					}
				}

				currentToken = currentToken.prev();
				if (currentToken) {
					searchStopOffset = currentToken.endOffset;
				}
			}
		}

		return null;
	}

	public findNextBracket(_position: editorCommon.IPosition): editorCommon.IFoundBracket {
		const position = this.validatePosition(_position);

		let modeId: string = null;
		let modeBrackets: IRichEditBrackets;
		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this._lines[lineNumber - 1].getTokens(this._tokensInflatorMap);
			const lineText = this._lines[lineNumber - 1].text;

			let currentToken: LineToken;
			let searchStartOffset: number;
			if (lineNumber === position.lineNumber) {
				currentToken = lineTokens.findTokenAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
			} else {
				currentToken = lineTokens.firstToken();
				if (currentToken) {
					searchStartOffset = currentToken.startOffset;
				}
			}

			while (currentToken) {
				if (modeId !== currentToken.modeId) {
					modeId = currentToken.modeId;
					modeBrackets = LanguageConfigurationRegistry.getBracketsSupport(modeId);
				}
				if (modeBrackets && !ignoreBracketsInToken(currentToken.type)) {
					let r = BracketsUtils.findNextBracketInToken(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, currentToken.endOffset);
					if (r) {
						return this._toFoundBracket(modeBrackets, r);
					}
				}

				currentToken = currentToken.next();
				if (currentToken) {
					searchStartOffset = currentToken.startOffset;
				}
			}
		}

		return null;
	}

	private _toFoundBracket(modeBrackets: IRichEditBrackets, r: Range): editorCommon.IFoundBracket {
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
}
