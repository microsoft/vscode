/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventMultiplexer } from 'vs/base/common/event';
import {
	IExtensionManagementService, ILocalExtension, IGalleryExtension, InstallExtensionEvent, DidInstallExtensionEvent, IExtensionIdentifier, DidUninstallExtensionEvent, IReportedExtension, IGalleryMetadata, IExtensionGalleryService
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionManagementServer, IExtensionManagementServerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionType, isLanguagePackExtension, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localize } from 'vs/nls';
import { isUIExtension } from 'vs/workbench/services/extensions/common/extensionsUtil';
import { IProductService } from 'vs/platform/product/common/product';
import { Schemas } from 'vs/base/common/network';
import { IDownloadService } from 'vs/platform/download/common/download';

export class ExtensionManagementService extends Disposable implements IExtensionManagementService {

	_serviceBrand: any;

	readonly onInstallExtension: Event<InstallExtensionEvent>;
	readonly onDidInstallExtension: Event<DidInstallExtensionEvent>;
	readonly onUninstallExtension: Event<IExtensionIdentifier>;
	readonly onDidUninstallExtension: Event<DidUninstallExtensionEvent>;

	protected readonly servers: IExtensionManagementServer[] = [];

	constructor(
		@IExtensionManagementServerService protected readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IProductService protected readonly productService: IProductService,
		@IDownloadService protected readonly downloadService: IDownloadService,
	) {
		super();
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.localExtensionManagementServer);
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
		}

		this.onInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<InstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onInstallExtension); return emitter; }, new EventMultiplexer<InstallExtensionEvent>())).event;
		this.onDidInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidInstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidInstallExtension); return emitter; }, new EventMultiplexer<DidInstallExtensionEvent>())).event;
		this.onUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<IExtensionIdentifier>, server) => { emitter.add(server.extensionManagementService.onUninstallExtension); return emitter; }, new EventMultiplexer<IExtensionIdentifier>())).event;
		this.onDidUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidUninstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidUninstallExtension); return emitter; }, new EventMultiplexer<DidUninstallExtensionEvent>())).event;
	}

	getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		const installedExtensions: ILocalExtension[] = [];
		return Promise.all(this.servers.map(({ extensionManagementService }) => extensionManagementService.getInstalled(type).then(extensions => installedExtensions.push(...extensions))))
			.then(_ => installedExtensions)
			.catch(e => installedExtensions);
	}

	async uninstall(extension: ILocalExtension): Promise<void> {
		const server = this.getServer(extension);
		if (!server) {
			return Promise.reject(`Invalid location ${extension.location.toString()}`);
		}
		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			if (isLanguagePackExtension(extension.manifest)) {
				return this.uninstallEverywhere(extension);
			}
			return this.uninstallInServer(extension, server);
		}
		return server.extensionManagementService.uninstall(extension);
	}

	private async uninstallEverywhere(extension: ILocalExtension): Promise<void> {
		const server = this.getServer(extension);
		if (!server) {
			return Promise.reject(`Invalid location ${extension.location.toString()}`);
		}
		const promise = server.extensionManagementService.uninstall(extension);
		const anotherServer: IExtensionManagementServer | null = server === this.extensionManagementServerService.localExtensionManagementServer ? this.extensionManagementServerService.remoteExtensionManagementServer! : this.extensionManagementServerService.localExtensionManagementServer;
		if (anotherServer) {
			const installed = await anotherServer.extensionManagementService.getInstalled(ExtensionType.User);
			extension = installed.filter(i => areSameExtensions(i.identifier, extension.identifier))[0];
			if (extension) {
				await anotherServer.extensionManagementService.uninstall(extension);
			}
		}
		return promise;
	}

	private async uninstallInServer(extension: ILocalExtension, server: IExtensionManagementServer, force?: boolean): Promise<void> {
		if (server === this.extensionManagementServerService.localExtensionManagementServer) {
			const installedExtensions = await this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.getInstalled(ExtensionType.User);
			const dependentNonUIExtensions = installedExtensions.filter(i => !isUIExtension(i.manifest, this.productService, this.configurationService)
				&& i.manifest.extensionDependencies && i.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.identifier)));
			if (dependentNonUIExtensions.length) {
				return Promise.reject(new Error(this.getDependentsErrorMessage(extension, dependentNonUIExtensions)));
			}
		}
		return server.extensionManagementService.uninstall(extension, force);
	}

	private getDependentsErrorMessage(extension: ILocalExtension, dependents: ILocalExtension[]): string {
		if (dependents.length === 1) {
			return localize('singleDependentError', "Cannot uninstall extension '{0}'. Extension '{1}' depends on this.",
				extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name);
		}
		if (dependents.length === 2) {
			return localize('twoDependentsError', "Cannot uninstall extension '{0}'. Extensions '{1}' and '{2}' depend on this.",
				extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);
		}
		return localize('multipleDependentsError', "Cannot uninstall extension '{0}'. Extensions '{1}', '{2}' and others depend on this.",
			extension.manifest.displayName || extension.manifest.name, dependents[0].manifest.displayName || dependents[0].manifest.name, dependents[1].manifest.displayName || dependents[1].manifest.name);

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
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.zip(extension);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	unzip(zipLocation: URI, type: ExtensionType): Promise<IExtensionIdentifier> {
		return Promise.all(this.servers.map(({ extensionManagementService }) => extensionManagementService.unzip(zipLocation, type))).then(([extensionIdentifier]) => extensionIdentifier);
	}

	async install(vsix: URI): Promise<ILocalExtension> {
		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			const manifest = await this.getManifest(vsix);
			if (isLanguagePackExtension(manifest)) {
				// Install on both servers
				const [local] = await Promise.all(this.servers.map(server => this.installVSIX(vsix, server)));
				return local;
			}
			if (isUIExtension(manifest, this.productService, this.configurationService)) {
				// Install only on local server
				return this.installVSIX(vsix, this.extensionManagementServerService.localExtensionManagementServer);
			}
			// Install only on remote server
			return this.installVSIX(vsix, this.extensionManagementServerService.remoteExtensionManagementServer);
		}
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.installVSIX(vsix, this.extensionManagementServerService.localExtensionManagementServer);
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.installVSIX(vsix, this.extensionManagementServerService.remoteExtensionManagementServer);
		}
		return Promise.reject('No Servers to Install');
	}

	protected installVSIX(vsix: URI, server: IExtensionManagementServer): Promise<ILocalExtension> {
		return server.extensionManagementService.install(vsix);
	}

	getManifest(vsix: URI): Promise<IExtensionManifest> {
		if (vsix.scheme === Schemas.file && this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getManifest(vsix);
		}
		if (vsix.scheme === Schemas.vscodeRemote && this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
		}
		return Promise.reject('No Servers');
	}

	async installFromGallery(gallery: IGalleryExtension): Promise<ILocalExtension> {
		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
			if (manifest) {
				if (isLanguagePackExtension(manifest)) {
					// Install on both servers
					return Promise.all(this.servers.map(server => server.extensionManagementService.installFromGallery(gallery))).then(([local]) => local);
				}
				if (isUIExtension(manifest, this.productService, this.configurationService)) {
					// Install only on local server
					return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
				}
				// Install only on remote server
				return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
			} else {
				return Promise.reject(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
			}
		}
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
		}
		return Promise.reject('No Servers to Install');
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getExtensionsReport();
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getExtensionsReport();
		}
		return Promise.resolve([]);
	}

	private getServer(extension: ILocalExtension): IExtensionManagementServer | null {
		return this.extensionManagementServerService.getExtensionManagementServer(extension.location);
	}
}
