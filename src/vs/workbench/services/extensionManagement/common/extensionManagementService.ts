/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event, EventMultiplexer } from 'vs/base/common/event';
import {
	ILocalExtension, IGalleryExtension, IExtensionIdentifier, IExtensionsControlManifest, IExtensionGalleryService, InstallOptions, UninstallOptions, InstallVSIXOptions, InstallExtensionResult, ExtensionManagementError, ExtensionManagementErrorCode, Metadata, InstallOperation, EXTENSION_INSTALL_SYNC_CONTEXT, InstallExtensionInfo
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { DidChangeProfileForServerEvent, DidUninstallExtensionOnServerEvent, IExtensionManagementServer, IExtensionManagementServerService, InstallExtensionOnServerEvent, IWorkbenchExtensionManagementService, UninstallExtensionOnServerEvent } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionType, isLanguagePackExtension, IExtensionManifest, getWorkspaceSupportTypeMessage, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { Disposable } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { areSameExtensions, computeTargetPlatform } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localize } from 'vs/nls';
import { IProductService } from 'vs/platform/product/common/productService';
import { Schemas } from 'vs/base/common/network';
import { IDownloadService } from 'vs/platform/download/common/download';
import { flatten } from 'vs/base/common/arrays';
import { IDialogService, IPromptButton } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { IUserDataSyncEnablementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { Promises } from 'vs/base/common/async';
import { IWorkspaceTrustRequestService } from 'vs/platform/workspace/common/workspaceTrust';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { isUndefined } from 'vs/base/common/types';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationError } from 'vs/base/common/errors';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

export class ExtensionManagementService extends Disposable implements IWorkbenchExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	readonly onInstallExtension: Event<InstallExtensionOnServerEvent>;
	readonly onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;
	readonly onUninstallExtension: Event<UninstallExtensionOnServerEvent>;
	readonly onDidUninstallExtension: Event<DidUninstallExtensionOnServerEvent>;
	readonly onDidUpdateExtensionMetadata: Event<ILocalExtension>;
	readonly onDidChangeProfile: Event<DidChangeProfileForServerEvent>;

	protected readonly servers: IExtensionManagementServer[] = [];

	constructor(
		@IExtensionManagementServerService protected readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IProductService protected readonly productService: IProductService,
		@IDownloadService protected readonly downloadService: IDownloadService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.localExtensionManagementServer);
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
		}
		if (this.extensionManagementServerService.webExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.webExtensionManagementServer);
		}

		this.onInstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<InstallExtensionOnServerEvent>, server) => { emitter.add(Event.map(server.extensionManagementService.onInstallExtension, e => ({ ...e, server }))); return emitter; }, new EventMultiplexer<InstallExtensionOnServerEvent>())).event;
		this.onDidInstallExtensions = this._register(this.servers.reduce((emitter: EventMultiplexer<readonly InstallExtensionResult[]>, server) => { emitter.add(server.extensionManagementService.onDidInstallExtensions); return emitter; }, new EventMultiplexer<readonly InstallExtensionResult[]>())).event;
		this.onUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<UninstallExtensionOnServerEvent>, server) => { emitter.add(Event.map(server.extensionManagementService.onUninstallExtension, e => ({ ...e, server }))); return emitter; }, new EventMultiplexer<UninstallExtensionOnServerEvent>())).event;
		this.onDidUninstallExtension = this._register(this.servers.reduce((emitter: EventMultiplexer<DidUninstallExtensionOnServerEvent>, server) => { emitter.add(Event.map(server.extensionManagementService.onDidUninstallExtension, e => ({ ...e, server }))); return emitter; }, new EventMultiplexer<DidUninstallExtensionOnServerEvent>())).event;
		this.onDidUpdateExtensionMetadata = this._register(this.servers.reduce((emitter: EventMultiplexer<ILocalExtension>, server) => { emitter.add(server.extensionManagementService.onDidUpdateExtensionMetadata); return emitter; }, new EventMultiplexer<ILocalExtension>())).event;
		this.onDidChangeProfile = this._register(this.servers.reduce((emitter: EventMultiplexer<DidChangeProfileForServerEvent>, server) => { emitter.add(Event.map(server.extensionManagementService.onDidChangeProfile, e => ({ ...e, server }))); return emitter; }, new EventMultiplexer<DidChangeProfileForServerEvent>())).event;
	}

	async getInstalled(type?: ExtensionType, profileLocation?: URI): Promise<ILocalExtension[]> {
		const result = await Promise.all(this.servers.map(({ extensionManagementService }) => extensionManagementService.getInstalled(type, profileLocation)));
		return flatten(result);
	}

	async uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		const server = this.getServer(extension);
		if (!server) {
			return Promise.reject(`Invalid location ${extension.location.toString()}`);
		}
		if (this.servers.length > 1) {
			if (isLanguagePackExtension(extension.manifest)) {
				return this.uninstallEverywhere(extension, options);
			}
			return this.uninstallInServer(extension, server, options);
		}
		return server.extensionManagementService.uninstall(extension, options);
	}

	private async uninstallEverywhere(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		const server = this.getServer(extension);
		if (!server) {
			return Promise.reject(`Invalid location ${extension.location.toString()}`);
		}
		const promise = server.extensionManagementService.uninstall(extension, options);
		const otherServers: IExtensionManagementServer[] = this.servers.filter(s => s !== server);
		if (otherServers.length) {
			for (const otherServer of otherServers) {
				const installed = await otherServer.extensionManagementService.getInstalled();
				extension = installed.filter(i => !i.isBuiltin && areSameExtensions(i.identifier, extension.identifier))[0];
				if (extension) {
					await otherServer.extensionManagementService.uninstall(extension, options);
				}
			}
		}
		return promise;
	}

	private async uninstallInServer(extension: ILocalExtension, server: IExtensionManagementServer, options?: UninstallOptions): Promise<void> {
		if (server === this.extensionManagementServerService.localExtensionManagementServer) {
			const installedExtensions = await this.extensionManagementServerService.remoteExtensionManagementServer!.extensionManagementService.getInstalled(ExtensionType.User);
			const dependentNonUIExtensions = installedExtensions.filter(i => !this.extensionManifestPropertiesService.prefersExecuteOnUI(i.manifest)
				&& i.manifest.extensionDependencies && i.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.identifier)));
			if (dependentNonUIExtensions.length) {
				return Promise.reject(new Error(this.getDependentsErrorMessage(extension, dependentNonUIExtensions)));
			}
		}
		return server.extensionManagementService.uninstall(extension, options);
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

	async reinstallFromGallery(extension: ILocalExtension): Promise<ILocalExtension> {
		const server = this.getServer(extension);
		if (server) {
			await this.checkForWorkspaceTrust(extension.manifest);
			return server.extensionManagementService.reinstallFromGallery(extension);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	updateMetadata(extension: ILocalExtension, metadata: Partial<Metadata>): Promise<ILocalExtension> {
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

	unzip(zipLocation: URI): Promise<IExtensionIdentifier> {
		return Promises.settled(this.servers
			// Filter out web server
			.filter(server => server !== this.extensionManagementServerService.webExtensionManagementServer)
			.map(({ extensionManagementService }) => extensionManagementService.unzip(zipLocation))).then(([extensionIdentifier]) => extensionIdentifier);
	}

	download(extension: IGalleryExtension, operation: InstallOperation, donotVerifySignature: boolean): Promise<URI> {
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.download(extension, operation, donotVerifySignature);
		}
		throw new Error('Cannot download extension');
	}

	async install(vsix: URI, options?: InstallVSIXOptions): Promise<ILocalExtension> {
		const manifest = await this.getManifest(vsix);
		return this.installVSIX(vsix, manifest, options);
	}

	async installVSIX(vsix: URI, manifest: IExtensionManifest, options?: InstallVSIXOptions): Promise<ILocalExtension> {
		const serversToInstall = this.getServersToInstall(manifest);
		if (serversToInstall?.length) {
			await this.checkForWorkspaceTrust(manifest);
			const [local] = await Promises.settled(serversToInstall.map(server => this.installVSIXInServer(vsix, server, options)));
			return local;
		}
		return Promise.reject('No Servers to Install');
	}

	private getServersToInstall(manifest: IExtensionManifest): IExtensionManagementServer[] | undefined {
		if (this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			if (isLanguagePackExtension(manifest)) {
				// Install on both servers
				return [this.extensionManagementServerService.localExtensionManagementServer, this.extensionManagementServerService.remoteExtensionManagementServer];
			}
			if (this.extensionManifestPropertiesService.prefersExecuteOnUI(manifest)) {
				// Install only on local server
				return [this.extensionManagementServerService.localExtensionManagementServer];
			}
			// Install only on remote server
			return [this.extensionManagementServerService.remoteExtensionManagementServer];
		}
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return [this.extensionManagementServerService.localExtensionManagementServer];
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return [this.extensionManagementServerService.remoteExtensionManagementServer];
		}
		return undefined;
	}

	async installFromLocation(location: URI): Promise<ILocalExtension> {
		if (location.scheme === Schemas.file) {
			if (this.extensionManagementServerService.localExtensionManagementServer) {
				return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
			}
			throw new Error('Local extension management server is not found');
		}
		if (location.scheme === Schemas.vscodeRemote) {
			if (this.extensionManagementServerService.remoteExtensionManagementServer) {
				return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
			}
			throw new Error('Remote extension management server is not found');
		}
		if (!this.extensionManagementServerService.webExtensionManagementServer) {
			throw new Error('Web extension management server is not found');
		}
		return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.installFromLocation(location, this.userDataProfileService.currentProfile.extensionsResource);
	}

	protected installVSIXInServer(vsix: URI, server: IExtensionManagementServer, options: InstallVSIXOptions | undefined): Promise<ILocalExtension> {
		return server.extensionManagementService.install(vsix, options);
	}

	getManifest(vsix: URI): Promise<IExtensionManifest> {
		if (vsix.scheme === Schemas.file && this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getManifest(vsix);
		}
		if (vsix.scheme === Schemas.file && this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
		}
		if (vsix.scheme === Schemas.vscodeRemote && this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getManifest(vsix);
		}
		return Promise.reject('No Servers');
	}

	async canInstall(gallery: IGalleryExtension): Promise<boolean> {
		if (this.extensionManagementServerService.localExtensionManagementServer
			&& await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery)) {
			return true;
		}
		const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
		if (!manifest) {
			return false;
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer
			&& await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.canInstall(gallery)
			&& this.extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)) {
			return true;
		}
		if (this.extensionManagementServerService.webExtensionManagementServer
			&& await this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.canInstall(gallery)
			&& this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
			return true;
		}
		return false;
	}

	async updateFromGallery(gallery: IGalleryExtension, extension: ILocalExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		const server = this.getServer(extension);
		if (!server) {
			return Promise.reject(`Invalid location ${extension.location.toString()}`);
		}

		const servers: IExtensionManagementServer[] = [];

		// Update Language pack on local and remote servers
		if (isLanguagePackExtension(extension.manifest)) {
			servers.push(...this.servers.filter(server => server !== this.extensionManagementServerService.webExtensionManagementServer));
		} else {
			servers.push(server);
		}

		return Promises.settled(servers.map(server => server.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
	}

	async installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]> {
		const results = new Map<string, InstallExtensionResult>();

		const extensionsByServer = new Map<IExtensionManagementServer, InstallExtensionInfo[]>();
		await Promise.all(extensions.map(async ({ extension, options }) => {
			try {
				const servers = await this.validateAndGetExtensionManagementServersToInstall(extension, options);
				if (!options.isMachineScoped && this.isExtensionsSyncEnabled()) {
					if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer) && (await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(extension))) {
						servers.push(this.extensionManagementServerService.localExtensionManagementServer);
					}
				}
				for (const server of servers) {
					let exensions = extensionsByServer.get(server);
					if (!exensions) {
						extensionsByServer.set(server, exensions = []);
					}
					exensions.push({ extension, options });
				}
			} catch (error) {
				results.set(extension.identifier.id.toLowerCase(), { identifier: extension.identifier, source: extension, error, operation: InstallOperation.Install });
			}
		}));

		await Promise.all([...extensionsByServer.entries()].map(async ([server, extensions]) => {
			const serverResults = await server.extensionManagementService.installGalleryExtensions(extensions);
			for (const result of serverResults) {
				results.set(result.identifier.id.toLowerCase(), result);
			}
		}));

		return [...results.values()];
	}

	async installFromGallery(gallery: IGalleryExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		const servers = await this.validateAndGetExtensionManagementServersToInstall(gallery, installOptions);
		if (!installOptions || isUndefined(installOptions.isMachineScoped)) {
			const isMachineScoped = await this.hasToFlagExtensionsMachineScoped([gallery]);
			installOptions = { ...(installOptions || {}), isMachineScoped };
		}

		if (!installOptions.isMachineScoped && this.isExtensionsSyncEnabled()) {
			if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer) && (await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery))) {
				servers.push(this.extensionManagementServerService.localExtensionManagementServer);
			}
		}
		return Promises.settled(servers.map(server => server.extensionManagementService.installFromGallery(gallery, installOptions))).then(([local]) => local);
	}

	private async validateAndGetExtensionManagementServersToInstall(gallery: IGalleryExtension, installOptions?: InstallOptions): Promise<IExtensionManagementServer[]> {

		const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
		if (!manifest) {
			return Promise.reject(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
		}

		const servers: IExtensionManagementServer[] = [];

		// Install Language pack on local and remote servers
		if (isLanguagePackExtension(manifest)) {
			servers.push(...this.servers.filter(server => server !== this.extensionManagementServerService.webExtensionManagementServer));
		} else {
			const server = this.getExtensionManagementServerToInstall(manifest);
			if (server) {
				servers.push(server);
			}
		}

		if (!servers.length) {
			const error = new Error(localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
			error.name = ExtensionManagementErrorCode.Unsupported;
			throw error;
		}

		if (!installOptions?.context?.[EXTENSION_INSTALL_SYNC_CONTEXT]) {
			await this.checkForWorkspaceTrust(manifest);
		}

		if (!installOptions?.donotIncludePackAndDependencies) {
			await this.checkInstallingExtensionOnWeb(gallery, manifest);
		}

		return servers;
	}

	private getExtensionManagementServerToInstall(manifest: IExtensionManifest): IExtensionManagementServer | null {
		// Only local server
		if (this.servers.length === 1 && this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer;
		}

		const extensionKind = this.extensionManifestPropertiesService.getExtensionKind(manifest);
		for (const kind of extensionKind) {
			if (kind === 'ui' && this.extensionManagementServerService.localExtensionManagementServer) {
				return this.extensionManagementServerService.localExtensionManagementServer;
			}
			if (kind === 'workspace' && this.extensionManagementServerService.remoteExtensionManagementServer) {
				return this.extensionManagementServerService.remoteExtensionManagementServer;
			}
			if (kind === 'web' && this.extensionManagementServerService.webExtensionManagementServer) {
				return this.extensionManagementServerService.webExtensionManagementServer;
			}
		}

		// Local server can accept any extension. So return local server if not compatible server found.
		return this.extensionManagementServerService.localExtensionManagementServer;
	}

	private isExtensionsSyncEnabled(): boolean {
		return this.userDataSyncEnablementService.isEnabled() && this.userDataSyncEnablementService.isResourceEnabled(SyncResource.Extensions);
	}

	private async hasToFlagExtensionsMachineScoped(extensions: IGalleryExtension[]): Promise<boolean> {
		if (this.isExtensionsSyncEnabled()) {
			const { result } = await this.dialogService.prompt<boolean>({
				type: Severity.Info,
				message: extensions.length === 1 ? localize('install extension', "Install Extension") : localize('install extensions', "Install Extensions"),
				detail: extensions.length === 1
					? localize('install single extension', "Would you like to install and synchronize '{0}' extension across your devices?", extensions[0].displayName)
					: localize('install multiple extensions', "Would you like to install and synchronize extensions across your devices?"),
				buttons: [
					{
						label: localize({ key: 'install', comment: ['&& denotes a mnemonic'] }, "&&Install"),
						run: () => false
					},
					{
						label: localize({ key: 'install and do no sync', comment: ['&& denotes a mnemonic'] }, "Install (Do &&not sync)"),
						run: () => true
					}
				],
				cancelButton: {
					run: () => {
						throw new CancellationError();
					}
				}
			});

			return result;
		}
		return false;
	}

	getExtensionsControlManifest(): Promise<IExtensionsControlManifest> {
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
		}
		if (this.extensionManagementServerService.webExtensionManagementServer) {
			return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.getExtensionsControlManifest();
		}
		return Promise.resolve({ malicious: [], deprecated: {}, search: [] });
	}

	private getServer(extension: ILocalExtension): IExtensionManagementServer | null {
		return this.extensionManagementServerService.getExtensionManagementServer(extension);
	}

	protected async checkForWorkspaceTrust(manifest: IExtensionManifest): Promise<void> {
		if (this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(manifest) === false) {
			const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust({
				message: localize('extensionInstallWorkspaceTrustMessage', "Enabling this extension requires a trusted workspace."),
				buttons: [
					{ label: localize('extensionInstallWorkspaceTrustButton', "Trust Workspace & Install"), type: 'ContinueWithTrust' },
					{ label: localize('extensionInstallWorkspaceTrustContinueButton', "Install"), type: 'ContinueWithoutTrust' },
					{ label: localize('extensionInstallWorkspaceTrustManageButton', "Learn More"), type: 'Manage' }
				]
			});

			if (trustState === undefined) {
				throw new CancellationError();
			}
		}
	}

	private async checkInstallingExtensionOnWeb(extension: IGalleryExtension, manifest: IExtensionManifest): Promise<void> {
		if (this.servers.length !== 1 || this.servers[0] !== this.extensionManagementServerService.webExtensionManagementServer) {
			return;
		}

		const nonWebExtensions = [];
		if (manifest.extensionPack?.length) {
			const extensions = await this.extensionGalleryService.getExtensions(manifest.extensionPack.map(id => ({ id })), CancellationToken.None);
			for (const extension of extensions) {
				if (!(await this.servers[0].extensionManagementService.canInstall(extension))) {
					nonWebExtensions.push(extension);
				}
			}
			if (nonWebExtensions.length && nonWebExtensions.length === extensions.length) {
				throw new ExtensionManagementError('Not supported in Web', ExtensionManagementErrorCode.Unsupported);
			}
		}

		const productName = localize('VS Code for Web', "{0} for the Web", this.productService.nameLong);
		const virtualWorkspaceSupport = this.extensionManifestPropertiesService.getExtensionVirtualWorkspaceSupportType(manifest);
		const virtualWorkspaceSupportReason = getWorkspaceSupportTypeMessage(manifest.capabilities?.virtualWorkspaces);
		const hasLimitedSupport = virtualWorkspaceSupport === 'limited' || !!virtualWorkspaceSupportReason;

		if (!nonWebExtensions.length && !hasLimitedSupport) {
			return;
		}

		const limitedSupportMessage = localize('limited support', "'{0}' has limited functionality in {1}.", extension.displayName || extension.identifier.id, productName);
		let message: string;
		let buttons: IPromptButton<void>[] = [];
		let detail: string | undefined;

		const installAnywayButton: IPromptButton<void> = {
			label: localize({ key: 'install anyways', comment: ['&& denotes a mnemonic'] }, "&&Install Anyway"),
			run: () => { }
		};

		const showExtensionsButton: IPromptButton<void> = {
			label: localize({ key: 'showExtensions', comment: ['&& denotes a mnemonic'] }, "&&Show Extensions"),
			run: () => this.instantiationService.invokeFunction(accessor => accessor.get(ICommandService).executeCommand('extension.open', extension.identifier.id, 'extensionPack'))
		};

		if (nonWebExtensions.length && hasLimitedSupport) {
			message = limitedSupportMessage;
			detail = `${virtualWorkspaceSupportReason ? `${virtualWorkspaceSupportReason}\n` : ''}${localize('non web extensions detail', "Contains extensions which are not supported.")}`;
			buttons = [
				installAnywayButton,
				showExtensionsButton
			];
		}

		else if (hasLimitedSupport) {
			message = limitedSupportMessage;
			detail = virtualWorkspaceSupportReason || undefined;
			buttons = [installAnywayButton];
		}

		else {
			message = localize('non web extensions', "'{0}' contains extensions which are not supported in {1}.", extension.displayName || extension.identifier.id, productName);
			buttons = [
				installAnywayButton,
				showExtensionsButton
			];
		}

		await this.dialogService.prompt({
			type: Severity.Info,
			message,
			detail,
			buttons,
			cancelButton: {
				run: () => { throw new CancellationError(); }
			}
		});
	}

	private _targetPlatformPromise: Promise<TargetPlatform> | undefined;
	getTargetPlatform(): Promise<TargetPlatform> {
		if (!this._targetPlatformPromise) {
			this._targetPlatformPromise = computeTargetPlatform(this.fileService, this.logService);
		}
		return this._targetPlatformPromise;
	}

	async cleanUp(): Promise<void> {
		await Promise.allSettled(this.servers.map(server => server.extensionManagementService.cleanUp()));
	}

	registerParticipant() { throw new Error('Not Supported'); }
	copyExtensions(): Promise<void> { throw new Error('Not Supported'); }
	installExtensionsFromProfile(extensions: IExtensionIdentifier[], fromProfileLocation: URI, toProfileLocation: URI): Promise<ILocalExtension[]> { throw new Error('Not Supported'); }
}
