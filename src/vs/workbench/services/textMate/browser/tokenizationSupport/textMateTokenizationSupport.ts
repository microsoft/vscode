/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../../base/common/stopwatch.js';
import { LanguageId, TokenMetadata } from '../../../../../editor/common/encodedTokenAttributes.js';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, IState, ITokenizationSupport, TokenizationResult } from '../../../../../editor/common/languages.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import type { IGrammar, StateStack } from 'vscode-textmate';

export class TextMateTokenizationSupport extends Disposable implements ITokenizationSupport {
	private readonly _seenLanguages: boolean[] = [];
	private readonly _onDidEncounterLanguage: Emitter<LanguageId> = this._register(new Emitter<LanguageId>());
	public get onDidEncounterLanguage(): Event<LanguageId> { return this._onDidEncounterLanguage.event; }

	constructor(
		private readonly _grammar: IGrammar,
		private readonly _initialState: StateStack,
		private readonly _containsEmbeddedLanguages: boolean,
		private readonly _createBackgroundTokenizer: ((textModel: ITextModel, tokenStore: IBackgroundTokenizationStore) => IBackgroundTokenizer | undefined) | undefined,
		private readonly _backgroundTokenizerShouldOnlyVerifyTokens: () => boolean,
		private readonly _reportTokenizationTime: (timeMs: number, lineLength: number, isRandomSample: boolean) => void,
		private readonly _reportSlowTokenization: boolean,
	) {
		super();
	}

	public get backgroundTokenizerShouldOnlyVerifyTokens(): boolean | undefined {
		return this._backgroundTokenizerShouldOnlyVerifyTokens();
	}

	public getInitialState(): IState {
		return this._initialState;
	}

	public tokenize(line: string, hasEOL: boolean, state: IState): TokenizationResult {
		throw new Error('Not supported!');
	}

	public createBackgroundTokenizer(textModel: ITextModel, store: IBackgroundTokenizationStore): IBackgroundTokenizer | undefined {
		if (this._createBackgroundTokenizer) {
			return this._createBackgroundTokenizer(textModel, store);
		}
		return undefined;
	}

	public tokenizeEncoded(line: string, hasEOL: boolean, state: StateStack): EncodedTokenizationResult {
		const isRandomSample = Math.random() * 10_000 < 1;
		const shouldMeasure = this._reportSlowTokenization || isRandomSample;
		const sw = shouldMeasure ? new StopWatch(true) : undefined;
		const textMateResult = this._grammar.tokenizeLine2(line, state, 500);
		if (shouldMeasure) {
			const timeMS = sw!.elapsed();
			if (isRandomSample || timeMS > 32) {
				this._reportTokenizationTime(timeMS, line.length, isRandomSample);
			}
		}

		if (textMateResult.stoppedEarly) {
			console.warn(`Time limit reached when tokenizing line: ${line.substring(0, 100)}`);
			// return the state at the beginning of the line
			return new EncodedTokenizationResult(textMateResult.tokens, textMateResult.fonts, state);
		}

		if (this._containsEmbeddedLanguages) {
			const seenLanguages = this._seenLanguages;
			const tokens = textMateResult.tokens;

			// Must check if any of the embedded languages was hit
			for (let i = 0, len = (tokens.length >>> 1); i < len; i++) {
				const metadata = tokens[(i << 1) + 1];
				const languageId = TokenMetadata.getLanguageId(metadata);

				if (!seenLanguages[languageId]) {
					seenLanguages[languageId] = true;
					this._onDidEncounterLanguage.fire(languageId);
				}
			}
		}

		let endState: StateStack;
		// try to save an object if possible
		if (state.equals(textMateResult.ruleStack)) {
			endState = state;
		} else {
			endState = textMateResult.ruleStack;
		}

		return new EncodedTokenizationResult(textMateResult.tokens, textMateResult.fonts, endState);
	}
}
