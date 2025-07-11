/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptAtMention } from '../tokens/promptAtMention.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { BaseToken } from '../base/baseToken.js';
import { At } from '../base/simpleCodec/tokens/at.js';
import { Tab } from '../base/simpleCodec/tokens/tab.js';
import { Hash } from '../base/simpleCodec/tokens/hash.js';
import { Space } from '../base/simpleCodec/tokens/space.js';
import { Colon } from '../base/simpleCodec/tokens/colon.js';
import { NewLine } from '../base/linesCodec/tokens/newLine.js';
import { FormFeed } from '../base/simpleCodec/tokens/formFeed.js';
import { VerticalTab } from '../base/simpleCodec/tokens/verticalTab.js';
import { TSimpleDecoderToken } from '../base/simpleCodec/simpleDecoder.js';
import { CarriageReturn } from '../base/linesCodec/tokens/carriageReturn.js';
import { ExclamationMark } from '../base/simpleCodec/tokens/exclamationMark.js';
import { LeftBracket, RightBracket } from '../base/simpleCodec/tokens/brackets.js';
import { LeftAngleBracket, RightAngleBracket } from '../base/simpleCodec/tokens/angleBrackets.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../base/simpleCodec/parserBase.js';

/**
 * List of characters that terminate the prompt at-mention sequence.
 */
export const STOP_CHARACTERS: readonly string[] = [Space, Tab, NewLine, CarriageReturn, VerticalTab, FormFeed, At, Colon, Hash]
	.map((token) => { return token.symbol; });

/**
 * List of characters that cannot be in an at-mention name (excluding the {@link STOP_CHARACTERS}).
 */
export const INVALID_NAME_CHARACTERS: readonly string[] = [ExclamationMark, LeftAngleBracket, RightAngleBracket, LeftBracket, RightBracket]
	.map((token) => { return token.symbol; });

/**
 * The parser responsible for parsing a `prompt @mention` sequences.
 * E.g., `@workspace` or `@github` participant mention.
 */
export class PartialPromptAtMention extends ParserBase<TSimpleDecoderToken, PartialPromptAtMention | PromptAtMention> {
	constructor(token: At) {
		super([token]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialPromptAtMention | PromptAtMention> {
		// if a `stop` character is encountered, finish the parsing process
		if (STOP_CHARACTERS.includes(token.text)) {
			try {
				// if it is possible to convert current parser to `PromptAtMention`, return success result
				return {
					result: 'success',
					nextParser: this.asPromptAtMention(),
					wasTokenConsumed: false,
				};
			} catch (error) {
				// otherwise fail
				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			} finally {
				// in any case this is an end of the parsing process
				this.isConsumed = true;
			}
		}

		// variables cannot have {@link INVALID_NAME_CHARACTERS} in their names
		if (INVALID_NAME_CHARACTERS.includes(token.text)) {
			this.isConsumed = true;

			return {
				result: 'failure',
				wasTokenConsumed: false,
			};
		}

		// otherwise it is a valid name character, so add it to the list of
		// the current tokens and continue the parsing process
		this.currentTokens.push(token);

		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}

	/**
	 * Try to convert current parser instance into a fully-parsed {@link PromptAtMention} token.
	 *
	 * @throws if sequence of tokens received so far do not constitute a valid prompt variable,
	 *        for instance, if there is only `1` starting `@` token is available.
	 */
	public asPromptAtMention(): PromptAtMention {
		// if there is only one token before the stop character
		// must be the starting `@` one), then fail
		assert(
			this.currentTokens.length > 1,
			'Cannot create a prompt @mention out of incomplete token sequence.',
		);

		const firstToken = this.currentTokens[0];
		const lastToken = this.currentTokens[this.currentTokens.length - 1];

		// render the characters above into strings, excluding the starting `@` character
		const nameTokens = this.currentTokens.slice(1);
		const atMentionName = BaseToken.render(nameTokens);

		return new PromptAtMention(
			new Range(
				firstToken.range.startLineNumber,
				firstToken.range.startColumn,
				lastToken.range.endLineNumber,
				lastToken.range.endColumn,
			),
			atMentionName,
		);
	}
}
