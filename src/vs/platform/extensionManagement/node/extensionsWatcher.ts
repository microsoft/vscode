/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { DidUninstallExtensionEvent, InstallExtensionResult, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { getIdAndVersion } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { IExtensionsScannerService } from 'vs/platform/extensionManagement/common/extensionsScannerService';
import { INativeServerExtensionManagementService } from 'vs/platform/extensionManagement/node/extensionManagementService';
import { ExtensionIdentifier, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { FileChangeType, IFileChange, IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfile, IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';

export class ExtensionsWatcher extends Disposable {

	private readonly _onDidChangeExtensionsByAnotherSource = this._register(new Emitter<{ added: InstallExtensionResult[]; removed: DidUninstallExtensionEvent[] }>());
	readonly onDidChangeExtensionsByAnotherSource = this._onDidChangeExtensionsByAnotherSource.event;

	private readonly profileExtensionsLocations = new Map<string, URI[]>;

	constructor(
		private readonly extensionManagementService: INativeServerExtensionManagementService,
		private readonly userDataProfilesService: IUserDataProfilesService,
		private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		private readonly extensionsScannerService: IExtensionsScannerService,
		private readonly uriIdentityService: IUriIdentityService,
		private readonly fileService: IFileService,
		private readonly logService: ILogService,
	) {
		super();
		this.initialize().then(() => this.registerListeners(), error => logService.error(error));
	}

	private async initialize(): Promise<void> {
		await this.extensionManagementService.migrateDefaultProfileExtensions();
		await this.onDidChangeProfiles(this.userDataProfilesService.profiles, []);
		await this.uninstallExtensionsNotInProfiles();
	}

	private registerListeners(): void {
		this._register(this.userDataProfilesService.onDidChangeProfiles(e => this.onDidChangeProfiles(e.added, e.removed)));
		this._register(this.extensionManagementService.onDidInstallExtensions(e => this.onDidInstallExtensions(e)));
		this._register(this.extensionManagementService.onDidUninstallExtension(e => this.onDidUninstallExtension(e)));
		this._register(this.fileService.watch(this.extensionsScannerService.userExtensionsLocation));
		this._register(Event.filter(this.fileService.onDidFilesChange, e => e.rawChanges.some(change => this.doesChangeAffects(change, this.extensionsScannerService.userExtensionsLocation)))(() => this.onDidChange()));
	}

	private doesChangeAffects(change: IFileChange, extensionsResource: URI): boolean {
		// Only interested in added/deleted changes
		if (change.type !== FileChangeType.ADDED && change.type !== FileChangeType.DELETED) {
			return false;
		}

		// Is not immediate child of extensions resource
		if (!this.uriIdentityService.extUri.isEqual(this.uriIdentityService.extUri.dirname(change.resource), extensionsResource)) {
			return false;
		}

		// .obsolete file changed
		if (this.uriIdentityService.extUri.isEqual(change.resource, this.uriIdentityService.extUri.joinPath(extensionsResource, '.obsolete'))) {
			return true;
		}

		// Ignore changes to files starting with `.`
		if (this.uriIdentityService.extUri.basename(change.resource).startsWith('.')) {
			return false;
		}

		return true;
	}

	private async onDidChange(): Promise<void> {
		const installed = await this.extensionManagementService.getAllUserInstalled();
		const added = installed.filter(e => {
			if (e.installedTimestamp !== undefined) {
				return false;
			}
			if (this.profileExtensionsLocations.has(this.getKey(e.identifier, e.manifest.version))) {
				return false;
			}
			this.logService.info('Detected extension installed from another source', e.identifier.id);
			return true;
		});
		if (added.length) {
			await this.extensionsProfileScannerService.addExtensionsToProfile(added.map(e => [e, undefined]), this.userDataProfilesService.defaultProfile.extensionsResource);
			this._onDidChangeExtensionsByAnotherSource.fire({
				added: added.map(local => ({
					identifier: local.identifier,
					operation: InstallOperation.None,
					profileLocation: this.userDataProfilesService.defaultProfile.extensionsResource,
					local
				})),
				removed: []
			});
		}
	}

	private async onDidChangeProfiles(added: readonly IUserDataProfile[], removed: readonly IUserDataProfile[]): Promise<void> {
		try {
			await Promise.all(removed.map(profile => this.removeExtensionsFromProfile(profile.extensionsResource)));
		} catch (error) {
			this.logService.error(error);
		}

		try {
			if (added.length) {
				await Promise.all(added.map(profile => this.populateExtensionsFromProfile(profile.extensionsResource)));
			}
		} catch (error) {
			this.logService.error(error);
		}
	}

	private async uninstallExtensionsNotInProfiles(): Promise<void> {
		const installed = await this.extensionManagementService.getAllUserInstalled();
		const toUninstall = installed.filter(installedExtension => !this.profileExtensionsLocations.has(this.getKey(installedExtension.identifier, installedExtension.manifest.version)));
		if (toUninstall.length) {
			await this.extensionManagementService.markAsUninstalled(...toUninstall);
		}
	}

	private async onDidInstallExtensions(installedExtensions: readonly InstallExtensionResult[]): Promise<void> {
		for (const { local, profileLocation } of installedExtensions) {
			if (!local || !profileLocation) {
				continue;
			}
			this.addExtensionWithKey(this.getKey(local.identifier, local.manifest.version), profileLocation);
		}
	}

	private async onDidUninstallExtension(e: DidUninstallExtensionEvent): Promise<void> {
		if (!e.profileLocation || !e.version) {
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
		const extensionsToRemove: { identifier: IExtensionIdentifier; version: string }[] = [];
		for (const key of [...this.profileExtensionsLocations.keys()]) {
			if (!this.removeExtensionWithKey(key, removedProfile)) {
				continue;
			}
			const extensionToRemove = this.fromKey(key);
			if (extensionToRemove) {
				extensionsToRemove.push(extensionToRemove);
			}
		}
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
			return true;
		}
		return false;
	}

	private async uninstallExtensions(extensionsToRemove: { identifier: IExtensionIdentifier; version: string }[]): Promise<void> {
		const installed = await this.extensionManagementService.getAllUserInstalled();
		const toUninstall = installed.filter(installedExtension => extensionsToRemove.some(e => this.getKey(installedExtension.identifier, installedExtension.manifest.version) === this.getKey(e.identifier, e.version)));
		if (toUninstall.length) {
			await this.extensionManagementService.markAsUninstalled(...toUninstall);
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
