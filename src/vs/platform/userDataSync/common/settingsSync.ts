/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IUserDataSyncUtilService, IConflictSetting, ISettingsSyncService, CONFIGURATION_SYNC_STORE_KEY, SyncSource, IUserData, ResourceKey } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { createCancelablePromise } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { updateIgnoredSettings, merge, getIgnoredSettings } from 'vs/platform/userDataSync/common/settingsMerge';
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import { isEmptyObject } from 'vs/base/common/types';
import { edit } from 'vs/platform/userDataSync/common/content';
import { IFileSyncPreviewResult, AbstractJsonFileSynchroniser } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { URI } from 'vs/base/common/uri';

export class SettingsSynchroniser extends AbstractJsonFileSynchroniser implements ISettingsSyncService {

	_serviceBrand: any;

	readonly resourceKey: ResourceKey = 'settings';
	protected get conflictsPreviewResource(): URI { return this.environmentService.settingsSyncPreviewResource; }
	protected get enabled(): boolean { return this.configurationService.getValue<boolean>('sync.enableSettings') === true; }

	private _conflicts: IConflictSetting[] = [];
	get conflicts(): IConflictSetting[] { return this._conflicts; }
	private _onDidChangeConflicts: Emitter<IConflictSetting[]> = this._register(new Emitter<IConflictSetting[]>());
	readonly onDidChangeConflicts: Event<IConflictSetting[]> = this._onDidChangeConflicts.event;

	constructor(
		@IFileService fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IUserDataSyncUtilService userDataSyncUtilService: IUserDataSyncUtilService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(environmentService.settingsResource, SyncSource.Settings, fileService, environmentService, userDataSyncStoreService, telemetryService, logService, userDataSyncUtilService);
	}

	protected setStatus(status: SyncStatus): void {
		super.setStatus(status);
		if (this.status !== SyncStatus.HasConflicts) {
			this.setConflicts([]);
		}
	}

	private setConflicts(conflicts: IConflictSetting[]): void {
		if (!arrays.equals(this.conflicts, conflicts,
			(a, b) => a.key === b.key && objects.equals(a.localValue, b.localValue) && objects.equals(a.remoteValue, b.remoteValue))
		) {
			this._conflicts = conflicts;
			this._onDidChangeConflicts.fire(conflicts);
		}
	}

	async pull(): Promise<void> {
		if (!this.enabled) {
			this.logService.info('Settings: Skipped pulling settings as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('Settings: Started pulling settings...');
			this.setStatus(SyncStatus.Syncing);

			const lastSyncUserData = await this.getLastSyncUserData();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);

			if (remoteUserData.content !== null) {
				const fileContent = await this.getLocalFileContent();
				const formatUtils = await this.getFormattingOptions();
				// Update ignored settings from local file content
				const content = updateIgnoredSettings(remoteUserData.content, fileContent ? fileContent.value.toString() : '{}', getIgnoredSettings(this.configurationService), formatUtils);
				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<IFileSyncPreviewResult>({
					fileContent,
					remoteUserData,
					lastSyncUserData,
					content,
					hasLocalChanged: true,
					hasRemoteChanged: false,
					hasConflicts: false,
				}));

				await this.apply();
			}

			// No remote exists to pull
			else {
				this.logService.info('Settings: Remote settings does not exist.');
			}

			this.logService.info('Settings: Finished pulling settings.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async push(): Promise<void> {
		if (!this.enabled) {
			this.logService.info('Settings: Skipped pushing settings as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('Settings: Started pushing settings...');
			this.setStatus(SyncStatus.Syncing);

			const fileContent = await this.getLocalFileContent();

			if (fileContent !== null) {
				const formatUtils = await this.getFormattingOptions();
				// Remove ignored settings
				const content = updateIgnoredSettings(fileContent.value.toString(), '{}', getIgnoredSettings(this.configurationService), formatUtils);
				const lastSyncUserData = await this.getLastSyncUserData();
				const remoteUserData = await this.getRemoteUserData(lastSyncUserData);

				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<IFileSyncPreviewResult>({
					fileContent,
					remoteUserData,
					lastSyncUserData,
					content,
					hasRemoteChanged: true,
					hasLocalChanged: false,
					hasConflicts: false,
				}));

				await this.apply(true);
			}

			// No local exists to push
			else {
				this.logService.info('Settings: Local settings does not exist.');
			}

			this.logService.info('Settings: Finished pushing settings.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const localFileContent = await this.getLocalFileContent();
			if (localFileContent) {
				const formatUtils = await this.getFormattingOptions();
				const content = edit(localFileContent.value.toString(), [CONFIGURATION_SYNC_STORE_KEY], undefined, formatUtils);
				const settings = parse(content);
				if (!isEmptyObject(settings)) {
					return true;
				}
			}
		} catch (error) {
			if ((<FileOperationError>error).fileOperationResult !== FileOperationResult.FILE_NOT_FOUND) {
				return true;
			}
		}
		return false;
	}

	async getRemoteContent(preview?: boolean): Promise<string | null> {
		let content = await super.getRemoteContent(preview);
		if (preview && content !== null) {
			const formatUtils = await this.getFormattingOptions();
			// remove ignored settings from the remote content for preview
			content = updateIgnoredSettings(content, '{}', getIgnoredSettings(this.configurationService), formatUtils);
		}
		return content;
	}

	async accept(content: string): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			const preview = await this.syncPreviewResultPromise!;
			this.cancel();
			const formatUtils = await this.getFormattingOptions();
			// Add ignored settings from local file content
			content = updateIgnoredSettings(content, preview.fileContent ? preview.fileContent.value.toString() : '{}', getIgnoredSettings(this.configurationService), formatUtils);
			this.syncPreviewResultPromise = createCancelablePromise(async () => ({ ...preview, content }));
			await this.apply(true);
			this.setStatus(SyncStatus.Idle);
		}
	}

	async resolveSettingsConflicts(resolvedConflicts: { key: string, value: any | undefined }[]): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			const preview = await this.syncPreviewResultPromise!;
			this.cancel();
			await this.doSync(preview.remoteUserData, preview.lastSyncUserData, resolvedConflicts);
		}
	}

	protected async doSync(remoteUserData: IUserData, lastSyncUserData: IUserData | null, resolvedConflicts: { key: string, value: any | undefined }[] = []): Promise<void> {
		try {
			const result = await this.getPreview(remoteUserData, lastSyncUserData, resolvedConflicts);
			if (result.hasConflicts) {
				this.logService.info('Settings: Detected conflicts while synchronizing settings.');
				this.setStatus(SyncStatus.HasConflicts);
				return;
			}
			try {
				await this.apply();
				this.logService.trace('Settings: Finished synchronizing settings.');
			} finally {
				this.setStatus(SyncStatus.Idle);
			}
		} catch (e) {
			this.syncPreviewResultPromise = null;
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncError) {
				switch (e.code) {
					case UserDataSyncErrorCode.Rejected:
						// Rejected as there is a new remote version. Syncing again,
						this.logService.info('Settings: Failed to synchronize settings as there is a new remote version available. Synchronizing again...');
						return this.sync();
					case UserDataSyncErrorCode.NewLocal:
						// Rejected as there is a new local version. Syncing again.
						this.logService.info('Settings: Failed to synchronize settings as there is a new local version available. Synchronizing again...');
						return this.sync(remoteUserData.ref);
				}
			}
			throw e;
		}
	}

	private async apply(forcePush?: boolean): Promise<void> {
		if (!this.syncPreviewResultPromise) {
			return;
		}

		let { fileContent, remoteUserData, lastSyncUserData, content, hasLocalChanged, hasRemoteChanged } = await this.syncPreviewResultPromise;

		if (content !== null) {

			if (this.hasErrors(content)) {
				const error = new Error(localize('errorInvalidSettings', "Unable to sync settings. Please resolve conflicts without any errors/warnings and try again."));
				this.logService.error(error);
				throw error;
			}

			if (hasLocalChanged) {
				this.logService.trace('Settings: Updating local settings...');
				await this.updateLocalFileContent(content, fileContent);
				this.logService.info('Settings: Updated local settings');
			}
			if (hasRemoteChanged) {
				const formatUtils = await this.getFormattingOptions();
				// Update ignored settings from remote
				content = updateIgnoredSettings(content, remoteUserData.content || '{}', getIgnoredSettings(this.configurationService, content), formatUtils);
				this.logService.trace('Settings: Updating remote settings...');
				const ref = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
				this.logService.info('Settings: Updated remote settings');
				remoteUserData = { ref, content };
			}

			// Delete the preview
			await this.fileService.del(this.environmentService.settingsSyncPreviewResource);
		} else {
			this.logService.trace('Settings: No changes found during synchronizing settings.');
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			this.logService.trace('Settings: Updating last synchronized settings...');
			await this.updateLastSyncUserData(remoteUserData);
			this.logService.info('Settings: Updated last synchronized settings');
		}

		this.syncPreviewResultPromise = null;
	}

	private getPreview(remoteUserData: IUserData, lastSyncUserData: IUserData | null, resolvedConflicts: { key: string, value: any }[]): Promise<IFileSyncPreviewResult> {
		if (!this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise = createCancelablePromise(token => this.generatePreview(remoteUserData, lastSyncUserData, resolvedConflicts, token));
		}
		return this.syncPreviewResultPromise;
	}

	protected async generatePreview(remoteUserData: IUserData, lastSyncUserData: IUserData | null, resolvedConflicts: { key: string, value: any }[], token: CancellationToken): Promise<IFileSyncPreviewResult> {
		const fileContent = await this.getLocalFileContent();
		const formattingOptions = await this.getFormattingOptions();

		let content: string | null = null;
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;
		let conflictSettings: IConflictSetting[] = [];

		if (remoteUserData.content) {
			const localContent: string = fileContent ? fileContent.value.toString() : '{}';

			// No action when there are errors
			if (this.hasErrors(localContent)) {
				this.logService.error('Settings: Unable to sync settings as there are errors/warning in settings file.');
			}

			else {
				this.logService.trace('Settings: Merging remote settings with local settings...');
				const result = merge(localContent, remoteUserData.content, lastSyncUserData ? lastSyncUserData.content : null, getIgnoredSettings(this.configurationService), resolvedConflicts, formattingOptions);
				content = result.localContent || result.remoteContent;
				hasLocalChanged = result.localContent !== null;
				hasRemoteChanged = result.remoteContent !== null;
				hasConflicts = result.hasConflicts;
				conflictSettings = result.conflictsSettings;
			}
		}

		// First time syncing to remote
		else if (fileContent) {
			this.logService.trace('Settings: Remote settings does not exist. Synchronizing settings for the first time.');
			content = fileContent.value.toString();
			hasRemoteChanged = true;
		}

		if (content && !token.isCancellationRequested) {
			// Remove the ignored settings from the preview.
			const previewContent = updateIgnoredSettings(content, '{}', getIgnoredSettings(this.configurationService), formattingOptions);
			await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(previewContent));
		}

		this.setConflicts(conflictSettings);
		return { fileContent, remoteUserData, lastSyncUserData, content, hasLocalChanged, hasRemoteChanged, hasConflicts };
	}

}
