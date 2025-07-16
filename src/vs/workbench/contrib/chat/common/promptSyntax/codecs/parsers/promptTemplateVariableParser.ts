/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { assert } from '../../../../../../../base/common/assert.js';
import { PromptTemplateVariable } from '../tokens/promptTemplateVariable.js';
import { BaseToken } from '../base/baseToken.js';
import { TSimpleDecoderToken } from '../base/simpleCodec/simpleDecoder.js';
import { DollarSign, LeftCurlyBrace, RightCurlyBrace } from '../base/simpleCodec/tokens/tokens.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../base/simpleCodec/parserBase.js';

/**
 * Parsers of the `${variable}` token sequence in a prompt text.
 */
export type TPromptTemplateVariableParser = PartialPromptTemplateVariableStart | PartialPromptTemplateVariable;

/**
 * Parser that handles start sequence of a `${variable}` token sequence in
 * a prompt text. Transitions to {@link PartialPromptTemplateVariable} parser
 * as soon as the `${` character sequence is found.
 */
export class PartialPromptTemplateVariableStart extends ParserBase<DollarSign | LeftCurlyBrace, PartialPromptTemplateVariableStart | PartialPromptTemplateVariable> {
	constructor(token: DollarSign) {
		super([token]);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialPromptTemplateVariableStart | PartialPromptTemplateVariable> {
		if (token instanceof LeftCurlyBrace) {
			this.currentTokens.push(token);

			this.isConsumed = true;
			return {
				result: 'success',
				nextParser: new PartialPromptTemplateVariable(this.currentTokens),
				wasTokenConsumed: true,
			};
		}

		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}

/**
 * Parser that handles a partial `${variable}` token sequence in a prompt text.
 */
export class PartialPromptTemplateVariable extends ParserBase<TSimpleDecoderToken, PartialPromptTemplateVariable | PromptTemplateVariable> {
	constructor(tokens: (DollarSign | LeftCurlyBrace)[]) {
		super(tokens);
	}

	@assertNotConsumed
	public accept(token: TSimpleDecoderToken): TAcceptTokenResult<PartialPromptTemplateVariable | PromptTemplateVariable> {
		// template variables are terminated by the `}` character
		if (token instanceof RightCurlyBrace) {
			this.currentTokens.push(token);

			this.isConsumed = true;
			return {
				result: 'success',
				nextParser: this.asPromptTemplateVariable(),
				wasTokenConsumed: true,
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
	 * Returns a string representation of the prompt template variable
	 * contents, if any is present.
	 */
	private get contents(): string {
		const contentTokens: TSimpleDecoderToken[] = [];

		// template variables are surrounded by `${}`, hence we need to have
		// at least `${` plus one character for the contents to be non-empty
		if (this.currentTokens.length < 3) {
			return '';
		}

		// collect all tokens besides the first two (`${`) and a possible `}` at the end
		for (let i = 2; i < this.currentTokens.length; i++) {
			const token = this.currentTokens[i];
			const isLastToken = (i === this.currentTokens.length - 1);

			if ((token instanceof RightCurlyBrace) && (isLastToken === true)) {
				break;
			}

			contentTokens.push(token);
		}

		return BaseToken.render(contentTokens);
	}

	/**
	 * Try to convert current parser instance into a {@link PromptTemplateVariable} token.
	 *
	 * @throws if:
	 * 	- current tokens sequence cannot be converted to a valid template variable token
	 */
	public asPromptTemplateVariable(): PromptTemplateVariable {
		const firstToken = this.currentTokens[0];
		const secondToken = this.currentTokens[1];
		const lastToken = this.currentTokens[this.currentTokens.length - 1];

		// template variables are surrounded by `${}`, hence we need
		// to have at least 3 tokens in the list for a valid one
		assert(
			this.currentTokens.length >= 3,
			'Prompt template variable should have at least 3 tokens.',
		);

		// a complete template variable must end with a `}`
		assert(
			lastToken instanceof RightCurlyBrace,
			'Last token is not a "}".',
		);

		// sanity checks of the first and second tokens
		assert(
			firstToken instanceof DollarSign,
			'First token must be a "$".',
		);
		assert(
			secondToken instanceof LeftCurlyBrace,
			'Second token must be a "{".',
		);

		return new PromptTemplateVariable(
			BaseToken.fullRange(this.currentTokens),
			this.contents,
		);
	}
}
