/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventMultiplexer } from 'vs/base/common/event';
import {
	IExtensionManagementService, ILocalExtension, IGalleryExtension, InstallExtensionEvent, DidInstallExtensionEvent, IExtensionIdentifier, DidUninstallExtensionEvent, IReportedExtension, IGalleryMetadata,
	IExtensionManagementServerService, IExtensionManagementServer, IExtensionGalleryService
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { flatten } from 'vs/base/common/arrays';
import { ExtensionType, IExtensionManifest, isLanguagePackExtension } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IRemoteAgentService } from 'vs/workbench/services/remote/node/remoteAgentService';
import { getManifest } from 'vs/platform/extensionManagement/node/extensionManagementUtil';
import { ILogService } from 'vs/platform/log/common/log';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localize } from 'vs/nls';
import { isUIExtension } from 'vs/platform/extensions/node/extensionsUtil';

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
		@IRemoteAgentService private readonly remoteAgentService: IRemoteAgentService,
		@ILogService private readonly logService: ILogService
	) {
		super();
		this.servers = this.extensionManagementServerService.remoteExtensionManagementServer ? [this.extensionManagementServerService.localExtensionManagementServer, this.extensionManagementServerService.remoteExtensionManagementServer] : [this.extensionManagementServerService.localExtensionManagementServer];

		this.onInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<InstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onInstallExtension); return emitter; }, new EventMultiplexer<InstallExtensionEvent>())).event;
		this.onDidInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidInstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidInstallExtension); return emitter; }, new EventMultiplexer<DidInstallExtensionEvent>())).event;
		this.onUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<IExtensionIdentifier>, server) => { emitter.add(server.extensionManagementService.onUninstallExtension); return emitter; }, new EventMultiplexer<IExtensionIdentifier>())).event;
		this.onDidUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidUninstallExtensionEvent>, server) => { emitter.add(server.extensionManagementService.onDidUninstallExtension); return emitter; }, new EventMultiplexer<DidUninstallExtensionEvent>())).event;
	}

	getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		return Promise.all(this.servers.map(({ extensionManagementService }) => extensionManagementService.getInstalled(type)))
			.then(result => flatten(result));
	}

	async uninstall(extension: ILocalExtension, force?: boolean): Promise<void> {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			const server = this.getServer(extension);
			if (!server) {
				return Promise.reject(`Invalid location ${extension.location.toString()}`);
			}
			const syncExtensions = await this.hasToSyncExtensions();
			if (syncExtensions || isLanguagePackExtension(extension.manifest)) {
				return this.uninstallEverywhere(extension, force);
			}
			return this.uninstallInServer(extension, server, force);
		}
		return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.uninstall(extension, force);
	}

	private async uninstallEverywhere(extension: ILocalExtension, force?: boolean): Promise<void> {
		const server = this.getServer(extension);
		if (!server) {
			return Promise.reject(`Invalid location ${extension.location.toString()}`);
		}
		const promise = server.extensionManagementService.uninstall(extension);
		const anotherServer: IExtensionManagementServer = server === this.extensionManagementServerService.localExtensionManagementServer ? this.extensionManagementServerService.remoteExtensionManagementServer! : this.extensionManagementServerService.localExtensionManagementServer;
		const installed = await anotherServer.extensionManagementService.getInstalled(ExtensionType.User);
		extension = installed.filter(i => areSameExtensions(i.identifier, extension.identifier))[0];
		if (extension) {
			await anotherServer.extensionManagementService.uninstall(extension);
		}
		return promise;
	}

	private async uninstallInServer(extension: ILocalExtension, server: IExtensionManagementServer, force?: boolean): Promise<void> {
		if (server === this.extensionManagementServerService.localExtensionManagementServer) {
			const installedExtensions = await this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.getInstalled(ExtensionType.User);
			const dependentNonUIExtensions = installedExtensions.filter(i => !isUIExtension(i.manifest, this.configurationService)
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
		throw new Error('Not Supported');
	}

	unzip(zipLocation: URI, type: ExtensionType): Promise<IExtensionIdentifier> {
		return Promise.all(this.servers.map(({ extensionManagementService }) => extensionManagementService.unzip(zipLocation, type))).then(([extensionIdentifier]) => extensionIdentifier);
	}

	async install(vsix: URI): Promise<IExtensionIdentifier> {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			const syncExtensions = await this.hasToSyncExtensions();
			const manifest = await getManifest(vsix.fsPath);
			if (syncExtensions || isLanguagePackExtension(manifest)) {
				// Install on both servers
				const [extensionIdentifier] = await Promise.all(this.servers.map(server => server.extensionManagementService.install(vsix)));
				return extensionIdentifier;
			}
			if (isUIExtension(manifest, this.configurationService)) {
				// Install only on local server
				return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix);
			}
			// Install only on remote server
			const promise = this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.install(vsix);
			// Install UI Dependencies on local server
			await this.installUIDependencies(manifest);
			return promise;
		}
		return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.install(vsix);
	}

	async installFromGallery(gallery: IGalleryExtension): Promise<void> {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			const [manifest, syncExtensions] = await Promise.all([this.extensionGalleryService.getManifest(gallery, CancellationToken.None), this.hasToSyncExtensions()]);
			if (manifest) {
				if (syncExtensions || isLanguagePackExtension(manifest)) {
					// Install on both servers
					return Promise.all(this.servers.map(server => server.extensionManagementService.installFromGallery(gallery))).then(() => undefined);
				}
				if (isUIExtension(manifest, this.configurationService)) {
					// Install only on local server
					return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
				}
				// Install only on remote server
				const promise = this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
				// Install UI Dependencies on local server
				await this.installUIDependencies(manifest);
				return promise;
			} else {
				this.logService.info('Manifest was not found. Hence installing only in local server');
				return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
			}
		}
		return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(gallery);
	}

	private async installUIDependencies(manifest: IExtensionManifest): Promise<void> {
		if (manifest.extensionDependencies && manifest.extensionDependencies.length) {
			const dependencies = await this.extensionGalleryService.loadAllDependencies(manifest.extensionDependencies.map(id => ({ id })), CancellationToken.None);
			if (dependencies.length) {
				await Promise.all(dependencies.map(async d => {
					const manifest = await this.extensionGalleryService.getManifest(d, CancellationToken.None);
					if (manifest && isUIExtension(manifest, this.configurationService)) {
						await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromGallery(d);
					}
				}));
			}
		}
	}

	getExtensionsReport(): Promise<IReportedExtension[]> {
		return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getExtensionsReport();
	}

	private getServer(extension: ILocalExtension): IExtensionManagementServer | null {
		return this.extensionManagementServerService.getExtensionManagementServer(extension.location);
	}

	private async hasToSyncExtensions(): Promise<boolean> {
		if (!this.extensionManagementServerService.remoteExtensionManagementServer) {
			return false;
		}
		const connection = this.remoteAgentService.getConnection();
		if (!connection) {
			return false;
		}

		const remoteEnv = await connection.getEnvironment();
		if (!remoteEnv) {
			return false;
		}

		return remoteEnv.syncExtensions;
	}
}