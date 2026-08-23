/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ShutdownReason } from '../../../../services/lifecycle/common/lifecycle.js';
import { AgentSessionProviders } from '../../browser/agentSessions/agentSessions.js';
import { AgentSessionStatus } from '../../browser/agentSessions/agentSessionsModel.js';
import { shouldWarnForSessionShutdown } from '../../electron-browser/chatLifecycle.js';

suite('ChatLifecycle', () => {
	type TestSession = Parameters<typeof shouldWarnForSessionShutdown>[0];

	function createSession(providerType: string, status = AgentSessionStatus.InProgress, archived = false): TestSession {
		return {
			providerType,
			status,
			isArchived: () => archived
		};
	}

	function warningsByReason(session: TestSession): Record<string, boolean> {
		return {
			close: shouldWarnForSessionShutdown(session, ShutdownReason.CLOSE),
			load: shouldWarnForSessionShutdown(session, ShutdownReason.LOAD),
			reload: shouldWarnForSessionShutdown(session, ShutdownReason.RELOAD),
			quit: shouldWarnForSessionShutdown(session, ShutdownReason.QUIT)
		};
	}

	test('shouldWarnForSessionShutdown', () => {
		assert.deepStrictEqual([
			{ name: 'local', warnings: warningsByReason(createSession(AgentSessionProviders.Local)) },
			{ name: 'background', warnings: warningsByReason(createSession(AgentSessionProviders.Background)) },
			{ name: 'cloud', warnings: warningsByReason(createSession(AgentSessionProviders.Cloud)) },
			{ name: 'local agent host', warnings: warningsByReason(createSession(AgentSessionProviders.AgentHostCopilot)) },
			{ name: 'dynamic local agent host', warnings: warningsByReason(createSession('agent-host-foo')) },
			{ name: 'remote agent host', warnings: warningsByReason(createSession('remote-host-copilotcli')) },
			{ name: 'dynamic remote agent host', warnings: warningsByReason(createSession('remote-foo')) },
			{ name: 'archived', warnings: warningsByReason(createSession(AgentSessionProviders.Local, AgentSessionStatus.InProgress, true)) },
			{ name: 'completed', warnings: warningsByReason(createSession(AgentSessionProviders.Local, AgentSessionStatus.Completed)) },
			{ name: 'needs input', warnings: warningsByReason(createSession(AgentSessionProviders.Local, AgentSessionStatus.NeedsInput)) },
		], [
			{ name: 'local', warnings: { close: true, load: true, reload: true, quit: true } },
			{ name: 'background', warnings: { close: true, load: true, reload: true, quit: true } },
			{ name: 'cloud', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'local agent host', warnings: { close: false, load: false, reload: false, quit: true } },
			{ name: 'dynamic local agent host', warnings: { close: false, load: false, reload: false, quit: true } },
			{ name: 'remote agent host', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'dynamic remote agent host', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'archived', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'completed', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'needs input', warnings: { close: true, load: true, reload: true, quit: true } },
		]);
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
