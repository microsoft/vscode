/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { join } from '../../../../base/common/path.js';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostAutoReplyEnabledConfigKey, AgentHostEditAutoApprovePatternsConfigKey, AgentHostExternalSessionsMode, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostMcpSamplingAllowedServersConfigKey, AgentHostMcpServersConfigKey, AgentHostProxyConfigKey, AgentHostShowExternalSessionsConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, AgentHostWorkspaceTrustConfigKey, clientOwnedApprovalRootConfigKeys, createSchema, platformRootSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY, AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY, automationRootConfigSchema } from '../../common/automationConfig.js';
import { AGENT_CUSTOMIZATION_SETTINGS_META_KEY, getAgentCustomizationSettingsEntries } from '../../common/agentCustomizationSettings.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { RootConfigState } from '../../common/state/protocol/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildDefaultChatUri, buildChatUri, buildSubagentSessionUri, ChatOriginKind, SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
import { AgentConfigurationService, getEffectiveWorkingDirectories, getEffectiveWorkingDirectory } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';

suite('AgentConfigurationService', () => {

	const disposables = new DisposableStore();
	let manager: AgentHostStateManager;
	let service: AgentConfigurationService;

	const schema = createSchema({
		level: schemaProperty<'low' | 'high'>({
			type: 'string',
			title: 'level',
			enum: ['low', 'high'],
		}),
		limit: schemaProperty<number>({ type: 'number', title: 'limit' }),
	});

	function seedSessionConfig(sessionUri: string, values: Record<string, unknown>): void {
		assert.ok(manager.getSessionState(sessionUri), `Session not found: ${sessionUri}`);
		manager.setSessionConfig(sessionUri, {
			schema: schema.toProtocol(),
			values,
		});
	}

	function seedRootConfig(values: Record<string, unknown>): void {
		const rootMutable = manager.rootState as { config?: RootConfigState };
		rootMutable.config = {
			schema: schema.toProtocol(),
			values,
		};
	}

	function makeSummary(resource: string, ...workingDirectories: string[]): SessionSummary & { readonly defaultChat: string } {
		return {
			resource,
			provider: 'copilot',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///project', displayName: 'Project' },
			workingDirectories: workingDirectories.length > 0 ? workingDirectories : undefined,
			defaultChat: buildDefaultChatUri(resource),
		};
	}

	setup(() => {
		manager = disposables.add(new AgentHostStateManager(new NullLogService()));
		service = disposables.add(new AgentConfigurationService(manager, new NullLogService()));
	});

	teardown(() => disposables.clear());

	ensureNoDisposablesAreLeakedInTestSuite();

	test('rejects a chat channel when reading session config', () => {
		const session = URI.from({ scheme: 'copilot', path: '/chat-owner' }).toString();
		manager.createSession(makeSummary(session));
		seedSessionConfig(session, { level: 'high' });

		assert.throws(() => service.getSessionConfigValues(buildChatUri(session, 'peer')), /Expected a session URI/);
	});

	// ---- getEffectiveValue ------------------------------------------------

	suite('getEffectiveValue', () => {

		test('returns session value when present', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { level: 'high' });
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), 'high');
		});

		test('falls back to host value when session does not provide the key', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { limit: 5 });
			seedRootConfig({ level: 'low' });
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), 'low');
		});

		test('never inherits from a parent derived from the shape of a session URI', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent));
			seedSessionConfig(parent, { level: 'high' });

			const child = buildSubagentSessionUri(parent, 'toolcall-1');
			manager.createSession(makeSummary(child));

			assert.strictEqual(service.getEffectiveValue(child, schema, 'level'), undefined);
		});

		test('session value takes precedence over parent and host', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent));
			seedSessionConfig(parent, { level: 'high' });

			const child = buildSubagentSessionUri(parent, 'tc-2');
			manager.createSession(makeSummary(child));
			seedSessionConfig(child, { level: 'low' });
			seedRootConfig({ level: 'high' });

			assert.strictEqual(service.getEffectiveValue(child, schema, 'level'), 'low');
		});

		test('skips layers whose value fails schema validation and falls through', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { level: 'bogus' });
			seedRootConfig({ level: 'high' });
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), 'high');
		});

		test('returns undefined when no layer provides a valid value', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, {});
			assert.strictEqual(service.getEffectiveValue(uri, schema, 'level'), undefined);
		});
	});

	// ---- chat config -----------------------------------------------------

	suite('chat config', () => {

		const chatSchema = createSchema({
			level: schemaProperty<'low' | 'high'>({ type: 'string', title: 'level', enum: ['low', 'high'], sessionMutable: true, chatMutable: true }),
			limit: schemaProperty<number>({ type: 'number', title: 'limit', sessionMutable: true }),
		});
		const session = URI.from({ scheme: 'copilot', path: '/chats' }).toString();
		const defaultChat = buildDefaultChatUri(session);
		const peer = buildChatUri(session, 'peer');
		const subagent = buildChatUri(session, 'subagent');
		const nested = buildChatUri(session, 'nested');
		const lookalike = buildChatUri(session, 'subagent/lookalike');

		function setUpSession(values: Record<string, unknown>): void {
			manager.createSession(makeSummary(session));
			manager.setSessionConfig(session, { schema: chatSchema.toProtocol(), values });
			manager.addChat(session, peer, peer, { config: { values: { level: 'high', limit: 9 } } });
			manager.addChat(session, subagent, peer, { origin: { kind: ChatOriginKind.Tool, chat: peer, toolCallId: 'tc-1' } });
			manager.addChat(session, nested, peer, { origin: { kind: ChatOriginKind.Tool, chat: subagent, toolCallId: 'tc-2' } });
			manager.addChat(session, lookalike, lookalike);
		}

		function effective(chat: string): unknown {
			return service.getChatEffectiveValue({ session, chat }, chatSchema, 'level');
		}

		test('reads own values, then the recorded spawning chats, then the session and the host', () => {
			setUpSession({ level: 'low', limit: 1 });
			seedRootConfig({ level: 'high' });
			assert.deepStrictEqual({
				defaultChat: effective(defaultChat),
				peer: effective(peer),
				subagent: effective(subagent),
				nested: effective(nested),
				lookalike: effective(lookalike),
				peerValues: service.getChatConfigValues({ session, chat: peer }),
				nestedOwn: service.getChatOwnConfigValues({ session, chat: nested }),
			}, {
				defaultChat: 'low',
				peer: 'high',
				subagent: 'high',
				nested: 'high',
				lookalike: 'low',
				// `limit` is not settable per chat, so the chat's stray value is ignored.
				peerValues: { level: 'high', limit: 1 },
				nestedOwn: { level: 'high' },
			});
		});

		test('values hold the chat, spawning-chat and session layers; the effective value also falls back to the host, as for a session', () => {
			manager.createSession(makeSummary(session));
			manager.setSessionConfig(session, { schema: chatSchema.toProtocol(), values: {} });
			manager.addChat(session, peer, peer);
			seedRootConfig({ level: 'high', limit: 4 });
			const read = () => ({
				values: service.getChatConfigValues({ session, chat: peer }),
				effective: [service.getChatEffectiveValue({ session, chat: peer }, chatSchema, 'level'), service.getChatEffectiveValue({ session, chat: peer }, chatSchema, 'limit')],
				session: [service.getEffectiveValue(session, chatSchema, 'level'), service.getEffectiveValue(session, chatSchema, 'limit')],
			});
			const hostOnly = read();
			manager.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config: { limit: 2 } });
			manager.dispatchServerAction(peer, { type: ActionType.ChatConfigChanged, config: { level: 'low' } });
			assert.deepStrictEqual({ hostOnly, layered: read() }, {
				hostOnly: { values: {}, effective: ['high', 4], session: ['high', 4] },
				layered: { values: { level: 'low', limit: 2 }, effective: ['low', 2], session: ['high', 2] },
			});
		});

		test('a write to a chat that is neither registered nor being created changes only the session', () => {
			setUpSession({ level: 'low', limit: 1 });
			const gone = buildChatUri(session, 'disposed');
			const events: string[] = [];
			disposables.add(service.onDidChatConfigChange(e => events.push(e.chat)));
			service.updateChatConfig({ session, chat: gone }, { level: 'high', limit: 5 });
			assert.deepStrictEqual({
				own: manager.getChatConfig(gone),
				values: service.getChatConfigValues({ session, chat: gone }),
				session: service.getSessionConfigValues(session),
				goneEvents: events.filter(chat => chat === gone),
			}, {
				own: undefined,
				values: { level: 'low', limit: 5 },
				session: { level: 'low', limit: 5 },
				goneEvents: [],
			});
		});

		test('a malformed own value falls back to the session', () => {
			setUpSession({ level: 'low' });
			manager.dispatchServerAction(peer, { type: ActionType.ChatConfigChanged, config: { level: 'bogus' } });
			assert.strictEqual(effective(peer), 'low');
		});

		test('updates route settable properties to the chat (a subagent\'s to its spawning chat) and the rest to the session', () => {
			setUpSession({ level: 'low', limit: 1 });
			service.updateChatConfig({ session, chat: nested }, { level: 'low', limit: 2 });
			service.updateChatConfig({ session, chat: defaultChat }, { level: 'high' });
			assert.deepStrictEqual({
				peer: manager.getChatConfig(peer),
				subagent: manager.getChatConfig(subagent),
				nested: manager.getChatConfig(nested),
				defaultChat: manager.getChatConfig(defaultChat),
				session: service.getSessionConfigValues(session),
			}, {
				peer: { values: { level: 'low', limit: 9 } },
				subagent: undefined,
				nested: undefined,
				defaultChat: { values: { level: 'high' } },
				session: { level: 'low', limit: 2 },
			});
		});

		test('fires chat changes for the changed chat and its subagents, and session changes for chats that do not set the key', () => {
			setUpSession({ level: 'low', limit: 1 });
			const events: string[] = [];
			disposables.add(service.onDidChatConfigChange(e => events.push(`${e.chat.substring(session.length)} ${JSON.stringify(e.config)}`)));
			service.updateChatConfig({ session, chat: peer }, { level: 'low' });
			service.updateSessionConfig(session, { level: 'high', limit: 3 });
			assert.deepStrictEqual(events, [
				`${peer.substring(session.length)} {"level":"low"}`,
				`${subagent.substring(session.length)} {"level":"low"}`,
				`${nested.substring(session.length)} {"level":"low"}`,
				`${defaultChat.substring(session.length)} {"level":"high","limit":3}`,
				`${peer.substring(session.length)} {"limit":3}`,
				`${subagent.substring(session.length)} {"limit":3}`,
				`${nested.substring(session.length)} {"limit":3}`,
				`${lookalike.substring(session.length)} {"level":"high","limit":3}`,
			]);
		});

		test('a replacement fans out the keys it removed, from the session and from a chat', () => {
			setUpSession({ level: 'low', limit: 1 });
			const events: string[] = [];
			disposables.add(service.onDidChatConfigChange(e => {
				if (e.chat === peer || e.chat === defaultChat) {
					events.push(`${e.chat === peer ? 'peer' : 'default'} ${Object.keys(e.config).sort().join(',')}`);
				}
			}));
			manager.dispatchServerAction(session, { type: ActionType.SessionConfigChanged, config: { level: 'low' }, replace: true });
			manager.dispatchServerAction(peer, { type: ActionType.ChatConfigChanged, config: {}, replace: true });
			assert.deepStrictEqual(events, ['default level,limit', 'peer limit', 'peer level,limit']);
		});

		test('a seed gives a chat being created its values until it is registered', () => {
			setUpSession({ level: 'low' });
			const fork = buildChatUri(session, 'fork');
			const seed = service.seedChatConfig(fork, { level: 'high' });
			const during = effective(fork);
			service.updateChatConfig({ session, chat: fork }, { level: 'low' });
			const values = seed.values;
			seed.dispose();
			assert.deepStrictEqual({ during, values, after: effective(fork) }, { during: 'high', values: { level: 'low' }, after: 'low' });
		});
	});

	// ---- getEffectiveWorkingDirectory -------------------------------------

	suite('getEffectiveWorkingDirectory', () => {

		test('returns session working directory when set', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri, 'file:///work'));
			assert.strictEqual(getEffectiveWorkingDirectory(manager, uri), 'file:///work');
		});

		test('falls back to parent session working directory for subagents', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent, 'file:///work/parent'));

			const child = buildSubagentSessionUri(parent, 'tc-3');
			manager.createSession(makeSummary(child));
			assert.strictEqual(getEffectiveWorkingDirectory(manager, child), 'file:///work/parent');
		});

		test('returns undefined when neither layer has a working directory', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			assert.strictEqual(getEffectiveWorkingDirectory(manager, uri), undefined);
		});
	});

	// ---- getEffectiveWorkingDirectories -----------------------------------

	suite('getEffectiveWorkingDirectories', () => {

		test('returns the full ordered session set when set', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri, 'file:///work', 'file:///work-2'));
			assert.deepStrictEqual(getEffectiveWorkingDirectories(manager, uri), ['file:///work', 'file:///work-2']);
		});

		test('falls back to the parent session set for subagents', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent, 'file:///work/parent', 'file:///work/parent-2'));

			const child = buildSubagentSessionUri(parent, 'tc-3');
			manager.createSession(makeSummary(child));
			assert.deepStrictEqual(getEffectiveWorkingDirectories(manager, child), ['file:///work/parent', 'file:///work/parent-2']);
		});

		test('returns undefined when neither layer has a working directory', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			assert.strictEqual(getEffectiveWorkingDirectories(manager, uri), undefined);
		});
	});

	suite('updateSessionConfig', () => {

		test('merges the patch into the session config values', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { level: 'low', limit: 1 });

			service.updateSessionConfig(uri, { limit: 42 });

			const state = manager.getSessionState(uri);
			assert.deepStrictEqual(state?.config?.values, { level: 'low', limit: 42 });
		});

		test('fires after the session config is updated', () => {
			const uri = URI.from({ scheme: 'copilot', path: '/a' }).toString();
			manager.createSession(makeSummary(uri));
			seedSessionConfig(uri, { level: 'low' });
			const changes: Array<{ session: string; config: Record<string, unknown>; origin: { clientId: string; clientSeq: number } | undefined }> = [];
			disposables.add(service.onDidSessionConfigChange(event => {
				changes.push({ session: event.session, config: event.config, origin: event.origin });
			}));

			service.updateSessionConfig(uri, { level: 'high' });
			manager.dispatchClientAction(uri, {
				type: ActionType.SessionConfigChanged,
				config: { level: 'low' },
			}, { clientId: 'picker', clientSeq: 7 });

			assert.deepStrictEqual(changes, [
				{ session: uri, config: { level: 'high' }, origin: undefined },
				{ session: uri, config: { level: 'low' }, origin: { clientId: 'picker', clientSeq: 7 } },
			]);
		});
	});

	test('does not persist provider-backed root settings in agent-host config', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-config-'));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const localService = disposables.add(new AgentConfigurationService(localManager, new NullLogService(), resource));
		localService.registerProviderConfiguration({
			provider: 'test',
			title: 'Test',
			description: 'Test settings',
			properties: { 'test.personality': { type: 'string', title: 'Personality', default: 'friendly' } },
			settings: [{ key: 'test.personality', group: 'Personalization' }],
		});

		localService.updateRootConfig({ 'test.personality': 'pragmatic' });
		await localService.whenIdle();

		const persisted = JSON.parse(fs.readFileSync(resource.fsPath, 'utf8')) as Record<string, unknown>;
		assert.strictEqual(persisted['test.personality'], undefined);
		assert.strictEqual(localManager.rootState.config?.values['test.personality'], 'pragmatic');
		fs.rmSync(directory, { recursive: true, force: true });
	});

	test('publishes transient root values without persisting them', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-config-'));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const localService = disposables.add(new AgentConfigurationService(localManager, new NullLogService(), resource));

		localService.publishRootTransientValues({ 'test.account': { status: 'signedIn' } });
		localService.updateRootConfig({ level: 'high' });
		await localService.whenIdle();

		const persisted = JSON.parse(fs.readFileSync(resource.fsPath, 'utf8')) as Record<string, unknown>;
		assert.strictEqual(persisted['test.account'], undefined);
		assert.deepStrictEqual(localManager.rootState.config?.values['test.account'], { status: 'signedIn' });
		fs.rmSync(directory, { recursive: true, force: true });
	});

	test('loads manually configured proxy settings from persisted Agent Host config', () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-config-'));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		fs.writeFileSync(resource.fsPath, JSON.stringify({
			[AgentHostProxyConfigKey.Proxy]: 'http://proxy.example:8080',
			[AgentHostProxyConfigKey.NoProxy]: ['localhost'],
		}));
		const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const localService = disposables.add(new AgentConfigurationService(localManager, new NullLogService(), resource));

		assert.deepStrictEqual({
			proxy: localService.getRootConfigValues?.()[AgentHostProxyConfigKey.Proxy],
			noProxy: localService.getRootConfigValues?.()[AgentHostProxyConfigKey.NoProxy],
		}, {
			proxy: 'http://proxy.example:8080',
			noProxy: ['localhost'],
		});
		fs.rmSync(directory, { recursive: true, force: true });
	});

	test('restores persisted platform root settings when the host restarts', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-config-'));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		const firstManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const firstService = disposables.add(new AgentConfigurationService(firstManager, new NullLogService(), resource));
		firstService.updateRootConfig({
			[AgentHostShowExternalSessionsConfigKey]: AgentHostExternalSessionsMode.Last30Days,
			[AgentHostMcpServersConfigKey]: { operatorServer: { command: 'node' } },
		});
		await firstService.whenIdle();

		const restartedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const restartedService = disposables.add(new AgentConfigurationService(restartedManager, new NullLogService(), resource));

		assert.deepStrictEqual({
			showExternalSessions: restartedService.getRootValue(platformRootSchema, AgentHostShowExternalSessionsConfigKey),
			mcpServers: restartedService.getRootValue(platformRootSchema, AgentHostMcpServersConfigKey),
		}, {
			showExternalSessions: AgentHostExternalSessionsMode.Last30Days,
			mcpServers: { operatorServer: { command: 'node' } },
		});
		fs.rmSync(directory, { recursive: true, force: true });
	});

	test('persists MCP sampling approval and revocation across host restarts', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-sampling-config-'));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		try {
			const firstManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const firstService = disposables.add(new AgentConfigurationService(firstManager, new NullLogService(), resource));
			firstService.updateRootConfig({ [AgentHostMcpSamplingAllowedServersConfigKey]: ['test-server'] });
			await firstService.whenIdle();
			const persisted = JSON.parse(fs.readFileSync(resource.fsPath, 'utf8')) as Record<string, unknown>;
			firstService.dispose();

			const restartedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const restartedService = disposables.add(new AgentConfigurationService(restartedManager, new NullLogService(), resource));
			const restored = restartedService.getRootValue(platformRootSchema, AgentHostMcpSamplingAllowedServersConfigKey);
			restartedService.updateRootConfig({ [AgentHostMcpSamplingAllowedServersConfigKey]: [] });
			await restartedService.whenIdle();
			restartedService.dispose();

			const revokedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
			const revokedService = disposables.add(new AgentConfigurationService(revokedManager, new NullLogService(), resource));
			assert.deepStrictEqual({
				persisted: persisted[AgentHostMcpSamplingAllowedServersConfigKey],
				restored,
				revoked: revokedService.getRootValue(platformRootSchema, AgentHostMcpSamplingAllowedServersConfigKey),
			}, { persisted: ['test-server'], restored: ['test-server'], revoked: [] });
		} finally {
			fs.rmSync(directory, { recursive: true, force: true });
		}
	});

	for (const enabled of [true, false]) {
		test(`restores Automation enablement ${enabled} and timeout without a client reconnect`, async () => {
			const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-config-'));
			try {
				const resource = URI.file(join(directory, 'agent-host-config.json'));
				const firstManager = disposables.add(new AgentHostStateManager(new NullLogService()));
				const firstService = disposables.add(new AgentConfigurationService(firstManager, new NullLogService(), resource));
				firstService.updateRootConfig({
					[AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY]: enabled,
					[AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY]: 42,
				});
				await firstService.whenIdle();
				const restartedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
				const restartedService = disposables.add(new AgentConfigurationService(restartedManager, new NullLogService(), resource));
				assert.deepStrictEqual({
					enabled: restartedService.getRootValue(automationRootConfigSchema, AGENT_HOST_AUTOMATIONS_ENABLED_CONFIG_KEY),
					timeout: restartedService.getRootValue(automationRootConfigSchema, AGENT_HOST_AUTOMATION_RUN_TIMEOUT_MINUTES_CONFIG_KEY),
				}, { enabled, timeout: 42 });
			} finally {
				fs.rmSync(directory, { recursive: true, force: true });
			}
		});
	}

	test('does not restore client-owned approval settings when the host restarts', async () => {
		const directory = fs.mkdtempSync(join(os.tmpdir(), 'agent-config-'));
		const resource = URI.file(join(directory, 'agent-host-config.json'));
		const firstManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const firstService = disposables.add(new AgentConfigurationService(firstManager, new NullLogService(), resource));
		// A permissive snapshot that a user, workspace, or policy could tighten
		// while the host is stopped.
		firstService.updateRootConfig({
			[SessionConfigKey.Permissions]: { allow: ['revoked-rule'], deny: [] },
			[AgentHostGlobalAutoApproveEnabledConfigKey]: true,
			[AgentHostAutoApprovePolicyRestrictedConfigKey]: false,
			[AgentHostTerminalAutoApproveEnabledConfigKey]: true,
			[AgentHostTerminalAutoApproveRulesConfigKey]: { rm: true },
			[AgentHostEditAutoApprovePatternsConfigKey]: { '**/*': true },
			[AgentHostAutoReplyEnabledConfigKey]: true,
			[AgentHostWorkspaceTrustConfigKey]: { enabled: true, trustedUris: [URI.file(directory).toString()] },
		});
		await firstService.whenIdle();

		const persisted = JSON.parse(fs.readFileSync(resource.fsPath, 'utf8')) as Record<string, unknown>;
		const restartedManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		const restartedService = disposables.add(new AgentConfigurationService(restartedManager, new NullLogService(), resource));
		const restored = restartedService.getRootConfigValues();

		assert.deepStrictEqual({
			persistedKeys: [...clientOwnedApprovalRootConfigKeys].filter(key => persisted[key] !== undefined).sort(),
			// The state manager seeds empty permissions; nothing else survives.
			restoredKeys: [...clientOwnedApprovalRootConfigKeys].filter(key => restored[key] !== undefined).sort(),
			permissions: restored[SessionConfigKey.Permissions],
		}, {
			persistedKeys: [...clientOwnedApprovalRootConfigKeys].sort(),
			restoredKeys: [SessionConfigKey.Permissions],
			permissions: { allow: [], deny: [] },
		});
		fs.rmSync(directory, { recursive: true, force: true });
	});

	test('seeds provider configuration into the initial root snapshot', () => {
		const localManager = disposables.add(new AgentHostStateManager(new NullLogService()));
		disposables.add(new AgentConfigurationService(localManager, new NullLogService(), undefined, [{
			provider: 'test',
			title: 'Test',
			description: 'Test settings',
			properties: { 'test.personality': { type: 'string', title: 'Personality', default: 'friendly' } },
			settings: [{ key: 'test.personality', group: 'Personalization' }],
		}]));

		assert.strictEqual(localManager.rootState.config?.schema.properties['test.personality']?.title, 'Personality');
		assert.strictEqual(localManager.rootState.config?.values['test.personality'], 'friendly');
		assert.deepStrictEqual(getAgentCustomizationSettingsEntries(localManager.rootState).map(entry => entry.provider), ['test']);
	});

	test('ignores malformed provider customization metadata', () => {
		manager.rootState._meta = {
			[AGENT_CUSTOMIZATION_SETTINGS_META_KEY]: [
				{ provider: 'missing-settings' },
				{ provider: 'bad-setting', title: 'Bad', description: 'Bad', settings: [{ group: 'Group' }] },
				{ provider: 'valid', title: 'Valid', description: 'Valid settings', settings: [{ key: 'valid.value', group: 'Group' }] },
			],
		};

		assert.deepStrictEqual(getAgentCustomizationSettingsEntries(manager.rootState).map(entry => entry.provider), ['valid']);
	});
});
