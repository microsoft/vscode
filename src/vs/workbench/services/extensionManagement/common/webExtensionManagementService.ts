/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtensionIdentifier, ExtensionType, IExtension, IExtensionIdentifier, IExtensionManifest, TargetPlatform } from 'vs/platform/extensions/common/extensions';
import { ILocalExtension, IGalleryExtension, InstallOperation, IExtensionGalleryService, Metadata, InstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { Emitter, Event } from 'vs/base/common/event';
import { areSameExtensions, getGalleryExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IProfileAwareExtensionManagementService, IScannedExtension, IWebExtensionsScannerService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ILogService } from 'vs/platform/log/common/log';
import { CancellationToken } from 'vs/base/common/cancellation';
import { AbstractExtensionManagementService, AbstractExtensionTask, IInstallExtensionTask, InstallExtensionTaskOptions, IUninstallExtensionTask, toExtensionManagementError, UninstallExtensionTaskOptions } from 'vs/platform/extensionManagement/common/abstractExtensionManagementService';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IExtensionManifestPropertiesService } from 'vs/workbench/services/extensions/common/extensionManifestPropertiesService';
import { IProductService } from 'vs/platform/product/common/productService';
import { isBoolean, isUndefined } from 'vs/base/common/types';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { delta } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { DisposableStore } from 'vs/base/common/lifecycle';

export class WebExtensionManagementService extends AbstractExtensionManagementService implements IProfileAwareExtensionManagementService {

	declare readonly _serviceBrand: undefined;

	private readonly disposables = this._register(new DisposableStore());

	get onProfileAwareInstallExtension() { return super.onInstallExtension; }
	override get onInstallExtension() { return Event.filter(this.onProfileAwareInstallExtension, e => this.filterEvent(e), this.disposables); }

	get onProfileAwareDidInstallExtensions() { return super.onDidInstallExtensions; }
	override get onDidInstallExtensions() {
		return Event.filter(
			Event.map(this.onProfileAwareDidInstallExtensions, results => results.filter(e => this.filterEvent(e)), this.disposables),
			results => results.length > 0, this.disposables);
	}

	get onProfileAwareUninstallExtension() { return super.onUninstallExtension; }
	override get onUninstallExtension() { return Event.filter(this.onProfileAwareUninstallExtension, e => this.filterEvent(e), this.disposables); }

	get onProfileAwareDidUninstallExtension() { return super.onDidUninstallExtension; }
	override get onDidUninstallExtension() { return Event.filter(this.onProfileAwareDidUninstallExtension, e => this.filterEvent(e), this.disposables); }


	private readonly _onDidChangeProfile = this._register(new Emitter<{ readonly added: ILocalExtension[]; readonly removed: ILocalExtension[] }>());
	readonly onDidChangeProfile = this._onDidChangeProfile.event;

	private readonly _onDidUpdateExtensionMetadata = this._register(new Emitter<ILocalExtension>());
	override readonly onDidUpdateExtensionMetadata = this._onDidUpdateExtensionMetadata.event;

	constructor(
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@ITelemetryService telemetryService: ITelemetryService,
		@ILogService logService: ILogService,
		@IWebExtensionsScannerService private readonly webExtensionsScannerService: IWebExtensionsScannerService,
		@IExtensionManifestPropertiesService private readonly extensionManifestPropertiesService: IExtensionManifestPropertiesService,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IProductService productService: IProductService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
	) {
		super(extensionGalleryService, telemetryService, logService, productService, userDataProfilesService);
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.whenProfileChanged(e))));
	}

	private filterEvent({ profileLocation, applicationScoped }: { profileLocation?: URI; applicationScoped?: boolean }): boolean {
		profileLocation = profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource;
		return applicationScoped || this.uriIdentityService.extUri.isEqual(this.userDataProfileService.currentProfile.extensionsResource, profileLocation);
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

	async getInstalled(type?: ExtensionType, profileLocation?: URI): Promise<ILocalExtension[]> {
		const extensions = [];
		if (type === undefined || type === ExtensionType.System) {
			const systemExtensions = await this.webExtensionsScannerService.scanSystemExtensions();
			extensions.push(...systemExtensions);
		}
		if (type === undefined || type === ExtensionType.User) {
			const userExtensions = await this.webExtensionsScannerService.scanUserExtensions(profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource);
			extensions.push(...userExtensions);
		}
		return extensions.map(e => toLocalExtension(e));
	}

	async install(location: URI, options: InstallOptions = {}): Promise<ILocalExtension> {
		this.logService.trace('ExtensionManagementService#install', location.toString());
		const manifest = await this.webExtensionsScannerService.scanExtensionManifest(location);
		if (!manifest) {
			throw new Error(`Cannot find packageJSON from the location ${location.toString()}`);
		}
		const result = await this.installExtensions([{ manifest, extension: location, options }]);
		if (result[0]?.local) {
			return result[0]?.local;
		}
		if (result[0]?.error) {
			throw result[0].error;
		}
		throw toExtensionManagementError(new Error(`Unknown error while installing extension ${getGalleryExtensionId(manifest.publisher, manifest.name)}`));
	}

	installFromLocation(location: URI, profileLocation: URI): Promise<ILocalExtension> {
		return this.install(location, { profileLocation });
	}

	async installExtensionsFromProfile(extensions: IExtensionIdentifier[], fromProfileLocation: URI, toProfileLocation: URI): Promise<ILocalExtension[]> {
		const result: ILocalExtension[] = [];
		const extensionsToInstall = (await this.webExtensionsScannerService.scanUserExtensions(fromProfileLocation))
			.filter(e => extensions.some(id => areSameExtensions(id, e.identifier)));
		if (extensionsToInstall.length) {
			await Promise.allSettled(extensionsToInstall.map(async e => {
				let local = await this.installFromLocation(e.location, toProfileLocation);
				if (e.metadata) {
					local = await this.updateMetadata(local, e.metadata, fromProfileLocation);
				}
				result.push(local);
			}));
		}
		return result;
	}

	async updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, profileLocation?: URI): Promise<ILocalExtension> {
		// unset if false
		metadata.isMachineScoped = metadata.isMachineScoped || undefined;
		metadata.isBuiltin = metadata.isBuiltin || undefined;
		metadata.pinned = metadata.pinned || undefined;
		const updatedExtension = await this.webExtensionsScannerService.updateMetadata(local, metadata, profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource);
		const updatedLocalExtension = toLocalExtension(updatedExtension);
		this._onDidUpdateExtensionMetadata.fire(updatedLocalExtension);
		return updatedLocalExtension;
	}

	override async copyExtensions(fromProfileLocation: URI, toProfileLocation: URI): Promise<void> {
		await this.webExtensionsScannerService.copyExtensions(fromProfileLocation, toProfileLocation, e => !e.metadata?.isApplicationScoped);
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

	protected getCurrentExtensionsManifestLocation(): URI {
		return this.userDataProfileService.currentProfile.extensionsResource;
	}

	protected createInstallExtensionTask(manifest: IExtensionManifest, extension: URI | IGalleryExtension, options: InstallExtensionTaskOptions): IInstallExtensionTask {
		return new InstallExtensionTask(manifest, extension, options, this.webExtensionsScannerService, this.userDataProfilesService);
	}

	protected createUninstallExtensionTask(extension: ILocalExtension, options: UninstallExtensionTaskOptions): IUninstallExtensionTask {
		return new UninstallExtensionTask(extension, options, this.webExtensionsScannerService);
	}

	zip(extension: ILocalExtension): Promise<URI> { throw new Error('unsupported'); }
	unzip(zipLocation: URI): Promise<IExtensionIdentifier> { throw new Error('unsupported'); }
	getManifest(vsix: URI): Promise<IExtensionManifest> { throw new Error('unsupported'); }
	download(): Promise<URI> { throw new Error('unsupported'); }
	reinstallFromGallery(): Promise<ILocalExtension> { throw new Error('unsupported'); }

	async cleanUp(): Promise<void> { }

	private async whenProfileChanged(e: DidChangeUserDataProfileEvent): Promise<void> {
		const previousProfileLocation = e.previous.extensionsResource;
		const currentProfileLocation = e.profile.extensionsResource;
		if (!previousProfileLocation || !currentProfileLocation) {
			throw new Error('This should not happen');
		}
		if (e.preserveData) {
			await this.copyExtensions(previousProfileLocation, currentProfileLocation);
			this._onDidChangeProfile.fire({ added: [], removed: [] });
		} else {
			const oldExtensions = await this.webExtensionsScannerService.scanUserExtensions(previousProfileLocation);
			const newExtensions = await this.webExtensionsScannerService.scanUserExtensions(currentProfileLocation);
			const { added, removed } = delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
			this._onDidChangeProfile.fire({ added: added.map(e => toLocalExtension(e)), removed: removed.map(e => toLocalExtension(e)) });
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
		updated: !!metadata.updated,
		pinned: !!metadata?.pinned,
	};
}

function getMetadata(options?: InstallOptions, existingExtension?: IExtension): Metadata {
	const metadata: Metadata = { ...((<IScannedExtension>existingExtension)?.metadata || {}) };
	metadata.isMachineScoped = options?.isMachineScoped || metadata.isMachineScoped;
	return metadata;
}

class InstallExtensionTask extends AbstractExtensionTask<ILocalExtension> implements IInstallExtensionTask {

	readonly identifier: IExtensionIdentifier;
	readonly source: URI | IGalleryExtension;

	private _profileLocation = this.options.profileLocation;
	get profileLocation() { return this._profileLocation; }

	private _operation = InstallOperation.Install;
	get operation() { return isUndefined(this.options.operation) ? this._operation : this.options.operation; }

	constructor(
		manifest: IExtensionManifest,
		private readonly extension: URI | IGalleryExtension,
		private readonly options: InstallExtensionTaskOptions,
		private readonly webExtensionsScannerService: IWebExtensionsScannerService,
		private readonly userDataProfilesService: IUserDataProfilesService,
	) {
		super();
		this.identifier = URI.isUri(extension) ? { id: getGalleryExtensionId(manifest.publisher, manifest.name) } : extension.identifier;
		this.source = extension;
	}

	protected async doRun(token: CancellationToken): Promise<ILocalExtension> {
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
			metadata.isApplicationScoped = this.options.isApplicationScoped || metadata.isApplicationScoped;
			metadata.preRelease = this.extension.properties.isPreReleaseVersion ||
				(isBoolean(this.options.installPreReleaseVersion)
					? this.options.installPreReleaseVersion /* Respect the passed flag */
					: metadata?.preRelease /* Respect the existing pre-release flag if it was set */);
		}
		metadata.pinned = this.options.installGivenVersion ? true : undefined;

		this._profileLocation = metadata.isApplicationScoped ? this.userDataProfilesService.defaultProfile.extensionsResource : this.options.profileLocation;
		const scannedExtension = URI.isUri(this.extension) ? await this.webExtensionsScannerService.addExtension(this.extension, metadata, this.profileLocation)
			: await this.webExtensionsScannerService.addExtensionFromGallery(this.extension, metadata, this.profileLocation);
		return toLocalExtension(scannedExtension);
	}
}

class UninstallExtensionTask extends AbstractExtensionTask<void> implements IUninstallExtensionTask {

	constructor(
		readonly extension: ILocalExtension,
		private readonly options: UninstallExtensionTaskOptions,
		private readonly webExtensionsScannerService: IWebExtensionsScannerService,
	) {
		super();
	}

	protected doRun(token: CancellationToken): Promise<void> {
		return this.webExtensionsScannerService.removeExtension(this.extension, this.options.profileLocation);
	}
}
