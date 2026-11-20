/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { CopilotAgentStartupConfig } from '../../node/copilot/copilotAgentStartupConfig.js';

suite('CopilotAgentStartupConfig', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('compares and describes startup configuration changes', () => {
		const previous = new CopilotAgentStartupConfig(true, false, false, 15_000, 'info', undefined, undefined, true, true, false, {}, true, false, '', false);
		const same = new CopilotAgentStartupConfig(true, false, false, 15_000, 'info', undefined, undefined, true, true, false, {}, true, false, '', false);
		const changed = new CopilotAgentStartupConfig(true, true, true, 30_000, 'trace', '/usr/local/bin/copilot-runtime', 'github.example.com', false, false, true, { deny: ['shell(*)'] }, false, false, 'gpt-5', true, true, 'exec-agent-b', true);

		assert.deepStrictEqual({
			same: same.equals(previous),
			changed: changed.equals(previous),
			proxyTargetChanged: changed.proxyTargetChangedFrom(previous),
			description: changed.describeChangesFrom(previous),
		}, {
			same: true,
			changed: false,
			proxyTargetChanged: true,
			description: 'claudeAdvisor=true, localMemory=true, skillCharBudget=30000, copilotSdkLogLevel=trace, runtimePath=/usr/local/bin/copilot-runtime, enterpriseHost=github.example.com, systemProxy=false, githubMcpServer=false, copilotConnectors=true, managedSettingsPermissions, localIndexEnabled=false, searchSubagentModel=gpt-5, localModel=true, executionSubagent=true, executionSubagentModel=exec-agent-b, computerUse=true',
		});
	});

	test('compares policy helper additions, changes and removal without disclosing values', () => {
		const config = (policyHelper?: string) => new CopilotAgentStartupConfig(
			true, false, false, 30_000, 'info', undefined, undefined, true, true, false, {}, true,
			false, '', false, false, undefined, false, policyHelper,
		);
		const unset = config();
		const initial = config('{"path":"/private/helper","args":[]}');
		const pathChanged = config('{"path":"/private/other-helper","args":[]}');
		const argsChanged = config('{"path":"/private/helper","args":["private-argument"]}');
		assert.deepStrictEqual({
			same: initial.equals(config(initial.policyHelper)),
			changes: [[initial, unset], [pathChanged, initial], [argsChanged, initial], [unset, initial]]
				.map(([current, previous]) => ({
					equal: current.equals(previous),
					proxyChanged: current.proxyTargetChangedFrom(previous),
					description: current.describeChangesFrom(previous),
				})),
		}, {
			same: true,
			changes: Array.from({ length: 4 }, () => ({ equal: false, proxyChanged: false, description: 'policyHelper' })),
		});
	});

});
