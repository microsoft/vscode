/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { isGpt56Model } from '../../node/copilot/modelIdentifiers.js';

suite('modelIdentifiers', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('identifies GPT-5.6 variants case-insensitively', () => {
		for (const id of ['gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna', 'GPT-5.6-SOL']) {
			assert.strictEqual(isGpt56Model(id), true, id);
		}
	});

	test('rejects other and absent model identifiers', () => {
		for (const id of ['gpt-5.5', 'gpt-5-6-luna', 'claude-sonnet-4.6', '']) {
			assert.strictEqual(isGpt56Model(id), false, id);
		}
		assert.strictEqual(isGpt56Model(undefined), false);
	});
});
