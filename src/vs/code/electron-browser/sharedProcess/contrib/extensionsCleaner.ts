/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { IExtensionGalleryService, IExtensionIdentifier, IGlobalExtensionEnablementService, ServerDidUninstallExtensionEvent, ServerInstallExtensionResult, UninstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { ExtensionStorageService, IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { migrateUnsupportedExtensions } from 'vs/platform/extensionManagement/common/unsupportedExtensionsMigration';
import { INativeServerExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { DidChangeProfilesEvent, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

const uninstalOptions: UninstallOptions = { versionOnly: true, donotIncludePack: true, donotCheckDependents: true };

export class ExtensionsCleaner extends Disposable {

	constructor(
		@INativeServerExtensionManagementService extensionManagementService: INativeServerExtensionManagementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IExtensionGalleryService extensionGalleryService: IExtensionGalleryService,
		@IExtensionStorageService extensionStorageService: IExtensionStorageService,
		@IGlobalExtensionEnablementService extensionEnablementService: IGlobalExtensionEnablementService,
		@IInstantiationService instantiationService: IInstantiationService,
		@IStorageService storageService: IStorageService,
		@ILogService logService: ILogService,
	) {
		super();

		extensionManagementService.removeUninstalledExtensions(this.userDataProfilesService.profiles.length > 1);
		migrateUnsupportedExtensions(extensionManagementService, extensionGalleryService, extensionStorageService, extensionEnablementService, logService);
		ExtensionStorageService.removeOutdatedExtensionVersions(extensionManagementService, storageService);
		this._register(instantiationService.createInstance(ProfileExtensionsCleaner));
	}

}

class ProfileExtensionsCleaner extends Disposable {

	private profileExtensionsLocations = new Map<string, URI[]>;
	private initPromise: Promise<boolean>;

	constructor(
		@INativeServerExtensionManagementService private readonly extensionManagementService: INativeServerExtensionManagementService,
		@IUserDataProfilesService private readonly userDataProfilesService: IUserDataProfilesService,
		@IExtensionsProfileScannerService private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		this.initPromise = this.initialize();
		this._register(this.userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e)));
		this._register(this.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
		this._register(this.extensionManagementService.onDidUninstallExtension(e => this.onDidUninstallExtension(e)));
	}

	private async initialize(): Promise<boolean> {
		this.profileExtensionsLocations.clear();
		if (this.userDataProfilesService.profiles.length === 1) {
			return true;
		}
		try {
			const installed = await this.extensionManagementService.getAllUserInstalled();
			await Promise.all(this.userDataProfilesService.profiles.map(profile => profile.extensionsResource ? this.populateExtensionsFromProfile(profile.extensionsResource) : Promise.resolve()));
			const toUninstall = installed.filter(installedExtension => !this.profileExtensionsLocations.has(this.getKey(installedExtension.identifier, installedExtension.manifest.version)));
			if (toUninstall.length) {
				await Promise.all(toUninstall.map(extension => this.extensionManagementService.uninstall(extension, uninstalOptions)));
			}
			return true;
		} catch (error) {
			this.logService.error('ExtensionsCleaner: Failed to initialize');
			this.logService.error(error);
			return false;
		}
	}

	private async onDidChangeProfiles({ added, removed, all }: DidChangeProfilesEvent): Promise<void> {
		if (!(await this.initPromise)) {
			return;
		}
		await Promise.all(added.map(profile => profile.extensionsResource ? this.populateExtensionsFromProfile(profile.extensionsResource) : Promise.resolve()));
		await Promise.all(removed.map(profile => profile.extensionsResource ? this.removeExtensionsFromProfile(profile.extensionsResource) : Promise.resolve()));
		if (all.length === 1) {
			this.initPromise = this.initialize();
		}
	}

	private async onDidInstallExtensions(installedExtensions: readonly ServerInstallExtensionResult[]): Promise<void> {
		if (!(await this.initPromise)) {
			return;
		}
		for (const { local, profileLocation } of installedExtensions) {
			if (!local || !profileLocation) {
				continue;
			}
			this.addExtensionWithKey(this.getKey(local.identifier, local.manifest.version), profileLocation);
		}
	}

	private async onDidUninstallExtension(e: ServerDidUninstallExtensionEvent): Promise<void> {
		if (!e.profileLocation || !e.version) {
			return;
		}
		if (!(await this.initPromise)) {
			return;
		}
		if (this.removeExtensionWithKey(this.getKey(e.identifier, e.version), e.profileLocation)) {
			await this.uninstallExtensions([{ identifier: e.identifier, version: e.version }]);
		}
	}

	private async populateExtensionsFromProfile(extensionsProfileLocation: URI): Promise<void> {
		const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(extensionsProfileLocation);
		for (const extension of extensions) {
			this.addExtensionWithKey(this.getKey(extension.identifier, extension.version), extensionsProfileLocation);
		}
	}

	private async removeExtensionsFromProfile(removedProfile: URI): Promise<void> {
		const profileExtensions = await this.extensionsProfileScannerService.scanProfileExtensions(removedProfile);
		const extensionsToRemove = profileExtensions.filter(profileExtension => this.removeExtensionWithKey(this.getKey(profileExtension.identifier, profileExtension.version), removedProfile));
		if (extensionsToRemove.length) {
			await this.uninstallExtensions(extensionsToRemove);
		}
	}

	private addExtensionWithKey(key: string, extensionsProfileLocation: URI): void {
		let locations = this.profileExtensionsLocations.get(key);
		if (!locations) {
			locations = [];
			this.profileExtensionsLocations.set(key, locations);
		}
		locations.push(extensionsProfileLocation);
	}

	private removeExtensionWithKey(key: string, profileLocation: URI): boolean {
		const profiles = this.profileExtensionsLocations.get(key);
		if (profiles) {
			const index = profiles.findIndex(profile => this.uriIdentityService.extUri.isEqual(profile, profileLocation));
			if (index > -1) {
				profiles.splice(index, 1);
			}
		}
		if (!profiles?.length) {
			this.profileExtensionsLocations.delete(key);
		}
		return !profiles?.length;
	}

	private async uninstallExtensions(extensionsToRemove: { identifier: IExtensionIdentifier; version: string }[]): Promise<void> {
		const installed = await this.extensionManagementService.getAllUserInstalled();
		const toUninstall = installed.filter(installedExtension => extensionsToRemove.some(e => this.getKey(installedExtension.identifier, installedExtension.manifest.version) === this.getKey(e.identifier, e.version)));
		if (toUninstall.length) {
			await Promise.all(toUninstall.map(extension => this.extensionManagementService.uninstall(extension, uninstalOptions)));
		}
	}

	private getKey(identifier: IExtensionIdentifier, version: string): string {
		return `${ExtensionIdentifier.toKey(identifier.id)}@${version}`;
	}

}
