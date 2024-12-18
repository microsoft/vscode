/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileReference } from './tokens/fileReference.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../../../base/common/codecs/baseDecoder.js';
import { Word } from '../../../../../../editor/common/codecs/simpleCodec/tokens/word.js';
import { LeftBracket } from '../../../../../../editor/common/codecs/simpleCodec/tokens/brackets.js';
import { MarkdownDecoder, TDetailedToken, TMarkdownToken } from '../../../../../../editor/common/codecs/markdownCodec/markdownDecoder.js';

// class MarkdownLink extends BaseToken {
// 	public override toString(): string {
// 		throw new Error('Method not implemented.');
// 	}
// }

// /**
//  * Tokens handled by the `ChatPromptDecoder` decoder.
//  */
// export type TChatPromptToken = FileReference | MarkdownLink;

// abstract class Base<T> {
// 	protected currentTokens: TDetailedToken[] = [];

// 	public get tokens(): readonly TDetailedToken[] {
// 		return this.currentTokens;
// 	}

// 	public abstract accept(token: TDetailedToken): [T, boolean];
// }

// class PartialMarkdownLinkCaption extends Base<PartialMarkdownLinkCaption | MarkdownLinkCaption> {
// 	constructor(token: LeftBracket) {
// 		super();
// 		this.currentTokens.push(token);
// 	}

// 	public accept(token: TDetailedToken): [PartialMarkdownLinkCaption, boolean] {
// 		throw new Error('Method not implemented.');
// 	}
// }

// class MarkdownLinkCaption extends Base<PartialMarkdownLink> {
// 	public accept(token: TDetailedToken): [PartialMarkdownLink, boolean] {
// 		throw new Error('Method not implemented.');
// 	}
// }

// class PartialMarkdownLink extends Base<MarkdownLink> {
// 	public accept(token: TDetailedToken): [MarkdownLink, boolean] {
// 		throw new Error('Method not implemented.');
// 	}
// }

class PartialFileReference extends Base<PartialFileReference | FileReference> {
	constructor(token: Word) {
		super();
		this.currentTokens.push(token);
	}

	public accept(token: TDetailedToken): [PartialFileReference | FileReference, boolean] {
		throw new Error('Method not implemented.');
	}
}

/**
 * Decoder for the common chatbot prompt message syntax.
 * For instance, the file references `#file:./path/file.md` are handled by this decoder.
 */
export class ChatPromptDecoder extends BaseDecoder<TMarkdownToken, TDetailedToken> {
	/**
	 * TODO: @legomushroom
	 */
	private current?: PartialMarkdownLinkCaption | MarkdownLinkCaption | PartialMarkdownLink | PartialFileReference;

	private sequence: TDetailedToken[] = [];

	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new MarkdownDecoder(stream));
	}

	protected override onStreamData(token: TDetailedToken): void {
		if (token instanceof LeftBracket && !this.current) {
			// TODO: @legomushroom - if `this.sequence`, re-emit the tokens
			this.current = new PartialMarkdownLinkCaption(token);

			return;
		}

		if (token instanceof Word && token.text.startsWith(FileReference.TOKEN_START) && !this.current) {
			// TODO: @legomushroom - if `this.sequence`, re-emit the tokens
			this.current = new PartialFileReference(token);

			return;
		}

		if (!this.current) {
			this.sequence.push(token);
			return;
		}

		try {
			const [result, tokenConsumed] = this.current.accept(token);
			if (result instanceof MarkdownLink || result instanceof FileReference) {
				delete this.current;
				this._onData.fire(result);

				if (!tokenConsumed) {
					this.onStreamData(token);
				}

				return;
			}

			this.current = result;
		} catch (error) {
			// TODO: @legomushroom - re-emit the tokens from `this.current`
		}

		// TOOD: @legomushroom - readd support for `#file:` references

		// // handle the word tokens only
		// if (!(token instanceof Word)) {
		// 	return;
		// }

		// // handle file references only for now
		// const { text } = token;
		// if (!text.startsWith(FileReference.TOKEN_START)) {
		// 	return;
		// }

		// this._onData.fire(
		// 	FileReference.fromWord(token),
		// );
	}
}
