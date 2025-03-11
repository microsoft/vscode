/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PromptToken } from './tokens/promptToken.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { assertNever } from '../../../../../../base/common/assert.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../../../base/common/codecs/baseDecoder.js';
import { PromptVariable, PromptVariableWithData } from './tokens/promptVariable.js';
import { Hash } from '../../../../../../editor/common/codecs/simpleCodec/tokens/hash.js';
import { MarkdownLink } from '../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { PartialPromptVariableName, PartialPromptVariableWithData } from './parsers/promptVariableParser.js';
import { MarkdownDecoder, TMarkdownToken } from '../../../../../../editor/common/codecs/markdownCodec/markdownDecoder.js';

/**
 * Tokens produced by this decoder.
 */
export type TChatPromptToken = MarkdownLink | PromptVariable | PromptVariableWithData;

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
	private current?: PartialPromptVariableName | PartialPromptVariableWithData;

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new MarkdownDecoder(stream));
	}

	protected override onStreamData(token: TMarkdownToken): void {
		// prompt variables always start with the `#` character, hence
		// initiate a parser object if we encounter respective token and
		// there is no active parser object present at the moment
		if (token instanceof Hash && !this.current) {
			this.current = new PartialPromptVariableName(token);

			return;
		}

		// if current parser was not yet initiated, - we are in the general
		// "text" parsing mode, therefore re-emit the token immediately and return
		if (!this.current) {
			// at the moment, the decoder outputs only specific markdown tokens, like
			// the `markdown link` one, so re-emit only these tokens ignoring the rest
			//
			// note! to make the decoder consistent with others we would need to:
			// 	- re-emit all tokens here
			//  - collect all "text" sequences of tokens and emit them as a single
			// 	  "text" sequence token
			if (token instanceof MarkdownLink) {
				this._onData.fire(token);
			}

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
				delete this.current;

				// note! when this decoder becomes consistent with other ones and hence starts emitting
				// 		 all token types, not just links, we would need to re-emit all the tokens that
				//       the parser object has accumulated so far
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
			if (!this.current) {
				return;
			}

			// otherwise try to convert incomplete parser object to a token
			if (this.current instanceof PartialPromptVariableName) {
				return this._onData.fire(this.current.asPromptVariable());
			}

			if (this.current instanceof PartialPromptVariableWithData) {
				return this._onData.fire(this.current.asPromptVariableWithData());
			}

			assertNever(
				this.current,
				`Unknown parser object '${this.current}'`,
			);
		} catch (error) {
			// note! when this decoder becomes consistent with other ones and hence starts emitting
			// 		 all token types, not just links, we would need to re-emit all the tokens that
			//       the parser object has accumulated so far
		} finally {
			delete this.current;
			super.onStreamEnd();
		}
	}
}
