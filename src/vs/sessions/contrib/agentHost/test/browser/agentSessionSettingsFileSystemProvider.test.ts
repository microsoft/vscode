/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { VSBuffer } from '../../../../../base/common/buffer.js';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import type { IResolveSessionConfigResult } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import { Extensions as JSONExtensions, IJSONContributionRegistry } from '../../../../../platform/jsonschemas/common/jsonContributionRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import type { IAgentHostSessionsProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import type { ISession } from '../../../../services/sessions/common/session.js';
import type { ISessionsProvider } from '../../../../services/sessions/common/sessionsProvider.js';
import { agentSessionSettingsUri, AgentSessionSettingsFileSystemProvider, AgentSessionSettingsSchemaRegistrar } from '../../browser/agentSessionSettingsFileSystemProvider.js';

const PROVIDER_ID = 'local-agent-host';
const RESOURCE_SCHEME = 'agent-host-copilot';
const RAW_ID = 'abc-123';

suite('AgentSessionSettingsFileSystemProvider', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createSession(): ISession {
		const resource = URI.from({ scheme: RESOURCE_SCHEME, path: `/${RAW_ID}` });
		return {
			sessionId: `${PROVIDER_ID}:${resource.toString()}`,
			resource,
			providerId: PROVIDER_ID,
		} as unknown as ISession;
	}

	interface ITestHarness {
		readonly fs: AgentSessionSettingsFileSystemProvider;
		readonly session: ISession;
		readonly uri: URI;
		readonly sessionProvider: IMockAgentHostSessionsProvider;
	}

	interface IMockAgentHostSessionsProvider extends IAgentHostSessionsProvider {
		config: IResolveSessionConfigResult | undefined;
		readonly onDidChangeSessionConfigEmitter: Emitter<string>;
		readonly onDidChangeSessionsEmitter: Emitter<{ added: readonly ISession[]; removed: readonly ISession[]; changed: readonly ISession[] }>;
		readonly replaceCalls: Array<{ sessionId: string; values: Record<string, unknown> }>;
	}

	function createHarness(
		initialConfig: IResolveSessionConfigResult | undefined,
		registerProvider = true,
	): ITestHarness {
		const session = createSession();

		const onDidChangeSessionConfigEmitter = store.add(new Emitter<string>());
		const onDidChangeSessionsEmitter = store.add(new Emitter<{ added: readonly ISession[]; removed: readonly ISession[]; changed: readonly ISession[] }>());
		const replaceCalls: Array<{ sessionId: string; values: Record<string, unknown> }> = [];

		const sessionProvider: IMockAgentHostSessionsProvider = {
			id: PROVIDER_ID,
			config: initialConfig,
			onDidChangeSessionConfigEmitter,
			onDidChangeSessionsEmitter,
			replaceCalls,
			onDidChangeSessionConfig: onDidChangeSessionConfigEmitter.event,
			onDidChangeSessions: onDidChangeSessionsEmitter.event,
			getSessions: () => [session],
			getSessionConfig: (_sessionId: string) => sessionProvider.config,
			replaceSessionConfig: async (sessionId: string, values: Record<string, unknown>) => {
				replaceCalls.push({ sessionId, values });
				if (sessionProvider.config) {
					sessionProvider.config = {
						...sessionProvider.config,
						values: { ...values },
					};
				}
			},
			setSessionConfigValue: async () => { /* unused by writeFile */ },
		} as unknown as IMockAgentHostSessionsProvider;

		const onDidChangeProvidersEmitter = store.add(new Emitter<{ added: readonly ISessionsProvider[]; removed: readonly ISessionsProvider[] }>());
		const providersService: ISessionsProvidersService = {
			getProvider<T extends ISessionsProvider>(providerId: string): T | undefined {
				if (registerProvider && providerId === PROVIDER_ID) {
					return sessionProvider as unknown as T;
				}
				return undefined;
			},
			getProviders: () => registerProvider ? [sessionProvider as unknown as ISessionsProvider] : [],
			onDidChangeProviders: onDidChangeProvidersEmitter.event,
		} as unknown as ISessionsProvidersService;

		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[ISessionsProvidersService, providersService],
			[ILogService, new NullLogService()],
		)));

		const schemaRegistrar = store.add(instantiationService.createInstance(AgentSessionSettingsSchemaRegistrar));
		const fs = store.add(instantiationService.createInstance(AgentSessionSettingsFileSystemProvider, schemaRegistrar));

		return { fs, session, uri: agentSessionSettingsUri(session), sessionProvider };
	}

	test('readFile returns mutable, non-readOnly config values as JSON', async () => {
		const { fs, uri } = createHarness({
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
					isolation: { type: 'string', title: 'Isolation', enum: ['worktree'] }, // non-mutable — omitted
					branch: { type: 'string', title: 'Branch', sessionMutable: true, readOnly: true, enum: ['main'] }, // readOnly — omitted
				},
			},
			values: { autoApprove: 'default', isolation: 'worktree', branch: 'main' },
		});

		const buf = await fs.readFile(uri);
		const text = VSBuffer.wrap(buf).toString();
		const jsonStart = text.indexOf('{');
		const parsed = JSON.parse(text.substring(jsonStart));
		assert.deepStrictEqual(parsed, { autoApprove: 'default' });
	});

	test('writeFile with unchanged content still forwards raw input (provider guards/short-circuits)', async () => {
		const { fs, uri, session, sessionProvider } = createHarness({
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
				},
			},
			values: { autoApprove: 'default' },
		});

		const current = await fs.readFile(uri);
		await fs.writeFile(uri, current, { create: false, overwrite: true, unlock: false, atomic: false });
		// FS provider forwards the parsed JSON as-is; the guard/short-circuit
		// is the provider's responsibility (covered in the provider test).
		assert.deepStrictEqual(sessionProvider.replaceCalls, [{
			sessionId: session.sessionId,
			values: { autoApprove: 'default' },
		}]);
	});

	test('writeFile forwards the user\'s parsed JSON as the replace payload', async () => {
		const { fs, uri, session, sessionProvider } = createHarness({
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
					mode: { type: 'string', title: 'Mode', sessionMutable: true, enum: ['a', 'b'] },
					isolation: { type: 'string', title: 'Isolation', enum: ['worktree'] }, // non-mutable
					branch: { type: 'string', title: 'Branch', sessionMutable: true, readOnly: true, enum: ['main'] }, // readOnly
				},
			},
			values: { autoApprove: 'default', mode: 'a', isolation: 'worktree', branch: 'main' },
		});

		// User edits: only editable keys are exposed and round-tripped through
		// the FS provider. Non-editable preservation is the provider's job.
		const newContent = VSBuffer.fromString('// trailing comments ok\n{ "autoApprove": "autoApprove", "mode": "b", }\n').buffer;
		await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(sessionProvider.replaceCalls, [{
			sessionId: session.sessionId,
			values: { autoApprove: 'autoApprove', mode: 'b' },
		}]);
	});

	test('writeFile forwards a partial edit set, supporting unset via omission', async () => {
		const { fs, uri, session, sessionProvider } = createHarness({
			schema: {
				type: 'object',
				properties: {
					autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
					mode: { type: 'string', title: 'Mode', sessionMutable: true, enum: ['a', 'b'] },
					isolation: { type: 'string', title: 'Isolation', enum: ['worktree'] },
				},
			},
			values: { autoApprove: 'autoApprove', mode: 'a', isolation: 'worktree' },
		});

		const newContent = VSBuffer.fromString('{ "autoApprove": "default" }\n').buffer;
		await fs.writeFile(uri, newContent, { create: false, overwrite: true, unlock: false, atomic: false });

		assert.deepStrictEqual(sessionProvider.replaceCalls, [{
			sessionId: session.sessionId,
			values: { autoApprove: 'default' },
		}]);
	});

	test('onDidChangeFile fires when provider config changes', async () => {
		const { fs, uri, session, sessionProvider } = createHarness({
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

		sessionProvider.onDidChangeSessionConfigEmitter.fire(session.sessionId);

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

		function expectedSchemaId(session: ISession): string {
			return `vscode://schemas/agent-session-settings/${session.providerId}${session.resource.scheme}${session.resource.path}.jsonc`;
		}

		test('readFile lazily registers a schema + association for the session', async () => {
			const { fs, uri, session } = createHarness({
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
					},
				},
				values: { autoApprove: 'default' },
			});
			const schemaId = expectedSchemaId(session);

			// No registration before the file is read.
			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
			assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], undefined);

			await fs.readFile(uri);

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);
			assert.deepStrictEqual(schemaRegistry.getSchemaAssociations()[schemaId], [uri.toString()]);
		});

		test('schema is refreshed when onDidChangeSessionConfig fires with a new schema identity', async () => {
			const { fs, uri, session, sessionProvider } = createHarness({
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default'] },
					},
				},
				values: { autoApprove: 'default' },
			});
			const schemaId = expectedSchemaId(session);

			// Trigger initial registration.
			await fs.readFile(uri);
			const initial = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.ok(initial);

			// Swap in a new schema (identity change) and notify.
			sessionProvider.config = {
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default', 'autoApprove'] },
						mode: { type: 'string', title: 'Mode', sessionMutable: true, enum: ['a', 'b'] },
					},
				},
				values: { autoApprove: 'default', mode: 'a' },
			};
			sessionProvider.onDidChangeSessionConfigEmitter.fire(session.sessionId);

			const refreshed = schemaRegistry.getSchemaContributions().schemas[schemaId];
			assert.notStrictEqual(refreshed, initial);
			assert.ok(refreshed.properties?.['mode'], 'refreshed schema should include the newly added property');
		});

		test('schema is disposed when the session is removed', async () => {
			const { fs, uri, session, sessionProvider } = createHarness({
				schema: {
					type: 'object',
					properties: {
						autoApprove: { type: 'string', title: 'Auto Approve', sessionMutable: true, enum: ['default'] },
					},
				},
				values: { autoApprove: 'default' },
			});
			const schemaId = expectedSchemaId(session);

			await fs.readFile(uri);
			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), true);

			sessionProvider.onDidChangeSessionsEmitter.fire({ added: [], removed: [session], changed: [] });

			assert.strictEqual(schemaRegistry.hasSchemaContent(schemaId), false);
			assert.strictEqual(schemaRegistry.getSchemaAssociations()[schemaId], undefined);
		});
	});
});
