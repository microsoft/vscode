/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../../platform/agentPlugins/common/pluginParsers.js';
import { findInstalledPlugin } from '../../../browser/agentPluginEditor/agentPluginItems.js';
import { ContributionEnablementState } from '../../../common/enablement.js';
import { IAgentPlugin } from '../../../common/plugins/agentPluginService.js';
import { IMarketplacePlugin, MarketplaceType, parseMarketplaceReference, PluginSourceKind } from '../../../common/plugins/pluginMarketplaceService.js';

suite('AgentPlugin items', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function marketplace(name = 'test', repo = 'owner/marketplace'): IMarketplacePlugin {
		const marketplaceReference = parseMarketplaceReference(repo);
		assert.ok(marketplaceReference);
		return {
			name,
			description: '',
			version: '',
			source: '',
			sourceDescriptor: { kind: PluginSourceKind.GitHub, repo: 'owner/plugin', ref: 'main' },
			marketplace: repo,
			marketplaceReference,
			marketplaceType: MarketplaceType.Copilot,
		};
	}

	function installed(uri: URI, fromMarketplace?: IMarketplacePlugin): IAgentPlugin {
		return {
			uri,
			label: 'test',
			format: PluginFormat.Copilot,
			enablement: observableValue('enablement', ContributionEnablementState.EnabledProfile),
			hooks: observableValue('hooks', []),
			commands: observableValue('commands', []),
			skills: observableValue('skills', []),
			agents: observableValue('agents', []),
			instructions: observableValue('instructions', []),
			mcpServerDefinitions: observableValue('mcpServers', []),
			automations: observableValue('automations', []),
			fromMarketplace,
		};
	}

	test('reconciles an open editor and marketplace row with a replacement installation', () => {
		const oldUri = URI.file('/plugins/old');
		const newUri = URI.file('/plugins/new');
		const plugin = installed(newUri, marketplace());
		assert.strictEqual(findInstalledPlugin([plugin], oldUri, marketplace()), plugin);
	});

	test('keeps a missing installation available for marketplace recovery', () => {
		assert.strictEqual(findInstalledPlugin([], URI.file('/plugins/missing'), marketplace()), undefined);
	});

	test('does not conflate different names or marketplaces after a URI change', () => {
		const uri = URI.file('/plugins/old');
		const otherUri = URI.file('/plugins/other');
		assert.deepStrictEqual([
			findInstalledPlugin([installed(otherUri, marketplace('another'))], uri, marketplace()),
			findInstalledPlugin([installed(otherUri, marketplace('test', 'owner/another'))], uri, marketplace()),
		], [undefined, undefined]);
	});

	test('still matches direct installations by URI', () => {
		const uri = URI.file('/plugins/direct');
		const plugin = installed(uri);
		assert.strictEqual(findInstalledPlugin([plugin], uri), plugin);
	});
});
