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
import { IAgentPlugin } from '../../common/plugins/agentPluginService.js';

suite('AgentPluginActions', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createPlugin(remove?: () => void): IAgentPlugin {
		return {
			uri: URI.file('/plugins/local-plugin'),
			format: PluginFormat.Copilot,
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
		const actions = getAgentHostPluginEnablementActions(service, URI.parse('vscode-agent-session:///session-1'), customization, true);

		assert.deepStrictEqual(actions.map(action => action.label), ['Disable', 'Enable (Workspace)', 'Enable (Session)']);
		actions[1].run();
		assert.deepStrictEqual(calls, [[URI.parse('vscode-agent-session:///session-1'), 'host-plugin', customization.enablement, CustomizationEnablementKind.Workspace, true]]);
	});
});
