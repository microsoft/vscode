/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../../base/common/uri.js';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Range } from '../../../../../editor/common/core/range.js';
import { newWriteableStream } from '../../../../../base/common/stream.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { FileReference } from '../../../../common/codecs/chatbotPromptCodec/tokens/fileReference.js';
import { ChatbotPromptCodec } from '../../../../common/codecs/chatbotPromptCodec/chatbotPromptCodec.js';

suite('ChatbotPromptCodec', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens', async () => {
		const testInput = '#file:/etc/hosts some text\t\n  for #file:./README.md\t testing\n ✔ purposes\n#file:LICENSE.md ✌ \t#file:.gitignore\n\n\n\t   #file:/Users/legomushroom/repos/vscode   ';

		// expected tokens for each of the sublines separated by the `\n` character
		const expectedTokens = [
			new FileReference(
				new Range(1, 1, 1, 1 + 16),
				'#file:/etc/hosts',
				URI.file('/etc/hosts'),
			),
			new FileReference(
				new Range(2, 7, 2, 7 + 17),
				'#file:./README.md',
				URI.file('./README.md'),
			),
			new FileReference(
				new Range(4, 1, 4, 1 + 16),
				'#file:LICENSE.md',
				URI.file('LICENSE.md'),
			),
			new FileReference(
				new Range(4, 21, 4, 21 + 16),
				'#file:.gitignore',
				URI.file('.gitignore'),
			),
			new FileReference(
				new Range(7, 5, 7, 5 + 38),
				'#file:/Users/legomushroom/repos/vscode',
				URI.file('/Users/legomushroom/repos/vscode'),
			),
		];

		// create the decoder from a binary stream
		const stream = newWriteableStream<VSBuffer>(null);
		const codec = testDisposables.add(new ChatbotPromptCodec());

		// write the data to the stream after a short delay to ensure
		// that the the data is sent after the reading loop below
		setTimeout(() => {
			stream.write(VSBuffer.fromString(testInput));
			stream.end();
		}, 1);

		// get all tokens in one go
		const tokens = await codec.decode(stream).consume();


		// validate the tokens that we received
		for (let i = 0; i < expectedTokens.length; i++) {
			const expectedToken = expectedTokens[i];
			const receivedToken = tokens[i];

			if (expectedToken instanceof FileReference) {
				assert(
					receivedToken instanceof FileReference,
					`Token '${i}' must be a FileReference, got '${receivedToken}'.`,
				);

				assert(
					receivedToken.equals(expectedToken),
					`Token '${i}' (FileReference) must be ${expectedToken}, got ${receivedToken}.`,
				);

				continue;
			}

			throw new Error('Must produce only `FileReference` tokens atm.');
		}

		stream.destroy();
	});
});
