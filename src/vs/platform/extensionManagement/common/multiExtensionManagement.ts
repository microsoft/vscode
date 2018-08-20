/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { Event, EventMultiplexer } from 'vs/base/common/event';
import {
	IExtensionManagementService, ILocalExtension, IGalleryExtension, LocalExtensionType, InstallExtensionEvent, DidInstallExtensionEvent, IExtensionIdentifier, DidUninstallExtensionEvent, IReportedExtension, IGalleryMetadata,
	IExtensionManagementServerService, IExtensionManagementServer
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { flatten } from 'vs/base/common/arrays';
import { isWorkspaceExtension } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import URI from 'vs/base/common/uri';
import { INotificationService, Severity } from 'vs/platform/notification/common/notification';
import { localize } from 'vs/nls';
import { IWindowService } from 'vs/platform/windows/common/windows';
import { Action } from 'vs/base/common/actions';

export class MulitExtensionManagementService implements IExtensionManagementService {

	_serviceBrand: any;

	onInstallExtension: Event<InstallExtensionEvent>;
	onDidInstallExtension: Event<DidInstallExtensionEvent>;
	onUninstallExtension: Event<IExtensionIdentifier>;
	onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	private readonly servers: IExtensionManagementServer[];

	constructor(
		@IExtensionManagementServerService private extensionManagementServerService: IExtensionManagementServerService,
		@INotificationService private notificationService: INotificationService,
		@IWindowService private windowService: IWindowService
	) {
		this.servers = this.extensionManagementServerService.extensionManagementServers;
		this.onInstallExtension = this.servers.reduce((emitter: EventMultiplexer<InstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onInstallExtension); return emitter; }, new EventMultiplexer<InstallExtensionEvent>()).event;
		this.onDidInstallExtension = this.servers.reduce((emitter: EventMultiplexer<DidInstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidInstallExtension); return emitter; }, new EventMultiplexer<DidInstallExtensionEvent>()).event;
		this.onUninstallExtension = this.servers.reduce((emitter: EventMultiplexer<IExtensionIdentifier>, server) => { emitter.add(server.extensionManagementService.onUninstallExtension); return emitter; }, new EventMultiplexer<IExtensionIdentifier>()).event;
		this.onDidUninstallExtension = this.servers.reduce((emitter: EventMultiplexer<DidUninstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidUninstallExtension); return emitter; }, new EventMultiplexer<DidUninstallExtensionEvent>()).event;
		this.syncExtensions();
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

	unzip(zipLocation: URI): TPromise<void> {
		return TPromise.join(this.servers.map(({ extensionManagementService }) => extensionManagementService.unzip(zipLocation))).then(() => null);
	}

	install(vsix: URI): TPromise<void> {
		return TPromise.join(this.servers.map(({ extensionManagementService }) => extensionManagementService.install(vsix))).then(() => null);
	}

	installFromGallery(extension: IGalleryExtension): TPromise<void> {
		return TPromise.join(this.servers.map(({ extensionManagementService }) => extensionManagementService.installFromGallery(extension))).then(() => null);
	}

	getExtensionsReport(): TPromise<IReportedExtension[]> {
		return this.extensionManagementServerService.getLocalExtensionManagementServer().extensionManagementService.getExtensionsReport();
	}

	private getServer(extension: ILocalExtension): IExtensionManagementServer {
		return this.extensionManagementServerService.getExtensionManagementServer(extension.location);
	}

	private async syncExtensions(): Promise<void> {
		const localServer = this.extensionManagementServerService.getLocalExtensionManagementServer();
		localServer.extensionManagementService.getInstalled()
			.then(async localExtensions => {
				const workspaceExtensions = localExtensions.filter(e => isWorkspaceExtension(e.manifest));
				const otherServers = this.servers.filter(s => s !== localServer);

				const extensionsToSync: Map<IExtensionManagementServer, ILocalExtension[]> = await this.getExtensionsToSync(workspaceExtensions, otherServers);

				if (extensionsToSync.size > 0) {
					const handler = this.notificationService.notify({ severity: Severity.Info, message: localize('synchronising', "Synchronizing workspace extensions...") });
					handler.progress.infinite();
					const promises: TPromise<any>[] = [];
					const vsixById: Map<string, TPromise<URI>> = new Map<string, TPromise<URI>>();
					extensionsToSync.forEach((extensions, server) => {
						for (const extension of extensions) {
							let vsix = vsixById.get(extension.galleryIdentifier.id);
							if (!vsix) {
								vsix = localServer.extensionManagementService.zip(extension);
								vsixById.set(extension.galleryIdentifier.id, vsix);
								promises.push(vsix);
							}
							promises.push(vsix.then(location => server.extensionManagementService.unzip(location)));
						}
					});
					TPromise.join(promises).then(() => {
						handler.progress.done();
						handler.updateMessage(localize('Synchronize.finished', "Finished synchronizing workspace extensions. Please reload now."));
						handler.updateActions({
							primary: [
								new Action('Synchronize.reloadNow', localize('Synchronize.reloadNow', "Reload Now"), null, true, () => this.windowService.reloadWindow())
							]
						});
					});
				}
			}, err => {
				console.log(err);
			});
	}

	private async getExtensionsToSync(workspaceExtensions: ILocalExtension[], servers: IExtensionManagementServer[]): Promise<Map<IExtensionManagementServer, ILocalExtension[]>> {
		const extensionsToSync: Map<IExtensionManagementServer, ILocalExtension[]> = new Map<IExtensionManagementServer, ILocalExtension[]>();
		for (const server of servers) {
			const extensions = await server.extensionManagementService.getInstalled();
			const groupedById = this.groupById(extensions);
			const toSync = workspaceExtensions.filter(e => !groupedById.has(e.galleryIdentifier.id));
			if (toSync.length) {
				extensionsToSync.set(server, toSync);
			}
		}
		return extensionsToSync;
	}

	private groupById(extensions: ILocalExtension[]): Map<string, ILocalExtension> {
		const result: Map<string, ILocalExtension> = new Map<string, ILocalExtension>();
		for (const extension of extensions) {
			result.set(extension.galleryIdentifier.id, extension);
		}
		return result;
	}
}