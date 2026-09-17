/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../base/common/async.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../../base/common/lifecycle.js';
import { ILogService, ILoggerService } from '../../log/common/log.js';
import { RemoteLoggerChannelClient } from '../../log/common/logIpc.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { AgentHostStartError, IAgentHostConnection, IAgentHostStarter } from '../common/agent.js';
import { reportAgentHostProcessError } from '../common/agentHostProcessTelemetry.js';
import { AgentHostLaunchKind } from '../common/agentHostTelemetry.js';
import { AgentHostIpcChannels } from '../common/agentService.js';

enum Constants {
	MaxRestarts = 5,
	ShutdownTimeoutMs = 6000,
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

	private _wasQuitRequested = false;
	private _restartCount = 0;
	private _restartLimitReached = false;
	private _connection: IAgentHostConnection | undefined;
	private _startPromise: Promise<void> | undefined;
	private readonly _connectionStore = this._register(new MutableDisposable<DisposableStore>());

	constructor(
		private readonly _starter: IAgentHostStarter,
		private readonly _platform: NodeJS.Platform = process.platform,
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();

		this._register(this._starter);

		if (this._starter.onRequestConnection) {
			this._register(this._starter.onRequestConnection(request => request.waitUntil(this._ensureStarted())));
		}
		if (this._starter.onRequestRestart) {
			this._register(this._starter.onRequestRestart(() => {
				this.restart().catch(error => this._logService.error('AgentHostProcessManager: failed to restart agent host', error));
			}));
		}

		if (this._starter.onWillShutdown) {
			this._register(this._starter.onWillShutdown(request => {
				this._wasQuitRequested = true;
				request.join(this._shutdown().finally(() => this.dispose()));
			}));
		}
	}

	private _ensureStarted(): Promise<void> {
		if (this._wasQuitRequested || this._store.isDisposed) {
			return Promise.reject(new Error('Agent Host process manager is shutting down.'));
		}
		if (this._restartLimitReached) {
			return Promise.reject(new AgentHostStartError(`Agent Host process stopped after ${Constants.MaxRestarts} restarts.`, true));
		}
		if (this._connection) {
			return Promise.resolve();
		}
		if (!this._startPromise) {
			return this._setStartPromise(this._start());
		}
		return this._startPromise;
	}

	/**
	 * Explicitly restarts the agent host process, discarding the current connection
	 * and resetting crash recovery bookkeeping.
	 */
	restart(): Promise<void> {
		if (this._wasQuitRequested || this._store.isDisposed) {
			return Promise.reject(new Error('Agent Host process manager is shutting down.'));
		}

		this._restartCount = 0;
		this._restartLimitReached = false;
		const pendingStart = this._startPromise;
		const restartPromise = (async () => {
			if (pendingStart) {
				try {
					await pendingStart;
				} catch {
					// An explicit restart retries after a failed start.
				}
			}
			if (this._wasQuitRequested || this._store.isDisposed) {
				return;
			}
			this._logService.info('AgentHostProcessManager: explicitly restarting agent host');
			const connection = this._connection;
			if (connection) {
				this._connection = undefined;
				try {
					await raceTimeout(connection.shutdown(), Constants.ShutdownTimeoutMs, () => {
						this._logService.warn(`AgentHostProcessManager: agent host did not shut down before restart within ${Constants.ShutdownTimeoutMs}ms; terminating it`);
					});
				} catch (error) {
					this._logService.error('AgentHostProcessManager: failed to shut down agent host gracefully before restart', error);
				} finally {
					this._clearConnection(connection);
				}
			}
			await this._start();
		})();
		this._setStartPromise(restartPromise);
		return restartPromise;
	}

	private _setStartPromise(startPromise: Promise<void>): Promise<void> {
		this._startPromise = startPromise;
		void startPromise.then(
			() => {
				if (this._startPromise === startPromise) {
					this._startPromise = undefined;
				}
			},
			() => {
				if (this._startPromise === startPromise) {
					this._startPromise = undefined;
				}
			},
		);
		return startPromise;
	}

	private async _start(): Promise<void> {
		let connection: IAgentHostConnection | undefined;
		try {
			const startedConnection = await this._starter.start();
			connection = startedConnection;

			if (this._store.isDisposed || this._wasQuitRequested) {
				startedConnection.store.dispose();
				throw new Error('Agent Host process manager disposed during startup.');
			}

			this._connection = startedConnection;
			this._connectionStore.value = startedConnection.store;
			this._logService.info('AgentHostProcessManager: agent host started');

			// Connect logger channel so agent host logs appear in the output channel
			startedConnection.store.add(new RemoteLoggerChannelClient(this._loggerService, startedConnection.client.getChannel(AgentHostIpcChannels.Logger)));

			startedConnection.store.add(startedConnection.onDidProcessExit(e => this._handleProcessExit(startedConnection, e.code)));
		} catch (error) {
			this._clearConnection(connection);
			if (!this._store.isDisposed && !this._wasQuitRequested) {
				this._logService.error('AgentHostProcessManager: failed to start agent host', error);
				reportAgentHostProcessError(this._telemetryService, {
					hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
					kind: 'startFailed',
					restartCount: this._restartCount,
					willRestart: false,
				}, error);
			}
			throw error;
		}
	}

	/**
	 * Drops the given connection, disposing it exactly once regardless of whether it is
	 * still the connection tracked by {@link _connectionStore}.
	 */
	private _clearConnection(connection: IAgentHostConnection | undefined): void {
		if (this._connection === connection) {
			this._connection = undefined;
		}
		if (!connection) {
			return;
		}
		if (this._connectionStore.value === connection.store) {
			this._connectionStore.clear();
		} else {
			connection.store.dispose();
		}
	}

	private _handleProcessExit(connection: IAgentHostConnection, code: number): void {
		if (this._connection !== connection) {
			return;
		}
		this._clearConnection(connection);

		if (this._wasQuitRequested || this._store.isDisposed) {
			return;
		}
		if (isExpectedWindowsShutdownExit(this._platform, code)) {
			this._logService.info(`AgentHostProcessManager: agent host terminated with expected Windows shutdown code ${code}`);
			return;
		}

		const willRestart = this._restartCount < Constants.MaxRestarts;
		reportAgentHostProcessError(this._telemetryService, {
			hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
			kind: 'unexpectedExit',
			code,
			restartCount: this._restartCount,
			willRestart,
		});
		if (willRestart) {
			this._logService.error(`AgentHostProcessManager: agent host terminated unexpectedly with code ${code}`);
			this._restartCount++;
			const pendingLifecycle = this._startPromise;
			const restart = () => {
				if (!this._connection && !this._wasQuitRequested && !this._store.isDisposed) {
					void this._ensureStarted().catch(error => this._logService.trace('AgentHostProcessManager: automatic restart failed', error));
				}
			};
			if (pendingLifecycle) {
				void pendingLifecycle.then(restart, restart);
			} else {
				restart();
			}
		} else {
			this._restartLimitReached = true;
			this._logService.error(`AgentHostProcessManager: agent host terminated with code ${code}, giving up after ${Constants.MaxRestarts} restarts`);
		}
	}

	private async _shutdown(): Promise<void> {
		try {
			await raceTimeout(this._shutdownGracefully(), Constants.ShutdownTimeoutMs, () => {
				this._logService.warn(`AgentHostProcessManager: agent host did not shut down within ${Constants.ShutdownTimeoutMs}ms; terminating it`);
			});
		} catch (error) {
			this._logService.error('AgentHostProcessManager: failed to shut down agent host gracefully', error);
		} finally {
			this._clearConnection(this._connection);
		}
	}

	private async _shutdownGracefully(): Promise<void> {
		try {
			await this._startPromise;
		} catch (error) {
			this._logService.trace('AgentHostProcessManager: startup did not complete before shutdown', error);
			return;
		}

		await this._connection?.shutdown();
	}
}
