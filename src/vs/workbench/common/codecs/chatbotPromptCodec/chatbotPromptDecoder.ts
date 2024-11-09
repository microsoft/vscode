/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseDecoder } from '../baseDecoder.js';
import { Word } from '../simpleCodec/tokens/index.js';
import { FileReference } from './tokens/fileReference.js';
import { TSimpleToken } from '../simpleCodec/simpleDecoder.js';
import { Line } from '../linesCodec/tokens/line.js';

// Tokens handled by the `ChatbotPromptDecoder` decoder.
export type TChatbotPromptToken = FileReference;

/**
 * TODO: @legomushroom
 */
export class ChatbotPromptDecoder extends BaseDecoder<TChatbotPromptToken, TSimpleToken> {
	constructor(
		stream: BaseDecoder<TSimpleToken, Line>,
	) {
		super(stream);
	}


	public override start(): this {
		super.start();

		(this.stream as BaseDecoder<TSimpleToken>).start(); // TODO: @legomushroom - fix this

		return this;
	}

	/**
	 * TODO: @legomushroom
	 */
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
