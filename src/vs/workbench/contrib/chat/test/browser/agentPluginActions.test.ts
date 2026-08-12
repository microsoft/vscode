/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { PluginFormat } from '../../../../../platform/agentPlugins/common/pluginParsers.js';
import { createUninstallPluginAction } from '../../browser/agentPluginActions.js';
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
});
