/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { GlobalExtensionEnablementService } from '../../../../platform/extensionManagement/common/extensionEnablementService.js';
import { EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, IExtensionGalleryService, IExtensionIdentifier, IExtensionManagementService, IGlobalExtensionEnablementService, ILocalExtension, InstallExtensionInfo } from '../../../../platform/extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../../../platform/extensionManagement/common/extensionManagementUtil.js';
import { ExtensionType } from '../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService } from '../../../../platform/storage/common/storage.js';
import { IUserDataProfile, ProfileResourceType } from '../../../../platform/userDataProfile/common/userDataProfile.js';
import { IUserDataProfileStorageService } from '../../../../platform/userDataProfile/common/userDataProfileStorageService.js';
import { ITreeItemCheckboxState, TreeItemCollapsibleState } from '../../../common/views.js';
import { IWorkbenchExtensionManagementService } from '../../extensionManagement/common/extensionManagement.js';
import { IProfileResource, IProfileResourceChildTreeItem, IProfileResourceInitializer, IProfileResourceTreeItem, IUserDataProfileService } from '../common/userDataProfile.js';

interface IProfileExtension {
	identifier: IExtensionIdentifier;
	displayName?: string;
	preRelease?: boolean;
	applicationScoped?: boolean;
	disabled?: boolean;
	version?: string;
}

export class ExtensionsResourceInitializer implements IProfileResourceInitializer {

	constructor(
		@IUserDataProfileService private readonly userDataProfileService: IUserDataProfileService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IGlobalExtensionEnablementService private readonly extensionEnablementService: IGlobalExtensionEnablementService,
		@ILogService private readonly logService: ILogService,
	) {
	}

	async initialize(content: string): Promise<void> {
		const profileExtensions: IProfileExtension[] = JSON.parse(content);
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.userDataProfileService.currentProfile.extensionsResource);
		const extensionsToEnableOrDisable: { extension: IExtensionIdentifier; enable: boolean }[] = [];
		const extensionsToInstall: IProfileExtension[] = [];
		for (const e of profileExtensions) {
			const isDisabled = this.extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
			const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));
			if (!installedExtension || (!installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease)) {
				extensionsToInstall.push(e);
			}
			if (isDisabled !== !!e.disabled) {
				extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
			}
		}
		const extensionsToUninstall: ILocalExtension[] = installedExtensions.filter(extension => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)));
		for (const { extension, enable } of extensionsToEnableOrDisable) {
			if (enable) {
				this.logService.trace(`Initializing Profile: Enabling extension...`, extension.id);
				await this.extensionEnablementService.enableExtension(extension);
				this.logService.info(`Initializing Profile: Enabled extension...`, extension.id);
			} else {
				this.logService.trace(`Initializing Profile: Disabling extension...`, extension.id);
				await this.extensionEnablementService.disableExtension(extension);
				this.logService.info(`Initializing Profile: Disabled extension...`, extension.id);
			}
		}
		if (extensionsToInstall.length) {
			const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map(e => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? undefined : e.preRelease })), CancellationToken.None);
			await Promise.all(extensionsToInstall.map(async e => {
				const extension = galleryExtensions.find(galleryExtension => areSameExtensions(galleryExtension.identifier, e.identifier));
				if (!extension) {
					return;
				}
				if (await this.extensionManagementService.canInstall(extension) === true) {
					this.logService.trace(`Initializing Profile: Installing extension...`, extension.identifier.id, extension.version);
					await this.extensionManagementService.installFromGallery(extension, {
						isMachineScoped: false,/* set isMachineScoped value to prevent install and sync dialog in web */
						donotIncludePackAndDependencies: true,
						installGivenVersion: !!e.version,
						installPreReleaseVersion: e.preRelease,
						profileLocation: this.userDataProfileService.currentProfile.extensionsResource,
						context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true, [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
					});
					this.logService.info(`Initializing Profile: Installed extension...`, extension.identifier.id, extension.version);
				} else {
					this.logService.info(`Initializing Profile: Skipped installing extension because it cannot be installed.`, extension.identifier.id);
				}
			}));
		}
		if (extensionsToUninstall.length) {
			await Promise.all(extensionsToUninstall.map(e => this.extensionManagementService.uninstall(e)));
		}
	}
}

export class ExtensionsResource implements IProfileResource {

	constructor(
		@IWorkbenchExtensionManagementService private readonly extensionManagementService: IWorkbenchExtensionManagementService,
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

	async apply(content: string, profile: IUserDataProfile, progress?: (message: string) => void, token?: CancellationToken): Promise<void> {
		return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
			const profileExtensions: IProfileExtension[] = await this.getProfileExtensions(content);
			const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);
			const extensionsToEnableOrDisable: { extension: IExtensionIdentifier; enable: boolean }[] = [];
			const extensionsToInstall: IProfileExtension[] = [];
			for (const e of profileExtensions) {
				const isDisabled = extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
				const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));
				if (!installedExtension || (!installedExtension.isBuiltin && installedExtension.preRelease !== e.preRelease)) {
					extensionsToInstall.push(e);
				}
				if (isDisabled !== !!e.disabled) {
					extensionsToEnableOrDisable.push({ extension: e.identifier, enable: !e.disabled });
				}
			}
			const extensionsToUninstall: ILocalExtension[] = installedExtensions.filter(extension => !extension.isBuiltin && !profileExtensions.some(({ identifier }) => areSameExtensions(identifier, extension.identifier)) && !extension.isApplicationScoped);
			for (const { extension, enable } of extensionsToEnableOrDisable) {
				if (enable) {
					this.logService.trace(`Importing Profile (${profile.name}): Enabling extension...`, extension.id);
					await extensionEnablementService.enableExtension(extension);
					this.logService.info(`Importing Profile (${profile.name}): Enabled extension...`, extension.id);
				} else {
					this.logService.trace(`Importing Profile (${profile.name}): Disabling extension...`, extension.id);
					await extensionEnablementService.disableExtension(extension);
					this.logService.info(`Importing Profile (${profile.name}): Disabled extension...`, extension.id);
				}
			}
			if (extensionsToInstall.length) {
				this.logService.info(`Importing Profile (${profile.name}): Started installing extensions.`);
				const galleryExtensions = await this.extensionGalleryService.getExtensions(extensionsToInstall.map(e => ({ ...e.identifier, version: e.version, hasPreRelease: e.version ? undefined : e.preRelease })), CancellationToken.None);
				const installExtensionInfos: InstallExtensionInfo[] = [];
				await Promise.all(extensionsToInstall.map(async e => {
					const extension = galleryExtensions.find(galleryExtension => areSameExtensions(galleryExtension.identifier, e.identifier));
					if (!extension) {
						return;
					}
					if (await this.extensionManagementService.canInstall(extension) === true) {
						installExtensionInfos.push({
							extension,
							options: {
								isMachineScoped: false,/* set isMachineScoped value to prevent install and sync dialog in web */
								donotIncludePackAndDependencies: true,
								installGivenVersion: !!e.version,
								installPreReleaseVersion: e.preRelease,
								profileLocation: profile.extensionsResource,
								context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true }
							}
						});
					} else {
						this.logService.info(`Importing Profile (${profile.name}): Skipped installing extension because it cannot be installed.`, extension.identifier.id);
					}
				}));
				if (installExtensionInfos.length) {
					if (token) {
						await this.extensionManagementService.requestPublisherTrust(installExtensionInfos);
						for (const installExtensionInfo of installExtensionInfos) {
							if (token.isCancellationRequested) {
								return;
							}
							progress?.(localize('installingExtension', "Installing extension {0}...", installExtensionInfo.extension.displayName ?? installExtensionInfo.extension.identifier.id));
							await this.extensionManagementService.installFromGallery(installExtensionInfo.extension, installExtensionInfo.options);
						}
					} else {
						await this.extensionManagementService.installGalleryExtensions(installExtensionInfos);
					}
				}
				this.logService.info(`Importing Profile (${profile.name}): Finished installing extensions.`);
			}
			if (extensionsToUninstall.length) {
				await Promise.all(extensionsToUninstall.map(e => this.extensionManagementService.uninstall(e)));
			}
		});
	}

	async copy(from: IUserDataProfile, to: IUserDataProfile, disableExtensions: boolean): Promise<void> {
		await this.extensionManagementService.copyExtensions(from.extensionsResource, to.extensionsResource);
		const extensionsToDisable = await this.withProfileScopedServices(from, async (extensionEnablementService) =>
			extensionEnablementService.getDisabledExtensions());
		if (disableExtensions) {
			const extensions = await this.extensionManagementService.getInstalled(ExtensionType.User, to.extensionsResource);
			for (const extension of extensions) {
				extensionsToDisable.push(extension.identifier);
			}
		}
		await this.withProfileScopedServices(to, async (extensionEnablementService) =>
			Promise.all(extensionsToDisable.map(extension => extensionEnablementService.disableExtension(extension))));
	}

	async getLocalExtensions(profile: IUserDataProfile): Promise<IProfileExtension[]> {
		return this.withProfileScopedServices(profile, async (extensionEnablementService) => {
			const result = new Map<string, IProfileExtension & { displayName?: string }>();
			const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);
			const disabledExtensions = extensionEnablementService.getDisabledExtensions();
			for (const extension of installedExtensions) {
				const { identifier, preRelease } = extension;
				const disabled = disabledExtensions.some(disabledExtension => areSameExtensions(disabledExtension, identifier));
				if (extension.isBuiltin && !disabled) {
					// skip enabled builtin extensions
					continue;
				}
				if (!extension.isBuiltin) {
					if (!extension.identifier.uuid) {
						// skip user extensions without uuid
						continue;
					}
				}
				const existing = result.get(identifier.id.toLowerCase());
				if (existing?.disabled) {
					// Remove the duplicate disabled extension
					result.delete(identifier.id.toLowerCase());
				}
				const profileExtension: IProfileExtension = { identifier, displayName: extension.manifest.displayName };
				if (disabled) {
					profileExtension.disabled = true;
				}
				if (!extension.isBuiltin && extension.pinned) {
					profileExtension.version = extension.manifest.version;
				}
				if (!profileExtension.version && preRelease) {
					profileExtension.preRelease = true;
				}
				profileExtension.applicationScoped = extension.isApplicationScoped;
				result.set(profileExtension.identifier.id.toLowerCase(), profileExtension);
			}
			return [...result.values()];
		});
	}

	async getProfileExtensions(content: string): Promise<IProfileExtension[]> {
		return JSON.parse(content);
	}

	private async withProfileScopedServices<T>(profile: IUserDataProfile, fn: (extensionEnablementService: IGlobalExtensionEnablementService) => Promise<T>): Promise<T> {
		return this.userDataProfileStorageService.withProfileScopedStorageService(profile,
			async storageService => {
				const disposables = new DisposableStore();
				const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])));
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
	contextValue = ProfileResourceType.Extensions;
	checkbox: ITreeItemCheckboxState | undefined;

	protected readonly excludedExtensions = new Set<string>();

	async getChildren(): Promise<Array<IProfileResourceChildTreeItem & IProfileExtension>> {
		const extensions = (await this.getExtensions()).sort((a, b) => (a.displayName ?? a.identifier.id).localeCompare(b.displayName ?? b.identifier.id));
		const that = this;
		return extensions.map<IProfileResourceChildTreeItem & IProfileExtension>(e => ({
			...e,
			handle: e.identifier.id.toLowerCase(),
			parent: this,
			label: { label: e.displayName || e.identifier.id },
			description: e.applicationScoped ? localize('all profiles and disabled', "All Profiles") : undefined,
			collapsibleState: TreeItemCollapsibleState.None,
			checkbox: that.checkbox ? {
				get isChecked() { return !that.excludedExtensions.has(e.identifier.id.toLowerCase()); },
				set isChecked(value: boolean) {
					if (value) {
						that.excludedExtensions.delete(e.identifier.id.toLowerCase());
					} else {
						that.excludedExtensions.add(e.identifier.id.toLowerCase());
					}
				},
				tooltip: localize('exclude', "Select {0} Extension", e.displayName || e.identifier.id),
				accessibilityInformation: {
					label: localize('exclude', "Select {0} Extension", e.displayName || e.identifier.id),
				}
			} : undefined,
			themeIcon: Codicon.extensions,
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

	abstract isFromDefaultProfile(): boolean;
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

	isFromDefaultProfile(): boolean {
		return !this.profile.isDefault && !!this.profile.useDefaultFlags?.extensions;
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

	isFromDefaultProfile(): boolean {
		return false;
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
