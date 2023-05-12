/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Token, TokenizationResult, EncodedTokenizationResult, IState } from 'vs/editor/common/languages';
import { LanguageId, FontStyle, ColorId, StandardTokenType, MetadataConsts } from 'vs/editor/common/encodedTokenAttributes';

export const NullState: IState = new class implements IState {
	public clone(): IState {
		return this;
	}
	public equals(other: IState): boolean {
		return (this === other);
	}
};

export function nullTokenize(languageId: string, state: IState): TokenizationResult {
	return new TokenizationResult([new Token(0, '', languageId)], state);
}

export function nullTokenizeEncoded(languageId: LanguageId, state: IState | null): EncodedTokenizationResult {
	const tokens = new Uint32Array(2);
	tokens[0] = 0;
	tokens[1] = (
		(languageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;

	return new EncodedTokenizationResult(tokens, state === null ? NullState : state);
}
