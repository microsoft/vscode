/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { Disposable, DisposableStore, IDisposable, IReference, MutableDisposable } from 'vs/base/common/lifecycle';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { IPosition, Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { BracketPairsTree } from 'vs/editor/common/model/bracketPairs/bracketPairsTree/bracketPairsTree';
import { BracketInfo, BracketPairInfo, BracketPairWithMinIndentationInfo, IBracketPairs, IFoundBracket } from 'vs/editor/common/model/bracketPairs/bracketPairs';
import { TextModel } from 'vs/editor/common/model/textModel';
import { IModelContentChangedEvent } from 'vs/editor/common/model/textModelEvents';
import { ILanguageConfigurationService } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ignoreBracketsInToken } from 'vs/editor/common/modes/supports';
import { RichEditBrackets, BracketsUtils, RichEditBracket } from 'vs/editor/common/modes/supports/richEditBrackets';

export class BracketPairs extends Disposable implements IBracketPairs {
	private readonly bracketPairsTree = this._register(new MutableDisposable<IReference<BracketPairsTree>>());

	private readonly onDidChangeEmitter = new Emitter<void>();
	public readonly onDidChange = this.onDidChangeEmitter.event;

	private get isDocumentSupported() {
		const maxSupportedDocumentLength = /* max lines */ 50_000 * /* average column count */ 100;
		return this.textModel.getValueLength() <= maxSupportedDocumentLength;
	}

	private bracketsRequested = false;

	public constructor(
		private readonly textModel: TextModel,
		private readonly languageConfigurationService: ILanguageConfigurationService
	) {
		super();

		this._register(textModel.onDidChangeOptions(e => {
			this.bracketPairsTree.clear();
			this.updateBracketPairsTree();
		}));

		this._register(textModel.onDidChangeLanguage(e => {
			this.bracketPairsTree.clear();
			this.updateBracketPairsTree();
		}));

		this._register(
			this.languageConfigurationService.onDidChange(e => {
				if (!e.languageId || this.bracketPairsTree.value?.object.didLanguageChange(e.languageId)) {
					this.bracketPairsTree.clear();
					this.updateBracketPairsTree();
				}
			})
		);
	}

	private updateBracketPairsTree() {
		if (this.bracketsRequested && this.isDocumentSupported) {
			if (!this.bracketPairsTree.value) {
				const store = new DisposableStore();

				this.bracketPairsTree.value = createDisposableRef(
					store.add(
						new BracketPairsTree(this.textModel, (languageId) => {
							return this.languageConfigurationService.getLanguageConfiguration(languageId);
						})
					),
					store
				);
				store.add(this.bracketPairsTree.value.object.onDidChange(e => this.onDidChangeEmitter.fire(e)));
				this.onDidChangeEmitter.fire();
			}
		} else {
			if (this.bracketPairsTree.value) {
				this.bracketPairsTree.clear();
				// Important: Don't call fire if there was no change!
				this.onDidChangeEmitter.fire();
			}
		}
	}

	public handleContentChanged(change: IModelContentChangedEvent) {
		this.bracketPairsTree.value?.object.handleContentChanged(change);
	}

	/**
	 * Returns all bracket pairs that intersect the given range.
	 * The result is sorted by the start position.
	*/
	public getBracketPairsInRange(range: Range): BracketPairInfo[] {
		this.bracketsRequested = true;
		this.updateBracketPairsTree();
		return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, false) || [];
	}

	public getBracketPairsInRangeWithMinIndentation(range: Range): BracketPairWithMinIndentationInfo[] {
		this.bracketsRequested = true;
		this.updateBracketPairsTree();
		return this.bracketPairsTree.value?.object.getBracketPairsInRange(range, true) || [];
	}

	public getBracketsInRange(range: Range): BracketInfo[] {
		this.bracketsRequested = true;
		this.updateBracketPairsTree();
		return this.bracketPairsTree.value?.object.getBracketsInRange(range) || [];
	}

	public findMatchingBracketUp(_bracket: string, _position: IPosition): Range | null {
		let bracket = _bracket.toLowerCase();
		let position = this.textModel.validatePosition(_position);

		const languageId = this.textModel.getLanguageIdAtPosition(position.lineNumber, position.column);
		let bracketsSupport = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;

		if (!bracketsSupport) {
			return null;
		}

		let data = bracketsSupport.textIsBracket[bracket];

		if (!data) {
			return null;
		}

		return stripBracketSearchCanceled(this._findMatchingBracketUp(data, position, null));
	}

	public matchBracket(position: IPosition): [Range, Range] | null {
		return this._matchBracket(this.textModel.validatePosition(position));
	}

	private _establishBracketSearchOffsets(position: Position, lineTokens: LineTokens, modeBrackets: RichEditBrackets, tokenIndex: number) {
		const tokenCount = lineTokens.getCount();
		const currentLanguageId = lineTokens.getLanguageId(tokenIndex);

		// limit search to not go before `maxBracketLength`
		let searchStartOffset = Math.max(0, position.column - 1 - modeBrackets.maxBracketLength);
		for (let i = tokenIndex - 1; i >= 0; i--) {
			const tokenEndOffset = lineTokens.getEndOffset(i);
			if (tokenEndOffset <= searchStartOffset) {
				break;
			}
			if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
				searchStartOffset = tokenEndOffset;
				break;
			}
		}

		// limit search to not go after `maxBracketLength`
		let searchEndOffset = Math.min(lineTokens.getLineContent().length, position.column - 1 + modeBrackets.maxBracketLength);
		for (let i = tokenIndex + 1; i < tokenCount; i++) {
			const tokenStartOffset = lineTokens.getStartOffset(i);
			if (tokenStartOffset >= searchEndOffset) {
				break;
			}
			if (ignoreBracketsInToken(lineTokens.getStandardTokenType(i)) || lineTokens.getLanguageId(i) !== currentLanguageId) {
				searchEndOffset = tokenStartOffset;
				break;
			}
		}

		return { searchStartOffset, searchEndOffset };
	}

	private _matchBracket(position: Position): [Range, Range] | null {
		const lineNumber = position.lineNumber;
		const lineTokens = this.textModel.getLineTokens(lineNumber);
		const lineText = this.textModel.getLineContent(lineNumber);

		const tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
		if (tokenIndex < 0) {
			return null;
		}
		const currentModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(tokenIndex)).brackets;

		// check that the token is not to be ignored
		if (currentModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex))) {

			let { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, currentModeBrackets, tokenIndex);

			// it might be the case that [currentTokenStart -> currentTokenEnd] contains multiple brackets
			// `bestResult` will contain the most right-side result
			let bestResult: [Range, Range] | null = null;
			while (true) {
				const foundBracket = BracketsUtils.findNextBracketInRange(currentModeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (!foundBracket) {
					// there are no more brackets in this text
					break;
				}

				// check that we didn't hit a bracket too far away from position
				if (foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
					const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
					const r = this._matchFoundBracket(foundBracket, currentModeBrackets.textIsBracket[foundBracketText], currentModeBrackets.textIsOpenBracket[foundBracketText], null);
					if (r) {
						if (r instanceof BracketSearchCanceled) {
							return null;
						}
						bestResult = r;
					}
				}

				searchStartOffset = foundBracket.endColumn - 1;
			}

			if (bestResult) {
				return bestResult;
			}
		}

		// If position is in between two tokens, try also looking in the previous token
		if (tokenIndex > 0 && lineTokens.getStartOffset(tokenIndex) === position.column - 1) {
			const prevTokenIndex = tokenIndex - 1;
			const prevModeBrackets = this.languageConfigurationService.getLanguageConfiguration(lineTokens.getLanguageId(prevTokenIndex)).brackets;

			// check that previous token is not to be ignored
			if (prevModeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(prevTokenIndex))) {

				let { searchStartOffset, searchEndOffset } = this._establishBracketSearchOffsets(position, lineTokens, prevModeBrackets, prevTokenIndex);

				const foundBracket = BracketsUtils.findPrevBracketInRange(prevModeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);

				// check that we didn't hit a bracket too far away from position
				if (foundBracket && foundBracket.startColumn <= position.column && position.column <= foundBracket.endColumn) {
					const foundBracketText = lineText.substring(foundBracket.startColumn - 1, foundBracket.endColumn - 1).toLowerCase();
					const r = this._matchFoundBracket(foundBracket, prevModeBrackets.textIsBracket[foundBracketText], prevModeBrackets.textIsOpenBracket[foundBracketText], null);
					if (r) {
						if (r instanceof BracketSearchCanceled) {
							return null;
						}
						return r;
					}
				}
			}
		}

		return null;
	}

	private _matchFoundBracket(foundBracket: Range, data: RichEditBracket, isOpen: boolean, continueSearchPredicate: ContinueBracketSearchPredicate): [Range, Range] | null | BracketSearchCanceled {
		if (!data) {
			return null;
		}

		const matched = (
			isOpen
				? this._findMatchingBracketDown(data, foundBracket.getEndPosition(), continueSearchPredicate)
				: this._findMatchingBracketUp(data, foundBracket.getStartPosition(), continueSearchPredicate)
		);

		if (!matched) {
			return null;
		}

		if (matched instanceof BracketSearchCanceled) {
			return matched;
		}

		return [foundBracket, matched];
	}

	private _findMatchingBracketUp(bracket: RichEditBracket, position: Position, continueSearchPredicate: ContinueBracketSearchPredicate): Range | null | BracketSearchCanceled {
		// console.log('_findMatchingBracketUp: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		const languageId = bracket.languageId;
		const reversedBracketRegex = bracket.reversedRegex;
		let count = -1;

		let totalCallCount = 0;
		const searchPrevMatchingBracketInRange = (lineNumber: number, lineText: string, searchStartOffset: number, searchEndOffset: number): Range | null | BracketSearchCanceled => {
			while (true) {
				if (continueSearchPredicate && (++totalCallCount) % 100 === 0 && !continueSearchPredicate()) {
					return BracketSearchCanceled.INSTANCE;
				}
				const r = BracketsUtils.findPrevBracketInRange(reversedBracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (!r) {
					break;
				}

				const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
				if (bracket.isOpen(hitText)) {
					count++;
				} else if (bracket.isClose(hitText)) {
					count--;
				}

				if (count === 0) {
					return r;
				}

				searchEndOffset = r.startColumn - 1;
			}

			return null;
		};

		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			const lineTokens = this.textModel.getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this.textModel.getLineContent(lineNumber);

			let tokenIndex = tokenCount - 1;
			let searchStartOffset = lineText.length;
			let searchEndOffset = lineText.length;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
				searchEndOffset = position.column - 1;
			}

			let prevSearchInToken = true;
			for (; tokenIndex >= 0; tokenIndex--) {
				const searchInToken = (lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));

				if (searchInToken) {
					// this token should be searched
					if (prevSearchInToken) {
						// the previous token should be searched, simply extend searchStartOffset
						searchStartOffset = lineTokens.getStartOffset(tokenIndex);
					} else {
						// the previous token should not be searched
						searchStartOffset = lineTokens.getStartOffset(tokenIndex);
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					}
				} else {
					// this token should not be searched
					if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return r;
						}
					}
				}

				prevSearchInToken = searchInToken;
			}

			if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
				const r = searchPrevMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (r) {
					return r;
				}
			}
		}

		return null;
	}

	private _findMatchingBracketDown(bracket: RichEditBracket, position: Position, continueSearchPredicate: ContinueBracketSearchPredicate): Range | null | BracketSearchCanceled {
		// console.log('_findMatchingBracketDown: ', 'bracket: ', JSON.stringify(bracket), 'startPosition: ', String(position));

		const languageId = bracket.languageId;
		const bracketRegex = bracket.forwardRegex;
		let count = 1;

		let totalCallCount = 0;
		const searchNextMatchingBracketInRange = (lineNumber: number, lineText: string, searchStartOffset: number, searchEndOffset: number): Range | null | BracketSearchCanceled => {
			while (true) {
				if (continueSearchPredicate && (++totalCallCount) % 100 === 0 && !continueSearchPredicate()) {
					return BracketSearchCanceled.INSTANCE;
				}
				const r = BracketsUtils.findNextBracketInRange(bracketRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (!r) {
					break;
				}

				const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
				if (bracket.isOpen(hitText)) {
					count++;
				} else if (bracket.isClose(hitText)) {
					count--;
				}

				if (count === 0) {
					return r;
				}

				searchStartOffset = r.endColumn - 1;
			}

			return null;
		};

		const lineCount = this.textModel.getLineCount();
		for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this.textModel.getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this.textModel.getLineContent(lineNumber);

			let tokenIndex = 0;
			let searchStartOffset = 0;
			let searchEndOffset = 0;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
				searchEndOffset = position.column - 1;
			}

			let prevSearchInToken = true;
			for (; tokenIndex < tokenCount; tokenIndex++) {
				const searchInToken = (lineTokens.getLanguageId(tokenIndex) === languageId && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));

				if (searchInToken) {
					// this token should be searched
					if (prevSearchInToken) {
						// the previous token should be searched, simply extend searchEndOffset
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					} else {
						// the previous token should not be searched
						searchStartOffset = lineTokens.getStartOffset(tokenIndex);
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					}
				} else {
					// this token should not be searched
					if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return r;
						}
					}
				}

				prevSearchInToken = searchInToken;
			}

			if (prevSearchInToken && searchStartOffset !== searchEndOffset) {
				const r = searchNextMatchingBracketInRange(lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (r) {
					return r;
				}
			}
		}

		return null;
	}

	public findPrevBracket(_position: IPosition): IFoundBracket | null {
		const position = this.textModel.validatePosition(_position);

		let languageId: string | null = null;
		let modeBrackets: RichEditBrackets | null = null;
		for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
			const lineTokens = this.textModel.getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this.textModel.getLineContent(lineNumber);

			let tokenIndex = tokenCount - 1;
			let searchStartOffset = lineText.length;
			let searchEndOffset = lineText.length;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
				searchEndOffset = position.column - 1;
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
				if (languageId !== tokenLanguageId) {
					languageId = tokenLanguageId;
					modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
				}
			}

			let prevSearchInToken = true;
			for (; tokenIndex >= 0; tokenIndex--) {
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);

				if (languageId !== tokenLanguageId) {
					// language id change!
					if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return this._toFoundBracket(modeBrackets, r);
						}
						prevSearchInToken = false;
					}
					languageId = tokenLanguageId;
					modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
				}

				const searchInToken = (!!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));

				if (searchInToken) {
					// this token should be searched
					if (prevSearchInToken) {
						// the previous token should be searched, simply extend searchStartOffset
						searchStartOffset = lineTokens.getStartOffset(tokenIndex);
					} else {
						// the previous token should not be searched
						searchStartOffset = lineTokens.getStartOffset(tokenIndex);
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					}
				} else {
					// this token should not be searched
					if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return this._toFoundBracket(modeBrackets, r);
						}
					}
				}

				prevSearchInToken = searchInToken;
			}

			if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
				const r = BracketsUtils.findPrevBracketInRange(modeBrackets.reversedRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (r) {
					return this._toFoundBracket(modeBrackets, r);
				}
			}
		}

		return null;
	}

	public findNextBracket(_position: IPosition): IFoundBracket | null {
		const position = this.textModel.validatePosition(_position);
		const lineCount = this.textModel.getLineCount();

		let languageId: string | null = null;
		let modeBrackets: RichEditBrackets | null = null;
		for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this.textModel.getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this.textModel.getLineContent(lineNumber);

			let tokenIndex = 0;
			let searchStartOffset = 0;
			let searchEndOffset = 0;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
				searchEndOffset = position.column - 1;
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
				if (languageId !== tokenLanguageId) {
					languageId = tokenLanguageId;
					modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
				}
			}

			let prevSearchInToken = true;
			for (; tokenIndex < tokenCount; tokenIndex++) {
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);

				if (languageId !== tokenLanguageId) {
					// language id change!
					if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return this._toFoundBracket(modeBrackets, r);
						}
						prevSearchInToken = false;
					}
					languageId = tokenLanguageId;
					modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
				}

				const searchInToken = (!!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));
				if (searchInToken) {
					// this token should be searched
					if (prevSearchInToken) {
						// the previous token should be searched, simply extend searchEndOffset
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					} else {
						// the previous token should not be searched
						searchStartOffset = lineTokens.getStartOffset(tokenIndex);
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					}
				} else {
					// this token should not be searched
					if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return this._toFoundBracket(modeBrackets, r);
						}
					}
				}

				prevSearchInToken = searchInToken;
			}

			if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
				const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (r) {
					return this._toFoundBracket(modeBrackets, r);
				}
			}
		}

		return null;
	}

	public findEnclosingBrackets(_position: IPosition, maxDuration?: number): [Range, Range] | null {
		let continueSearchPredicate: ContinueBracketSearchPredicate;
		if (typeof maxDuration === 'undefined') {
			continueSearchPredicate = null;
		} else {
			const startTime = Date.now();
			continueSearchPredicate = () => {
				return (Date.now() - startTime <= maxDuration);
			};
		}
		const position = this.textModel.validatePosition(_position);
		const lineCount = this.textModel.getLineCount();
		const savedCounts = new Map<string, number[]>();

		let counts: number[] = [];
		const resetCounts = (languageId: string, modeBrackets: RichEditBrackets | null) => {
			if (!savedCounts.has(languageId)) {
				let tmp = [];
				for (let i = 0, len = modeBrackets ? modeBrackets.brackets.length : 0; i < len; i++) {
					tmp[i] = 0;
				}
				savedCounts.set(languageId, tmp);
			}
			counts = savedCounts.get(languageId)!;
		};

		let totalCallCount = 0;
		const searchInRange = (modeBrackets: RichEditBrackets, lineNumber: number, lineText: string, searchStartOffset: number, searchEndOffset: number): [Range, Range] | null | BracketSearchCanceled => {
			while (true) {
				if (continueSearchPredicate && (++totalCallCount) % 100 === 0 && !continueSearchPredicate()) {
					return BracketSearchCanceled.INSTANCE;
				}
				const r = BracketsUtils.findNextBracketInRange(modeBrackets.forwardRegex, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (!r) {
					break;
				}

				const hitText = lineText.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();
				const bracket = modeBrackets.textIsBracket[hitText];
				if (bracket) {
					if (bracket.isOpen(hitText)) {
						counts[bracket.index]++;
					} else if (bracket.isClose(hitText)) {
						counts[bracket.index]--;
					}

					if (counts[bracket.index] === -1) {
						return this._matchFoundBracket(r, bracket, false, continueSearchPredicate);
					}
				}

				searchStartOffset = r.endColumn - 1;
			}
			return null;
		};

		let languageId: string | null = null;
		let modeBrackets: RichEditBrackets | null = null;
		for (let lineNumber = position.lineNumber; lineNumber <= lineCount; lineNumber++) {
			const lineTokens = this.textModel.getLineTokens(lineNumber);
			const tokenCount = lineTokens.getCount();
			const lineText = this.textModel.getLineContent(lineNumber);

			let tokenIndex = 0;
			let searchStartOffset = 0;
			let searchEndOffset = 0;
			if (lineNumber === position.lineNumber) {
				tokenIndex = lineTokens.findTokenIndexAtOffset(position.column - 1);
				searchStartOffset = position.column - 1;
				searchEndOffset = position.column - 1;
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);
				if (languageId !== tokenLanguageId) {
					languageId = tokenLanguageId;
					modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
					resetCounts(languageId, modeBrackets);
				}
			}

			let prevSearchInToken = true;
			for (; tokenIndex < tokenCount; tokenIndex++) {
				const tokenLanguageId = lineTokens.getLanguageId(tokenIndex);

				if (languageId !== tokenLanguageId) {
					// language id change!
					if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return stripBracketSearchCanceled(r);
						}
						prevSearchInToken = false;
					}
					languageId = tokenLanguageId;
					modeBrackets = this.languageConfigurationService.getLanguageConfiguration(languageId).brackets;
					resetCounts(languageId, modeBrackets);
				}

				const searchInToken = (!!modeBrackets && !ignoreBracketsInToken(lineTokens.getStandardTokenType(tokenIndex)));
				if (searchInToken) {
					// this token should be searched
					if (prevSearchInToken) {
						// the previous token should be searched, simply extend searchEndOffset
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					} else {
						// the previous token should not be searched
						searchStartOffset = lineTokens.getStartOffset(tokenIndex);
						searchEndOffset = lineTokens.getEndOffset(tokenIndex);
					}
				} else {
					// this token should not be searched
					if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
						const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
						if (r) {
							return stripBracketSearchCanceled(r);
						}
					}
				}

				prevSearchInToken = searchInToken;
			}

			if (modeBrackets && prevSearchInToken && searchStartOffset !== searchEndOffset) {
				const r = searchInRange(modeBrackets, lineNumber, lineText, searchStartOffset, searchEndOffset);
				if (r) {
					return stripBracketSearchCanceled(r);
				}
			}
		}

		return null;
	}

	private _toFoundBracket(modeBrackets: RichEditBrackets, r: Range): IFoundBracket | null {
		if (!r) {
			return null;
		}

		let text = this.textModel.getValueInRange(r);
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

function createDisposableRef<T>(object: T, disposable?: IDisposable): IReference<T> {
	return {
		object,
		dispose: () => disposable?.dispose(),
	};
}

type ContinueBracketSearchPredicate = null | (() => boolean);

class BracketSearchCanceled {
	public static INSTANCE = new BracketSearchCanceled();
	_searchCanceledBrand = undefined;
	private constructor() { }
}

function stripBracketSearchCanceled<T>(result: T | null | BracketSearchCanceled): T | null {
	if (result instanceof BracketSearchCanceled) {
		return null;
	}
	return result;
}
