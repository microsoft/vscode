/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SyncStatus, IUserDataSyncStoreService, ISyncExtension, IUserDataSyncLogService, IUserDataSynchroniser, SyncResource, IUserDataSyncEnablementService, IUserDataSyncBackupStoreService } from 'vs/platform/userDataSync/common/userDataSync';
import { Event } from 'vs/base/common/event';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IExtensionManagementService, IExtensionGalleryService, IGlobalExtensionEnablementService } from 'vs/platform/extensionManagement/common/extensionManagement';
import { ExtensionType, IExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { areSameExtensions } from 'vs/platform/extensionManagement/common/extensionManagementUtil';
import { IFileService } from 'vs/platform/files/common/files';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { localize } from 'vs/nls';
import { merge } from 'vs/platform/userDataSync/common/extensionsMerge';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { AbstractSynchroniser, IRemoteUserData, ISyncData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

interface ISyncPreviewResult {
	readonly localExtensions: ISyncExtension[];
	readonly remoteUserData: IRemoteUserData;
	readonly lastSyncUserData: ILastSyncUserData | null;
	readonly added: ISyncExtension[];
	readonly removed: IExtensionIdentifier[];
	readonly updated: ISyncExtension[];
	readonly remote: ISyncExtension[] | null;
	readonly skippedExtensions: ISyncExtension[];
}

interface ILastSyncUserData extends IRemoteUserData {
	skippedExtensions: ISyncExtension[] | undefined;
}

export class ExtensionsSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 2;
	protected isEnabled(): boolean { return super.isEnabled() && this.extensionGalleryService.isEnabled(); }

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IGlobalExtensionEnablementService private readonly extensionEnablementService: IGlobalExtensionEnablementService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(SyncResource.Extensions, fileService, environmentService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, configurationService);
		this._register(
			Event.debounce(
				Event.any<any>(
					Event.filter(this.extensionManagementService.onDidInstallExtension, (e => !!e.gallery)),
					Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error)),
					this.extensionEnablementService.onDidChangeEnablement),
				() => undefined, 500)(() => this._onDidChangeLocal.fire()));
	}

	async pull(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pulling extensions as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pulling extensions...`);
			this.setStatus(SyncStatus.Syncing);

			const lastSyncUserData = await this.getLastSyncUserData<ILastSyncUserData>();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);

			if (remoteUserData.syncData !== null) {
				const localExtensions = await this.getLocalExtensions();
				const remoteExtensions = this.parseExtensions(remoteUserData.syncData);
				const { added, updated, remote, removed } = merge(localExtensions, remoteExtensions, localExtensions, [], this.getIgnoredExtensions());
				await this.apply({ added, removed, updated, remote, remoteUserData, localExtensions, skippedExtensions: [], lastSyncUserData });
			}

			// No remote exists to pull
			else {
				this.logService.info(`${this.syncResourceLogLabel}: Remote extensions does not exist.`);
			}

			this.logService.info(`${this.syncResourceLogLabel}: Finished pulling extensions.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async push(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pushing extensions as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pushing extensions...`);
			this.setStatus(SyncStatus.Syncing);

			const localExtensions = await this.getLocalExtensions();
			const { added, removed, updated, remote } = merge(localExtensions, null, null, [], this.getIgnoredExtensions());
			const lastSyncUserData = await this.getLastSyncUserData<ILastSyncUserData>();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
			await this.apply({ added, removed, updated, remote, remoteUserData, localExtensions, skippedExtensions: [], lastSyncUserData }, true);

			this.logService.info(`${this.syncResourceLogLabel}: Finished pushing extensions.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async stop(): Promise<void> { }

	async getRemoteContent(ref?: string, fragment?: string): Promise<string | null> {
		const content = await super.getRemoteContent(ref);
		if (content !== null && fragment) {
			return this.getFragment(content, fragment);
		}
		return content;
	}

	async getLocalBackupContent(ref?: string, fragment?: string): Promise<string | null> {
		let content = await super.getLocalBackupContent(ref);
		if (content !== null && fragment) {
			return this.getFragment(content, fragment);
		}
		return content;
	}

	private getFragment(content: string, fragment: string): string | null {
		const syncData = this.parseSyncData(content);
		if (syncData) {
			switch (fragment) {
				case 'extensions':
					return syncData.content;
			}
		}
		return null;
	}

	accept(content: string): Promise<void> {
		throw new Error(`${this.syncResourceLogLabel}: Conflicts should not occur`);
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const localExtensions = await this.getLocalExtensions();
			if (isNonEmptyArray(localExtensions)) {
				return true;
			}
		} catch (error) {
			/* ignore error */
		}
		return false;
	}

	protected async performSync(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null): Promise<SyncStatus> {
		const previewResult = await this.getPreview(remoteUserData, lastSyncUserData);
		await this.apply(previewResult);
		return SyncStatus.Idle;
	}

	private async getPreview(remoteUserData: IRemoteUserData, lastSyncUserData: ILastSyncUserData | null): Promise<ISyncPreviewResult> {
		const remoteExtensions: ISyncExtension[] | null = remoteUserData.syncData ? this.parseExtensions(remoteUserData.syncData) : null;
		const lastSyncExtensions: ISyncExtension[] | null = lastSyncUserData ? this.parseExtensions(lastSyncUserData.syncData!) : null;
		const skippedExtensions: ISyncExtension[] = lastSyncUserData ? lastSyncUserData.skippedExtensions || [] : [];

		const localExtensions = await this.getLocalExtensions();

		if (remoteExtensions) {
			this.logService.trace(`${this.syncResourceLogLabel}: Merging remote extensions with local extensions...`);
		} else {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote extensions does not exist. Synchronizing extensions for the first time.`);
		}

		const { added, removed, updated, remote } = merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, this.getIgnoredExtensions());

		return { added, removed, updated, remote, skippedExtensions, remoteUserData, localExtensions, lastSyncUserData };
	}

	private getIgnoredExtensions() {
		return this.configurationService.getValue<string[]>('sync.ignoredExtensions') || [];
	}

	private async apply({ added, removed, updated, remote, remoteUserData, skippedExtensions, lastSyncUserData, localExtensions }: ISyncPreviewResult, forcePush?: boolean): Promise<void> {

		const hasChanges = added.length || removed.length || updated.length || remote;

		if (!hasChanges) {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing extensions.`);
		}

		if (added.length || removed.length || updated.length) {
			// back up all disabled or market place extensions
			const backUpExtensions = localExtensions.filter(e => e.disabled || !!e.identifier.uuid);
			await this.backupLocal(JSON.stringify(backUpExtensions));
			skippedExtensions = await this.updateLocalExtensions(added, removed, updated, skippedExtensions);
		}

		if (remote) {
			// update remote
			this.logService.trace(`${this.syncResourceLogLabel}: Updating remote extensions...`);
			const content = JSON.stringify(remote);
			remoteUserData = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
			this.logService.info(`${this.syncResourceLogLabel}: Updated remote extensions`);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized extensions...`);
			await this.updateLastSyncUserData(remoteUserData, { skippedExtensions });
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized extensions`);
		}
	}

	private async updateLocalExtensions(added: ISyncExtension[], removed: IExtensionIdentifier[], updated: ISyncExtension[], skippedExtensions: ISyncExtension[]): Promise<ISyncExtension[]> {
		const removeFromSkipped: IExtensionIdentifier[] = [];
		const addToSkipped: ISyncExtension[] = [];

		if (removed.length) {
			const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User);
			const extensionsToRemove = installedExtensions.filter(({ identifier }) => removed.some(r => areSameExtensions(identifier, r)));
			await Promise.all(extensionsToRemove.map(async extensionToRemove => {
				this.logService.trace(`${this.syncResourceLogLabel}: Uninstalling local extension...', extensionToRemove.identifier.i`);
				await this.extensionManagementService.uninstall(extensionToRemove);
				this.logService.info(`${this.syncResourceLogLabel}: Uninstalled local extension.', extensionToRemove.identifier.i`);
				removeFromSkipped.push(extensionToRemove.identifier);
			}));
		}

		if (added.length || updated.length) {
			await Promise.all([...added, ...updated].map(async e => {
				const installedExtensions = await this.extensionManagementService.getInstalled();
				const installedExtension = installedExtensions.filter(installed => areSameExtensions(installed.identifier, e.identifier))[0];

				// Builtin Extension: Sync only enablement state
				if (installedExtension && installedExtension.type === ExtensionType.System) {
					if (e.disabled) {
						this.logService.trace(`${this.syncResourceLogLabel}: Disabling extension...', e.identifier.i`);
						await this.extensionEnablementService.disableExtension(e.identifier);
						this.logService.info(`${this.syncResourceLogLabel}: Disabled extension', e.identifier.i`);
					} else {
						this.logService.trace(`${this.syncResourceLogLabel}: Enabling extension...', e.identifier.i`);
						await this.extensionEnablementService.enableExtension(e.identifier);
						this.logService.info(`${this.syncResourceLogLabel}: Enabled extension', e.identifier.i`);
					}
					removeFromSkipped.push(e.identifier);
					return;
				}

				const extension = await this.extensionGalleryService.getCompatibleExtension(e.identifier, e.version);
				if (extension) {
					try {
						if (e.disabled) {
							this.logService.trace(`${this.syncResourceLogLabel}: Disabling extension...', e.identifier.id, extension.versio`);
							await this.extensionEnablementService.disableExtension(extension.identifier);
							this.logService.info(`${this.syncResourceLogLabel}: Disabled extension', e.identifier.id, extension.versio`);
						} else {
							this.logService.trace(`${this.syncResourceLogLabel}: Enabling extension...', e.identifier.id, extension.versio`);
							await this.extensionEnablementService.enableExtension(extension.identifier);
							this.logService.info(`${this.syncResourceLogLabel}: Enabled extension', e.identifier.id, extension.versio`);
						}
						// Install only if the extension does not exist
						if (!installedExtension || installedExtension.manifest.version !== extension.version) {
							this.logService.trace(`${this.syncResourceLogLabel}: Installing extension...', e.identifier.id, extension.versio`);
							await this.extensionManagementService.installFromGallery(extension);
							this.logService.info(`${this.syncResourceLogLabel}: Installed extension.', e.identifier.id, extension.versio`);
							removeFromSkipped.push(extension.identifier);
						}
					} catch (error) {
						addToSkipped.push(e);
						this.logService.error(error);
						this.logService.info(localize('skip extension', "Skipped synchronizing extension {0}", extension.displayName || extension.identifier.id));
					}
				} else {
					addToSkipped.push(e);
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

	private parseExtensions(syncData: ISyncData): ISyncExtension[] {
		let extensions: ISyncExtension[] = JSON.parse(syncData.content);
		if (syncData.version !== this.version) {
			extensions = extensions.map(e => {
				// #region Migration from v1 (enabled -> disabled)
				if (!(<any>e).enabled) {
					e.disabled = true;
				}
				delete (<any>e).enabled;
				// #endregion
				return e;
			});
		}
		return extensions;
	}

	private async getLocalExtensions(): Promise<ISyncExtension[]> {
		const installedExtensions = await this.extensionManagementService.getInstalled();
		const disabledExtensions = this.extensionEnablementService.getDisabledExtensions();
		return installedExtensions
			.map(({ identifier }) => {
				const syncExntesion: ISyncExtension = { identifier };
				if (disabledExtensions.some(disabledExtension => areSameExtensions(disabledExtension, identifier))) {
					syncExntesion.disabled = true;
				}
				return syncExntesion;
			});
	}

}
