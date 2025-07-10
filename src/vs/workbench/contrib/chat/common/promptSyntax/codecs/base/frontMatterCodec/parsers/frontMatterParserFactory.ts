/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseToken } from '../../baseToken.js';
import { LeftBracket } from '../../simpleCodec/tokens/brackets.js';
import { Word } from '../../simpleCodec/tokens/word.js';
import { FrontMatterRecordDelimiter, FrontMatterRecordName } from '../tokens/frontMatterRecord.js';
import { TQuoteToken } from '../tokens/frontMatterString.js';
import { PartialFrontMatterArray } from './frontMatterArray.js';
import { PartialFrontMatterRecord } from './frontMatterRecord/frontMatterRecord.js';
import { PartialFrontMatterRecordName } from './frontMatterRecord/frontMatterRecordName.js';
import { PartialFrontMatterRecordNameWithDelimiter, TNameStopToken } from './frontMatterRecord/frontMatterRecordNameWithDelimiter.js';
import { PartialFrontMatterSequence } from './frontMatterSequence.js';
import { PartialFrontMatterString } from './frontMatterString.js';
import { PartialFrontMatterValue } from './frontMatterValue.js';

export class FrontMatterParserFactory {
	createRecord(tokens: [FrontMatterRecordName, FrontMatterRecordDelimiter]): PartialFrontMatterRecord {
		return new PartialFrontMatterRecord(this, tokens);
	}
	createRecordName(startToken: Word): PartialFrontMatterRecordName {
		return new PartialFrontMatterRecordName(this, startToken);
	}
	createRecordNameWithDelimiter(tokens: readonly [FrontMatterRecordName, TNameStopToken]): PartialFrontMatterRecordNameWithDelimiter {
		return new PartialFrontMatterRecordNameWithDelimiter(this, tokens);
	}
	createArray(startToken: LeftBracket) {
		return new PartialFrontMatterArray(this, startToken);
	}
	createValue(shouldStop: (token: BaseToken) => boolean): PartialFrontMatterValue {
		return new PartialFrontMatterValue(this, shouldStop);
	}
	createString(startToken: TQuoteToken): PartialFrontMatterString {
		return new PartialFrontMatterString(startToken);
	}
	createSequence(shouldStop: (token: BaseToken) => boolean): PartialFrontMatterSequence {
		return new PartialFrontMatterSequence(shouldStop);
	}
}
