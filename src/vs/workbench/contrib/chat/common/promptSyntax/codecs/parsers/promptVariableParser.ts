/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { pick } from '../../../../../../../base/common/arrays.js';
import { assert } from '../../../../../../../base/common/assert.js';
import { Range } from '../../../../../../../editor/common/core/range.js';
import { PromptVariable, PromptVariableWithData } from '../tokens/promptVariable.js';
import { Tab } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/tab.js';
import { Hash } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/hash.js';
import { Space } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/space.js';
import { Colon } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/colon.js';
import { NewLine } from '../../../../../../../editor/common/codecs/linesCodec/tokens/newLine.js';
import { FormFeed } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/formFeed.js';
import { TSimpleToken } from '../../../../../../../editor/common/codecs/simpleCodec/simpleDecoder.js';
import { VerticalTab } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/verticalTab.js';
import { CarriageReturn } from '../../../../../../../editor/common/codecs/linesCodec/tokens/carriageReturn.js';
import { ExclamationMark } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/exclamationMark.js';
import { LeftBracket, RightBracket } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/brackets.js';
import { LeftAngleBracket, RightAngleBracket } from '../../../../../../../editor/common/codecs/simpleCodec/tokens/angleBrackets.js';
import { assertNotConsumed, ParserBase, TAcceptTokenResult } from '../../../../../../../editor/common/codecs/simpleCodec/parserBase.js';

/**
 * List of characters that terminate the prompt variable sequence.
 */
export const STOP_CHARACTERS: readonly string[] = [Space, Tab, NewLine, CarriageReturn, VerticalTab, FormFeed]
	.map((token) => { return token.symbol; });

/**
 * List of characters that cannot be in a variable name (excluding the {@link STOP_CHARACTERS}).
 */
export const INVALID_NAME_CHARACTERS: readonly string[] = [Hash, Colon, ExclamationMark, LeftAngleBracket, RightAngleBracket, LeftBracket, RightBracket]
	.map((token) => { return token.symbol; });

/**
 * The parser responsible for parsing a `prompt variable name`.
 * E.g., `#selection` or `#workspace` variable. If the `:` character follows
 * the variable name, the parser transitions to {@link PartialPromptVariableWithData}
 * that is also able to parse the `data` part of the variable. E.g., the `#file` part
 * of the `#file:/path/to/something.md` sequence.
 */
export class PartialPromptVariableName extends ParserBase<TSimpleToken, PartialPromptVariableName | PartialPromptVariableWithData | PromptVariable> {
	constructor(token: Hash) {
		super([token]);
	}

	@assertNotConsumed
	public accept(token: TSimpleToken): TAcceptTokenResult<PartialPromptVariableName | PartialPromptVariableWithData | PromptVariable> {
		// if a `stop` character is encountered, finish the parsing process
		if (STOP_CHARACTERS.includes(token.text)) {
			try {
				// if it is possible to convert current parser to `PromptVariable`, return success result
				return {
					result: 'success',
					nextParser: this.asPromptVariable(),
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

		// if a `:` character is encountered, we might transition to {@link PartialPromptVariableWithData}
		if (token instanceof Colon) {
			this.isConsumed = true;

			// if there is only one token before the `:` character, it must be the starting
			// `#` symbol, therefore fail because there is no variable name present
			if (this.currentTokens.length <= 1) {
				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			}

			// otherwise, if there are more characters after `#` available,
			// we have a variable name, so we can transition to {@link PromptVariableWithData}
			return {
				result: 'success',
				nextParser: new PartialPromptVariableWithData([...this.currentTokens, token]),
				wasTokenConsumed: true,
			};
		}

		// variables cannot have {@link INVALID_NAME_CHARACTERS} in their names
		if (INVALID_NAME_CHARACTERS.includes(token.text)) {
			this.isConsumed = true;

			return {
				result: 'failure',
				wasTokenConsumed: false,
			};
		}

		// otherwise, a valid name character, so add it to the list of
		// the current tokens and continue the parsing process
		this.currentTokens.push(token);

		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}

	/**
	 * Try to convert current parser instance into a fully-parsed {@link PromptVariable} token.
	 *
	 * @throws if sequence of tokens received so far do not constitute a valid prompt variable,
	 *        for instance, if there is only `1` starting `#` token is available.
	 */
	public asPromptVariable(): PromptVariable {
		// if there is only one token before the stop character
		// must be the starting `#` one), then fail
		assert(
			this.currentTokens.length > 1,
			'Cannot create a prompt variable out of incomplete token sequence.',
		);

		const firstToken = this.currentTokens[0];
		const lastToken = this.currentTokens[this.currentTokens.length - 1];

		// render the characters above into strings, excluding the starting `#` character
		const variableNameTokens = this.currentTokens.slice(1);
		const variableName = variableNameTokens.map(pick('text')).join('');

		return new PromptVariable(
			new Range(
				firstToken.range.startLineNumber,
				firstToken.range.startColumn,
				lastToken.range.endLineNumber,
				lastToken.range.endColumn,
			),
			variableName,
		);
	}
}

/**
 * The parser responsible for parsing a `prompt variable name` with `data`.
 * E.g., the `/path/to/something.md` part of the `#file:/path/to/something.md` sequence.
 */
export class PartialPromptVariableWithData extends ParserBase<TSimpleToken, PartialPromptVariableWithData | PromptVariableWithData> {

	constructor(tokens: readonly TSimpleToken[]) {
		const firstToken = tokens[0];
		const lastToken = tokens[tokens.length - 1];

		// sanity checks of our expectations about the tokens list
		assert(
			tokens.length > 2,
			`Tokens list must contain at least 3 items, got '${tokens.length}'.`,
		);
		assert(
			firstToken instanceof Hash,
			`The first token must be a '#', got '${firstToken} '.`,
		);
		assert(
			lastToken instanceof Colon,
			`The last token must be a ':', got '${lastToken} '.`,
		);

		super([...tokens]);
	}

	@assertNotConsumed
	public accept(token: TSimpleToken): TAcceptTokenResult<PartialPromptVariableWithData | PromptVariableWithData> {
		// if a `stop` character is encountered, finish the parsing process
		if (STOP_CHARACTERS.includes(token.text)) {
			// in any case, success of failure below, this is an end of the parsing process
			this.isConsumed = true;

			const firstToken = this.currentTokens[0];
			const lastToken = this.currentTokens[this.currentTokens.length - 1];

			// tokens representing variable name without the `#` character at the start and
			// the `:` data separator character at the end
			const variableNameTokens = this.currentTokens.slice(1, this.startTokensCount - 1);
			// tokens representing variable data without the `:` separator character at the start
			const variableDataTokens = this.currentTokens.slice(this.startTokensCount);
			// compute the full range of the variable token
			const fullRange = new Range(
				firstToken.range.startLineNumber,
				firstToken.range.startColumn,
				lastToken.range.endLineNumber,
				lastToken.range.endColumn,
			);

			// render the characters above into strings
			const variableName = variableNameTokens.map(pick('text')).join('');
			const variableData = variableDataTokens.map(pick('text')).join('');

			return {
				result: 'success',
				nextParser: new PromptVariableWithData(
					fullRange,
					variableName,
					variableData,
				),
				wasTokenConsumed: false,
			};
		}

		// otherwise, token is a valid data character - the data can contain almost any character,
		// including `:` and `#`, hence add it to the list of the current tokens and continue
		this.currentTokens.push(token);

		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}

	/**
	 * Try to convert current parser instance into a fully-parsed {@link asPromptVariableWithData} token.
	 */
	public asPromptVariableWithData(): PromptVariableWithData {
		// tokens representing variable name without the `#` character at the start and
		// the `:` data separator character at the end
		const variableNameTokens = this.currentTokens.slice(1, this.startTokensCount - 1);
		// tokens representing variable data without the `:` separator character at the start
		const variableDataTokens = this.currentTokens.slice(this.startTokensCount);

		// render the characters above into strings
		const variableName = variableNameTokens.map(pick('text')).join('');
		const variableData = variableDataTokens.map(pick('text')).join('');

		const firstToken = this.currentTokens[0];
		const lastToken = this.currentTokens[this.currentTokens.length - 1];

		return new PromptVariableWithData(
			new Range(
				firstToken.range.startLineNumber,
				firstToken.range.startColumn,
				lastToken.range.endLineNumber,
				lastToken.range.endColumn,
			),
			variableName,
			variableData,
		);
	}
}
