/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from '../../../base/common/async.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IStringDictionary } from '../../../base/common/collections.js';
import { getErrorMessage } from '../../../base/common/errors.js';
import { Event } from '../../../base/common/event.js';
import { toFormattedString } from '../../../base/common/jsonFormatter.js';
import { DisposableStore } from '../../../base/common/lifecycle.js';
import { compare } from '../../../base/common/strings.js';
import { URI } from '../../../base/common/uri.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentService } from '../../environment/common/environment.js';
import { GlobalExtensionEnablementService } from '../../extensionManagement/common/extensionEnablementService.js';
import { IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService, ILocalExtension, ExtensionManagementError, ExtensionManagementErrorCode, IGalleryExtension, DISABLED_EXTENSIONS_STORAGE_PATH, EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT, EXTENSION_INSTALL_SOURCE_CONTEXT, InstallExtensionInfo, ExtensionInstallSource, EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT } from '../../extensionManagement/common/extensionManagement.js';
import { areSameExtensions } from '../../extensionManagement/common/extensionManagementUtil.js';
import { ExtensionStorageService, IExtensionStorageService } from '../../extensionManagement/common/extensionStorage.js';
import { ExtensionType, IExtensionIdentifier, isApplicationScopedExtension } from '../../extensions/common/extensions.js';
import { IFileService } from '../../files/common/files.js';
import { IInstantiationService } from '../../instantiation/common/instantiation.js';
import { ServiceCollection } from '../../instantiation/common/serviceCollection.js';
import { ILogService } from '../../log/common/log.js';
import { IStorageService } from '../../storage/common/storage.js';
import { ITelemetryService } from '../../telemetry/common/telemetry.js';
import { IUriIdentityService } from '../../uriIdentity/common/uriIdentity.js';
import { IUserDataProfile, IUserDataProfilesService } from '../../userDataProfile/common/userDataProfile.js';
import { AbstractInitializer, AbstractSynchroniser, getSyncResourceLogLabel, IAcceptResult, IMergeResult, IResourcePreview } from './abstractSynchronizer.js';
import { IMergeResult as IExtensionMergeResult, merge } from './extensionsMerge.js';
import { IIgnoredExtensionsManagementService } from './ignoredExtensions.js';
import { Change, IRemoteUserData, ISyncData, ISyncExtension, IUserDataSyncLocalStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME, ILocalSyncExtension } from './userDataSync.js';
import { IUserDataProfileStorageService } from '../../userDataProfile/common/userDataProfileStorageService.js';

type IExtensionResourceMergeResult = IAcceptResult & IExtensionMergeResult;

interface IExtensionResourcePreview extends IResourcePreview {
	readonly localExtensions: ILocalSyncExtension[];
	readonly remoteExtensions: ISyncExtension[] | null;
	readonly skippedExtensions: ISyncExtension[];
	readonly builtinExtensions: IExtensionIdentifier[] | null;
	readonly previewResult: IExtensionResourceMergeResult;
}

interface ILastSyncUserData extends IRemoteUserData {
	skippedExtensions: ISyncExtension[] | undefined;
	builtinExtensions: IExtensionIdentifier[] | undefined;
}

async function parseAndMigrateExtensions(syncData: ISyncData, extensionManagementService: IExtensionManagementService): Promise<ISyncExtension[]> {
	const extensions = JSON.parse(syncData.content);
	if (syncData.version === 1
		|| syncData.version === 2
	) {
		const builtinExtensions = (await extensionManagementService.getInstalled(ExtensionType.System)).filter(e => e.isBuiltin);
		for (const extension of extensions) {
			// #region Migration from v1 (enabled -> disabled)
			if (syncData.version === 1) {
				// eslint-disable-next-line local/code-no-any-casts
				if ((<any>extension).enabled === false) {
					extension.disabled = true;
				}
				// eslint-disable-next-line local/code-no-any-casts
				delete (<any>extension).enabled;
			}
			// #endregion

			// #region Migration from v2 (set installed property on extension)
			if (syncData.version === 2) {
				if (builtinExtensions.every(installed => !areSameExtensions(installed.identifier, extension.identifier))) {
					extension.installed = true;
				}
			}
			// #endregion
		}
	}
	return extensions;
}

export function parseExtensions(syncData: ISyncData): ISyncExtension[] {
	return JSON.parse(syncData.content);
}

export function stringify(extensions: ISyncExtension[], format: boolean): string {
	extensions.sort((e1, e2) => {
		if (!e1.identifier.uuid && e2.identifier.uuid) {
			return -1;
		}
		if (e1.identifier.uuid && !e2.identifier.uuid) {
			return 1;
		}
		return compare(e1.identifier.id, e2.identifier.id);
	});
	return format ? toFormattedString(extensions, {}) : JSON.stringify(extensions);
}

export class ExtensionsSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	/*
		Version 3 - Introduce installed property to skip installing built in extensions
		protected readonly version: number = 3;
	*/
	/* Version 4: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
	/* Version 5: Introduce extension state */
	/* Version 6: Added isApplicationScoped property */
	protected readonly version: number = 6;

	private readonly previewResource: URI = this.extUri.joinPath(this.syncPreviewFolder, 'extensions.json');
	private readonly baseResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
	private readonly localResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
	private readonly remoteResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
	private readonly acceptedResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });

	private readonly localExtensionsProvider: LocalExtensionsProvider;

	constructor(
		// profileLocation changes for default profile
		profile: IUserDataProfile,
		collection: string | undefined,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLocalStoreService userDataSyncLocalStoreService: IUserDataSyncLocalStoreService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IIgnoredExtensionsManagementService private readonly ignoredExtensionsManagementService: IIgnoredExtensionsManagementService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionStorageService extensionStorageService: IExtensionStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
		@IUserDataProfileStorageService userDataProfileStorageService: IUserDataProfileStorageService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
	) {
		super({ syncResource: SyncResource.Extensions, profile }, collection, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncLocalStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
		this.localExtensionsProvider = this.instantiationService.createInstance(LocalExtensionsProvider);
		this._register(
			Event.any<any>(
				Event.filter(this.extensionManagementService.onDidInstallExtensions, (e => e.some(({ local }) => !!local))),
				Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error)),
				Event.filter(userDataProfileStorageService.onDidChange, e => e.valueChanges.some(({ profile, changes }) => this.syncResource.profile.id === profile.id && changes.some(change => change.key === DISABLED_EXTENSIONS_STORAGE_PATH))),
				extensionStorageService.onDidChangeExtensionStorageToSync)(() => this.triggerLocalChange()));
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null): Promise<IExtensionResourcePreview[]> {
		const remoteExtensions = remoteUserData.syncData ? await parseAndMigrateExtensions(remoteUserData.syncData, this.extensionManagementService) : null;
		const skippedExtensions = lastSyncUserData?.skippedExtensions ?? [];
		const builtinExtensions = lastSyncUserData?.builtinExtensions ?? null;
		const lastSyncExtensions = lastSyncUserData?.syncData ? await parseAndMigrateExtensions(lastSyncUserData.syncData, this.extensionManagementService) : null;

		const { localExtensions, ignoredExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);

		if (remoteExtensions) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote extensions with local extensions...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote extensions does not exist. Synchronizing extensions for the first time.`);
		}

		const { local, remote } = merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, ignoredExtensions, builtinExtensions);
		const previewResult: IExtensionResourceMergeResult = {
			local, remote,
			content: this.getPreviewContent(localExtensions, local.added, local.updated, local.removed),
			localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
			remoteChange: remote !== null ? Change.Modified : Change.None,
		};

		const localContent = this.stringify(localExtensions, false);
		return [{
			skippedExtensions,
			builtinExtensions,
			baseResource: this.baseResource,
			baseContent: lastSyncExtensions ? this.stringify(lastSyncExtensions, false) : localContent,
			localResource: this.localResource,
			localContent,
			localExtensions,
			remoteResource: this.remoteResource,
			remoteExtensions,
			remoteContent: remoteExtensions ? this.stringify(remoteExtensions, false) : null,
			previewResource: this.previewResource,
			previewResult,
			localChange: previewResult.localChange,
			remoteChange: previewResult.remoteChange,
			acceptedResource: this.acceptedResource,
		}];
	}

	protected async hasRemoteChanged(lastSyncUserData: ILastSyncUserData): Promise<boolean> {
		const lastSyncExtensions: ISyncExtension[] | null = lastSyncUserData.syncData ? await parseAndMigrateExtensions(lastSyncUserData.syncData, this.extensionManagementService) : null;
		const { localExtensions, ignoredExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
		const { remote } = merge(localExtensions, lastSyncExtensions, lastSyncExtensions, lastSyncUserData.skippedExtensions || [], ignoredExtensions, lastSyncUserData.builtinExtensions || []);
		return remote !== null;
	}

	private getPreviewContent(localExtensions: ISyncExtension[], added: ISyncExtension[], updated: ISyncExtension[], removed: IExtensionIdentifier[]): string {
		const preview: ISyncExtension[] = [...added, ...updated];

		const idsOrUUIDs: Set<string> = new Set<string>();
		const addIdentifier = (identifier: IExtensionIdentifier) => {
			idsOrUUIDs.add(identifier.id.toLowerCase());
			if (identifier.uuid) {
				idsOrUUIDs.add(identifier.uuid);
			}
		};
		preview.forEach(({ identifier }) => addIdentifier(identifier));
		removed.forEach(addIdentifier);

		for (const localExtension of localExtensions) {
			if (idsOrUUIDs.has(localExtension.identifier.id.toLowerCase()) || (localExtension.identifier.uuid && idsOrUUIDs.has(localExtension.identifier.uuid))) {
				// skip
				continue;
			}
			preview.push(localExtension);
		}

		return this.stringify(preview, false);
	}

	protected async getMergeResult(resourcePreview: IExtensionResourcePreview, token: CancellationToken): Promise<IMergeResult> {
		return { ...resourcePreview.previewResult, hasConflicts: false };
	}

	protected async getAcceptResult(resourcePreview: IExtensionResourcePreview, resource: URI, content: string | null | undefined, token: CancellationToken): Promise<IExtensionResourceMergeResult> {

		/* Accept local resource */
		if (this.extUri.isEqual(resource, this.localResource)) {
			return this.acceptLocal(resourcePreview);
		}

		/* Accept remote resource */
		if (this.extUri.isEqual(resource, this.remoteResource)) {
			return this.acceptRemote(resourcePreview);
		}

		/* Accept preview resource */
		if (this.extUri.isEqual(resource, this.previewResource)) {
			return resourcePreview.previewResult;
		}

		throw new Error(`Invalid Resource: ${resource.toString()}`);
	}

	private async acceptLocal(resourcePreview: IExtensionResourcePreview): Promise<IExtensionResourceMergeResult> {
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.syncResource.profile.extensionsResource);
		const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
		const remoteExtensions = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
		const mergeResult = merge(resourcePreview.localExtensions, remoteExtensions, remoteExtensions, resourcePreview.skippedExtensions, ignoredExtensions, resourcePreview.builtinExtensions);
		const { local, remote } = mergeResult;
		return {
			content: resourcePreview.localContent,
			local,
			remote,
			localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
			remoteChange: remote !== null ? Change.Modified : Change.None,
		};
	}

	private async acceptRemote(resourcePreview: IExtensionResourcePreview): Promise<IExtensionResourceMergeResult> {
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.syncResource.profile.extensionsResource);
		const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
		const remoteExtensions = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
		if (remoteExtensions !== null) {
			const mergeResult = merge(resourcePreview.localExtensions, remoteExtensions, resourcePreview.localExtensions, [], ignoredExtensions, resourcePreview.builtinExtensions);
			const { local, remote } = mergeResult;
			return {
				content: resourcePreview.remoteContent,
				local,
				remote,
				localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
				remoteChange: remote !== null ? Change.Modified : Change.None,
			};
		} else {
			return {
				content: resourcePreview.remoteContent,
				local: { added: [], removed: [], updated: [] },
				remote: null,
				localChange: Change.None,
				remoteChange: Change.None,
			};
		}
	}

	protected async applyResult(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, resourcePreviews: [IExtensionResourcePreview, IExtensionResourceMergeResult][], force: boolean): Promise<void> {
		let { skippedExtensions, builtinExtensions, localExtensions } = resourcePreviews[0][0];
		const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];

		if (localChange === Change.None && remoteChange === Change.None) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing extensions.`);
		}

		if (localChange !== Change.None) {
			await this.backupLocal(JSON.stringify(localExtensions));
			skippedExtensions = await this.localExtensionsProvider.updateLocalExtensions(local.added, local.removed, local.updated, skippedExtensions, this.syncResource.profile);
		}

		if (remote) {
			// update remote
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote extensions...`);
			const content = JSON.stringify(remote.all);
			remoteUserData = await this.updateRemoteUserData(content, force ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote extensions.${remote.added.length ? ` Added: ${JSON.stringify(remote.added.map(e => e.identifier.id))}.` : ''}${remote.updated.length ? ` Updated: ${JSON.stringify(remote.updated.map(e => e.identifier.id))}.` : ''}${remote.removed.length ? ` Removed: ${JSON.stringify(remote.removed.map(e => e.identifier.id))}.` : ''}`);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized extensions...`);
			builtinExtensions = this.computeBuiltinExtensions(localExtensions, builtinExtensions);
			await this.updateLastSyncUserData(remoteUserData, { skippedExtensions, builtinExtensions });
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized extensions.${skippedExtensions.length ? ` Skipped: ${JSON.stringify(skippedExtensions.map(e => e.identifier.id))}.` : ''}`);
		}
	}

	private computeBuiltinExtensions(localExtensions: ILocalSyncExtension[], previousBuiltinExtensions: IExtensionIdentifier[] | null): IExtensionIdentifier[] {
		const localExtensionsSet = new Set<string>();
		const builtinExtensions: IExtensionIdentifier[] = [];
		for (const localExtension of localExtensions) {
			localExtensionsSet.add(localExtension.identifier.id.toLowerCase());
			if (!localExtension.installed) {
				builtinExtensions.push(localExtension.identifier);
			}
		}
		if (previousBuiltinExtensions) {
			for (const builtinExtension of previousBuiltinExtensions) {
				// Add previous builtin extension if it does not exist in local extensions
				if (!localExtensionsSet.has(builtinExtension.id.toLowerCase())) {
					builtinExtensions.push(builtinExtension);
				}
			}
		}
		return builtinExtensions;
	}

	async resolveContent(uri: URI): Promise<string | null> {
		if (this.extUri.isEqual(this.remoteResource, uri)
			|| this.extUri.isEqual(this.baseResource, uri)
			|| this.extUri.isEqual(this.localResource, uri)
			|| this.extUri.isEqual(this.acceptedResource, uri)
		) {
			const content = await this.resolvePreviewContent(uri);
			return content ? this.stringify(JSON.parse(content), true) : content;
		}
		return null;
	}

	private stringify(extensions: ISyncExtension[], format: boolean): string {
		return stringify(extensions, format);
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const { localExtensions } = await this.localExtensionsProvider.getLocalExtensions(this.syncResource.profile);
			if (localExtensions.some(e => e.installed || e.disabled)) {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

}

export class LocalExtensionsProvider {

	constructor(
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IUserDataProfileStorageService private readonly userDataProfileStorageService: IUserDataProfileStorageService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IIgnoredExtensionsManagementService private readonly ignoredExtensionsManagementService: IIgnoredExtensionsManagementService,
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
	) { }

	async getLocalExtensions(profile: IUserDataProfile): Promise<{ localExtensions: ILocalSyncExtension[]; ignoredExtensions: string[] }> {
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);
		const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
		const localExtensions = await this.withProfileScopedServices(profile, async (extensionEnablementService, extensionStorageService) => {
			const disabledExtensions = extensionEnablementService.getDisabledExtensions();
			return installedExtensions
				.map(extension => {
					const { identifier, isBuiltin, manifest, preRelease, pinned, isApplicationScoped } = extension;
					const syncExntesion: ILocalSyncExtension = { identifier, preRelease, version: manifest.version, pinned: !!pinned };
					if (isApplicationScoped && !isApplicationScopedExtension(manifest)) {
						syncExntesion.isApplicationScoped = isApplicationScoped;
					}
					if (disabledExtensions.some(disabledExtension => areSameExtensions(disabledExtension, identifier))) {
						syncExntesion.disabled = true;
					}
					if (!isBuiltin) {
						syncExntesion.installed = true;
					}
					try {
						const keys = extensionStorageService.getKeysForSync({ id: identifier.id, version: manifest.version });
						if (keys) {
							const extensionStorageState = extensionStorageService.getExtensionState(extension, true) || {};
							syncExntesion.state = Object.keys(extensionStorageState).reduce((state: IStringDictionary<any>, key) => {
								if (keys.includes(key)) {
									state[key] = extensionStorageState[key];
								}
								return state;
							}, {});
						}
					} catch (error) {
						this.logService.info(`${getSyncResourceLogLabel(SyncResource.Extensions, profile)}: Error while parsing extension state`, getErrorMessage(error));
					}
					return syncExntesion;
				});
		});
		return { localExtensions, ignoredExtensions };
	}

	async updateLocalExtensions(added: ISyncExtension[], removed: IExtensionIdentifier[], updated: ISyncExtension[], skippedExtensions: ISyncExtension[], profile: IUserDataProfile): Promise<ISyncExtension[]> {
		const syncResourceLogLabel = getSyncResourceLogLabel(SyncResource.Extensions, profile);
		const extensionsToInstall: InstallExtensionInfo[] = [];
		const syncExtensionsToInstall = new Map<string, ISyncExtension>();
		const removeFromSkipped: IExtensionIdentifier[] = [];
		const addToSkipped: ISyncExtension[] = [];
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, profile.extensionsResource);

		// 1. Sync extensions state first so that the storage is flushed and updated in all opened windows
		if (added.length || updated.length) {
			await this.withProfileScopedServices(profile, async (extensionEnablementService, extensionStorageService) => {
				await Promises.settled([...added, ...updated].map(async e => {
					const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));

					// Builtin Extension Sync: Enablement & State
					if (installedExtension && installedExtension.isBuiltin) {
						if (e.state && installedExtension.manifest.version === e.version) {
							this.updateExtensionState(e.state, installedExtension, installedExtension.manifest.version, extensionStorageService);
						}
						const isDisabled = extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
						if (isDisabled !== !!e.disabled) {
							if (e.disabled) {
								this.logService.trace(`${syncResourceLogLabel}: Disabling extension...`, e.identifier.id);
								await extensionEnablementService.disableExtension(e.identifier);
								this.logService.info(`${syncResourceLogLabel}: Disabled extension`, e.identifier.id);
							} else {
								this.logService.trace(`${syncResourceLogLabel}: Enabling extension...`, e.identifier.id);
								await extensionEnablementService.enableExtension(e.identifier);
								this.logService.info(`${syncResourceLogLabel}: Enabled extension`, e.identifier.id);
							}
						}
						removeFromSkipped.push(e.identifier);
						return;
					}

					// User Extension Sync: Install/Update, Enablement & State
					const version = e.pinned ? e.version : undefined;
					const extension = (await this.extensionGalleryService.getExtensions([{ ...e.identifier, version, preRelease: version ? undefined : e.preRelease }], CancellationToken.None))[0];

					/* Update extension state only if
					 *	extension is installed and version is same as synced version or
					 *	extension is not installed and installable
					 */
					if (e.state &&
						(installedExtension ? installedExtension.manifest.version === e.version /* Installed and remote has same version */
							: !!extension /* Installable */)
					) {
						this.updateExtensionState(e.state, installedExtension || extension, installedExtension?.manifest.version, extensionStorageService);
					}

					if (extension) {
						try {
							const isDisabled = extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
							if (isDisabled !== !!e.disabled) {
								if (e.disabled) {
									this.logService.trace(`${syncResourceLogLabel}: Disabling extension...`, e.identifier.id, extension.version);
									await extensionEnablementService.disableExtension(extension.identifier);
									this.logService.info(`${syncResourceLogLabel}: Disabled extension`, e.identifier.id, extension.version);
								} else {
									this.logService.trace(`${syncResourceLogLabel}: Enabling extension...`, e.identifier.id, extension.version);
									await extensionEnablementService.enableExtension(extension.identifier);
									this.logService.info(`${syncResourceLogLabel}: Enabled extension`, e.identifier.id, extension.version);
								}
							}

							if (!installedExtension // Install if the extension does not exist
								|| installedExtension.preRelease !== e.preRelease // Install if the extension pre-release preference has changed
								|| installedExtension.pinned !== e.pinned  // Install if the extension pinned preference has changed
								|| (version && installedExtension.manifest.version !== version)  // Install if the extension version has changed
							) {
								if (await this.extensionManagementService.canInstall(extension) === true) {
									extensionsToInstall.push({
										extension, options: {
											isMachineScoped: false /* set isMachineScoped value to prevent install and sync dialog in web */,
											donotIncludePackAndDependencies: true,
											installGivenVersion: e.pinned && !!e.version,
											pinned: e.pinned,
											installPreReleaseVersion: e.preRelease,
											preRelease: e.preRelease,
											profileLocation: profile.extensionsResource,
											isApplicationScoped: e.isApplicationScoped,
											context: { [EXTENSION_INSTALL_SKIP_WALKTHROUGH_CONTEXT]: true, [EXTENSION_INSTALL_SOURCE_CONTEXT]: ExtensionInstallSource.SETTINGS_SYNC, [EXTENSION_INSTALL_SKIP_PUBLISHER_TRUST_CONTEXT]: true }
										}
									});
									syncExtensionsToInstall.set(extension.identifier.id.toLowerCase(), e);
								} else {
									this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because it cannot be installed.`, extension.displayName || extension.identifier.id);
									addToSkipped.push(e);
								}
							}
						} catch (error) {
							addToSkipped.push(e);
							this.logService.error(error);
							this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension`, extension.displayName || extension.identifier.id);
						}
					} else {
						addToSkipped.push(e);
						this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because the extension is not found.`, e.identifier.id);
					}
				}));
			});
		}

		// 2. Next uninstall the removed extensions
		if (removed.length) {
			const extensionsToRemove = installedExtensions.filter(({ identifier, isBuiltin }) => !isBuiltin && removed.some(r => areSameExtensions(identifier, r)));
			await Promises.settled(extensionsToRemove.map(async extensionToRemove => {
				this.logService.trace(`${syncResourceLogLabel}: Uninstalling local extension...`, extensionToRemove.identifier.id);
				await this.extensionManagementService.uninstall(extensionToRemove, { donotIncludePack: true, donotCheckDependents: true, profileLocation: profile.extensionsResource });
				this.logService.info(`${syncResourceLogLabel}: Uninstalled local extension.`, extensionToRemove.identifier.id);
				removeFromSkipped.push(extensionToRemove.identifier);
			}));
		}

		// 3. Install extensions at the end
		const results = await this.extensionManagementService.installGalleryExtensions(extensionsToInstall);
		for (const { identifier, local, error, source } of results) {
			const gallery = source as IGalleryExtension;
			if (local) {
				this.logService.info(`${syncResourceLogLabel}: Installed extension.`, identifier.id, gallery.version);
				removeFromSkipped.push(identifier);
			} else {
				const e = syncExtensionsToInstall.get(identifier.id.toLowerCase());
				if (e) {
					addToSkipped.push(e);
					this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension`, gallery.displayName || gallery.identifier.id);
				}
				if (error instanceof ExtensionManagementError && [ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatibleApi, ExtensionManagementErrorCode.IncompatibleTargetPlatform].includes(error.code)) {
					this.logService.info(`${syncResourceLogLabel}: Skipped synchronizing extension because the compatible extension is not found.`, gallery.displayName || gallery.identifier.id);
				} else if (error) {
					this.logService.error(error);
				}
			}
		}

		const newSkippedExtensions: ISyncExtension[] = [];
		for (const skippedExtension of skippedExtensions) {
			if (!removeFromSkipped.some(e => areSameExtensions(e, skippedExtension.identifier))) {
				newSkippedExtensions.push(skippedExtension);
			}
		}
		for (const skippedExtension of addToSkipped) {
			if (!newSkippedExtensions.some(e => areSameExtensions(e.identifier, skippedExtension.identifier))) {
				newSkippedExtensions.push(skippedExtension);
			}
		}
		return newSkippedExtensions;
	}

	private updateExtensionState(state: IStringDictionary<any>, extension: ILocalExtension | IGalleryExtension, version: string | undefined, extensionStorageService: IExtensionStorageService): void {
		const extensionState = extensionStorageService.getExtensionState(extension, true) || {};
		const keys = version ? extensionStorageService.getKeysForSync({ id: extension.identifier.id, version }) : undefined;
		if (keys) {
			keys.forEach(key => { extensionState[key] = state[key]; });
		} else {
			Object.keys(state).forEach(key => extensionState[key] = state[key]);
		}
		extensionStorageService.setExtensionState(extension, extensionState, true);
	}

	private async withProfileScopedServices<T>(profile: IUserDataProfile, fn: (extensionEnablementService: IGlobalExtensionEnablementService, extensionStorageService: IExtensionStorageService) => Promise<T>): Promise<T> {
		return this.userDataProfileStorageService.withProfileScopedStorageService(profile,
			async storageService => {
				const disposables = new DisposableStore();
				const instantiationService = disposables.add(this.instantiationService.createChild(new ServiceCollection([IStorageService, storageService])));
				const extensionEnablementService = disposables.add(instantiationService.createInstance(GlobalExtensionEnablementService));
				const extensionStorageService = disposables.add(instantiationService.createInstance(ExtensionStorageService));
				try {
					return await fn(extensionEnablementService, extensionStorageService);
				} finally {
					disposables.dispose();
				}
			});
	}

}

export interface IExtensionsInitializerPreviewResult {
	readonly installedExtensions: ILocalExtension[];
	readonly disabledExtensions: IExtensionIdentifier[];
	readonly newExtensions: (IExtensionIdentifier & { preRelease: boolean })[];
	readonly remoteExtensions: ISyncExtension[];
}

export abstract class AbstractExtensionsInitializer extends AbstractInitializer {

	constructor(
		@IExtensionManagementService protected readonly extensionManagementService: IExtensionManagementService,
		@IIgnoredExtensionsManagementService private readonly ignoredExtensionsManagementService: IIgnoredExtensionsManagementService,
		@IFileService fileService: IFileService,
		@IUserDataProfilesService userDataProfilesService: IUserDataProfilesService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@ILogService logService: ILogService,
		@IStorageService storageService: IStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(SyncResource.Extensions, userDataProfilesService, environmentService, logService, fileService, storageService, uriIdentityService);
	}

	protected async parseExtensions(remoteUserData: IRemoteUserData): Promise<ISyncExtension[] | null> {
		return remoteUserData.syncData ? await parseAndMigrateExtensions(remoteUserData.syncData, this.extensionManagementService) : null;
	}

	protected generatePreview(remoteExtensions: ISyncExtension[], localExtensions: ILocalExtension[]): IExtensionsInitializerPreviewResult {
		const installedExtensions: ILocalExtension[] = [];
		const newExtensions: (IExtensionIdentifier & { preRelease: boolean })[] = [];
		const disabledExtensions: IExtensionIdentifier[] = [];
		for (const extension of remoteExtensions) {
			if (this.ignoredExtensionsManagementService.hasToNeverSyncExtension(extension.identifier.id)) {
				// Skip extension ignored to sync
				continue;
			}

			const installedExtension = localExtensions.find(i => areSameExtensions(i.identifier, extension.identifier));
			if (installedExtension) {
				installedExtensions.push(installedExtension);
				if (extension.disabled) {
					disabledExtensions.push(extension.identifier);
				}
			} else if (extension.installed) {
				newExtensions.push({ ...extension.identifier, preRelease: !!extension.preRelease });
				if (extension.disabled) {
					disabledExtensions.push(extension.identifier);
				}
			}
		}
		return { installedExtensions, newExtensions, disabledExtensions, remoteExtensions };
	}

}
