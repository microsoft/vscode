/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from 'vs/base/common/event';
import { combinedDisposable, Disposable, DisposableMap } from 'vs/base/common/lifecycle';
import { ResourceSet } from 'vs/base/common/map';
import { URI } from 'vs/base/common/uri';
import { getIdAndVersion } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { DidAddProfileExtensionsEvent, DidRemoveProfileExtensionsEvent, IExtensionsProfileScannerService, ProfileExtensionsEvent } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { INativeServerExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionIdentifier, IExtension, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { FileChangesEvent, FileChangeType, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export interface DidChangeProfileExtensionsEvent {
	readonly added?: { readonly extensions: readonly IExtensionIdentifier[]; readonly profileLocation: URI };
	readonly removed?: { readonly extensions: readonly IExtensionIdentifier[]; readonly profileLocation: URI };
}

export class ExtensionsWatcher extends Disposable {

	private readonly _onDidChangeExtensionsByAnotherSource = this._register(new Emitter<DidChangeProfileExtensionsEvent>());
	readonly onDidChangeExtensionsByAnotherSource = this._onDidChangeExtensionsByAnotherSource.event;

	private readonly allExtensions = new Map<string, ResourceSet>;
	private readonly extensionsProfileWatchDisposables = this._register(new DisposableMap<string>());

	constructor(
		private readonly extensionManagementService: INativeServerExtensionManagementService,
		private readonly extensionsScannerService: IExtensionsScannerService,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
	) {
		super();
		this.initialize().then(null, error => logService.error(error));
	}

	private async initialize(): Promise<void> {
		await this.extensionsScannerService.initializeDefaultProfileExtensions();
		await this.onDidChangeProfiles(this.userDataProfilesService.profiles);
		this.registerListeners();
		await this.uninstallExtensionsNotInProfiles();
	}

	private registerListeners(): void {
		this._register(this.userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e.added)));
		this._register(this.extensionsProfileScannerService.onAddExtensions(e => this.onAddExtensions(e)));
		this._register(this.extensionsProfileScannerService.onDidAddExtensions(e => this.onDidAddExtensions(e)));
		this._register(this.extensionsProfileScannerService.onRemoveExtensions(e => this.onRemoveExtensions(e)));
		this._register(this.extensionsProfileScannerService.onDidRemoveExtensions(e => this.onDidRemoveExtensions(e)));
		this._register(this.fileService.onDidFilesChange(e => this.onDidFilesChange(e)));
	}

	private async onDidChangeProfiles(added: readonly IUserDataProfile[]): Promise<void> {
		try {
			if (added.length) {
				await Promise.all(added.map(profile => {
					this.extensionsProfileWatchDisposables.set(profile.id, combinedDisposable(
						this.fileService.watch(this.uriIdentityService.extUri.dirname(profile.extensionsResource)),
						// Also listen to the resource incase the resource is a symlink - https://github.com/microsoft/vscode/issues/118134
						this.fileService.watch(profile.extensionsResource)
					));
					return this.populateExtensionsFromProfile(profile.extensionsResource);
				}));
			}
		} catch (error) {
			this.logService.error(error);
			throw error;
		}
	}

	private async onAddExtensions(e: ProfileExtensionsEvent): Promise<void> {
		for (const extension of e.extensions) {
			this.addExtensionWithKey(this.getKey(extension.identifier, extension.version), e.profileLocation);
		}
	}

	private async onDidAddExtensions(e: DidAddProfileExtensionsEvent): Promise<void> {
		for (const extension of e.extensions) {
			const key = this.getKey(extension.identifier, extension.version);
			if (e.error) {
				this.removeExtensionWithKey(key, e.profileLocation);
			} else {
				this.addExtensionWithKey(key, e.profileLocation);
			}
		}
	}

	private async onRemoveExtensions(e: ProfileExtensionsEvent): Promise<void> {
		for (const extension of e.extensions) {
			this.removeExtensionWithKey(this.getKey(extension.identifier, extension.version), e.profileLocation);
		}
	}

	private async onDidRemoveExtensions(e: DidRemoveProfileExtensionsEvent): Promise<void> {
		const extensionsToUninstall: IExtension[] = [];
		const promises: Promise<void>[] = [];
		for (const extension of e.extensions) {
			const key = this.getKey(extension.identifier, extension.version);
			if (e.error) {
				this.addExtensionWithKey(key, e.profileLocation);
			} else {
				this.removeExtensionWithKey(key, e.profileLocation);
				if (!this.allExtensions.has(key)) {
					this.logService.debug('Extension is removed from all profiles', extension.identifier.id, extension.version);
					promises.push(this.extensionManagementService.scanInstalledExtensionAtLocation(extension.location)
						.then(result => {
							if (result) {
								extensionsToUninstall.push(result);
							} else {
								this.logService.info('Extension not found at the location', extension.location.toString());
							}
						}, error => this.logService.error(error)));
				}
			}
		}
		try {
			await Promise.all(promises);
			if (extensionsToUninstall.length) {
				await this.uninstallExtensionsNotInProfiles(extensionsToUninstall);
			}
		} catch (error) {
			this.logService.error(error);
		}
	}

	private onDidFilesChange(e: FileChangesEvent): void {
		for (const profile of this.userDataProfilesService.profiles) {
			if (e.contains(profile.extensionsResource, FileChangeType.UPDATED, FileChangeType.ADDED)) {
				this.onDidExtensionsProfileChange(profile.extensionsResource);
			}
		}
	}

	private async onDidExtensionsProfileChange(profileLocation: URI): Promise<void> {
		const added: IExtensionIdentifier[] = [], removed: IExtensionIdentifier[] = [];
		const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(profileLocation);
		const extensionKeys = new Set<string>();
		const cached = new Set<string>();
		for (const [key, profiles] of this.allExtensions) {
			if (profiles.has(profileLocation)) {
				cached.add(key);
			}
		}
		for (const extension of extensions) {
			const key = this.getKey(extension.identifier, extension.version);
			extensionKeys.add(key);
			if (!cached.has(key)) {
				added.push(extension.identifier);
				this.addExtensionWithKey(key, profileLocation);
			}
		}
		for (const key of cached) {
			if (!extensionKeys.has(key)) {
				const extension = this.fromKey(key);
				if (extension) {
					removed.push(extension.identifier);
					this.removeExtensionWithKey(key, profileLocation);
				}
			}
		}
		if (added.length || removed.length) {
			this._onDidChangeExtensionsByAnotherSource.fire({ added: added.length ? { extensions: added, profileLocation } : undefined, removed: removed.length ? { extensions: removed, profileLocation } : undefined });
		}
	}

	private async populateExtensionsFromProfile(extensionsProfileLocation: URI): Promise<void> {
		const extensions = await this.extensionsProfileScannerService.scanProfileExtensions(extensionsProfileLocation);
		for (const extension of extensions) {
			this.addExtensionWithKey(this.getKey(extension.identifier, extension.version), extensionsProfileLocation);
		}
	}

	private async uninstallExtensionsNotInProfiles(toUninstall?: IExtension[]): Promise<void> {
		if (!toUninstall) {
			const installed = await this.extensionManagementService.scanAllUserInstalledExtensions();
			toUninstall = installed.filter(installedExtension => !this.allExtensions.has(this.getKey(installedExtension.identifier, installedExtension.manifest.version)));
		}
		if (toUninstall.length) {
			await this.extensionManagementService.markAsUninstalled(...toUninstall);
		}
	}

	private addExtensionWithKey(key: string, extensionsProfileLocation: URI): void {
		let profiles = this.allExtensions.get(key);
		if (!profiles) {
			this.allExtensions.set(key, profiles = new ResourceSet((uri) => this.uriIdentityService.extUri.getComparisonKey(uri)));
		}
		profiles.add(extensionsProfileLocation);
	}

	private removeExtensionWithKey(key: string, profileLocation: URI): void {
		const profiles = this.allExtensions.get(key);
		if (profiles) {
			profiles.delete(profileLocation);
		}
		if (!profiles?.size) {
			this.allExtensions.delete(key);
		}
	}

	private getKey(identifier: IExtensionIdentifier, version: string): string {
		return `${ExtensionIdentifier.toKey(identifier.id)}@${version}`;
	}

	private fromKey(key: string): { identifier: IExtensionIdentifier; version: string } | undefined {
		const [id, version] = getIdAndVersion(key);
		return version ? { identifier: { id }, version } : undefined;
	}

}
