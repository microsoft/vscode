/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises } from 'vs/base/common/async';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IStringDictionary } from 'vs/base/common/collections';
import { getErrorMessage } from 'vs/base/common/errors';
import { Event } from 'vs/base/common/event';
import { toFormattedString } from 'vs/base/common/jsonFormatter';
import { compare } from 'vs/base/common/strings';
import { URI } from 'vs/base/common/uri';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionGalleryService, IExtensionManagementService, IGlobalExtensionEnablementService, ILocalExtension, ExtensionManagementError, ExtensionManagementErrorCode, IGalleryExtension } from 'vs/platform/extensionManagement/common/extensionManagement';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IExtensionStorageService } from 'vs/platform/extensionManagement/common/extensionStorage';
import { ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { IFileService } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IStorageService } from 'vs/platform/storage/common/storage';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { IUriIdentityService } from 'vs/platform/uriIdentity/common/uriIdentity';
import { IUserDataProfilesService } from 'vs/platform/userDataProfile/common/userDataProfile';
import { AbstractInitializer, AbstractSynchroniser, IAcceptResult, IMergeResult, IResourcePreview } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { IMergeResult as IExtensionMergeResult, merge } from 'vs/platform/userDataSync/common/extensionsMerge';
import { IIgnoredExtensionsManagementService } from 'vs/platform/userDataSync/common/ignoredExtensions';
import { Change, IRemoteUserData, ISyncData, ISyncExtension, ISyncExtensionWithVersion, ISyncResourceHandle, IUserDataSyncBackupStoreService, IUserDataSynchroniser, IUserDataSyncLogService, IUserDataSyncEnablementService, IUserDataSyncStoreService, SyncResource, USER_DATA_SYNC_SCHEME } from 'vs/platform/userDataSync/common/userDataSync';

type IExtensionResourceMergeResult = IAcceptResult & IExtensionMergeResult;

interface IExtensionResourcePreview extends IResourcePreview {
	readonly localExtensions: ISyncExtensionWithVersion[];
	readonly skippedExtensions: ISyncExtension[];
	readonly previewResult: IExtensionResourceMergeResult;
}

interface ILastSyncUserData extends IRemoteUserData {
	skippedExtensions: ISyncExtension[] | undefined;
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
				if ((<any>extension).enabled === false) {
					extension.disabled = true;
				}
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

export class ExtensionsSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	private static readonly EXTENSIONS_DATA_URI = URI.from({ scheme: USER_DATA_SYNC_SCHEME, authority: 'extensions', path: `/extensions.json` });

	/*
		Version 3 - Introduce installed property to skip installing built in extensions
		protected readonly version: number = 3;
	*/
	/* Version 4: Change settings from `sync.${setting}` to `settingsSync.{setting}` */
	/* Version 5: Introduce extension state */
	protected readonly version: number = 5;

	private readonly previewResource: URI = this.extUri.joinPath(this.syncPreviewFolder, 'extensions.json');
	private readonly baseResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'base' });
	private readonly localResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'local' });
	private readonly remoteResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'remote' });
	private readonly acceptedResource: URI = this.previewResource.with({ scheme: USER_DATA_SYNC_SCHEME, authority: 'accepted' });

	constructor(
		private readonly profileLocation: URI | undefined,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IGlobalExtensionEnablementService private readonly extensionEnablementService: IGlobalExtensionEnablementService,
		@IIgnoredExtensionsManagementService private readonly ignoredExtensionsManagementService: IIgnoredExtensionsManagementService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
		@IExtensionStorageService private readonly extensionStorageService: IExtensionStorageService,
		@IUriIdentityService uriIdentityService: IUriIdentityService
	) {
		super(SyncResource.Extensions, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService, uriIdentityService);
		this._register(
			Event.any<any>(
				Event.filter(this.extensionManagementService.onDidInstallExtensions, (e => e.some(({ local }) => !!local))),
				Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error)),
				this.extensionEnablementService.onDidChangeEnablement,
				this.extensionStorageService.onDidChangeExtensionStorageToSync)(() => this.triggerLocalChange()));
	}

	protected async generateSyncPreview(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null): Promise<IExtensionResourcePreview[]> {
		const remoteExtensions: ISyncExtension[] | null = remoteUserData.syncData ? await parseAndMigrateExtensions(remoteUserData.syncData, this.extensionManagementService) : null;
		const skippedExtensions: ISyncExtension[] = lastSyncUserData?.skippedExtensions || [];
		const lastSyncExtensions: ISyncExtension[] | null = lastSyncUserData?.syncData ? await parseAndMigrateExtensions(lastSyncUserData.syncData, this.extensionManagementService) : null;

		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.profileLocation);
		const localExtensions = this.getLocalExtensions(installedExtensions);
		const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);

		if (remoteExtensions) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote extensions with local extensions...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote extensions does not exist. Synchronizing extensions for the first time.`);
		}

		const { local, remote } = merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, ignoredExtensions);
		const previewResult: IExtensionResourceMergeResult = {
			local, remote,
			content: this.getPreviewContent(localExtensions, local.added, local.updated, local.removed),
			localChange: local.added.length > 0 || local.removed.length > 0 || local.updated.length > 0 ? Change.Modified : Change.None,
			remoteChange: remote !== null ? Change.Modified : Change.None,
		};

		const localContent = this.stringify(localExtensions, false);
		return [{
			skippedExtensions,
			baseResource: this.baseResource,
			baseContent: lastSyncExtensions ? this.stringify(lastSyncExtensions, false) : localContent,
			localResource: this.localResource,
			localContent,
			localExtensions,
			remoteResource: this.remoteResource,
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
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.profileLocation);
		const localExtensions = this.getLocalExtensions(installedExtensions);
		const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
		const { remote } = merge(localExtensions, lastSyncExtensions, lastSyncExtensions, lastSyncUserData.skippedExtensions || [], ignoredExtensions);
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
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.profileLocation);
		const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
		const mergeResult = merge(resourcePreview.localExtensions, null, null, resourcePreview.skippedExtensions, ignoredExtensions);
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
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.profileLocation);
		const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
		const remoteExtensions = resourcePreview.remoteContent ? JSON.parse(resourcePreview.remoteContent) : null;
		if (remoteExtensions !== null) {
			const mergeResult = merge(resourcePreview.localExtensions, remoteExtensions, resourcePreview.localExtensions, [], ignoredExtensions);
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
		let { skippedExtensions, localExtensions } = resourcePreviews[0][0];
		const { local, remote, localChange, remoteChange } = resourcePreviews[0][1];

		if (localChange === Change.None && remoteChange === Change.None) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing extensions.`);
		}

		if (localChange !== Change.None) {
			await this.backupLocal(JSON.stringify(localExtensions));
			skippedExtensions = await this.updateLocalExtensions(local.added, local.removed, local.updated, skippedExtensions);
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
			await this.updateLastSyncUserData(remoteUserData, { skippedExtensions });
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized extensions.${skippedExtensions.length ? ` Skipped: ${JSON.stringify(skippedExtensions.map(e => e.identifier.id))}.` : ''}`);
		}
	}

	async getAssociatedResources({ uri }: ISyncResourceHandle): Promise<{ resource: URI; comparableResource: URI }[]> {
		return [{ resource: this.extUri.joinPath(uri, 'extensions.json'), comparableResource: ExtensionsSynchroniser.EXTENSIONS_DATA_URI }];
	}

	override async resolveContent(uri: URI): Promise<string | null> {
		if (this.extUri.isEqual(uri, ExtensionsSynchroniser.EXTENSIONS_DATA_URI)) {
			const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.profileLocation);
			const ignoredExtensions = this.ignoredExtensionsManagementService.getIgnoredExtensions(installedExtensions);
			const localExtensions = this.getLocalExtensions(installedExtensions).filter(e => !ignoredExtensions.some(id => areSameExtensions({ id }, e.identifier)));
			return this.stringify(localExtensions, true);
		}

		if (this.extUri.isEqual(this.remoteResource, uri)
			|| this.extUri.isEqual(this.baseResource, uri)
			|| this.extUri.isEqual(this.localResource, uri)
			|| this.extUri.isEqual(this.acceptedResource, uri)
		) {
			const content = await this.resolvePreviewContent(uri);
			return content ? this.stringify(JSON.parse(content), true) : content;
		}

		let content = await super.resolveContent(uri);
		if (content) {
			return content;
		}

		content = await super.resolveContent(this.extUri.dirname(uri));
		if (content) {
			const syncData = this.parseSyncData(content);
			if (syncData) {
				switch (this.extUri.basename(uri)) {
					case 'extensions.json':
						return this.stringify(this.parseExtensions(syncData), true);
				}
			}
		}

		return null;
	}

	private stringify(extensions: ISyncExtension[], format: boolean): string {
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

	async hasLocalData(): Promise<boolean> {
		try {
			const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.profileLocation);
			const localExtensions = this.getLocalExtensions(installedExtensions);
			if (localExtensions.some(e => e.installed || e.disabled)) {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

	private async updateLocalExtensions(added: ISyncExtension[], removed: IExtensionIdentifier[], updated: ISyncExtension[], skippedExtensions: ISyncExtension[]): Promise<ISyncExtension[]> {
		const removeFromSkipped: IExtensionIdentifier[] = [];
		const addToSkipped: ISyncExtension[] = [];
		const installedExtensions = await this.extensionManagementService.getInstalled(undefined, this.profileLocation);

		if (removed.length) {
			const extensionsToRemove = installedExtensions.filter(({ identifier, isBuiltin }) => !isBuiltin && removed.some(r => areSameExtensions(identifier, r)));
			await Promises.settled(extensionsToRemove.map(async extensionToRemove => {
				this.logService.trace(`${this.syncResourceLogLabel}: Uninstalling local extension...`, extensionToRemove.identifier.id);
				await this.extensionManagementService.uninstall(extensionToRemove, { donotIncludePack: true, donotCheckDependents: true, profileLocation: this.profileLocation });
				this.logService.info(`${this.syncResourceLogLabel}: Uninstalled local extension.`, extensionToRemove.identifier.id);
				removeFromSkipped.push(extensionToRemove.identifier);
			}));
		}

		if (added.length || updated.length) {
			await Promises.settled([...added, ...updated].map(async e => {
				const installedExtension = installedExtensions.find(installed => areSameExtensions(installed.identifier, e.identifier));

				// Builtin Extension Sync: Enablement & State
				if (installedExtension && installedExtension.isBuiltin) {
					if (e.state && installedExtension.manifest.version === e.version) {
						this.updateExtensionState(e.state, installedExtension, installedExtension.manifest.version);
					}
					const isDisabled = this.extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
					if (isDisabled !== !!e.disabled) {
						if (e.disabled) {
							this.logService.trace(`${this.syncResourceLogLabel}: Disabling extension...`, e.identifier.id);
							await this.extensionEnablementService.disableExtension(e.identifier);
							this.logService.info(`${this.syncResourceLogLabel}: Disabled extension`, e.identifier.id);
						} else {
							this.logService.trace(`${this.syncResourceLogLabel}: Enabling extension...`, e.identifier.id);
							await this.extensionEnablementService.enableExtension(e.identifier);
							this.logService.info(`${this.syncResourceLogLabel}: Enabled extension`, e.identifier.id);
						}
					}
					removeFromSkipped.push(e.identifier);
					return;
				}

				// User Extension Sync: Install/Update, Enablement & State
				const extension = (await this.extensionGalleryService.getExtensions([{ ...e.identifier, preRelease: e.preRelease }], CancellationToken.None))[0];

				/* Update extension state only if
				 *	extension is installed and version is same as synced version or
				 *	extension is not installed and installable
				 */
				if (e.state &&
					(installedExtension ? installedExtension.manifest.version === e.version /* Installed and has same version */
						: !!extension /* Installable */)
				) {
					this.updateExtensionState(e.state, installedExtension || extension, installedExtension?.manifest.version);
				}

				if (extension) {
					try {
						const isDisabled = this.extensionEnablementService.getDisabledExtensions().some(disabledExtension => areSameExtensions(disabledExtension, e.identifier));
						if (isDisabled !== !!e.disabled) {
							if (e.disabled) {
								this.logService.trace(`${this.syncResourceLogLabel}: Disabling extension...`, e.identifier.id, extension.version);
								await this.extensionEnablementService.disableExtension(extension.identifier);
								this.logService.info(`${this.syncResourceLogLabel}: Disabled extension`, e.identifier.id, extension.version);
							} else {
								this.logService.trace(`${this.syncResourceLogLabel}: Enabling extension...`, e.identifier.id, extension.version);
								await this.extensionEnablementService.enableExtension(extension.identifier);
								this.logService.info(`${this.syncResourceLogLabel}: Enabled extension`, e.identifier.id, extension.version);
							}
						}

						if (!installedExtension // Install if the extension does not exist
							|| installedExtension.preRelease !== e.preRelease // Install if the extension pre-release preference has changed
						) {
							if (await this.extensionManagementService.canInstall(extension)) {
								this.logService.trace(`${this.syncResourceLogLabel}: Installing extension...`, e.identifier.id, extension.version);
								await this.extensionManagementService.installFromGallery(extension, { isMachineScoped: false, donotIncludePackAndDependencies: true, installPreReleaseVersion: e.preRelease, profileLocation: this.profileLocation } /* set isMachineScoped value to prevent install and sync dialog in web */);
								this.logService.info(`${this.syncResourceLogLabel}: Installed extension.`, e.identifier.id, extension.version);
								removeFromSkipped.push(extension.identifier);
							} else {
								this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing extension because it cannot be installed.`, extension.displayName || extension.identifier.id);
								addToSkipped.push(e);
							}
						}
					} catch (error) {
						addToSkipped.push(e);
						if (error instanceof ExtensionManagementError && [ExtensionManagementErrorCode.Incompatible, ExtensionManagementErrorCode.IncompatiblePreRelease, ExtensionManagementErrorCode.IncompatibleTargetPlatform].includes(error.code)) {
							this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing extension because the compatible extension is not found.`, extension.displayName || extension.identifier.id);
						} else {
							this.logService.error(error);
							this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing extension`, extension.displayName || extension.identifier.id);
						}
					}
				} else {
					addToSkipped.push(e);
					this.logService.info(`${this.syncResourceLogLabel}: Skipped synchronizing extension because the extension is not found.`, e.identifier.id);
				}
			}));
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

	private updateExtensionState(state: IStringDictionary<any>, extension: ILocalExtension | IGalleryExtension, version: string | undefined): void {
		const extensionState = this.extensionStorageService.getExtensionState(extension, true) || {};
		const keys = version ? this.extensionStorageService.getKeysForSync({ id: extension.identifier.id, version }) : undefined;
		if (keys) {
			keys.forEach(key => { extensionState[key] = state[key]; });
		} else {
			Object.keys(state).forEach(key => extensionState[key] = state[key]);
		}
		this.extensionStorageService.setExtensionState(extension, extensionState, true);
	}

	private parseExtensions(syncData: ISyncData): ISyncExtension[] {
		return JSON.parse(syncData.content);
	}

	private getLocalExtensions(installedExtensions: ILocalExtension[]): ISyncExtensionWithVersion[] {
		const disabledExtensions = this.extensionEnablementService.getDisabledExtensions();
		return installedExtensions
			.map(extension => {
				const { identifier, isBuiltin, manifest, preRelease } = extension;
				const syncExntesion: ISyncExtensionWithVersion = { identifier, preRelease, version: manifest.version };
				if (disabledExtensions.some(disabledExtension => areSameExtensions(disabledExtension, identifier))) {
					syncExntesion.disabled = true;
				}
				if (!isBuiltin) {
					syncExntesion.installed = true;
				}
				try {
					const keys = this.extensionStorageService.getKeysForSync({ id: identifier.id, version: manifest.version });
					if (keys) {
						const extensionStorageState = this.extensionStorageService.getExtensionState(extension, true) || {};
						syncExntesion.state = Object.keys(extensionStorageState).reduce((state: IStringDictionary<any>, key) => {
							if (keys.includes(key)) {
								state[key] = extensionStorageState[key];
							}
							return state;
						}, {});
					}
				} catch (error) {
					this.logService.info(`${this.syncResourceLogLabel}: Error while parsing extension state`, getErrorMessage(error));
				}
				return syncExntesion;
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
		@IUriIdentityService uriIdentityService: IUriIdentityService,
	) {
		super(SyncResource.Extensions, userDataProfilesService, environmentService, logService, fileService, uriIdentityService);
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
