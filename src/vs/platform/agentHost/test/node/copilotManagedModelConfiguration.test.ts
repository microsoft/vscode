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
import { createCopilotModelConfigurationReport, getCopilotManagedAutoPreference, omitCopilotManagedModelDefaults, projectCopilotManagedModelConfiguration, withCopilotAutoTierMetadata } from '../../node/copilot/copilotManagedModelConfiguration.js';

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

	const auto: IAgentModelInfo = {
		provider: 'copilotcli', id: 'auto', name: 'Auto', supportsVision: false,
		configSchema: { type: 'object', properties: { tier: { type: 'string', title: 'Optimize for', enum: ['efficiency', 'balance', 'intelligence'], default: 'balance' } } },
	};

	const autoMetadata = {
		defaultTier: 'balance',
		tiers: ['balance', 'high', 'max'].map(id => ({ id, displayName: id, description: `${id} description`, type: 'auto', status: { enabled: true } })),
	};

	test('prefers resolved Ensemble policy, including unmanaged, over the legacy Auto value', () => {
		const policies = (['balance', 'high', 'max', 'unmanaged', undefined] as const).map(ensembleTier => ({
			values: { autoTier: 'efficiency', ...(ensembleTier ? { ensembleTier } : {}) },
		}));
		assert.deepStrictEqual(policies.map(policy => getCopilotManagedAutoPreference(policy)), ['balance', 'high', 'max', undefined, 'efficiency']);
	});

	test('response-only Ensemble aliases preserve the original legacy execution preference', () => {
		const policy = {
			values: { autoTier: 'intelligence', ensembleTier: 'high' } as const,
			layers: [{ source: 'server', settings: { autoTier: 'intelligence' } }],
		};
		const report = createCopilotModelConfigurationReport([auto], policy, {
			modelId: 'auto', autoTier: 'intelligence',
		}, { id: 'auto', config: { tier: 'intelligence', [modelConfigurationSourceKey('tier')]: 'explicit' } }, new NullLogService(), autoMetadata);
		assert.deepStrictEqual({
			legacyPreference: getCopilotManagedAutoPreference(policy),
			nativeDefault: getCopilotManagedAutoPreference(policy, ['balance', 'high', 'max']),
			choices: report.models.auto.choices?.tier.values,
			current: report.current?.config,
		}, {
			legacyPreference: 'intelligence', nativeDefault: 'high',
			choices: ['balance', 'high', 'max', 'intelligence'],
			current: { tier: 'intelligence', [modelConfigurationSourceKey('tier')]: 'explicit' },
		});
	});

	test('projects only enabled runtime Auto tiers and preserves an older runtime schema', () => {
		const projected = withCopilotAutoTierMetadata(auto, {
			...autoMetadata,
			tiers: [
				...autoMetadata.tiers.map(tier => ({ ...tier, status: { enabled: tier.id !== 'max' } })),
				{ id: 'other-execution', displayName: 'Other', description: '', type: 'ensemble', status: { enabled: true } },
			],
		});
		assert.deepStrictEqual({ schema: projected.configSchema, legacy: withCopilotAutoTierMetadata(auto, undefined) }, {
			schema: {
				type: 'object', properties: {
					tier: {
						type: 'string', title: 'Optimize for', enum: ['balance', 'high'], default: 'balance',
						enumLabels: ['balance', 'high'], enumDescriptions: ['balance description', 'high description'],
					}
				}
			},
			legacy: auto,
		});
	});

	test('applies an editable Ensemble default only when the runtime offers it', () => {
		const policy = { values: { autoTier: 'efficiency', ensembleTier: 'max' } } as const;
		const available = projectCopilotManagedModelConfiguration(withCopilotAutoTierMetadata(auto, autoMetadata), policy, new NullLogService());
		const unavailable = projectCopilotManagedModelConfiguration(withCopilotAutoTierMetadata(auto, {
			...autoMetadata, tiers: autoMetadata.tiers.filter(tier => tier.id === 'balance'),
		}), policy, new NullLogService());
		const implicit = { id: 'auto', config: { tier: 'balance', [modelConfigurationSourceKey('tier')]: 'default' } };
		assert.deepStrictEqual({
			available: { tier: available.configSchema?.properties.tier.default, managed: readAgentManagedModelDefaults(available), readOnly: available.configSchema?.properties.tier.readOnly },
			unavailable: { tier: unavailable.configSchema?.properties.tier.default, managed: readAgentManagedModelDefaults(unavailable) },
			implicit: omitCopilotManagedModelDefaults(implicit, policy, ['balance', 'high', 'max']).config,
			unavailableImplicit: omitCopilotManagedModelDefaults(implicit, policy, ['balance']).config,
			explicit: omitCopilotManagedModelDefaults({ id: 'auto', config: { tier: 'balance', [modelConfigurationSourceKey('tier')]: 'explicit' } }, policy, ['balance', 'max']).config,
		}, {
			available: { tier: 'max', managed: { model: false, keys: ['tier'] }, readOnly: undefined },
			unavailable: { tier: 'balance', managed: undefined },
			implicit: { [modelConfigurationSourceKey('tier')]: 'default' },
			unavailableImplicit: implicit.config,
			explicit: { tier: 'balance', [modelConfigurationSourceKey('tier')]: 'explicit' },
		});
	});

	test('uses the exact session tier catalog and reports the applied native tier', () => {
		const policy = { values: { ensembleTier: 'high', model: 'auto' } } as const;
		const report = createCopilotModelConfigurationReport([auto], policy, {
			modelId: 'auto', autoTier: 'max',
		}, { id: 'auto', config: { tier: 'max', [modelConfigurationSourceKey('tier')]: 'explicit' } }, new NullLogService(), autoMetadata);
		assert.deepStrictEqual(report, {
			models: {
				auto: {
					defaults: { tier: 'high' }, readOnly: [],
					choices: { tier: { values: ['balance', 'high', 'max'], labels: ['balance', 'high', 'max'], descriptions: autoMetadata.tiers.map(tier => tier.description) } },
					managedDefaults: ['tier'],
				}
			},
			current: { id: 'auto', config: { tier: 'max', [modelConfigurationSourceKey('tier')]: 'explicit' } },
		});
	});

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
