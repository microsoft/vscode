/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import type { RootConfigState } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceCollection } from '../../../../../../platform/instantiation/common/serviceCollection.js';
import { NullLogService, ILogService } from '../../../../../../platform/log/common/log.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import type { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import type { ISessionsProvider } from '../../../../../services/sessions/common/sessionsProvider.js';
import { agentHostSettingsUri, AgentHostSettingsFileSystemProvider, AgentHostSettingsSchemaRegistrar } from '../../browser/agentHostSettingsFileSystemProvider.js';

const PROVIDER_ID = 'local-agent-host';

suite('AgentHostSettingsFileSystemProvider', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	interface ITestHarness {
		readonly fs: AgentHostSettingsFileSystemProvider;
		readonly uri: URI;
		readonly provider: IMockAgentHostSessionsProvider;
	}

	interface IMockAgentHostSessionsProvider extends IAgentHostSessionsProvider {
		config: RootConfigState | undefined;
		readonly onDidChangeRootConfigEmitter: Emitter<void>;
		readonly replaceCalls: Array<{ values: Record<string, unknown> }>;
	}

	function createHarness(
		initialConfig: RootConfigState | undefined,
		registerProvider = true,
	): ITestHarness {
		const onDidChangeRootConfigEmitter = store.add(new Emitter<void>());
		const replaceCalls: Array<{ values: Record<string, unknown> }> = [];

		const provider: IMockAgentHostSessionsProvider = {
			id: PROVIDER_ID,
			config: initialConfig,
			onDidChangeRootConfigEmitter,
			replaceCalls,
			onDidChangeRootConfig: onDidChangeRootConfigEmitter.event,
			getRootConfig: () => provider.config,
			replaceRootConfig: async (values: Record<string, unknown>) => {
				replaceCalls.push({ values });
				if (provider.config) {
					provider.config = {
						...provider.config,
						values: { ...values },
					};
				}
			},
		} as unknown as IMockAgentHostSessionsProvider;

		const onDidChangeProvidersEmitter = store.add(new Emitter<{ added: readonly ISessionsProvider[]; removed: readonly ISessionsProvider[] }>());
		const providersService: ISessionsProvidersService = {
			getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				if (registerProvider && providerId === PROVIDER_ID) {
					return provider as unknown as T;
				}
				return undefined;
			},
			getProviders: () => registerProvider ? [provider as unknown as ISessionsProvider] : [],
			onDidChangeProviders: onDidChangeProvidersEmitter.event,
		} as unknown as ISessionsProvidersService;

		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[ISessionsProvidersService, providersService],
			[ILogService, new NullLogService()],
		)));

		const schemaRegistrar = store.add(instantiationService.createInstance(AgentHostSettingsSchemaRegistrar));
		const fs = store.add(instantiationService.createInstance(AgentHostSettingsFileSystemProvider, schemaRegistrar));

		return { fs, uri: agentHostSettingsUri(PROVIDER_ID), provider };
	}

	test('readFile returns root config values as JSON', async () => {
		const { fs, uri } = createHarness({
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
				},
			},
			values: { autoApprove: 'default' },
		});

		const buf = await fs.readFile(uri);
		const text = VSBuffer.wrap(buf).toString();
		const jsonStart = text.indexOf('{');
		const parsed = JSON.parse(text.substring(jsonStart));
		assert.deepStrictEqual(parsed, { autoApprove: 'default' });
	});

	test('writeFile forwards the user\'s parsed JSON as the replace payload', async () => {
		const { fs, uri, provider } = createHarness({
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
					mode: { type: 'string', title: 'Mode', enum: ['a', 'b'] },
				},
			},
			values: { autoApprove: 'default', mode: 'a' },
		});

		const newContent = VSBuffer.fromString('// trailing comments ok\n{ "autoApprove": "autoApprove", "mode": "b", }\n').buffer;
		await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(provider.replaceCalls, [{
			values: { autoApprove: 'autoApprove', mode: 'b' },
		}]);
	});

	test('writeFile with unknown provider is a no-op (write ignored, change event still fires)', async () => {
		const { fs, uri } = createHarness(undefined, /*registerProvider*/ true);

		const events: URI[] = [];
		store.add(fs.onDidChangeFile(changes => {
			for (const c of changes) {
				events.push(c.resource);
			}
		}));

		const newContent = VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer;
		await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.strictEqual(events.length, 1);
	});

	test('onDidChangeFile fires when provider root config changes', async () => {
		const { fs, uri, provider } = createHarness({
			schema: { type: 'object', properties: {} },
			values: {},
		});

		const events: URI[] = [];
		const listeners = new DisposableStore();
		store.add(listeners);
		listeners.add(fs.onDidChangeFile(changes => {
			for (const c of changes) {
				events.push(c.resource);
			}
		}));
		const watch = fs.watch(uri, { recursive: false, excludes: [] });
		listeners.add(watch);

		provider.onDidChangeRootConfigEmitter.fire();

		assert.strictEqual(events.length, 1);
		assert.strictEqual(events[0].toString(), uri.toString());
	});

	test('readFile on unknown provider throws FileNotFound', async () => {
		const { fs, uri } = createHarness(undefined, /*registerProvider*/ false);

		await assert.rejects(async () => {
			await fs.readFile(uri);
		});
	});

	suite('schema registration', () => {
		const schemaRegistry = Registry.as<IJSONContributionRegistry>(JSONExtensions.JSONContribution);

		function expectedSchemaId(): string {
			return `vscode://schemas/agent-host-settings/${PROVIDER_ID}.jsonc`;
		}

		test('readFile lazily registers a schema + association for the provider', async () => {
			const { fs, uri } = createHarness({
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
					},
				},
				values: { autoApprove: 'default' },
			});
			const schemaId = expectedSchemaId();

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
			assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], undefined);

			await fs.readFile(uri);

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
			assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
		});

		test('schema is refreshed when onDidChangeRootConfig fires with a new schema identity', async () => {
			const { fs, uri, provider } = createHarness({
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default'] },
					},
				},
				values: { autoApprove: 'default' },
			});
			const schemaId = expectedSchemaId();

			await fs.readFile(uri);
			const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.ok(initial);

			provider.config = {
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', enum: ['default', 'autoApprove'] },
						mode: { type: 'string', title: 'Mode', enum: ['a', 'b'] },
					},
				},
				values: { autoApprove: 'default', mode: 'a' },
			};
			provider.onDidChangeRootConfigEmitter.fire();

			const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.notStrictEqual(refreshed, initial);
			assert.ok(refreshed.properties?.['mode'], 'refreshed schema should include the newly added property');
		});
	});
});
