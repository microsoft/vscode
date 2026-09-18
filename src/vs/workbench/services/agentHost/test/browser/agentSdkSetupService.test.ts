/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { hasKey } from '../../../../../base/common/types.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, agentSdkSetupStatusKey, type AgentSdkDownloadStatus } from '../../../../../platform/agentHost/common/agentSdkSetup.js';
import { IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import type { RootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, type IRootConfigChangedAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { NullTelemetryService } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { AgentSdkSetupService } from '../../browser/agentSdkSetupService.js';
import { ICodexAccountService } from '../../browser/codexAccountService.js';

suite('AgentSdkSetupService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createFixture(initialDownloads: Readonly<Record<string, AgentSdkDownloadStatus>>) {
		const onDidChangeRootState = store.add(new Emitter<RootState>());
		let rootStateValue: RootState = setupRootState(initialDownloads);
		const dispatched: IRootConfigChangedAction[] = [];
		const agentHostService = new class extends mock<IAgentHostService>() {
			override readonly onAgentHostStart = Event.None;
			override readonly rootState = new class extends mock<IAgentHostService['rootState']>() {
				override get value(): RootState {
					return rootStateValue;
				}
				override readonly onDidChange = onDidChangeRootState.event;
			}();

			override dispatch(...[, action]: Parameters<IAgentHostService['dispatch']>): void {
				if (action.type === ActionType.RootConfigChanged) {
					dispatched.push(action);
				}
			}
		}();
		const service = store.add(new AgentSdkSetupService(
			agentHostService,
			NullTelemetryService,
			new NullLogService(),
			new class extends mock<IOpenerService>() { }(),
			new class extends mock<ICommandService>() { }(),
			new class extends mock<ICodexAccountService>() {
				override readonly agent = 'codex';
				override signIn(): void { }
			}(),
		));
		const setDownloads = (downloads: Readonly<Record<string, AgentSdkDownloadStatus>>) => {
			rootStateValue = setupRootState(downloads);
			onDidChangeRootState.fire(rootStateValue);
		};
		const requestedAgents = () => dispatched.map(action => {
			const request = action.config[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY];
			assert.ok(request && typeof request === 'object' && hasKey(request, { agent: true }) && typeof request.agent === 'string');
			return request.agent;
		});
		return { service, setDownloads, requestedAgents };
	}

	test('starts only missing selected SDKs and deduplicates concurrent requests', () => {
		const fixture = createFixture({
			claude: 'notDownloaded',
			codex: 'downloadOnUse',
			installed: 'ready',
			active: 'downloading',
		});

		fixture.service.requestDownloadOnUse('claude');
		fixture.service.requestDownloadOnUse('claude');
		fixture.service.requestDownloadOnUse('installed');
		fixture.service.requestDownloadOnUse('active');
		fixture.service.requestDownloadOnUse('unpublished');
		fixture.service.requestDownloadOnUse('codex');

		assert.deepStrictEqual(fixture.requestedAgents(), ['claude', 'codex']);
	});

	test('allows a failed download to be retried without disturbing another agent', () => {
		const fixture = createFixture({ claude: 'notDownloaded', codex: 'ready' });

		fixture.service.requestDownloadOnUse('claude');
		fixture.setDownloads({ claude: 'downloading', codex: 'ready' });
		fixture.service.requestDownloadOnUse('claude');
		fixture.setDownloads({ claude: 'notDownloaded', codex: 'ready' });
		fixture.service.requestDownloadOnUse('claude');

		assert.deepStrictEqual(fixture.requestedAgents(), ['claude', 'claude']);
	});
});

function setupRootState(downloads: Readonly<Record<string, AgentSdkDownloadStatus>>): RootState {
	return {
		agents: [],
		_meta: Object.fromEntries(Object.entries(downloads).map(([agent, download]) => [agentSdkSetupStatusKey(agent), { download }])),
	};
}
