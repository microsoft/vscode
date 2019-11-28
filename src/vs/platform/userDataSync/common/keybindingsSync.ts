/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent } from 'vs/platform/files/common/files';
import { IUserData, UserDataSyncStoreError, UserDataSyncStoreErrorCode, ISynchroniser, SyncStatus, IUserDataSyncStoreService, IUserDataSyncLogService, IUserKeybindingsResolverService } from 'vs/platform/userDataSync/common/userDataSync';
import { merge } from 'vs/platform/userDataSync/common/keybindingsMerge';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, ParseError } from 'vs/base/common/json';
import { localize } from 'vs/nls';
import { Emitter, Event } from 'vs/base/common/event';
import { CancelablePromise, createCancelablePromise, ThrottledDelayer } from 'vs/base/common/async';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { URI } from 'vs/base/common/uri';
import { joinPath } from 'vs/base/common/resources';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { CancellationToken } from 'vs/base/common/cancellation';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly hasConflicts: boolean;
}

export class KeybindingsSynchroniser extends Disposable implements ISynchroniser {

	private static EXTERNAL_USER_DATA_KEYBINDINGS_KEY: string = 'keybindings';

	private syncPreviewResultPromise: CancelablePromise<ISyncPreviewResult> | null = null;

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private readonly throttledDelayer: ThrottledDelayer<void>;
	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	private readonly lastSyncKeybindingsResource: URI;

	constructor(
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IUserDataSyncLogService private readonly logService: IUserDataSyncLogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IFileService private readonly fileService: IFileService,
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@IUserKeybindingsResolverService private readonly userKeybindingsResolverService: IUserKeybindingsResolverService,
	) {
		super();
		this.lastSyncKeybindingsResource = joinPath(this.environmentService.userRoamingDataHome, '.lastSyncKeybindings.json');
		this.throttledDelayer = this._register(new ThrottledDelayer<void>(500));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.environmentService.keybindingsResource))(() => this.throttledDelayer.trigger(() => this.onDidChangeKeybindings())));
	}

	private async onDidChangeKeybindings(): Promise<void> {
		const localFileContent = await this.getLocalContent();
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
		if (!this.configurationService.getValue<boolean>('sync.enableKeybindings')) {
			this.logService.trace('Keybindings: Skipping synchronizing keybindings as it is disabled.');
			return false;
		}

		if (_continue) {
			this.logService.info('Keybindings: Resumed synchronizing keybindings');
			return this.continueSync();
		}

		if (this.status !== SyncStatus.Idle) {
			this.logService.trace('Keybindings: Skipping synchronizing keybindings as it is running already.');
			return false;
		}

		this.logService.trace('Keybindings: Started synchronizing keybindings...');
		this.setStatus(SyncStatus.Syncing);

		try {
			const result = await this.getPreview();
			if (result.hasConflicts) {
				this.logService.info('Keybindings: Detected conflicts while synchronizing keybindings.');
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
				this.logService.info('Keybindings: Failed to synchronise keybindings as there is a new remote version available. Synchronizing again...');
				return this.sync();
			}
			if (e instanceof FileSystemProviderError && e.code === FileSystemProviderErrorCode.FileExists) {
				// Rejected as there is a new local version. Syncing again.
				this.logService.info('Keybindings: Failed to synchronise keybindings as there is a new local version available. Synchronizing again...');
				return this.sync();
			}
			throw e;
		}
	}

	stop(): void {
		if (this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise.cancel();
			this.syncPreviewResultPromise = null;
			this.logService.info('Keybindings: Stopped synchronizing keybindings.');
		}
		this.fileService.del(this.environmentService.keybindingsSyncPreviewResource);
		this.setStatus(SyncStatus.Idle);
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

		if (await this.fileService.exists(this.environmentService.keybindingsSyncPreviewResource)) {
			const keybindingsPreivew = await this.fileService.readFile(this.environmentService.keybindingsSyncPreviewResource);
			const content = keybindingsPreivew.value.toString();
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
				await this.updateLocalContent(content, fileContent);
			}
			if (hasRemoteChanged) {
				this.logService.info('Keybindings: Updating remote keybindings');
				const ref = await this.updateRemoteContent(content, remoteUserData.ref);
				remoteUserData = { ref, content };
			}
			if (remoteUserData.content) {
				this.logService.info('Keybindings: Updating last synchronised keybindings');
				await this.updateLastSyncUserData(remoteUserData);
			}

			// Delete the preview
			await this.fileService.del(this.environmentService.keybindingsSyncPreviewResource);
		} else {
			this.logService.trace('Keybindings: No changes found during synchronizing keybindings.');
		}

		this.logService.trace('Keybindings: Finised synchronizing keybindings.');
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
		const remoteUserData = await this.getRemoteContent(lastSyncData);
		const remoteContent: string | null = remoteUserData.content;
		// Get file content last to get the latest
		const fileContent = await this.getLocalContent();
		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;
		let previewContent = null;

		if (remoteContent) {
			const localContent: string = fileContent ? fileContent.value.toString() : '{}';
			if (this.hasErrors(localContent)) {
				this.logService.error('Keybindings: Unable to sync keybindings as there are errors/warning in keybindings file.');
				return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
			}

			if (!lastSyncData // First time sync
				|| lastSyncData.content !== localContent // Local has forwarded
				|| lastSyncData.content !== remoteContent // Remote has forwarded
			) {
				this.logService.trace('Keybindings: Merging remote keybindings with local keybindings...');
				const keys = await this.userKeybindingsResolverService.resolveUserKeybindings(localContent, remoteContent, lastSyncData ? lastSyncData.content : null);
				const result = merge(localContent, remoteContent, lastSyncData ? lastSyncData.content : null, keys);
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
			this.logService.info('Keybindings: Remote keybindings does not exist. Synchronizing keybindings for the first time.');
			hasRemoteChanged = true;
			previewContent = fileContent.value.toString();
		}

		if (previewContent && !token.isCancellationRequested) {
			await this.fileService.writeFile(this.environmentService.keybindingsSyncPreviewResource, VSBuffer.fromString(previewContent));
		}

		return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
	}

	private async getLocalContent(): Promise<IFileContent | null> {
		try {
			return await this.fileService.readFile(this.environmentService.keybindingsResource);
		} catch (error) {
			return null;
		}
	}

	private async updateLocalContent(newContent: string, oldContent: IFileContent | null): Promise<void> {
		if (oldContent) {
			// file exists already
			await this.fileService.writeFile(this.environmentService.keybindingsResource, VSBuffer.fromString(newContent), oldContent);
		} else {
			// file does not exist
			await this.fileService.createFile(this.environmentService.keybindingsResource, VSBuffer.fromString(newContent), { overwrite: false });
		}
	}

	private async getLastSyncUserData(): Promise<IUserData | null> {
		try {
			const content = await this.fileService.readFile(this.lastSyncKeybindingsResource);
			return JSON.parse(content.value.toString());
		} catch (error) {
			return null;
		}
	}

	private async updateLastSyncUserData(remoteUserData: IUserData): Promise<void> {
		await this.fileService.writeFile(this.lastSyncKeybindingsResource, VSBuffer.fromString(JSON.stringify(remoteUserData)));
	}

	private async getRemoteContent(lastSyncData: IUserData | null): Promise<IUserData> {
		return this.userDataSyncStoreService.read(KeybindingsSynchroniser.EXTERNAL_USER_DATA_KEYBINDINGS_KEY, lastSyncData);
	}

	private async updateRemoteContent(content: string, ref: string | null): Promise<string> {
		return this.userDataSyncStoreService.write(KeybindingsSynchroniser.EXTERNAL_USER_DATA_KEYBINDINGS_KEY, content, ref);
	}
}
