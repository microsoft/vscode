/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyModelFamilyAlias } from '../../common/copilotCliConfig.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';

suite('copilotCliConfig', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applyModelFamilyAlias substitutes a usable alias and ignores everything else', () => {
		const model: ModelSelection = { id: 'preview-model-x', config: { thinkingLevel: 'high' } };
		assert.deepStrictEqual(
			[
				// usable alias: id substituted, picker config preserved
				applyModelFamilyAlias(model, { 'preview-model-x': { family: 'claude-opus-4-8' } }),
				// no overrides / override for another id / no usable family → unchanged
				applyModelFamilyAlias(model, undefined),
				applyModelFamilyAlias(model, { 'other-model': { family: 'claude-opus-4-8' } }),
				applyModelFamilyAlias(model, { 'preview-model-x': {} }),
				applyModelFamilyAlias(model, { 'preview-model-x': { family: '' } }),
				// no model → undefined
				applyModelFamilyAlias(undefined, { 'preview-model-x': { family: 'claude-opus-4-8' } }),
			],
			[
				{ id: 'claude-opus-4-8', config: { thinkingLevel: 'high' } },
				model,
				model,
				model,
				model,
				undefined,
			]
		);
	});
});
