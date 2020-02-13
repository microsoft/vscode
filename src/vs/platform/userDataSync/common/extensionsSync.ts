/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IUserData, UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, ISyncExtension, IUserDataSyncLogService, IUserDataSynchroniser, SyncSource, ResourceKey, IUserDataSyncEnablementService } from 'vs/platform/userDataSync/common/userDataSync';
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
import { AbstractSynchroniser } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';

interface ISyncPreviewResult {
	readonly added: ISyncExtension[];
	readonly removed: IExtensionIdentifier[];
	readonly updated: ISyncExtension[];
	readonly remote: ISyncExtension[] | null;
	readonly remoteUserData: IUserData;
	readonly skippedExtensions: ISyncExtension[];
	readonly lastSyncUserData: ILastSyncUserData | null;
}

interface ILastSyncUserData extends IUserData {
	skippedExtensions: ISyncExtension[] | undefined;
}

export class ExtensionsSynchroniser extends AbstractSynchroniser implements IUserDataSynchroniser {

	readonly resourceKey: ResourceKey = 'extensions';

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IFileService fileService: IFileService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IExtensionManagementService private readonly extensionManagementService: IExtensionManagementService,
		@IGlobalExtensionEnablementService private readonly extensionEnablementService: IGlobalExtensionEnablementService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IExtensionGalleryService private readonly extensionGalleryService: IExtensionGalleryService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(SyncSource.Extensions, fileService, environmentService, userDataSyncStoreService, userDataSyncEnablementService, telemetryService, logService);
		this._register(
			Event.debounce(
				Event.any<any>(
					Event.filter(this.extensionManagementService.onDidInstallExtension, (e => !!e.gallery)),
					Event.filter(this.extensionManagementService.onDidUninstallExtension, (e => !e.error)),
					this.extensionEnablementService.onDidChangeEnablement),
				() => undefined, 500)(() => this._onDidChangeLocal.fire()));
	}

	async pull(): Promise<void> {
		if (!this.enabled) {
			this.logService.info('Extensions: Skipped pulling extensions as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('Extensions: Started pulling extensions...');
			this.setStatus(SyncStatus.Syncing);

			const lastSyncUserData = await this.getLastSyncUserData<ILastSyncUserData>();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);

			if (remoteUserData.content !== null) {
				const localExtensions = await this.getLocalExtensions();
				const remoteExtensions: ISyncExtension[] = JSON.parse(remoteUserData.content);
				const { added, updated, remote } = merge(localExtensions, remoteExtensions, [], [], this.getIgnoredExtensions());
				await this.apply({ added, removed: [], updated, remote, remoteUserData, skippedExtensions: [], lastSyncUserData });
			}

			// No remote exists to pull
			else {
				this.logService.info('Extensions: Remote extensions does not exist.');
			}

			this.logService.info('Extensions: Finished pulling extensions.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async push(): Promise<void> {
		if (!this.enabled) {
			this.logService.info('Extensions: Skipped pushing extensions as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('Extensions: Started pushing extensions...');
			this.setStatus(SyncStatus.Syncing);

			const localExtensions = await this.getLocalExtensions();
			const { added, removed, updated, remote } = merge(localExtensions, null, null, [], this.getIgnoredExtensions());
			const lastSyncUserData = await this.getLastSyncUserData<ILastSyncUserData>();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
			await this.apply({ added, removed, updated, remote, remoteUserData, skippedExtensions: [], lastSyncUserData }, true);

			this.logService.info('Extensions: Finished pushing extensions.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async sync(ref?: string): Promise<void> {
		if (!this.extensionGalleryService.isEnabled()) {
			this.logService.info('Extensions: Skipping synchronizing extensions as gallery is disabled.');
			return;
		}
		return super.sync(ref);
	}

	async stop(): Promise<void> { }

	accept(content: string): Promise<void> {
		throw new Error('Extensions: Conflicts should not occur');
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

	async getRemoteContent(): Promise<string | null> {
		return null;
	}

	protected async doSync(remoteUserData: IUserData, lastSyncUserData: ILastSyncUserData | null): Promise<void> {
		try {
			const previewResult = await this.getPreview(remoteUserData, lastSyncUserData);
			await this.apply(previewResult);
		} catch (e) {
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncError && e.code === UserDataSyncErrorCode.RemotePreconditionFailed) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('Extensions: Failed to synchronize extensions as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		}

		this.logService.trace('Extensions: Finished synchronizing extensions.');
		this.setStatus(SyncStatus.Idle);
	}

	private async getPreview(remoteUserData: IUserData, lastSyncUserData: ILastSyncUserData | null): Promise<ISyncPreviewResult> {
		const remoteExtensions: ISyncExtension[] = remoteUserData.content ? JSON.parse(remoteUserData.content) : null;
		const lastSyncExtensions: ISyncExtension[] | null = lastSyncUserData ? JSON.parse(lastSyncUserData.content!) : null;
		const skippedExtensions: ISyncExtension[] = lastSyncUserData ? lastSyncUserData.skippedExtensions || [] : [];

		const localExtensions = await this.getLocalExtensions();

		if (remoteExtensions) {
			this.logService.trace('Extensions: Merging remote extensions with local extensions...');
		} else {
			this.logService.trace('Extensions: Remote extensions does not exist. Synchronizing extensions for the first time.');
		}

		const { added, removed, updated, remote } = merge(localExtensions, remoteExtensions, lastSyncExtensions, skippedExtensions, this.getIgnoredExtensions());

		return { added, removed, updated, remote, skippedExtensions, remoteUserData, lastSyncUserData };
	}

	private getIgnoredExtensions() {
		return this.configurationService.getValue<string[]>('sync.ignoredExtensions') || [];
	}

	private async apply({ added, removed, updated, remote, remoteUserData, skippedExtensions, lastSyncUserData }: ISyncPreviewResult, forcePush?: boolean): Promise<void> {

		const hasChanges = added.length || removed.length || updated.length || remote;

		if (!hasChanges) {
			this.logService.info('Extensions: No changes found during synchronizing extensions.');
		}

		if (added.length || removed.length || updated.length) {
			skippedExtensions = await this.updateLocalExtensions(added, removed, updated, skippedExtensions);
		}

		if (remote) {
			// update remote
			this.logService.trace('Extensions: Updating remote extensions...');
			const content = JSON.stringify(remote);
			const ref = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
			remoteUserData = { ref, content };
			this.logService.info('Extensions: Updated remote extensions');
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			// update last sync
			this.logService.trace('Extensions: Updating last synchronized extensions...');
			await this.updateLastSyncUserData<ILastSyncUserData>({ ...remoteUserData, skippedExtensions });
			this.logService.info('Extensions: Updated last synchronized extensions');
		}
	}

	private async updateLocalExtensions(added: ISyncExtension[], removed: IExtensionIdentifier[], updated: ISyncExtension[], skippedExtensions: ISyncExtension[]): Promise<ISyncExtension[]> {
		const removeFromSkipped: IExtensionIdentifier[] = [];
		const addToSkipped: ISyncExtension[] = [];

		if (removed.length) {
			const installedExtensions = await this.extensionManagementService.getInstalled(ExtensionType.User);
			const extensionsToRemove = installedExtensions.filter(({ identifier }) => removed.some(r => areSameExtensions(identifier, r)));
			await Promise.all(extensionsToRemove.map(async extensionToRemove => {
				this.logService.trace('Extensions: Uninstalling local extension...', extensionToRemove.identifier.id);
				await this.extensionManagementService.uninstall(extensionToRemove);
				this.logService.info('Extensions: Uninstalled local extension.', extensionToRemove.identifier.id);
				removeFromSkipped.push(extensionToRemove.identifier);
			}));
		}

		if (added.length || updated.length) {
			await Promise.all([...added, ...updated].map(async e => {
				const installedExtensions = await this.extensionManagementService.getInstalled();
				const installedExtension = installedExtensions.filter(installed => areSameExtensions(installed.identifier, e.identifier))[0];

				// Builtin Extension: Sync only enablement state
				if (installedExtension && installedExtension.type === ExtensionType.System) {
					if (e.enabled) {
						this.logService.trace('Extensions: Enabling extension...', e.identifier.id);
						await this.extensionEnablementService.enableExtension(e.identifier);
						this.logService.info('Extensions: Enabled extension', e.identifier.id);
					} else {
						this.logService.trace('Extensions: Disabling extension...', e.identifier.id);
						await this.extensionEnablementService.disableExtension(e.identifier);
						this.logService.info('Extensions: Disabled extension', e.identifier.id);
					}
					removeFromSkipped.push(e.identifier);
					return;
				}

				const extension = await this.extensionGalleryService.getCompatibleExtension(e.identifier, e.version);
				if (extension) {
					try {
						if (e.enabled) {
							this.logService.trace('Extensions: Enabling extension...', e.identifier.id, extension.version);
							await this.extensionEnablementService.enableExtension(extension.identifier);
							this.logService.info('Extensions: Enabled extension', e.identifier.id, extension.version);
						} else {
							this.logService.trace('Extensions: Disabling extension...', e.identifier.id, extension.version);
							await this.extensionEnablementService.disableExtension(extension.identifier);
							this.logService.info('Extensions: Disabled extension', e.identifier.id, extension.version);
						}
						// Install only if the extension does not exist
						if (!installedExtension || installedExtension.manifest.version !== extension.version) {
							this.logService.trace('Extensions: Installing extension...', e.identifier.id, extension.version);
							await this.extensionManagementService.installFromGallery(extension);
							this.logService.info('Extensions: Installed extension.', e.identifier.id, extension.version);
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

	private async getLocalExtensions(): Promise<ISyncExtension[]> {
		const installedExtensions = await this.extensionManagementService.getInstalled();
		const disabledExtensions = await this.extensionEnablementService.getDisabledExtensions();
		return installedExtensions
			.map(({ identifier }) => ({ identifier, enabled: !disabledExtensions.some(disabledExtension => areSameExtensions(disabledExtension, identifier)) }));
	}

}
