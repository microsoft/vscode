/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalExtension, IGalleryExtension, InstallOptions, UninstallOptions, Metadata, InstallExtensionResult, InstallExtensionInfo, IProductVersion, UninstallExtensionInfo, DidUninstallExtensionEvent, DidUpdateExtensionMetadata, InstallExtensionEvent, UninstallExtensionEvent, IAllowedExtensionsService } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { URI } from '../../../../base/common/uri.js';
import { ExtensionIdentifier, ExtensionType, IExtensionIdentifier } from '../../../../platform/extensions/common/extensions.js';
import { ExtensionManagementChannelClient as BaseExtensionManagementChannelClient } from '../../../../platform/extensionManagement/common/extensionManagementIpc.js';
import { IChannel } from '../../../../base/parts/ipc/common/ipc.js';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from '../../userDataProfile/common/userDataProfile.js';
import { Emitter } from '../../../../base/common/event.js';
import { delta } from '../../../../base/common/arrays.js';
import { compare } from '../../../../base/common/strings.js';
import { IUriIdentityService } from '../../../../platform/uriIdentity/common/uriIdentity.js';
import { DidChangeProfileEvent, IProfileAwareExtensionManagementService } from './extensionManagement.js';
import { IProductService } from '../../../../platform/product/common/productService.js';

export abstract class ProfileAwareExtensionManagementChannelClient extends BaseExtensionManagementChannelClient implements IProfileAwareExtensionManagementService {

	private readonly _onDidChangeProfile = this._register(new Emitter<{ readonly added: ILocalExtension[]; readonly removed: ILocalExtension[] }>());
	readonly onDidChangeProfile = this._onDidChangeProfile.event;

	private readonly _onDidProfileAwareInstallExtensions = this._register(new Emitter<readonly InstallExtensionResult[]>());
	get onProfileAwareDidInstallExtensions() { return this._onDidProfileAwareInstallExtensions.event; }

	private readonly _onDidProfileAwareUninstallExtension = this._register(new Emitter<DidUninstallExtensionEvent>());
	get onProfileAwareDidUninstallExtension() { return this._onDidProfileAwareUninstallExtension.event; }

	private readonly _onDidProfileAwareUpdateExtensionMetadata = this._register(new Emitter<DidUpdateExtensionMetadata>());
	get onProfileAwareDidUpdateExtensionMetadata() { return this._onDidProfileAwareUpdateExtensionMetadata.event; }

	constructor(channel: IChannel,
		productService: IProductService,
		allowedExtensionsService: IAllowedExtensionsService,
		protected readonly userDataProfileService: IUserDataProfileService,
		protected readonly uriIdentityService: IUriIdentityService,
	) {
		super(channel, productService, allowedExtensionsService);
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => {
			if (!this.uriIdentityService.extUri.isEqual(e.previous.extensionsResource, e.profile.extensionsResource)) {
				e.join(this.whenProfileChanged(e));
			}
		}));
	}

	protected override async onInstallExtensionEvent(data: InstallExtensionEvent): Promise<void> {
		const result = this.filterEvent(data.profileLocation, data.applicationScoped ?? false);
		if (result instanceof Promise ? await result : result) {
			this._onInstallExtension.fire(data);
		}
	}

	protected override async onDidInstallExtensionsEvent(results: readonly InstallExtensionResult[]): Promise<void> {
		const filtered = [];
		for (const e of results) {
			const result = this.filterEvent(e.profileLocation, e.applicationScoped ?? e.local?.isApplicationScoped ?? false);
			if (result instanceof Promise ? await result : result) {
				filtered.push(e);
			}
		}
		if (filtered.length) {
			this._onDidInstallExtensions.fire(filtered);
		}
		this._onDidProfileAwareInstallExtensions.fire(results);
	}

	protected override async onUninstallExtensionEvent(data: UninstallExtensionEvent): Promise<void> {
		const result = this.filterEvent(data.profileLocation, data.applicationScoped ?? false);
		if (result instanceof Promise ? await result : result) {
			this._onUninstallExtension.fire(data);
		}
	}

	protected override async onDidUninstallExtensionEvent(data: DidUninstallExtensionEvent): Promise<void> {
		const result = this.filterEvent(data.profileLocation, data.applicationScoped ?? false);
		if (result instanceof Promise ? await result : result) {
			this._onDidUninstallExtension.fire(data);
		}
		this._onDidProfileAwareUninstallExtension.fire(data);
	}

	protected override async onDidUpdateExtensionMetadataEvent(data: DidUpdateExtensionMetadata): Promise<void> {
		const result = this.filterEvent(data.profileLocation, data.local?.isApplicationScoped ?? false);
		if (result instanceof Promise ? await result : result) {
			this._onDidUpdateExtensionMetadata.fire(data);
		}
		this._onDidProfileAwareUpdateExtensionMetadata.fire(data);
	}

	override async install(vsix: URI, installOptions?: InstallOptions): Promise<ILocalExtension> {
		installOptions = { ...installOptions, profileLocation: await this.getProfileLocation(installOptions?.profileLocation) };
		return super.install(vsix, installOptions);
	}

	override async installFromLocation(location: URI, profileLocation: URI): Promise<ILocalExtension> {
		return super.installFromLocation(location, await this.getProfileLocation(profileLocation));
	}

	override async installFromGallery(extension: IGalleryExtension, installOptions?: InstallOptions): Promise<ILocalExtension> {
		installOptions = { ...installOptions, profileLocation: await this.getProfileLocation(installOptions?.profileLocation) };
		return super.installFromGallery(extension, installOptions);
	}

	override async installGalleryExtensions(extensions: InstallExtensionInfo[]): Promise<InstallExtensionResult[]> {
		const infos: InstallExtensionInfo[] = [];
		for (const extension of extensions) {
			infos.push({ ...extension, options: { ...extension.options, profileLocation: await this.getProfileLocation(extension.options?.profileLocation) } });
		}
		return super.installGalleryExtensions(infos);
	}

	override async uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		options = { ...options, profileLocation: await this.getProfileLocation(options?.profileLocation) };
		return super.uninstall(extension, options);
	}

	override async uninstallExtensions(extensions: UninstallExtensionInfo[]): Promise<void> {
		const infos: UninstallExtensionInfo[] = [];
		for (const { extension, options } of extensions) {
			infos.push({ extension, options: { ...options, profileLocation: await this.getProfileLocation(options?.profileLocation) } });
		}
		return super.uninstallExtensions(infos);
	}

	override async getInstalled(type: ExtensionType | null = null, extensionsProfileResource?: URI, productVersion?: IProductVersion): Promise<ILocalExtension[]> {
		return super.getInstalled(type, await this.getProfileLocation(extensionsProfileResource), productVersion);
	}

	override async updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, extensionsProfileResource?: URI): Promise<ILocalExtension> {
		return super.updateMetadata(local, metadata, await this.getProfileLocation(extensionsProfileResource));
	}

	override async toggleAppliationScope(local: ILocalExtension, fromProfileLocation: URI): Promise<ILocalExtension> {
		return super.toggleAppliationScope(local, await this.getProfileLocation(fromProfileLocation));
	}

	override async copyExtensions(fromProfileLocation: URI, toProfileLocation: URI): Promise<void> {
		return super.copyExtensions(await this.getProfileLocation(fromProfileLocation), await this.getProfileLocation(toProfileLocation));
	}

	private async whenProfileChanged(e: DidChangeUserDataProfileEvent): Promise<void> {
		const previousProfileLocation = await this.getProfileLocation(e.previous.extensionsResource);
		const currentProfileLocation = await this.getProfileLocation(e.profile.extensionsResource);

		if (this.uriIdentityService.extUri.isEqual(previousProfileLocation, currentProfileLocation)) {
			return;
		}

		const eventData = await this.switchExtensionsProfile(previousProfileLocation, currentProfileLocation);
		this._onDidChangeProfile.fire(eventData);
	}

	protected async switchExtensionsProfile(previousProfileLocation: URI, currentProfileLocation: URI, preserveExtensions?: ExtensionIdentifier[]): Promise<DidChangeProfileEvent> {
		const oldExtensions = await this.getInstalled(ExtensionType.User, previousProfileLocation);
		const newExtensions = await this.getInstalled(ExtensionType.User, currentProfileLocation);
		if (preserveExtensions?.length) {
			const extensionsToInstall: IExtensionIdentifier[] = [];
			for (const extension of oldExtensions) {
				if (preserveExtensions.some(id => ExtensionIdentifier.equals(extension.identifier.id, id)) &&
					!newExtensions.some(e => ExtensionIdentifier.equals(e.identifier.id, extension.identifier.id))) {
					extensionsToInstall.push(extension.identifier);
				}
			}
			if (extensionsToInstall.length) {
				await this.installExtensionsFromProfile(extensionsToInstall, previousProfileLocation, currentProfileLocation);
			}
		}
		return delta(oldExtensions, newExtensions, (a, b) => compare(`${ExtensionIdentifier.toKey(a.identifier.id)}@${a.manifest.version}`, `${ExtensionIdentifier.toKey(b.identifier.id)}@${b.manifest.version}`));
	}

	protected getProfileLocation(profileLocation: URI): Promise<URI>;
	protected getProfileLocation(profileLocation?: URI): Promise<URI | undefined>;
	protected async getProfileLocation(profileLocation?: URI): Promise<URI | undefined> {
		return profileLocation ?? this.userDataProfileService.currentProfile.extensionsResource;
	}

	protected abstract filterEvent(profileLocation: URI, isApplicationScoped: boolean): boolean | Promise<boolean>;
}
