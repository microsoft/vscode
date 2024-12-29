/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { FileReference } from './tokens/fileReference.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { ReadableStream } from '../../../../../../base/common/stream.js';
import { BaseDecoder } from '../../../../../../base/common/codecs/baseDecoder.js';
import { Word } from '../../../../../../editor/common/codecs/simpleCodec/tokens/word.js';
import { SimpleDecoder, TSimpleToken } from '../../../../../../editor/common/codecs/simpleCodec/simpleDecoder.js';

/**
 * Tokens handled by the `ChatPromptDecoder` decoder.
 */
export type TChatPromptToken = FileReference;

/**
 * Decoder for the common chatbot prompt message syntax.
 * For instance, the file references `#file:./path/file.md` are handled by this decoder.
 */
export class ChatPromptDecoder extends BaseDecoder<TChatPromptToken, TSimpleToken> {
	constructor(
		stream: ReadableStream<VSBuffer>,
	) {
		super(new SimpleDecoder(stream));
	}

	protected override onStreamData(simpleToken: TSimpleToken): void {
		// handle the word tokens only
		if (!(simpleToken instanceof Word)) {
			return;
		}

		// handle file references only for now
		const { text } = simpleToken;
		if (!text.startsWith(FileReference.TOKEN_START)) {
			return;
		}

		this._onData.fire(
			FileReference.fromWord(simpleToken),
		);
	}
}
