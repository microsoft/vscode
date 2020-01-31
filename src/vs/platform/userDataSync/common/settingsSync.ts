/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IUserData, UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, DEFAULT_IGNORED_SETTINGS, IUserDataSyncLogService, IUserDataSyncUtilService, IConflictSetting, ISettingsSyncService, CONFIGURATION_SYNC_STORE_KEY, SyncSource } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, ParseError } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { startsWith } from 'vs/base/common/strings';
import { CancellationToken } from 'vs/base/common/cancellation';
import { updateIgnoredSettings, merge } from 'vs/platform/userDataSync/common/settingsMerge';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import * as arrays from 'vs/base/common/arrays';
import * as objects from 'vs/base/common/objects';
import { isEmptyObject } from 'vs/base/common/types';
import { edit } from 'vs/platform/userDataSync/common/content';
import { AbstractFileSynchroniser } from 'vs/platform/userDataSync/common/abstractSynchronizer';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly remoteContent: string | null;
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

			const remoteUserData = await this.getRemoteUserData();

			if (remoteUserData.content !== null) {
				const fileContent = await this.getLocalFileContent();
				const formatUtils = await this.getFormattingOptions();
				// Update ignored settings
				const content = updateIgnoredSettings(remoteUserData.content, fileContent ? fileContent.value.toString() : '{}', getIgnoredSettings(this.configurationService), formatUtils);
				await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(content));

				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<ISyncPreviewResult>({
					hasConflicts: false,
					conflictSettings: [],
					fileContent,
					hasLocalChanged: true,
					hasRemoteChanged: false,
					remoteContent: content,
					remoteUserData,
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
				await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(content));
				const remoteUserData = await this.getRemoteUserData();

				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<ISyncPreviewResult>({
					conflictSettings: [],
					hasConflicts: false,
					fileContent,
					hasLocalChanged: false,
					hasRemoteChanged: true,
					remoteContent: content,
					remoteUserData,
				}));

				await this.apply(undefined, true);
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

	async getRemoteContent(): Promise<string | null> {
		let content: string | null | undefined = null;
		if (this.syncPreviewResultPromise) {
			const preview = await this.syncPreviewResultPromise;
			content = preview.remoteUserData?.content;
		} else {
			const remoteUserData = await this.getRemoteUserData();
			content = remoteUserData.content;
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

	async resolveConflicts(content: string, remote: boolean): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			try {
				if (remote) {
					const { fileContent } = await this.syncPreviewResultPromise!;
					const formatUtils = await this.getFormattingOptions();
					// Update ignored settings
					content = updateIgnoredSettings(content, fileContent ? fileContent.value.toString() : '{}', getIgnoredSettings(this.configurationService), formatUtils);
				}
				await this.apply(content, true);
				this.setStatus(SyncStatus.Idle);
			} catch (e) {
				this.logService.error(e);
				if ((e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) ||
					(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
					throw new Error('New local version available.');
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
				this.logService.info('Settings: Failed to synchronise settings as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			if ((e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) ||
				(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
				// Rejected as there is a new local version. Syncing again.
				this.logService.info('Settings: Failed to synchronise settings as there is a new local version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		}
	}

	private async apply(content?: string, forcePush?: boolean): Promise<void> {
		if (!this.syncPreviewResultPromise) {
			return;
		}

		let { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged } = await this.syncPreviewResultPromise;

		if (content === undefined) {
			if (await this.fileService.exists(this.environmentService.settingsSyncPreviewResource)) {
				const settingsPreivew = await this.fileService.readFile(this.environmentService.settingsSyncPreviewResource);
				content = settingsPreivew.value.toString();
			}
		}

		if (content !== undefined) {

			if (this.hasErrors(content)) {
				const error = new Error(localize('errorInvalidSettings', "Unable to sync settings. Please resolve conflicts without any errors/warnings and try again."));
				this.logService.error(error);
				throw error;
			}

			if (!hasLocalChanged && !hasRemoteChanged) {
				this.logService.trace('Settings: No changes found during synchronizing settings.');
			}
			if (hasLocalChanged) {
				this.logService.info('Settings: Updating local settings');
				await this.updateLocalFileContent(content, fileContent);
			}
			if (hasRemoteChanged) {
				const formatUtils = await this.getFormattingOptions();
				content = updateIgnoredSettings(content, remoteUserData.content || '{}', getIgnoredSettings(this.configurationService, content), formatUtils);
				this.logService.info('Settings: Updating remote settings');
				const ref = await this.updateRemoteUserData(content, forcePush ? null : remoteUserData.ref);
				remoteUserData = { ref, content };
			}

			// Delete the preview
			await this.fileService.del(this.environmentService.settingsSyncPreviewResource);
		} else {
			this.logService.trace('Settings: No changes found during synchronizing settings.');
		}

		if (remoteUserData.content) {
			this.logService.info('Settings: Updating last synchronised settings');
			await this.updateLastSyncUserData(remoteUserData);
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
		const lastSyncData = await this.getLastSyncUserData();
		const remoteUserData = await this.getRemoteUserData(lastSyncData);
		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;
		let conflictSettings: IConflictSetting[] = [];
		let previewContent: string | null = null;
		let remoteContent: string | null = null;

		if (remoteUserData.content) {
			const localContent: string = fileContent ? fileContent.value.toString() : '{}';

			// No action when there are errors
			if (this.hasErrors(localContent)) {
				this.logService.error('Settings: Unable to sync settings as there are errors/warning in settings file.');
			}

			else {
				this.logService.trace('Settings: Merging remote settings with local settings...');
				const formatUtils = await this.getFormattingOptions();
				const result = merge(localContent, remoteUserData.content, lastSyncData ? lastSyncData.content : null, getIgnoredSettings(this.configurationService), resolvedConflicts, formatUtils);
				hasConflicts = result.hasConflicts;
				hasLocalChanged = result.localContent !== null;
				hasRemoteChanged = result.remoteContent !== null;
				conflictSettings = result.conflictsSettings;
				remoteContent = result.remoteContent;
				previewContent = result.localContent || result.remoteContent;
			}
		}

		// First time syncing to remote
		else if (fileContent) {
			this.logService.trace('Settings: Remote settings does not exist. Synchronizing settings for the first time.');
			hasRemoteChanged = true;
			previewContent = fileContent.value.toString();
			remoteContent = fileContent.value.toString();
		}

		if (previewContent && !token.isCancellationRequested) {
			await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(previewContent));
		}

		this.setConflicts(conflictSettings);
		return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, remoteContent, conflictSettings, hasConflicts };
	}

	private _formattingOptions: Promise<FormattingOptions> | undefined = undefined;
	private getFormattingOptions(): Promise<FormattingOptions> {
		if (!this._formattingOptions) {
			this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.environmentService.settingsResource);
		}
		return this._formattingOptions;
	}

}

export function getIgnoredSettings(configurationService: IConfigurationService, settingsContent?: string): string[] {
	let value: string[] = [];
	if (settingsContent) {
		const setting = parse(settingsContent);
		if (setting) {
			value = setting['sync.ignoredSettings'];
		}
	} else {
		value = configurationService.getValue<string[]>('sync.ignoredSettings');
	}
	const added: string[] = [], removed: string[] = [];
	if (Array.isArray(value)) {
		for (const key of value) {
			if (startsWith(key, '-')) {
				removed.push(key.substring(1));
			} else {
				added.push(key);
			}
		}
	}
	return [...DEFAULT_IGNORED_SETTINGS, ...added].filter(setting => removed.indexOf(setting) === -1);
}
