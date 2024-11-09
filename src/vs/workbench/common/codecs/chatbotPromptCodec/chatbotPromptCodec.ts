/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ICodec } from '../types/ICodec.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { LinesDecoder } from '../linesCodec/linesDecoder.js';
import { SimpleDecoder } from '../simpleCodec/simpleDecoder.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { ReadableStream } from '../../../../base/common/stream.js';
import { ChatbotPromptDecoder, TChatbotPromptToken } from './chatbotPromptDecoder.js';

/**
 * TODO: @legomushroom
 */
export const todo = (message: string = 'TODO: implement this'): never => {
	throw new Error(`TODO: ${message}`);
};

/**
 * TODO: @legomushroom
 */
export const unimplemented = (message: string = 'Not implemented.'): never => {
	return todo(message);
};

/**
 * Codec that is capable to encode and decode syntax tokens of a AI chat bot prompt message.
 */
export class ChatbotPromptCodec extends Disposable implements ICodec<VSBuffer, TChatbotPromptToken> {
	public encode(_: ReadableStream<TChatbotPromptToken>): ReadableStream<VSBuffer> {
		return unimplemented('The `encode` method is not implemented.');
	}

	public decode(stream: ReadableStream<VSBuffer>): ChatbotPromptDecoder {
		// create the decoder instance as a chain of more trivial decoders
		const linesDecoder = this._register(new LinesDecoder(stream));
		const simpleDecoder = this._register(new SimpleDecoder(linesDecoder));
		const decoder = this._register(new ChatbotPromptDecoder(simpleDecoder));

		// register to child disposables and return the decoder instance
		return decoder;
	}
}
