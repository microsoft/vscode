/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IConfirmation, IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ShutdownReason } from '../../../../services/lifecycle/common/lifecycle.js';
import { AgentSessionProviders } from '../../browser/agentSessions/agentSessions.js';
import { AgentSessionStatus } from '../../browser/agentSessions/agentSessionsModel.js';
import { confirmSessionShutdown, getEffectiveSessionShutdownReason, shouldWarnForInFlightSessionShutdown, shouldWarnForSessionShutdown } from '../../electron-browser/chatLifecycle.js';

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
			{ name: 'local agent host Copilot', warnings: warningsByReason(createSession(AgentSessionProviders.AgentHostCopilot)) },
			{ name: 'local agent host Claude', warnings: warningsByReason(createSession(AgentSessionProviders.AgentHostClaude)) },
			{ name: 'local agent host Codex', warnings: warningsByReason(createSession(AgentSessionProviders.AgentHostCodex)) },
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
			{ name: 'local agent host Copilot', warnings: { close: false, load: false, reload: false, quit: true } },
			{ name: 'local agent host Claude', warnings: { close: false, load: false, reload: false, quit: true } },
			{ name: 'local agent host Codex', warnings: { close: false, load: false, reload: false, quit: true } },
			{ name: 'dynamic local agent host', warnings: { close: false, load: false, reload: false, quit: true } },
			{ name: 'remote agent host', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'dynamic remote agent host', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'archived', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'completed', warnings: { close: false, load: false, reload: false, quit: false } },
			{ name: 'needs input', warnings: { close: true, load: true, reload: true, quit: true } },
		]);
	});

	test('treats closing the last non-macOS window as application quit', () => {
		const localAgentHostSessions = [
			AgentSessionProviders.AgentHostCopilot,
			AgentSessionProviders.AgentHostClaude,
			AgentSessionProviders.AgentHostCodex,
		].map(provider => createSession(provider));
		const scenarios = [
			{ name: 'last Windows/Linux window', reason: ShutdownReason.CLOSE, windowCount: 1, macintosh: false },
			{ name: 'another Windows/Linux window remains', reason: ShutdownReason.CLOSE, windowCount: 2, macintosh: false },
			{ name: 'last macOS window', reason: ShutdownReason.CLOSE, windowCount: 1, macintosh: true },
			{ name: 'explicit quit', reason: ShutdownReason.QUIT, windowCount: 2, macintosh: false },
		];

		assert.deepStrictEqual(scenarios.map(scenario => {
			const effectiveReason = getEffectiveSessionShutdownReason(scenario.reason, scenario.windowCount, scenario.macintosh);
			return {
				name: scenario.name,
				effectiveReason,
				warnings: localAgentHostSessions.map(session => shouldWarnForSessionShutdown(session, effectiveReason)),
			};
		}), [
			{ name: 'last Windows/Linux window', effectiveReason: ShutdownReason.QUIT, warnings: [true, true, true] },
			{ name: 'another Windows/Linux window remains', effectiveReason: ShutdownReason.CLOSE, warnings: [false, false, false] },
			{ name: 'last macOS window', effectiveReason: ShutdownReason.CLOSE, warnings: [false, false, false] },
			{ name: 'explicit quit', effectiveReason: ShutdownReason.QUIT, warnings: [true, true, true] },
		]);
	});

	test('warns for local Agent Host session materialization only on quit', () => {
		assert.deepStrictEqual({
			localQuit: shouldWarnForInFlightSessionShutdown([AgentSessionProviders.AgentHostCopilot], ShutdownReason.QUIT),
			claudeQuit: shouldWarnForInFlightSessionShutdown([AgentSessionProviders.AgentHostClaude], ShutdownReason.QUIT),
			codexQuit: shouldWarnForInFlightSessionShutdown([AgentSessionProviders.AgentHostCodex], ShutdownReason.QUIT),
			localClose: shouldWarnForInFlightSessionShutdown([AgentSessionProviders.AgentHostCopilot], ShutdownReason.CLOSE),
			cloudQuit: shouldWarnForInFlightSessionShutdown([AgentSessionProviders.Cloud], ShutdownReason.QUIT),
		}, {
			localQuit: true,
			claudeQuit: true,
			codexQuit: true,
			localClose: false,
			cloudQuit: false,
		});
	});

	test('uses a custom shutdown confirmation attached to the closing window', async () => {
		let confirmation: IConfirmation | undefined;
		const confirmed = await confirmSessionShutdown(upcastPartial<IDialogService>({
			confirm: async options => {
				confirmation = options;
				return { confirmed: true };
			},
		}), ShutdownReason.QUIT);

		assert.deepStrictEqual({
			confirmed,
			custom: confirmation?.custom,
		}, {
			confirmed: true,
			custom: true,
		});
	});

	ensureNoDisposablesAreLeakedInTestSuite();
});
