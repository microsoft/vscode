/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { AgentHostSdkSandboxEnabledSettingId, AgentHostSdkSandboxWindowsEnabledSettingId } from '../../../../../../../platform/agentHost/common/agentService.js';
import { AgentSandboxSettingId } from '../../../../../../../platform/sandbox/common/settings.js';
import { getPermissionSandboxSettingId } from '../../../../browser/widget/input/permissionPickerActionItem.js';
import { SessionType } from '../../../../common/chatSessionsService.js';

suite('PermissionPickerActionItem', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('resolves the sandbox setting for supported session types', () => {
		assert.deepStrictEqual({
			local: getPermissionSandboxSettingId(SessionType.Local, false, false),
			localWindows: getPermissionSandboxSettingId(SessionType.Local, false, true),
			copilotSdk: getPermissionSandboxSettingId(SessionType.AgentHostCopilot, false, false),
			copilotSdkWindows: getPermissionSandboxSettingId(SessionType.AgentHostCopilot, false, true),
			copilotCustomTerminal: getPermissionSandboxSettingId(SessionType.AgentHostCopilot, true, false),
			claude: getPermissionSandboxSettingId(SessionType.AgentHostClaude, false, false),
		}, {
			local: AgentSandboxSettingId.AgentSandboxEnabled,
			localWindows: AgentSandboxSettingId.AgentSandboxWindowsEnabled,
			copilotSdk: AgentHostSdkSandboxEnabledSettingId,
			copilotSdkWindows: AgentHostSdkSandboxWindowsEnabledSettingId,
			copilotCustomTerminal: AgentSandboxSettingId.AgentSandboxEnabled,
			claude: undefined,
		});
	});
});
