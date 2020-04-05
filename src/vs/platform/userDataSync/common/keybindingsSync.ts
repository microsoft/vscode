/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IUserDataSyncUtilService, SyncResource, IUserDataSynchroniser, IUserDataSyncEnablementService, IUserDataSyncBackupStoreService, USER_DATA_SYNC_SCHEME, PREVIEW_DIR_NAME, ISyncResourceHandle } from 'vs/platform/userDataSync/common/userDataSync';
import { merge } from 'vs/platform/userDataSync/common/keybindingsMerge';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { createCancelablePromise } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { isUndefined } from 'vs/base/common/types';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { IFileSyncPreviewResult, AbstractJsonFileSynchroniser, IRemoteUserData } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { URI } from 'vs/base/common/uri';
import { joinPath, isEqual, dirname, basename } from 'vs/base/common/resources';

interface ISyncContent {
	mac?: string;
	linux?: string;
	windows?: string;
	all?: string;
}

export class KeybindingsSynchroniser extends AbstractJsonFileSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;
	protected readonly localPreviewResource: URI = joinPath(this.syncFolder, PREVIEW_DIR_NAME, 'keybindings.json');
	protected readonly remotePreviewResource: URI = this.localPreviewResource.with({ scheme: USER_DATA_SYNC_SCHEME });

	constructor(
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncEnablementService userDataSyncEnablementService: IUserDataSyncEnablementService,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IUserDataSyncUtilService userDataSyncUtilService: IUserDataSyncUtilService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(environmentService.keybindingsResource, SyncResource.Keybindings, fileService, environmentService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService);
	}

	async pull(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pulling keybindings as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pulling keybindings...`);
			this.setStatus(SyncStatus.Syncing);

			const lastSyncUserData = await this.getLastSyncUserData();
			const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
			const content = remoteUserData.syncData !== null ? this.getKeybindingsContentFromSyncContent(remoteUserData.syncData.content) : null;

			if (content !== null) {
				const fileContent = await this.getLocalFileContent();
				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<IFileSyncPreviewResult>({
					fileContent,
					remoteUserData,
					lastSyncUserData,
					content,
					hasConflicts: false,
					hasLocalChanged: true,
					hasRemoteChanged: false,
				}));
				await this.apply();
			}

			// No remote exists to pull
			else {
				this.logService.info(`${this.syncResourceLogLabel}: Remote keybindings does not exist.`);
			}

			this.logService.info(`${this.syncResourceLogLabel}: Finished pulling keybindings.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async push(): Promise<void> {
		if (!this.isEnabled()) {
			this.logService.info(`${this.syncResourceLogLabel}: Skipped pushing keybindings as it is disabled.`);
			return;
		}

		this.stop();

		try {
			this.logService.info(`${this.syncResourceLogLabel}: Started pushing keybindings...`);
			this.setStatus(SyncStatus.Syncing);

			const fileContent = await this.getLocalFileContent();

			if (fileContent !== null) {
				const lastSyncUserData = await this.getLastSyncUserData();
				const remoteUserData = await this.getRemoteUserData(lastSyncUserData);
				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<IFileSyncPreviewResult>({
					fileContent,
					remoteUserData,
					lastSyncUserData,
					content: fileContent.value.toString(),
					hasLocalChanged: false,
					hasRemoteChanged: true,
					hasConflicts: false,
				}));
				await this.apply(true);
			}

			// No local exists to push
			else {
				this.logService.info(`${this.syncResourceLogLabel}: Local keybindings does not exist.`);
			}

			this.logService.info(`${this.syncResourceLogLabel}: Finished pushing keybindings.`);
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async acceptConflict(conflict: URI, content: string): Promise<void> {
		if (this.status === SyncStatus.HasConflicts
			&& (isEqual(this.localPreviewResource, conflict) || isEqual(this.remotePreviewResource, conflict))
		) {
			const preview = await this.syncPreviewResultPromise!;
			this.cancel();
			this.syncPreviewResultPromise = createCancelablePromise(async () => ({ ...preview, content }));
			await this.apply(true);
			this.setStatus(SyncStatus.Idle);
		}
	}

	async hasLocalData(): Promise<boolean> {
		try {
			const localFileContent = await this.getLocalFileContent();
			if (localFileContent) {
				const keybindings = parse(localFileContent.value.toString());
				if (isNonEmptyArray(keybindings)) {
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

	async getAssociatedResources({ uri }: ISyncResourceHandle): Promise<{ resource: URI, comparableResource?: URI }[]> {
		return [{ resource: joinPath(uri, 'keybindings.json'), comparableResource: this.file }];
	}

	async resolveContent(uri: URI): Promise<string | null> {
		if (isEqual(this.remotePreviewResource, uri)) {
			return this.getConflictContent(uri);
		}
		let content = await super.resolveContent(uri);
		if (content) {
			return content;
		}
		content = await super.resolveContent(dirname(uri));
		if (content) {
			const syncData = this.parseSyncData(content);
			if (syncData) {
				switch (basename(uri)) {
					case 'keybindings.json':
						return this.getKeybindingsContentFromSyncContent(syncData.content);
				}
			}
		}
		return null;
	}

	protected async getConflictContent(conflictResource: URI): Promise<string | null> {
		const content = await super.getConflictContent(conflictResource);
		return content !== null ? this.getKeybindingsContentFromSyncContent(content) : null;
	}

	protected async performSync(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<SyncStatus> {
		try {
			const result = await this.getPreview(remoteUserData, lastSyncUserData);
			if (result.hasConflicts) {
				return SyncStatus.HasConflicts;
			}
			await this.apply();
			return SyncStatus.Idle;
		} catch (e) {
			this.syncPreviewResultPromise = null;
			if (e instanceof UserDataSyncError) {
				switch (e.code) {
					case UserDataSyncErrorCode.LocalPreconditionFailed:
						// Rejected as there is a new local version. Syncing again.
						this.logService.info(`${this.syncResourceLogLabel}: Failed to synchronize keybindings as there is a new local version available. Synchronizing again...`);
						return this.performSync(remoteUserData, lastSyncUserData);
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
				throw new UserDataSyncError(localize('errorInvalidSettings', "Unable to sync keybindings as there are errors/warning in keybindings file."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
			}

			if (hasLocalChanged) {
				this.logService.trace(`${this.syncResourceLogLabel}: Updating local keybindings...`);
				if (fileContent) {
					await this.backupLocal(this.toSyncContent(fileContent.value.toString(), null));
				}
				await this.updateLocalFileContent(content, fileContent);
				this.logService.info(`${this.syncResourceLogLabel}: Updated local keybindings`);
			}

			if (hasRemoteChanged) {
				this.logService.trace(`${this.syncResourceLogLabel}: Updating remote keybindings...`);
				const remoteContents = this.toSyncContent(content, remoteUserData.syncData ? remoteUserData.syncData.content : null);
				remoteUserData = await this.updateRemoteUserData(remoteContents, forcePush ? null : remoteUserData.ref);
				this.logService.info(`${this.syncResourceLogLabel}: Updated remote keybindings`);
			}

			// Delete the preview
			try {
				await this.fileService.del(this.localPreviewResource);
			} catch (e) { /* ignore */ }
		} else {
			this.logService.info(`${this.syncResourceLogLabel}: No changes found during synchronizing keybindings.`);
		}

		if (lastSyncUserData?.ref !== remoteUserData.ref && (content !== null || fileContent !== null)) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized keybindings...`);
			const lastSyncContent = this.toSyncContent(content !== null ? content : fileContent!.value.toString(), null);
			await this.updateLastSyncUserData({ ref: remoteUserData.ref, syncData: { version: remoteUserData.syncData!.version, content: lastSyncContent } });
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized keybindings`);
		}

		this.syncPreviewResultPromise = null;
	}

	private getPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<IFileSyncPreviewResult> {
		if (!this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise = createCancelablePromise(token => this.generatePreview(remoteUserData, lastSyncUserData, token));
		}
		return this.syncPreviewResultPromise;
	}

	protected async generatePreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken = CancellationToken.None): Promise<IFileSyncPreviewResult> {
		const remoteContent = remoteUserData.syncData ? this.getKeybindingsContentFromSyncContent(remoteUserData.syncData.content) : null;
		const lastSyncContent = lastSyncUserData && lastSyncUserData.syncData ? this.getKeybindingsContentFromSyncContent(lastSyncUserData.syncData.content) : null;
		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		const formattingOptions = await this.getFormattingOptions();

		let content: string | null = null;
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;

		if (remoteContent) {
			const localContent: string = fileContent ? fileContent.value.toString() : '[]';
			if (this.hasErrors(localContent)) {
				throw new UserDataSyncError(localize('errorInvalidSettings', "Unable to sync keybindings as there are errors/warning in keybindings file."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
			}

			if (!lastSyncContent // First time sync
				|| lastSyncContent !== localContent // Local has forwarded
				|| lastSyncContent !== remoteContent // Remote has forwarded
			) {
				this.logService.trace(`${this.syncResourceLogLabel}: Merging remote keybindings with local keybindings...`);
				const result = await merge(localContent, remoteContent, lastSyncContent, formattingOptions, this.userDataSyncUtilService);
				// Sync only if there are changes
				if (result.hasChanges) {
					content = result.mergeContent;
					hasConflicts = result.hasConflicts;
					hasLocalChanged = hasConflicts || result.mergeContent !== localContent;
					hasRemoteChanged = hasConflicts || result.mergeContent !== remoteContent;
				}
			}
		}

		// First time syncing to remote
		else if (fileContent) {
			this.logService.trace(`${this.syncResourceLogLabel}: Remote keybindings does not exist. Synchronizing keybindings for the first time.`);
			content = fileContent.value.toString();
			hasRemoteChanged = true;
		}

		if (content && !token.isCancellationRequested) {
			await this.fileService.writeFile(this.localPreviewResource, VSBuffer.fromString(content));
		}

		this.setConflicts(hasConflicts && !token.isCancellationRequested ? [{ local: this.localPreviewResource, remote: this.remotePreviewResource }] : []);

		return { fileContent, remoteUserData, lastSyncUserData, content, hasLocalChanged, hasRemoteChanged, hasConflicts };
	}

	private getKeybindingsContentFromSyncContent(syncContent: string): string | null {
		try {
			const parsed = <ISyncContent>JSON.parse(syncContent);
			if (!this.configurationService.getValue<boolean>('sync.keybindingsPerPlatform')) {
				return isUndefined(parsed.all) ? null : parsed.all;
			}
			switch (OS) {
				case OperatingSystem.Macintosh:
					return isUndefined(parsed.mac) ? null : parsed.mac;
				case OperatingSystem.Linux:
					return isUndefined(parsed.linux) ? null : parsed.linux;
				case OperatingSystem.Windows:
					return isUndefined(parsed.windows) ? null : parsed.windows;
			}
		} catch (e) {
			this.logService.error(e);
			return null;
		}
	}

	private toSyncContent(keybindingsContent: string, syncContent: string | null): string {
		let parsed: ISyncContent = {};
		try {
			parsed = JSON.parse(syncContent || '{}');
		} catch (e) {
			this.logService.error(e);
		}
		if (!this.configurationService.getValue<boolean>('sync.keybindingsPerPlatform')) {
			parsed.all = keybindingsContent;
		} else {
			delete parsed.all;
		}
		switch (OS) {
			case OperatingSystem.Macintosh:
				parsed.mac = keybindingsContent;
				break;
			case OperatingSystem.Linux:
				parsed.linux = keybindingsContent;
				break;
			case OperatingSystem.Windows:
				parsed.windows = keybindingsContent;
				break;
		}
		return JSON.stringify(parsed);
	}

}
