/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { IState, ITokenizationSupport, TokenizationResult, EncodedTokenizationResult } from 'vs/editor/common/languages';
import { LanguageId, TokenMetadata } from 'vs/editor/common/encodedTokenAttributes';
import type { IGrammar, StackElement } from 'vscode-textmate';
import { Disposable } from 'vs/base/common/lifecycle';

export class TMTokenization extends Disposable implements ITokenizationSupport {

	private readonly _grammar: IGrammar;
	private readonly _containsEmbeddedLanguages: boolean;
	private readonly _seenLanguages: boolean[];
	private readonly _initialState: StackElement;

	private readonly _onDidEncounterLanguage: Emitter<LanguageId> = this._register(new Emitter<LanguageId>());
	public readonly onDidEncounterLanguage: Event<LanguageId> = this._onDidEncounterLanguage.event;

	constructor(grammar: IGrammar, initialState: StackElement, containsEmbeddedLanguages: boolean) {
		super();
		this._grammar = grammar;
		this._initialState = initialState;
		this._containsEmbeddedLanguages = containsEmbeddedLanguages;
		this._seenLanguages = [];
	}

	public getInitialState(): IState {
		return this._initialState;
	}

	public tokenize(line: string, hasEOL: boolean, state: IState): TokenizationResult {
		throw new Error('Not supported!');
	}

	public tokenizeEncoded(line: string, hasEOL: boolean, state: StackElement): EncodedTokenizationResult {
		const textMateResult = this._grammar.tokenizeLine2(line, state, 500);

		if (textMateResult.stoppedEarly) {
			console.warn(`Time limit reached when tokenizing line: ${line.substring(0, 100)}`);
			// return the state at the beginning of the line
			return new EncodedTokenizationResult(textMateResult.tokens, state);
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

		let endState: StackElement;
		// try to save an object if possible
		if (state.equals(textMateResult.ruleStack)) {
			endState = state;
		} else {
			endState = textMateResult.ruleStack;

		}

		return new EncodedTokenizationResult(textMateResult.tokens, endState);
	}
}
