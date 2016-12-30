/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IState, ILineTokens, ILineTokens3, ColorId, MetadataConsts, LanguageIdentifier, FontStyle, StandardTokenType, LanguageId } from 'vs/editor/common/modes';
import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';

class NullStateImpl implements IState {

	public clone(): IState {
		return this;
	}

	public equals(other: IState): boolean {
		return (this === other);
	}
}

export const NULL_STATE: IState = new NullStateImpl();

export const NULL_MODE_ID = 'vs.editor.nullMode';

export const NULL_LANGUAGE_IDENTIFIER = new LanguageIdentifier(NULL_MODE_ID, LanguageId.Null);

export function nullTokenize(modeId: string, buffer: string, state: IState, deltaOffset: number): ILineTokens {
	let tokens: Token[] = [new Token(deltaOffset, '')];

	let modeTransitions: ModeTransition[] = [new ModeTransition(deltaOffset, modeId)];

	return {
		tokens: tokens,
		endState: state,
		modeTransitions: modeTransitions
	};
}

export function nullTokenize3(languageId: LanguageId, buffer: string, state: IState, deltaOffset: number): ILineTokens3 {
	let tokens = new Uint32Array(2);
	tokens[0] = deltaOffset;
	tokens[1] = (
		(languageId << MetadataConsts.LANGUAGEID_OFFSET)
		| (StandardTokenType.Other << MetadataConsts.TOKEN_TYPE_OFFSET)
		| (FontStyle.None << MetadataConsts.FONT_STYLE_OFFSET)
		| (ColorId.DefaultForeground << MetadataConsts.FOREGROUND_OFFSET)
		| (ColorId.DefaultBackground << MetadataConsts.BACKGROUND_OFFSET)
	) >>> 0;

	return {
		tokens: tokens,
		endState: state
	};
}
