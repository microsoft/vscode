/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../base/common/async.js';
import { Event } from '../../base/common/event.js';
import { Disposable, DisposableStore, MutableDisposable } from '../../base/common/lifecycle.js';
import { ProxyChannel } from '../../base/parts/ipc/common/ipc.js';
import { IAgentHostConnection, IAgentHostStarter } from '../../platform/agentHost/common/agent.js';
import { reportAgentHostProcessError } from '../../platform/agentHost/common/agentHostProcessTelemetry.js';
import { AgentHostLaunchKind } from '../../platform/agentHost/common/agentHostTelemetry.js';
import { AgentHostIpcChannels, IAgentService } from '../../platform/agentHost/common/agentService.js';
import { createDecorator } from '../../platform/instantiation/common/instantiation.js';
import { ILogService, ILoggerService } from '../../platform/log/common/log.js';
import { RemoteLoggerChannelClient } from '../../platform/log/common/logIpc.js';
import { ITelemetryService } from '../../platform/telemetry/common/telemetry.js';
import { IServerLifetimeService } from './serverLifetimeService.js';

export const IServerAgentHostManager = createDecorator<IServerAgentHostManager>('serverAgentHostManager');

/**
 * Server-specific agent host manager. Starts the agent host process,
 * handles crash recovery, and tracks active agent sessions plus incoming
 * WebSocket clients to the spawned standalone agent host via
 * {@link IServerLifetimeService}.
 *
 * Renderer-to-agent-host proxy connections handled by `AgentHostChannel`
 * deliberately do not participate here.
 */
export interface IServerAgentHostManager {
	readonly _serviceBrand: undefined;

	/** Starts the agent host if necessary and resolves after its IPC connection is established. */
	ensureStarted(): Promise<void>;
}

export interface IServerAgentHostManagerOptions {
	readonly startMode?: 'eager' | 'lazy';
}

/**
 * Proxy interface for the connection tracker IPC channel exposed by the agent
 * host process. This is NOT part of the agent host protocol -- it is a
 * server-only process-management concern.
 */
interface IConnectionTrackerService {
	readonly onDidChangeConnectionCount: Event<number>;
	waitForConfiguredWebSocketServer(): Promise<void>;
}

enum Constants {
	MaxRestarts = 5,
	ShutdownTimeoutMs = 6000,
}

export class ServerAgentHostManager extends Disposable implements IServerAgentHostManager {
	declare readonly _serviceBrand: undefined;

	private _restartCount = 0;
	private _startPromise: Promise<void> | undefined;
	private _shuttingDown = false;
	private _connection: IAgentHostConnection | undefined;
	private readonly _connectionStore = this._register(new MutableDisposable<DisposableStore>());
	private readonly _startMode: 'eager' | 'lazy';

	/** Lifetime token held while sessions are active or standalone WebSocket clients are connected. */
	private readonly _lifetimeToken = this._register(new MutableDisposable());

	private _hasActiveSessions = false;
	private _connectionCount = 0;

	constructor(
		private readonly _starter: IAgentHostStarter,
		options: IServerAgentHostManagerOptions = {},
		@ILogService private readonly _logService: ILogService,
		@ILoggerService private readonly _loggerService: ILoggerService,
		@IServerLifetimeService private readonly _serverLifetimeService: IServerLifetimeService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._startMode = options.startMode ?? 'eager';
		this._register(this._starter);
		this._register(this._serverLifetimeService.onWillShutdown(event => {
			this._shuttingDown = true;
			event.join(this._shutdown());
		}));
		this._register(this._serverLifetimeService.onDidAbortShutdown(() => {
			if (this._startMode === 'eager') {
				void this.ensureStarted().catch(error => this._logService.error('ServerAgentHostManager: failed to restart after aborted server shutdown', error));
			}
		}));
		if (this._startMode === 'eager') {
			void this.ensureStarted().catch(() => undefined);
		}
	}

	ensureStarted(): Promise<void> {
		if (this._shuttingDown || this._store.isDisposed) {
			return Promise.reject(new Error('Server Agent Host manager is shutting down.'));
		}
		if (!this._startPromise) {
			const startPromise = this._start();
			this._startPromise = startPromise;
			void startPromise.catch(() => {
				if (this._startPromise === startPromise) {
					this._startPromise = undefined;
				}
			});
		}

		return this._startPromise;
	}

	/**
	 * Retries startup in-place until it succeeds or the crash-retry budget is
	 * exhausted, so the caller's `ensureStarted()` stays pending across
	 * automatic retries instead of rejecting while a retry is still in flight.
	 * A rejection here therefore means "no agent host, and we stopped trying".
	 */
	private async _start(): Promise<void> {
		while (true) {
			try {
				await this._startOnce();
				return;
			} catch (error) {
				if (this._store.isDisposed) {
					return;
				}

				const willRestart = this._restartCount < Constants.MaxRestarts;
				reportAgentHostProcessError(this._telemetryService, {
					hostLaunchKind: AgentHostLaunchKind.VSCodeCLI,
					kind: 'startFailed',
					restartCount: this._restartCount,
					willRestart,
				}, error);
				if (!willRestart) {
					this._logService.error(`ServerAgentHostManager: agent host failed to start, giving up after ${Constants.MaxRestarts} restarts`, error);
					// A future explicit request gets a fresh crash-retry budget.
					this._restartCount = 0;
					throw error;
				}

				this._logService.error('ServerAgentHostManager: agent host failed to start', error);
				this._restartCount++;
			}
		}
	}

	private async _startOnce(): Promise<void> {
		const connection = await this._starter.start();

		if (this._store.isDisposed || this._shuttingDown) {
			connection.store.dispose();
			return;
		}

		this._trackActiveSessions(connection);
		try {
			await this._trackClientConnections(connection);
		} catch (error) {
			connection.store.dispose();
			throw error;
		}
		if (this._store.isDisposed || connection.store.isDisposed) {
			connection.store.dispose();
			return;
		}

		this._logService.info('ServerAgentHostManager: agent host started');

		// Connect logger channel so agent host logs appear in the output channel
		connection.store.add(new RemoteLoggerChannelClient(this._loggerService, connection.client.getChannel(AgentHostIpcChannels.Logger)));

		// Only watch for crashes once startup has fully succeeded. An exit during
		// startup already surfaces as a rejection of the readiness request above,
		// so the retry loop owns that case exclusively and the two paths can never
		// both restart the same failure.
		connection.store.add(connection.onDidProcessExit(e => this._handleUnexpectedExit(connection, e)));

		this._connection = connection;
		this._connectionStore.value = connection.store;
	}

	private _handleUnexpectedExit(connection: IAgentHostConnection, e: { code: number; signal: string }): void {
		if (this._store.isDisposed || this._connection !== connection) {
			return;
		}

		this._hasActiveSessions = false;
		this._connectionCount = 0;
		this._lifetimeToken.clear();

		const willRestart = this._restartCount < Constants.MaxRestarts;
		reportAgentHostProcessError(this._telemetryService, {
			hostLaunchKind: AgentHostLaunchKind.VSCodeCLI,
			kind: 'unexpectedExit',
			code: e.code,
			restartCount: this._restartCount,
			willRestart,
		});
		this._connection = undefined;
		this._connectionStore.clear();
		this._startPromise = undefined;
		if (willRestart) {
			this._logService.error(`ServerAgentHostManager: agent host terminated unexpectedly with code ${e.code}`);
			this._restartCount++;
			void this.ensureStarted().catch(() => undefined);
		} else {
			this._logService.error(`ServerAgentHostManager: agent host terminated with code ${e.code}, giving up after ${Constants.MaxRestarts} restarts`);
			// A future explicit request gets a fresh crash-retry budget.
			this._restartCount = 0;
		}
	}

	private async _shutdown(): Promise<void> {
		try {
			await raceTimeout(this._shutdownGracefully(), Constants.ShutdownTimeoutMs, () => {
				this._logService.warn(`ServerAgentHostManager: agent host did not shut down within ${Constants.ShutdownTimeoutMs}ms; terminating it`);
			});
		} catch (error) {
			this._logService.error('ServerAgentHostManager: failed to shut down agent host gracefully', error);
		} finally {
			const connection = this._connection;
			this._startPromise = undefined;
			this._shuttingDown = false;
			if (connection) {
				if (this._connection === connection) {
					this._connection = undefined;
					this._connectionStore.clear();
				} else {
					connection.store.dispose();
				}
			}
		}
	}

	private async _shutdownGracefully(): Promise<void> {
		try {
			await this._startPromise;
		} catch {
			return;
		}
		await this._connection?.shutdown();
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

	private async _trackClientConnections(connection: IAgentHostConnection): Promise<void> {
		const connectionTracker = ProxyChannel.toService<IConnectionTrackerService>(connection.client.getChannel(AgentHostIpcChannels.ConnectionTracker));
		connection.store.add(connectionTracker.onDidChangeConnectionCount(count => {
			this._connectionCount = count;
			this._updateLifetimeToken();
		}));
		await connectionTracker.waitForConfiguredWebSocketServer();
	}

	private _updateLifetimeToken(): void {
		if (this._hasActiveSessions || this._connectionCount > 0) {
			this._lifetimeToken.value ??= this._serverLifetimeService.active('AgentHost');
		} else {
			this._lifetimeToken.clear();
		}
	}
}
