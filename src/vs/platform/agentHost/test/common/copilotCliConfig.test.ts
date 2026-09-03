/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotCliConfigKey, copilotCliConfigSchema, normalizeModelFamilyAlias, normalizeToolSearchDeferThreshold, resolveModelCapabilityOverrideField, type CopilotCliModelCapabilityOverrides } from '../../common/copilotCliConfig.js';
import { reasoningEffortLevels } from '../../common/reasoningEffort.js';

suite('copilotCliConfig', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('normalizeModelFamilyAlias accepts plausible model ids and rejects non-ids', () => {
		assert.deepStrictEqual(
			['claude-opus-4.8', 'openai/gpt-5', '', ' padded ', 'has\u0000nul', 'x'.repeat(129)].map(normalizeModelFamilyAlias),
			['claude-opus-4.8', 'openai/gpt-5', undefined, undefined, undefined, undefined]
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
			'*': { family: 'gpt-5', reasoningEffort: 'medium', promptOverrideString: 'systemPrompt: wildcard prompt' },
			'preview-model-x': { family: 'claude-opus-4.8', promptOverrideFile: '/prompts/specific.yaml' },
			'bad-model': { family: 42 as never },
		};
		const invalid: unknown[] = [];
		assert.deepStrictEqual(
			[
				// specific wins over the wildcard
				resolveModelCapabilityOverrideField(overrides, 'preview-model-x', 'family', isString),
				// unset specific field falls back to the wildcard
				resolveModelCapabilityOverrideField(overrides, 'preview-model-x', 'reasoningEffort', isString),
				// prompt overrides use the same specific-then-wildcard field resolution
				resolveModelCapabilityOverrideField(overrides, 'preview-model-x', 'promptOverrideString', isString),
				resolveModelCapabilityOverrideField(overrides, 'preview-model-x', 'promptOverrideFile', isString),
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
			['claude-opus-4.8', 'medium', 'systemPrompt: wildcard prompt', '/prompts/specific.yaml', 'gpt-5', 'gpt-5', undefined, undefined, undefined, [42]]
		);
	});

});
