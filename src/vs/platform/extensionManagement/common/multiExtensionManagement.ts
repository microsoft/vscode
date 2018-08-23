/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Event, EventMultiplexer } from 'vs/base/common/event';
import {
	IExtensionManagementService, ILocalExtension, IGalleryExtension, LocalExtensionType, InstallExtensionEvent, DidInstallExtensionEvent, IExtensionIdentifier, DidUninstallExtensionEvent, IReportedExtension, IGalleryMetadata,
	IExtensionManagementServerService, IExtensionManagementServer, IExtensionGalleryService, InstallOperation
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { flatten } from 'vs/base/common/arrays';
import { isWorkspaceExtension, areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import URI from 'vs/base/common/uri';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { Action } from 'vs/base/common/actions';
import { ILogService } from 'vs/platform/log/common/log';
import { Disposable } from 'vs/base/common/lifecycle';

export class MulitExtensionManagementService extends Disposable implements IExtensionManagementService {

	_serviceBrand: any;

	readonly onInstallExtension: Event<InstallExtensionEvent>;
	readonly onDidInstallExtension: Event<DidInstallExtensionEvent>;
	readonly onUninstallExtension: Event<IExtensionIdentifier>;
	readonly onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	private readonly servers: IExtensionManagementServer[];
	private readonly localServer: IExtensionManagementServer;
	private readonly otherServers: IExtensionManagementServer[];

	constructor(
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService,
		@ILogService private logService: ILogService,
		@IExtensionGalleryService private extensionGalleryService: IExtensionGalleryService
	) {
		super();
		this.servers = this.extensionManagementServerService.extensionManagementServers;
		this.localServer = this.extensionManagementServerService.getLocalExtensionManagementServer();
		this.otherServers = this.servers.filter(s => s !== this.localServer);

		this.onInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<InstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onInstallExtension); return emitter; }, new EventMultiplexer<InstallExtensionEvent>())).event;
		this.onDidInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidInstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidInstallExtension); return emitter; }, new EventMultiplexer<DidInstallExtensionEvent>())).event;
		this.onUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<IExtensionIdentifier>, server) => { emitter.add(server.extensionManagementService.onUninstallExtension); return emitter; }, new EventMultiplexer<IExtensionIdentifier>())).event;
		this.onDidUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidUninstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidUninstallExtension); return emitter; }, new EventMultiplexer<DidUninstallExtensionEvent>())).event;

		if (this.otherServers.length) {
			this.syncExtensions();
		}
	}

	getInstalled(type?: LocalExtensionType): TPromise<ILocalExtension[]> {
		return TPromise.join(this.servers.map(({ extensionManagementService }) => extensionManagementService.getInstalled(type)))
			.then(result => flatten(result));
	}

	uninstall(extension: ILocalExtension, force?: boolean): TPromise<void> {
		return this.getServer(extension).extensionManagementService.uninstall(extension, force);
	}

	reinstallFromGallery(extension: ILocalExtension): TPromise<void> {
		return this.getServer(extension).extensionManagementService.reinstallFromGallery(extension);
	}

	updateMetadata(extension: ILocalExtension, metadata: IGalleryMetadata): TPromise<ILocalExtension> {
		return this.getServer(extension).extensionManagementService.updateMetadata(extension, metadata);
	}

	zip(extension: ILocalExtension): TPromise<URI> {
		throw new Error('Not Supported');
	}

	unzip(zipLocation: URI, type: LocalExtensionType): TPromise<IExtensionIdentifier> {
		return TPromise.join(this.servers.map(({ extensionManagementService }) => extensionManagementService.unzip(zipLocation, type))).then(() => null);
	}

	install(vsix: URI): TPromise<IExtensionIdentifier> {
		return this.localServer.extensionManagementService.install(vsix)
			.then(extensionIdentifer => this.localServer.extensionManagementService.getInstalled(LocalExtensionType.User)
				.then(installed => {
					const extension = installed.filter(i => areSameExtensions(i.identifier, extensionIdentifer))[0];
					if (extension && isWorkspaceExtension(extension.manifest)) {
						return TPromise.join(this.otherServers.map(server => server.extensionManagementService.install(vsix)))
							.then(() => extensionIdentifer);
					}
					return extensionIdentifer;
				}));
	}

	installFromGallery(gallery: IGalleryExtension): TPromise<void> {
		if (this.otherServers.length === 0) {
			return this.localServer.extensionManagementService.installFromGallery(gallery);
		}
		return this.extensionGalleryService.getManifest(gallery)
			.then(manifest => {
				const servers = isWorkspaceExtension(manifest) ? this.servers : [this.localServer];
				return TPromise.join(servers.map(server => server.extensionManagementService.installFromGallery(gallery)))
					.then(() => null);
			});
	}

	getExtensionsReport(): TPromise<IReportedExtension[]> {
		return this.extensionManagementServerService.getLocalExtensionManagementServer().extensionManagementService.getExtensionsReport();
	}

	private getServer(extension: ILocalExtension): IExtensionManagementServer {
		return this.extensionManagementServerService.getExtensionManagementServer(extension.location);
	}

	private async syncExtensions(): Promise<void> {
		this.localServer.extensionManagementService.getInstalled(LocalExtensionType.User)
			.then(async localExtensions => {
				const workspaceExtensions = localExtensions.filter(e => isWorkspaceExtension(e.manifest));
				const extensionsToSync: Map<IExtensionManagementServer, ILocalExtension[]> = await this.getExtensionsToSync(workspaceExtensions);
				if (extensionsToSync.size > 0) {
					const handler = this.notificationService.notify({ severity: Severity.Info, message: localize('synchronising', "Synchronising workspace extensions...") });
					handler.progress.infinite();
					this.doSyncExtensions(extensionsToSync).then(() => {
						handler.progress.done();
						handler.updateMessage(localize('Synchronize.finished', "Finished synchronising workspace extensions. Please reload now."));
						handler.updateActions({
							primary: [
								new Action('Synchronize.reloadNow', localize('Synchronize.reloadNow', "Reload Now"), null, true, () => this.windowService.reloadWindow())
							]
						});
					}, error => {
						handler.progress.done();
						handler.updateMessage(error);
					});
				}
			}, err => this.logService.error('Error while Synchronisation', err));
	}

	private async getExtensionsToSync(workspaceExtensions: ILocalExtension[]): Promise<Map<IExtensionManagementServer, ILocalExtension[]>> {
		const extensionsToSync: Map<IExtensionManagementServer, ILocalExtension[]> = new Map<IExtensionManagementServer, ILocalExtension[]>();
		for (const server of this.otherServers) {
			const extensions = await server.extensionManagementService.getInstalled(LocalExtensionType.User);
			const groupedByVersionId: Map<string, ILocalExtension> = extensions.reduce((groupedById, extension) => groupedById.set(`${extension.galleryIdentifier.id}-${extension.manifest.version}`, extension), new Map<string, ILocalExtension>());
			const toSync = workspaceExtensions.filter(e => !groupedByVersionId.has(`${e.galleryIdentifier.id}-${e.manifest.version}`));
			if (toSync.length) {
				extensionsToSync.set(server, toSync);
			}
		}
		return extensionsToSync;
	}

	private async doSyncExtensions(extensionsToSync: Map<IExtensionManagementServer, ILocalExtension[]>): Promise<void> {
		const ids: string[] = [];
		const zipLocationResolvers: TPromise<{ location: URI, vsix: boolean }>[] = [];

		extensionsToSync.forEach(extensions => {
			for (const extension of extensions) {
				if (ids.indexOf(extension.galleryIdentifier.id) === -1) {
					ids.push(extension.galleryIdentifier.id);
					zipLocationResolvers.push(this.downloadFromGallery(extension)
						.then(location => location ? { location, vsix: true } : this.localServer.extensionManagementService.zip(extension).then(location => ({ location, vsix: false }))));
				}
			}
		});

		const zipLocations = await TPromise.join(zipLocationResolvers);
		const promises: Promise<any>[] = [];
		extensionsToSync.forEach((extensions, server) => {
			let promise: Promise<any> = Promise.resolve();
			extensions.forEach(extension => {
				const index = ids.indexOf(extension.galleryIdentifier.id);
				const { location, vsix } = zipLocations[index];
				promise = promise.then(() => vsix ? server.extensionManagementService.install(location) : server.extensionManagementService.unzip(location, extension.type));
			});
			promises.push(promise);
		});

		await Promise.all(promises);
	}

	private downloadFromGallery(extension: ILocalExtension): TPromise<URI> {
		if (this.extensionGalleryService.isEnabled()) {
			return this.extensionGalleryService.getExtension(extension.galleryIdentifier, extension.manifest.version)
				.then(galleryExtension => galleryExtension ? this.extensionGalleryService.download(galleryExtension, InstallOperation.None).then(location => URI.file(location)) : null);
		}
		return TPromise.as(null);
	}
}