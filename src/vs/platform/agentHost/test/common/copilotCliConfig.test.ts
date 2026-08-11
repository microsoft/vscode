/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyModelFamilyAlias, normalizeToolSearchDeferThreshold, resolveModelCapabilityOverride, type CopilotCliModelCapabilityOverrides } from '../../common/copilotCliConfig.js';
import type { ModelSelection } from '../../common/state/protocol/state.js';

suite('copilotCliConfig', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('applyModelFamilyAlias substitutes a usable alias and ignores everything else', () => {
		const model: ModelSelection = { id: 'preview-model-x', config: { thinkingLevel: 'high' } };
		assert.deepStrictEqual(
			[
				// usable alias: id substituted, picker config preserved
				applyModelFamilyAlias(model, { 'preview-model-x': { family: 'claude-opus-4.8' } }),
				// wildcard alias applies to any model; a specific entry wins over it
				applyModelFamilyAlias(model, { '*': { family: 'gpt-5' } }),
				applyModelFamilyAlias(model, { '*': { family: 'gpt-5' }, 'preview-model-x': { family: 'claude-opus-4.8' } }),
				// no overrides / override for another id / no usable family → unchanged
				applyModelFamilyAlias(model, undefined),
				applyModelFamilyAlias(model, { 'other-model': { family: 'claude-opus-4.8' } }),
				applyModelFamilyAlias(model, { 'preview-model-x': {} }),
				applyModelFamilyAlias(model, { 'preview-model-x': { family: '' } }),
				applyModelFamilyAlias(model, { 'preview-model-x': { family: 'not a model id' } }),
				applyModelFamilyAlias(model, { 'preview-model-x': { family: 'claude-' } }),
				// no model: a wildcard family becomes the session model; a specific entry cannot match
				applyModelFamilyAlias(undefined, { '*': { family: 'gpt-5' } }),
				applyModelFamilyAlias(undefined, { 'preview-model-x': { family: 'claude-opus-4.8' } }),
			],
			[
				{ id: 'claude-opus-4.8', config: { thinkingLevel: 'high' } },
				{ id: 'gpt-5', config: { thinkingLevel: 'high' } },
				{ id: 'claude-opus-4.8', config: { thinkingLevel: 'high' } },
				model,
				model,
				model,
				model,
				model,
				model,
				{ id: 'gpt-5' },
				undefined,
			]
		);
	});

	test('normalizeToolSearchDeferThreshold floors valid values and defaults invalid values', () => {
		assert.deepStrictEqual(
			[5.9, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, undefined].map(normalizeToolSearchDeferThreshold),
			[5, 0, 1, 1, 1, 1]
		);
	});

	test('resolveModelCapabilityOverride merges the wildcard entry under the model entry field-by-field', () => {
		const overrides: CopilotCliModelCapabilityOverrides = {
			'*': { reasoningEffort: 'medium', excludedTools: ['mcp:*'] },
			'preview-model-x': { family: 'claude-opus-4.8', reasoningEffort: 'high' },
		};
		assert.deepStrictEqual(
			[
				// specific fields win, wildcard fills the gaps
				resolveModelCapabilityOverride(overrides, 'preview-model-x'),
				// only the wildcard matches
				resolveModelCapabilityOverride(overrides, 'other-model'),
				// no wildcard, exact match only
				resolveModelCapabilityOverride({ 'preview-model-x': { family: 'claude-opus-4.8' } }, 'preview-model-x'),
				// no entry at all / no overrides
				resolveModelCapabilityOverride({ 'preview-model-x': { family: 'claude-opus-4.8' } }, 'other-model'),
				resolveModelCapabilityOverride(undefined, 'preview-model-x'),
				// no model id (server-side "Auto"): only the wildcard can match
				resolveModelCapabilityOverride(overrides, undefined),
				resolveModelCapabilityOverride({ 'preview-model-x': { family: 'claude-opus-4.8' } }, undefined),
				// malformed (non-object) entries are ignored
				resolveModelCapabilityOverride({ 'preview-model-x': 'oops' as never, '*': 42 as never }, 'preview-model-x'),
			],
			[
				{ family: 'claude-opus-4.8', reasoningEffort: 'high', excludedTools: ['mcp:*'] },
				{ reasoningEffort: 'medium', excludedTools: ['mcp:*'] },
				{ family: 'claude-opus-4.8' },
				undefined,
				undefined,
				{ reasoningEffort: 'medium', excludedTools: ['mcp:*'] },
				undefined,
				undefined,
			]
		);
	});

	test('resolveModelCapabilityOverride merges modelCapabilities field-by-field', () => {
		const overrides: CopilotCliModelCapabilityOverrides = {
			'*': { modelCapabilities: { supports: { vision: true } } },
			'preview-model-x': { reasoningEffort: 'high' },
		};
		assert.deepStrictEqual(
			[
				// specific reasoningEffort wins, wildcard modelCapabilities fills the gap
				resolveModelCapabilityOverride(overrides, 'preview-model-x'),
				// only the wildcard matches
				resolveModelCapabilityOverride(overrides, 'other-model'),
				// a specific modelCapabilities entry wins over the wildcard's
				resolveModelCapabilityOverride({
					...overrides,
					'preview-model-x': { ...overrides['preview-model-x'], modelCapabilities: { limits: { max_context_window_tokens: 64000 } } },
				}, 'preview-model-x'),
			],
			[
				{ reasoningEffort: 'high', modelCapabilities: { supports: { vision: true } } },
				{ modelCapabilities: { supports: { vision: true } } },
				{ reasoningEffort: 'high', modelCapabilities: { limits: { max_context_window_tokens: 64000 } } },
			]
		);
	});

});
