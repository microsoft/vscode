/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ILocalExtension, IGalleryExtension, InstallOptions, InstallVSIXOptions, UninstallOptions, Metadata, DidUninstallExtensionEvent, InstallExtensionEvent, InstallExtensionResult, UninstallExtensionEvent } from 'vs/platform/extensionManagement/common/extensionManagement';
import { URI } from 'vs/base/common/uri';
import { ExtensionIdentifier, ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { ExtensionManagementChannelClient as BaseExtensionManagementChannelClient, ExtensionEventResult } from 'vs/platform/extensionManagement/common/extensionManagementIpc';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { DidChangeUserDataProfileEvent, IUserDataProfileService } from 'vs/workbench/services/userDataProfile/common/userDataProfile';
import { Emitter } from 'vs/base/common/event';
import { delta } from 'vs/base/common/arrays';
import { compare } from 'vs/base/common/strings';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { DidChangeProfileEvent, IProfileAwareExtensionManagementService } from 'vs/workbench/services/extensionManagement/common/extensionManagement';

export abstract class ProfileAwareExtensionManagementChannelClient extends BaseExtensionManagementChannelClient implements IProfileAwareExtensionManagementService {

	private readonly _onDidChangeProfile = this._register(new Emitter<{ readonly added: ILocalExtension[]; readonly removed: ILocalExtension[] }>());
	readonly onDidChangeProfile = this._onDidChangeProfile.event;

	constructor(channel: IChannel,
		protected readonly userDataProfileService: IUserDataProfileService,
		protected readonly uriIdentityService: IUriIdentityService,
	) {
		super(channel);
		this._register(userDataProfileService.onDidChangeCurrentProfile(e => e.join(this.whenProfileChanged(e))));
	}

	protected override fireEvent(event: Emitter<InstallExtensionEvent>, data: InstallExtensionEvent): Promise<void>;
	protected override fireEvent(event: Emitter<readonly InstallExtensionResult[]>, data: InstallExtensionResult[]): Promise<void>;
	protected override fireEvent(event: Emitter<UninstallExtensionEvent>, data: UninstallExtensionEvent): Promise<void>;
	protected override fireEvent(event: Emitter<DidUninstallExtensionEvent>, data: DidUninstallExtensionEvent): Promise<void>;
	protected override fireEvent(event: Emitter<ExtensionEventResult>, data: ExtensionEventResult): Promise<void>;
	protected override fireEvent(event: Emitter<ExtensionEventResult[]>, data: ExtensionEventResult[]): Promise<void>;
	protected override async fireEvent(arg0: any, arg1: any): Promise<void> {
		if (Array.isArray(arg1)) {
			const event = arg0 as Emitter<ExtensionEventResult[]>;
			const data = arg1 as ExtensionEventResult[];
			const filtered = [];
			for (const e of data) {
				const result = this.filterEvent(e);
				if (result instanceof Promise ? await result : result) {
					filtered.push(e);
				}
			}
			if (filtered.length) {
				event.fire(filtered);
			}
		} else {
			const event = arg0 as Emitter<ExtensionEventResult>;
			const data = arg1 as ExtensionEventResult;
			const result = this.filterEvent(data);
			if (result instanceof Promise ? await result : result) {
				event.fire(data);
			}
		}
	}

	override async install(vsix: URI, installOptions?: InstallVSIXOptions): Promise<ILocalExtension> {
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

	override async uninstall(extension: ILocalExtension, options?: UninstallOptions): Promise<void> {
		options = { ...options, profileLocation: await this.getProfileLocation(options?.profileLocation) };
		return super.uninstall(extension, options);
	}

	override async getInstalled(type: ExtensionType | null = null, extensionsProfileResource?: URI): Promise<ILocalExtension[]> {
		return super.getInstalled(type, await this.getProfileLocation(extensionsProfileResource));
	}

	override async updateMetadata(local: ILocalExtension, metadata: Partial<Metadata>, extensionsProfileResource?: URI): Promise<ILocalExtension> {
		return super.updateMetadata(local, metadata, await this.getProfileLocation(extensionsProfileResource));
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

	protected abstract filterEvent(e: ExtensionEventResult): boolean | Promise<boolean>;
}
