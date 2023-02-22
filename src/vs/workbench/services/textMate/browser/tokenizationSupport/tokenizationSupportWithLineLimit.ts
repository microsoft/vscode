/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { LanguageId } from 'vs/editor/common/encodedTokenAttributes';
import { EncodedTokenizationResult, IBackgroundTokenizationStore, IBackgroundTokenizer, IState, ITokenizationSupport, TokenizationResult } from 'vs/editor/common/languages';
import { nullTokenizeEncoded } from 'vs/editor/common/languages/nullTokenize';
import { ITextModel } from 'vs/editor/common/model';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';

export class TokenizationSupportWithLineLimit implements ITokenizationSupport {
	private _maxTokenizationLineLength: number;

	constructor(
		private readonly _languageId: string,
		private readonly _encodedLanguageId: LanguageId,
		private readonly _actual: ITokenizationSupport,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		this._maxTokenizationLineLength = this._configurationService.getValue<number>('editor.maxTokenizationLineLength', {
			overrideIdentifier: this._languageId
		});
		this._configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('editor.maxTokenizationLineLength')) {
				this._maxTokenizationLineLength = this._configurationService.getValue<number>('editor.maxTokenizationLineLength', {
					overrideIdentifier: this._languageId
				});
			}
		});
	}

	getInitialState(): IState {
		return this._actual.getInitialState();
	}

	tokenize(line: string, hasEOL: boolean, state: IState): TokenizationResult {
		throw new Error('Not supported!');
	}

	tokenizeEncoded(line: string, hasEOL: boolean, state: IState): EncodedTokenizationResult {
		// Do not attempt to tokenize if a line is too long
		if (line.length >= this._maxTokenizationLineLength) {
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
