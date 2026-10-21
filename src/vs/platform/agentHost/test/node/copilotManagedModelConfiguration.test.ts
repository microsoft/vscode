/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import type { IAgentModelInfo } from '../../common/agent.js';
import { modelConfigurationSourceKey } from '../../common/agentModelConfiguration.js';
import { readAgentManagedModelDefaults, readAgentModelConfigurationDefaults } from '../../common/meta/agentModelConfigurationMeta.js';
import { withAgentModelAutoTiersMeta } from '../../common/meta/agentModelMeta.js';
import { omitCopilotManagedModelDefaults, projectCopilotManagedModelConfiguration, type CopilotManagedModelPolicy } from '../../node/copilot/copilotManagedModelConfiguration.js';

suite('Copilot managed model configuration', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	const model: IAgentModelInfo = {
		provider: 'copilotcli', id: 'gpt-5', name: 'GPT', supportsVision: false,
		configSchema: {
			type: 'object',
			properties: {
				thinkingLevel: { type: 'string', title: 'Effort', enum: ['low', 'high'], default: 'low' },
				contextSize: { type: 'number', title: 'Context', enum: [200_000, 1_000_000], default: 200_000 },
			},
		},
	};

	test('projects server-shaped model defaults without inferring read-only state from composition metadata', () => {
		const result = projectCopilotManagedModelConfiguration(model, {
			values: { model: 'gpt-5', effortLevel: 'high', contextTier: 'long_context' },
			meta: { effortLevel: { source: 'server', overridable: false }, contextTier: { source: 'server', overridable: true } },
		}, new NullLogService());
		assert.deepStrictEqual({
			properties: result.configSchema?.properties,
			keys: readAgentModelConfigurationDefaults(result),
			managed: readAgentManagedModelDefaults(result),
			originalDefault: model.configSchema?.properties.thinkingLevel.default,
		}, {
			properties: {
				thinkingLevel: { type: 'string', title: 'Effort', enum: ['low', 'high'], default: 'high' },
				contextSize: { type: 'number', title: 'Context', enum: [200_000, 1_000_000], default: 1_000_000 },
			},
			keys: ['thinkingLevel', 'contextSize'],
			managed: { model: true, keys: ['thinkingLevel', 'contextSize'] },
			originalDefault: 'low',
		});
	});

	test('unavailable models and unresolved aliases never transfer their options to another model', () => {
		assert.deepStrictEqual(['unavailable-model', 'gpt', 'auto'].map(id => projectCopilotManagedModelConfiguration(model, {
			values: { model: id, effortLevel: 'high', contextTier: 'long_context' },
			meta: { effortLevel: { source: 'server', overridable: false }, contextTier: { source: 'server', overridable: false } },
		}, new NullLogService()).configSchema), [model.configSchema, model.configSchema, model.configSchema]);
	});

	test('unsupported efforts do not replace an offered picker default and are diagnosed', () => {
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const result = projectCopilotManagedModelConfiguration(model, {
			values: { model: model.id, effortLevel: 'unsupported-effort' },
			meta: { effortLevel: { source: 'server', overridable: false } },
		}, log);
		assert.deepStrictEqual({ schema: result.configSchema, warnings }, {
			schema: model.configSchema,
			warnings: ['[Copilot] Managed model option \'thinkingLevel\' is not offered by the selected model; leaving its picker unchanged.'],
		});
	});

	test('a managed model without options still advertises its startup preference', () => {
		const plain: IAgentModelInfo = { provider: 'copilotcli', id: 'plain', name: 'Plain', supportsVision: false };
		const projected = projectCopilotManagedModelConfiguration(plain, { values: { model: 'plain', effortLevel: 'high' } }, new NullLogService());
		assert.deepStrictEqual({ defaults: readAgentManagedModelDefaults(projected), schema: projected.configSchema }, {
			defaults: { model: true, keys: [] }, schema: undefined,
		});
	});

	test('a bare server Auto default leaves the tier picker editable', () => {
		const auto: IAgentModelInfo = {
			provider: 'copilotcli', id: 'auto', name: 'Auto', supportsVision: false,
			configSchema: { type: 'object', properties: { tier: { type: 'string', title: 'Optimize for', enum: ['balance', 'intelligence'], default: 'balance' } } },
		};
		const result = projectCopilotManagedModelConfiguration(auto, {
			values: { autoTier: 'intelligence' }, meta: { autoTier: { source: 'device', overridable: false } },
		}, new NullLogService());
		assert.deepStrictEqual(result.configSchema?.properties.tier, {
			type: 'string', title: 'Optimize for', enum: ['balance', 'intelligence'], default: 'intelligence',
		});
	});

	test('a configured Fusion tier supersedes legacy Auto policy and resolves to the runtime\'s offered routing tier', () => {
		const auto = (offered: string[], bindings?: Record<string, string>): IAgentModelInfo => ({
			provider: 'copilotcli', id: 'auto', name: 'Auto', supportsVision: false,
			configSchema: { type: 'object', properties: { tier: { type: 'string', title: 'Optimize for', enum: offered, default: 'balance' } } },
			...(bindings ? { _meta: withAgentModelAutoTiersMeta(undefined, { tiers: offered.map(id => ({ id, label: id, enabled: true, ...(bindings[id] ? { fusionTier: bindings[id] } : {}) })) }) } : {}),
		});
		const builtIn = auto(['efficiency', 'balance', 'intelligence']);
		const dynamic = auto(['balance', 'intelligence', 'hydrafusion', 'hydrafusion-max']);
		// Server-delivered documents carry plain values rather than authoring wrappers.
		const policy = (settings: { [key: string]: string } | undefined, values: CopilotManagedModelPolicy['values']): CopilotManagedModelPolicy => ({ ...(settings ? { layers: [{ source: 'server', settings }] } : {}), values });
		const warnings: string[] = [];
		const log = new class extends NullLogService {
			override warn(message: string): void { warnings.push(message); }
		}();
		const cases: [string, IAgentModelInfo, CopilotManagedModelPolicy][] = [
			['legacy alias', builtIn, policy({ autoTier: 'efficiency' }, { autoTier: 'efficiency', fusionTier: 'standard' })],
			['Fusion over legacy', builtIn, policy({ autoTier: 'intelligence', fusionTier: 'standard' }, { autoTier: 'intelligence', fusionTier: 'standard' })],
			['older runtime ignoring Fusion', builtIn, policy({ autoTier: 'intelligence', fusionTier: 'standard' }, { autoTier: 'intelligence' })],
			['High without HydraFusion', builtIn, policy({ fusionTier: 'high' }, { fusionTier: 'high' })],
			['High with HydraFusion', dynamic, policy({ fusionTier: 'high' }, { fusionTier: 'high' })],
			['catalog binding', auto(['balance', 'intelligence', 'fusion-high'], { 'fusion-high': 'high' }), policy({ fusionTier: 'high' }, { fusionTier: 'high' })],
			['Max with HydraFusion Max', dynamic, policy({ fusionTier: 'max' }, { fusionTier: 'max' })],
			['Max without HydraFusion Max', builtIn, policy({ fusionTier: 'max' }, { fusionTier: 'max' })],
			['unmanaged withdraws legacy', builtIn, policy({ fusionTier: 'unmanaged', autoTier: 'intelligence' }, { autoTier: 'intelligence', fusionTier: 'unmanaged' })],
			['no layers', builtIn, policy(undefined, { fusionTier: 'high' })],
		];
		assert.deepStrictEqual({
			results: Object.fromEntries(cases.map(([name, model, managed]) => {
				const projected = projectCopilotManagedModelConfiguration(model, managed, log);
				return [name, {
					default: projected.configSchema?.properties.tier.default,
					managed: readAgentManagedModelDefaults(projected)?.keys ?? [],
					omitsImplicit: omitCopilotManagedModelDefaults({ id: 'auto', config: { tier: 'balance', [modelConfigurationSourceKey('tier')]: 'default' } }, managed).config?.tier === undefined,
				}];
			})),
			warnings,
		}, {
			results: {
				'legacy alias': { default: 'efficiency', managed: ['tier'], omitsImplicit: true },
				'Fusion over legacy': { default: 'balance', managed: ['tier'], omitsImplicit: true },
				'older runtime ignoring Fusion': { default: 'intelligence', managed: ['tier'], omitsImplicit: true },
				'High without HydraFusion': { default: 'intelligence', managed: ['tier'], omitsImplicit: true },
				'High with HydraFusion': { default: 'hydrafusion', managed: ['tier'], omitsImplicit: true },
				'catalog binding': { default: 'fusion-high', managed: ['tier'], omitsImplicit: true },
				'Max with HydraFusion Max': { default: 'hydrafusion-max', managed: ['tier'], omitsImplicit: true },
				'Max without HydraFusion Max': { default: 'balance', managed: [], omitsImplicit: true },
				'unmanaged withdraws legacy': { default: 'balance', managed: [], omitsImplicit: false },
				'no layers': { default: 'intelligence', managed: ['tier'], omitsImplicit: true },
			},
			warnings: ['[Copilot] Managed model option \'tier\' is not offered by the selected model; leaving its picker unchanged.'],
		});
	});

	test('omits only managed implicit options and preserves explicit, legacy and unrelated choices', () => {
		const policy = { values: { model: 'gpt-5', effortLevel: 'high', contextTier: 'long_context' as const } };
		const configurations = ['default', 'managed', 'explicit', undefined].map(source => ({
			thinkingLevel: 'low', contextSize: 200_000, ...(source ? { [modelConfigurationSourceKey('thinkingLevel')]: source, [modelConfigurationSourceKey('contextSize')]: source } : {}),
		}));
		assert.deepStrictEqual({
			managed: configurations.map(config => omitCopilotManagedModelDefaults({ id: 'gpt-5', config }, policy)?.config),
			unmanaged: omitCopilotManagedModelDefaults({ id: 'gpt-5', config: configurations[0] }, {})?.config,
			otherModel: omitCopilotManagedModelDefaults({ id: 'other', config: configurations[0] }, policy)?.config,
		}, {
			managed: [
				{ [modelConfigurationSourceKey('thinkingLevel')]: 'default', [modelConfigurationSourceKey('contextSize')]: 'default' },
				{ [modelConfigurationSourceKey('thinkingLevel')]: 'managed', [modelConfigurationSourceKey('contextSize')]: 'managed' },
				configurations[2], configurations[3],
			],
			unmanaged: configurations[0],
			otherModel: configurations[0],
		});
	});
});
