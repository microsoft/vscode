/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { LineTokens } from 'vs/editor/common/core/lineTokens';
import { createScopedLineTokens, ScopedLineTokens } from 'vs/editor/common/modes/supports';
import { StandardTokenType, MetadataConsts } from 'vs/editor/common/modes';

export interface TokenText {
	text: string;
	type: StandardTokenType;
}

export function createFakeScopedLineTokens(rawTokens: TokenText[]): ScopedLineTokens {
	let tokens = new Uint32Array(rawTokens.length << 1);
	let line = '';

	for (let i = 0, len = rawTokens.length; i < len; i++) {
		let rawToken = rawTokens[i];

		let startOffset = line.length;
		let metadata = (
			(rawToken.type << MetadataConsts.TOKEN_TYPE_OFFSET)
		) >>> 0;

		tokens[(i << 1)] = startOffset;
		tokens[(i << 1) + 1] = metadata;
		line += rawToken.text;
	}

	return createScopedLineTokens(new LineTokens(tokens, line), 0);
}
