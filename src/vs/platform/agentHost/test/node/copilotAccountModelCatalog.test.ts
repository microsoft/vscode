/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { toCopilotAccountModelCatalog } from '../../node/copilot/copilotAccountModelCatalog.js';

suite('Copilot account model catalog', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves the authenticated session catalog and does not synthesize Auto for no models', () => {
		const models = [{ id: 'm365-model', name: 'Model', capabilities: { supports: { vision: true } }, billing: { multiplier: 1 } }];
		assert.deepStrictEqual(toCopilotAccountModelCatalog({ list: models }), { models, auto: undefined });
		assert.throws(() => toCopilotAccountModelCatalog({ list: [] }), /no usable models/);
	});

	test('rejects malformed entries rather than publishing a partial catalog', () => {
		assert.throws(() => toCopilotAccountModelCatalog({
			list: [
				{ id: 'm365-model', name: 'Model', capabilities: {} },
				{ id: 'broken', name: 'Broken', capabilities: null },
			]
		}), /invalid account model/);
	});
});
