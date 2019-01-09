/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventMultiplexer } from 'vs/base/common/event';
import {
	IExtensionManagementService, ILocalExtension, IGalleryExtension, LocalExtensionType, InstallExtensionEvent, DidInstallExtensionEvent, IExtensionIdentifier, DidUninstallExtensionEvent, IReportedExtension, IGalleryMetadata,
	IExtensionManagementServerService, IExtensionManagementServer, IExtensionGalleryService
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { flatten } from 'vs/base/common/arrays';
import { isUIExtension } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IRemoteAuthorityResolverService, ResolvedAuthority } from 'vs/platform/remote/common/remoteAuthorityResolver';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ILogService } from 'vs/platform/log/common/log';

export class MultiExtensionManagementService extends Disposable implements IExtensionManagementService {

	_serviceBrand: any;

	readonly onInstallExtension: Event<InstallExtensionEvent>;
	readonly onDidInstallExtension: Event<DidInstallExtensionEvent>;
	readonly onUninstallExtension: Event<IExtensionIdentifier>;
	readonly onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	private readonly servers: IExtensionManagementServer[];

	constructor(
		@IExtensionManagementServerService private readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IRemoteAuthorityResolverService private readonly remoteAuthorityResolverService: IRemoteAuthorityResolverService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.servers = this.extensionManagementServerService.remoteExtensionManagementServer ? [this.extensionManagementServerService.localExtensionManagementServer, this.extensionManagementServerService.remoteExtensionManagementServer] : [this.extensionManagementServerService.localExtensionManagementServer];

		this.onInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<InstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onInstallExtension); return emitter; }, new EventMultiplexer<InstallExtensionEvent>())).event;
		this.onDidInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidInstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidInstallExtension); return emitter; }, new EventMultiplexer<DidInstallExtensionEvent>())).event;
		this.onUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<IExtensionIdentifier>, server) => { emitter.add(server.extensionManagementService.onUninstallExtension); return emitter; }, new EventMultiplexer<IExtensionIdentifier>())).event;
		this.onDidUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidUninstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidUninstallExtension); return emitter; }, new EventMultiplexer<DidUninstallExtensionEvent>())).event;
	}

	getInstalled(type?: LocalExtensionType): Promise<ILocalExtension[]> {
		return Promise.all(this.servers.map(({ extensionManagementService }) => extensionManagementService.getInstalled(type)))
			.then(result => flatten(result));
	}

	uninstall(extension: ILocalExtension, force?: boolean): Promise<void> {
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.uninstall(extension, force);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	reinstallFromGallery(extension: ILocalExtension): Promise<void> {
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.reinstallFromGallery(extension);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	updateMetadata(extension: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.updateMetadata(extension, metadata);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	zip(extension: ILocalExtension): Promise<URI> {
		throw new Error('Not Supported');
	}

	unzip(zipLocation: URI, type: LocalExtensionType): Promise<IExtensionIdentifier> {
		return Promise.all(this.servers.map(({ extensionManagementService }) => extensionManagementService.unzip(zipLocation, type))).then(([extensionIdentifier]) => extensionIdentifier);
	}

	install(vsix: URI): Promise<IExtensionIdentifier> {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return Promise.all([getManifest(vsix.fsPath), this.hasToSyncExtensions()])
				.then(([manifest, syncExtensions]) => {
					const servers = isUIExtension(manifest, this.configurationService) ? [this.extensionManagementServerService.localExtensionManagementServer] : syncExtensions ? this.servers : [this.extensionManagementServerService.remoteExtensionManagementServer!];
					return Promise.all(servers.map(server => server.extensionManagementService.install(vsix)))
						.then(([extensionIdentifier]) => extensionIdentifier);
				});
		}
		return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix);
	}

	installFromGallery(gallery: IGalleryExtension): Promise<void> {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return Promise.all([this.extensionGalleryService.getManifest(gallery, CancellationToken.None), this.hasToSyncExtensions()])
				.then(([manifest, syncExtensions]) => {
					if (manifest) {
						const servers = manifest && isUIExtension(manifest, this.configurationService) ? [this.extensionManagementServerService.localExtensionManagementServer] : syncExtensions ? this.servers : [this.extensionManagementServerService.remoteExtensionManagementServer!];
						return Promise.all(servers.map(server => server.extensionManagementService.installFromGallery(gallery)))
							.then(() => undefined);
					} else {
						this.logService.info('Manifest was not found. Hence installing only in local server');
						return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
					}
				});
		}
		return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getExtensionsReport();
	}

	private getServer(extension: ILocalExtension): IExtensionManagementServer | null {
		return this.extensionManagementServerService.getExtensionManagementServer(extension.location);
	}

	private _remoteAuthorityResolverPromise: Promise<ResolvedAuthority>;
	private hasToSyncExtensions(): Promise<boolean> {
		if (!this.extensionManagementServerService.remoteExtensionManagementServer) {
			return Promise.resolve(false);
		}
		if (!this._remoteAuthorityResolverPromise) {
			this._remoteAuthorityResolverPromise = this.remoteAuthorityResolverService.resolveAuthority(this.extensionManagementServerService.remoteExtensionManagementServer.authority);
		}
		return this._remoteAuthorityResolverPromise.then(({ syncExtensions }) => !!syncExtensions);
	}
}