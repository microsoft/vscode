/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
 * TODO: @lego - list
 *  - use the parser in the the prompt codec.
 */

/**
 * TODO: @lego
 */
const STOP_CHARACTERS: readonly string[] = [CarriageReturn, NewLine, Tab, VerticalTab, FormFeed, Space]
	.map((token) => { return token.symbol; });

/**
 * TODO: @lego (excluding the stop ones)
 */
// TODO: @lego - add `@` here once we have it
const INVALID_NAME_CHARACTERS: readonly string[] = [Hash, ExclamationMark, LeftAngleBracket, RightAngleBracket, LeftBracket, RightBracket]
	.map((token) => { return token.symbol; });

/**
 * The parser responsible for parsing the TODO: @lego
 */
export class PartialPromptVariableName extends ParserBase<TSimpleToken, PartialPromptVariableName | PartialPromptVariableWithData | PromptVariable> {
	constructor(token: Hash) {
		super([token]);
	}

	@assertNotConsumed
	public accept(token: TSimpleToken): TAcceptTokenResult<PartialPromptVariableName | PartialPromptVariableWithData | PromptVariable> {
		// if a `stop` character is encountered, finish the parsing process
		if (STOP_CHARACTERS.includes(token.text)) {
			// in any case, success of failure below, this is an end of the parsing process
			this.isConsumed = true;

			// if there is only one token before the stop character
			// must be the starting `#` one), then fail
			if (this.currentTokens.length <= 1) {
				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			}

			const firstToken = this.currentTokens[0];
			const lastToken = this.currentTokens[this.currentTokens.length - 1];

			// TODO: @lego - validate that first and last tokens are defined?

			// render the characters above into strings, excluding the starting `#` character
			const variableNameTokens = this.currentTokens.slice(1);
			const variableName = variableNameTokens.map(pick('text')).join('');

			return {
				result: 'success',
				nextParser: new PromptVariable(
					new Range(
						firstToken.range.startLineNumber,
						firstToken.range.startColumn,
						lastToken.range.endLineNumber,
						lastToken.range.endColumn,
					),
					variableName,
				),
				wasTokenConsumed: false,
			};
		}

		// if a `:` character is encountered, we might transition to {@link PartialPromptVariableWithData}
		if (token instanceof Colon) {
			// if there is only one token before the `:` character
			// must be the starting `#` one), then fail
			if (this.currentTokens.length <= 1) {
				this.isConsumed = true;

				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			}

			// otherwise, if there are more characters after `#` available,
			// we have a variable name, so with `:`, transition to {@link PromptVariableWithData}
			this.currentTokens.push(token);
			this.isConsumed = true;

			return {
				result: 'success',
				nextParser: new PartialPromptVariableWithData(this.currentTokens),
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
}

/**
 * TODO: @lego
 */
export class PartialPromptVariableWithData extends ParserBase<TSimpleToken, PartialPromptVariableWithData | PromptVariableWithData> {
	/**
	 * Number of tokens at the initialization of the current parser.
	 */
	// TODO: @lego - move to the base class?
	private readonly startTokensCount: number;

	constructor(tokens: readonly TSimpleToken[]) {
		super([...tokens]);

		// TODO: @lego - validate that it starts with `#` and ends with `:`

		// save the number of tokens that represent a variable name and the colon at the end
		this.startTokensCount = this.currentTokens.length;
	}

	@assertNotConsumed
	public accept(token: TSimpleToken): TAcceptTokenResult<PartialPromptVariableWithData | PromptVariableWithData> {
		// if a `stop` character is encountered, finish the parsing process
		if (STOP_CHARACTERS.includes(token.text)) {
			// in any case, success of failure below, this is an end of the parsing process
			this.isConsumed = true;

			// if no tokens received after initial set of tokens, fail
			if (this.currentTokens.length === this.startTokensCount) {
				return {
					result: 'failure',
					wasTokenConsumed: false,
				};
			}

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

			// TODO: @lego - validate that first and last tokens are defined?

			return {
				result: 'success',
				nextParser: new PromptVariableWithData(
					new Range(
						firstToken.range.startLineNumber,
						firstToken.range.startColumn,
						lastToken.range.endLineNumber,
						lastToken.range.endColumn,
					),
					variableName,
					variableData,
				),
				wasTokenConsumed: false,
			};
		}

		// otherwise, a valid data character - the data can contain almost any character,
		// including `:` and `#`, hence add it to the list of the current tokens and continue
		this.currentTokens.push(token);

		return {
			result: 'success',
			nextParser: this,
			wasTokenConsumed: true,
		};
	}
}

/**
 * Utility that helps to pick a property from an object.
 *
 * ## Examples
 *
 * ```typescript
 * interface IObject = {
 *   a: number,
 *   b: string,
 * };
 *
 * const list: IObject[] = [
 *   { a: 1, b: 'foo' },
 *   { a: 2, b: 'bar' },
 * ];
 *
 * assert.deepStrictEqual(
 *   list.map(pick('a')),
 *   [1, 2],
 * );
 * ```
 */
// TODO: @lego - move to a common place
export const pick = <TObject, TKeyName extends keyof TObject>(
	key: TKeyName,
) => {
	return (obj: TObject): TObject[TKeyName] => {
		return obj[key];
	};
};
