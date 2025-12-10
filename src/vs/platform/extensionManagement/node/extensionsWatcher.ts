/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getErrorMessage } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { combinedDisposable, Disposable, DisposableMap } from '../../../base/common/lifecycle.js';
import { ResourceSet } from '../../../base/common/map.js';
import { URI } from '../../../base/common/uri.js';
import { getIdAndVersion } from '../common/extensionManagementUtil.js';
import { DidAddProfileExtensionsEvent, DidRemoveProfileExtensionsEvent, IExtensionsProfileScannerService, ProfileExtensionsEvent } from '../common/extensionsProfileScannerService.js';
import { IExtensionsScannerService } from '../common/extensionsScannerService.js';
import { INativeServerExtensionManagementService } from './extensionManagementService.js';
import { ExtensionIdentifier, IExtension, IExtensionIdentifier } from '../../extensions/common/extensions.js';
import { FileChangesEvent, FileChangeType, IFileService } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';

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
		this.initialize().then(null, error => logService.error('Error while initializing Extensions Watcher', getErrorMessage(error)));
	}

	private async initialize(): Promise<void> {
		await this.extensionsScannerService.initializeDefaultProfileExtensions();
		await this.onDidChangeProfiles(this.userDataProfilesService.profiles);
		this.registerListeners();
		await this.deleteExtensionsNotInProfiles();
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
		const extensionsToDelete: IExtension[] = [];
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
								extensionsToDelete.push(result);
							} else {
								this.logService.info('Extension not found at the location', extension.location.toString());
							}
						}, error => this.logService.error(error)));
				}
			}
		}
		try {
			await Promise.all(promises);
			if (extensionsToDelete.length) {
				await this.deleteExtensionsNotInProfiles(extensionsToDelete);
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

	private async deleteExtensionsNotInProfiles(toDelete?: IExtension[]): Promise<void> {
		if (!toDelete) {
			const installed = await this.extensionManagementService.scanAllUserInstalledExtensions();
			toDelete = installed.filter(installedExtension => !this.allExtensions.has(this.getKey(installedExtension.identifier, installedExtension.manifest.version)));
		}
		if (toDelete.length) {
			await this.extensionManagementService.deleteExtensions(...toDelete);
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
