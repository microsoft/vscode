/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { createByokContextSizeConfigSchemaProperty, resolveByokContextSize } from '../../common/agentModelConfiguration.js';

suite('BYOK context size configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the selection, else the provider default, else the largest size', () => {
		const options = { values: [200_000, 968_000], default: 200_000 };
		assert.deepStrictEqual([
			resolveByokContextSize(options, 968_000),
			resolveByokContextSize(options, undefined),
			// A size the model no longer offers falls back to the default rather than passing through.
			resolveByokContextSize(options, 500_000),
			resolveByokContextSize({ values: [200_000, 968_000] }, undefined),
			// A default the model does not offer is ignored too.
			resolveByokContextSize({ values: [200_000, 968_000], default: 1 }, undefined),
			// Only finite, positive sizes count.
			resolveByokContextSize({ values: [NaN, -5, 0, Infinity] }, undefined),
			resolveByokContextSize({ values: [] }, 200_000),
			resolveByokContextSize(undefined, 200_000),
			// One size (or one distinct size) is no choice: no picker is offered, so no
			// budget is applied either, even when it is selected or the default.
			resolveByokContextSize({ values: [200_000], default: 200_000 }, 200_000),
			resolveByokContextSize({ values: [200_000, 200_000] }, undefined),
		], [968_000, 200_000, 200_000, 968_000, 968_000, undefined, undefined, undefined, undefined, undefined]);
	});

	test('synthesizes the picker from the provider display text, filling only what is missing', () => {
		const described = createByokContextSizeConfigSchemaProperty({
			values: [200_000, 968_000],
			labels: ['200K', '1M'],
			descriptions: ['Summarizes sooner', 'Longer sessions'],
			default: 968_000,
		});
		// A duplicate size collapses; a blank label is filled in like a missing one.
		const bare = createByokContextSizeConfigSchemaProperty({ values: [100_000, 968_000, 968_000], labels: ['', '1M', '1M'] });

		assert.deepStrictEqual([
			described && { enum: described.enum, enumLabels: described.enumLabels, enumDescriptions: described.enumDescriptions, default: described.default, type: described.type },
			bare && { enum: bare.enum, enumLabels: bare.enumLabels, enumDescriptions: bare.enumDescriptions, default: bare.default, type: bare.type },
			// Fewer than two distinct sizes is no choice.
			createByokContextSizeConfigSchemaProperty({ values: [128_000, 128_000] }),
			createByokContextSizeConfigSchemaProperty(undefined),
		], [
			{ enum: [200_000, 968_000], enumLabels: ['200K', '1M'], enumDescriptions: ['Summarizes sooner', 'Longer sessions'], default: 968_000, type: 'number' },
			{ enum: [100_000, 968_000], enumLabels: ['100K', '1M'], enumDescriptions: undefined, default: 968_000, type: 'number' },
			undefined,
			undefined,
		]);
	});
});
