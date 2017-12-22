/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IDisposable } from 'vs/base/common/lifecycle';
import { StopWatch } from 'vs/base/common/stopwatch';
import Event, { Emitter } from 'vs/base/common/event';
import { Range } from 'vs/editor/common/core/range';
import * as editorCommon from 'vs/editor/common/editorCommon';
import { TextModel } from 'vs/editor/common/model/textModel';
import { ITokenizationSupport, IState, TokenizationRegistry, LanguageId, LanguageIdentifier } from 'vs/editor/common/modes';
import { NULL_LANGUAGE_IDENTIFIER, nullTokenize2 } from 'vs/editor/common/modes/nullMode';
import { ignoreBracketsInToken } from 'vs/editor/common/modes/supports';
import { BracketsUtils, RichEditBrackets, RichEditBracket } from 'vs/editor/common/modes/supports/richEditBrackets';
import { Position, IPosition } from 'vs/editor/common/core/position';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { getWordAtText } from 'vs/editor/common/model/wordHelper';
import { TokenizationResult2 } from 'vs/editor/common/core/token';
import { ITextSource, IRawTextSource } from 'vs/editor/common/model/textSource';
import { IModelTokensChangedEvent, IModelLanguageChangedEvent, IModelLanguageConfigurationChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { ModelLinesTokens, computeIndentLevel } from 'vs/editor/common/model/modelLine';

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

	public build(): IModelTokensChangedEvent {
		if (this._ranges.length === 0) {
			return null;
		}
		return {
			ranges: this._ranges
		};
	}
}

export class TextModelWithTokens extends TextModel implements editorCommon.ITokenizedModel {

	private static readonly MODE_TOKENIZATION_FAILED_MSG = nls.localize('mode.tokenizationSupportFailed', "The mode has failed while tokenizing the input.");

	private readonly _onDidChangeLanguage: Emitter<IModelLanguageChangedEvent> = this._register(new Emitter<IModelLanguageChangedEvent>());
	public readonly onDidChangeLanguage: Event<IModelLanguageChangedEvent> = this._onDidChangeLanguage.event;

	private readonly _onDidChangeLanguageConfiguration: Emitter<IModelLanguageConfigurationChangedEvent> = this._register(new Emitter<IModelLanguageConfigurationChangedEvent>());
	public readonly onDidChangeLanguageConfiguration: Event<IModelLanguageConfigurationChangedEvent> = this._onDidChangeLanguageConfiguration.event;

	private readonly _onDidChangeTokens: Emitter<IModelTokensChangedEvent> = this._register(new Emitter<IModelTokensChangedEvent>());
	public readonly onDidChangeTokens: Event<IModelTokensChangedEvent> = this._onDidChangeTokens.event;

	private _languageIdentifier: LanguageIdentifier;
	private _tokenizationListener: IDisposable;
	private _tokenizationSupport: ITokenizationSupport;

	private _invalidLineStartIndex: number;
	private _lastState: IState;

	private _languageRegistryListener: IDisposable;

	private _revalidateTokensTimeout: number;
	/*protected*/_tokens: ModelLinesTokens;

	constructor(rawTextSource: IRawTextSource, creationOptions: editorCommon.ITextModelCreationOptions, languageIdentifier: LanguageIdentifier) {
		super(rawTextSource, creationOptions);

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
	}

	public dispose(): void {
		this._tokenizationListener.dispose();
		this._languageRegistryListener.dispose();
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
		this._tokens = new ModelLinesTokens();

		this._tokenizationSupport = null;
		if (!this._isTooLargeForTokenization) {
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
				this._tokens.setInitialState(initialState);
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

	public forceTokenization(lineNumber: number): void {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
		}

		const eventBuilder = new ModelTokensChangedEventBuilder();

		this._updateTokensUntilLine(eventBuilder, lineNumber);

		const e = eventBuilder.build();
		if (e) {
			this._onDidChangeTokens.fire(e);
		}
	}

	public isCheapToTokenize(lineNumber: number): boolean {
		const firstInvalidLineNumber = this._invalidLineStartIndex + 1;
		return (firstInvalidLineNumber >= lineNumber);
	}

	public tokenizeIfCheap(lineNumber: number): void {
		if (this.isCheapToTokenize(lineNumber)) {
			this.forceTokenization(lineNumber);
		}
	}

	public getLineTokens(lineNumber: number): LineTokens {
		if (lineNumber < 1 || lineNumber > this.getLineCount()) {
			throw new Error('Illegal value ' + lineNumber + ' for `lineNumber`');
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
		if (!this._tokenizationSupport) {
			return this._languageIdentifier.id;
		}
		let { lineNumber, column } = this.validatePosition({ lineNumber: _lineNumber, column: _column });

		let lineTokens = this._getLineTokens(lineNumber);
		return lineTokens.getLanguageId(lineTokens.findTokenIndexAtOffset(column - 1));
	}

	protected _invalidateLine(lineIndex: number): void {
		this._tokens.setIsInvalid(lineIndex, true);
		if (lineIndex < this._invalidLineStartIndex) {
			if (this._invalidLineStartIndex < this._buffer.getLineCount()) {
				this._tokens.setIsInvalid(this._invalidLineStartIndex, true);
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
		this._revalidateTokensNow(maxLineNumber);

		if (this._invalidLineStartIndex < this._buffer.getLineCount()) {
			this._beginBackgroundTokenization();
		}
	}

	private _revalidateTokensNow(toLineNumber: number = this._invalidLineStartIndex + 1000000): void {

		const eventBuilder = new ModelTokensChangedEventBuilder();

		toLineNumber = Math.min(this._buffer.getLineCount(), toLineNumber);

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
			currentCharsToTokenize = this._buffer.getLineLength(lineNumber);

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

		if (this._invalidLineStartIndex < this._buffer.getLineCount()) {
			this._beginBackgroundTokenization();
		}

		const e = eventBuilder.build();
		if (e) {
			this._onDidChangeTokens.fire(e);
		}
	}

	private _updateTokensUntilLine(eventBuilder: ModelTokensChangedEventBuilder, lineNumber: number): void {
		if (!this._tokenizationSupport) {
			this._invalidLineStartIndex = this._buffer.getLineCount();
			return;
		}

		const linesLength = this._buffer.getLineCount();
		const endLineIndex = lineNumber - 1;

		// Validate all states up to and including endLineIndex
		for (let lineIndex = this._invalidLineStartIndex; lineIndex <= endLineIndex; lineIndex++) {
			const endStateIndex = lineIndex + 1;
			let r: TokenizationResult2 = null;
			const text = this._buffer.getLineContent(lineIndex + 1);

			try {
				// Tokenize only the first X characters
				let freshState = this._tokens.getState(lineIndex).clone();
				r = this._tokenizationSupport.tokenize2(text, freshState, 0);
			} catch (e) {
				e.friendlyMessage = TextModelWithTokens.MODE_TOKENIZATION_FAILED_MSG;
				onUnexpectedError(e);
			}

			if (!r) {
				r = nullTokenize2(this._languageIdentifier.id, text, this._tokens.getState(lineIndex), 0);
			}
			this._tokens.setTokens(this._languageIdentifier.id, lineIndex, text.length, r.tokens);
			eventBuilder.registerChangedTokens(lineIndex + 1);
			this._tokens.setIsInvalid(lineIndex, false);

			if (endStateIndex < linesLength) {
				if (this._tokens.getState(endStateIndex) !== null && r.endState.equals(this._tokens.getState(endStateIndex))) {
					// The end state of this line remains the same
					let nextInvalidLineIndex = lineIndex + 1;
					while (nextInvalidLineIndex < linesLength) {
						if (this._tokens.isInvalid(nextInvalidLineIndex)) {
							break;
						}
						if (nextInvalidLineIndex + 1 < linesLength) {
							if (this._tokens.getState(nextInvalidLineIndex + 1) === null) {
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
					this._tokens.setState(endStateIndex, r.endState);
				}
			} else {
				this._lastState = r.endState;
			}
		}
		this._invalidLineStartIndex = Math.max(this._invalidLineStartIndex, endLineIndex + 1);
	}

	private emitModelTokensChangedEvent(e: IModelTokensChangedEvent): void {
		if (!this._isDisposing) {
			this._onDidChangeTokens.fire(e);
		}
	}

	// Having tokens allows implementing additional helper methods

	public getWordAtPosition(_position: IPosition): editorCommon.IWordAtPosition {
		this._assertNotDisposed();
		const position = this.validatePosition(_position);
		const lineContent = this.getLineContent(position.lineNumber);

		if (this._invalidLineStartIndex <= position.lineNumber - 1) {
			// this line is not tokenized
			return getWordAtText(
				position.column,
				LanguageConfigurationRegistry.getWordDefinition(this._languageIdentifier.id),
				lineContent,
				0
			);
		}

		const lineTokens = this._getLineTokens(position.lineNumber);
		const offset = position.column - 1;
		const tokenIndex = lineTokens.findTokenIndexAtOffset(offset);
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

		return getWordAtText(
			position.column,
			LanguageConfigurationRegistry.getWordDefinition(languageId),
			lineContent.substring(startOffset, endOffset),
			startOffset
		);
	}

	public getWordUntilPosition(position: IPosition): editorCommon.IWordAtPosition {
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

	public findPrevBracket(_position: IPosition): editorCommon.IFoundBracket {
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

	public findNextBracket(_position: IPosition): editorCommon.IFoundBracket {
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

	private _computeIndentLevel(lineIndex: number): number {
		return computeIndentLevel(this._buffer.getLineContent(lineIndex + 1), this._options.tabSize);
	}

	public getLinesIndentGuides(startLineNumber: number, endLineNumber: number): number[] {
		this._assertNotDisposed();
		const lineCount = this.getLineCount();

		if (startLineNumber < 1 || startLineNumber > lineCount) {
			throw new Error('Illegal value ' + startLineNumber + ' for `startLineNumber`');
		}
		if (endLineNumber < 1 || endLineNumber > lineCount) {
			throw new Error('Illegal value ' + endLineNumber + ' for `endLineNumber`');
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
}
