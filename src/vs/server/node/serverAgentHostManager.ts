/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../base/common/event.js';
import { Disposable, MutableDisposable, toDisposable } from '../../base/common/lifecycle.js';
import { ProxyChannel } from '../../base/parts/ipc/common/ipc.js';
import { IAgentHostConnection, IAgentHostStarter } from '../../platform/agentHost/common/agent.js';
import { AgentHostIpcChannels, IAgentService } from '../../platform/agentHost/common/agentService.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { ILogService, ILoggerService } from '../../platform/log/common/log.js';
import { RemoteLoggerChannelClient } from '../../platform/log/common/logIpc.js';
import { IServerLifetimeService } from './serverLifetimeService.js';

export const IServerAgentHostManager = createDecorator<IServerAgentHostManager>('serverAgentHostManager');

/**
 * Server-specific agent host manager. Eagerly starts the agent host process,
 * handles crash recovery, and tracks both active agent sessions and connected
 * WebSocket clients via {@link IServerLifetimeService} to keep the server
 * alive while either signal is active.
 *
 * The lifetime token is held when active sessions > 0 OR connected clients > 0.
 * It is released only when both are zero.
 */
export interface IServerAgentHostManager {
	readonly _serviceBrand: undefined;
}

/**
 * Proxy interface for the connection tracker IPC channel exposed by the agent
 * host process. This is NOT part of the agent host protocol -- it is a
 * server-only process-management concern.
 */
interface IConnectionTrackerService {
	readonly onDidChangeConnectionCount: Event<number>;
}

enum Constants {
	MaxRestarts = 5,
}

export class ServerAgentHostManager extends Disposable implements IServerAgentHostManager {
	declare readonly _serviceBrand: undefined;

	private _restartCount = 0;

	/** Lifetime token held while sessions are active or clients are connected. */
	private readonly _lifetimeToken = this._register(new MutableDisposable());

	private _hasActiveSessions = false;
	private _connectionCount = 0;

	constructor(
		private readonly _starter: IAgentHostStarter,
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IServerLifetimeService private readonly _serverLifetimeService: IServerLifetimeService,
	) {
		super();
		this._register(this._starter);
		this._start();
	}

	private _start(): void {
		const connection = this._starter.start();

		this._logService.info('ServerAgentHostManager: agent host started');

		// Connect logger channel so agent host logs appear in the output channel
		connection.store.add(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel(AgentHostIpcChannels.Logger)));

		this._trackActiveSessions(connection);
		this._trackClientConnections(connection);

		// Handle unexpected exit
		connection.store.add(connection.onDidProcessExit(e => {
			if (!this._store.isDisposed) {
				// Both signals are gone when the process exits
				this._hasActiveSessions = false;
				this._connectionCount = 0;
				this._lifetimeToken.clear();

				if (this._restartCount <= Constants.MaxRestarts) {
					this._logService.error(`ServerAgentHostManager: agent host terminated unexpectedly with code ${e.code}`);
					this._restartCount++;
					connection.store.dispose();
					this._start();
				} else {
					this._logService.error(`ServerAgentHostManager: agent host terminated with code ${e.code}, giving up after ${Constants.MaxRestarts} restarts`);
				}
			}
		}));

		this._register(toDisposable(() => connection.store.dispose()));
	}

	private _trackActiveSessions(connection: IAgentHostConnection): void {
		const agentService = ProxyChannel.toService<IAgentService>(connection.client.getChannel(AgentHostIpcChannels.AgentHost));
		connection.store.add(agentService.onDidAction(envelope => {
			if (envelope.action.type === 'root/activeSessionsChanged') {
				this._hasActiveSessions = envelope.action.activeSessions > 0;
				this._updateLifetimeToken();
			}
		}));
	}

	private _trackClientConnections(connection: IAgentHostConnection): void {
		const connectionTracker = ProxyChannel.toService<IConnectionTrackerService>(connection.client.getChannel(AgentHostIpcChannels.ConnectionTracker));
		connection.store.add(connectionTracker.onDidChangeConnectionCount(count => {
			this._connectionCount = count;
			this._updateLifetimeToken();
		}));
	}

	private _updateLifetimeToken(): void {
		if (this._hasActiveSessions || this._connectionCount > 0) {
			this._lifetimeToken.value ??= this._serverLifetimeService.active('AgentHost');
		} else {
			this._lifetimeToken.clear();
		}
	}
}
