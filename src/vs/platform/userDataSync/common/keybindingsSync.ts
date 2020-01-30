/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import { IUserData, UserDataSyncError, UserDataSyncErrorCode, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IUserDataSyncUtilService, SyncSource, IUserDataSynchroniser } from 'vs/platform/userDataSync/common/userDataSync';
import { merge } from 'vs/platform/userDataSync/common/keybindingsMerge';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, ParseError } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { CancelablePromise, createCancelablePromise } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { isUndefined } from 'vs/base/common/types';
import { FormattingOptions } from 'vs/base/common/jsonFormatter';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { AbstractFileSynchroniser } from 'vs/platform/userDataSync/common/abstractSynchronizer';

interface ISyncContent {
	mac?: string;
	linux?: string;
	windows?: string;
	all?: string;
}

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly hasConflicts: boolean;
}

export class KeybindingsSynchroniser extends AbstractFileSynchroniser implements IUserDataSynchroniser {

	private syncPreviewResultPromise: CancelablePromise<ISyncPreviewResult> | null = null;

	constructor(
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserDataSyncUtilService private readonly userDataSyncUtilService: IUserDataSyncUtilService,
	) {
		super(environmentService.keybindingsResource, SyncSource.Keybindings, fileService, environmentService, userDataSyncStoreService);
	}

	protected getRemoteDataResourceKey(): string { return 'keybindings'; }

	async pull(): Promise<void> {
		if (!this.configurationService.getValue<boolean>('sync.enableKeybindings')) {
			this.logService.info('Keybindings: Skipped pulling keybindings as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('Keybindings: Started pulling keybindings...');
			this.setStatus(SyncStatus.Syncing);

			const remoteUserData = await this.getRemoteUserData();
			const remoteContent = remoteUserData.content !== null ? this.getKeybindingsContentFromSyncContent(remoteUserData.content) : null;

			if (remoteContent !== null) {
				await this.fileService.writeFile(this.environmentService.keybindingsSyncPreviewResource, VSBuffer.fromString(remoteContent));
				const fileContent = await this.getLocalFileContent();
				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<ISyncPreviewResult>({
					fileContent,
					hasConflicts: false,
					hasLocalChanged: true,
					hasRemoteChanged: false,
					remoteUserData
				}));
				await this.apply();
			}

			// No remote exists to pull
			else {
				this.logService.info('Keybindings: Remote keybindings does not exist.');
			}

			this.logService.info('Keybindings: Finished pulling keybindings.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async push(): Promise<void> {
		if (!this.configurationService.getValue<boolean>('sync.enableKeybindings')) {
			this.logService.info('Keybindings: Skipped pushing keybindings as it is disabled.');
			return;
		}

		this.stop();

		try {
			this.logService.info('Keybindings: Started pushing keybindings...');
			this.setStatus(SyncStatus.Syncing);

			const fileContent = await this.getLocalFileContent();

			if (fileContent !== null) {
				const remoteUserData = await this.getRemoteUserData();
				await this.fileService.writeFile(this.environmentService.settingsSyncPreviewResource, fileContent.value);
				this.syncPreviewResultPromise = createCancelablePromise(() => Promise.resolve<ISyncPreviewResult>({
					fileContent,
					hasConflicts: false,
					hasLocalChanged: false,
					hasRemoteChanged: true,
					remoteUserData
				}));
				await this.apply(undefined, true);
			}

			// No local exists to push
			else {
				this.logService.info('Keybindings: Local keybindings does not exist.');
			}

			this.logService.info('Keybindings: Finished pushing keybindings.');
		} finally {
			this.setStatus(SyncStatus.Idle);
		}

	}

	async sync(): Promise<void> {
		if (!this.configurationService.getValue<boolean>('sync.enableKeybindings')) {
			this.logService.trace('Keybindings: Skipping synchronizing keybindings as it is disabled.');
			return;
		}

		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('Keybindings: Skipping synchronizing keybindings as it is running already.');
			return;
		}

		this.logService.trace('Keybindings: Started synchronizing keybindings...');
		this.setStatus(SyncStatus.Syncing);

		return this.doSync();
	}

	async stop(): Promise<void> {
		if (this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise.cancel();
			this.syncPreviewResultPromise = null;
			this.logService.trace('Keybindings: Stopped synchronizing keybindings.');
		}
		await this.fileService.del(this.environmentService.keybindingsSyncPreviewResource);
		this.setStatus(SyncStatus.Idle);
	}

	async restart(): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			this.syncPreviewResultPromise!.cancel();
			this.syncPreviewResultPromise = null;
			await this.doSync();
		}
	}

	async resolveConflicts(content: string, remote: boolean): Promise<void> {
		if (this.status === SyncStatus.HasConflicts) {
			try {
				await this.apply(content, true);
				this.setStatus(SyncStatus.Idle);
			} catch (e) {
				this.logService.error(e);
				if ((e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) ||
					(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
					throw new Error('Failed to resolve conflicts as there is a new local version available.');
				}
				throw e;
			}
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

	async getRemoteContent(): Promise<string | null> {
		let content: string | null | undefined = null;
		if (this.syncPreviewResultPromise) {
			const preview = await this.syncPreviewResultPromise;
			content = preview.remoteUserData?.content;
		} else {
			const remoteUserData = await this.getRemoteUserData();
			content = remoteUserData.content;
		}
		return content ? this.getKeybindingsContentFromSyncContent(content) : null;
	}

	private async doSync(): Promise<void> {
		try {
			const result = await this.getPreview();
			if (result.hasConflicts) {
				this.logService.info('Keybindings: Detected conflicts while synchronizing keybindings.');
				this.setStatus(SyncStatus.HasConflicts);
				return;
			}
			try {
				await this.apply();
				this.logService.trace('Keybindings: Finished synchronizing keybindings...');
			} finally {
				this.setStatus(SyncStatus.Idle);
			}
		} catch (e) {
			this.syncPreviewResultPromise = null;
			this.setStatus(SyncStatus.Idle);
			if (e instanceof UserDataSyncError && e.code === UserDataSyncErrorCode.Rejected) {
				// Rejected as there is a new remote version. Syncing again,
				this.logService.info('Keybindings: Failed to synchronise keybindings as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			if ((e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) ||
				(e instanceof FileOperationError && e.fileOperationResult === FileOperationResult.FILE_MODIFIED_SINCE)) {
				// Rejected as there is a new local version. Syncing again.
				this.logService.info('Keybindings: Failed to synchronise keybindings as there is a new local version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		}
	}

	private async apply(content?: string, forcePush?: boolean): Promise<void> {
		if (!this.syncPreviewResultPromise) {
			return;
		}

		if (content === undefined) {
			if (await this.fileService.exists(this.environmentService.keybindingsSyncPreviewResource)) {
				const keybindingsPreivew = await this.fileService.readFile(this.environmentService.keybindingsSyncPreviewResource);
				content = keybindingsPreivew.value.toString();
			}
		}

		if (content !== undefined) {
			if (this.hasErrors(content)) {
				const error = new Error(localize('errorInvalidKeybindings', "Unable to sync keybindings. Please resolve conflicts without any errors/warnings and try again."));
				this.logService.error(error);
				throw error;
			}

			let { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged } = await this.syncPreviewResultPromise;
			if (!hasLocalChanged && !hasRemoteChanged) {
				this.logService.trace('Keybindings: No changes found during synchronizing keybindings.');
			}
			if (hasLocalChanged) {
				this.logService.info('Keybindings: Updating local keybindings');
				await this.updateLocalFileContent(content, fileContent);
			}
			if (hasRemoteChanged) {
				this.logService.info('Keybindings: Updating remote keybindings');
				const remoteContents = this.updateSyncContent(content, remoteUserData.content);
				const ref = await this.updateRemoteUserData(remoteContents, forcePush ? null : remoteUserData.ref);
				remoteUserData = { ref, content: remoteContents };
			}
			if (remoteUserData?.content) {
				this.logService.info('Keybindings: Updating last synchronised keybindings');
				const lastSyncContent = this.updateSyncContent(content, null);
				await this.updateLastSyncUserData({ ref: remoteUserData.ref, content: lastSyncContent });
			}

			// Delete the preview
			await this.fileService.del(this.environmentService.keybindingsSyncPreviewResource);
		} else {
			this.logService.trace('Keybindings: No changes found during synchronizing keybindings.');
		}

		this.syncPreviewResultPromise = null;
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
		const lastSyncContent = lastSyncData && lastSyncData.content ? this.getKeybindingsContentFromSyncContent(lastSyncData.content) : null;
		const remoteUserData = await this.getRemoteUserData(lastSyncData);
		const remoteContent = remoteUserData.content ? this.getKeybindingsContentFromSyncContent(remoteUserData.content) : null;
		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;
		let previewContent = null;

		if (remoteContent) {
			const localContent: string = fileContent ? fileContent.value.toString() : '[]';
			if (this.hasErrors(localContent)) {
				this.logService.error('Keybindings: Unable to sync keybindings as there are errors/warning in keybindings file.');
				return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
			}

			if (!lastSyncContent // First time sync
				|| lastSyncContent !== localContent // Local has forwarded
				|| lastSyncContent !== remoteContent // Remote has forwarded
			) {
				this.logService.trace('Keybindings: Merging remote keybindings with local keybindings...');
				const formattingOptions = await this.getFormattingOptions();
				const result = await merge(localContent, remoteContent, lastSyncContent, formattingOptions, this.userDataSyncUtilService);
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
			this.logService.trace('Keybindings: Remote keybindings does not exist. Synchronizing keybindings for the first time.');
			hasRemoteChanged = true;
			previewContent = fileContent.value.toString();
		}

		if (previewContent && !token.isCancellationRequested) {
			await this.fileService.writeFile(this.environmentService.keybindingsSyncPreviewResource, VSBuffer.fromString(previewContent));
		}

		return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
	}

	private _formattingOptions: Promise<FormattingOptions> | undefined = undefined;
	private getFormattingOptions(): Promise<FormattingOptions> {
		if (!this._formattingOptions) {
			this._formattingOptions = this.userDataSyncUtilService.resolveFormattingOptions(this.environmentService.keybindingsResource);
		}
		return this._formattingOptions;
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

	private updateSyncContent(keybindingsContent: string, syncContent: string | null): string {
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
