/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { applyModelFamilyAlias, CopilotCliConfigKey, copilotCliConfigSchema, normalizeToolSearchDeferThreshold, resolveModelCapabilityOverrideField, type CopilotCliModelCapabilityOverrides } from '../../common/copilotCliConfig.js';
import { reasoningEffortLevels } from '../../common/reasoningEffort.js';
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
				// an invalid specific field is ignored, so it cannot mask the wildcard
				applyModelFamilyAlias(model, { '*': { family: 'gpt-5' }, 'preview-model-x': { family: '' } }),
				// no overrides / override for another id / no usable family → unchanged
				applyModelFamilyAlias(model, undefined),
				applyModelFamilyAlias(model, { 'other-model': { family: 'claude-opus-4.8' } }),
				applyModelFamilyAlias(model, { 'preview-model-x': {} }),
				applyModelFamilyAlias(model, { 'preview-model-x': { family: '' } }),
				applyModelFamilyAlias(model, { 'preview-model-x': { family: ' padded ' } }),
				applyModelFamilyAlias(model, { 'preview-model-x': { family: 'has\u0000nul' } }),
				// the runtime owns which ids exist, so any plausible id shape passes
				applyModelFamilyAlias(model, { 'preview-model-x': { family: 'openai/gpt-5' } }),
				// no model: a wildcard family becomes the session model; a specific entry cannot match
				applyModelFamilyAlias(undefined, { '*': { family: 'gpt-5' } }),
				applyModelFamilyAlias(undefined, { 'preview-model-x': { family: 'claude-opus-4.8' } }),
			],
			[
				{ id: 'claude-opus-4.8', config: { thinkingLevel: 'high' } },
				{ id: 'gpt-5', config: { thinkingLevel: 'high' } },
				{ id: 'claude-opus-4.8', config: { thinkingLevel: 'high' } },
				{ id: 'gpt-5', config: { thinkingLevel: 'high' } },
				model,
				model,
				model,
				model,
				model,
				model,
				{ id: 'openai/gpt-5', config: { thinkingLevel: 'high' } },
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

	test('per-model reasoning effort schema uses the canonical effort levels', () => {
		const overrideSchema = copilotCliConfigSchema.definition[CopilotCliConfigKey.ModelCapabilityOverrides].protocol;
		assert.deepStrictEqual(
			overrideSchema.additionalProperties?.properties?.reasoningEffort?.enum,
			[...reasoningEffortLevels]
		);
	});

	test('resolveModelCapabilityOverrideField prefers a usable specific value, then the wildcard', () => {
		const isString = (value: unknown): value is string => typeof value === 'string';
		const overrides: CopilotCliModelCapabilityOverrides = {
			'*': { family: 'gpt-5', reasoningEffort: 'medium' },
			'preview-model-x': { family: 'claude-opus-4.8' },
			'bad-model': { family: 42 as never },
		};
		const invalid: unknown[] = [];
		assert.deepStrictEqual(
			[
				// specific wins over the wildcard
				resolveModelCapabilityOverrideField(overrides, 'preview-model-x', 'family', isString),
				// unset specific field falls back to the wildcard
				resolveModelCapabilityOverrideField(overrides, 'preview-model-x', 'reasoningEffort', isString),
				// an invalid specific value falls through instead of masking the wildcard
				resolveModelCapabilityOverrideField(overrides, 'bad-model', 'family', isString, value => invalid.push(value)),
				// no model id (server-side "Auto"): only the wildcard can match
				resolveModelCapabilityOverrideField(overrides, undefined, 'family', isString),
				// no matching entry / no overrides / malformed entries
				resolveModelCapabilityOverrideField({ 'preview-model-x': { family: 'claude-opus-4.8' } }, 'other-model', 'family', isString),
				resolveModelCapabilityOverrideField(undefined, 'preview-model-x', 'family', isString),
				resolveModelCapabilityOverrideField({ 'preview-model-x': 'oops' as never, '*': 42 as never }, 'preview-model-x', 'family', isString),
				invalid,
			],
			['claude-opus-4.8', 'medium', 'gpt-5', 'gpt-5', undefined, undefined, undefined, [42]]
		);
	});

});
