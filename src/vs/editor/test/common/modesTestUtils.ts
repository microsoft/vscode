/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ModeTransition } from 'vs/editor/common/core/modeTransition';
import { Token } from 'vs/editor/common/core/token';
import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { TokensBinaryEncoding, TokensInflatorMap } from 'vs/editor/common/model/tokensBinaryEncoding';

export function createFakeLineTokens(line: string, modeId: string, tokens: Token[], modeTransitions: ModeTransition[]): LineTokens {
	let map = new TokensInflatorMap(modeId);
	let deflatedTokens = TokensBinaryEncoding.deflateArr(map, tokens);
	return new LineTokens(map, deflatedTokens, modeTransitions, line);
}
