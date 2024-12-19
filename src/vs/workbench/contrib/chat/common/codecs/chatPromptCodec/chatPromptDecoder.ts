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
import { CarriageReturn } from '../../../../../../editor/common/codecs/linesCodec/tokens/carriageReturn.js';
import { MarkdownLink } from '../../../../../../editor/common/codecs/markdownCodec/tokens/markdownLink.js';
import { MarkdownDecoder, ParserBase, TMarkdownToken, TParseResult } from '../../../../../../editor/common/codecs/markdownCodec/markdownDecoder.js';

/**
 * Tokens produced by this decoder.
 */
export type TChatPromptToken = MarkdownLink | FileReference;

/**
 * TODO: @legomushroom
 */
class PartialPromptVariableName extends ParserBase<TMarkdownToken, PartialPromptVariableName | PartialPromptFileReference | FileReference> {
	constructor(token: Hash) {
		super([token]);
	}

	public accept(token: TMarkdownToken): TParseResult<PartialPromptVariableName | PartialPromptFileReference | FileReference> {
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
 * TODO: @legomushroom
 */
class PartialPromptFileReference extends ParserBase<TMarkdownToken, PartialPromptFileReference | FileReference> {
	/**
	 * TODO: @legomushroom
	 */
	private readonly variableNameTokens: (Hash | Word | Colon)[];

	constructor(tokens: (Hash | Word | Colon)[]) {
		super([]);

		this.variableNameTokens = tokens;
	}

	public override get tokens(): readonly (Hash | Word | Colon)[] {
		return [...this.variableNameTokens, ...this.currentTokens];
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

	public accept(token: TMarkdownToken): TParseResult<PartialPromptFileReference | FileReference> {
		// any of stop characters is are breaking a prompt variable sequence
		if (token instanceof Space || token instanceof Tab || token instanceof CarriageReturn || token instanceof NewLine || token instanceof VerticalTab || token instanceof FormFeed) { // TODO: @legomushroom - are the vertical tab/form feed correct here?
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
	 * TODO: @legomushroom
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

		// if current parser was not initiated before, - we are in the general
		// "text" mode, therefore re-emit the token immediatelly and continue
		// TODO: @legomushroom - collect this into a text sequence entity?
		if (!this.current) {
			if (token instanceof MarkdownLink) { // TODO: @legomushroom - use the common `MarkdownToken` type instead?
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
