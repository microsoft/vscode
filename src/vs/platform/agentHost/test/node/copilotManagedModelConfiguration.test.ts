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
import { omitCopilotManagedModelDefaults, projectCopilotManagedModelConfiguration } from '../../node/copilot/copilotManagedModelConfiguration.js';

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
