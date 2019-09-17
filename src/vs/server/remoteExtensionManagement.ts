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

export interface IExtensionsManagementProcessInitData {
	args: ParsedArgs;
}

export class ManagementConnection {

	private _onClose = new Emitter<void>();
	public readonly onClose: Event<void> = this._onClose.event;

	public readonly protocol: PersistentProtocol;
	private _disposed: boolean;
	private _disconnectWaitTimer: NodeJS.Timeout | null = null;

	constructor(protocol: PersistentProtocol) {
		this.protocol = protocol;
		this._disposed = false;
		this._disconnectWaitTimer = null;

		this.protocol.onClose(() => this._cleanResources());
		this.protocol.onSocketClose(() => {
			// The socket has closed, let's give the renderer a certain amount of time to reconnect
			this._disconnectWaitTimer = setTimeout(() => {
				this._disconnectWaitTimer = null;
				this._cleanResources();
			}, ProtocolConstants.ReconnectionGraceTime);
		});
	}

	private _cleanResources(): void {
		if (this._disposed) {
			// already called
			return;
		}
		this._disposed = true;
		const socket = this.protocol.getSocket();
		this.protocol.sendDisconnect();
		this.protocol.dispose();
		socket.end();
		this._onClose.fire(undefined);
	}

	public acceptReconnection(socket: ISocket, initialDataChunk: VSBuffer): void {
		if (this._disconnectWaitTimer) {
			clearTimeout(this._disconnectWaitTimer);
			this._disconnectWaitTimer = null;
		}
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
