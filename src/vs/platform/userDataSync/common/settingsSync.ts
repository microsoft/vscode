/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent } from 'vs/platform/files/common/files';
import { IUserData, UserDataSyncStoreError, UserDataSyncStoreErrorCode, ISynchroniser, SyncStatus, IUserDataSyncStoreService, DEFAULT_IGNORED_SETTINGS, IUserDataSyncLogService, IUserDataSyncUtilService } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, ParseError } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { joinPath, dirname } from 'vs/base/common/resources';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { startsWith } from 'vs/base/common/strings';
import { CancellationToken } from 'vs/base/common/cancellation';
import { computeRemoteContent, merge } from 'vs/platform/userDataSync/common/settingsMerge';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly hasConflicts: boolean;
}

export class SettingsSynchroniser extends Disposable implements ISynchroniser {

	private static EXTERNAL_USER_DATA_SETTINGS_KEY: string = 'settings';

	private syncPreviewResultPromise: CancelablePromise<ISyncPreviewResult> | null = null;

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	private readonly lastSyncSettingsResource: URI;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IUserDataSyncUtilService private readonly userDataSyncUtilService: IUserDataSyncUtilService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this.lastSyncSettingsResource = joinPath(this.environmentService.userRoamingDataHome, '.lastSyncSettings.json');
		this._register(this.fileService.watch(dirname(this.environmentService.settingsResource)));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.environmentService.settingsResource))(() => this._onDidChangeLocal.fire()));
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	async sync(_continue?: boolean): Promise<boolean> {
		if (!this.configurationService.getValue<boolean>('sync.enableSettings')) {
			this.logService.trace('Settings: Skipping synchronizing settings as it is disabled.');
			return false;
		}

		if (_continue) {
			this.logService.info('Settings: Resumed synchronizing settings');
			return this.continueSync();
		}

		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('Settings: Skipping synchronizing settings as it is running already.');
			return false;
		}

		this.logService.trace('Settings: Started synchronizing settings...');
		this.setStatus(SyncStatus.Syncing);

		try {
			const result = await this.getPreview();
			if (result.hasConflicts) {
				this.logService.info('Settings: Detected conflicts while synchronizing settings.');
				this.setStatus(SyncStatus.HasConflicts);
				return false;
			}
			await this.apply();
			return true;
		} catch (e) {
			this.syncPreviewResultPromise = null;
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncStoreError && e.code === UserDataSyncStoreErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('Settings: Failed to synchronise settings as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			if (e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) {
				// Rejected as there is a new local version. Syncing again.
				this.logService.info('Settings: Failed to synchronise settings as there is a new local version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		}
	}

	stop(): void {
		if (this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise.cancel();
			this.syncPreviewResultPromise = null;
			this.logService.info('Settings: Stopped synchronizing settings.');
		}
		this.fileService.del(this.environmentService.settingsSyncPreviewResource);
		this.setStatus(SyncStatus.Idle);
	}

	private async continueSync(): Promise<boolean> {
		if (this.status === SyncStatus.HasConflicts) {
			await this.apply();
		}
		return true;
	}

	private async apply(): Promise<void> {
		if (!this.syncPreviewResultPromise) {
			return;
		}

		if (await this.fileService.exists(this.environmentService.settingsSyncPreviewResource)) {
			const settingsPreivew = await this.fileService.readFile(this.environmentService.settingsSyncPreviewResource);
			const content = settingsPreivew.value.toString();
			if (this.hasErrors(content)) {
				const error = new Error(localize('errorInvalidSettings', "Unable to sync settings. Please resolve conflicts without any errors/warnings and try again."));
				this.logService.error(error);
				throw error;
			}

			let { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged } = await this.syncPreviewResultPromise;
			if (!hasLocalChanged && !hasRemoteChanged) {
				this.logService.trace('Settings: No changes found during synchronizing settings.');
			}
			if (hasLocalChanged) {
				this.logService.info('Settings: Updating local settings');
				await this.writeToLocal(content, fileContent);
			}
			if (hasRemoteChanged) {
				const formatUtils = await this.getFormattingOptions();
				const remoteContent = remoteUserData.content ? computeRemoteContent(content, remoteUserData.content, this.getIgnoredSettings(content), formatUtils) : content;
				this.logService.info('Settings: Updating remote settings');
				const ref = await this.writeToRemote(remoteContent, remoteUserData.ref);
				remoteUserData = { ref, content };
			}
			if (remoteUserData.content) {
				this.logService.info('Settings: Updating last synchronised sttings');
				await this.updateLastSyncValue(remoteUserData);
			}

			// Delete the preview
			await this.fileService.del(this.environmentService.settingsSyncPreviewResource);
		} else {
			this.logService.trace('Settings: No changes found during synchronizing settings.');
		}

		this.logService.trace('Settings: Finised synchronizing settings.');
		this.syncPreviewResultPromise = null;
		this.setStatus(SyncStatus.Idle);
	}

	private hasErrors(content: string): boolean {
		const parseErrors: ParseError[] = [];
		parse(content, parseErrors, { allowEmptyContent: true, allowTrailingComma: true });
		return parseErrors.length > 0;
	}

	private getPreview(): Promise<ISyncPreviewResult> {
		if (!this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise = createCancelablePromise(token => this.generatePreview(token));
		}
		return this.syncPreviewResultPromise;
	}

	private async generatePreview(token: CancellationToken): Promise<ISyncPreviewResult> {
		const lastSyncData = await this.getLastSyncUserData();
		const remoteUserData = await this.userDataSyncStoreService.read(SettingsSynchroniser.EXTERNAL_USER_DATA_SETTINGS_KEY, lastSyncData);
		const remoteContent: string | null = remoteUserData.content;
		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;
		let previewContent = null;

		if (remoteContent) {
			const localContent: string = fileContent ? fileContent.value.toString() : '{}';
			if (this.hasErrors(localContent)) {
				this.logService.error('Settings: Unable to sync settings as there are errors/warning in settings file.');
				return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
			}

			if (!lastSyncData // First time sync
				|| lastSyncData.content !== localContent // Local has forwarded
				|| lastSyncData.content !== remoteContent // Remote has forwarded
			) {
				this.logService.trace('Settings: Merging remote settings with local settings...');
				const formatUtils = await this.getFormattingOptions();
				const result = merge(localContent, remoteContent, lastSyncData ? lastSyncData.content : null, this.getIgnoredSettings(), formatUtils);
				// Sync only if there are changes
				if (result.hasChanges) {
					hasLocalChanged = result.mergeContent !== localContent;
					hasRemoteChanged = result.mergeContent !== remoteContent;
					hasConflicts = result.hasConflicts;
					previewContent = result.mergeContent;
				}
			}
		}

		// First time syncing to remote
		else if (fileContent) {
			this.logService.info('Settings: Remote settings does not exist. Synchronizing settings for the first time.');
			hasRemoteChanged = true;
			previewContent = fileContent.value.toString();
		}

		if (previewContent && !token.isCancellationRequested) {
			await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(previewContent));
		}

		return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
	}

	private _formattingOptions: Promise<FormattingOptions> | undefined = undefined;
	private getFormattingOptions(): Promise<FormattingOptions> {
		if (!this._formattingOptions) {
			this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.environmentService.settingsResource);
		}
		return this._formattingOptions;
	}

	private getIgnoredSettings(settingsContent?: string): string[] {
		let value: string[] = [];
		if (settingsContent) {
			const setting = parse(settingsContent);
			if (setting) {
				value = setting['sync.ignoredSettings'];
			}
		} else {
			value = this.configurationService.getValue<string[]>('sync.ignoredSettings');
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

	private async getLastSyncUserData(): Promise<IUserData | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncSettingsResource);
			return JSON.parse(content.value.toString());
		} catch (error) {
			return null;
		}
	}

	private async getLocalFileContent(): Promise<IFileContent | null> {
		try {
			return await this.fileService.readFile(this.environmentService.settingsResource);
		} catch (error) {
			return null;
		}
	}

	private async writeToRemote(content: string, ref: string | null): Promise<string> {
		return this.userDataSyncStoreService.write(SettingsSynchroniser.EXTERNAL_USER_DATA_SETTINGS_KEY, content, ref);
	}

	private async writeToLocal(newContent: string, oldContent: IFileContent | null): Promise<void> {
		if (oldContent) {
			// file exists already
			await this.fileService.writeFile(this.environmentService.settingsResource, VSBuffer.fromString(newContent), oldContent);
		} else {
			// file does not exist
			await this.fileService.createFile(this.environmentService.settingsResource, VSBuffer.fromString(newContent), { overwrite: false });
		}
	}

	private async updateLastSyncValue(remoteUserData: IUserData): Promise<void> {
		await this.fileService.writeFile(this.lastSyncSettingsResource, VSBuffer.fromString(JSON.stringify(remoteUserData)));
	}

}
