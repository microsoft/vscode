/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event, EventMultiplexer } from '../../../../base/common/event.js';
import {
	ILocalExtension, IGalleryExtension, IExtensionIdentifier, IExtensionsControlManifest, IExtensionGalleryService, InstallOptions, UninstallOptions, InstallExtensionResult, ExtensionManagementError, ExtensionManagementErrorCode, Metadata, InstallOperation, EXTENSION_INSTALL_SOURCE_CONTEXT, InstallExtensionInfo,
	IProductVersion,
	ExtensionInstallSource,
	DidUpdateExtensionMetadata,
	UninstallExtensionInfo,
	IAllowedExtensionsService,
	EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT,
} from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { DidChangeProfileForServerEvent, DidUninstallExtensionOnServerEvent, IExtensionManagementServer, IExtensionManagementServerService, InstallExtensionOnServerEvent, IPublisherInfo, IResourceExtension, IWorkbenchExtensionManagementService, UninstallExtensionOnServerEvent } from './extensionManagement.js';
import { ExtensionType, isLanguagePackExtension, IExtensionManifest, getWorkspaceSupportTypeMessage, TargetPlatform } from '../../../../platform/extensions/common/extensions.js';
import { URI } from '../../../../base/common/uri.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { areSameExtensions, computeTargetPlatform } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { localize } from '../../../../nls.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { Schemas } from '../../../../base/common/network.js';
import { IDownloadService } from '../../../../platform/download/common/download.js';
import { coalesce, distinct, isNonEmptyArray } from '../../../../base/common/arrays.js';
import { IDialogService, IPromptButton } from '../../../../platform/dialogs/common/dialogs.js';
import Severity from '../../../../base/common/severity.js';
import { IUserDataSyncEnablementService, SyncResource } from '../../../../platform/userDataSync/common/userDataSync.js';
import { Promises } from '../../../../base/common/async.js';
import { IWorkspaceTrustRequestService, WorkspaceTrustRequestButton } from '../../../../platform/workspace/common/workspaceTrust.js';
import { IExtensionManifestPropertiesService } from '../../extensions/common/extensionManifestPropertiesService.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { isString, isUndefined } from '../../../../base/common/types.js';
import { FileChangesEvent, IFileService } from '../../../../platform/files/common/files.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { CancellationError, getErrorMessage } from '../../../../base/common/errors.js';
import { IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IExtensionsScannerService, IScannedExtension } from '../../../../platform/extensionManagement/common/extensionsScannerService.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IUserDataProfilesService } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { createCommandUri, IMarkdownString, MarkdownString } from '../../../../base/common/htmlContent.js';
import { verifiedPublisherIcon } from './extensionsIcons.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { IStringDictionary } from '../../../../base/common/collections.js';
import { CommontExtensionManagementService } from '../../../../platform/extensionManagement/common/abstractExtensionManagementService.js';

const TrustedPublishersStorageKey = 'extensions.trustedPublishers';

function isGalleryExtension(extension: IResourceExtension | IGalleryExtension): extension is IGalleryExtension {
	return extension.type === 'gallery';
}

export class ExtensionManagementService extends CommontExtensionManagementService implements IWorkbenchExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly defaultTrustedPublishers: readonly string[];

	private readonly _onInstallExtension = this._register(new Emitter<InstallExtensionOnServerEvent>());
	readonly onInstallExtension: Event<InstallExtensionOnServerEvent>;

	private readonly _onDidInstallExtensions = this._register(new Emitter<readonly InstallExtensionResult[]>());
	readonly onDidInstallExtensions: Event<readonly InstallExtensionResult[]>;

	private readonly _onUninstallExtension = this._register(new Emitter<UninstallExtensionOnServerEvent>());
	readonly onUninstallExtension: Event<UninstallExtensionOnServerEvent>;

	private readonly _onDidUninstallExtension = this._register(new Emitter<DidUninstallExtensionOnServerEvent>());
	readonly onDidUninstallExtension: Event<DidUninstallExtensionOnServerEvent>;

	readonly onDidUpdateExtensionMetadata: Event<DidUpdateExtensionMetadata>;

	private readonly _onDidProfileAwareInstallExtensions = this._register(new Emitter<readonly InstallExtensionResult[]>());
	readonly onProfileAwareDidInstallExtensions: Event<readonly InstallExtensionResult[]>;

	private readonly _onDidProfileAwareUninstallExtension = this._register(new Emitter<DidUninstallExtensionOnServerEvent>());
	readonly onProfileAwareDidUninstallExtension: Event<DidUninstallExtensionOnServerEvent>;

	readonly onProfileAwareDidUpdateExtensionMetadata: Event<DidUpdateExtensionMetadata>;

	readonly onDidChangeProfile: Event<DidChangeProfileForServerEvent>;

	readonly onDidEnableExtensions: Event<ILocalExtension[]>;

	protected readonly servers: IExtensionManagementServer[] = [];

	private readonly workspaceExtensionManagementService: WorkspaceExtensionsManagementService;

	constructor(
		@IExtensionManagementServerService protected readonly extensionManagementServerService: IExtensionManagementServerService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IConfigurationService protected readonly configurationService: IConfigurationService,
		@IProductService productService: IProductService,
		@IDownloadService protected readonly downloadService: IDownloadService,
		@IUserDataSyncEnablementService private readonly userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IDialogService private readonly dialogService: IDialogService,
		@IWorkspaceTrustRequestService private readonly workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IFileService private readonly fileService: IFileService,
		@ILogService private readonly logService: ILogService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IExtensionsScannerService private readonly extensionsScannerService: IExtensionsScannerService,
		@IAllowedExtensionsService allowedExtensionsService: IAllowedExtensionsService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super(productService, allowedExtensionsService);

		this.defaultTrustedPublishers = productService.trustedExtensionPublishers ?? [];
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

		const onDidProfileAwareInstallExtensionsEventMultiplexer = this._register(new EventMultiplexer<readonly InstallExtensionResult[]>());
		this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(this._onDidProfileAwareInstallExtensions.event));
		this.onProfileAwareDidInstallExtensions = onDidProfileAwareInstallExtensionsEventMultiplexer.event;

		const onUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer<UninstallExtensionOnServerEvent>());
		this._register(onUninstallExtensionEventMultiplexer.add(this._onUninstallExtension.event));
		this.onUninstallExtension = onUninstallExtensionEventMultiplexer.event;

		const onDidUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer<DidUninstallExtensionOnServerEvent>());
		this._register(onDidUninstallExtensionEventMultiplexer.add(this._onDidUninstallExtension.event));
		this.onDidUninstallExtension = onDidUninstallExtensionEventMultiplexer.event;

		const onDidProfileAwareUninstallExtensionEventMultiplexer = this._register(new EventMultiplexer<DidUninstallExtensionOnServerEvent>());
		this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(this._onDidProfileAwareUninstallExtension.event));
		this.onProfileAwareDidUninstallExtension = onDidProfileAwareUninstallExtensionEventMultiplexer.event;

		const onDidUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer<DidUpdateExtensionMetadata>());
		this.onDidUpdateExtensionMetadata = onDidUpdateExtensionMetadaEventMultiplexer.event;

		const onDidProfileAwareUpdateExtensionMetadaEventMultiplexer = this._register(new EventMultiplexer<DidUpdateExtensionMetadata>());
		this.onProfileAwareDidUpdateExtensionMetadata = onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.event;

		const onDidChangeProfileEventMultiplexer = this._register(new EventMultiplexer<DidChangeProfileForServerEvent>());
		this.onDidChangeProfile = onDidChangeProfileEventMultiplexer.event;

		for (const server of this.servers) {
			this._register(onInstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onInstallExtension, e => ({ ...e, server }))));
			this._register(onDidInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onDidInstallExtensions));
			this._register(onDidProfileAwareInstallExtensionsEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidInstallExtensions));
			this._register(onUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onUninstallExtension, e => ({ ...e, server }))));
			this._register(onDidUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onDidUninstallExtension, e => ({ ...e, server }))));
			this._register(onDidProfileAwareUninstallExtensionEventMultiplexer.add(Event.map(server.extensionManagementService.onProfileAwareDidUninstallExtension, e => ({ ...e, server }))));
			this._register(onDidUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onDidUpdateExtensionMetadata));
			this._register(onDidProfileAwareUpdateExtensionMetadaEventMultiplexer.add(server.extensionManagementService.onProfileAwareDidUpdateExtensionMetadata));
			this._register(onDidChangeProfileEventMultiplexer.add(Event.map(server.extensionManagementService.onDidChangeProfile, e => ({ ...e, server }))));
		}

		this._register(this.onProfileAwareDidInstallExtensions(results => {
			const untrustedPublishers = new Map<string, IPublisherInfo>();
			for (const result of results) {
				if (result.local && result.source && !URI.isUri(result.source) && !this.isPublisherTrusted(result.source)) {
					untrustedPublishers.set(result.source.publisher, { publisher: result.source.publisher, publisherDisplayName: result.source.publisherDisplayName });
				}
			}
			if (untrustedPublishers.size) {
				this.trustPublishers(...untrustedPublishers.values());
			}
		}));
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

	updateMetadata(extension: ILocalExtension, metadata: Partial<Metadata>): Promise<ILocalExtension> {
		const server = this.getServer(extension);
		if (server) {
			const profile = extension.isApplicationScoped ? this.userDataProfilesService.defaultProfile : this.userDataProfileService.currentProfile;
			return server.extensionManagementService.updateMetadata(extension, metadata, profile.extensionsResource);
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

	override async canInstall(extension: IGalleryExtension | IResourceExtension): Promise<true | IMarkdownString> {
		if (isGalleryExtension(extension)) {
			return this.canInstallGalleryExtension(extension);
		}
		return this.canInstallResourceExtension(extension);
	}

	private async canInstallGalleryExtension(gallery: IGalleryExtension): Promise<true | IMarkdownString> {
		if (this.extensionManagementServerService.localExtensionManagementServer
			&& await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
			return true;
		}
		const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
		if (!manifest) {
			return new MarkdownString().appendText(localize('manifest is not found', "Manifest is not found"));
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer
			&& await this.extensionManagementServerService.remoteExtensionManagementServer.extensionManagementService.canInstall(gallery) === true
			&& this.extensionManifestPropertiesService.canExecuteOnWorkspace(manifest)) {
			return true;
		}
		if (this.extensionManagementServerService.webExtensionManagementServer
			&& await this.extensionManagementServerService.webExtensionManagementServer.extensionManagementService.canInstall(gallery) === true
			&& this.extensionManifestPropertiesService.canExecuteOnWeb(manifest)) {
			return true;
		}
		return new MarkdownString().appendText(localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
	}

	private async canInstallResourceExtension(extension: IResourceExtension): Promise<true | IMarkdownString> {
		if (this.extensionManagementServerService.localExtensionManagementServer) {
			return true;
		}
		if (this.extensionManagementServerService.remoteExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWorkspace(extension.manifest)) {
			return true;
		}
		if (this.extensionManagementServerService.webExtensionManagementServer && this.extensionManifestPropertiesService.canExecuteOnWeb(extension.manifest)) {
			return true;
		}
		return new MarkdownString().appendText(localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", extension.manifest.displayName ?? extension.identifier.id));
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
		const manifests = await Promise.all(extensions.map(async ({ extension }) => {
			const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
			if (!manifest) {
				throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
			}
			return manifest;
		}));

		if (extensions.some(e => e.options?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true)) {
			await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
		}

		await Promise.all(extensions.map(async ({ extension, options }) => {
			try {
				const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
				if (!manifest) {
					throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
				}

				if (options?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== ExtensionInstallSource.SETTINGS_SYNC) {
					await this.checkForWorkspaceTrust(manifest, false);

					if (!options?.donotIncludePackAndDependencies) {
						await this.checkInstallingExtensionOnWeb(extension, manifest);
					}
				}

				const servers = await this.getExtensionManagementServersToInstall(extension, manifest);
				if (!options.isMachineScoped && this.isExtensionsSyncEnabled()) {
					if (this.extensionManagementServerService.localExtensionManagementServer
						&& !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)
						&& await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(extension) === true) {
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

	async installFromGallery(gallery: IGalleryExtension, installOptions?: InstallOptions, servers?: IExtensionManagementServer[]): Promise<ILocalExtension> {
		const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
		if (!manifest) {
			throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
		}

		if (installOptions?.context?.[EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT] !== true) {
			await this.checkForTrustedPublishers([{ extension: gallery, manifest, checkForPackAndDependencies: !installOptions?.donotIncludePackAndDependencies }],);
		}

		if (installOptions?.context?.[EXTENSION_INSTALL_SOURCE_CONTEXT] !== ExtensionInstallSource.SETTINGS_SYNC) {

			await this.checkForWorkspaceTrust(manifest, false);

			if (!installOptions?.donotIncludePackAndDependencies) {
				await this.checkInstallingExtensionOnWeb(gallery, manifest);
			}
		}

		servers = servers?.length ? this.validServers(gallery, manifest, servers) : await this.getExtensionManagementServersToInstall(gallery, manifest);
		if (!installOptions || isUndefined(installOptions.isMachineScoped)) {
			const isMachineScoped = await this.hasToFlagExtensionsMachineScoped([gallery]);
			installOptions = { ...(installOptions || {}), isMachineScoped };
		}

		if (!installOptions.isMachineScoped && this.isExtensionsSyncEnabled()) {
			if (this.extensionManagementServerService.localExtensionManagementServer
				&& !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)
				&& await this.extensionManagementServerService.localExtensionManagementServer.extensionManagementService.canInstall(gallery) === true) {
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

	async getInstallableServers(gallery: IGalleryExtension): Promise<IExtensionManagementServer[]> {
		const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
		if (!manifest) {
			return Promise.reject(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", gallery.displayName || gallery.name));
		}
		return this.getInstallableExtensionManagementServers(manifest);
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

	private validServers(gallery: IGalleryExtension, manifest: IExtensionManifest, servers: IExtensionManagementServer[]): IExtensionManagementServer[] {
		const installableServers = this.getInstallableExtensionManagementServers(manifest);
		for (const server of servers) {
			if (!installableServers.includes(server)) {
				const error = new Error(localize('cannot be installed in server', "Cannot install the '{0}' extension because it is not available in the '{1}' setup.", gallery.displayName || gallery.name, server.label));
				error.name = ExtensionManagementErrorCode.Unsupported;
				throw error;
			}
		}
		return servers;
	}

	private async getExtensionManagementServersToInstall(gallery: IGalleryExtension, manifest: IExtensionManifest): Promise<IExtensionManagementServer[]> {
		const servers: IExtensionManagementServer[] = [];

		// Language packs should be installed on both local and remote servers
		if (isLanguagePackExtension(manifest)) {
			servers.push(...this.servers.filter(server => server !== this.extensionManagementServerService.webExtensionManagementServer));
		}

		else {
			const [server] = this.getInstallableExtensionManagementServers(manifest);
			if (server) {
				servers.push(server);
			}
		}

		if (!servers.length) {
			const error = new Error(localize('cannot be installed', "Cannot install the '{0}' extension because it is not available in this setup.", gallery.displayName || gallery.name));
			error.name = ExtensionManagementErrorCode.Unsupported;
			throw error;
		}

		return servers;
	}

	private getInstallableExtensionManagementServers(manifest: IExtensionManifest): IExtensionManagementServer[] {
		// Only local server
		if (this.servers.length === 1 && this.extensionManagementServerService.localExtensionManagementServer) {
			return [this.extensionManagementServerService.localExtensionManagementServer];
		}

		const servers: IExtensionManagementServer[] = [];

		const extensionKind = this.extensionManifestPropertiesService.getExtensionKind(manifest);
		for (const kind of extensionKind) {
			if (kind === 'ui' && this.extensionManagementServerService.localExtensionManagementServer) {
				servers.push(this.extensionManagementServerService.localExtensionManagementServer);
			}
			if (kind === 'workspace' && this.extensionManagementServerService.remoteExtensionManagementServer) {
				servers.push(this.extensionManagementServerService.remoteExtensionManagementServer);
			}
			if (kind === 'web' && this.extensionManagementServerService.webExtensionManagementServer) {
				servers.push(this.extensionManagementServerService.webExtensionManagementServer);
			}
		}

		// Local server can accept any extension.
		if (this.extensionManagementServerService.localExtensionManagementServer && !servers.includes(this.extensionManagementServerService.localExtensionManagementServer)) {
			servers.push(this.extensionManagementServerService.localExtensionManagementServer);
		}

		return servers;
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
		return this.extensionGalleryService.getExtensionsControlManifest();
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

	async requestPublisherTrust(extensions: InstallExtensionInfo[]): Promise<void> {
		const manifests = await Promise.all(extensions.map(async ({ extension }) => {
			const manifest = await this.extensionGalleryService.getManifest(extension, CancellationToken.None);
			if (!manifest) {
				throw new Error(localize('Manifest is not found', "Installing Extension {0} failed: Manifest is not found.", extension.displayName || extension.name));
			}
			return manifest;
		}));

		await this.checkForTrustedPublishers(extensions.map((e, index) => ({ extension: e.extension, manifest: manifests[index], checkForPackAndDependencies: !e.options?.donotIncludePackAndDependencies })));
	}

	private async checkForTrustedPublishers(extensions: { extension: IGalleryExtension; manifest: IExtensionManifest; checkForPackAndDependencies: boolean }[]): Promise<void> {
		const untrustedExtensions: IGalleryExtension[] = [];
		const untrustedExtensionManifests: IExtensionManifest[] = [];
		const manifestsToGetOtherUntrustedPublishers: IExtensionManifest[] = [];
		for (const { extension, manifest, checkForPackAndDependencies } of extensions) {
			if (!extension.private && !this.isPublisherTrusted(extension)) {
				untrustedExtensions.push(extension);
				untrustedExtensionManifests.push(manifest);
				if (checkForPackAndDependencies) {
					manifestsToGetOtherUntrustedPublishers.push(manifest);
				}
			}
		}

		if (!untrustedExtensions.length) {
			return;
		}

		const otherUntrustedPublishers = manifestsToGetOtherUntrustedPublishers.length ? await this.getOtherUntrustedPublishers(manifestsToGetOtherUntrustedPublishers) : [];
		const allPublishers = [...distinct(untrustedExtensions, e => e.publisher), ...otherUntrustedPublishers];
		const unverfiiedPublishers = allPublishers.filter(p => !p.publisherDomain?.verified);
		const verifiedPublishers = allPublishers.filter(p => p.publisherDomain?.verified);

		type TrustPublisherClassification = {
			owner: 'sandy081';
			comment: 'Report the action taken by the user on the publisher trust dialog';
			action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The action taken by the user on the publisher trust dialog. Can be trust, learn more or cancel.' };
			extensionId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The identifiers of the extension for which the publisher trust dialog was shown.' };
		};
		type TrustPublisherEvent = {
			action: string;
			extensionId: string;
		};

		const installButton: IPromptButton<void> = {
			label: allPublishers.length > 1 ? localize({ key: 'trust publishers and install', comment: ['&& denotes a mnemonic'] }, "Trust Publishers & &&Install") : localize({ key: 'trust and install', comment: ['&& denotes a mnemonic'] }, "Trust Publisher & &&Install"),
			run: () => {
				this.telemetryService.publicLog2<TrustPublisherEvent, TrustPublisherClassification>('extensions:trustPublisher', { action: 'trust', extensionId: untrustedExtensions.map(e => e.identifier.id).join(',') });
				this.trustPublishers(...allPublishers.map(p => ({ publisher: p.publisher, publisherDisplayName: p.publisherDisplayName })));
			}
		};

		const learnMoreButton: IPromptButton<void> = {
			label: localize({ key: 'learnMore', comment: ['&& denotes a mnemonic'] }, "&&Learn More"),
			run: () => {
				this.telemetryService.publicLog2<TrustPublisherEvent, TrustPublisherClassification>('extensions:trustPublisher', { action: 'learn', extensionId: untrustedExtensions.map(e => e.identifier.id).join(',') });
				this.instantiationService.invokeFunction(accessor => accessor.get(ICommandService).executeCommand('vscode.open', URI.parse('https://aka.ms/vscode-extension-security')));
				throw new CancellationError();
			}
		};

		const getPublisherLink = ({ publisherDisplayName, publisherLink }: { publisherDisplayName: string; publisherLink?: string }) => {
			return publisherLink ? `[${publisherDisplayName}](${publisherLink})` : publisherDisplayName;
		};

		const unverifiedLink = 'https://aka.ms/vscode-verify-publisher';

		const title = allPublishers.length === 1
			? localize('checkTrustedPublisherTitle', "Do you trust the publisher \"{0}\"?", allPublishers[0].publisherDisplayName)
			: allPublishers.length === 2
				? localize('checkTwoTrustedPublishersTitle', "Do you trust publishers \"{0}\" and \"{1}\"?", allPublishers[0].publisherDisplayName, allPublishers[1].publisherDisplayName)
				: localize('checkAllTrustedPublishersTitle', "Do you trust the publisher \"{0}\" and {1} others?", allPublishers[0].publisherDisplayName, allPublishers.length - 1);

		const customMessage = new MarkdownString('', { supportThemeIcons: true, isTrusted: true });

		if (untrustedExtensions.length === 1) {
			const extension = untrustedExtensions[0];
			const manifest = untrustedExtensionManifests[0];
			if (otherUntrustedPublishers.length) {
				customMessage.appendMarkdown(localize('extension published by message', "The extension {0} is published by {1}.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
				customMessage.appendMarkdown('&nbsp;');
				const commandUri = createCommandUri('extension.open', extension.identifier.id, manifest.extensionPack?.length ? 'extensionPack' : 'dependencies').toString();
				if (otherUntrustedPublishers.length === 1) {
					customMessage.appendMarkdown(localize('singleUntrustedPublisher', "Installing this extension will also install [extensions]({0}) published by {1}.", commandUri, getPublisherLink(otherUntrustedPublishers[0])));
				} else {
					customMessage.appendMarkdown(localize('message3', "Installing this extension will also install [extensions]({0}) published by {1} and {2}.", commandUri, otherUntrustedPublishers.slice(0, otherUntrustedPublishers.length - 1).map(p => getPublisherLink(p)).join(', '), getPublisherLink(otherUntrustedPublishers[otherUntrustedPublishers.length - 1])));
				}
				customMessage.appendMarkdown('&nbsp;');
				customMessage.appendMarkdown(localize('firstTimeInstallingMessage', "This is the first time you're installing extensions from these publishers."));
			} else {
				customMessage.appendMarkdown(localize('message1', "The extension {0} is published by {1}. This is the first extension you're installing from this publisher.", `[${extension.displayName}](${extension.detailsLink})`, getPublisherLink(extension)));
			}
		} else {
			customMessage.appendMarkdown(localize('multiInstallMessage', "This is the first time you're installing extensions from publishers {0} and {1}.", getPublisherLink(allPublishers[0]), getPublisherLink(allPublishers[allPublishers.length - 1])));
		}

		if (verifiedPublishers.length || unverfiiedPublishers.length === 1) {
			for (const publisher of verifiedPublishers) {
				customMessage.appendText('\n');
				const publisherVerifiedMessage = localize('verifiedPublisherWithName', "{0} has verified ownership of {1}.", getPublisherLink(publisher), `[$(link-external) ${URI.parse(publisher.publisherDomain!.link).authority}](${publisher.publisherDomain!.link})`);
				customMessage.appendMarkdown(`$(${verifiedPublisherIcon.id})&nbsp;${publisherVerifiedMessage}`);
			}
			if (unverfiiedPublishers.length) {
				customMessage.appendText('\n');
				if (unverfiiedPublishers.length === 1) {
					customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize('unverifiedPublisherWithName', "{0} is [**not** verified]({1}).", getPublisherLink(unverfiiedPublishers[0]), unverifiedLink)}`);
				} else {
					customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize('unverifiedPublishers', "{0} and {1} are [**not** verified]({2}).", unverfiiedPublishers.slice(0, unverfiiedPublishers.length - 1).map(p => getPublisherLink(p)).join(', '), getPublisherLink(unverfiiedPublishers[unverfiiedPublishers.length - 1]), unverifiedLink)}`);
				}
			}
		} else {
			customMessage.appendText('\n');
			customMessage.appendMarkdown(`$(${Codicon.unverified.id})&nbsp;${localize('allUnverifed', "All publishers are [**not** verified]({0}).", unverifiedLink)}`);
		}

		customMessage.appendText('\n');
		if (allPublishers.length > 1) {
			customMessage.appendMarkdown(localize('message4', "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publishers.", this.productService.nameLong));
		} else {
			customMessage.appendMarkdown(localize('message2', "{0} has no control over the behavior of third-party extensions, including how they manage your personal data. Proceed only if you trust the publisher.", this.productService.nameLong));
		}

		await this.dialogService.prompt({
			message: title,
			type: Severity.Warning,
			buttons: [installButton, learnMoreButton],
			cancelButton: {
				run: () => {
					this.telemetryService.publicLog2<TrustPublisherEvent, TrustPublisherClassification>('extensions:trustPublisher', { action: 'cancel', extensionId: untrustedExtensions.map(e => e.identifier.id).join(',') });
					throw new CancellationError();
				}
			},
			custom: {
				markdownDetails: [{ markdown: customMessage, classes: ['extensions-management-publisher-trust-dialog'] }],
			}
		});

	}

	private async getOtherUntrustedPublishers(manifests: IExtensionManifest[]): Promise<{ publisher: string; publisherDisplayName: string; publisherLink?: string; publisherDomain?: { link: string; verified: boolean } }[]> {
		const extensionIds = new Set<string>();
		for (const manifest of manifests) {
			for (const id of [...(manifest.extensionPack ?? []), ...(manifest.extensionDependencies ?? [])]) {
				const [publisherId] = id.split('.');
				if (publisherId.toLowerCase() === manifest.publisher.toLowerCase()) {
					continue;
				}
				if (this.isPublisherUserTrusted(publisherId.toLowerCase())) {
					continue;
				}
				extensionIds.add(id.toLowerCase());
			}
		}
		if (!extensionIds.size) {
			return [];
		}
		const extensions = new Map<string, IGalleryExtension>();
		await this.getDependenciesAndPackedExtensionsRecursively([...extensionIds], extensions, CancellationToken.None);
		const publishers = new Map<string, IGalleryExtension>();
		for (const [, extension] of extensions) {
			if (extension.private || this.isPublisherTrusted(extension)) {
				continue;
			}
			publishers.set(extension.publisherDisplayName, extension);
		}
		return [...publishers.values()];
	}

	private async getDependenciesAndPackedExtensionsRecursively(toGet: string[], result: Map<string, IGalleryExtension>, token: CancellationToken): Promise<void> {
		if (toGet.length === 0) {
			return;
		}

		const extensions = await this.extensionGalleryService.getExtensions(toGet.map(id => ({ id })), token);
		for (let idx = 0; idx < extensions.length; idx++) {
			const extension = extensions[idx];
			result.set(extension.identifier.id.toLowerCase(), extension);
		}
		toGet = [];
		for (const extension of extensions) {
			if (isNonEmptyArray(extension.properties.dependencies)) {
				for (const id of extension.properties.dependencies) {
					if (!result.has(id.toLowerCase())) {
						toGet.push(id);
					}
				}
			}
			if (isNonEmptyArray(extension.properties.extensionPack)) {
				for (const id of extension.properties.extensionPack) {
					if (!result.has(id.toLowerCase())) {
						toGet.push(id);
					}
				}
			}
		}
		return this.getDependenciesAndPackedExtensionsRecursively(toGet, result, token);
	}

	private async checkForWorkspaceTrust(manifest: IExtensionManifest, requireTrust: boolean): Promise<void> {
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
				if (await this.servers[0].extensionManagementService.canInstall(extension) !== true) {
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

	toggleApplicationScope(extension: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension> {
		const server = this.getServer(extension);
		if (server) {
			return server.extensionManagementService.toggleApplicationScope(extension, fromProfileLocation);
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

	isPublisherTrusted(extension: IGalleryExtension): boolean {
		const publisher = extension.publisher.toLowerCase();
		if (this.defaultTrustedPublishers.includes(publisher) || this.defaultTrustedPublishers.includes(extension.publisherDisplayName.toLowerCase())) {
			return true;
		}

		// Check if the extension is allowed by publisher or extension id
		if (this.allowedExtensionsService.allowedExtensionsConfigValue && this.allowedExtensionsService.isAllowed(extension)) {
			return true;
		}

		return this.isPublisherUserTrusted(publisher);
	}

	private isPublisherUserTrusted(publisher: string): boolean {
		const trustedPublishers = this.getTrustedPublishersFromStorage();
		return !!trustedPublishers[publisher];
	}

	getTrustedPublishers(): IPublisherInfo[] {
		const trustedPublishers = this.getTrustedPublishersFromStorage();
		return Object.keys(trustedPublishers).map(publisher => trustedPublishers[publisher]);
	}

	trustPublishers(...publishers: IPublisherInfo[]): void {
		const trustedPublishers = this.getTrustedPublishersFromStorage();
		for (const publisher of publishers) {
			trustedPublishers[publisher.publisher.toLowerCase()] = publisher;
		}
		this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), StorageScope.APPLICATION, StorageTarget.USER);
	}

	untrustPublishers(...publishers: string[]): void {
		const trustedPublishers = this.getTrustedPublishersFromStorage();
		for (const publisher of publishers) {
			delete trustedPublishers[publisher.toLowerCase()];
		}
		this.storageService.store(TrustedPublishersStorageKey, JSON.stringify(trustedPublishers), StorageScope.APPLICATION, StorageTarget.USER);
	}

	private getTrustedPublishersFromStorage(): IStringDictionary<IPublisherInfo> {
		const trustedPublishers = this.storageService.getObject<IStringDictionary<IPublisherInfo>>(TrustedPublishersStorageKey, StorageScope.APPLICATION, {});
		if (Array.isArray(trustedPublishers)) {
			this.storageService.remove(TrustedPublishersStorageKey, StorageScope.APPLICATION);
			return {};
		}
		return Object.keys(trustedPublishers).reduce<IStringDictionary<IPublisherInfo>>((result, publisher) => {
			result[publisher.toLowerCase()] = trustedPublishers[publisher];
			return result;
		}, {});
	}
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
				validations.push([Severity.Error, localize('main.notFound', "Cannot activate because {0} not found", extension.manifest.main)]);
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
			private: false,
			source: 'resource',
			size: extension.metadata?.size ?? 0,
		};
	}
}
