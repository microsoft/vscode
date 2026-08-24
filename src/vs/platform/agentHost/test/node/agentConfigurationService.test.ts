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
import { AgentHostAutoApprovePolicyRestrictedConfigKey, AgentHostAutoReplyEnabledConfigKey, AgentHostEditAutoApprovePatternsConfigKey, AgentHostExternalSessionsMode, AgentHostGlobalAutoApproveEnabledConfigKey, AgentHostMcpServersConfigKey, AgentHostProxyConfigKey, AgentHostShowExternalSessionsConfigKey, AgentHostTerminalAutoApproveEnabledConfigKey, AgentHostTerminalAutoApproveRulesConfigKey, clientOwnedApprovalRootConfigKeys, createSchema, platformRootSchema, schemaProperty } from '../../common/agentHostSchema.js';
import { AGENT_CUSTOMIZATION_SETTINGS_META_KEY, getAgentCustomizationSettingsEntries } from '../../common/agentCustomizationSettings.js';
import { SessionConfigKey } from '../../common/sessionConfigKeys.js';
import type { RootConfigState } from '../../common/state/protocol/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { buildChatUri, buildSubagentSessionUri, SessionStatus, type SessionSummary } from '../../common/state/sessionState.js';
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

	function makeSummary(resource: string, ...workingDirectories: string[]): SessionSummary {
		return {
			resource,
			provider: 'copilot',
			title: 't',
			status: SessionStatus.Idle,
			createdAt: new Date().toISOString(),
			modifiedAt: new Date().toISOString(),
			project: { uri: 'file:///project', displayName: 'Project' },
			workingDirectories: workingDirectories.length > 0 ? workingDirectories : undefined,
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

		test('inherits from parent subagent session', () => {
			const parent = URI.from({ scheme: 'copilot', path: '/parent' }).toString();
			manager.createSession(makeSummary(parent));
			seedSessionConfig(parent, { level: 'high' });

			const child = buildSubagentSessionUri(parent, 'toolcall-1');
			manager.createSession(makeSummary(child));

			assert.strictEqual(service.getEffectiveValue(child, schema, 'level'), 'high');
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
