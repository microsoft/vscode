/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vs/base/common/cancellation';
import { getErrorMessage, isCancellationError } from 'vs/base/common/errors';
import { Schemas } from 'vs/base/common/network';
import { basename } from 'vs/base/common/resources';
import { gt } from 'vs/base/common/semver/semver';
import { URI } from 'vs/base/common/uri';
import { localize } from 'vs/nls';
import { EXTENSION_IDENTIFIER_REGEX, IExtensionGalleryService, IExtensionInfo, IExtensionManagementService, IGalleryExtension, ILocalExtension, InstallOptions, InstallExtensionInfo, InstallOperation } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions, getExtensionId, getGalleryExtensionId, getIdAndVersion } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { ExtensionType, EXTENSION_CATEGORIES, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { ILogger } from 'vs/platform/log/common/log';


const notFound = (id: string) => localize('notFound', "Extension '{0}' not found.", id);
const useId = localize('useId', "Make sure you use the full extension ID, including the publisher, e.g.: {0}", 'ms-dotnettools.csharp');

type InstallVSIXInfo = { vsix: URI; installOptions: InstallOptions };
type InstallGalleryExtensionInfo = { id: string; version?: string; installOptions: InstallOptions };

export class ExtensionManagementCLI {

	constructor(
		protected readonly logger: ILogger,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
	) { }

	protected get location(): string | undefined {
		return undefined;
	}

	public async listExtensions(showVersions: boolean, category?: string, profileLocation?: URI): Promise<void> {
		let extensions = await this.extensionManagementService.getInstalled(ExtensionType.User, profileLocation);
		const categories = EXTENSION_CATEGORIES.map(c => c.toLowerCase());
		if (category && category !== '') {
			if (categories.indexOf(category.toLowerCase()) < 0) {
				this.logger.info('Invalid category please enter a valid category. To list valid categories run --category without a category specified');
				return;
			}
			extensions = extensions.filter(e => {
				if (e.manifest.categories) {
					const lowerCaseCategories: string[] = e.manifest.categories.map(c => c.toLowerCase());
					return lowerCaseCategories.indexOf(category.toLowerCase()) > -1;
				}
				return false;
			});
		} else if (category === '') {
			this.logger.info('Possible Categories: ');
			categories.forEach(category => {
				this.logger.info(category);
			});
			return;
		}
		if (this.location) {
			this.logger.info(localize('listFromLocation', "Extensions installed on {0}:", this.location));
		}

		extensions = extensions.sort((e1, e2) => e1.identifier.id.localeCompare(e2.identifier.id));
		let lastId: string | undefined = undefined;
		for (const extension of extensions) {
			if (lastId !== extension.identifier.id) {
				lastId = extension.identifier.id;
				this.logger.info(showVersions ? `${lastId}@${extension.manifest.version}` : lastId);
			}
		}
	}

	public async installExtensions(extensions: (string | URI)[], builtinExtensions: (string | URI)[], installOptions: InstallOptions, force: boolean): Promise<void> {
		const failed: string[] = [];

		try {
			if (extensions.length) {
				this.logger.info(this.location ? localize('installingExtensionsOnLocation', "Installing extensions on {0}...", this.location) : localize('installingExtensions', "Installing extensions..."));
			}

			const installVSIXInfos: InstallVSIXInfo[] = [];
			const installExtensionInfos: InstallGalleryExtensionInfo[] = [];
			const addInstallExtensionInfo = (id: string, version: string | undefined, isBuiltin: boolean) => {
				installExtensionInfos.push({ id, version: version !== 'prerelease' ? version : undefined, installOptions: { ...installOptions, isBuiltin, installPreReleaseVersion: version === 'prerelease' || installOptions.installPreReleaseVersion } });
			};
			for (const extension of extensions) {
				if (extension instanceof URI) {
					installVSIXInfos.push({ vsix: extension, installOptions });
				} else {
					const [id, version] = getIdAndVersion(extension);
					addInstallExtensionInfo(id, version, false);
				}
			}
			for (const extension of builtinExtensions) {
				if (extension instanceof URI) {
					installVSIXInfos.push({ vsix: extension, installOptions: { ...installOptions, isBuiltin: true, donotIncludePackAndDependencies: true } });
				} else {
					const [id, version] = getIdAndVersion(extension);
					addInstallExtensionInfo(id, version, true);
				}
			}

			const installed = await this.extensionManagementService.getInstalled(undefined, installOptions.profileLocation);

			if (installVSIXInfos.length) {
				await Promise.all(installVSIXInfos.map(async ({ vsix, installOptions }) => {
					try {
						await this.installVSIX(vsix, installOptions, force, installed);
					} catch (err) {
						this.logger.error(err);
						failed.push(vsix.toString());
					}
				}));
			}

			if (installExtensionInfos.length) {
				const failedGalleryExtensions = await this.installGalleryExtensions(installExtensionInfos, installed, force);
				failed.push(...failedGalleryExtensions);
			}
		} catch (error) {
			this.logger.error(localize('error while installing extensions', "Error while installing extensions: {0}", getErrorMessage(error)));
			throw error;
		}

		if (failed.length) {
			throw new Error(localize('installation failed', "Failed Installing Extensions: {0}", failed.join(', ')));
		}
	}

	public async updateExtensions(profileLocation?: URI): Promise<void> {
		const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User, profileLocation);

		const installedExtensionsQuery: IExtensionInfo[] = [];
		for (const extension of installedExtensions) {
			if (!!extension.identifier.uuid) { // No need to check new version for an unpublished extension
				installedExtensionsQuery.push({ ...extension.identifier, preRelease: extension.preRelease });
			}
		}

		this.logger.trace(localize({ key: 'updateExtensionsQuery', comment: ['Placeholder is for the count of extensions'] }, "Fetching latest versions for {0} extensions", installedExtensionsQuery.length));
		const availableVersions = await this.extensionGalleryService.getExtensions(installedExtensionsQuery, { compatible: true }, CancellationToken.None);

		const extensionsToUpdate: InstallExtensionInfo[] = [];
		for (const newVersion of availableVersions) {
			for (const oldVersion of installedExtensions) {
				if (areSameExtensions(oldVersion.identifier, newVersion.identifier) && gt(newVersion.version, oldVersion.manifest.version)) {
					extensionsToUpdate.push({
						extension: newVersion,
						options: { operation: InstallOperation.Update, installPreReleaseVersion: oldVersion.preRelease, profileLocation, isApplicationScoped: oldVersion.isApplicationScoped }
					});
				}
			}
		}

		if (!extensionsToUpdate.length) {
			this.logger.info(localize('updateExtensionsNoExtensions', "No extension to update"));
			return;
		}

		this.logger.info(localize('updateExtensionsNewVersionsAvailable', "Updating extensions: {0}", extensionsToUpdate.map(ext => ext.extension.identifier.id).join(', ')));
		const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToUpdate);

		for (const extensionResult of installationResult) {
			if (extensionResult.error) {
				this.logger.error(localize('errorUpdatingExtension', "Error while updating extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
			} else {
				this.logger.info(localize('successUpdate', "Extension '{0}' v{1} was successfully updated.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
			}
		}
	}

	private async installGalleryExtensions(installExtensionInfos: InstallGalleryExtensionInfo[], installed: ILocalExtension[], force: boolean): Promise<string[]> {
		installExtensionInfos = installExtensionInfos.filter(({ id, version }) => {
			const installedExtension = installed.find(i => areSameExtensions(i.identifier, { id }));
			if (installedExtension) {
				if (!force && (!version || (version === 'prerelease' && installedExtension.preRelease))) {
					this.logger.info(localize('alreadyInstalled-checkAndUpdate', "Extension '{0}' v{1} is already installed. Use '--force' option to update to latest version or provide '@<version>' to install a specific version, for example: '{2}@1.2.3'.", id, installedExtension.manifest.version, id));
					return false;
				}
				if (version && installedExtension.manifest.version === version) {
					this.logger.info(localize('alreadyInstalled', "Extension '{0}' is already installed.", `${id}@${version}`));
					return false;
				}
			}
			return true;
		});

		if (!installExtensionInfos.length) {
			return [];
		}

		const failed: string[] = [];
		const extensionsToInstall: InstallExtensionInfo[] = [];
		const galleryExtensions = await this.getGalleryExtensions(installExtensionInfos);
		await Promise.all(installExtensionInfos.map(async ({ id, version, installOptions }) => {
			const gallery = galleryExtensions.get(id.toLowerCase());
			if (!gallery) {
				this.logger.error(`${notFound(version ? `${id}@${version}` : id)}\n${useId}`);
				failed.push(id);
				return;
			}
			try {
				const manifest = await this.extensionGalleryService.getManifest(gallery, CancellationToken.None);
				if (manifest && !this.validateExtensionKind(manifest)) {
					return;
				}
			} catch (err) {
				this.logger.error(err.message || err.stack || err);
				failed.push(id);
				return;
			}
			const installedExtension = installed.find(e => areSameExtensions(e.identifier, gallery.identifier));
			if (installedExtension) {
				if (gallery.version === installedExtension.manifest.version) {
					this.logger.info(localize('alreadyInstalled', "Extension '{0}' is already installed.", version ? `${id}@${version}` : id));
					return;
				}
				this.logger.info(localize('updateMessage', "Updating the extension '{0}' to the version {1}", id, gallery.version));
			}
			if (installOptions.isBuiltin) {
				this.logger.info(version ? localize('installing builtin with version', "Installing builtin extension '{0}' v{1}...", id, version) : localize('installing builtin ', "Installing builtin extension '{0}'...", id));
			} else {
				this.logger.info(version ? localize('installing with version', "Installing extension '{0}' v{1}...", id, version) : localize('installing', "Installing extension '{0}'...", id));
			}
			extensionsToInstall.push({
				extension: gallery,
				options: { ...installOptions, installGivenVersion: !!version, isApplicationScoped: installedExtension?.isApplicationScoped },
			});
		}));

		if (extensionsToInstall.length) {
			const installationResult = await this.extensionManagementService.installGalleryExtensions(extensionsToInstall);
			for (const extensionResult of installationResult) {
				if (extensionResult.error) {
					this.logger.error(localize('errorInstallingExtension', "Error while installing extension {0}: {1}", extensionResult.identifier.id, getErrorMessage(extensionResult.error)));
					failed.push(extensionResult.identifier.id);
				} else {
					this.logger.info(localize('successInstall', "Extension '{0}' v{1} was successfully installed.", extensionResult.identifier.id, extensionResult.local?.manifest.version));
				}
			}
		}

		return failed;
	}

	private async installVSIX(vsix: URI, installOptions: InstallOptions, force: boolean, installedExtensions: ILocalExtension[]): Promise<void> {

		const manifest = await this.extensionManagementService.getManifest(vsix);
		if (!manifest) {
			throw new Error('Invalid vsix');
		}

		const valid = await this.validateVSIX(manifest, force, installOptions.profileLocation, installedExtensions);
		if (valid) {
			try {
				await this.extensionManagementService.install(vsix, installOptions);
				this.logger.info(localize('successVsixInstall', "Extension '{0}' was successfully installed.", basename(vsix)));
			} catch (error) {
				if (isCancellationError(error)) {
					this.logger.info(localize('cancelVsixInstall', "Cancelled installing extension '{0}'.", basename(vsix)));
				} else {
					throw error;
				}
			}
		}
	}

	private async getGalleryExtensions(extensions: InstallGalleryExtensionInfo[]): Promise<Map<string, IGalleryExtension>> {
		const galleryExtensions = new Map<string, IGalleryExtension>();
		const preRelease = extensions.some(e => e.installOptions.installPreReleaseVersion);
		const targetPlatform = await this.extensionManagementService.getTargetPlatform();
		const extensionInfos: IExtensionInfo[] = [];
		for (const extension of extensions) {
			if (EXTENSION_IDENTIFIER_REGEX.test(extension.id)) {
				extensionInfos.push({ ...extension, preRelease });
			}
		}
		if (extensionInfos.length) {
			const result = await this.extensionGalleryService.getExtensions(extensionInfos, { targetPlatform }, CancellationToken.None);
			for (const extension of result) {
				galleryExtensions.set(extension.identifier.id.toLowerCase(), extension);
			}
		}
		return galleryExtensions;
	}

	protected validateExtensionKind(_manifest: IExtensionManifest): boolean {
		return true;
	}

	private async validateVSIX(manifest: IExtensionManifest, force: boolean, profileLocation: URI | undefined, installedExtensions: ILocalExtension[]): Promise<boolean> {
		if (!force) {
			const extensionIdentifier = { id: getGalleryExtensionId(manifest.publisher, manifest.name) };
			const newer = installedExtensions.find(local => areSameExtensions(extensionIdentifier, local.identifier) && gt(local.manifest.version, manifest.version));
			if (newer) {
				this.logger.info(localize('forceDowngrade', "A newer version of extension '{0}' v{1} is already installed. Use '--force' option to downgrade to older version.", newer.identifier.id, newer.manifest.version, manifest.version));
				return false;
			}
		}

		return this.validateExtensionKind(manifest);
	}

	public async uninstallExtensions(extensions: (string | URI)[], force: boolean, profileLocation?: URI): Promise<void> {
		const getId = async (extensionDescription: string | URI): Promise<string> => {
			if (extensionDescription instanceof URI) {
				const manifest = await this.extensionManagementService.getManifest(extensionDescription);
				return getExtensionId(manifest.publisher, manifest.name);
			}
			return extensionDescription;
		};

		const uninstalledExtensions: ILocalExtension[] = [];
		for (const extension of extensions) {
			const id = await getId(extension);
			const installed = await this.extensionManagementService.getInstalled(undefined, profileLocation);
			const extensionsToUninstall = installed.filter(e => areSameExtensions(e.identifier, { id }));
			if (!extensionsToUninstall.length) {
				throw new Error(`${this.notInstalled(id)}\n${useId}`);
			}
			if (extensionsToUninstall.some(e => e.type === ExtensionType.System)) {
				this.logger.info(localize('builtin', "Extension '{0}' is a Built-in extension and cannot be uninstalled", id));
				return;
			}
			if (!force && extensionsToUninstall.some(e => e.isBuiltin)) {
				this.logger.info(localize('forceUninstall', "Extension '{0}' is marked as a Built-in extension by user. Please use '--force' option to uninstall it.", id));
				return;
			}
			this.logger.info(localize('uninstalling', "Uninstalling {0}...", id));
			for (const extensionToUninstall of extensionsToUninstall) {
				await this.extensionManagementService.uninstall(extensionToUninstall, { profileLocation });
				uninstalledExtensions.push(extensionToUninstall);
			}

			if (this.location) {
				this.logger.info(localize('successUninstallFromLocation', "Extension '{0}' was successfully uninstalled from {1}!", id, this.location));
			} else {
				this.logger.info(localize('successUninstall', "Extension '{0}' was successfully uninstalled!", id));
			}

		}
	}

	public async locateExtension(extensions: string[]): Promise<void> {
		const installed = await this.extensionManagementService.getInstalled();
		extensions.forEach(e => {
			installed.forEach(i => {
				if (i.identifier.id === e) {
					if (i.location.scheme === Schemas.file) {
						this.logger.info(i.location.fsPath);
						return;
					}
				}
			});
		});
	}

	private notInstalled(id: string) {
		return this.location ? localize('notInstalleddOnLocation', "Extension '{0}' is not installed on {1}.", id, this.location) : localize('notInstalled', "Extension '{0}' is not installed.", id);
	}

}
