/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { toDisposable } from '../../../../../../base/common/lifecycle.js';
import { constObservable } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { AgentHostClientState, AgentHostProtocolClient } from '../../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { remoteAgentHostLogOutputChannelId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import type { OtlpExportLogsParams } from '../../../../../../platform/agentHost/common/state/protocol/channels-otlp/notifications.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { Registry } from '../../../../../../platform/registry/common/platform.js';
import { Extensions, IOutputChannel, IOutputChannelRegistry, IOutputService } from '../../../../../services/output/common/output.js';
import { RemoteAgentHostLogForwarder } from '../../../browser/remoteAgentHost/remoteAgentHostLogForwarder.js';

suite('RemoteAgentHostLogForwarder', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('accepts only the normalized subscribed host channel and drops batches while detached', () => {
		const logs = store.add(new Emitter<OtlpExportLogsParams>());
		const stateChanged = store.add(new Emitter<AgentHostClientState>());
		let state = AgentHostClientState.Connected;
		const operations: string[] = [];
		const lines: string[] = [];
		const client = new class extends mock<AgentHostProtocolClient>() {
			override readonly onDidChangeConnectionState = stateChanged.event;
			override readonly onDidReceiveOtlpLogs = logs.event;
			override get connectionState() { return state; }
			override get initializeResult() {
				return constObservable({
					protocolVersion: '1.0.0', serverSeq: 0, snapshots: [],
					telemetry: { logs: 'other-logs://tenant/host%20diagnostics/{level}' },
				});
			}
			override get rootState() {
				return {
					value: undefined, verifiedValue: undefined,
					onDidChange: Event.None, onWillApplyAction: Event.None, onDidApplyAction: Event.None,
				};
			}
			override async subscribeStateless(resource: URI): Promise<void> {
				operations.push(`subscribe:${resource.toString()}`);
			}
			override unsubscribe(resource: URI): void {
				operations.push(`unsubscribe:${resource.toString()}`);
			}
		}();
		const address = 'test:isolated-log-routing';
		const registry = Registry.as<IOutputChannelRegistry>(Extensions.OutputChannels);
		store.add(toDisposable(() => registry.removeChannel(remoteAgentHostLogOutputChannelId(address))));
		const outputChannel = new class extends mock<IOutputChannel>() {
			override append(value: string): void { lines.push(value); }
		}();
		const outputService = new class extends mock<IOutputService>() {
			override getChannel() { return outputChannel; }
		}();
		store.add(new RemoteAgentHostLogForwarder(client, address, 'Test', outputService, new NullLogService()));
		const emit = (channel: string) => logs.fire({
			channel,
			payload: { resourceLogs: [{ scopeLogs: [{ logRecords: [{ severityNumber: 9, body: { stringValue: 'host log' } }] }] }] },
		});
		emit('other-logs://tenant/mcp-server/info');
		emit('other-logs://tenant/host diagnostics/info');
		state = AgentHostClientState.Reconnecting;
		stateChanged.fire(state);
		emit('other-logs://tenant/host diagnostics/info');
		state = AgentHostClientState.Connected;
		stateChanged.fire(state);
		emit('other-logs://tenant/host diagnostics/info');
		assert.deepStrictEqual({ operations, lines }, {
			operations: [
				'subscribe:other-logs://tenant/host%20diagnostics/info',
				'unsubscribe:other-logs://tenant/host%20diagnostics/info',
				'subscribe:other-logs://tenant/host%20diagnostics/info',
			],
			lines: [
				'[1970-01-01T00:00:00.000Z] [INFO ] host log\n',
				'[1970-01-01T00:00:00.000Z] [INFO ] host log\n',
			],
		});
	});
});
