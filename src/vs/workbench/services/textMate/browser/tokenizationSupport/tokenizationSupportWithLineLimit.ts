/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageId } from '../../../../../editor/common/encodedTokenAttributes.js';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, IState, ITokenizationSupport, TokenizationResult } from '../../../../../editor/common/languages.js';
import { nullTokenizeEncoded } from '../../../../../editor/common/languages/nullTokenize.js';
import { ITextModel } from '../../../../../editor/common/model.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, keepObserved } from '../../../../../base/common/observable.js';

export class TokenizationSupportWithLineLimit extends Disposable implements ITokenizationSupport {
	get backgroundTokenizerShouldOnlyVerifyTokens(): boolean | undefined {
		return this._actual.backgroundTokenizerShouldOnlyVerifyTokens;
	}

	constructor(
		private readonly _encodedLanguageId: LanguageId,
		private readonly _actual: ITokenizationSupport,
		disposable: IDisposable,
		private readonly _maxTokenizationLineLength: IObservable<number>,
	) {
		super();

		this._register(keepObserved(this._maxTokenizationLineLength));
		this._register(disposable);
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
