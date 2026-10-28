/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { selectCachedModelVariant } from '../../node/localTranscriptionService.js';

suite('LocalTranscriptionService', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('selects a persisted model variant when catalog metadata selected an uncached variant', () => {
		const uncached = { id: 'model-cpu:2', isCached: false };
		const cached = { id: 'model-cpu:1', isCached: true };
		let selected = uncached;
		const model = {
			get isCached() { return selected.isCached; },
			variants: [uncached, cached],
			selectVariant: (variant: typeof uncached) => selected = variant,
		};

		selectCachedModelVariant(model);

		assert.strictEqual(selected.id, cached.id);
	});

	test('preserves the selected model variant when it is already cached', () => {
		const selected = { id: 'model-cpu:2', isCached: true };
		let selectionCount = 0;
		const model = {
			isCached: true,
			variants: [selected, { id: 'model-cpu:1', isCached: true }],
			selectVariant: () => selectionCount++,
		};

		selectCachedModelVariant(model);

		assert.strictEqual(selectionCount, 0);
	});
});
