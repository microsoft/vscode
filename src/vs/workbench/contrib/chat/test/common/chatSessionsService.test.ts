/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { getAddModelsUnavailableReason } from '../../common/chatSessionsService.js';

suite('getAddModelsUnavailableReason', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('only the remotely running Copilot agent-host harness cannot add models', () => {
		const reason = (sessionType: string | undefined, remoteAuthority?: string) => getAddModelsUnavailableReason(sessionType, remoteAuthority) !== undefined;
		assert.deepStrictEqual({
			noHarness: reason(undefined, 'ssh-remote+host'),
			localHarnessInRemoteWindow: reason('local', 'ssh-remote+host'),
			copilotHarnessLocally: reason('agent-host-copilotcli'),
			copilotHarnessInRemoteWindow: reason('agent-host-copilotcli', 'ssh-remote+host'),
			remoteAgentHostCopilotHarness: reason('remote-my-host-copilotcli'),
			remoteAgentHostClaudeHarness: reason('remote-my-host-claude'),
			claudeHarnessInRemoteWindow: reason('agent-host-claude', 'ssh-remote+host'),
		}, {
			noHarness: false,
			localHarnessInRemoteWindow: false,
			copilotHarnessLocally: false,
			copilotHarnessInRemoteWindow: true,
			remoteAgentHostCopilotHarness: true,
			remoteAgentHostClaudeHarness: false,
			claudeHarnessInRemoteWindow: false,
		});
	});
});
