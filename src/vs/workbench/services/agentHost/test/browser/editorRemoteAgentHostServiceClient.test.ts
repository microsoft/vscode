/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as sinon from 'sinon';
import { DeferredPromise } from '../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { constObservable, observableValue } from '../../../../../base/common/observable.js';
import type { IChannel, IServerChannel } from '../../../../../base/parts/ipc/common/ipc.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentHostEnablementService } from '../../../../../platform/agentHost/common/agentHostEnablementService.js';
import { IWorkbenchEnvironmentService } from '../../../environment/common/environmentService.js';
import { AgentHostClientState, AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { editorWindowAgentHostClientInfo } from '../../../../../platform/agentHost/common/agentHostClientInfo.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { NullLogService, ILogService } from '../../../../../platform/log/common/log.js';
import type { RemoteAgentConnectionContext, IRemoteAgentEnvironment } from '../../../../../platform/remote/common/remoteAgentEnvironment.js';
import type { PersistentConnectionEvent } from '../../../../../platform/remote/common/remoteAgentConnection.js';
import { EditorRemoteAgentHostServiceClient } from '../../browser/editorRemoteAgentHostServiceClient.js';
import { IAgentHostFileSystemService } from '../../common/agentHostFileSystemService.js';
import { IRemoteAgentService, type IRemoteAgentConnection } from '../../../remote/common/remoteAgentService.js';
import { TestRemoteAgentService } from '../../../../test/browser/workbenchTestServices.js';

class TestRemoteAgentConnection extends Disposable implements IRemoteAgentConnection {
	readonly remoteAuthority = 'ssh-remote+test';
	readonly onReconnecting = Event.None;
	readonly onDidStateChange = Event.None as Event<PersistentConnectionEvent>;

	constructor(private readonly channel: IChannel) {
		super();
	}

	end(): Promise<void> {
		return Promise.resolve();
	}

	getChannel<T extends IChannel>(_channelName: string): T {
		return this.channel as T;
	}

	withChannel<T extends IChannel, R>(_channelName: string, callback: (channel: T) => Promise<R>): Promise<R> {
		return callback(this.channel as T);
	}

	registerChannel<T extends IServerChannel<RemoteAgentConnectionContext>>(_channelName: string, _channel: T): void { }

	getInitialConnectionTimeMs(): Promise<number> {
		return Promise.resolve(0);
	}

	updateGraceTime(_graceTime: number): void { }
}

class DeferredRemoteAgentService extends TestRemoteAgentService {
	readonly environmentReady = new DeferredPromise<IRemoteAgentEnvironment | null>();

	constructor(private readonly connection: IRemoteAgentConnection) {
		super();
	}

	override getConnection(): IRemoteAgentConnection {
		return this.connection;
	}

	override getRawEnvironment(): Promise<IRemoteAgentEnvironment | null> {
		return this.environmentReady.p;
	}
}

suite('EditorRemoteAgentHostServiceClient', () => {
	const disposables = ensureNoDisposablesAreLeakedInTestSuite();
	teardown(() => sinon.restore());

	test('waits for enablement and the remote environment before connecting to Agent Host', async () => {
		const channel: IChannel = {
			call: <T>() => Promise.resolve(undefined as T),
			listen: () => Event.None,
		};
		const remoteAgentService = new DeferredRemoteAgentService(disposables.add(new TestRemoteAgentConnection(channel)));
		let connectCalls = 0;
		const onDidChangeConnectionState = disposables.add(new Emitter<AgentHostClientState>());
		const protocolClient = {
			clientId: 'test-client',
			connect: async () => {
				connectCalls++;
				throw new Error('Initial connection failed');
			},
			onDidClose: Event.None,
			onDidChangeConnectionState: onDidChangeConnectionState.event,
			onDidNotification: Event.None,
			onDidAction: Event.None,
			onMcpNotification: Event.None,
			initializeResult: constObservable(undefined),
			rootState: {
				value: undefined,
				verifiedValue: undefined,
				onDidChange: Event.None,
				onDidError: Event.None,
				onWillApplyAction: Event.None,
				onDidApplyAction: Event.None,
			},
			dispose: () => { },
		};
		const registeredAuthorities: string[] = [];
		const agentHostEnabled = observableValue('agentHostEnabled', false);
		const instantiationService = disposables.add(new TestInstantiationService(new ServiceCollection(
			[IRemoteAgentService, remoteAgentService],
			[IAgentHostEnablementService, { _serviceBrand: undefined, enabled: agentHostEnabled, managedSandboxEnforced: constObservable(false) }],
			[ILogService, new NullLogService()],
			[IWorkbenchEnvironmentService, { isSessionsWindow: false }],
			[IAgentHostFileSystemService, {
				_serviceBrand: undefined,
				registerAuthority: (authority: string) => {
					registeredAuthorities.push(authority);
					return Disposable.None;
				},
				ensureSyncedCustomizationProvider: () => { },
			}],
		)));
		instantiationService.stubInstance(AgentHostProtocolClient, protocolClient);
		instantiationService.set(IInstantiationService, instantiationService);
		const createInstanceSpy = sinon.spy(instantiationService, 'createInstance');

		const service = disposables.add(instantiationService.createInstance(EditorRemoteAgentHostServiceClient));
		const started = Event.toPromise(service.onAgentHostStart);
		agentHostEnabled.set(true, undefined);
		const beforeReady = connectCalls;

		remoteAgentService.environmentReady.complete(null);
		while (connectCalls === 0) {
			await Promise.resolve();
		}
		onDidChangeConnectionState.fire(AgentHostClientState.Connected);
		await started;

		const protocolClientCall = createInstanceSpy.getCalls().find(call => call.args[0] === AgentHostProtocolClient);
		assert.deepStrictEqual({
			beforeReady,
			afterReady: connectCalls,
			clientInfo: protocolClientCall?.args[5],
			registeredAuthorities,
		}, {
			beforeReady: 0,
			afterReady: 1,
			clientInfo: editorWindowAgentHostClientInfo,
			registeredAuthorities: [agentHostAuthority('vscode-remote://ssh-remote+test')],
		});
	});
});
