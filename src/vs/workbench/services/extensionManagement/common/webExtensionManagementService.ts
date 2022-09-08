/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionIdentifier, ExtensionType, IExtension, IExtensionIdentifier, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { ILocalExtension, IGalleryExtension, IGalleryMetadata, InstallOperation, IExtensionGalleryService, Metadata, InstallOptions, UninstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { Emitter } from 'vs/base/common/event';
import { areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IProfileAwareExtensionManagementService, IScannedExtension, IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { AbstractExtensionManagementService, AbstractExtensionTask, IInstallExtensionTask, IUninstallExtensionTask } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IProductService } from 'vs/platform/product/common/productService';
import { isBoolean, isUndefined } from 'vs/base/common/types';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { delta } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class WebExtensionManagementService extends AbstractExtensionManagementService implements IProfileAwareExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	get onProfileAwareInstallExtension() { return super.onInstallExtension; }
	get onProfileAwareDidInstallExtensions() { return super.onDidInstallExtensions; }
	get onProfileAwareUninstallExtension() { return super.onUninstallExtension; }
	get onProfileAwareDidUninstallExtension() { return super.onDidUninstallExtension; }

	private readonly _onDidChangeProfile = this._register(new Emitter<{ readonly added: ILocalExtension[]; readonly removed: ILocalExtension[] }>());
	readonly onDidChangeProfile = this._onDidChangeProfile.event;

	constructor(
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IWebExtensionsScannerService private readonly webExtensionsScannerService: IWebExtensionsScannerService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IProductService productService: IProductService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
	) {
		super(extensionGalleryService, telemetryService, logService, productService, userDataProfilesService);
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.whenProfileChanged(e))));
	}

	async getTargetPlatform(): Promise<TargetPlatform> {
		return TargetPlatform.WEB;
	}

	override async canInstall(gallery: IGalleryExtension): Promise<boolean> {
		if (await super.canInstall(gallery)) {
			return true;
		}
		if (this.isConfiguredToExecuteOnWeb(gallery)) {
			return true;
		}
		return false;
	}

	async getInstalled(type?: ExtensionType): Promise<ILocalExtension[]> {
		const extensions = [];
		if (type === undefined || type === ExtensionType.System) {
			const systemExtensions = await this.webExtensionsScannerService.scanSystemExtensions();
			extensions.push(...systemExtensions);
		}
		if (type === undefined || type === ExtensionType.User) {
			const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(this.userDataProfileService.currentProfile.extensionsResource);
			extensions.push(...userExtensions);
		}
		return Promise.all(extensions.map(e => toLocalExtension(e)));
	}

	async install(location: URI, options: InstallOptions = {}): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#install', location.toString());
		const manifest = await this.webExtensionsScannerService.scanExtensionManifest(location);
		if (!manifest) {
			throw new Error(`Cannot find packageJSON from the location ${location.toString()}`);
		}
		return this.installExtension(manifest, location, options);
	}

	getMetadata(extension: ILocalExtension): Promise<Metadata | undefined> {
		return this.webExtensionsScannerService.scanMetadata(extension.location, this.userDataProfileService.currentProfile.extensionsResource);
	}

	protected override async getCompatibleVersion(extension: IGalleryExtension, sameVersion: boolean, includePreRelease: boolean): Promise<IGalleryExtension | null> {
		const compatibleExtension = await super.getCompatibleVersion(extension, sameVersion, includePreRelease);
		if (compatibleExtension) {
			return compatibleExtension;
		}
		if (this.isConfiguredToExecuteOnWeb(extension)) {
			return extension;
		}
		return null;
	}

	private isConfiguredToExecuteOnWeb(gallery: IGalleryExtension): boolean {
		const configuredExtensionKind = this.extensionManifestPropertiesService.getUserConfiguredExtensionKind(gallery.identifier);
		return !!configuredExtensionKind && configuredExtensionKind.includes('web');
	}

	async updateMetadata(local: ILocalExtension, metadata: IGalleryMetadata): Promise<ILocalExtension> {
		return local;
	}

	protected doCreateInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallOptions): IInstallExtensionTask {
		if (!options.profileLocation) {
			options = { ...options, profileLocation: this.userDataProfileService.currentProfile.extensionsResource };
		}
		return new InstallExtensionTask(manifest, extension, options, this.webExtensionsScannerService);
	}

	protected doCreateUninstallExtensionTask(extension: ILocalExtension, options: UninstallOptions): IUninstallExtensionTask {
		if (!options.profileLocation) {
			options = { ...options, profileLocation: this.userDataProfileService.currentProfile.extensionsResource };
		}
		return new UninstallExtensionTask(extension, options, this.webExtensionsScannerService);
	}

	zip(extension: ILocalExtension): Promise<URI> { throw new Error('unsupported'); }
	unzip(zipLocation: URI): Promise<IExtensionIdentifier> { throw new Error('unsupported'); }
	getManifest(vsix: URI): Promise<IExtensionManifest> { throw new Error('unsupported'); }
	updateExtensionScope(): Promise<ILocalExtension> { throw new Error('unsupported'); }

	private async whenProfileChanged(e: DidChangeUserDataProfileEvent): Promise<void> {
		const previousProfileLocation = e.previous.extensionsResource;
		const currentProfileLocation = e.profile.extensionsResource;
		if (!previousProfileLocation || !currentProfileLocation) {
			throw new Error('This should not happen');
		}
		if (e.preserveData) {
			await this.webExtensionsScannerService.copyExtensions(previousProfileLocation, currentProfileLocation, e => !e.metadata?.isApplicationScoped);
		} else {
			const oldExtensions = await this.webExtensionsScannerService.scanUserExtensions(previousProfileLocation);
			const newExtensions = await this.webExtensionsScannerService.scanUserExtensions(currentProfileLocation);
			const { added, removed } = delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
			if (added.length || removed.length) {
				this._onDidChangeProfile.fire({ added: added.map(e => toLocalExtension(e)), removed: removed.map(e => toLocalExtension(e)) });
			}
		}
	}
}

function toLocalExtension(extension: IExtension): ILocalExtension {
	const metadata = getMetadata(undefined, extension);
	return {
		...extension,
		identifier: { id: extension.identifier.id, uuid: metadata.id ?? extension.identifier.uuid },
		isMachineScoped: !!metadata.isMachineScoped,
		isApplicationScoped: !!metadata.isApplicationScoped,
		publisherId: metadata.publisherId || null,
		publisherDisplayName: metadata.publisherDisplayName || null,
		installedTimestamp: metadata.installedTimestamp,
		isPreReleaseVersion: !!metadata.isPreReleaseVersion,
		preRelease: !!metadata.preRelease,
		targetPlatform: TargetPlatform.WEB,
		updated: !!metadata.updated
	};
}

function getMetadata(options?: InstallOptions, existingExtension?: IExtension): Metadata {
	const metadata: Metadata = { ...((<IScannedExtension>existingExtension)?.metadata || {}) };
	metadata.isMachineScoped = options?.isMachineScoped || metadata.isMachineScoped;
	return metadata;
}

class InstallExtensionTask extends AbstractExtensionTask<{ local: ILocalExtension; metadata: Metadata }> implements IInstallExtensionTask {

	readonly identifier: IExtensionIdentifier;
	readonly source: URI | IGalleryExtension;

	private _operation = InstallOperation.Install;
	get operation() { return isUndefined(this.options.operation) ? this._operation : this.options.operation; }

	constructor(
		manifest: IExtensionManifest,
		private readonly extension: URI | IGalleryExtension,
		private readonly options: InstallOptions,
		private readonly webExtensionsScannerService: IWebExtensionsScannerService,
	) {
		super();
		this.identifier = URI.isUri(extension) ? { id: getGalleryExtensionId(manifest.publisher, manifest.name) } : extension.identifier;
		this.source = extension;
	}

	protected async doRun(token: CancellationToken): Promise<{ local: ILocalExtension; metadata: Metadata }> {
		const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(this.options.profileLocation);
		const existingExtension = userExtensions.find(e => areSameExtensions(e.identifier, this.identifier));
		if (existingExtension) {
			this._operation = InstallOperation.Update;
		}

		const metadata = getMetadata(this.options, existingExtension);
		if (!URI.isUri(this.extension)) {
			metadata.id = this.extension.identifier.uuid;
			metadata.publisherDisplayName = this.extension.publisherDisplayName;
			metadata.publisherId = this.extension.publisherId;
			metadata.installedTimestamp = Date.now();
			metadata.isPreReleaseVersion = this.extension.properties.isPreReleaseVersion;
			metadata.isBuiltin = this.options.isBuiltin || existingExtension?.isBuiltin;
			metadata.isSystem = existingExtension?.type === ExtensionType.System ? true : undefined;
			metadata.updated = !!existingExtension;
			metadata.preRelease = this.extension.properties.isPreReleaseVersion ||
				(isBoolean(this.options.installPreReleaseVersion)
					? this.options.installPreReleaseVersion /* Respect the passed flag */
					: metadata?.preRelease /* Respect the existing pre-release flag if it was set */);
		}

		const scannedExtension = URI.isUri(this.extension) ? await this.webExtensionsScannerService.addExtension(this.extension, metadata, this.options.profileLocation)
			: await this.webExtensionsScannerService.addExtensionFromGallery(this.extension, metadata, this.options.profileLocation);
		return { local: toLocalExtension(scannedExtension), metadata };
	}
}

class UninstallExtensionTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {

	constructor(
		readonly extension: ILocalExtension,
		private readonly options: UninstallOptions,
		private readonly webExtensionsScannerService: IWebExtensionsScannerService,
	) {
		super();
	}

	protected doRun(token: CancellationToken): Promise<void> {
		return this.webExtensionsScannerService.removeExtension(this.extension, this.options.profileLocation);
	}
}
