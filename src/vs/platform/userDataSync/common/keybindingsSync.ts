/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IFileService, FileOperationError, FileOperationResult } from 'vs/platform/files/common/files';
import {
	UserDataSyncError, UserDataSyncErrorCode, IUserDataSyncStoreService, IUserDataSyncLogService, IUserDataSyncUtilService, SyncResource,
	IUserDataSynchroniser, IUserDataSyncResourceEnablementService, IUserDataSyncBackupStoreService, USER_DATA_SYNC_SCHEME, ISyncResourceHandle,
	IRemoteUserData, ISyncData, IResourcePreview
} from 'vs/platform/userDataSync/common/userDataSync';
import { merge } from 'vs/platform/userDataSync/common/keybindingsMerge';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';
import { OS, OperatingSystem } from 'vs/base/common/platform';
import { isUndefined } from 'vs/base/common/types';
import { isNonEmptyArray } from 'vs/base/common/arrays';
import { IFileSyncPreview, AbstractJsonFileSynchroniser } from 'vs/platform/userDataSync/common/abstractSynchronizer';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { URI } from 'vs/base/common/uri';
import { joinPath, isEqual, dirname, basename } from 'vs/base/common/resources';
import { IStorageService } from 'vs/platform/storage/common/storage';

interface ISyncContent {
	mac?: string;
	linux?: string;
	windows?: string;
	all?: string;
}

export class KeybindingsSynchroniser extends AbstractJsonFileSynchroniser implements IUserDataSynchroniser {

	protected readonly version: number = 1;
	protected readonly localPreviewResource: URI = joinPath(this.syncPreviewFolder, 'keybindings.json');
	protected readonly remotePreviewResource: URI = this.localPreviewResource.with({ scheme: USER_DATA_SYNC_SCHEME });

	constructor(
		@IUserDataSyncStoreService userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncBackupStoreService userDataSyncBackupStoreService: IUserDataSyncBackupStoreService,
		@IUserDataSyncLogService logService: IUserDataSyncLogService,
		@IConfigurationService configurationService: IConfigurationService,
		@IUserDataSyncResourceEnablementService userDataSyncResourceEnablementService: IUserDataSyncResourceEnablementService,
		@IFileService fileService: IFileService,
		@IEnvironmentService environmentService: IEnvironmentService,
		@IStorageService storageService: IStorageService,
		@IUserDataSyncUtilService userDataSyncUtilService: IUserDataSyncUtilService,
		@ITelemetryService telemetryService: ITelemetryService,
	) {
		super(environmentService.keybindingsResource, SyncResource.Keybindings, fileService, environmentService, storageService, userDataSyncStoreService, userDataSyncBackupStoreService, userDataSyncResourceEnablementService, telemetryService, logService, userDataSyncUtilService, configurationService);
	}

	protected async generatePullPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<IFileSyncPreview> {
		const fileContent = await this.getLocalFileContent();
		const content = remoteUserData.syncData !== null ? this.getKeybindingsContentFromSyncContent(remoteUserData.syncData.content) : null;
		const hasLocalChanged = content !== null;
		const hasRemoteChanged = false;
		const hasConflicts = false;

		const resourcePreviews: IResourcePreview[] = [{
			hasConflicts,
			hasLocalChanged,
			hasRemoteChanged,
			localResouce: this.file,
			remoteResource: this.remotePreviewResource,
		}];

		return {
			fileContent,
			remoteUserData,
			lastSyncUserData,
			content,
			hasConflicts,
			hasLocalChanged,
			hasRemoteChanged,
			isLastSyncFromCurrentMachine: false,
			resourcePreviews
		};
	}

	protected async generatePushPreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken): Promise<IFileSyncPreview> {
		const fileContent = await this.getLocalFileContent();
		const content: string | null = fileContent ? fileContent.value.toString() : null;
		const hasLocalChanged = false;
		const hasRemoteChanged = content !== null;
		const hasConflicts = false;

		const resourcePreviews: IResourcePreview[] = [{
			hasConflicts,
			hasLocalChanged,
			hasRemoteChanged,
			localResouce: this.file,
			remoteResource: this.remotePreviewResource,
		}];
		return {
			fileContent,
			remoteUserData,
			lastSyncUserData,
			content,
			hasLocalChanged,
			hasRemoteChanged,
			hasConflicts,
			isLastSyncFromCurrentMachine: false,
			resourcePreviews
		};
	}

	protected async generateReplacePreview(syncData: ISyncData, remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null): Promise<IFileSyncPreview> {
		const fileContent = await this.getLocalFileContent();
		const content = this.getKeybindingsContentFromSyncContent(syncData.content);
		const hasLocalChanged = content !== null;
		const hasRemoteChanged = content !== null;
		const hasConflicts = false;

		const resourcePreviews: IResourcePreview[] = [{
			hasConflicts,
			hasLocalChanged,
			hasRemoteChanged,
			localResouce: this.file,
			remoteResource: this.remotePreviewResource,
		}];
		return {
			fileContent,
			remoteUserData,
			lastSyncUserData,
			content,
			hasConflicts,
			hasLocalChanged,
			hasRemoteChanged,
			isLastSyncFromCurrentMachine: false,
			resourcePreviews
		};
	}

	protected async generatePreview(remoteUserData: IRemoteUserData, lastSyncUserData: IRemoteUserData | null, token: CancellationToken = CancellationToken.None): Promise<IFileSyncPreview> {
		const remoteContent = remoteUserData.syncData ? this.getKeybindingsContentFromSyncContent(remoteUserData.syncData.content) : null;
		const isLastSyncFromCurrentMachine = await this.isLastSyncFromCurrentMachine(remoteUserData);
		let lastSyncContent: string | null = null;
		if (lastSyncUserData === null) {
			if (isLastSyncFromCurrentMachine) {
				lastSyncContent = remoteUserData.syncData ? this.getKeybindingsContentFromSyncContent(remoteUserData.syncData.content) : null;
			}
		} else {
			lastSyncContent = lastSyncUserData.syncData ? this.getKeybindingsContentFromSyncContent(lastSyncUserData.syncData.content) : null;
		}

		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		const formattingOptions = await this.getFormattingOptions();

		let content: string | null = null;
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;

		if (remoteContent) {
			const localContent: string = fileContent ? fileContent.value.toString() : '[]';
			if (!localContent.trim() || this.hasErrors(localContent)) {
				throw new UserDataSyncError(localize('errorInvalidSettings', "Unable to sync keybindings because the content in the file is not valid. Please open the file and correct it."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
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
		const resourcePreviews: IResourcePreview[] = [{
			hasConflicts,
			hasLocalChanged,
			hasRemoteChanged,
			localResouce: this.file,
			remoteResource: this.remotePreviewResource,
			previewResource: this.localPreviewResource
		}];

		return { fileContent, remoteUserData, lastSyncUserData, content, hasLocalChanged, hasRemoteChanged, hasConflicts, isLastSyncFromCurrentMachine, resourcePreviews };
	}

	protected async updatePreviewWithConflict(preview: IFileSyncPreview, conflictResource: URI, conflictContent: string, token: CancellationToken): Promise<IFileSyncPreview> {
		if (isEqual(this.localPreviewResource, conflictResource) || isEqual(this.remotePreviewResource, conflictResource)) {
			preview = { ...preview, content: conflictContent, hasConflicts: false };
		}
		return preview;
	}

	protected async applyPreview(preview: IFileSyncPreview, forcePush: boolean): Promise<void> {
		let { fileContent, remoteUserData, lastSyncUserData, content, hasLocalChanged, hasRemoteChanged } = preview;

		if (content !== null) {
			if (this.hasErrors(content)) {
				throw new UserDataSyncError(localize('errorInvalidSettings', "Unable to sync keybindings because the content in the file is not valid. Please open the file and correct it."), UserDataSyncErrorCode.LocalInvalidContent, this.resource);
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

		if (lastSyncUserData?.ref !== remoteUserData.ref) {
			this.logService.trace(`${this.syncResourceLogLabel}: Updating last synchronized keybindings...`);
			const lastSyncContent = content !== null || fileContent !== null ? this.toSyncContent(content !== null ? content : fileContent!.value.toString(), null) : null;
			await this.updateLastSyncUserData({ ref: remoteUserData.ref, syncData: lastSyncContent ? { version: remoteUserData.syncData!.version, machineId: remoteUserData.syncData!.machineId, content: lastSyncContent } : null });
			this.logService.info(`${this.syncResourceLogLabel}: Updated last synchronized keybindings`);
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
			return this.resolvePreviewContent(uri);
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

	protected async resolvePreviewContent(conflictResource: URI): Promise<string | null> {
		const content = await super.resolvePreviewContent(conflictResource);
		return content !== null ? this.getKeybindingsContentFromSyncContent(content) : null;
	}

	getKeybindingsContentFromSyncContent(syncContent: string): string | null {
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
