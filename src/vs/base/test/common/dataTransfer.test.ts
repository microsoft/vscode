/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { createStringDataTransferItem } from '../../common/dataTransfer.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from './utils.js';

suite('DataTransfer', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('createStringDataTransferItem', () => {
		test('resolves immediate string', async () => {
			const item = createStringDataTransferItem('hello');
			assert.strictEqual(item.value, 'hello');
			assert.strictEqual(await item.asString(), 'hello');
			assert.strictEqual(item.asFile(), undefined);
		});

		test('resolves async string promise', async () => {
			const item = createStringDataTransferItem(Promise.resolve('world'));
			assert.strictEqual(item.value, undefined);
			assert.strictEqual(await item.asString(), 'world');
			assert.strictEqual(item.asFile(), undefined);
		});
	});
});
