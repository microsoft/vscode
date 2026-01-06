/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { URI } from '../../../../../../../../../base/common/uri.js';
import { createTextModel } from '../../../../../../../../../editor/test/common/testTextModel.js';
import { randomTokens } from '../testUtils/randomTokens.js';
import { randomInt } from '../../../../../../../../../base/common/numbers.js';
import { assertDefined } from '../../../../../../../../../base/common/types.js';
import { randomBoolean } from '../../../../../../../../../base/test/common/testUtils.js';
import { CancellationTokenSource } from '../../../../../../../../../base/common/cancellation.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../../../base/test/common/utils.js';
import { arrayToGenerator, ObjectStream } from '../../../../../../common/promptSyntax/codecs/base/utils/objectStream.js';
import { objectStreamFromTextModel } from '../../../../../../common/promptSyntax/codecs/base/utils/objectStreamFromTextModel.js';
import { BaseToken } from '../../../../../../common/promptSyntax/codecs/base/baseToken.js';

suite('ObjectStream', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	suite('fromArray()', () => {
		test('sends objects in the array', async () => {
			const tokens = randomTokens();

			const stream = disposables.add(ObjectStream.fromArray(tokens));
			const receivedTokens = await consume(stream);

			assertTokensEqual(receivedTokens, tokens);
		});
	});

	suite('fromTextModel()', () => {
		test('sends data in text model', async () => {
			const initialContents = [
				'some contents',
				'with some line breaks',
				'and some more contents',
				'and even more contents',
			];

			// both line endings should yield the same results
			const lineEnding = (randomBoolean()) ? '\r\n' : '\n';

			const model = disposables.add(
				createTextModel(
					initialContents.join(lineEnding),
					'unknown',
					undefined,
					URI.file('/foo.js'),
				),
			);
			const stream = disposables.add(objectStreamFromTextModel(model));

			const receivedData = await consume(stream);

			assert.strictEqual(
				receivedData.join(''),
				initialContents.join(lineEnding),
				'Received data must be equal to the initial contents.',
			);
		});
	});

	suite('cancellation token', () => {
		test('can be cancelled', async () => {
			const initialContents = [
				'some contents',
				'with some line breaks',
				'and some more contents',
				'and even more contents',
				'some contents',
				'with some line breaks',
				'and some more contents',
				'and even more contents',
			];

			// both line endings should yield the same results
			const lineEnding = (randomBoolean()) ? '\r\n' : '\n';

			const model = disposables.add(
				createTextModel(
					initialContents.join(lineEnding),
					'unknown',
					undefined,
					URI.file('/foo.js'),
				),
			);

			const stopAtLine = randomInt(5, 2);
			const cancellation = disposables.add(new CancellationTokenSource());

			// override the `getLineContent` method to cancel the stream
			// when a specific line number is being read from the model
			const originalGetLineContent = model.getLineContent.bind(model);
			model.getLineContent = (lineNumber: number) => {
				// cancel the stream when we reach this specific line number
				if (lineNumber === stopAtLine) {
					cancellation.cancel();
				}

				return originalGetLineContent(lineNumber);
			};

			const stream = disposables.add(
				objectStreamFromTextModel(model, cancellation.token),
			);

			const receivedData = await consume(stream);
			const expectedData = initialContents
				.slice(0, stopAtLine - 1)
				.join(lineEnding);

			assert.strictEqual(
				receivedData.join(''),
				// because the stream is cancelled before the last line,
				// the last message always ends with the line ending
				expectedData + lineEnding,
				'Received data must be equal to the contents before cancel.',
			);
		});
	});

	suite('helpers', () => {
		suite('arrayToGenerator()', () => {
			test('sends tokens in the array', async () => {
				const tokens = randomTokens();
				const generator = arrayToGenerator(tokens);

				const receivedTokens = [];
				for (const token of generator) {
					receivedTokens.push(token);
				}

				assertTokensEqual(receivedTokens, tokens);
			});
		});
	});
});

/**
 * Asserts that two tokens lists are equal.
 */
function assertTokensEqual(
	receivedTokens: BaseToken[],
	expectedTokens: BaseToken[],
): void {
	for (let i = 0; i < expectedTokens.length; i++) {
		const receivedToken = receivedTokens[i];

		assertDefined(
			receivedToken,
			`Expected token #${i} to be '${expectedTokens[i]}', got 'undefined'.`,
		);

		assert.ok(
			expectedTokens[i].equals(receivedTokens[i]),
			`Expected token #${i} to be '${expectedTokens[i]}', got '${receivedToken}'.`,
		);
	}
}

/**
 * Consume a provided stream and return a list of received data objects.
 */
function consume<T extends object>(stream: ObjectStream<T>): Promise<T[]> {
	return new Promise((resolve, reject) => {
		const receivedData: T[] = [];
		stream.on('data', (token) => {
			receivedData.push(token);
		});

		stream.on('end', () => {
			resolve(receivedData);
		});
		stream.on('error', (error) => {
			reject(error);
		});
	});
}
