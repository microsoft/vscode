/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { IChannelClient, IChannelServer, IServerChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { IInstantiationService } from '../../../instantiation/common/instantiation.js';
import { NullLogService } from '../../../log/common/log.js';
import { ITelemetryData } from '../../../telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../telemetry/common/telemetryUtils.js';
import { AGENT_HOST_CLIENT_PROXY_CHANNEL } from '../../common/agentHostClientProxyChannel.js';
import { AGENT_HOST_CLIENT_BYOK_LM_CHANNEL, AgentHostClientByokLmChannel } from '../../common/agentHostClientByokLmChannel.js';
import { AgentHostClientType } from '../../common/agentHostClientInfo.js';
import { AgentHostStartupTelemetry } from '../../common/agentHostStartupTelemetry.js';
import { AgentHostClientConnectionKind } from '../../common/agentHostTelemetry.js';
import { LocalAgentHostManagementConnection, registerAgentHostClientChannels } from '../../electron-browser/localAgentHostService.js';

class TestTelemetryService extends NullTelemetryServiceShape {
	readonly events: { eventName: string; data: ITelemetryData | undefined }[] = [];

	override publicLog2(eventName?: string, data?: ITelemetryData): void {
		if (eventName) {
			this.events.push({ eventName, data });
		}
	}
}

/**
 * Regression coverage for the renderer reverse-RPC channel registration. The
 * BYOK language-model bridge depends on `IAgentHostByokLmHandler`, registered by
 * the chat contribution of every window that backs BYOK (the main workbench and
 * the Agents app). The registration must still degrade gracefully should a
 * window ever connect without binding the handler — `createInstance` then throws,
 * and that must NOT abort the rest of `_connect` (client completion,
 * action/notification wiring, root-state subscription), or the whole window loses
 * its agent host.
 */
suite('registerAgentHostClientChannels', () => {

	const disposables = ensureNoDisposablesAreLeakedInTestSuite();

	function fakeChannelServer(): { server: IChannelServer; registered: string[] } {
		const registered: string[] = [];
		const server: IChannelServer = {
			registerChannel: (name: string, _channel: IServerChannel) => { registered.push(name); },
		};
		return { server, registered };
	}

	/**
	 * Minimal {@link IInstantiationService} whose `createInstance` throws for the
	 * BYOK channel when `byokHandlerMissing`, mirroring the strict "UNKNOWN
	 * service agentHostByokLmHandler" failure in windows without the handler.
	 */
	function fakeInstantiationService(byokHandlerMissing: boolean): IInstantiationService {
		return {
			createInstance: (ctor: unknown) => {
				if (ctor === AgentHostClientByokLmChannel && byokHandlerMissing) {
					throw new Error('[createInstance] AgentHostClientByokLmChannel depends on UNKNOWN service agentHostByokLmHandler.');
				}
				return {};
			},
		} as unknown as IInstantiationService;
	}

	test('registers both channels when BYOK is enabled and the handler is available', () => {
		const { server, registered } = fakeChannelServer();
		registerAgentHostClientChannels(server, fakeInstantiationService(false), new NullLogService(), true);
		assert.deepStrictEqual(registered, [AGENT_HOST_CLIENT_PROXY_CHANNEL, AGENT_HOST_CLIENT_BYOK_LM_CHANNEL]);
	});

	suite('LocalAgentHostManagementConnection', () => {

		const client: IChannelClient = {
			getChannel: () => { throw new Error('Not called by this test.'); },
		};

		test('rotates management generations across reconnect and close', async () => {
			const connection = disposables.add(new LocalAgentHostManagementConnection());
			const beforeReconnect = connection.client();

			connection.reconnecting();
			const duringReconnect = connection.client();
			let connected = false;
			void duringReconnect.then(() => connected = true);
			await Promise.resolve();
			const connectedBeforeAcquisition = connected;
			await connection.acquire(Promise.resolve(client));
			connection.connected();
			const reconnectedClient = await duringReconnect;

			connection.reconnecting();
			const beforeClose = connection.client();
			connection.closed('Local agent host protocol is incompatible.');

			await assert.rejects(beforeReconnect, /reconnecting/);
			await assert.rejects(beforeClose, /incompatible/);
			assert.deepStrictEqual({
				connectedBeforeAcquisition,
				reconnectedClient,
			}, {
				connectedBeforeAcquisition: false,
				reconnectedClient: client,
			});
		});
	});

	test('registers only the proxy channel and does NOT throw when the BYOK handler is missing', () => {
		const { server, registered } = fakeChannelServer();
		// Must not throw: the agent host connection has to come up even if a
		// window connects without the handler and so cannot serve BYOK itself.
		registerAgentHostClientChannels(server, fakeInstantiationService(true), new NullLogService(), true);
		assert.deepStrictEqual(registered, [AGENT_HOST_CLIENT_PROXY_CHANNEL]);
	});

	test('registers only the proxy channel when BYOK is disabled', () => {
		const { server, registered } = fakeChannelServer();
		registerAgentHostClientChannels(server, fakeInstantiationService(false), new NullLogService(), false);
		assert.deepStrictEqual(registered, [AGENT_HOST_CLIENT_PROXY_CHANNEL]);
	});
});

suite('AgentHostStartupTelemetry', () => {

	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('reports the first successful session list with startup milestones and retry counts', () => {
		let now = 0;
		const telemetryService = new TestTelemetryService();
		const tracker = store.add(new AgentHostStartupTelemetry(
			AgentHostClientType.AgentsWindow,
			AgentHostClientConnectionKind.Local,
			() => ({ elapsed: () => now }),
			() => ({ dispose() { } }),
			telemetryService,
		));

		now = 10;
		tracker.messagePortAcquired();
		now = 20;
		tracker.sessionListRequested();
		now = 50;
		tracker.protocolConnected();
		now = 80;
		tracker.authenticationSettled();
		now = 85;
		tracker.sessionListRequested();
		now = 90;
		tracker.sessionListFailed();
		now = 120;
		tracker.sessionListSucceeded();
		tracker.connectionFailed();

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'agentHost.startup',
			data: {
				clientType: 'agents_window',
				connectionKind: 'local',
				outcome: 'success',
				failureStage: undefined,
				timeToMessagePortMs: 10,
				timeToProtocolConnectionMs: 50,
				timeToAuthenticationSettledMs: 80,
				timeToSessionListRequestMs: 20,
				timeToSessionListCompleteMs: 120,
				sessionListDurationMs: 100,
				sessionListAttemptCount: 2,
				sessionListFailureCount: 1,
			},
		}]);
	});

	test('reports a protocol connection failure once', () => {
		let now = 30;
		const telemetryService = new TestTelemetryService();
		const tracker = store.add(new AgentHostStartupTelemetry(
			AgentHostClientType.EditorWindow,
			AgentHostClientConnectionKind.Local,
			() => ({ elapsed: () => now }),
			() => ({ dispose() { } }),
			telemetryService,
		));

		tracker.connectionFailed();
		now = 40;
		tracker.sessionListRequested();
		tracker.sessionListSucceeded();

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'agentHost.startup',
			data: {
				clientType: 'editor_window',
				connectionKind: 'local',
				outcome: 'error',
				failureStage: 'protocolConnection',
				timeToMessagePortMs: undefined,
				timeToProtocolConnectionMs: undefined,
				timeToAuthenticationSettledMs: undefined,
				timeToSessionListRequestMs: undefined,
				timeToSessionListCompleteMs: undefined,
				sessionListDurationMs: undefined,
				sessionListAttemptCount: 0,
				sessionListFailureCount: 0,
			},
		}]);
	});

	test('attributes a terminal connection failure after connecting to the session-list stage', () => {
		let now = 50;
		const telemetryService = new TestTelemetryService();
		const tracker = store.add(new AgentHostStartupTelemetry(
			AgentHostClientType.AgentsWindow,
			AgentHostClientConnectionKind.Local,
			() => ({ elapsed: () => now }),
			() => ({ dispose() { } }),
			telemetryService,
		));

		tracker.protocolConnected();
		now = 70;
		tracker.sessionListRequested();
		now = 90;
		tracker.connectionFailed();

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'agentHost.startup',
			data: {
				clientType: 'agents_window',
				connectionKind: 'local',
				outcome: 'error',
				failureStage: 'sessionList',
				timeToMessagePortMs: undefined,
				timeToProtocolConnectionMs: 50,
				timeToAuthenticationSettledMs: undefined,
				timeToSessionListRequestMs: 70,
				timeToSessionListCompleteMs: undefined,
				sessionListDurationMs: undefined,
				sessionListAttemptCount: 1,
				sessionListFailureCount: 0,
			},
		}]);
	});

	test('reports a session-list timeout after the protocol connected', () => {
		let onTimeout = () => { };
		const telemetryService = new TestTelemetryService();
		const tracker = store.add(new AgentHostStartupTelemetry(
			AgentHostClientType.AgentsWindow,
			AgentHostClientConnectionKind.Local,
			() => ({ elapsed: () => 120_000 }),
			callback => {
				onTimeout = callback;
				return { dispose() { } };
			},
			telemetryService,
		));

		tracker.protocolConnected();
		tracker.sessionListRequested();
		tracker.sessionListFailed();
		onTimeout();

		assert.deepStrictEqual(telemetryService.events, [{
			eventName: 'agentHost.startup',
			data: {
				clientType: 'agents_window',
				connectionKind: 'local',
				outcome: 'timeout',
				failureStage: 'sessionList',
				timeToMessagePortMs: undefined,
				timeToProtocolConnectionMs: 120_000,
				timeToAuthenticationSettledMs: undefined,
				timeToSessionListRequestMs: 120_000,
				timeToSessionListCompleteMs: undefined,
				sessionListDurationMs: undefined,
				sessionListAttemptCount: 1,
				sessionListFailureCount: 1,
			},
		}]);
	});

	test('does not report a connection failure after disposal', () => {
		const telemetryService = new TestTelemetryService();
		const tracker = new AgentHostStartupTelemetry(
			AgentHostClientType.EditorWindow,
			AgentHostClientConnectionKind.Local,
			() => ({ elapsed: () => 10 }),
			() => ({ dispose() { } }),
			telemetryService,
		);

		tracker.dispose();
		tracker.connectionFailed();

		assert.deepStrictEqual(telemetryService.events, []);
	});
});
