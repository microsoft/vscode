/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { joinPath } from '../../../base/common/resources.js';
import { isString } from '../../../base/common/types.js';
import { localize } from '../../../nls.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../environment/common/environment.js';
import { ISharedProcessLifecycleService } from '../../lifecycle/node/sharedProcessLifecycleService.js';
import { ILogger, ILoggerService } from '../../log/common/log.js';
import { IProductService } from '../../product/common/productService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { CONFIGURATION_KEY_HOST_NAME, CONFIGURATION_KEY_PREVENT_SLEEP, ConnectionInfo, IRemoteTunnelSession, IRemoteTunnelService, LOGGER_NAME, LOG_ID, TunnelMode, TunnelStates, TunnelStatus, INACTIVE_TUNNEL_MODE, ActiveTunnelMode } from '../common/remoteTunnel.js';
import { ITunnelProcessCoordinator, ITunnelProcessMachineStatus, ITunnelProcessOutput, ITunnelProcessStatus } from './tunnelProcessCoordinator.js';

type RemoteTunnelEnablementClassification = {
	owner: 'aeschli';
	comment: 'Reporting when Remote Tunnel access is turned on or off';
	enabled?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if Remote Tunnel Access is enabled or not' };
	service?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Flag indicating if Remote Tunnel Access is installed as a service' };
	tunnelName?: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the tunnel being enabled or disabled' };
};

type RemoteTunnelEnablementEvent = {
	enabled: boolean;
	service: boolean;
	tunnelName?: string;
};

type RemoteTunnelConnectedClassification = {
	owner: 'aeschli';
	comment: 'Reporting when a Remote Tunnel connection is established';
	tunnelName: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The name of the connected tunnel' };
	isAttached: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Whether the connection is attached to an existing tunnel process' };
};

type RemoteTunnelConnectedEvent = {
	tunnelName: string;
	isAttached: boolean;
};

const restartTunnelOnConfigurationChanges: readonly string[] = [
	CONFIGURATION_KEY_HOST_NAME,
	CONFIGURATION_KEY_PREVENT_SLEEP,
];

const TUNNEL_ACCESS_SESSION = 'remoteTunnelSession';
const TUNNEL_ACCESS_IS_SERVICE = 'remoteTunnelIsService';

/** Publishes Remote Tunnel Access status while the coordinator owns the CLI process. */
export class RemoteTunnelService extends Disposable implements IRemoteTunnelService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidTokenFailedEmitter = this._register(new Emitter<IRemoteTunnelSession | undefined>());
	readonly onDidTokenFailed = this._onDidTokenFailedEmitter.event;

	private readonly _onDidChangeTunnelStatusEmitter = this._register(new Emitter<TunnelStatus>());
	readonly onDidChangeTunnelStatus = this._onDidChangeTunnelStatusEmitter.event;

	private readonly _onDidChangeModeEmitter = this._register(new Emitter<TunnelMode>());
	readonly onDidChangeMode = this._onDidChangeModeEmitter.event;

	private readonly _logger: ILogger;
	private readonly _startTunnelProcessDelayer = this._register(new Delayer<void>(100));
	private _mode: TunnelMode = INACTIVE_TUNNEL_MODE;
	private _tunnelStatus: TunnelStatus = TunnelStates.uninitialized;
	private _initialized = false;
	constructor(
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IProductService _productService: IProductService,
		@INativeEnvironmentService private readonly environmentService: INativeEnvironmentService,
		@ILoggerService loggerService: ILoggerService,
		@ISharedProcessLifecycleService sharedProcessLifecycleService: ISharedProcessLifecycleService,
		@IConfigurationService configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ITunnelProcessCoordinator private readonly tunnelProcessCoordinator: ITunnelProcessCoordinator,
	) {
		super();
		this._logger = this._register(loggerService.createLogger(joinPath(environmentService.logsHome, `${LOG_ID}.log`), { id: LOG_ID, name: LOGGER_NAME }));
		this._register(this.tunnelProcessCoordinator.onDidChangeStatus(status => this._handleCoordinatorStatus(status)));
		this._register(this.tunnelProcessCoordinator.onDidOutput(output => this._handleCoordinatorOutput(output)));
		this._register(this.tunnelProcessCoordinator.onDidMachineStatus(status => this._handleMachineStatus(status)));
		this._register(sharedProcessLifecycleService.onWillShutdown(() => this.dispose()));
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (restartTunnelOnConfigurationChanges.some(c => e.affectsConfiguration(c))) {
				this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
			}
		}));
		this._mode = this._restoreMode();
	}

	getTunnelStatus(): Promise<TunnelStatus> {
		return Promise.resolve(this._tunnelStatus);
	}

	getMode(): Promise<TunnelMode> {
		return Promise.resolve(this._mode);
	}

	async initialize(mode: TunnelMode): Promise<TunnelStatus> {
		if (this._initialized) {
			return this._tunnelStatus;
		}
		this._initialized = true;
		this.setMode(mode);
		try {
			await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
		} catch (error) {
			this._logger.error(error);
		}
		return this._tunnelStatus;
	}

	async startTunnel(mode: ActiveTunnelMode): Promise<TunnelStatus> {
		if (isSameMode(this._mode, mode) && this._tunnelStatus.type !== 'disconnected') {
			return this._tunnelStatus;
		}
		this.setMode(mode);
		try {
			await this._startTunnelProcessDelayer.trigger(() => this.updateTunnelProcess());
		} catch (error) {
			this._logger.error(error);
		}
		return this._tunnelStatus;
	}

	async stopTunnel(): Promise<void> {
		if (this._mode.active) {
			this.setMode(INACTIVE_TUNNEL_MODE);
		}
		try {
			await this.tunnelProcessCoordinator.setRemoteAccess(INACTIVE_TUNNEL_MODE, this._logger.getLevel());
		} catch (error) {
			this._logger.error(error);
		}
		this.setTunnelStatus(TunnelStates.disconnected());
	}

	getTunnelName(): Promise<string | undefined> {
		return Promise.resolve(this.tunnelProcessCoordinator.getIntendedTunnelName());
	}

	private setMode(mode: TunnelMode): void {
		if (isSameMode(this._mode, mode)) {
			return;
		}
		this._mode = mode;
		this._storeMode(mode);
		this._onDidChangeModeEmitter.fire(this._mode);
		if (mode.active) {
			this._logger.info(`Session updated: ${mode.session.accountLabel} (${mode.session.providerId}) (service=${mode.asService})`);
			if (mode.session.token) {
				this._logger.info(`Session token updated: ${mode.session.accountLabel} (${mode.session.providerId})`);
			}
		} else {
			this._logger.info('Session reset');
		}
	}

	private async updateTunnelProcess(): Promise<void> {
		const tunnelName = this.tunnelProcessCoordinator.getStatus().tunnelName;
		this.telemetryService.publicLog2<RemoteTunnelEnablementEvent, RemoteTunnelEnablementClassification>('remoteTunnel.enablement', {
			enabled: this._mode.active,
			service: this._mode.active && this._mode.asService,
			tunnelName,
		});
		if (this._mode.active || this.tunnelProcessCoordinator.getStatus().mode === 'remoteAccess' || this.tunnelProcessCoordinator.getStatus().mode === 'service') {
			await this.tunnelProcessCoordinator.setRemoteAccess(this._mode, this._logger.getLevel());
		} else {
			await this.tunnelProcessCoordinator.restart();
		}
	}

	private _handleCoordinatorStatus(status: ITunnelProcessStatus): void {
		if (status.mode !== 'remoteAccess' && status.mode !== 'service') {
			if (!this._mode.active && this._tunnelStatus.type !== 'uninitialized') {
				this.setTunnelStatus(TunnelStates.disconnected());
			}
			return;
		}
		if (status.connectionState === 'connecting') {
			this.setTunnelStatus(TunnelStates.connecting());
		} else if (status.connectionState === 'disconnected') {
			if (this._tunnelStatus.type !== 'disconnected') {
				this.setTunnelStatus(TunnelStates.disconnected());
			}
		}
	}

	private _handleCoordinatorOutput(output: ITunnelProcessOutput): void {
		if (output.mode !== 'remoteAccess' && output.mode !== 'service') {
			return;
		}
		let message = output.message;
		if (this._mode.active && this._mode.session.token) {
			message = message.replaceAll(this._mode.session.token, '*'.repeat(4));
		}
		if (output.isError) {
			this._logger.error(message);
		} else {
			this._logger.info(message);
		}
		if (!this.environmentService.isBuilt && message.startsWith('   Compiling')) {
			// Cargo compilation output is not emitted by the tunnel CLI.
			this.setTunnelStatus(TunnelStates.connecting(localize('remoteTunnelService.building', 'Building CLI from sources')));
		}
	}

	private _handleMachineStatus(event: ITunnelProcessMachineStatus): void {
		// `service` mode also runs a session process, which attaches to the
		// installed service's singleton; its events are what move the public
		// status off `connecting`.
		if (event.mode !== 'remoteAccess' && event.mode !== 'service') {
			return;
		}
		if (event.status.type === 'connected') {
			const { tunnelName, tunnelId, isAttached, link, domain } = event.status;
			const info: ConnectionInfo = {
				tunnelName,
				isAttached,
				...(tunnelId === undefined ? {} : { tunnelId }),
				...(link === undefined ? {} : { link, domain }),
			};
			this.telemetryService.publicLog2<RemoteTunnelConnectedEvent, RemoteTunnelConnectedClassification>('remoteTunnel.connected', {
				tunnelName: info.tunnelName,
				isAttached: info.isAttached,
			});
			this.setTunnelStatus(TunnelStates.connected(info, this.tunnelProcessCoordinator.getStatus().serviceInstallFailed));
		} else if (event.status.type === 'tokenError') {
			event.cancel();
			this._onDidTokenFailedEmitter.fire(this._mode.active ? this._mode.session : undefined);
			this.setTunnelStatus(TunnelStates.disconnected(this._mode.active ? this._mode.session : undefined));
		}
	}

	private setTunnelStatus(tunnelStatus: TunnelStatus): void {
		this._tunnelStatus = tunnelStatus;
		this._onDidChangeTunnelStatusEmitter.fire(tunnelStatus);
		this.tunnelProcessCoordinator.setRemoteAccessStatus(tunnelStatus);
	}

	private _restoreMode(): TunnelMode {
		try {
			const tunnelAccessSession = this.storageService.get(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
			const asService = this.storageService.getBoolean(TUNNEL_ACCESS_IS_SERVICE, StorageScope.APPLICATION, false);
			if (tunnelAccessSession) {
				const session = JSON.parse(tunnelAccessSession) as IRemoteTunnelSession;
				if (session && isString(session.accountLabel) && isString(session.sessionId) && isString(session.providerId)) {
					return { active: true, session, asService };
				}
				this._logger.error('Problems restoring session from storage, invalid format', session);
			}
		} catch (error) {
			this._logger.error('Problems restoring session from storage', error);
		}
		return INACTIVE_TUNNEL_MODE;
	}

	private _storeMode(mode: TunnelMode): void {
		if (mode.active) {
			const sessionWithoutToken = { providerId: mode.session.providerId, sessionId: mode.session.sessionId, accountLabel: mode.session.accountLabel };
			this.storageService.store(TUNNEL_ACCESS_SESSION, JSON.stringify(sessionWithoutToken), StorageScope.APPLICATION, StorageTarget.MACHINE);
			this.storageService.store(TUNNEL_ACCESS_IS_SERVICE, mode.asService, StorageScope.APPLICATION, StorageTarget.MACHINE);
		} else {
			this.storageService.remove(TUNNEL_ACCESS_SESSION, StorageScope.APPLICATION);
			this.storageService.remove(TUNNEL_ACCESS_IS_SERVICE, StorageScope.APPLICATION);
		}
	}
}

function isSameSession(a1: IRemoteTunnelSession | undefined, a2: IRemoteTunnelSession | undefined): boolean {
	if (a1 && a2) {
		return a1.sessionId === a2.sessionId && a1.providerId === a2.providerId && a1.token === a2.token;
	}
	return a1 === a2;
}

function isSameMode(a: TunnelMode, b: TunnelMode): boolean {
	if (a.active !== b.active) {
		return false;
	} else if (a.active && b.active) {
		return a.asService === b.asService && isSameSession(a.session, b.session);
	}
	return true;
}
