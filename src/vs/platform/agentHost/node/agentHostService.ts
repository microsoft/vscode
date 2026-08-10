/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Queue } from '../../../base/common/async.js';
import { Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ILogService, ILoggerService } from '../../log/common/log.js';
import { RemoteLoggerChannelClient } from '../../log/common/logIpc.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IAgentHostStarter } from '../common/agent.js';
import { reportAgentHostProcessError } from '../common/agentHostProcessTelemetry.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import { AgentHostIpcChannels } from '../common/agentService.js';

enum Constants {
	MaxRestarts = 5,
}

const WINDOWS_EXPECTED_SHUTDOWN_EXIT_CODES = new Set([
	0xC000026B, // STATUS_DLL_INIT_FAILED_LOGOFF
	0x40010004, // DBG_TERMINATE_PROCESS
]);

function isExpectedWindowsShutdownExit(platform: NodeJS.Platform, code: number): boolean {
	return platform === 'win32' && WINDOWS_EXPECTED_SHUTDOWN_EXIT_CODES.has(code >>> 0);
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
	private readonly _lifecycleQueue = this._register(new Queue<void>());
	private readonly _connection = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly _starter: IAgentHostStarter,
		private readonly _platform: NodeJS.Platform = process.platform,
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._register(this._starter);

		// Start lazily when the first window asks for a connection
		if (this._starter.onRequestConnection) {
			this._register(Event.once(this._starter.onRequestConnection)(() => this._ensureStarted()));
		}
		if (this._starter.onRequestRestart) {
			this._register(this._starter.onRequestRestart(() => void this.restart()));
		}

		if (this._starter.onWillShutdown) {
			this._register(this._starter.onWillShutdown(() => this._wasQuitRequested = true));
		}
	}

	private _ensureStarted(): void {
		void this._lifecycleQueue.queue(() => this._start());
	}

	restart(): Promise<void> {
		return this._lifecycleQueue.queue(async () => {
			this._logService.info('AgentHostProcessManager: explicitly restarting agent host');
			this._connection.clear();
			this._started = false;
			this._restartCount = 0;
			await this._start();
		});
	}

	private async _start(): Promise<void> {
		if (this._started) {
			return;
		}
		this._started = true;
		try {
			const connection = await this._starter.start();

			if (this._store.isDisposed) {
				connection.store.dispose();
				return;
			}

			this._logService.info('AgentHostProcessManager: agent host started');

			// Connect logger channel so agent host logs appear in the output channel
			connection.store.add(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel(AgentHostIpcChannels.Logger)));

			// Handle unexpected exit
			connection.store.add(connection.onDidProcessExit(e => {
				if (this._wasQuitRequested || this._store.isDisposed) {
					return;
				}
				if (isExpectedWindowsShutdownExit(this._platform, e.code)) {
					this._logService.info(`AgentHostProcessManager: agent host terminated during Windows shutdown with code ${e.code}`);
					if (this._connection.value === connection.store) {
						this._connection.clear();
					}
					return;
				}

				const willRestart = this._restartCount < Constants.MaxRestarts;
				reportAgentHostProcessError(this._telemetryService, {
					hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
					kind: 'unexpectedExit',
					code: e.code,
					restartCount: this._restartCount,
					willRestart,
				});
				if (this._connection.value === connection.store) {
					this._connection.clear();
				}
				if (willRestart) {
					this._logService.error(`AgentHostProcessManager: agent host terminated unexpectedly with code ${e.code}`);
					this._restartCount++;
					this._started = false;
					this._ensureStarted();
				} else {
					this._logService.error(`AgentHostProcessManager: agent host terminated with code ${e.code}, giving up after ${Constants.MaxRestarts} restarts`);
				}
			}));

			this._connection.value = connection.store;
		} catch (error) {
			this._started = false;
			this._logService.error('AgentHostProcessManager: failed to start agent host', error);
			reportAgentHostProcessError(this._telemetryService, {
				hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
				kind: 'startFailed',
				restartCount: this._restartCount,
				willRestart: false,
			}, error);
		}
	}
}
