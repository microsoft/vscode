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
		const previous = new CopilotAgentStartupConfig(false, true, false, false, false, false, false, false, 15_000, 'info', undefined, undefined, true, true, false, {}, true, false, false);
		const same = new CopilotAgentStartupConfig(false, true, false, false, false, false, false, false, 15_000, 'info', undefined, undefined, true, true, false, {}, true, false, false);
		const changed = new CopilotAgentStartupConfig(true, true, true, true, true, true, true, true, 30_000, 'trace', '/usr/local/bin/copilot-runtime', 'github.example.com', false, false, true, { deny: ['shell(*)'] }, false, false, true);

		assert.deepStrictEqual({
			same: same.equals(previous),
			changed: changed.equals(previous),
			proxyTargetChanged: changed.proxyTargetChangedFrom(previous),
			description: changed.describeChangesFrom(previous),
		}, {
			same: true,
			changed: false,
			proxyTargetChanged: true,
			description: 'sessionSync=true, claudeAdvisor=true, tgrep=true, hydraFusion=true, hydraFusionV2=true, hydraFusionMultiRoot=true, localMemory=true, skillCharBudget=30000, copilotSdkLogLevel=trace, runtimePath=/usr/local/bin/copilot-runtime, enterpriseHost=github.example.com, systemProxy=false, githubMcpServer=false, copilotConnectors=true, managedSettingsPermissions, localIndexEnabled=false, localModel=true',
		});
	});

	test('scoped comparison ignores only forced-off startup capabilities', () => {
		const config = (sync: boolean, connectors: boolean, index: boolean, localModel: boolean, budget = 15_000) =>
			new CopilotAgentStartupConfig(sync, true, false, false, false, false, false, false, budget, 'info', undefined, undefined, true, true, connectors, {}, index, false, localModel);
		const baseline = config(false, false, false, false);
		assert.deepStrictEqual([
			config(true, true, true, true),
			config(false, false, false, false, 30_000),
		].map(candidate => ({ legacy: candidate.equals(baseline), scoped: candidate.equalsForScopedRuntime(baseline) })), [
			{ legacy: false, scoped: true }, { legacy: false, scoped: false },
		]);
	});
});
