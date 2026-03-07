/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { randomPort } from '../../common/ports.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('Ports', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('randomPort', () => {
		const t1 = Date.now();
		while (Date.now() - t1 < 50) {
			const port = randomPort();
			assert.ok(port >= 1025 && port <= 65535, `Port ${port} is out of bounds`);
			assert.ok(Number.isInteger(port), `Port ${port} is not an integer`);
		}
	});
});
