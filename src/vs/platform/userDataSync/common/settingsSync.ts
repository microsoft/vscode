/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent } from 'vs/platform/files/common/files';
import { IUserData, UserDataSyncStoreError, UserDataSyncStoreErrorCode, ISynchroniser, SyncStatus, ISettingsMergeService, IUserDataSyncStoreService } from 'vs/platform/userDataSync/common/userDataSync';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, ParseError } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { CancelablePromise, createCancelablePromise, ThrottledDelayer } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData | null;
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

	private readonly throttledDelayer: ThrottledDelayer<void>;
	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	private readonly lastSyncSettingsResource: URI;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@ISettingsMergeService private readonly settingsMergeService: ISettingsMergeService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
		this.lastSyncSettingsResource = joinPath(this.environmentService.appSettingsHome, '.lastSyncSettings.json');
		this.throttledDelayer = this._register(new ThrottledDelayer<void>(500));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.environmentService.settingsResource))(() => this.throttledDelayer.trigger(() => this.onDidChangeSettings())));
	}

	private async onDidChangeSettings(): Promise<void> {
		const localFileContent = await this.getLocalFileContent();
		const lastSyncData = await this.getLastSyncUserData();
		if (localFileContent && lastSyncData) {
			if (localFileContent.value.toString() !== lastSyncData.content) {
				this._onDidChangeLocal.fire();
				return;
			}
		}
		if (!localFileContent || !lastSyncData) {
			this._onDidChangeLocal.fire();
			return;
		}
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	async sync(_continue?: boolean): Promise<boolean> {

		if (_continue) {
			return this.continueSync();
		}

		if (this.status !== SyncStatus.Idle) {
			return false;
		}

		this.setStatus(SyncStatus.Syncing);

		try {
			const result = await this.getPreview();
			if (result.hasConflicts) {
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
				this.logService.info('Failed to Synchronise settings as there is a new remote version available. Synchronising again...');
				return this.sync();
			}
			if (e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) {
				// Rejected as there is a new local version. Syncing again.
				this.logService.info('Failed to Synchronise settings as there is a new local version available. Synchronising again...');
				return this.sync();
			}
			throw e;
		}
	}

	private async continueSync(): Promise<boolean> {
		if (this.status !== SyncStatus.HasConflicts) {
			return false;
		}
		await this.apply();
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
				return Promise.reject(localize('errorInvalidSettings', "Unable to sync settings. Please resolve conflicts without any errors/warnings and try again."));
			}

			let { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged } = await this.syncPreviewResultPromise;
			if (hasRemoteChanged) {
				const ref = await this.writeToRemote(content, remoteUserData ? remoteUserData.ref : null);
				remoteUserData = { ref, content };
			}
			if (hasLocalChanged) {
				await this.writeToLocal(content, fileContent);
			}
			if (remoteUserData) {
				await this.updateLastSyncValue(remoteUserData);
			}

			// Delete the preview
			await this.fileService.del(this.environmentService.settingsSyncPreviewResource);
		}

		this.syncPreviewResultPromise = null;
		this.setStatus(SyncStatus.Idle);
	}

	private hasErrors(content: string): boolean {
		const parseErrors: ParseError[] = [];
		parse(content, parseErrors);
		return parseErrors.length > 0;
	}

	private getPreview(): Promise<ISyncPreviewResult> {
		if (!this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise = createCancelablePromise(token => this.generatePreview());
		}
		return this.syncPreviewResultPromise;
	}

	private async generatePreview(): Promise<ISyncPreviewResult> {
		const remoteUserData = await this.userDataSyncStoreService.read(SettingsSynchroniser.EXTERNAL_USER_DATA_SETTINGS_KEY);
		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;

		// First time sync to remote
		if (fileContent && !remoteUserData) {
			this.logService.trace('Settings Sync: Remote contents does not exist. So sync with settings file.');
			hasRemoteChanged = true;
			await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(fileContent.value.toString()));
			return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
		}

		// Settings file does not exist, so sync with remote contents.
		if (remoteUserData && !fileContent) {
			this.logService.trace('Settings Sync: Settings file does not exist. So sync with remote contents');
			hasLocalChanged = true;
			await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(remoteUserData.content));
			return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
		}

		if (fileContent && remoteUserData) {
			const localContent: string = fileContent.value.toString();
			const remoteContent: string = remoteUserData.content;
			const lastSyncData = await this.getLastSyncUserData();
			if (!lastSyncData // First time sync
				|| lastSyncData.content !== localContent // Local has moved forwarded
				|| lastSyncData.content !== remoteContent // Remote has moved forwarded
			) {
				this.logService.trace('Settings Sync: Merging remote contents with settings file.');
				const mergeContent = await this.settingsMergeService.merge(localContent, remoteContent, lastSyncData ? lastSyncData.content : null);
				hasLocalChanged = mergeContent !== localContent;
				hasRemoteChanged = mergeContent !== remoteContent;
				if (hasLocalChanged || hasRemoteChanged) {
					// Sync only if there are changes
					hasConflicts = this.hasErrors(mergeContent);
					await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, VSBuffer.fromString(mergeContent));
					return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
				}
			}
		}

		this.logService.trace('Settings Sync: No changes.');
		return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
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
