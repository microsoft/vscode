/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { mock, upcastPartial } from '../../../../../../base/test/common/mock.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../base/test/common/virtualScheduling/index.js';
import { IAgentConnection, IAgentResolveSessionConfigParams } from '../../../../../../platform/agentHost/common/agentService.js';
import { CLOUD_SANDBOX_AGENT_PROVIDER } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { ResolveSessionConfigResult, SessionConfigPropertySchema } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { PolicyState, RootState, SessionModelInfo } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ContextKeyExpr } from '../../../../../../platform/contextkey/common/contextkey.js';
import { IConfigurationValue } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { ChatConfiguration } from '../../../common/constants.js';
import { createCloudSandboxContextTierSchema, createCloudSandboxDraftOptionGroups, createCloudSandboxSessionConfig, readCloudSandboxDraftConfig, resolveCloudSandboxSessionConfig, validateCloudSandboxModelConfig, withCloudSandboxDraftModelConfig } from '../../../browser/remoteAgentHost/cloudSandboxSessionConfig.js';

suite('CloudSandboxSessionConfig', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const imageGeneration: SessionConfigPropertySchema = { type: 'boolean', title: 'Image Generation', default: false, sessionMutable: false };

	test('maps named catalogue limits to context tiers without guessing missing sizes', () => {
		const property = createCloudSandboxContextTierSchema({ tokenPrices: { contextMax: 272_000, longContext: { contextMax: 922_000 } } });
		const missing = createCloudSandboxContextTierSchema({ tokenPrices: { contextMax: 1_000_000 } });
		const invalid = [0, -1, Infinity, NaN].map(contextMax => createCloudSandboxContextTierSchema({ tokenPrices: { contextMax, longContext: { contextMax: 922_000 } } }));
		assert.deepStrictEqual({
			values: property?.enum, labels: property?.enumLabels, default: property?.default, missing, invalid,
		}, {
			values: ['default', 'long_context'], labels: ['272K', '1M'], default: 'default', missing: undefined, invalid: [undefined, undefined, undefined, undefined],
		});
	});

	const model: SessionModelInfo = {
		id: 'opaque-model', provider: CLOUD_SANDBOX_AGENT_PROVIDER, name: 'Model',
		configSchema: { type: 'object', properties: { contextTier: { type: 'string', title: 'Host context', enum: ['default', 'long_context'], enumLabels: ['Standard', 'Extended'], default: 'default' } } },
	};

	test('draft fallback preserves supplied schemas and does not infer other providers or numeric limits', () => {
		const withoutSchema = { ...model, configSchema: undefined };
		const fallback = withCloudSandboxDraftModelConfig(withoutSchema);
		assert.deepStrictEqual({
			existing: withCloudSandboxDraftModelConfig(model) === model,
			foreign: withCloudSandboxDraftModelConfig({ ...withoutSchema, provider: 'other' }).configSchema,
			labels: fallback.configSchema?.properties.contextTier.enumLabels,
			sourceSchema: withoutSchema.configSchema,
		}, { existing: true, foreign: undefined, labels: ['Default', 'Long context'], sourceSchema: undefined });
	});

	function modelConnection(models?: readonly SessionModelInfo[]) {
		let root: RootState | undefined = models && { agents: [{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, displayName: 'Copilot', description: '', models: [...models] }] };
		const changed = store.add(new Emitter<RootState>());
		const connection = new class extends mock<IAgentConnection>() {
			override readonly rootState = upcastPartial<IAgentConnection['rootState']>({ get value() { return root; }, onDidChange: changed.event });
		}();
		return {
			connection, changed,
			update: (models: SessionModelInfo[]) => {
				root = { agents: [{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, displayName: 'Copilot', description: '', models }] };
				changed.fire(root);
			},
		};
	}

	test('waits for actual host metadata and preserves a supported draft context selection', async () => {
		const fixture = modelConnection();
		const values = Object.freeze({ contextTier: 'long_context' });
		const validating = validateCloudSandboxModelConfig(fixture.connection, model.id, values, CancellationToken.None);
		fixture.update([model]);
		await validating;
		assert.deepStrictEqual({ values, listening: fixture.changed.hasListeners() }, { values: { contextTier: 'long_context' }, listening: false });
	});

	for (const unavailable of [
		{ ...model, configSchema: undefined },
		{ ...model, configSchema: { type: 'object', properties: { contextTier: { type: 'string', title: 'Context', enum: ['default'] } } } },
		{ ...model, configSchema: { type: 'object', properties: { contextTier: { type: 'string', title: 'Context', enum: ['default', 'long_context'], readOnly: true } } } },
		{ ...model, provider: 'other' },
		{ ...model, policyState: PolicyState.Disabled },
	] satisfies SessionModelInfo[]) {
		test(`rejects draft context not offered by the host: ${JSON.stringify(unavailable)}`, async () => {
			const fixture = modelConnection([unavailable]);
			await assert.rejects(validateCloudSandboxModelConfig(fixture.connection, model.id, { contextTier: 'long_context' }, CancellationToken.None), /Your prompt was not sent/);
		});
	}

	test('cancels host model discovery without keeping listeners', async () => {
		const fixture = modelConnection();
		const source = store.add(new CancellationTokenSource());
		const validating = validateCloudSandboxModelConfig(fixture.connection, model.id, { contextTier: 'default' }, source.token);
		source.cancel();
		await assert.rejects(validating, isCancellationError);
		assert.strictEqual(fixture.changed.hasListeners(), false);
	});

	test('times out instead of dropping an unconfirmed draft context choice', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const fixture = modelConnection();
		await assert.rejects(validateCloudSandboxModelConfig(fixture.connection, model.id, { contextTier: 'long_context' }, CancellationToken.None), /Timed out.*Your prompt was not sent/);
		assert.strictEqual(fixture.changed.hasListeners(), false);
	}));

	for (const restricted of [false, true]) {
		test(`draft options preserve cloud values without duplicate generic pickers (restricted=${restricted})`, () => {
			const configuration = new class extends TestConfigurationService {
				override inspect<T>(key: string): IConfigurationValue<T> {
					const result = super.inspect<T>(key);
					return { ...result, policyValue: restricted && key === ChatConfiguration.GlobalAutoApprove ? result.value : undefined };
				}
			}({ [ChatConfiguration.GlobalAutoApprove]: false });
			store.add(configuration.onDidChangeConfigurationEmitter);
			const config = createCloudSandboxSessionConfig(configuration);
			const groups = createCloudSandboxDraftOptionGroups(config);
			const approvalGroup = groups.find(group => group.id === 'approvalMode')!;
			assert.deepStrictEqual({
				pickersVisible: groups.map(group => ContextKeyExpr.deserialize(group.when)?.evaluate({ getValue: () => undefined })),
				approvals: approvalGroup.items.map(item => ({ id: item.id, label: item.name, description: item.description })),
				defaults: readCloudSandboxDraftConfig(undefined, config),
				selected: readCloudSandboxDraftConfig(new Map([['mode', 'plan'], ['approvalMode', 'allow-all'], ['unrelated', 'ignored']]), config),
			}, {
				pickersVisible: [false, false],
				approvals: [
					{ id: 'manual', label: 'Manual permissions', description: 'Asks when approval settings don\'t apply' },
					...restricted ? [] : [
						{ id: 'assisted', label: 'Assisted permissions', description: 'Evaluates risk before running tools' },
						{ id: 'allow-all', label: 'Allow all', description: 'Runs tool calls without asking' },
					],
				],
				defaults: { mode: 'interactive', approvalMode: restricted ? 'manual' : 'assisted' },
				selected: { mode: 'plan', approvalMode: restricted ? 'manual' : 'allow-all' },
			});
		});
	}

	function createConfig(property?: SessionConfigPropertySchema): ResolveSessionConfigResult {
		return {
			schema: {
				type: 'object',
				properties: {
					mode: { type: 'string', title: 'Mode', enum: ['interactive', 'plan'], default: 'interactive' },
					...(property ? { imageGeneration: property } : {}),
				},
			},
			values: { mode: 'interactive', ...(property ? { imageGeneration: property.default ?? false } : {}) },
		};
	}

	function createConnection(
		config: ResolveSessionConfigResult,
		resolveConfig: IAgentConnection['resolveSessionConfig'] = async params => ({ schema: config.schema, values: { ...config.values, ...params.config } }),
	) {
		const requests: IAgentResolveSessionConfigParams[] = [];
		const connection = new class extends mock<IAgentConnection>() {
			override async resolveSessionConfig(params: IAgentResolveSessionConfigParams): Promise<ResolveSessionConfigResult> {
				requests.push(params);
				return resolveConfig(params);
			}
		}();
		return { connection, requests };
	}

	test('opts into advertised creation-only image generation without draft picks', async () => {
		const { connection, requests } = createConnection(createConfig(imageGeneration));
		const result = await resolveCloudSandboxSessionConfig(connection, {}, CancellationToken.None);
		assert.deepStrictEqual({ result, requests }, {
			result: { imageGeneration: true },
			requests: [
				{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: {} },
				{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: { imageGeneration: true } },
			],
		});
	});

	test('preserves draft picks without forwarding unrelated host defaults', async () => {
		const values = Object.freeze({ mode: 'plan' });
		const { connection, requests } = createConnection(createConfig(imageGeneration));
		const result = await resolveCloudSandboxSessionConfig(connection, values, CancellationToken.None);
		assert.deepStrictEqual({ result, values, requests }, {
			result: { mode: 'plan', imageGeneration: true },
			values: { mode: 'plan' },
			requests: [
				{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: { mode: 'plan' } },
				{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: { mode: 'plan', imageGeneration: true } },
			],
		});
	});

	for (const enabled of [false, true]) {
		test(`preserves an explicit image-generation selection of ${enabled}`, async () => {
			const { connection, requests } = createConnection(createConfig(imageGeneration));
			const values = { imageGeneration: enabled };
			const result = await resolveCloudSandboxSessionConfig(connection, values, CancellationToken.None);
			assert.deepStrictEqual({ result, requests }, {
				result: values,
				requests: [{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: values }],
			});
		});
	}

	const unavailableProperties: Record<string, SessionConfigPropertySchema | undefined> = {
		'not advertised': undefined,
		'read-only': { ...imageGeneration, readOnly: true },
		'not boolean': { type: 'string', title: 'Image Generation', default: 'disabled' },
		'excludes true': { ...imageGeneration, enum: [false] },
	};
	for (const [description, property] of Object.entries(unavailableProperties)) {
		test(`does not opt in when image generation is ${description}`, async () => {
			const { connection, requests } = createConnection(createConfig(property));
			const result = await resolveCloudSandboxSessionConfig(connection, { mode: 'plan' }, CancellationToken.None);
			assert.deepStrictEqual({ result, requests }, {
				result: { mode: 'plan' },
				requests: [{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: { mode: 'plan' } }],
			});
		});
	}

	test('does not forward an unadvertised image-generation value', async () => {
		const config = createConfig();
		config.values.imageGeneration = true;
		const { connection, requests } = createConnection(config);
		const result = await resolveCloudSandboxSessionConfig(connection, {}, CancellationToken.None);
		assert.deepStrictEqual({ result, requests }, {
			result: {},
			requests: [{ provider: CLOUD_SANDBOX_AGENT_PROVIDER, config: {} }],
		});
	});

	test('rejects an explicit opt-in when the host does not advertise it', async () => {
		const config = createConfig();
		const { connection } = createConnection(config, async () => config);
		await assert.rejects(resolveCloudSandboxSessionConfig(connection, { imageGeneration: true }, CancellationToken.None), /imageGeneration.*not writable/);
	});

	test('rejects an opt-in the host does not apply', async () => {
		const config = createConfig(imageGeneration);
		const { connection } = createConnection(config, async () => config);
		await assert.rejects(resolveCloudSandboxSessionConfig(connection, {}, CancellationToken.None), /could not apply the selected imageGeneration/);
	});

	test('rejects an opt-in withdrawn during confirmation', async () => {
		const config = createConfig(imageGeneration);
		const { connection } = createConnection(config, async params => params.config?.imageGeneration === true ? createConfig() : config);
		await assert.rejects(resolveCloudSandboxSessionConfig(connection, {}, CancellationToken.None), /imageGeneration.*not writable/);
	});

	test('propagates a host rejection of image generation', async () => {
		const config = createConfig(imageGeneration);
		const error = new Error('Image generation is unavailable');
		const { connection } = createConnection(config, async params => {
			if (params.config?.imageGeneration === true) {
				throw error;
			}
			return config;
		});
		await assert.rejects(resolveCloudSandboxSessionConfig(connection, {}, CancellationToken.None), candidate => candidate === error);
	});

	test('cancels while the host confirms the opt-in', async () => {
		const config = createConfig(imageGeneration);
		const confirming = new DeferredPromise<void>();
		const confirmed = new DeferredPromise<ResolveSessionConfigResult>();
		const source = store.add(new CancellationTokenSource());
		const { connection } = createConnection(config, async params => {
			if (params.config?.imageGeneration === true) {
				confirming.complete();
				return confirmed.p;
			}
			return config;
		});
		const pending = resolveCloudSandboxSessionConfig(connection, {}, source.token);
		try {
			await confirming.p;
			source.cancel();
			await assert.rejects(pending, isCancellationError);
		} finally {
			confirmed.complete(config);
		}
	});
});
