/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileReference } from './tokens/fileReference.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Range } from '../../../../../../editor/common/core/range.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../../../base/common/codecs/baseDecoder.js';
import { Tab } from '../../../../../../editor/common/codecs/simpleCodec/tokens/tab.js';
import { Word } from '../../../../../../editor/common/codecs/simpleCodec/tokens/word.js';
import { Hash } from '../../../../../../editor/common/codecs/simpleCodec/tokens/hash.js';
import { Space } from '../../../../../../editor/common/codecs/simpleCodec/tokens/space.js';
import { Colon } from '../../../../../../editor/common/codecs/simpleCodec/tokens/colon.js';
import { NewLine } from '../../../../../../editor/common/codecs/linesCodec/tokens/newLine.js';
import { FormFeed } from '../../../../../../editor/common/codecs/simpleCodec/tokens/formFeed.js';
import { VerticalTab } from '../../../../../../editor/common/codecs/simpleCodec/tokens/verticalTab.js';
import { ParserBase, TAcceptTokenResult } from '../../../../../../editor/common/codecs/parsers/parserBase.js';
import { MarkdownLink } from '../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { CarriageReturn } from '../../../../../../editor/common/codecs/linesCodec/tokens/carriageReturn.js';
import { MarkdownDecoder, TMarkdownToken } from '../../../../../../editor/common/codecs/markdownCodec/markdownDecoder.js';

/**
 * Tokens produced by this decoder.
 */
export type TChatPromptToken = MarkdownLink | FileReference;

/**
 * Parser representing a partial prompt variable name, e.g., `#file:` etc.
 */
class PartialPromptVariableName extends ParserBase<TMarkdownToken, PartialPromptVariableName | PartialPromptFileReference | FileReference> {
	constructor(token: Hash) {
		super([token]);
	}

	public accept(token: TMarkdownToken): TAcceptTokenResult<PartialPromptVariableName | PartialPromptFileReference | FileReference> {
		if (token instanceof Word) {
			if (token.text === 'file') {
				this.currentTokens.push(token);

				return {
					result: 'success',
					nextParser: this,
					wasTokenConsumed: true,
				};
			}

			return {
				result: 'failure',
				wasTokenConsumed: false,
			};
		}

		if (token instanceof Colon) {
			const lastToken = this.currentTokens[this.currentTokens.length - 1];

			if (lastToken instanceof Word) {
				this.currentTokens.push(token);

				return {
					result: 'success',
					nextParser: new PartialPromptFileReference(this.currentTokens),
					wasTokenConsumed: true,
				};
			}
		}

		return {
			result: 'failure',
			wasTokenConsumed: false,
		};
	}
}

/**
 * List of characters that stop a prompt variable sequence.
 */
const PROMPT_FILE_REFERENCE_STOP_CHARACTERS: readonly string[] = [Space, Tab, CarriageReturn, NewLine, VerticalTab, FormFeed]
	.map((token) => { return token.symbol; });

/**
 * Parser representing a partial prompt file reference, e.g., `#file:`.
 */
class PartialPromptFileReference extends ParserBase<TMarkdownToken, PartialPromptFileReference | FileReference> {
	/**
	 * Set of tokens that were accumulated so far.
	 */
	private readonly fileReferenceTokens: (Hash | Word | Colon)[];

	constructor(tokens: (Hash | Word | Colon)[]) {
		super([]);

		this.fileReferenceTokens = tokens;
	}

	/**
	 * List of tokens that were accumulated so far.
	 */
	public override get tokens(): readonly (Hash | Word | Colon)[] {
		return [...this.fileReferenceTokens, ...this.currentTokens];
	}

	/**
	 * Return the `FileReference` instance created from the current object.
	 */
	public asFileReference(): FileReference {
		// use only tokens in the `currentTokens` list to
		// create the path component of the file reference
		const path = this.currentTokens
			.map((token) => { return token.text; })
			.join('');

		const firstToken = this.tokens[0];

		const range = new Range(
			firstToken.range.startLineNumber,
			firstToken.range.startColumn,
			firstToken.range.startLineNumber,
			firstToken.range.startColumn + FileReference.TOKEN_START.length + path.length,
		);

		return new FileReference(range, path);
	}

	public accept(token: TMarkdownToken): TAcceptTokenResult<PartialPromptFileReference | FileReference> {
		// any of stop characters is are breaking a prompt variable sequence
		if (PROMPT_FILE_REFERENCE_STOP_CHARACTERS.includes(token.text)) {
			return {
				result: 'success',
				wasTokenConsumed: false,
				nextParser: this.asFileReference(),
			};
		}

		// any other token can be included in the sequence so accumulate
		// it and continue with using the current parser instance
		this.currentTokens.push(token);
		return {
			result: 'success',
			wasTokenConsumed: true,
			nextParser: this,
		};
	}
}

/**
 * Decoder for the common chatbot prompt message syntax.
 * For instance, the file references `#file:./path/file.md` are handled by this decoder.
 */
export class ChatPromptDecoder extends BaseDecoder<TChatPromptToken, TMarkdownToken> {
	/**
	 * Currently active parser object that is used to parse a well-known equence of
	 * tokens, for instance, a `file reference` that consists of `hash`, `word`, and
	 * `colon` tokens sequence plus following file path part.
	 */
	private current?: PartialPromptVariableName;

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new MarkdownDecoder(stream));
	}

	protected override onStreamData(token: TMarkdownToken): void {
		// prompt variables always start with the `#` character
		if (token instanceof Hash && !this.current) {
			this.current = new PartialPromptVariableName(token);

			return;
		}

		// if current parser was not yet initiated, - we are in the general
		// "text" mode, therefore re-emit the token immediatelly and return
		if (!this.current) {
			// at the moment, the decoder outputs only specific markdown tokens, like
			// the `markdown link`, so re-emit only these tokens ignoring the rest
			//
			// note! to make the decoder consistent with others we would need to:
			// 	- re-emit all tokens here
			//  - collect all "text" sequences of tokens and emit them as a single
			// 	  "text" sequence token
			// TODO: @legomushroom - create a tracking issue for the above?
			if (token instanceof MarkdownLink) {
				this._onData.fire(token);
			}

			return;
		}

		// if there is a current parser object, submit the token to it
		// so it can progress with parsing the tokens sequence
		const parseResult = this.current.accept(token);
		if (parseResult.result === 'success') {
			if (parseResult.nextParser instanceof FileReference) {
				this._onData.fire(parseResult.nextParser);
				delete this.current;
			} else {
				// otherwise, update the current parser object
				this.current = parseResult.nextParser;
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
		// if the stream has ended and there is a current `PartialPromptFileReference`
		// parser object, then the file reference was terminated by the end of the stream
		if (this.current && this.current instanceof PartialPromptFileReference) {
			this._onData.fire(this.current.asFileReference());
			delete this.current;
		}

		super.onStreamEnd();
	}
}
