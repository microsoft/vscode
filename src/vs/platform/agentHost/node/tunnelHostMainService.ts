/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, raceTimeout } from '../../../base/common/async.js';
import { CancellationError } from '../../../base/common/errors.js';
import { Emitter, Event } from '../../../base/common/event.js';
import { Disposable, DisposableStore, toDisposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { localize } from '../../../nls.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ILogger, ILoggerService } from '../../log/common/log.js';
import { ITunnelProcessCoordinator, ITunnelProcessOutput, ITunnelProcessStatus } from '../../remoteTunnel/node/tunnelProcessCoordinator.js';
import {
	ITunnelAgentHostHostingService,
	type ITunnelHostInfo,
	type TunnelHostStatus,
	TUNNEL_HOST_LOG_ID,
} from '../common/tunnelAgentHost.js';

const AGENT_HOST_START_TIMEOUT_MS = 5 * 60 * 1000;

/** Publishes agent host sharing status while the coordinator owns the tunnel process. */
export class TunnelHostMainService extends Disposable implements ITunnelAgentHostHostingService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeStatus = this._register(new Emitter<TunnelHostStatus>());
	readonly onDidChangeStatus: Event<TunnelHostStatus> = this._onDidChangeStatus.event;

	private readonly _logger: ILogger;
	private _request: { token: string } | undefined;
	private _lastStatus: TunnelHostStatus = { active: false };

	constructor(
		@ILoggerService loggerService: ILoggerService,
		@INativeEnvironmentService environmentService: INativeEnvironmentService,
		@ITunnelProcessCoordinator private readonly tunnelProcessCoordinator: ITunnelProcessCoordinator,
	) {
		super();
		this._logger = this._register(loggerService.createLogger(
			joinPath(environmentService.logsHome, `${TUNNEL_HOST_LOG_ID}.log`),
			{ id: TUNNEL_HOST_LOG_ID, name: localize('tunnelHost.log', "Remote Connections") },
		));
		this._register(tunnelProcessCoordinator.onDidChangeStatus(status => this._emitStatus(status)));
		this._register(tunnelProcessCoordinator.onDidOutput(output => this._handleOutput(output)));
	}

	async startHosting(token: string, authProvider: 'github' | 'microsoft'): Promise<ITunnelHostInfo> {
		const request = { token };
		this._request = request;
		// The readiness wait is created before the intent is handed over, so it
		// can outlive a rejection from the coordinator. Owning its store here
		// tears the wait down immediately instead of leaving it pending until
		// the start timeout elapses.
		const store = new DisposableStore();
		try {
			// Awaited together so the readiness promise always has a handler
			// attached: disposing the store below rejects it, which would
			// otherwise go unhandled on exactly the failure path this guards.
			const [status] = await Promise.all([
				this._waitForActiveStatus(store),
				this.tunnelProcessCoordinator.setAgentHostSharing({ token, authProvider, logLevel: this._logger.getLevel() }),
			]);
			return status.info;
		} catch (error) {
			// Without this the caller sees a failure while the sharing intent
			// survives, and a later reconcile brings hosting online anyway.
			// A newer request owns the intent, so only roll back our own.
			if (this._request === request) {
				this._request = undefined;
				try {
					await this.tunnelProcessCoordinator.setAgentHostSharing(undefined);
				} catch (rollbackError) {
					this._logger.error(rollbackError);
				}
			}
			throw error;
		} finally {
			store.dispose();
		}
	}

	async stopHosting(): Promise<void> {
		this._request = undefined;
		await this.tunnelProcessCoordinator.setAgentHostSharing(undefined);
		this._emitStatus(this.tunnelProcessCoordinator.getStatus());
	}

	getStatus(): Promise<TunnelHostStatus> {
		return Promise.resolve(this._getStatus(this.tunnelProcessCoordinator.getStatus()));
	}

	private _handleOutput(output: ITunnelProcessOutput): void {
		if (output.mode !== 'agentHost') {
			return;
		}
		if (output.isError) {
			this._logger.error(output.message);
		} else {
			this._logger.info(output.message);
		}
	}

	private async _waitForActiveStatus(store: DisposableStore): Promise<TunnelHostStatus & { active: true; info: ITunnelHostInfo }> {
		const current = this._getStatus(this.tunnelProcessCoordinator.getStatus());
		if (current.active) {
			return current;
		}

		const settled = new DeferredPromise<TunnelHostStatus & { active: true; info: ITunnelHostInfo }>();
		store.add(this.tunnelProcessCoordinator.onDidChangeStatus(coordinatorStatus => {
			const status = this._getStatus(coordinatorStatus);
			if (status.active) {
				settled.complete(status);
			} else if (coordinatorStatus.mode === 'agentHost' && coordinatorStatus.connectionState === 'disconnected') {
				settled.error(new Error(localize('tunnelHost.startFailed', "The agent host tunnel exited before it became ready.")));
			}
		}));
		// Settles the race when the caller abandons the wait, so neither this
		// promise nor `raceTimeout`'s timer outlives the store.
		store.add(toDisposable(() => settled.error(new CancellationError())));

		const status = await raceTimeout(settled.p, AGENT_HOST_START_TIMEOUT_MS);
		if (!status) {
			throw new Error(localize('tunnelHost.startTimeout', "Timed out waiting for the agent host tunnel to start."));
		}
		return status;
	}

	private _getStatus(status: ITunnelProcessStatus): TunnelHostStatus {
		if (!this._request || status.connectionState !== 'connected' || !status.tunnelName) {
			return { active: false };
		}
		const info = {
			tunnelName: status.tunnelName,
			...(status.tunnelId === undefined ? {} : { tunnelId: status.tunnelId }),
		};
		if (status.mode === 'remoteAccess' || status.mode === 'service') {
			return { active: true, info: { ...info, viaRemoteTunnelAccess: true } };
		}
		if (status.mode === 'agentHost') {
			return { active: true, info };
		}
		return { active: false };
	}

	private _emitStatus(coordinatorStatus: ITunnelProcessStatus): void {
		const status = this._getStatus(coordinatorStatus);
		if (!status.active && !this._lastStatus.active) {
			return;
		}
		if (status.active && this._lastStatus.active
			&& status.info.tunnelName === this._lastStatus.info.tunnelName
			&& status.info.tunnelId === this._lastStatus.info.tunnelId
			&& status.info.viaRemoteTunnelAccess === this._lastStatus.info.viaRemoteTunnelAccess) {
			return;
		}
		this._lastStatus = status;
		this._onDidChangeStatus.fire(status);
	}

	override dispose(): void {
		this._request = undefined;
		void this.tunnelProcessCoordinator.setAgentHostSharing(undefined);
		super.dispose();
	}
}
