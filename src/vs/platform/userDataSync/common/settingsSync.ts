/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IUserData, UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IUserDataSyncUtilService, IConflictSetting, ISettingsSyncService, CONFIGURATION_SYNC_STORE_KEY, SyncSource } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, ParseError } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { updateIgnoredSettings, merge, getIgnoredSettings } from 'vs/platform/userDataSync/common/settingsMerge';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import { isEmptyObject, isUndefinedOrNull } from 'vs/base/common/types';
import { edit } from 'vs/platform/userDataSync/common/content';
import { AbstractFileSynchroniser } from 'vs/platform/userDataSync/common/abstractSynchronizer';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData;
	readonly lastSyncUserData: IUserData | null;
	readonly content: string | null;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly hasConflicts: boolean;
	readonly conflictSettings: IConflictSetting[];
}

export class SettingsSynchroniser extends AbstractFileSynchroniser implements ISettingsSyncService {

	_serviceBrand: any;

	private syncPreviewResultPromise: CancelablePromise<ISyncPreviewResult> | null = null;

	private _conflicts: IConflictSetting[] = [];
	get conflicts(): IConflictSetting[] { return this._conflicts; }
	private _onDidChangeConflicts: Emitter<IConflictSetting[]> = this._register(new Emitter<IConflictSetting[]>());
	readonly onDidChangeConflicts: Event<IConflictSetting[]> = this._onDidChangeConflicts.event;

	constructor(
		@IFileService fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataSyncUtilService private readonly userDataSyncUtilService: IUserDataSyncUtilService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super(environmentService.settingsResource, SyncSource.Settings, fileService, environmentService, userDataSyncStoreService);
	}

	protected getRemoteDataResourceKey(): string { return 'settings'; }

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
		if (!this.configurationService.getValue<boolean>('sync.enableSettings')) {
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
				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<ISyncPreviewResult>({
					fileContent,
					remoteUserData,
					lastSyncUserData,
					content,
					hasLocalChanged: true,
					hasRemoteChanged: false,
					hasConflicts: false,
					conflictSettings: [],
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
		if (!this.configurationService.getValue<boolean>('sync.enableSettings')) {
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

				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<ISyncPreviewResult>({
					fileContent,
					remoteUserData,
					lastSyncUserData,
					content,
					hasRemoteChanged: true,
					hasLocalChanged: false,
					hasConflicts: false,
					conflictSettings: [],
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

	async sync(): Promise<void> {
		if (!this.configurationService.getValue<boolean>('sync.enableSettings')) {
			this.logService.trace('Settings: Skipping synchronizing settings as it is disabled.');
			return;
		}

		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('Settings: Skipping synchronizing settings as it is running already.');
			return;
		}

		this.logService.trace('Settings: Started synchronizing settings...');
		this.setStatus(SyncStatus.Syncing);
		return this.doSync([]);
	}

	async stop(): Promise<void> {
		if (this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise.cancel();
			this.syncPreviewResultPromise = null;
			this.logService.trace('Settings: Stopped synchronizing settings.');
		}
		await this.fileService.del(this.environmentService.settingsSyncPreviewResource);
		this.setStatus(SyncStatus.Idle);
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
		let content: string | null | undefined = null;
		if (this.syncPreviewResultPromise) {
			const preview = await this.syncPreviewResultPromise;
			content = preview.remoteUserData?.content;
		} else {
			const lastSyncData = await this.getLastSyncUserData();
			const remoteUserData = await this.getRemoteUserData(lastSyncData);
			content = remoteUserData.content;
		}
		if (preview && !isUndefinedOrNull(content)) {
			const formatUtils = await this.getFormattingOptions();
			// remove ignored settings from the remote content for preview
			content = updateIgnoredSettings(content, '{}', getIgnoredSettings(this.configurationService), formatUtils);
		}
		return content !== undefined ? content : null;
	}

	async restart(): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			this.syncPreviewResultPromise!.cancel();
			this.syncPreviewResultPromise = null;
			await this.doSync([]);
		}
	}

	async accept(content: string): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			try {
				const preview = await this.syncPreviewResultPromise!;
				const formatUtils = await this.getFormattingOptions();
				// Add ignored settings from local file content
				content = updateIgnoredSettings(content, preview.fileContent ? preview.fileContent.value.toString() : '{}', getIgnoredSettings(this.configurationService), formatUtils);
				this.syncPreviewResultPromise = createCancelablePromise(async () => ({ ...preview, content }));
				await this.apply(true);
				this.setStatus(SyncStatus.Idle);
			} catch (e) {
				if ((e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) ||
					(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
					throw new UserDataSyncError('Failed to resolve conflicts as there is a new local version available.', UserDataSyncErrorCode.NewLocal);
				}
				throw e;
			}
		}
	}

	async resolveSettingsConflicts(resolvedConflicts: { key: string, value: any | undefined }[]): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			this.syncPreviewResultPromise!.cancel();
			this.syncPreviewResultPromise = null;
			await this.doSync(resolvedConflicts);
		}
	}

	private async doSync(resolvedConflicts: { key: string, value: any | undefined }[]): Promise<void> {
		try {
			const result = await this.getPreview(resolvedConflicts);
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
			if (e instanceof UserDataSyncError && e.code === UserDataSyncErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('Settings: Failed to synchronize settings as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			if ((e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) ||
				(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
				// Rejected as there is a new local version. Syncing again.
				this.logService.info('Settings: Failed to synchronize settings as there is a new local version available. Synchronizing again...');
				return this.sync();
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

	private hasErrors(content: string): boolean {
		const parseErrors: ParseError[] = [];
		parse(content, parseErrors, { allowEmptyContent: true, allowTrailingComma: true });
		return parseErrors.length > 0;
	}

	private getPreview(resolvedConflicts: { key: string, value: any }[]): Promise<ISyncPreviewResult> {
		if (!this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise = createCancelablePromise(token => this.generatePreview(resolvedConflicts, token));
		}
		return this.syncPreviewResultPromise;
	}

	private async generatePreview(resolvedConflicts: { key: string, value: any }[], token: CancellationToken): Promise<ISyncPreviewResult> {
		const lastSyncUserData = await this.getLastSyncUserData();
		const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		const formatUtils = await this.getFormattingOptions();

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
				const result = merge(localContent, remoteUserData.content, lastSyncUserData ? lastSyncUserData.content : null, getIgnoredSettings(this.configurationService), resolvedConflicts, formatUtils);
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
			const previewContent = updateIgnoredSettings(content, '{}', getIgnoredSettings(this.configurationService), formatUtils);
			await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(previewContent));
		}

		this.setConflicts(conflictSettings);
		return { fileContent, remoteUserData, lastSyncUserData, content, hasLocalChanged, hasRemoteChanged, conflictSettings, hasConflicts };
	}

	private _formattingOptions: Promise<FormattingOptions> | undefined = undefined;
	private getFormattingOptions(): Promise<FormattingOptions> {
		if (!this._formattingOptions) {
			this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.environmentService.settingsResource);
		}
		return this._formattingOptions;
	}

}
