/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { DisposableStore } from 'vs/base/common/lifecycle';
import { localize } from 'vs/nls';
import { GlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionEnablementService';
import { IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService, IGlobalExtensionEnablementService, ILocalExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType } from 'vs/platform/extensions/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { ServiceCollection } from 'vs/platform/instantiation/common/serviceCollection';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { IUserDataProfile } from 'vs/platform/userDataProfile/common/userDataProfile';
import { IUserDataProfileStorageService } from 'vs/platform/userDataProfile/common/userDataProfileStorageService';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from 'vs/workbench/common/views';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceTreeItem, ProfileResourceType } from 'vs/workbench/services/userDataProfile/common/userDataProfile';

interface IProfileExtension {
	identifier: IExtensionIdentifier;
	displayName?: string;
	preRelease?: boolean;
	disabled?: boolean;
}

export class ExtensionsResource implements IProfileResource {

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async getContent(profile: IUserDataProfile, exclude?: string[]): Promise<string> {
		const extensions = await this.getLocalExtensions(profile);
		return this.toContent(extensions, exclude);
	}

	toContent(extensions: IProfileExtension[], exclude?: string[]): string {
		return JSON.stringify(exclude?.length ? extensions.filter(e => !exclude.includes(e.identifier.id.toLowerCase())) : extensions);
	}

	async apply(content: string, profile: IUserDataProfile): Promise<void> {
		return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
			const profileExtensions: IProfileExtension[] = await this.getProfileExtensions(content);
			const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);
			const extensionsToEnableOrDisable: { extension: ILocalExtension; enable: boolean }[] = [];
			const extensionsToInstall: IProfileExtension[] = [];
			for (const e of profileExtensions) {
				const isDisabled = extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
				const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));
				if (!installedExtension || installedExtension.preRelease !== e.preRelease) {
					extensionsToInstall.push(e);
				}
				if (installedExtension && isDisabled !== !!e.disabled) {
					extensionsToEnableOrDisable.push({ extension: installedExtension, enable: !!e.disabled });
				}
			}
			const extensionsToUninstall: ILocalExtension[] = installedExtensions.filter(extension => extension.type === ExtensionType.User && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)));
			for (const { extension, enable } of extensionsToEnableOrDisable) {
				if (enable) {
					await extensionEnablementService.enableExtension(extension.identifier);
				} else {
					await extensionEnablementService.disableExtension(extension.identifier);
				}
			}
			if (extensionsToInstall.length) {
				const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map(e => ({ ...e.identifier, hasPreRelease: e.preRelease })), CancellationToken.None);
				await Promise.all(extensionsToInstall.map(async e => {
					const extension = galleryExtensions.find(galleryExtension => areSameExtensions(galleryExtension.identifier, e.identifier));
					if (!extension) {
						return;
					}
					if (await this.extensionManagementService.canInstall(extension)) {
						await this.extensionManagementService.installFromGallery(extension, { isMachineScoped: false, donotIncludePackAndDependencies: true, installPreReleaseVersion: e.preRelease, profileLocation: profile.extensionsResource } /* set isMachineScoped value to prevent install and sync dialog in web */);
					} else {
						this.logService.info(`Profile: Skipped installing extension because it cannot be installed.`, extension.displayName || extension.identifier.id);
					}
				}));
			}
			if (extensionsToUninstall.length) {
				await Promise.all(extensionsToUninstall.map(e => this.extensionManagementService.uninstall(e)));
			}
		});
	}

	async getLocalExtensions(profile: IUserDataProfile): Promise<IProfileExtension[]> {
		return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
			const result: Array<IProfileExtension & { displayName?: string }> = [];
			const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);
			const disabledExtensions = extensionEnablementService.getDisabledExtensions();
			for (const extension of installedExtensions) {
				const { identifier, preRelease } = extension;
				const disabled = disabledExtensions.some(disabledExtension => areSameExtensions(disabledExtension, identifier));
				if (extension.type === ExtensionType.System && !disabled) {
					// skip enabled system extensions
					continue;
				}
				if (extension.type === ExtensionType.User) {
					if (!extension.identifier.uuid) {
						// skip user extensions without uuid
						continue;
					}
					if (disabled && !extension.isBuiltin) {
						// skip user disabled extensions
						continue;
					}
				}
				const profileExtension: IProfileExtension = { identifier, displayName: extension.manifest.displayName };
				if (disabled) {
					profileExtension.disabled = true;
				}
				if (preRelease) {
					profileExtension.preRelease = true;
				}
				result.push(profileExtension);
			}
			return result;
		});
	}

	async getProfileExtensions(content: string): Promise<IProfileExtension[]> {
		return JSON.parse(content);
	}

	private async withProfileScopedServices<T>(profile: IUserDataProfile, fn: (extensionEnablementService: IGlobalExtensionEnablementService) => Promise<T>): Promise<T> {
		return this.userDataProfileStorageService.withProfileScopedStorageService(profile,
			async storageService => {
				const disposables = new DisposableStore();
				const instantiationService = this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService]));
				const extensionEnablementService = disposables.add(instantiationService.createInstance(GlobalExtensionEnablementService));
				try {
					return await fn(extensionEnablementService);
				} finally {
					disposables.dispose();
				}
			});
	}
}

export abstract class ExtensionsResourceTreeItem implements IProfileResourceTreeItem {

	readonly type = ProfileResourceType.Extensions;
	readonly handle = ProfileResourceType.Extensions;
	readonly label = { label: localize('extensions', "Extensions") };
	readonly collapsibleState = TreeItemCollapsibleState.Expanded;
	checkbox: ITreeItemCheckboxState = { isChecked: true };

	protected readonly excludedExtensions = new Set<string>();

	async getChildren(): Promise<IProfileResourceChildTreeItem[]> {
		const extensions = await this.getExtensions();
		const that = this;
		return extensions.map<IProfileResourceChildTreeItem>(e => ({
			handle: e.identifier.id.toLowerCase(),
			parent: this,
			label: { label: e.displayName || e.identifier.id },
			description: e.disabled ? localize('disabled', "Disabled") : undefined,
			collapsibleState: TreeItemCollapsibleState.None,
			checkbox: {
				get isChecked() { return !that.excludedExtensions.has(e.identifier.id.toLowerCase()); },
				set isChecked(value: boolean) {
					if (value) {
						that.excludedExtensions.delete(e.identifier.id.toLowerCase());
					} else {
						that.excludedExtensions.add(e.identifier.id.toLowerCase());
					}
				}
			},
			command: {
				id: 'extension.open',
				title: '',
				arguments: [e.identifier.id, undefined, true]
			}
		}));
	}

	async hasContent(): Promise<boolean> {
		const extensions = await this.getExtensions();
		return extensions.length > 0;
	}

	abstract getContent(): Promise<string>;
	protected abstract getExtensions(): Promise<IProfileExtension[]>;

}

export class ExtensionsResourceExportTreeItem extends ExtensionsResourceTreeItem {

	constructor(
		private readonly profile: IUserDataProfile,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	protected getExtensions(): Promise<IProfileExtension[]> {
		return this.instantiationService.createInstance(ExtensionsResource).getLocalExtensions(this.profile);
	}

	async getContent(): Promise<string> {
		return this.instantiationService.createInstance(ExtensionsResource).getContent(this.profile, [...this.excludedExtensions.values()]);
	}

}

export class ExtensionsResourceImportTreeItem extends ExtensionsResourceTreeItem {

	constructor(
		private readonly content: string,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super();
	}

	protected getExtensions(): Promise<IProfileExtension[]> {
		return this.instantiationService.createInstance(ExtensionsResource).getProfileExtensions(this.content);
	}

	async getContent(): Promise<string> {
		const extensionsResource = this.instantiationService.createInstance(ExtensionsResource);
		const extensions = await extensionsResource.getProfileExtensions(this.content);
		return extensionsResource.toContent(extensions, [...this.excludedExtensions.values()]);
	}

}
