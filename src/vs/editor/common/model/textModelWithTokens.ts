/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { TokenIterator } from 'vs/editor/common/model/tokenIterator';
import { ITokenizationSupport, IState, TokenizationRegistry, LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { NULL_LANGUAGE_IDENTIFIER, nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { ignoreBracketsInToken } from 'vs/editor/common/modes/supports';
import { BracketsUtils, RichEditBrackets, RichEditBracket } from 'vs/editor/common/modes/supports/richEditBrackets';
import { Position } from 'vs/editor/common/core/position';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LineTokens, LineToken } from 'vs/editor/common/core/lineTokens';
import { getWordAtText } from 'vs/editor/common/model/wordHelper';
import { TokenizationResult2 } from 'vs/editor/common/core/token';
import { ITextSource, IRawTextSource } from 'vs/editor/common/model/textSource';

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

export class TextModelWithTokens extends TextModel implements editorCommon.ITokenizedModel {

	private static MODE_TOKENIZATION_FAILED_MSG = nls.localize('mode.tokenizationSupportFailed', "The mode has failed while tokenizing the input.");

	private _languageIdentifier: LanguageIdentifier;
	private _tokenizationListener: IDisposable;
	private _tokenizationSupport: ITokenizationSupport;

	private _invalidLineStartIndex: number;
	private _lastState: IState;

	private _revalidateTokensTimeout: number;

	constructor(allowedEventTypes: string[], rawTextSource: IRawTextSource, creationOptions: editorCommon.ITextModelCreationOptions, languageIdentifier: LanguageIdentifier) {
		allowedEventTypes.push(editorCommon.EventType.ModelTokensChanged);
		allowedEventTypes.push(editorCommon.EventType.ModelLanguageChanged);
		super(allowedEventTypes, rawTextSource, creationOptions);

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
		});

		this._revalidateTokensTimeout = -1;

		this._resetTokenizationState();
	}

	public dispose(): void {
		this._tokenizationListener.dispose();
		this._clearTimers();
		this._lastState = null;

		super.dispose();
	}

	protected _shouldAutoTokenize(): boolean {
		return false;
	}

	protected _resetValue(newValue: ITextSource): void {
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
			this._tokenizationSupport = TokenizationRegistry.get(this._languageIdentifier.language);
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

	public forceTokenization(lineNumber: number): void {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		this._withModelTokensChangedEventBuilder((eventBuilder) => {
			this._updateTokensUntilLine(eventBuilder, lineNumber);
		});
	}

	public getLineTokens(lineNumber: number): LineTokens {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		return this._getLineTokens(lineNumber);
	}

	private _getLineTokens(lineNumber: number): LineTokens {
		return this._lines[lineNumber - 1].getTokens(this._languageIdentifier.id);
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

		let e: editorCommon.IModelLanguageChangedEvent = {
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
		this._emitModelModeChangedEvent(e);
	}

	public getLanguageIdAtPosition(_lineNumber: number, _column: number): LanguageId {
		if (!this._tokenizationSupport) {
			return this._languageIdentifier.id;
		}
		let { lineNumber, column } = this.validatePosition({ lineNumber: _lineNumber, column: _column });

		let lineTokens = this._getLineTokens(lineNumber);
		let token = lineTokens.findTokenAtOffset(column - 1);
		return token.languageId;
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

				this._updateTokensUntilLine(eventBuilder, lineNumber);
				tokenizedChars += currentCharsToTokenize;

				// Skip the lines that got tokenized
				lineNumber = Math.max(lineNumber, this._invalidLineStartIndex + 1);
			}

			elapsedTime = sw.elapsed();

			if (this._invalidLineStartIndex < this._lines.length) {
				this._beginBackgroundTokenization();
			}
		});
	}

	private _updateTokensUntilLine(eventBuilder: ModelTokensChangedEventBuilder, lineNumber: number): void {
		if (!this._tokenizationSupport) {
			this._invalidLineStartIndex = this._lines.length;
			return;
		}

		const linesLength = this._lines.length;
		const endLineIndex = lineNumber - 1;

		// Validate all states up to and including endLineIndex
		for (let lineIndex = this._invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			const endStateIndex = lineIndex + 1;
			let r: TokenizationResult2 = null;
			const text = this._lines[lineIndex].text;

			try {
				// Tokenize only the first X characters
				let freshState = this._lines[lineIndex].getState().clone();
				r = this._tokenizationSupport.tokenize2(this._lines[lineIndex].text, freshState, 0);
			} catch (e) {
				e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
				onUnexpectedError(e);
			}

			if (!r) {
				r = nullTokenize2(this._languageIdentifier.id, text, this._lines[lineIndex].getState(), 0);
			}
			this._lines[lineIndex].setTokens(this._languageIdentifier.id, r.tokens);
			eventBuilder.registerChangedTokens(lineIndex + 1);
			this._lines[lineIndex].isInvalid = false;

			if (endStateIndex < linesLength) {
				if (this._lines[endStateIndex].getState() !== null && r.endState.equals(this._lines[endStateIndex].getState())) {
					// The end state of this line remains the same
					let nextInvalidLineIndex = lineIndex + 1;
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

	private _emitModelModeChangedEvent(e: editorCommon.IModelLanguageChangedEvent): void {
		if (!this._isDisposing) {
			this.emit(editorCommon.EventType.ModelLanguageChanged, e);
		}
	}

	// Having tokens allows implementing additional helper methods

	public getWordAtPosition(_position: editorCommon.IPosition): editorCommon.IWordAtPosition {
		this._assertNotDisposed();
		let position = this.validatePosition(_position);
		let lineContent = this.getLineContent(position.lineNumber);

		if (this._invalidLineStartIndex <= position.lineNumber) {
			// this line is not tokenized
			return getWordAtText(
				position.column,
				LanguageConfigurationRegistry.getWordDefinition(this._languageIdentifier.id),
				lineContent,
				0
			);
		}

		let lineTokens = this._getLineTokens(position.lineNumber);
		let offset = position.column - 1;
		let token = lineTokens.findTokenAtOffset(offset);

		let result = getWordAtText(
			position.column,
			LanguageConfigurationRegistry.getWordDefinition(token.languageId),
			lineContent.substring(token.startOffset, token.endOffset),
			token.startOffset
		);

		if (!result && token.hasPrev && token.startOffset === offset) {
			// The position is right at the beginning of `modeIndex`, so try looking at `modeIndex` - 1 too

			let prevToken = token.prev();
			result = getWordAtText(
				position.column,
				LanguageConfigurationRegistry.getWordDefinition(prevToken.languageId),
				lineContent.substring(prevToken.startOffset, prevToken.endOffset),
				prevToken.startOffset
			);
		}

		return result;
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

		let lineTokens = this._getLineTokens(position.lineNumber);
		let token = lineTokens.findTokenAtOffset(position.column - 1);
		let bracketsSupport = LanguageConfigurationRegistry.getBracketsSupport(token.languageId);

		if (!bracketsSupport) {
			return null;
		}

		let data = bracketsSupport.textIsBracket[bracket];

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
		let lineTokens = this._getLineTokens(lineNumber);
		const lineText = this._lines[lineNumber - 1].text;

		const currentToken = lineTokens.findTokenAtOffset(position.column - 1);
		if (!currentToken) {
			return null;
		}
		const currentModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(currentToken.languageId);

		// check that the token is not to be ignored
		if (currentModeBrackets && !ignoreBracketsInToken(currentToken.tokenType)) {
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
			const prevModeBrackets = LanguageConfigurationRegistry.getBracketsSupport(prevToken.languageId);

			// check that previous token is not to be ignored
			if (prevModeBrackets && !ignoreBracketsInToken(prevToken.tokenType)) {
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
				if (currentToken.languageId === languageId && !ignoreBracketsInToken(currentToken.tokenType)) {

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

	private _findMatchingBracketDown(bracket: RichEditBracket, position: Position): Range {
		// console.log('_findMatchingBracketDown: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		const languageId = bracket.languageIdentifier.id;
		const bracketRegex = bracket.forwardRegex;
		let count = 1;

		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this._getLineTokens(lineNumber);
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
				if (currentToken.languageId === languageId && !ignoreBracketsInToken(currentToken.tokenType)) {
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

		let languageId: LanguageId = -1;
		let modeBrackets: RichEditBrackets = null;
		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			const lineTokens = this._getLineTokens(lineNumber);
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
				if (languageId !== currentToken.languageId) {
					languageId = currentToken.languageId;
					modeBrackets = LanguageConfigurationRegistry.getBracketsSupport(languageId);
				}
				if (modeBrackets && !ignoreBracketsInToken(currentToken.tokenType)) {
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

		let languageId: LanguageId = -1;
		let modeBrackets: RichEditBrackets = null;
		for (let lineNumber = position.lineNumber, lineCount = this.getLineCount(); lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this._getLineTokens(lineNumber);
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
				if (languageId !== currentToken.languageId) {
					languageId = currentToken.languageId;
					modeBrackets = LanguageConfigurationRegistry.getBracketsSupport(languageId);
				}
				if (modeBrackets && !ignoreBracketsInToken(currentToken.tokenType)) {
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

	private _toFoundBracket(modeBrackets: RichEditBrackets, r: Range): editorCommon.IFoundBracket {
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
