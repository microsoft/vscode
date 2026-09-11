/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { URI } from '../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { platformSessionSchema } from '../../common/agentHostSchema.js';
import { AgentHostSandboxConfigKey, AgentHostSandboxKey, sandboxConfigSchema } from '../../common/sandboxConfigSchema.js';
import { omitTransientSessionConfigValues, SessionConfigKey } from '../../common/sessionConfigKeys.js';
import { buildChatUri, buildSubagentSessionUri, MessageKind, SessionStatus, ToolCallStatus } from '../../common/state/sessionState.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { projectCopilotSandboxPolicy } from '../../node/copilot/copilotSandboxPolicy.js';
import { buildSandboxConfigForSdk } from '../../node/copilot/sandboxConfigForSdk.js';
import { getSessionSandboxOverrides } from '../../node/sessionSandbox.js';
import { SessionPermissionManager } from '../../node/sessionPermissions.js';
import { createSessionDataService } from '../common/sessionTestHelpers.js';

suite('Session sandbox configuration', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function getSessionSandboxConfig(configuration: AgentConfigurationService, session: string) {
		return {
			...configuration.getRootValue(sandboxConfigSchema, AgentHostSandboxConfigKey.Sandbox),
			...getSessionSandboxOverrides(configuration, session),
		};
	}

	function setupSession() {
		const manager = store.add(new AgentHostStateManager(new NullLogService()));
		const configuration = store.add(new AgentConfigurationService(manager, new NullLogService()));
		const create = (id: string, values: Record<string, unknown> = {}) => {
			const session = `copilot:/${id}`;
			manager.createSession({
				resource: session, provider: 'copilot', title: id, status: SessionStatus.Idle,
				createdAt: '2026-01-01T00:00:00Z', modifiedAt: '2026-01-01T00:00:00Z',
			});
			manager.setSessionConfig(session, { schema: platformSessionSchema.toProtocol(), values });
			return session;
		};
		return { manager, configuration, create };
	}

	test('advertises an optional mutable selection without materializing a default', () => {
		assert.deepStrictEqual({
			values: platformSessionSchema.validateOrDefault({}, {}),
			property: platformSessionSchema.toProtocol().properties.sandboxEnabled.enum,
			mutable: platformSessionSchema.toProtocol().properties.sandboxEnabled.sessionMutable,
		}, { values: {}, property: ['default', 'on', 'off'], mutable: true });
	});

	test('returns only session enablement and bypass overrides', () => {
		const { configuration, create } = setupSession();
		const follower = create('follower');
		const enabled = create('enabled', { sandboxEnabled: 'on' });
		const disabled = create('disabled', { sandboxEnabled: 'off' });
		const managed = create('managed');
		configuration.updateRootConfig({ sandbox: { enabled: 'on', allowNetwork: true } });
		configuration.setSessionSandboxPolicy(managed, { enabled: true, allowBypass: false });
		assert.deepStrictEqual([follower, enabled, disabled, managed].map(session => getSessionSandboxOverrides(configuration, session)), [
			{},
			{ enabled: 'on', 'enabled.windows': 'on' },
			{ enabled: 'off', 'enabled.windows': 'off' },
			{ enabled: 'on', 'enabled.windows': 'on', allowUnsandboxedCommands: false },
		]);
	});

	test('global updates affect followers, not explicit session overrides', () => {
		const { configuration, create } = setupSession();
		const follower = create('follower');
		const enabled = create('on', { sandboxEnabled: 'on' });
		const disabled = create('off', { sandboxEnabled: 'off' });
		const read = () => [follower, enabled, disabled].map(session => getSessionSandboxConfig(configuration, session)?.enabled);
		configuration.updateRootConfig({ sandbox: { enabled: 'off' } });
		const before = read();
		configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		assert.deepStrictEqual({ before, after: read() }, { before: ['off', 'on', 'off'], after: ['on', 'on', 'off'] });
	});

	test('peer chats and nested subagents use the same owner override', () => {
		const { configuration, create } = setupSession();
		const owner = create('owner', { sandboxEnabled: 'off' });
		const other = create('other');
		configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		assert.deepStrictEqual([
			owner,
			buildChatUri(owner, 'peer'),
			buildSubagentSessionUri(owner, 'child'),
			buildSubagentSessionUri(buildSubagentSessionUri(owner, 'child'), 'nested'),
			other,
		].map(session => getSessionSandboxConfig(configuration, session)?.enabled), ['off', 'off', 'off', 'off', 'on']);
	});

	test('sandbox policy lookup resolves peer chats and nested subagents to the owner', () => {
		const { configuration, create } = setupSession();
		const owner = create('owner');
		const other = create('other');
		const child = buildSubagentSessionUri(owner, 'child');
		const nested = buildSubagentSessionUri(child, 'nested');
		const policy = { enabled: true, allowBypass: false };
		configuration.setSessionSandboxPolicy(owner, policy);
		assert.deepStrictEqual([
			owner,
			buildChatUri(owner, 'peer'),
			child,
			nested,
			buildChatUri(nested, 'peer'),
			other,
		].map(session => configuration.getSessionSandboxPolicy(session)), [policy, policy, policy, policy, policy, undefined]);
	});

	test('restored selections retain their values and resolve against the current default and managed policy', () => {
		const first = setupSession();
		const second = setupSession();
		const restored = ['on', 'off', 'default', undefined].map(selection => {
			const owner = first.create(`persisted-${selection}`, selection ? { sandboxEnabled: selection } : {});
			const serialized = JSON.stringify(omitTransientSessionConfigValues(first.configuration.getSessionConfigValues(owner)!));
			return second.create(`persisted-${selection}`, JSON.parse(serialized));
		});
		const fresh = second.create('fresh');
		const read = () => [...restored, fresh].map(session => getSessionSandboxConfig(second.configuration, session)?.enabled);
		const selections = restored.map(session => second.configuration.getSessionConfigValues(session)?.sandboxEnabled);
		second.configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		const defaultOn = read();
		second.configuration.updateRootConfig({ sandbox: { enabled: 'off' } });
		const defaultOff = read();
		for (const session of restored) {
			second.configuration.setSessionSandboxPolicy(session, { enabled: true, allowBypass: false });
		}
		assert.deepStrictEqual({ selections, defaultOn, defaultOff, managed: read() }, {
			selections: ['on', 'off', 'default', undefined],
			defaultOn: ['on', 'off', 'on', 'on', 'on'],
			defaultOff: ['on', 'off', 'off', 'off', 'off'],
			managed: ['on', 'on', 'on', 'on', 'off'],
		});
	});

	test('managed floor permanently discards off and rejects subsequent attempts', () => {
		const { configuration, create } = setupSession();
		const owner = create('managed', { sandboxEnabled: 'off' });
		configuration.updateRootConfig({ sandbox: { enabled: 'on' } });
		configuration.setSessionSandboxPolicy(owner, { enabled: true, allowBypass: false });
		configuration.updateSessionConfig(owner, { sandboxEnabled: 'off' });
		const governed = getSessionSandboxConfig(configuration, owner);
		configuration.setSessionSandboxPolicy(owner, { enabled: false, allowBypass: false });
		assert.deepStrictEqual({
			governed: governed?.enabled,
			bypass: governed?.allowUnsandboxedCommands,
			stored: configuration.getSessionConfigValues(owner)?.sandboxEnabled,
			removed: getSessionSandboxConfig(configuration, owner)?.enabled,
		}, { governed: 'on', bypass: false, stored: 'default', removed: 'on' });
	});

	test('projects the same session override for SDK and host terminal settings without losing restrictions', () => {
		const { configuration, create } = setupSession();
		const owner = create('sdk', { [SessionConfigKey.SandboxEnabled]: 'on' });
		configuration.updateRootConfig({
			sandbox: {
				enabled: 'off', 'enabled.windows': 'off', allowNetwork: false,
				[AgentHostSandboxKey.LinuxFileSystem]: { denyRead: ['/private'] },
			}
		});
		const effective = getSessionSandboxConfig(configuration, owner);
		const sdk = buildSandboxConfigForSdk('linux', effective);
		assert.deepStrictEqual({
			host: effective?.enabled, windows: effective?.['enabled.windows'],
			sdk: sdk?.enabled, denied: sdk?.userPolicy?.filesystem?.deniedPaths,
			network: sdk?.userPolicy?.network?.allowOutbound,
		}, { host: 'on', windows: 'on', sdk: true, denied: ['/private'], network: false });
	});

	test('projects resolved org policy and undetermined-policy restrictions, not device discovery', () => {
		const snapshot = {
			source: 'server' as const, serverManaged: true, deviceManaged: false,
			failClosed: false, bypassPermissionsDisabled: false, managedKeys: ['sandbox'],
		};
		assert.deepStrictEqual([
			projectCopilotSandboxPolicy({ ...snapshot, settings: { sandbox: { enabled: true, allowBypass: false } } }),
			projectCopilotSandboxPolicy({ ...snapshot, settings: { sandbox: { enabled: true, allowBypass: true } } }),
			projectCopilotSandboxPolicy({ ...snapshot, sandboxEnabledByUndeterminedPolicy: true }),
			projectCopilotSandboxPolicy({ ...snapshot, failClosed: true }),
			projectCopilotSandboxPolicy(snapshot),
		], [
			{ enabled: true, allowBypass: false }, { enabled: true, allowBypass: true },
			{ enabled: true, allowBypass: false }, { enabled: true, allowBypass: false },
			{ enabled: false, allowBypass: undefined },
		]);
	});

	test('allow-session on a peer sandbox escape disables only the owner, without allowing the tool', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('approval');
		const other = create('other');
		const root = configuration.getRootConfigValues();
		const peer = buildChatUri(owner, 'peer');
		manager.addChat(owner, peer);
		const permissions = store.add(new SessionPermissionManager(manager, {}, configuration, new NullLogService(), createSessionDataService()));
		manager.dispatchServerAction(peer, {
			type: ActionType.ChatTurnStarted, turnId: 'turn', startedAt: '2026-01-01T00:00:00Z',
			message: { text: 'run', origin: { kind: MessageKind.User } },
		});
		manager.dispatchServerAction(peer, { type: ActionType.ChatToolCallStart, turnId: 'turn', toolCallId: 'tool', toolName: 'bash', displayName: 'Bash' });
		const ready = permissions.createToolReadyAction({
			kind: 'pending_confirmation', chat: URI.parse(peer), requestSandboxBypass: true,
			state: { status: ToolCallStatus.PendingConfirmation, toolCallId: 'tool', toolName: 'bash', displayName: 'Bash', invocationMessage: 'run', confirmationTitle: 'Outside sandbox?' },
		}, owner, 'turn');
		manager.dispatchServerAction(peer, ready);
		const pending = manager.getChatState(peer);
		permissions.handleToolCallConfirmed(peer, 'tool', 'skip');
		const cancelled = {
			config: { ...configuration.getSessionConfigValues(owner) },
			toolUnchanged: manager.getChatState(peer) === pending,
		};
		permissions.handleToolCallConfirmed(peer, 'tool', 'allow-once');
		const once = { ...configuration.getSessionConfigValues(owner) };
		permissions.handleToolCallConfirmed(peer, 'tool', 'allow-session');
		assert.deepStrictEqual({
			cancelled, once, owner: configuration.getSessionConfigValues(owner),
			other: configuration.getSessionConfigValues(other), root: configuration.getRootConfigValues(),
		}, { cancelled: { config: {}, toolUnchanged: true }, once: {}, owner: { sandboxEnabled: 'off' }, other: {}, root });
	});

	test('managed sandbox confirmations keep only the one-time and deny actions', () => {
		const { manager, configuration, create } = setupSession();
		const owner = create('managed-approval');
		const permissions = store.add(new SessionPermissionManager(manager, {}, configuration, new NullLogService(), createSessionDataService()));
		const ready = permissions.createToolReadyAction({
			kind: 'pending_confirmation', chat: URI.parse(buildChatUri(owner, 'peer')), requestSandboxBypass: true, managedApprovalRequired: true,
			state: { status: ToolCallStatus.PendingConfirmation, toolCallId: 'tool', toolName: 'bash', displayName: 'Bash', invocationMessage: 'run', confirmationTitle: 'Outside sandbox?' },
		}, owner, 'turn');
		assert.deepStrictEqual(ready.options?.map(option => option.id), ['allow-once', 'skip']);
	});
});
