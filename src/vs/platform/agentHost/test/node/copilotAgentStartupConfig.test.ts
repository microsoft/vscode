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
		const previous = new CopilotAgentStartupConfig(false, true, false, 'info', undefined, true, true, {});
		const same = new CopilotAgentStartupConfig(false, true, false, 'info', undefined, true, true, {});
		const changed = new CopilotAgentStartupConfig(true, true, true, 'trace', 'github.example.com', false, false, { deny: ['shell(*)'] });

		assert.deepStrictEqual({
			same: same.equals(previous),
			changed: changed.equals(previous),
			proxyTargetChanged: changed.proxyTargetChangedFrom(previous),
			description: changed.describeChangesFrom(previous),
		}, {
			same: true,
			changed: false,
			proxyTargetChanged: true,
			description: 'sessionSync=true, multiTurnContextRouting=true, copilotSdkLogLevel=trace, enterpriseHost=github.example.com, systemProxy=false, githubMcpServer=false, managedSettingsPermissions',
		});
	});

	test('changing the local canvas gate requires a new SDK client negotiation', () => {
		const previous = new CopilotAgentStartupConfig(false, false, false, 'info', undefined, false, false, {});
		const enabled = new CopilotAgentStartupConfig(false, false, false, 'info', undefined, false, false, {}, true);
		assert.deepStrictEqual({
			equal: enabled.equals(previous),
			description: enabled.describeChangesFrom(previous),
			proxyChanged: enabled.proxyTargetChangedFrom(previous),
		}, { equal: false, description: 'localCanvases=true', proxyChanged: false });
	});
});
