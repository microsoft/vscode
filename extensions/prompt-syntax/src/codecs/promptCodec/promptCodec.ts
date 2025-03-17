/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodec } from '../types';
import { VSBuffer, type ReadableStream } from '../../utils/vscode';
import { PromptDecoder, TPromptToken } from './promptDecoder';

/**
 * `PromptCodec` type is a `ICodec<T, K>` with specific types for
 * stream messages and return types of the `encode`/`decode` functions.
 * @see {@linkcode ICodec}
 */
interface IPromptCodec extends ICodec<VSBuffer, TPromptToken> {
	/**
	 * Decode a stream of `VSBuffer`s into a stream of `TPromptToken`s.
	 *
	 * @see {@linkcode TPromptToken}
	 * @see {@linkcode VSBuffer}
	 * @see {@linkcode PromptDecoder}
	 */
	decode: (value: ReadableStream<VSBuffer>) => PromptDecoder;
}

/**
 * Codec that is capable to encode and decode tokens of an AI chatbot prompt message.
 */
export const PromptCodec: IPromptCodec = Object.freeze({
	/**
	 * Encode a stream of `TPromptToken`s into a stream of `VSBuffer`s.
	 *
	 * @see {@linkcode ReadableStream}
	 * @see {@linkcode VSBuffer}
	 */
	encode: (_stream: ReadableStream<TPromptToken>): ReadableStream<VSBuffer> => {
		throw new Error('The `encode` method is not implemented.');
	},

	/**
	 * Decode a of `VSBuffer`s into a readable of `TPromptToken`s.
	 *
	 * @see {@linkcode TPromptToken}
	 * @see {@linkcode VSBuffer}
	 * @see {@linkcode PromptDecoder}
	 * @see {@linkcode ReadableStream}
	 */
	decode: (stream: ReadableStream<VSBuffer>): PromptDecoder => {
		return new PromptDecoder(stream);
	},
});
