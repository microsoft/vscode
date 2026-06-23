/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { ContributionEnablementState, IEnablementModel, isContributionEnabled } from '../../../common/enablement.js';
import { AgentPluginCollisionEnablementModel, getCanonicalAgentPluginCollisionGroups, getSortedAgentPlugins, IDiscoveredAgentPlugins } from '../../../common/plugins/agentPluginEnablement.js';
import { AgentPluginDiscoveryPriority, IAgentPlugin } from '../../../common/plugins/agentPluginService.js';
import { IMarketplacePlugin, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('AgentPlugin enablement', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function makePlugin(uri: URI, label: string, fromMarketplace?: IMarketplacePlugin): IAgentPlugin {
		return {
			uri,
			label,
			enablement: observableValue('testPluginEnablement', ContributionEnablementState.EnabledProfile),
			hooks: observableValue('testPluginHooks', []),
			commands: observableValue('testPluginCommands', []),
			skills: observableValue('testPluginSkills', []),
			agents: observableValue('testPluginAgents', []),
			instructions: observableValue('testPluginInstructions', []),
			mcpServerDefinitions: observableValue('testPluginMcpServerDefinitions', []),
			fromMarketplace,
		};
	}

	function makeMarketplacePlugin(): IMarketplacePlugin {
		const marketplaceReference = parseMarketplaceReference('microsoft/vscode-team-kit');
		assert.ok(marketplaceReference);
		return {
			name: 'model-council',
			description: '',
			version: '',
			source: 'model-council',
			sourceDescriptor: { kind: PluginSourceKind.RelativePath, path: 'model-council' },
			marketplace: 'microsoft/vscode-team-kit',
			marketplaceReference,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	function makeTestEnablementModel(): IEnablementModel {
		const state = new Map<string, ContributionEnablementState>();
		return {
			readEnabled: key => state.get(key) ?? ContributionEnablementState.EnabledProfile,
			setEnabled: (key, value) => state.set(key, value),
			remove: key => state.delete(key),
		};
	}

	test('colliding marketplace and Copilot CLI direct installs use priority-ordered enablement', () => {
		const marketplaceUri = URI.file('/Users/test/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council');
		const copilotCliDirectUri = URI.file('/Users/test/.copilot/installed-plugins/_direct/microsoft--vscode-team-kit--model-council');
		const discoveries: IDiscoveredAgentPlugins[] = [
			{
				priority: AgentPluginDiscoveryPriority.CopilotCli,
				order: 3,
				plugins: [makePlugin(copilotCliDirectUri, 'model-council')],
			},
			{
				priority: AgentPluginDiscoveryPriority.Marketplace,
				order: 1,
				plugins: [makePlugin(marketplaceUri, 'model-council', makeMarketplacePlugin())],
			},
		];

		const plugins = getSortedAgentPlugins(discoveries);
		const collisionGroups = observableValue('pluginCollisionGroups', getCanonicalAgentPluginCollisionGroups(discoveries));
		const enablementModel = new AgentPluginCollisionEnablementModel(makeTestEnablementModel(), collisionGroups);

		enablementModel.setEnabled(copilotCliDirectUri.toString(), ContributionEnablementState.EnabledWorkspace);

		assert.deepStrictEqual({
			plugins: plugins.map(plugin => plugin.uri.toString()),
			marketplaceInitiallyEnabled: isContributionEnabled(new AgentPluginCollisionEnablementModel(makeTestEnablementModel(), collisionGroups).readEnabled(marketplaceUri.toString())),
			copilotCliInitiallyEnabled: isContributionEnabled(new AgentPluginCollisionEnablementModel(makeTestEnablementModel(), collisionGroups).readEnabled(copilotCliDirectUri.toString())),
			marketplaceAfterEnablingCli: enablementModel.readEnabled(marketplaceUri.toString()),
			copilotCliAfterEnablingCli: enablementModel.readEnabled(copilotCliDirectUri.toString()),
		}, {
			plugins: [copilotCliDirectUri.toString(), marketplaceUri.toString()],
			marketplaceInitiallyEnabled: true,
			copilotCliInitiallyEnabled: false,
			marketplaceAfterEnablingCli: ContributionEnablementState.DisabledWorkspace,
			copilotCliAfterEnablingCli: ContributionEnablementState.EnabledWorkspace,
		});
	});

	test('policy-blocked duplicate does not suppress allowed duplicate', () => {
		const marketplaceUri = URI.file('/Users/test/.vscode-insiders/agent-plugins/github.com/microsoft/vscode-team-kit/model-council');
		const copilotCliDirectUri = URI.file('/Users/test/.copilot/installed-plugins/_direct/microsoft--vscode-team-kit--model-council');
		const discoveries: IDiscoveredAgentPlugins[] = [
			{
				priority: AgentPluginDiscoveryPriority.Marketplace,
				order: 1,
				plugins: [makePlugin(marketplaceUri, 'model-council', makeMarketplacePlugin())],
			},
			{
				priority: AgentPluginDiscoveryPriority.CopilotCli,
				order: 3,
				plugins: [makePlugin(copilotCliDirectUri, 'model-council')],
			},
		];

		const collisionGroups = observableValue(
			'pluginCollisionGroups',
			getCanonicalAgentPluginCollisionGroups(discoveries, plugin => plugin.uri.toString() === marketplaceUri.toString()),
		);
		const enablementModel = new AgentPluginCollisionEnablementModel(makeTestEnablementModel(), collisionGroups);

		assert.ok(isContributionEnabled(enablementModel.readEnabled(copilotCliDirectUri.toString())));
	});

	test('same-URI duplicates collapse before collision grouping', () => {
		const sharedUri = URI.file('/Users/test/.copilot/installed-plugins/team/model-council');
		const discoveries: IDiscoveredAgentPlugins[] = [
			{
				priority: AgentPluginDiscoveryPriority.Configured,
				order: 0,
				plugins: [makePlugin(sharedUri, 'model-council')],
			},
			{
				priority: AgentPluginDiscoveryPriority.CopilotCli,
				order: 3,
				plugins: [makePlugin(sharedUri, 'model-council')],
			},
		];

		assert.deepStrictEqual({
			plugins: getSortedAgentPlugins(discoveries).map(plugin => plugin.uri.toString()),
			collisionGroupCount: getCanonicalAgentPluginCollisionGroups(discoveries).size,
		}, {
			plugins: [sharedUri.toString()],
			collisionGroupCount: 0,
		});
	});
});
