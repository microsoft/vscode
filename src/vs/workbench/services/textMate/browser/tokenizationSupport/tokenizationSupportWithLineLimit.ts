/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageId } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, IState, ITokenizationSupport, TokenizationResult } from 'vs/editor/common/languages';
import { nullTokenizeEncoded } from 'vs/editor/common/languages/nullTokenize';
import { ITextModel } from 'vs/editor/common/model';
import { Disposable } from 'vs/base/common/lifecycle';
import { IObservable, keepObserved } from 'vs/base/common/observable';

export class TokenizationSupportWithLineLimit extends Disposable implements ITokenizationSupport {
	get backgroundTokenizerShouldOnlyVerifyTokens(): boolean | undefined {
		return this._actual.backgroundTokenizerShouldOnlyVerifyTokens;
	}

	constructor(
		private readonly _encodedLanguageId: LanguageId,
		private readonly _actual: ITokenizationSupport,
		private readonly _maxTokenizationLineLength: IObservable<number>,
	) {
		super();

		this._register(keepObserved(this._maxTokenizationLineLength));
	}

	getInitialState(): IState {
		return this._actual.getInitialState();
	}

	tokenize(line: string, hasEOL: boolean, state: IState): TokenizationResult {
		throw new Error('Not supported!');
	}

	tokenizeEncoded(line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult {
		// Do not attempt to tokenize if a line is too long
		if (line.length >= this._maxTokenizationLineLength.get()) {
			return nullTokenizeEncoded(this._encodedLanguageId, state);
		}

		return this._actual.tokenizeEncoded(line, hasEOL, state);
	}

	createBackgroundTokenizer(textModel: ITextModel, store: IBackgroundTokenizationStore): IBackgroundTokenizer | undefined {
		if (this._actual.createBackgroundTokenizer) {
			return this._actual.createBackgroundTokenizer(textModel, store);
		} else {
			return undefined;
		}
	}
}
