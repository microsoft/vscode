/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { ILogService, ILoggerService } from '../../log/common/log.js';
import { RemoteLoggerChannelClient } from '../../log/common/logIpc.js';
import { IAgentHostStarter } from '../common/agent.js';
import { AgentHostIpcChannels } from '../common/agentService.js';

enum Constants {
	MaxRestarts = 5,
}

/**
 * Main-process service that manages the agent host utility process lifecycle
 * (lazy start, crash recovery, logger forwarding). The renderer communicates
 * with the utility process directly via MessagePort - this class does not
 * relay any agent service calls.
 */
export class AgentHostProcessManager extends Disposable {

	private _started = false;
	private _wasQuitRequested = false;
	private _restartCount = 0;

	constructor(
		private readonly _starter: IAgentHostStarter,
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
	) {
		super();

		this._register(this._starter);

		// Start lazily when the first window asks for a connection
		if (this._starter.onRequestConnection) {
			this._register(Event.once(this._starter.onRequestConnection)(() => this._ensureStarted()));
		}

		if (this._starter.onWillShutdown) {
			this._register(this._starter.onWillShutdown(() => this._wasQuitRequested = true));
		}
	}

	private _ensureStarted(): void {
		if (!this._started) {
			this._start();
		}
	}

	private _start(): void {
		const connection = this._starter.start();

		this._logService.info('AgentHostProcessManager: agent host started');

		// Connect logger channel so agent host logs appear in the output channel
		this._register(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel(AgentHostIpcChannels.Logger)));

		// Handle unexpected exit
		this._register(connection.onDidProcessExit(e => {
			if (!this._wasQuitRequested && !this._store.isDisposed) {
				if (this._restartCount <= Constants.MaxRestarts) {
					this._logService.error(`AgentHostProcessManager: agent host terminated unexpectedly with code ${e.code}`);
					this._restartCount++;
					this._started = false;
					connection.store.dispose();
					this._start();
				} else {
					this._logService.error(`AgentHostProcessManager: agent host terminated with code ${e.code}, giving up after ${Constants.MaxRestarts} restarts`);
				}
			}
		}));

		this._register(toDisposable(() => connection.store.dispose()));
		this._started = true;
	}
}
