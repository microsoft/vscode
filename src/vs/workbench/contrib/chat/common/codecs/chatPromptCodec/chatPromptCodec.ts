/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { ICodec } from '../../../../../../base/common/codecs/types/ICodec.js';
import { ChatPromptDecoder, TChatPromptToken } from './chatPromptDecoder.js';

/**
 * Codec that is capable to encode and decode syntax tokens of a AI chatbot prompt message.
 */
export class ChatPromptCodec extends Disposable implements ICodec<VSBuffer, TChatPromptToken> {
	public encode(_: ReadableStream<TChatPromptToken>): ReadableStream<VSBuffer> {
		throw new Error('The `encode` method is not implemented.');
	}

	public decode(stream: ReadableStream<VSBuffer>): ChatPromptDecoder {
		return this._register(new ChatPromptDecoder(stream));
	}
}
