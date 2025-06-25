/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './tokens/promptToken.js';
import { PromptAtMention } from './tokens/promptAtMention.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { PromptSlashCommand } from './tokens/promptSlashCommand.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { PartialPromptAtMention } from './parsers/promptAtMentionParser.js';
import { PromptTemplateVariable } from './tokens/promptTemplateVariable.js';
import { assert, assertNever } from '../../../../../../base/common/assert.js';
import { PartialPromptSlashCommand } from './parsers/promptSlashCommandParser.js';
import { BaseDecoder } from './base/baseDecoder.js';
import { PromptVariable, PromptVariableWithData } from './tokens/promptVariable.js';
import { At } from './base/simpleCodec/tokens/at.js';
import { Hash } from './base/simpleCodec/tokens/hash.js';
import { Slash } from './base/simpleCodec/tokens/slash.js';
import { DollarSign } from './base/simpleCodec/tokens/dollarSign.js';
import { PartialPromptVariableName, PartialPromptVariableWithData } from './parsers/promptVariableParser.js';
import { MarkdownDecoder, TMarkdownToken } from './base/markdownCodec/markdownDecoder.js';
import { PartialPromptTemplateVariable, PartialPromptTemplateVariableStart, TPromptTemplateVariableParser } from './parsers/promptTemplateVariableParser.js';

/**
 * Tokens produced by this decoder.
 */
export type TChatPromptToken = TMarkdownToken | (PromptVariable | PromptVariableWithData)
	| PromptAtMention | PromptSlashCommand | PromptTemplateVariable;

/**
 * Decoder for the common chatbot prompt message syntax.
 * For instance, the file references `#file:./path/file.md` are handled by this decoder.
 */
export class ChatPromptDecoder extends BaseDecoder<TChatPromptToken, TMarkdownToken> {
	/**
	 * Currently active parser object that is used to parse a well-known sequence of
	 * tokens, for instance, a `#file:/path/to/file.md` link that consists of `hash`,
	 * `word`, and `colon` tokens sequence plus the `file path` part that follows.
	 */
	private current?: (PartialPromptVariableName | PartialPromptVariableWithData)
		| PartialPromptAtMention | PartialPromptSlashCommand
		| TPromptTemplateVariableParser;

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new MarkdownDecoder(stream));
	}

	protected override onStreamData(token: TMarkdownToken): void {
		// prompt `#variables` always start with the `#` character, hence
		// initiate a parser object if we encounter respective token and
		// there is no active parser object present at the moment
		if ((token instanceof Hash) && !this.current) {
			this.current = new PartialPromptVariableName(token);

			return;
		}

		// prompt `@mentions` always start with the `@` character, hence
		// initiate a parser object if we encounter respective token and
		// there is no active parser object present at the moment
		if ((token instanceof At) && !this.current) {
			this.current = new PartialPromptAtMention(token);

			return;
		}

		// prompt `/commands` always start with the `/` character, hence
		// initiate a parser object if we encounter respective token and
		// there is no active parser object present at the moment
		if ((token instanceof Slash) && !this.current) {
			this.current = new PartialPromptSlashCommand(token);

			return;
		}

		// prompt `${template:variables}` always start with the `$` character,
		// hence initiate a parser object if we encounter respective token and
		// there is no active parser object present at the moment
		if ((token instanceof DollarSign) && !this.current) {
			this.current = new PartialPromptTemplateVariableStart(token);

			return;
		}

		// if current parser was not yet initiated, - we are in the general "text"
		// parsing mode, therefore re-emit the token immediately and continue
		if (!this.current) {
			this._onData.fire(token);
			return;
		}

		// if there is a current parser object, submit the token to it
		// so it can progress with parsing the tokens sequence
		const parseResult = this.current.accept(token);

		// process the parse result next
		switch (parseResult.result) {
			// in the case of success there might be 2 cases:
			//   1) parsing fully completed and an instance of `PromptToken` is returned back,
			//      in this case, emit the parsed token (e.g., a `link`) and reset the current
			//      parser object reference so a new parsing process can be initiated next
			//   2) parsing is still in progress and the next parser object is returned, hence
			//      we need to replace the current parser object with a new one and continue
			case 'success': {
				const { nextParser } = parseResult;

				if (nextParser instanceof PromptToken) {
					this._onData.fire(nextParser);
					delete this.current;
				} else {
					this.current = nextParser;
				}

				break;
			}
			// in the case of failure, reset the current parser object
			case 'failure': {
				// if failed to parse a sequence of a tokens, re-emit the tokens accumulated
				// so far then reset the current parser object
				this.reEmitCurrentTokens();
				break;
			}
		}

		// if token was not consumed by the parser, call `onStreamData` again
		// so the token is properly handled by the decoder in the case when a
		// new sequence starts with this token
		if (!parseResult.wasTokenConsumed) {
			this.onStreamData(token);
		}
	}

	protected override onStreamEnd(): void {
		try {
			// if there is no currently active parser object present, nothing to do
			if (this.current === undefined) {
				return;
			}

			// otherwise try to convert unfinished parser object to a token

			if (this.current instanceof PartialPromptVariableName) {
				this._onData.fire(this.current.asPromptVariable());
				return;
			}

			if (this.current instanceof PartialPromptVariableWithData) {
				this._onData.fire(this.current.asPromptVariableWithData());
				return;
			}

			if (this.current instanceof PartialPromptAtMention) {
				this._onData.fire(this.current.asPromptAtMention());
				return;
			}

			if (this.current instanceof PartialPromptSlashCommand) {
				this._onData.fire(this.current.asPromptSlashCommand());
				return;
			}

			assert(
				(this.current instanceof PartialPromptTemplateVariableStart) === false,
				'Incomplete template variable token.',
			);

			if (this.current instanceof PartialPromptTemplateVariable) {
				this._onData.fire(this.current.asPromptTemplateVariable());
				return;
			}

			assertNever(
				this.current,
				`Unknown parser object '${this.current}'`,
			);
		} catch (_error) {
			// if failed to convert current parser object to a token,
			// re-emit the tokens accumulated so far
			this.reEmitCurrentTokens();
		} finally {
			delete this.current;
			super.onStreamEnd();
		}
	}

	/**
	 * Re-emit tokens accumulated so far in the current parser object.
	 */
	protected reEmitCurrentTokens(): void {
		if (this.current === undefined) {
			return;
		}

		for (const token of this.current.tokens) {
			this._onData.fire(token);
		}
		delete this.current;
	}
}
