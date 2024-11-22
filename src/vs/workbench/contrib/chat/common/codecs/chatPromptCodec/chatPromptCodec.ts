/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { ICodec } from '../../../../../../base/common/codecs/types/ICodec.js';
import { ChatbotPromptDecoder, TChatbotPromptToken } from './chatPromptDecoder.js';

/**
 * Codec that is capable to encode and decode syntax tokens of a AI chat bot prompt message.
 */
export class ChatbotPromptCodec extends Disposable implements ICodec<VSBuffer, TChatbotPromptToken> {
	public encode(_: ReadableStream<TChatbotPromptToken>): ReadableStream<VSBuffer> {
		throw new Error('The `encode` method is not implemented.');
	}

	public decode(stream: ReadableStream<VSBuffer>): ChatbotPromptDecoder {
		return this._register(new ChatbotPromptDecoder(stream));
	}
}
