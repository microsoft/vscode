/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { AgentSession } from '../../common/agentService.js';
import { CustomizationEnablementKind, CustomizationType, McpServerStatus, SessionStatus, type Customization, type McpServerCustomization, type PluginCustomization } from '../../common/state/protocol/channels-session/state.js';
import { ActionType } from '../../common/state/sessionActions.js';
import { AgentConfigurationService } from '../../node/agentConfigurationService.js';
import { AgentHostCustomizationEnablementService, CustomizationEnablementStorageKey } from '../../node/agentHostCustomizationEnablementService.js';
import { AgentHostStateManager } from '../../node/agentHostStateManager.js';
import { AgentHostStorageService } from '../../node/agentHostStorageService.js';
import { customizationPolicyKey } from '../../node/shared/mcpServerEnablement.js';

suite('AgentHostCustomizationEnablementService', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	test('announces settled enablement changes for propagated sessions', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const source = AgentSession.uri('copilotcli', 'source').toString();
		const propagated = AgentSession.uri('copilotcli', 'propagated').toString();
		const unrelated = AgentSession.uri('copilotcli', 'unrelated').toString();
		const sourceCustomization = createMcpCustomization('source');
		const propagatedCustomization = createMcpCustomization('propagated');

		createSession(stateManager, source);
		createSession(stateManager, propagated);
		createSession(stateManager, unrelated);
		stateManager.dispatchServerAction(source, { type: ActionType.SessionCustomizationsChanged, customizations: [sourceCustomization] });
		stateManager.dispatchServerAction(propagated, { type: ActionType.SessionCustomizationsChanged, customizations: [propagatedCustomization] });
		stateManager.dispatchServerAction(source, {
			type: ActionType.SessionCustomizationToggled,
			id: sourceCustomization.id,
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		});

		const events: Array<{
			source: boolean;
			propagated: boolean;
			unrelated: boolean;
			policyKey: boolean;
			unrelatedPolicyKey: boolean;
			propagatedEnabled: boolean | undefined;
		}> = [];
		disposables.add(service.onDidChangeEnablement(event => {
			events.push({
				source: event.affectsSession(source),
				propagated: event.affectsSession(propagated),
				unrelated: event.affectsSession(unrelated),
				policyKey: event.affectsSome(new Set([customizationPolicyKey(sourceCustomization)])),
				unrelatedPolicyKey: event.affectsSome(new Set(['mcpServers#unrelated'])),
				propagatedEnabled: findMcpCustomization(stateManager.getSessionState(propagated)?.customizations, propagatedCustomization.id)?.enabled,
			});
		}));

		service.handleToggle(source, sourceCustomization.id, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);

		assert.deepStrictEqual(events, [{
			source: true,
			propagated: true,
			unrelated: false,
			policyKey: true,
			unrelatedPolicyKey: false,
			propagatedEnabled: false,
		}]);
	});

	test('persists workspace enablement only for the session primary working directory', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const session = AgentSession.uri('copilotcli', 'primary-working-directory').toString();
		const customization = createMcpCustomization('primary-working-directory');

		createSession(stateManager, session, ['file:///primary', 'file:///secondary']);
		stateManager.dispatchServerAction(session, { type: ActionType.SessionCustomizationsChanged, customizations: [customization] });
		service.handleToggle(session, customization.id, [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///secondary', enabled: false }]);

		assert.deepStrictEqual(storageService.get(CustomizationEnablementStorageKey), {
			workingDirectories: { 'file:///primary': { 'mcpServers#search': false } },
		});
	});

	test('persists workspace plugin enablement for a new session', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const source = AgentSession.uri('copilotcli', 'plugin-source').toString();
		const target = AgentSession.uri('copilotcli', 'plugin-target').toString();
		const workspace = 'file:///workspace';
		const plugin = createPluginCustomization();

		createSession(stateManager, source, [workspace]);
		stateManager.dispatchServerAction(source, { type: ActionType.SessionCustomizationsChanged, customizations: [plugin] });
		service.handleToggle(source, plugin.id, [{ kind: CustomizationEnablementKind.Workspace, uri: workspace, enabled: false }]);

		createSession(stateManager, target, [workspace]);
		assert.deepStrictEqual({
			policy: storageService.get(CustomizationEnablementStorageKey),
			resolved: service.applyEnablement([plugin], workspace),
		}, {
			policy: { workingDirectories: { [workspace]: { [plugin.id]: false } } },
			resolved: [{
				...plugin,
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: workspace, enabled: false }],
			}],
		});
	});

	test('persists enablement for an unpublished plugin and announces the change', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const session = AgentSession.uri('copilotcli', 'unpublished-plugin').toString();
		const pluginId = 'file:///plugins/unpublished';
		const events: Array<{ session: boolean; policyKey: boolean }> = [];

		createSession(stateManager, session);
		disposables.add(service.onDidChangeEnablement(event => {
			events.push({
				session: event.affectsSession(session),
				policyKey: event.affectsSome(new Set([pluginId])),
			});
		}));

		service.handleToggle(session, pluginId, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);

		assert.deepStrictEqual({
			policy: storageService.get(CustomizationEnablementStorageKey),
			events,
		}, {
			policy: { global: { [pluginId]: false } },
			events: [{ session: true, policyKey: true }],
		});
	});

	test('ignores an unpublished MCP server toggle', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const session = AgentSession.uri('copilotcli', 'unpublished-mcp-server').toString();
		const mcpIds = [
			'mcp-top-level:copilotcli:unpublished-mcp-server:search',
			'file:///plugins/unpublished/.mcp.json#mcp=search',
		];
		let eventCount = 0;

		createSession(stateManager, session);
		disposables.add(service.onDidChangeEnablement(() => eventCount++));

		for (const mcpId of mcpIds) {
			service.handleToggle(session, mcpId, [{ kind: CustomizationEnablementKind.Global, enabled: false }]);
		}

		assert.deepStrictEqual({
			policy: storageService.get(CustomizationEnablementStorageKey),
			eventCount,
		}, {
			policy: undefined,
			eventCount: 0,
		});
	});

	test('restores an unpublished plugin after a single enable', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const session = AgentSession.uri('copilotcli', 'unpublished-plugin-enable').toString();
		const plugin = createPluginCustomization();

		createSession(stateManager, session);
		storageService.set(CustomizationEnablementStorageKey, { global: { [plugin.id]: false } });
		service.handleToggle(session, plugin.id, [{ kind: CustomizationEnablementKind.Global, enabled: true }]);

		assert.deepStrictEqual({
			policy: storageService.get(CustomizationEnablementStorageKey),
			resolved: service.applyEnablement([plugin], undefined),
		}, {
			policy: undefined,
			resolved: [plugin],
		});
	});

	test('masks plugin children without erasing their resolved enablement', () => {
		const logService = new NullLogService();
		const stateManager = disposables.add(new AgentHostStateManager(logService));
		const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
		const storageService = disposables.add(new AgentHostStorageService(logService));
		const service = disposables.add(new AgentHostCustomizationEnablementService(storageService, configurationService, stateManager));
		const plugin = createPluginCustomization();
		const child = plugin.children![0] as McpServerCustomization;
		const childPolicyKey = customizationPolicyKey(child, plugin.uri);

		storageService.set(CustomizationEnablementStorageKey, {
			global: { [plugin.id]: false, [childPolicyKey]: true },
		});
		const disabled = service.applyEnablement([plugin], undefined);
		storageService.set(CustomizationEnablementStorageKey, {
			global: { [childPolicyKey]: true },
		});
		const reenabled = service.applyEnablement(disabled, undefined);

		assert.deepStrictEqual({ disabled, reenabled }, {
			disabled: [{
				...plugin,
				enabled: false,
				enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
				children: [{
					...child,
					enabled: true,
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
				}],
			}],
			reenabled: [{
				...plugin,
				enabled: true,
				children: [{
					...child,
					enabled: true,
					enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }],
				}],
			}],
		});
	});
});

function createSession(stateManager: AgentHostStateManager, resource: string, workingDirectories?: string[]): void {
	stateManager.createSession({
		resource,
		provider: 'copilotcli',
		title: 'Test',
		status: SessionStatus.Idle,
		createdAt: new Date().toISOString(),
		modifiedAt: new Date().toISOString(),
		...(workingDirectories ? { workingDirectories } : {}),
	});
}

function createMcpCustomization(sessionId: string): McpServerCustomization {
	return {
		type: CustomizationType.McpServer,
		id: `mcp-top-level:copilotcli:${sessionId}:search`,
		uri: `mcp-top-level:copilotcli:${sessionId}:search`,
		name: 'search',
		enabled: true,
		state: { kind: McpServerStatus.Ready },
	};
}

function createPluginCustomization(): PluginCustomization {
	return {
		type: CustomizationType.Plugin,
		id: 'file:///plugins/demo',
		uri: 'file:///plugins/demo',
		name: 'demo',
		enabled: true,
		children: [createMcpCustomization('plugin-child')],
	};
}

function findMcpCustomization(customizations: readonly Customization[] | undefined, id: string): McpServerCustomization | undefined {
	return customizations?.find((customization): customization is McpServerCustomization => customization.type === CustomizationType.McpServer && customization.id === id);
}
