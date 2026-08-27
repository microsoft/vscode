/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { CustomizationEnablementKind, CustomizationType, type PluginCustomization } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { createUninstallPluginAction, getAgentHostPluginEnablementActions } from '../../browser/agentPluginActions.js';
import { IAgentHostCustomizationService } from '../../browser/agentSessions/agentHost/agentHostCustomizationService.js';
import { ContributionEnablementState } from '../../common/enablement.js';
import { AgentPluginDiscoveryOrigin, IAgentPlugin, IAgentPluginService } from '../../common/plugins/agentPluginService.js';

suite('AgentPluginActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPlugin(remove?: () => void): IAgentPlugin {
		return {
			uri: URI.file('/plugins/local-plugin'),
			format: PluginFormat.Copilot,
			discoveryOrigin: AgentPluginDiscoveryOrigin.ConfiguredPath,
			label: 'Local Plugin',
			enablement: observableValue('enablement', ContributionEnablementState.EnabledProfile),
			remove,
			hooks: observableValue('hooks', []),
			commands: observableValue('commands', []),
			skills: observableValue('skills', []),
			agents: observableValue('agents', []),
			instructions: observableValue('instructions', []),
			mcpServerDefinitions: observableValue('mcpServerDefinitions', []),
		};
	}

	function createAgentPluginService(calls: unknown[][]): IAgentPluginService {
		return {
			enablementModel: {
				setEnabled: (...args: unknown[]) => calls.push(args),
			},
		} as unknown as IAgentPluginService;
	}

	test('creates uninstall action for a removable local plugin', async () => {
		let removeCount = 0;
		const action = createUninstallPluginAction(createPlugin(() => removeCount++));

		assert.ok(action);
		store.add(action);
		await action.run();

		assert.strictEqual(removeCount, 1);
	});

	test('does not create uninstall action for a non-removable plugin', () => {
		assert.strictEqual(createUninstallPluginAction(createPlugin()), undefined);
	});

	test('offers scoped enablement actions for host-published plugins', () => {
		const customization = {
			type: CustomizationType.Plugin,
			id: 'host-plugin',
			name: 'Host Plugin',
			uri: 'file:///plugins/host-plugin',
			load: { kind: 'loaded' },
			enablement: [{ kind: CustomizationEnablementKind.Workspace, uri: 'file:///workspace', enabled: false }],
		} as PluginCustomization;
		const calls: unknown[][] = [];
		const service = {
			setCustomizationEnablement: (...args: unknown[]) => calls.push(args),
		} as unknown as IAgentHostCustomizationService;
		const actions = getAgentHostPluginEnablementActions(service, createAgentPluginService([]), URI.parse('vscode-agent-session:///session-1'), customization, true);

		assert.deepStrictEqual(actions.map(action => action.label), ['Disable', 'Enable (Workspace)', 'Enable (Session)']);
		actions[1].run();
		assert.deepStrictEqual(calls, [[URI.parse('vscode-agent-session:///session-1'), 'host-plugin', customization.enablement, CustomizationEnablementKind.Workspace, true]]);
	});

	test('writes client-published global plugin enablement locally', () => {
		const customization = {
			type: CustomizationType.Plugin,
			id: 'client-plugin',
			name: 'Client Plugin',
			uri: URI.file('/plugins/client-plugin').toString(),
			clientId: 'client-1',
			load: { kind: 'loaded' },
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		} as PluginCustomization;
		const hostCalls: unknown[][] = [];
		const clientCalls: unknown[][] = [];
		const actions = getAgentHostPluginEnablementActions({
			setCustomizationEnablement: (...args: unknown[]) => hostCalls.push(args),
		} as unknown as IAgentHostCustomizationService, createAgentPluginService(clientCalls), URI.parse('vscode-agent-session:///session-1'), customization, true);

		actions[0].run();

		assert.deepStrictEqual({ clientCalls, hostCalls }, {
			clientCalls: [[customization.uri.toString(), ContributionEnablementState.EnabledProfile]],
			hostCalls: [],
		});
	});

	test('writes host-discovered global plugin enablement to the host', () => {
		const customization = {
			type: CustomizationType.Plugin,
			id: 'host-plugin',
			name: 'Host Plugin',
			uri: URI.file('/plugins/host-plugin').toString(),
			load: { kind: 'loaded' },
			enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
		} as PluginCustomization;
		const hostCalls: unknown[][] = [];
		const clientCalls: unknown[][] = [];
		const sessionResource = URI.parse('vscode-agent-session:///session-1');
		const actions = getAgentHostPluginEnablementActions({
			setCustomizationEnablement: (...args: unknown[]) => hostCalls.push(args),
		} as unknown as IAgentHostCustomizationService, createAgentPluginService(clientCalls), sessionResource, customization, true);

		actions[0].run();

		assert.deepStrictEqual({ clientCalls, hostCalls }, {
			clientCalls: [],
			hostCalls: [[sessionResource, 'host-plugin', customization.enablement, CustomizationEnablementKind.Global, true]],
		});
	});
});
