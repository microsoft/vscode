/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

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
 * handles crash recovery, and tracks active agent sessions via
 * {@link IServerLifetimeService} to keep the server alive while work is
 * in progress.
 */
export interface IServerAgentHostManager {
	readonly _serviceBrand: undefined;
}

enum Constants {
	MaxRestarts = 5,
}

export class ServerAgentHostManager extends Disposable implements IServerAgentHostManager {
	declare readonly _serviceBrand: undefined;

	private _restartCount = 0;

	/** Lifetime token for when agent sessions are active. */
	private readonly _lifetimeToken = this._register(new MutableDisposable());

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
		this._register(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel(AgentHostIpcChannels.Logger)));

		this._trackActiveSessions(connection);

		// Handle unexpected exit
		this._register(connection.onDidProcessExit(e => {
			if (!this._store.isDisposed) {
				// Sessions are gone when the process exits
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
		this._register(agentService.onDidAction(envelope => {
			if (envelope.action.type === 'root/activeSessionsChanged') {
				if (envelope.action.activeSessions > 0) {
					this._lifetimeToken.value ??= this._serverLifetimeService.active('AgentSession');
				} else {
					this._lifetimeToken.clear();
				}
			}
		}));
	}
}
