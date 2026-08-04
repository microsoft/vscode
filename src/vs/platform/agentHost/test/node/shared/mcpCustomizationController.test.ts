/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { AgentSession } from '../../../common/agentService.js';
import { AgentHostCustomizationEnablementService, CustomizationEnablementStorageKey } from '../../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStorageService } from '../../../node/agentHostStorageService.js';
import { ActionType } from '../../../common/state/protocol/common/actions.js';
import { CustomizationEnablementKind, CustomizationType, McpAuthRequiredReason, McpServerStatus, SessionStatus, type Customization, type McpServerCustomization, type McpServerState } from '../../../common/state/protocol/channels-session/state.js';
import type { SessionAction } from '../../../common/state/sessionActions.js';
import { AgentHostStateManager } from '../../../node/agentHostStateManager.js';
import { AgentConfigurationService } from '../../../node/agentConfigurationService.js';
import { applySessionMcpServerEnablement, McpCustomizationController, findMcpChildId, findMcpServerName, parseMcpChannelUri, type ISdkMcpServer } from '../../../node/shared/mcpCustomizationController.js';
import { getPrimaryWorkingDirectory, mcpServerPolicyKey, resolveEnablement, updateCustomizationEnablementPolicy } from '../../../node/shared/mcpServerEnablement.js';

function harness(store: Pick<DisposableStore, 'add'>, opts: { customizations?: readonly Customization[]; desiredEnabled?: boolean } = {}) {
	const actions: SessionAction[] = [];
	const stateManager = store.add(new AgentHostStateManager(new NullLogService()));
	const configurationService = store.add(new AgentConfigurationService(stateManager, new NullLogService()));
	const storageService = store.add(new AgentHostStorageService(new NullLogService()));
	const enablementService = store.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
	const sessionUri = AgentSession.uri('copilot', 'session-1');
	const session = sessionUri.toString();
	stateManager.createSession({
		resource: session,
		provider: 'copilot',
		title: 'Test',
		status: SessionStatus.Idle,
		createdAt: new Date().toISOString(),
		modifiedAt: new Date().toISOString(),
	});
	if (opts.desiredEnabled !== undefined) {
		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionCustomizationsChanged,
			customizations: [{
				type: CustomizationType.McpServer,
				id: 'mcp-top-level:copilot:session-1:search',
				uri: 'mcp-top-level:copilot:session-1:search',
				name: 'search',
				enabled: opts.desiredEnabled,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: opts.desiredEnabled }],
				state: starting(),
			}],
		});
	}
	const controller = new McpCustomizationController({
		providerId: 'copilot',
		sessionId: 'session-1',
		sessionUri,
		resolveChildId: name => findMcpChildId(opts.customizations ?? [], name),
		emit: a => actions.push(a),
	}, stateManager, enablementService);
	return { controller, actions, stateManager, configurationService, storageService, session };
}

function server(name: string, state: McpServerState): ISdkMcpServer {
	return { name, state };
}

function ready(): McpServerState { return { kind: McpServerStatus.Ready }; }
function starting(): McpServerState { return { kind: McpServerStatus.Starting }; }
function stopped(): McpServerState { return { kind: McpServerStatus.Stopped }; }
function authRequired(): McpServerState {
	return {
		kind: McpServerStatus.AuthRequired,
		reason: McpAuthRequiredReason.Required,
		resource: {
			resource: 'https://mcp.example.com',
			authorization_servers: ['https://auth.example.com'],
		},
		requiredScopes: ['repo'],
	};
}
function errored(message: string): McpServerState {
	return { kind: McpServerStatus.Error, error: { errorType: 'test-error', message } };
}

const PLUGIN_CUSTOMIZATIONS: readonly Customization[] = [
	{
		type: CustomizationType.Plugin,
		id: 'plugin:demo',
		uri: 'file:///plugins/demo',
		name: 'demo-plugin',
		enabled: true,
		children: [
			{
				type: CustomizationType.McpServer,
				id: 'mcp-child:demo:fs',
				uri: 'mcp-child:demo:fs',
				name: 'fs',
				enabled: true,
				state: { kind: McpServerStatus.Starting },
			},
		],
	},
];

suite('McpCustomizationController', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('empty inventory dispatches nothing', () => {
		const { controller, actions } = harness(store);
		store.add(controller);

		controller.applyAll([]);

		assert.deepStrictEqual(actions, []);
		assert.deepStrictEqual(controller.topLevelCustomizations(), []);
	});

	test('resolves per-scope MCP enablement in precedence order', () => {
		const source = 'file:///plugin';
		const key = mcpServerPolicyKey(source, 'search');
		const customization: McpServerCustomization = {
			type: CustomizationType.McpServer,
			id: 'plugin.json#mcp=search',
			uri: 'file:///plugin.json',
			name: 'search',
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			state: starting(),
		};
		const policy = {
			global: { [key]: true },
			workingDirectories: { 'file:///workspace': { [key]: false } },
		};

		assert.deepStrictEqual({
			session: resolveEnablement(customization, policy, 'file:///workspace/', source),
			workingDirectory: resolveEnablement({ ...customization, enablement: undefined }, policy, 'file:///workspace/', source),
			primaryWorkingDirectory: resolveEnablement({ ...customization, enablement: undefined }, {
				workingDirectories: {
					'file:///workspace': { [key]: true },
					'file:///disabled': { [key]: false },
				},
			}, getPrimaryWorkingDirectory(['file:///workspace', 'file:///disabled']), source),
			global: resolveEnablement({ ...customization, enablement: undefined }, policy, 'file:///other', source),
			default: resolveEnablement({ ...customization, enablement: undefined }, undefined, 'file:///other', source),
		}, {
			session: { enabled: false, enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }, { kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace/', enabled: false }, { kind: CustomizationEnablementKind.Global, enabled: true }] },
			workingDirectory: { enabled: false, enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace/', enabled: false }, { kind: CustomizationEnablementKind.Global, enabled: true }] },
			primaryWorkingDirectory: { enabled: true, enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: true }] },
			global: { enabled: true, enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }] },
			default: { enabled: true },
		});
	});

	test('uses only the primary working directory for persisted enablement', () => {
		const source = 'file:///plugin';
		const key = mcpServerPolicyKey(source, 'search');
		const customization = {
			type: CustomizationType.McpServer,
			id: 'plugin.json#mcp=search',
			uri: 'file:///plugin.json',
			name: 'search',
			enabled: true,
			state: starting(),
		};
		const workingDirectories = ['file:///primary', 'file:///secondary'];

		assert.deepStrictEqual({
			secondaryDisabled: resolveEnablement(customization, {
				workingDirectories: { 'file:///secondary': { [key]: false } },
			}, getPrimaryWorkingDirectory(workingDirectories), source),
			primaryDisabled: resolveEnablement(customization, {
				workingDirectories: {
					'file:///primary': { [key]: false },
					'file:///secondary': { [key]: true },
				},
			}, getPrimaryWorkingDirectory(workingDirectories), source),
		}, {
			secondaryDisabled: { enabled: true },
			primaryDisabled: {
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///primary', enabled: false }],
			},
		});
	});

	test('uses published session enablement as a session override', () => {
		const source = 'file:///plugin';
		const key = mcpServerPolicyKey(source, 'search');
		const customization: McpServerCustomization = {
			type: CustomizationType.McpServer,
			id: 'plugin.json#mcp=search',
			uri: 'file:///plugin.json',
			name: 'search',
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }],
			state: starting(),
		};

		assert.deepStrictEqual(resolveEnablement(customization, {
			global: { [key]: true },
		}, 'file:///workspace', source), {
			enabled: false,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: false }, { kind: CustomizationEnablementKind.Global, enabled: true }],
		});
	});

	test('replaces MCP enablement policy entries by explicit scope decisions', () => {
		const key = 'plugin.json#mcp=search';
		const global = updateCustomizationEnablementPolicy(undefined, key, [{ kind: CustomizationEnablementKind.Global, enabled: false }], undefined);
		const workspace = updateCustomizationEnablementPolicy(global, key, [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace/', enabled: true }, { kind: CustomizationEnablementKind.Global, enabled: false }], 'file:///workspace/');
		const clearedWorkspace = updateCustomizationEnablementPolicy(workspace, key, [{ kind: CustomizationEnablementKind.Global, enabled: false }], 'file:///workspace/');
		const defaulted = updateCustomizationEnablementPolicy(clearedWorkspace, key, [], undefined);

		assert.deepStrictEqual({ global, workspace, clearedWorkspace, defaulted }, {
			global: { global: { [key]: false } },
			workspace: {
				global: { [key]: false },
				workingDirectories: { 'file:///workspace': { [key]: true } },
			},
			clearedWorkspace: { global: { [key]: false } },
			defaulted: undefined,
		});
	});

	test('does not persist a decision that matches what would be inherited', () => {
		const key = 'plugin.json#mcp=search';
		// Re-enabling globally returns the server to the default, so the entry is
		// dropped rather than stored as an explicit `true` that would accumulate.
		const disabled = updateCustomizationEnablementPolicy(undefined, key, [{ kind: CustomizationEnablementKind.Global, enabled: false }], undefined);
		const reEnabled = updateCustomizationEnablementPolicy(disabled, key, [{ kind: CustomizationEnablementKind.Global, enabled: true }], undefined);
		// A workspace decision matching global is redundant; one that differs is kept.
		const redundantWorkspace = updateCustomizationEnablementPolicy(disabled, key, [{ kind: CustomizationEnablementKind.Global, enabled: false }, { kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: false }], 'file:///repo');
		const meaningfulWorkspace = updateCustomizationEnablementPolicy(disabled, key, [{ kind: CustomizationEnablementKind.Global, enabled: false }, { kind: CustomizationEnablementKind.Workspace, uri: 'file:///repo', enabled: true }], 'file:///repo');

		assert.deepStrictEqual({ disabled, reEnabled, redundantWorkspace, meaningfulWorkspace }, {
			disabled: { global: { [key]: false } },
			reEnabled: undefined,
			redundantWorkspace: { global: { [key]: false } },
			meaningfulWorkspace: { global: { [key]: false }, workingDirectories: { 'file:///repo': { [key]: true } } },
		});
	});

	test('persists workspace enablement only for the primary working directory', () => {
		const key = 'plugin.json#mcp=search';
		const policy = updateCustomizationEnablementPolicy(
			undefined,
			key,
			[{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///secondary', enabled: false }],
			getPrimaryWorkingDirectory(['file:///primary', 'file:///secondary']),
		);

		assert.deepStrictEqual(policy, {
			workingDirectories: { 'file:///primary': { [key]: false } },
		});
	});

	test('does not mutate the policy passed to MCP enablement updates', () => {
		const key = 'plugin.json#mcp=search';
		const policy = {
			global: { [key]: false },
			workingDirectories: { 'file:///workspace': { [key]: false } },
		};

		const next = updateCustomizationEnablementPolicy(policy, key, [{ kind: CustomizationEnablementKind.Global, enabled: false }], undefined);

		assert.deepStrictEqual({ policy, next }, {
			policy: {
				global: { [key]: false },
				workingDirectories: { 'file:///workspace': { [key]: false } },
			},
			next: {
				global: { [key]: false },
				workingDirectories: { 'file:///workspace': { [key]: false } },
			},
		});
	});

	test('session MCP enablement preserves the global policy', () => {
		const { controller, stateManager, session, storageService } = harness(store);
		store.add(controller);
		const id = 'mcp-top-level:copilot:session-1:search';
		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionCustomizationsChanged,
			customizations: [{ type: CustomizationType.McpServer, id, uri: id, name: 'search', enabled: true, state: starting() }],
		});
		stateManager.dispatchServerAction(session, {
			type: ActionType.SessionCustomizationToggled,
			id,
			enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }],
		});
		storageService.set(CustomizationEnablementStorageKey, { global: { 'mcpServers#search': false } });
		controller.applyOne(server('search', starting()));

		assert.deepStrictEqual({
			topLevel: controller.topLevelCustomizations().map(customization => ({
				enabled: customization.enabled,
				enablement: customization.enablement,
			})),
			projected: applySessionMcpServerEnablement([{
				type: CustomizationType.McpServer,
				id,
				uri: id,
				name: 'search',
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				state: starting(),
			}], stateManager.getSessionState(session)?.customizations ?? []).map(customization => ({
				enabled: customization.enabled,
				enablement: customization.enablement,
			})),
		}, {
			topLevel: [{
				enabled: true,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }, { kind: CustomizationEnablementKind.Global, enabled: false }],
			}],
			projected: [{
				enabled: true,
				enablement: [{ kind: CustomizationEnablementKind.Session, enabled: true }, { kind: CustomizationEnablementKind.Global, enabled: false }],
			}],
		});
	});

	test('does not mistake an SDK enablement mismatch for a session override', () => {
		const { controller, storageService } = harness(store);
		store.add(controller);
		storageService.set(CustomizationEnablementStorageKey, { global: { 'mcpServers#search': true } });
		controller.applyOne({ name: 'search', state: starting(), enabled: false });

		assert.deepStrictEqual(controller.topLevelCustomizations().map(customization => ({
			enabled: customization.enabled,
			enablement: customization.enablement,
		})), [{
			enabled: true,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
		}]);
	});

	test('child-backed server: ready/error/ready transitions only update state+channel', () => {
		const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		controller.applyOne(server('fs', ready()));
		controller.applyOne(server('fs', errored('boom')));
		controller.applyOne(server('fs', ready()));

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Error, error: { errorType: 'test-error', message: 'boom' } },
				channel: undefined,
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
		]);
		assert.deepStrictEqual(controller.topLevelCustomizations(), []);
	});

	test('bare server (no child match) is surfaced as a full top-level customization', () => {
		const { controller, actions } = harness(store);
		store.add(controller);

		controller.applyOne(server('search', ready()));

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionCustomizationUpdated,
				customization: {
					type: CustomizationType.McpServer,
					id: expectedId,
					uri: expectedId,
					name: 'search',
					enabled: true,
					state: { kind: McpServerStatus.Ready },
					channel: 'mcp://copilot/session-1/search',
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				},
			},
		]);
		assert.deepStrictEqual(controller.topLevelCustomizations(), [
			{
				type: CustomizationType.McpServer,
				id: expectedId,
				uri: expectedId,
				name: 'search',
				enabled: true,
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/search',
				mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
			},
		]);
	});

	test('non-ready bare server has no channel but still advertises mcpApp (static capability)', () => {
		const { controller, actions } = harness(store);
		store.add(controller);

		controller.applyOne(server('search', starting()));

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionCustomizationUpdated,
				customization: {
					type: CustomizationType.McpServer,
					id: expectedId,
					uri: expectedId,
					name: 'search',
					enabled: true,
					state: { kind: McpServerStatus.Starting },
					channel: undefined,
					mcpApp: { capabilities: { serverTools: { listChanged: true }, serverResources: {}, sampling: {} } },
				},
			},
		]);
	});

	test('removing a bare top-level server emits SessionCustomizationRemoved', () => {
		const { controller, actions } = harness(store);
		store.add(controller);

		controller.applyOne(server('search', ready()));
		actions.length = 0;
		controller.remove('search');

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionCustomizationRemoved,
				id: expectedId,
			},
		]);
		assert.deepStrictEqual(controller.topLevelCustomizations(), []);
	});

	test('applyAll removes servers no longer present (child) and emits Stopped', () => {
		const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		controller.applyAll([server('fs', ready())]);
		controller.applyAll([]);

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Stopped },
			},
		]);
	});

	test('runtimeStates snapshots child and top-level servers by customization id', () => {
		const { controller } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		controller.applyOne(server('fs', ready()));
		controller.applyOne(server('search', starting()));

		assert.deepStrictEqual(controller.runtimeStates.get(), new Map([
			['mcp-child:demo:fs', { state: { kind: McpServerStatus.Ready }, channel: 'mcp://copilot/session-1/fs' }],
			['mcp-top-level:copilot:session-1:search', { state: { kind: McpServerStatus.Starting }, channel: undefined }],
		]));
		assert.strictEqual(controller.serverNameForCustomizationId('mcp-child:demo:fs'), 'fs');
		assert.strictEqual(controller.serverNameForCustomizationId('mcp-top-level:copilot:session-1:search'), 'search');

		controller.remove('fs');
		assert.deepStrictEqual([...controller.runtimeStates.get().keys()], ['mcp-top-level:copilot:session-1:search']);
	});

	test('top-level entry stays top-level across updates (id stable)', () => {
		const { controller, actions } = harness(store);
		store.add(controller);

		controller.applyOne(server('search', starting()));
		controller.applyOne(server('search', ready()));
		controller.applyOne(server('search', stopped()));

		const expectedId = 'mcp-top-level:copilot:session-1:search';
		const ids = actions
			.filter(a => a.type === ActionType.SessionCustomizationUpdated)
			.map(a => (a as { customization: { id: string } }).customization.id);
		assert.deepStrictEqual(ids, [expectedId, expectedId, expectedId]);
	});

	test('bare server publishes reducer-backed enablement across runtime updates', () => {
		const { controller, actions } = harness(store, { desiredEnabled: false });
		store.add(controller);

		controller.applyOne(server('search', authRequired()));
		controller.applyOne(server('search', starting()));

		assert.deepStrictEqual(actions
			.filter(action => action.type === ActionType.SessionCustomizationUpdated)
			.map(action => action.customization.enabled), [false, false]);
	});

	test('authRequired state is preserved across coarse starting updates', () => {
		const { controller, actions } = harness(store, { customizations: PLUGIN_CUSTOMIZATIONS });
		store.add(controller);

		const authState = authRequired();
		controller.applyOne(server('fs', authState));
		controller.applyOne(server('fs', starting()));
		controller.applyOne(server('fs', ready()));

		assert.deepStrictEqual(actions, [
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: authState,
				channel: undefined,
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: authState,
				channel: undefined,
			},
			{
				type: ActionType.SessionMcpServerStateChanged,
				id: 'mcp-child:demo:fs',
				state: { kind: McpServerStatus.Ready },
				channel: 'mcp://copilot/session-1/fs',
			},
		]);
	});

	test('parseMcpChannelUri round-trips the controller-minted channel URI', () => {
		const channel = 'mcp://copilot/session-1/fs';
		assert.deepStrictEqual(parseMcpChannelUri(channel), {
			providerId: 'copilot',
			sessionId: 'session-1',
			serverName: 'fs',
		});
	});

	test('parseMcpChannelUri decodes URL-encoded path segments', () => {
		const channel = 'mcp://copilot/session%2F1/my%20server';
		assert.deepStrictEqual(parseMcpChannelUri(channel), {
			providerId: 'copilot',
			sessionId: 'session/1',
			serverName: 'my server',
		});
	});

	test('parseMcpChannelUri rejects malformed inputs', () => {
		assert.strictEqual(parseMcpChannelUri('https://copilot/x/y'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp:///session/server'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/session-only'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/session/'), undefined);
		// Bad percent escapes must not throw — caller turns undefined
		// into a clean Method not found, not an internal error.
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/bad%/server'), undefined);
		assert.strictEqual(parseMcpChannelUri('mcp://copilot/session/bad%2'), undefined);
	});

	test('findMcpChildId finds bare top-level entries and plugin children', () => {
		const customizations: readonly Customization[] = [
			...PLUGIN_CUSTOMIZATIONS,
			{
				type: CustomizationType.McpServer,
				id: 'mcp-top-level:test:search',
				uri: 'mcp-top-level:test:search',
				name: 'search',
				enabled: true,
				state: { kind: McpServerStatus.Ready },
			},
		];

		assert.strictEqual(findMcpChildId(customizations, 'fs'), 'mcp-child:demo:fs');
		assert.strictEqual(findMcpChildId(customizations, 'search'), 'mcp-top-level:test:search');
		assert.strictEqual(findMcpChildId(customizations, 'missing'), undefined);
	});

	test('findMcpServerName finds bare top-level entries and plugin children', () => {
		const customizations: readonly Customization[] = [
			...PLUGIN_CUSTOMIZATIONS,
			{
				type: CustomizationType.McpServer,
				id: 'mcp-top-level:test:search',
				uri: 'mcp-top-level:test:search',
				name: 'search',
				enabled: true,
				state: { kind: McpServerStatus.Ready },
			},
		];

		assert.strictEqual(findMcpServerName(customizations, 'mcp-child:demo:fs'), 'fs');
		assert.strictEqual(findMcpServerName(customizations, 'mcp-top-level:test:search'), 'search');
		assert.strictEqual(findMcpServerName(customizations, 'missing'), undefined);
	});
});
