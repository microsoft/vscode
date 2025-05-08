/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { ChatPromptDecoder, TChatPromptToken } from './chatPromptDecoder.js';
import { ICodec } from '../../../../../../base/common/codecs/types/ICodec.js';

/**
 * `ChatPromptCodec` type is a `ICodec<T, K>` with specific types for
 * stream messages and return types of the `encode`/`decode` functions.
 * @see {@link ICodec}
 */
interface IChatPromptCodec extends ICodec<VSBuffer, TChatPromptToken> {
	/**
	 * Decode a stream of `VSBuffer`s into a stream of `TChatPromptToken`s.
	 *
	 * @see {@link TChatPromptToken}
	 * @see {@link VSBuffer}
	 * @see {@link ChatPromptDecoder}
	 */
	decode: (value: ReadableStream<VSBuffer>) => ChatPromptDecoder;
}

/**
 * Codec that is capable to encode and decode tokens of an AI chatbot prompt message.
 */
export const ChatPromptCodec: IChatPromptCodec = Object.freeze({
	/**
	 * Encode a stream of `TChatPromptToken`s into a stream of `VSBuffer`s.
	 *
	 * @see {@link ReadableStream}
	 * @see {@link VSBuffer}
	 */
	encode: (_stream: ReadableStream<TChatPromptToken>): ReadableStream<VSBuffer> => {
		throw new Error('The `encode` method is not implemented.');
	},

	/**
	 * Decode a of `VSBuffer`s into a readable of `TChatPromptToken`s.
	 *
	 * @see {@link TChatPromptToken}
	 * @see {@link VSBuffer}
	 * @see {@link ChatPromptDecoder}
	 * @see {@link ReadableStream}
	 */
	decode: (stream: ReadableStream<VSBuffer>): ChatPromptDecoder => {
		return new ChatPromptDecoder(stream);
	},
});
