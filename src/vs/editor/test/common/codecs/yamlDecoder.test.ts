/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TestDecoder } from '../utils/testDecoder.js';
import { VSBuffer } from '../../../../base/common/buffer.js';
import { newWriteableStream } from '../../../../base/common/stream.js';
import { YamlDecoder } from '../../../common/codecs/simpleYamlCodec/yamlDecoder.js';
import { TSimpleDecoderToken } from '../../../common/codecs/simpleCodec/simpleDecoder.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';

/**
 * TODO: @legomushroom
 */
export class TestSimpleYamlDecoder extends TestDecoder<TSimpleDecoderToken, YamlDecoder> {
	constructor() {
		const stream = newWriteableStream<VSBuffer>(null);
		const decoder = new YamlDecoder(stream);

		super(stream, decoder);
	}
}

suite('SimpleYamlDecoder', () => {
	const testDisposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('produces expected tokens #1', async () => {
		const test = testDisposables.add(
			new TestSimpleYamlDecoder(),
		);

		await test.run(
			[
				'just write: some yaml',
				'right here: or there',
			],
			[
				// first line
				// second line
			],
		);
	});
});
