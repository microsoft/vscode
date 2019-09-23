/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------------------------------------------*/

import { ParsedArgs, IEnvironmentService } from 'vs/platform/environment/common/environment';
import { PersistentProtocol, ProtocolConstants, ISocket } from 'vs/base/parts/ipc/common/ipc.net';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService } from 'vs/platform/log/common/log';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { ConfigurationService } from 'vs/platform/configuration/node/configurationService';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IRequestService } from 'vs/platform/request/common/request';
import { RequestService } from 'vs/platform/request/node/requestService';
import { NullTelemetryService } from 'vs/platform/telemetry/common/telemetryUtils';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionGalleryService, IExtensionManagementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionGalleryService } from 'vs/platform/extensionManagement/common/extensionGalleryService';
import { ExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { InstantiationService } from 'vs/platform/instantiation/common/instantiationService';
import { Emitter, Event } from 'vs/base/common/event';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Main as CliMain } from 'vs/code/node/cliProcessMain';
import { VSBuffer } from 'vs/base/common/buffer';
import product from 'vs/platform/product/common/product';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { FileService } from 'vs/platform/files/common/fileService';
import { DiskFileSystemProvider } from 'vs/platform/files/node/diskFileSystemProvider';
import { Schemas } from 'vs/base/common/network';
import { IFileService } from 'vs/platform/files/common/files';
import { IProductService } from 'vs/platform/product/common/productService';
import { ServerEnvironmentService } from 'vs/server/remoteExtensionHostAgent';
import { RunOnceScheduler } from 'vs/base/common/async';

export interface IExtensionsManagementProcessInitData {
	args: ParsedArgs;
}

function printTime(ms: number): string {
	let h = 0;
	let m = 0;
	let s = 0;
	if (ms >= 1000) {
		s = Math.floor(ms / 1000);
		ms -= s * 1000;
	}
	if (s >= 60) {
		m = Math.floor(s / 60);
		s -= m * 60;
	}
	if (m >= 60) {
		h = Math.floor(m / 60);
		m -= h * 60;
	}
	const _h = h ? `${h}h` : ``;
	const _m = m ? `${m}m` : ``;
	const _s = s ? `${s}s` : ``;
	const _ms = ms ? `${ms}ms` : ``;
	return `${_h}${_m}${_s}${_ms}`;
}

export class ManagementConnection {

	private _onClose = new Emitter<void>();
	public readonly onClose: Event<void> = this._onClose.event;

	private readonly _reconnectionGraceTime: number;
	private readonly _reconnectionShortGraceTime: number;
	private _remoteAddress: string;

	public readonly protocol: PersistentProtocol;
	private _disposed: boolean;
	private _disconnectRunner1: RunOnceScheduler;
	private _disconnectRunner2: RunOnceScheduler;

	constructor(
		private readonly _logService: ILogService,
		private readonly _reconnectionToken: string,
		remoteAddress: string,
		protocol: PersistentProtocol
	) {
		this._reconnectionGraceTime = ProtocolConstants.ReconnectionGraceTime;
		this._reconnectionShortGraceTime = ProtocolConstants.ReconnectionShortGraceTime;
		this._remoteAddress = remoteAddress;

		this.protocol = protocol;
		this._disposed = false;
		this._disconnectRunner1 = new RunOnceScheduler(() => {
			this._log(`The reconnection grace time of ${printTime(this._reconnectionGraceTime)} has expired, so the connection will be disposed.`);
			this._cleanResources();
		}, this._reconnectionGraceTime);
		this._disconnectRunner2 = new RunOnceScheduler(() => {
			this._log(`The reconnection short grace time of ${printTime(this._reconnectionShortGraceTime)} has expired, so the connection will be disposed.`);
			this._cleanResources();
		}, this._reconnectionShortGraceTime);

		this.protocol.onClose(() => {
			this._log(`The client has disconnected gracefully, so the connection will be disposed.`);
			this._cleanResources();
		});
		this.protocol.onSocketClose(() => {
			this._log(`The client has disconnected, will wait for reconnection ${printTime(this._reconnectionGraceTime)} before disposing...`);
			// The socket has closed, let's give the renderer a certain amount of time to reconnect
			this._disconnectRunner1.schedule();
		});

		this._log(`New connection established.`);
	}

	private _log(_str: string): void {
		this._logService.info(`[${this._remoteAddress}][${this._reconnectionToken.substr(0, 8)}][ManagementConnection] ${_str}`);
	}

	public shortenReconnectionGraceTimeIfNecessary(): void {
		if (this._disconnectRunner2.isScheduled()) {
			// we are disconnected and already running the short reconnection timer
			return;
		}
		if (this._disconnectRunner1.isScheduled()) {
			this._log(`Another client has connected, will shorten the wait for reconnection ${printTime(this._reconnectionShortGraceTime)} before disposing...`);
			// we are disconnected and running the long reconnection timer
			this._disconnectRunner2.schedule();
		}
	}

	private _cleanResources(): void {
		if (this._disposed) {
			// already called
			return;
		}
		this._disposed = true;
		this._disconnectRunner1.dispose();
		this._disconnectRunner2.dispose();
		const socket = this.protocol.getSocket();
		this.protocol.sendDisconnect();
		this.protocol.dispose();
		socket.end();
		this._onClose.fire(undefined);
	}

	public acceptReconnection(remoteAddress: string, socket: ISocket, initialDataChunk: VSBuffer): void {
		this._remoteAddress = remoteAddress;
		this._log(`The client has reconnected.`);
		this._disconnectRunner1.cancel();
		this._disconnectRunner2.cancel();
		this.protocol.beginAcceptReconnection(socket, initialDataChunk);
		this.protocol.endAcceptReconnection();
	}
}

export function shouldSpawnCli(argv: ParsedArgs): boolean {
	return !!argv['list-extensions']
		|| !!argv['install-extension']
		|| !!argv['uninstall-extension']
		|| !!argv['locate-extension'];
}

export async function run(argv: ParsedArgs, environmentService: ServerEnvironmentService, logService: ILogService): Promise<boolean> {
	if (!shouldSpawnCli(argv)) {
		return false;
	}

	const disposables = new DisposableStore();
	const services = new ServiceCollection();

	services.set(IEnvironmentService, environmentService);
	services.set(ILogService, logService);
	services.set(IProductService, { _serviceBrand: undefined, ...product });

	// Files
	const fileService = new FileService(logService);
	disposables.add(fileService);
	services.set(IFileService, fileService);

	const diskFileSystemProvider = new DiskFileSystemProvider(logService);
	disposables.add(diskFileSystemProvider);
	fileService.registerProvider(Schemas.file, diskFileSystemProvider);

	const configurationService = new ConfigurationService(environmentService.settingsResource);
	disposables.add(configurationService);
	await configurationService.initialize();
	services.set(IConfigurationService, configurationService);

	const instantiationService: IInstantiationService = new InstantiationService(services);

	services.set(IRequestService, new SyncDescriptor(RequestService));
	services.set(ITelemetryService, NullTelemetryService);
	services.set(IExtensionGalleryService, new SyncDescriptor(ExtensionGalleryService));
	services.set(IExtensionManagementService, new SyncDescriptor(ExtensionManagementService));

	try {
		await instantiationService.createInstance(CliMain).run(argv);
	} finally {
		disposables.dispose();
	}
	return true;
}
