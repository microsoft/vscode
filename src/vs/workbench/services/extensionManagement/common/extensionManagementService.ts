/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event, EventMultiplexer } from 'vs/base/common/event';
import {
	ILocalExtension, IGalleryExtension, IExtensionIdentifier, IExtensionsControlManifest, IExtensionGalleryService, InstallOptions, UninstallOptions, InstallExtensionResult, ExtensionManagementError, ExtensionManagementErrorCode, Metadata, InstallOperation, EXTENSION_INSTALL_SOURCE_CONTEXT, InstallExtensionInfo,
	IProductVersion,
	ExtensionInstallSource,
	DidUpdateExtensionMetadata,
	UninstallExtensionInfo
} from 'vs/platform/extensionManagement/common/extensionManagement';
import { DidChangeProfileForServerEvent, DidUninstallExtensionOnServerEvent, IExtensionManagementServer, IExtensionManagementServerService, InstallExtensionOnServerEvent, IResourceExtension, IWorkbenchExtensionManagementService, UninstallExtensionOnServerEvent } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionType, isLanguagePackExtension, IExtensionManifest, getWorkspaceSupportTypeMessage, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { URI } from 'vs/base/common/uri';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { areSameExtensions, computeTargetPlatform } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { localize } from 'vs/nls';
import { IProductService } from 'vs/platform/product/common/productService';
import { Schemas } from 'vs/base/common/network';
import { IDownloadService } from 'vs/platform/download/common/download';
import { coalesce } from 'vs/base/common/arrays';
import { IDialogService, IPromptButton } from 'vs/platform/dialogs/common/dialogs';
import Severity from 'vs/base/common/severity';
import { IUserDataSyncEnablementService, SyncResource } from 'vs/platform/userDataSync/common/userDataSync';
import { Promises } from 'vs/base/common/async';
import { IWorkspaceTrustRequestService, WorkspaceTrustRequestButton } from 'vs/platform/workspace/common/workspaceTrust';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { isString, isUndefined } from 'vs/base/common/types';
import { FileChangesEvent, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationError, getErrorMessage } from 'vs/base/common/errors';
import { IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { IWorkspaceContextService, WorkbenchState } from 'vs/platform/workspace/common/workspace';
import { IExtensionsScannerService, IScannedExtension } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { IStorageService, StorageScope, StorageTarget } from 'vs/platform/storage/common/storage';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

function isGalleryExtension(extension: IResourceExtension | IGalleryExtension): extension is IGalleryExtension {
	return extension.type === 'gallery';
}

export class ExtensionManagementService extends Disposable implements IWorkbenchExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly _onInstallExtension = this._register(new Emitter<InstallExtensionOnServerEvent>());
	readonly onInstallExtension: Event<InstallExtensionOnServerEvent>;

	private readonly _onDidInstallExtensions = this._register(new Emitter<readonly InstallExtensionResult[]>());
	readonly onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;

	private readonly _onUninstallExtension = this._register(new Emitter<UninstallExtensionOnServerEvent>());
	readonly onUninstallExtension: Event<UninstallExtensionOnServerEvent>;

	private readonly _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionOnServerEvent>());
	readonly onDidUninstallExtension: Event<DidUninstallExtensionOnServerEvent>;

	readonly onDidUpdateExtensionMetadata: Event<DidUpdateExtensionMetadata>;
	readonly onDidChangeProfile: Event<DidChangeProfileForServerEvent>;

	readonly onDidEnableExtensions: Event<ILocalExtension[]>;

	protected readonly servers: IExtensionManagementServer[] = [];

	private readonly workspaceExtensionManagementService: WorkspaceExtensionsManagementService;

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
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this.workspaceExtensionManagementService = this._register(this.instantiationService.createInstance(WorkspaceExtensionsManagementService));
		this.onDidEnableExtensions = this.workspaceExtensionManagementService.onDidChangeInvalidExtensions;

		if (this.extensionManagementServerService.localExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.localExtensionManagementServer);
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
		}
		if (this.extensionManagementServerService.webExtensionManagementServer) {
			this.servers.push(this.extensionManagementServerService.webExtensionManagementServer);
		}

		const onInstallExtensionEventMultiplexer = this._register(new EventMultiplexer<InstallExtensionOnServerEvent>());
		this._register(onInstallExtensionEventMultiplexer.add(this._onInstallExtension.event));
		this.onInstallExtension = onInstallExtensionEventMultiplexer.event;

		const onDidInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer<readonly InstallExtensionResult[]>());
		this._register(onDidInstallExtensionsEventMultiplexer.add(this._onDidInstallExtensions.event));
		this.onDidInstallExtensions = onDidInstallExtensionsEventMultiplexer.event;

		const onUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer<UninstallExtensionOnServerEvent>());
		this._register(onUninstallExtensionEventMultiplexer.add(this._onUninstallExtension.event));
		this.onUninstallExtension = onUninstallExtensionEventMultiplexer.event;

		const onDidUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer<DidUninstallExtensionOnServerEvent>());
		this._register(onDidUninstallExtensionEventMultiplexer.add(this._onDidUninstallExtension.event));
		this.onDidUninstallExtension = onDidUninstallExtensionEventMultiplexer.event;

		const onDidUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer<DidUpdateExtensionMetadata>());
		this.onDidUpdateExtensionMetadata = onDidUpdateExtensionMetadaEventMultiplexer.event;

		const onDidChangeProfileEventMultiplexer = this._register(new EventMultiplexer<DidChangeProfileForServerEvent>());
		this.onDidChangeProfile = onDidChangeProfileEventMultiplexer.event;

		for (const server of this.servers) {
			this._register(onInstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onInstallExtension, e => ({ ...e, server }))));
			this._register(onDidInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onDidInstallExtensions));
			this._register(onUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onUninstallExtension, e => ({ ...e, server }))));
			this._register(onDidUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onDidUninstallExtension, e => ({ ...e, server }))));
			this._register(onDidUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onDidUpdateExtensionMetadata));
			this._register(onDidChangeProfileEventMultiplexer.add(Event.map(server.extensionManagementService.onDidChangeProfile, e => ({ ...e, server }))));
		}
	}

	async getInstalled(type?: ExtensionType, profileLocation?: URI, productVersion?: IProductVersion): Promise<ILocalExtension[]> {
		const result: ILocalExtension[] = [];
		await Promise.all(this.servers.map(async server => {
			const installed = await server.extensionManagementService.getInstalled(type, profileLocation, productVersion);
			if (server === this.getWorkspaceExtensionsServer()) {
				const workspaceExtensions = await this.getInstalledWorkspaceExtensions(true);
				installed.push(...workspaceExtensions);
			}
			result.push(...installed);
		}));
		return result;
	}

	uninstall(extension: ILocalExtension, options: UninstallOptions): Promise<void> {
		return this.uninstallExtensions([{ extension, options }]);
	}

	async uninstallExtensions(extensions: UninstallExtensionInfo[]): Promise<void> {
		const workspaceExtensions: ILocalExtension[] = [];
		const groupedExtensions = new Map<IExtensionManagementServer, UninstallExtensionInfo[]>();

		const addExtensionToServer = (server: IExtensionManagementServer, extension: ILocalExtension, options?: UninstallOptions) => {
			let extensions = groupedExtensions.get(server);
			if (!extensions) {
				groupedExtensions.set(server, extensions = []);
			}
			extensions.push({ extension, options });
		};

		for (const { extension, options } of extensions) {
			if (extension.isWorkspaceScoped) {
				workspaceExtensions.push(extension);
				continue;
			}

			const server = this.getServer(extension);
			if (!server) {
				throw new Error(`Invalid location ${extension.location.toString()}`);
			}
			addExtensionToServer(server, extension, options);
			if (this.servers.length > 1 && isLanguagePackExtension(extension.manifest)) {
				const otherServers: IExtensionManagementServer[] = this.servers.filter(s => s !== server);
				for (const otherServer of otherServers) {
					const installed = await otherServer.extensionManagementService.getInstalled();
					const extensionInOtherServer = installed.find(i => !i.isBuiltin && areSameExtensions(i.identifier, extension.identifier));
					if (extensionInOtherServer) {
						addExtensionToServer(otherServer, extensionInOtherServer, options);
					}
				}
			}
		}

		const promises: Promise<void>[] = [];
		for (const workspaceExtension of workspaceExtensions) {
			promises.push(this.uninstallExtensionFromWorkspace(workspaceExtension));
		}
		for (const [server, extensions] of groupedExtensions.entries()) {
			promises.push(this.uninstallInServer(server, extensions));
		}

		const result = await Promise.allSettled(promises);
		const errors = result.filter(r => r.status === 'rejected').map(r => r.reason);
		if (errors.length) {
			throw new Error(errors.map(e => e.message).join('\n'));
		}
	}

	private async uninstallInServer(server: IExtensionManagementServer, extensions: UninstallExtensionInfo[]): Promise<void> {
		if (server === this.extensionManagementServerService.localExtensionManagementServer && this.extensionManagementServerService.remoteExtensionManagementServer) {
			for (const { extension } of extensions) {
				const installedExtensions = await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.getInstalled(ExtensionType.User);
				const dependentNonUIExtensions = installedExtensions.filter(i => !this.extensionManifestPropertiesService.prefersExecuteOnUI(i.manifest)
					&& i.manifest.extensionDependencies && i.manifest.extensionDependencies.some(id => areSameExtensions({ id }, extension.identifier)));
				if (dependentNonUIExtensions.length) {
					throw (new Error(this.getDependentsErrorMessage(extension, dependentNonUIExtensions)));
				}
			}
		}
		return server.extensionManagementService.uninstallExtensions(extensions);
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
			await this.checkForWorkspaceTrust(extension.manifest, false);
			return server.extensionManagementService.reinstallFromGallery(extension);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	updateMetadata(extension: ILocalExtension, metadata: Partial<Metadata>): Promise<ILocalExtension> {
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.updateMetadata(extension, metadata, this.userDataProfileService.currentProfile.extensionsResource);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	async resetPinnedStateForAllUserExtensions(pinned: boolean): Promise<void> {
		await Promise.allSettled(this.servers.map(server => server.extensionManagementService.resetPinnedStateForAllUserExtensions(pinned)));
	}

	zip(extension: ILocalExtension): Promise<URI> {
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.zip(extension);
		}
		return Promise.reject(`Invalid location ${extension.location.toString()}`);
	}

	download(extension: IGalleryExtension, operation: InstallOperation, donotVerifySignature: boolean): Promise<URI> {
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.download(extension, operation, donotVerifySignature);
		}
		throw new Error('Cannot download extension');
	}

	async install(vsix: URI, options?: InstallOptions): Promise<ILocalExtension> {
		const manifest = await this.getManifest(vsix);
		return this.installVSIX(vsix, manifest, options);
	}

	async installVSIX(vsix: URI, manifest: IExtensionManifest, options?: InstallOptions): Promise<ILocalExtension> {
		const serversToInstall = this.getServersToInstall(manifest);
		if (serversToInstall?.length) {
			await this.checkForWorkspaceTrust(manifest, false);
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

	protected installVSIXInServer(vsix: URI, server: IExtensionManagementServer, options: InstallOptions | undefined): Promise<ILocalExtension> {
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

	async canInstall(extension: IGalleryExtension | IResourceExtension): Promise<boolean> {
		if (isGalleryExtension(extension)) {
			return this.canInstallGalleryExtension(extension);
		}
		return this.canInstallResourceExtension(extension);
	}

	private async canInstallGalleryExtension(gallery: IGalleryExtension): Promise<boolean> {
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

	private canInstallResourceExtension(extension: IResourceExtension): boolean {
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return true;
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(extension.manifest)) {
			return true;
		}
		if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
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

		installOptions = { ...(installOptions || {}), isApplicationScoped: extension.isApplicationScoped };
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
				results.set(extension.identifier.id.toLowerCase(), {
					identifier: extension.identifier,
					source: extension, error,
					operation: InstallOperation.Install,
					profileLocation: options.profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource
				});
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

	async getExtensions(locations: URI[]): Promise<IResourceExtension[]> {
		const scannedExtensions = await this.extensionsScannerService.scanMultipleExtensions(locations, ExtensionType.User, { includeInvalid: true });
		const result: IResourceExtension[] = [];
		await Promise.all(scannedExtensions.map(async scannedExtension => {
			const workspaceExtension = await this.workspaceExtensionManagementService.toLocalWorkspaceExtension(scannedExtension);
			if (workspaceExtension) {
				result.push({
					type: 'resource',
					identifier: workspaceExtension.identifier,
					location: workspaceExtension.location,
					manifest: workspaceExtension.manifest,
					changelogUri: workspaceExtension.changelogUrl,
					readmeUri: workspaceExtension.readmeUrl,
				});
			}
		}));
		return result;
	}

	getInstalledWorkspaceExtensionLocations(): URI[] {
		return this.workspaceExtensionManagementService.getInstalledWorkspaceExtensionsLocations();
	}

	async getInstalledWorkspaceExtensions(includeInvalid: boolean): Promise<ILocalExtension[]> {
		return this.workspaceExtensionManagementService.getInstalled(includeInvalid);
	}

	async installResourceExtension(extension: IResourceExtension, installOptions: InstallOptions): Promise<ILocalExtension> {
		if (!this.canInstallResourceExtension(extension)) {
			throw new Error('This extension cannot be installed in the current workspace.');
		}
		if (!installOptions.isWorkspaceScoped) {
			return this.installFromLocation(extension.location);
		}

		this.logService.info(`Installing the extension ${extension.identifier.id} from ${extension.location.toString()} in workspace`);
		const server = this.getWorkspaceExtensionsServer();
		this._onInstallExtension.fire({
			identifier: extension.identifier,
			source: extension.location,
			server,
			applicationScoped: false,
			profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
			workspaceScoped: true
		});

		try {
			await this.checkForWorkspaceTrust(extension.manifest, true);

			const workspaceExtension = await this.workspaceExtensionManagementService.install(extension);

			this.logService.info(`Successfully installed the extension ${workspaceExtension.identifier.id} from ${extension.location.toString()} in the workspace`);
			this._onDidInstallExtensions.fire([{
				identifier: workspaceExtension.identifier,
				source: extension.location,
				operation: InstallOperation.Install,
				applicationScoped: false,
				profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
				local: workspaceExtension,
				workspaceScoped: true
			}]);
			return workspaceExtension;
		} catch (error) {
			this.logService.error(`Failed to install the extension ${extension.identifier.id} from ${extension.location.toString()} in the workspace`, getErrorMessage(error));
			this._onDidInstallExtensions.fire([{
				identifier: extension.identifier,
				source: extension.location,
				operation: InstallOperation.Install,
				applicationScoped: false,
				profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
				error,
				workspaceScoped: true
			}]);
			throw error;
		}
	}

	private async uninstallExtensionFromWorkspace(extension: ILocalExtension): Promise<void> {
		if (!extension.isWorkspaceScoped) {
			throw new Error('The extension is not a workspace extension');
		}

		this.logService.info(`Uninstalling the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
		const server = this.getWorkspaceExtensionsServer();
		this._onUninstallExtension.fire({
			identifier: extension.identifier,
			server,
			applicationScoped: false,
			workspaceScoped: true,
			profileLocation: this.userDataProfileService.currentProfile.extensionsResource
		});

		try {
			await this.workspaceExtensionManagementService.uninstall(extension);
			this.logService.info(`Successfully uninstalled the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`);
			this.telemetryService.publicLog2<{}, {
				owner: 'sandy081';
				comment: 'Uninstall workspace extension';
			}>('workspaceextension:uninstall');
			this._onDidUninstallExtension.fire({
				identifier: extension.identifier,
				server,
				applicationScoped: false,
				workspaceScoped: true,
				profileLocation: this.userDataProfileService.currentProfile.extensionsResource
			});
		} catch (error) {
			this.logService.error(`Failed to uninstall the workspace extension ${extension.identifier.id} from ${extension.location.toString()}`, getErrorMessage(error));
			this._onDidUninstallExtension.fire({
				identifier: extension.identifier,
				server,
				error,
				applicationScoped: false,
				workspaceScoped: true,
				profileLocation: this.userDataProfileService.currentProfile.extensionsResource
			});
			throw error;
		}
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

		if (installOptions?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== ExtensionInstallSource.SETTINGS_SYNC) {
			await this.checkForWorkspaceTrust(manifest, false);
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
		if (extension.isWorkspaceScoped) {
			return this.getWorkspaceExtensionsServer();
		}
		return this.extensionManagementServerService.getExtensionManagementServer(extension);
	}

	private getWorkspaceExtensionsServer(): IExtensionManagementServer {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			return this.extensionManagementServerService.remoteExtensionManagementServer;
		}
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer;
		}
		if (this.extensionManagementServerService.webExtensionManagementServer) {
			return this.extensionManagementServerService.webExtensionManagementServer;
		}
		throw new Error('No extension server found');
	}

	protected async checkForWorkspaceTrust(manifest: IExtensionManifest, requireTrust: boolean): Promise<void> {
		if (requireTrust || this.extensionManifestPropertiesService.getExtensionUntrustedWorkspaceSupportType(manifest) === false) {
			const buttons: WorkspaceTrustRequestButton[] = [];
			buttons.push({ label: localize('extensionInstallWorkspaceTrustButton', "Trust Workspace & Install"), type: 'ContinueWithTrust' });
			if (!requireTrust) {
				buttons.push({ label: localize('extensionInstallWorkspaceTrustContinueButton', "Install"), type: 'ContinueWithoutTrust' });
			}
			buttons.push({ label: localize('extensionInstallWorkspaceTrustManageButton', "Learn More"), type: 'Manage' });
			const trustState = await this.workspaceTrustRequestService.requestWorkspaceTrust({
				message: localize('extensionInstallWorkspaceTrustMessage', "Enabling this extension requires a trusted workspace."),
				buttons
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

	toggleAppliationScope(extension: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension> {
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.toggleAppliationScope(extension, fromProfileLocation);
		}
		throw new Error('Not Supported');
	}

	copyExtensions(from: URI, to: URI): Promise<void> {
		if (this.extensionManagementServerService.remoteExtensionManagementServer) {
			throw new Error('Not Supported');
		}
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
		}
		if (this.extensionManagementServerService.webExtensionManagementServer) {
			return this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.copyExtensions(from, to);
		}
		return Promise.resolve();
	}

	registerParticipant() { throw new Error('Not Supported'); }
	installExtensionsFromProfile(extensions: IExtensionIdentifier[], fromProfileLocation: URI, toProfileLocation: URI): Promise<ILocalExtension[]> { throw new Error('Not Supported'); }
}

class WorkspaceExtensionsManagementService extends Disposable {

	private static readonly WORKSPACE_EXTENSIONS_KEY = 'workspaceExtensions.locations';

	private readonly _onDidChangeInvalidExtensions = this._register(new Emitter<ILocalExtension[]>());
	readonly onDidChangeInvalidExtensions = this._onDidChangeInvalidExtensions.event;

	private readonly extensions: ILocalExtension[] = [];
	private readonly initializePromise: Promise<void>;

	private readonly invalidExtensionWatchers = this._register(new DisposableStore());

	constructor(
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IWorkspaceContextService private readonly workspaceService: IWorkspaceContextService,
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@IStorageService private readonly storageService: IStorageService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();

		this._register(Event.debounce<FileChangesEvent, FileChangesEvent[]>(this.fileService.onDidFilesChange, (last, e) => {
			(last = last ?? []).push(e);
			return last;
		}, 1000)(events => {
			const changedInvalidExtensions = this.extensions.filter(extension => !extension.isValid && events.some(e => e.affects(extension.location)));
			if (changedInvalidExtensions.length) {
				this.checkExtensionsValidity(changedInvalidExtensions);
			}
		}));

		this.initializePromise = this.initialize();
	}

	private async initialize(): Promise<void> {
		const existingLocations = this.getInstalledWorkspaceExtensionsLocations();
		if (!existingLocations.length) {
			return;
		}

		await Promise.allSettled(existingLocations.map(async location => {
			if (!this.workspaceService.isInsideWorkspace(location)) {
				this.logService.info(`Removing the workspace extension ${location.toString()} as it is not inside the workspace`);
				return;
			}
			if (!(await this.fileService.exists(location))) {
				this.logService.info(`Removing the workspace extension ${location.toString()} as it does not exist`);
				return;
			}
			try {
				const extension = await this.scanWorkspaceExtension(location);
				if (extension) {
					this.extensions.push(extension);
				} else {
					this.logService.info(`Skipping workspace extension ${location.toString()} as it does not exist`);
				}
			} catch (error) {
				this.logService.error('Skipping the workspace extension', location.toString(), error);
			}
		}));

		this.saveWorkspaceExtensions();
	}

	private watchInvalidExtensions(): void {
		this.invalidExtensionWatchers.clear();
		for (const extension of this.extensions) {
			if (!extension.isValid) {
				this.invalidExtensionWatchers.add(this.fileService.watch(extension.location));
			}
		}
	}

	private async checkExtensionsValidity(extensions: ILocalExtension[]): Promise<void> {
		const validExtensions: ILocalExtension[] = [];
		await Promise.all(extensions.map(async extension => {
			const newExtension = await this.scanWorkspaceExtension(extension.location);
			if (newExtension?.isValid) {
				validExtensions.push(newExtension);
			}
		}));

		let changed = false;
		for (const extension of validExtensions) {
			const index = this.extensions.findIndex(e => this.uriIdentityService.extUri.isEqual(e.location, extension.location));
			if (index !== -1) {
				changed = true;
				this.extensions.splice(index, 1, extension);
			}
		}

		if (changed) {
			this.saveWorkspaceExtensions();
			this._onDidChangeInvalidExtensions.fire(validExtensions);
		}
	}

	async getInstalled(includeInvalid: boolean): Promise<ILocalExtension[]> {
		await this.initializePromise;
		return this.extensions.filter(e => includeInvalid || e.isValid);
	}

	async install(extension: IResourceExtension): Promise<ILocalExtension> {
		await this.initializePromise;

		const workspaceExtension = await this.scanWorkspaceExtension(extension.location);
		if (!workspaceExtension) {
			throw new Error('Cannot install the extension as it does not exist.');
		}

		const existingExtensionIndex = this.extensions.findIndex(e => areSameExtensions(e.identifier, extension.identifier));
		if (existingExtensionIndex === -1) {
			this.extensions.push(workspaceExtension);
		} else {
			this.extensions.splice(existingExtensionIndex, 1, workspaceExtension);
		}

		this.saveWorkspaceExtensions();
		this.telemetryService.publicLog2<{}, {
			owner: 'sandy081';
			comment: 'Install workspace extension';
		}>('workspaceextension:install');

		return workspaceExtension;
	}

	async uninstall(extension: ILocalExtension): Promise<void> {
		await this.initializePromise;

		const existingExtensionIndex = this.extensions.findIndex(e => areSameExtensions(e.identifier, extension.identifier));
		if (existingExtensionIndex !== -1) {
			this.extensions.splice(existingExtensionIndex, 1);
			this.saveWorkspaceExtensions();
		}

		this.telemetryService.publicLog2<{}, {
			owner: 'sandy081';
			comment: 'Uninstall workspace extension';
		}>('workspaceextension:uninstall');
	}

	getInstalledWorkspaceExtensionsLocations(): URI[] {
		const locations: URI[] = [];
		try {
			const parsed = JSON.parse(this.storageService.get(WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY, StorageScope.WORKSPACE, '[]'));
			if (Array.isArray(locations)) {
				for (const location of parsed) {
					if (isString(location)) {
						if (this.workspaceService.getWorkbenchState() === WorkbenchState.FOLDER) {
							locations.push(this.workspaceService.getWorkspace().folders[0].toResource(location));
						} else {
							this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${location}`);
						}
					} else {
						locations.push(URI.revive(location));
					}
				}
			} else {
				this.logService.warn(`Invalid value for 'extensions' in workspace storage: ${locations}`);
			}
		} catch (error) {
			this.logService.warn(`Error parsing workspace extensions locations: ${getErrorMessage(error)}`);
		}
		return locations;
	}

	private saveWorkspaceExtensions(): void {
		const locations = this.extensions.map(extension => extension.location);
		if (this.workspaceService.getWorkbenchState() === WorkbenchState.FOLDER) {
			this.storageService.store(WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY,
				JSON.stringify(coalesce(locations
					.map(location => this.uriIdentityService.extUri.relativePath(this.workspaceService.getWorkspace().folders[0].uri, location)))),
				StorageScope.WORKSPACE, StorageTarget.MACHINE);
		} else {
			this.storageService.store(WorkspaceExtensionsManagementService.WORKSPACE_EXTENSIONS_KEY, JSON.stringify(locations), StorageScope.WORKSPACE, StorageTarget.MACHINE);
		}
		this.watchInvalidExtensions();
	}

	async scanWorkspaceExtension(location: URI): Promise<ILocalExtension | null> {
		const scannedExtension = await this.extensionsScannerService.scanExistingExtension(location, ExtensionType.User, { includeInvalid: true });
		return scannedExtension ? this.toLocalWorkspaceExtension(scannedExtension) : null;
	}

	async toLocalWorkspaceExtension(extension: IScannedExtension): Promise<ILocalExtension> {
		const stat = await this.fileService.resolve(extension.location);
		let readmeUrl: URI | undefined;
		let changelogUrl: URI | undefined;
		if (stat.children) {
			readmeUrl = stat.children.find(({ name }) => /^readme(\.txt|\.md|)$/i.test(name))?.resource;
			changelogUrl = stat.children.find(({ name }) => /^changelog(\.txt|\.md|)$/i.test(name))?.resource;
		}
		const validations: [Severity, string][] = [...extension.validations];
		let isValid = extension.isValid;
		if (extension.manifest.main) {
			if (!(await this.fileService.exists(this.uriIdentityService.extUri.joinPath(extension.location, extension.manifest.main)))) {
				isValid = false;
				validations.push([Severity.Error, localize('main.notFound', "Cannot activate, becase {0} not found", extension.manifest.main)]);
			}
		}
		return {
			identifier: extension.identifier,
			type: extension.type,
			isBuiltin: extension.isBuiltin || !!extension.metadata?.isBuiltin,
			location: extension.location,
			manifest: extension.manifest,
			targetPlatform: extension.targetPlatform,
			validations,
			isValid,
			readmeUrl,
			changelogUrl,
			publisherDisplayName: extension.metadata?.publisherDisplayName,
			publisherId: extension.metadata?.publisherId || null,
			isApplicationScoped: !!extension.metadata?.isApplicationScoped,
			isMachineScoped: !!extension.metadata?.isMachineScoped,
			isPreReleaseVersion: !!extension.metadata?.isPreReleaseVersion,
			hasPreReleaseVersion: !!extension.metadata?.hasPreReleaseVersion,
			preRelease: !!extension.metadata?.preRelease,
			installedTimestamp: extension.metadata?.installedTimestamp,
			updated: !!extension.metadata?.updated,
			pinned: !!extension.metadata?.pinned,
			isWorkspaceScoped: true,
			source: 'resource'
		};
	}
}
