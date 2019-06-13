/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';

import * as stream from 'vs/base/node/stream';
import { getPathFromAmdModule } from 'vs/base/common/amd';

suite('Stream', () => {
	test('readToMatchingString - ANSI', async () => {
		const file = getPathFromAmdModule(require, './fixtures/file.css');

		const result = await stream.readToMatchingString(file, '\n', 10, 100);

		// \r may be present on Windows
		assert.equal(result!.replace('\r', ''), '/*---------------------------------------------------------------------------------------------');
	});

	test('readToMatchingString - empty', async () => {
		const file = getPathFromAmdModule(require, './fixtures/empty.txt');

		const result = await stream.readToMatchingString(file, '\n', 10, 100);
		assert.equal(result, null);
	});
});
