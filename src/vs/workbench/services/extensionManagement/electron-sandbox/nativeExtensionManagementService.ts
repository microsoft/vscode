/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IProfileAwareExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';
import { ExtensionManagementChannelClient } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { URI } from 'vs/base/common/uri';
import { IGalleryExtension, ILocalExtension, InstallOptions, InstallVSIXOptions, Metadata, UninstallOptions } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionIdentifier, ExtensionType } from 'vs/platform/extensions/common/extensions';
import { Emitter, Event } from 'vs/base/common/event';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { delta } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { EXTENSIONS_RESOURCE_NAME } from 'vs/platform/userDataProfile/common/userDataProfile';
import { joinPath } from 'vs/base/common/resources';
import { IExtensionsProfileScannerService } from 'vs/platform/extensionManagement/common/extensionsProfileScannerService';
import { Schemas } from 'vs/base/common/network';
import { ILogService } from 'vs/platform/log/common/log';
import { IDownloadService } from 'vs/platform/download/common/download';
import { IFileService } from 'vs/platform/files/common/files';
import { generateUuid } from 'vs/base/common/uuid';
import { INativeEnvironmentService } from 'vs/platform/environment/common/environment';

export class NativeExtensionManagementService extends ExtensionManagementChannelClient implements IProfileAwareExtensionManagementService {

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

	constructor(
		channel: IChannel,
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IExtensionsProfileScannerService private readonly extensionsProfileScannerService: IExtensionsProfileScannerService,
		@IUriIdentityService private readonly uriIdentityService: IUriIdentityService,
		@IFileService private readonly fileService: IFileService,
		@IDownloadService private readonly downloadService: IDownloadService,
		@INativeEnvironmentService private readonly nativeEnvironmentService: INativeEnvironmentService,
		@ILogService private readonly logService: ILogService,
	) {
		super(channel);
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.whenProfileChanged(e))));
	}

	private filterEvent({ profileLocation, applicationScoped }: { profileLocation?: URI; applicationScoped?: boolean }): boolean {
		return applicationScoped || this.uriIdentityService.extUri.isEqual(this.userDataProfileService.currentProfile.extensionsResource, profileLocation);
	}

	override async install(vsix: URI, options?: InstallVSIXOptions): Promise<ILocalExtension> {
		const { location, cleanup } = await this.downloadVsix(vsix);
		try {
			return await super.install(location, { ...options, profileLocation: this.userDataProfileService.currentProfile.extensionsResource });
		} finally {
			await cleanup();
		}
	}

	override installFromGallery(extension: IGalleryExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		return super.installFromGallery(extension, { ...installOptions, profileLocation: this.userDataProfileService.currentProfile.extensionsResource });
	}

	override uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		return super.uninstall(extension, { ...options, profileLocation: this.userDataProfileService.currentProfile.extensionsResource });
	}

	override getInstalled(type: ExtensionType | null = null): Promise<ILocalExtension[]> {
		return super.getInstalled(type, this.userDataProfileService.currentProfile.extensionsResource);
	}

	private async downloadVsix(vsix: URI): Promise<{ location: URI; cleanup: () => Promise<void> }> {
		if (vsix.scheme === Schemas.file) {
			return { location: vsix, async cleanup() { } };
		}
		this.logService.trace('Downloading extension from', vsix.toString());
		const location = joinPath(URI.file(this.nativeEnvironmentService.extensionsDownloadPath), generateUuid());
		await this.downloadService.download(vsix, location);
		this.logService.info('Downloaded extension to', location.toString());
		const cleanup = async () => {
			try {
				await this.fileService.del(location);
			} catch (error) {
				this.logService.error(error);
			}
		};
		return { location, cleanup };
	}

	private async whenProfileChanged(e: DidChangeUserDataProfileEvent): Promise<void> {
		const previousExtensionsResource = e.previous.extensionsResource ?? joinPath(e.previous.location, EXTENSIONS_RESOURCE_NAME);
		const oldExtensions = await super.getInstalled(ExtensionType.User, previousExtensionsResource);
		if (e.preserveData) {
			const extensions: [ILocalExtension, Metadata | undefined][] = await Promise.all(oldExtensions
				.filter(e => !e.isApplicationScoped) /* remove application scoped extensions */
				.map(async e => ([e, await this.getMetadata(e)])));
			await this.extensionsProfileScannerService.addExtensionsToProfile(extensions, e.profile.extensionsResource!);
		} else {
			const newExtensions = await this.getInstalled(ExtensionType.User);
			const { added, removed } = delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
			if (added.length || removed.length) {
				this._onDidChangeProfile.fire({ added, removed });
			}
		}
	}

}
