/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyModelFamilyAlias, resolveModelCapabilityOverride, type CopilotCliModelCapabilityOverrides } from '../../common/copilotCliConfig.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';

suite('copilotCliConfig', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applyModelFamilyAlias substitutes a usable alias and ignores everything else', () => {
		const model: ModelSelection = { id: 'preview-model-x', config: { thinkingLevel: 'high' } };
		assert.deepStrictEqual(
			[
				// usable alias: id substituted, picker config preserved
				applyModelFamilyAlias(model, { 'preview-model-x': { family: 'claude-opus-4-8' } }),
				// wildcard alias applies to any model; a specific entry wins over it
				applyModelFamilyAlias(model, { '*': { family: 'gpt-5' } }),
				applyModelFamilyAlias(model, { '*': { family: 'gpt-5' }, 'preview-model-x': { family: 'claude-opus-4-8' } }),
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
				{ id: 'gpt-5', config: { thinkingLevel: 'high' } },
				{ id: 'claude-opus-4-8', config: { thinkingLevel: 'high' } },
				model,
				model,
				model,
				model,
				undefined,
			]
		);
	});

	test('resolveModelCapabilityOverride merges the wildcard entry under the model entry field-by-field', () => {
		const overrides: CopilotCliModelCapabilityOverrides = {
			'*': { reasoningEffort: 'medium', excludedTools: ['mcp:*'] },
			'preview-model-x': { family: 'claude-opus-4-8', reasoningEffort: 'high' },
		};
		assert.deepStrictEqual(
			[
				// specific fields win, wildcard fills the gaps
				resolveModelCapabilityOverride(overrides, 'preview-model-x'),
				// only the wildcard matches
				resolveModelCapabilityOverride(overrides, 'other-model'),
				// no wildcard, exact match only
				resolveModelCapabilityOverride({ 'preview-model-x': { family: 'claude-opus-4-8' } }, 'preview-model-x'),
				// no entry at all / no overrides
				resolveModelCapabilityOverride({ 'preview-model-x': { family: 'claude-opus-4-8' } }, 'other-model'),
				resolveModelCapabilityOverride(undefined, 'preview-model-x'),
				// malformed (non-object) entries are ignored
				resolveModelCapabilityOverride({ 'preview-model-x': 'oops' as never, '*': 42 as never }, 'preview-model-x'),
			],
			[
				{ family: 'claude-opus-4-8', reasoningEffort: 'high', excludedTools: ['mcp:*'] },
				{ reasoningEffort: 'medium', excludedTools: ['mcp:*'] },
				{ family: 'claude-opus-4-8' },
				undefined,
				undefined,
				undefined,
			]
		);
	});
});
