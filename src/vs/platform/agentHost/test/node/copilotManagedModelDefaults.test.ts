/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { readAgentModelIsDefault } from '../../common/meta/agentModelDefaultMeta.js';
import { applyCopilotManagedModelPolicy, fetchCopilotManagedModelPolicy, readCopilotManagedModelPolicy } from '../../node/copilot/copilotManagedModelDefaults.js';

suite('copilotManagedModelDefaults', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const tierSchema = { type: 'object' as const, properties: { tier: { type: 'string' as const, title: 'Optimize for', default: 'balance', enum: ['efficiency', 'balance', 'intelligence'] } } };
	const models: readonly IAgentModelInfo[] = [
		{ provider: 'copilotcli', id: 'auto', name: 'Auto', supportsVision: false, configSchema: tierSchema },
		{ provider: 'copilotcli', id: 'gpt-5', name: 'GPT-5', supportsVision: true, _meta: { multiplierNumeric: 1 } },
		{ provider: 'openai', id: 'gpt-5', name: 'GPT-5 (BYOK)', supportsVision: true },
	];

	test('reads a well-formed model policy', () => {
		assert.deepStrictEqual(readCopilotManagedModelPolicy({
			resolved: {},
			modelPolicy: {
				model: { value: 'gpt-5', overridable: true, source: 'server' },
				autoTier: { value: 'efficiency', overridable: false, source: 'device' },
			},
		}), {
			model: { value: 'gpt-5', overridable: true, source: 'server' },
			autoTier: { value: 'efficiency', overridable: false, source: 'device' },
		});
	});

	test('ignores malformed results and entries', () => {
		for (const result of [
			undefined,
			null,
			'policy',
			[],
			{},
			{ modelPolicy: null },
			{ modelPolicy: [] },
			{ modelPolicy: { model: null, autoTier: [] } },
			{ modelPolicy: { model: { value: 42, overridable: true } } },
			{ modelPolicy: { model: { value: '', overridable: true } } },
			{ modelPolicy: { autoTier: { value: 'efficiency', overridable: 'no' } } },
		]) {
			assert.strictEqual(readCopilotManagedModelPolicy(result), undefined, JSON.stringify(result));
		}
		assert.deepStrictEqual(
			readCopilotManagedModelPolicy({ modelPolicy: { model: { value: 'gpt-5', overridable: true, source: 7 }, autoTier: { value: 1 } } }),
			{ model: { value: 'gpt-5', overridable: true, source: 'unknown' } },
		);
	});

	test('applies the Auto tier and default model to this provider only', () => {
		const result = applyCopilotManagedModelPolicy(models, {
			model: { value: 'gpt-5', overridable: true, source: 'server' },
			autoTier: { value: 'efficiency', overridable: false, source: 'server' },
		}, 'copilotcli');

		assert.deepStrictEqual({
			tier: result[0].configSchema?.properties.tier,
			defaults: result.map(model => readAgentModelIsDefault(model)),
			meta: result[1]._meta,
		}, {
			tier: { ...tierSchema.properties.tier, default: 'efficiency', readOnly: true },
			defaults: [false, true, false],
			meta: { multiplierNumeric: 1, isDefault: true },
		});
	});

	test('keeps the tier unlocked when overridable, and skips tiers the picker does not offer', () => {
		const overridable = applyCopilotManagedModelPolicy(models, { autoTier: { value: 'intelligence', overridable: true, source: 'server' } }, 'copilotcli');
		const unknown = applyCopilotManagedModelPolicy(models, { autoTier: { value: 'fast', overridable: false, source: 'server' } }, 'copilotcli');

		assert.deepStrictEqual(overridable[0].configSchema?.properties.tier, { ...tierSchema.properties.tier, default: 'intelligence' });
		assert.deepStrictEqual(unknown[0].configSchema?.properties.tier, tierSchema.properties.tier);
	});

	test('returns the models unchanged without a policy', () => {
		assert.strictEqual(applyCopilotManagedModelPolicy(models, undefined, 'copilotcli'), models);
	});

	test('fetches nothing from an SDK without managedSettings.get', async () => {
		assert.strictEqual(await fetchCopilotManagedModelPolicy({}, 'token'), undefined);
		assert.strictEqual(await fetchCopilotManagedModelPolicy({ managedSettings: {} }, 'token'), undefined);
	});

	test('fetches the policy for the given token', async () => {
		const requests: unknown[] = [];
		const rpc = {
			managedSettings: {
				get: async (params: unknown) => {
					requests.push(params);
					return { modelPolicy: { model: { value: 'gpt-5', overridable: true, source: 'server' } } };
				},
			},
		};

		assert.deepStrictEqual(await fetchCopilotManagedModelPolicy(rpc, 'token'), { model: { value: 'gpt-5', overridable: true, source: 'server' } });
		assert.deepStrictEqual(requests, [{ gitHubToken: 'token' }]);
	});
});
