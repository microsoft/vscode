/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IRemoteUserDataService, IUserData, RemoteUserDataError, RemoteUserDataErrorCode, ISynchroniser, SyncStatus } from 'vs/workbench/services/userData/common/userData';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, JSONPath } from 'vs/base/common/json';
import { ITextModelService, ITextModelContentProvider } from 'vs/editor/common/services/resolverService';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { isEqual } from 'vs/base/common/resources';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { localize } from 'vs/nls';
import { Edit } from 'vs/base/common/jsonFormatter';
import { repeat } from 'vs/base/common/strings';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Emitter, Event } from 'vs/base/common/event';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData | null;
	readonly localSettingsPreviewModel: ITextModel;
	readonly remoteSettingsPreviewModel: ITextModel;
	readonly hasChanges: boolean;
	readonly hasConflicts: boolean;
}

export class SettingsSyncService extends Disposable implements ISynchroniser, ITextModelContentProvider {
	_serviceBrand: undefined;

	private static LAST_SYNC_SETTINGS_STORAGE_KEY: string = 'LAST_SYNC_SETTINGS_CONTENTS';
	private static EXTERNAL_USER_DATA_SETTINGS_KEY: string = 'settings';

	private readonly remoteSettingsPreviewResource: URI;
	private readonly localSettingsPreviewResource: URI;

	private syncPreviewResultPromise: Promise<ISyncPreviewResult> | null = null;

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IStorageService private readonly storageService: IStorageService,
		@IRemoteUserDataService private readonly remoteUserDataService: IRemoteUserDataService,
		@ITextModelService private readonly textModelResolverService: ITextModelService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IEditorService private readonly editorService: IEditorService
	) {
		super();

		this.remoteSettingsPreviewResource = URI.file('remote').with({ scheme: 'vscode-settings-sync' });
		this.localSettingsPreviewResource = this.workbenchEnvironmentService.settingsResource.with({ scheme: 'vscode-settings-sync' });

		this.textModelResolverService.registerTextModelContentProvider('vscode-settings-sync', this);
	}

	provideTextContent(uri: URI): Promise<ITextModel> | null {
		if (isEqual(this.remoteSettingsPreviewResource, uri, false)) {
			return this.getPreview().then(({ remoteSettingsPreviewModel }) => remoteSettingsPreviewModel);
		}
		if (isEqual(this.localSettingsPreviewResource, uri, false)) {
			return this.getPreview().then(({ localSettingsPreviewModel }) => localSettingsPreviewModel);
		}
		return null;
	}

	private setStatus(status: SyncStatus): void {
		if (this._status !== status) {
			this._status = status;
			this._onDidChangStatus.fire(status);
		}
	}

	async sync(): Promise<boolean> {

		if (this.status !== SyncStatus.Idle) {
			return false;
		}

		this.setStatus(SyncStatus.Syncing);

		const result = await this.getPreview();

		if (result.hasConflicts) {
			this.setStatus(SyncStatus.HasConflicts);
			return false;
		}

		await this.apply();
		return true;
	}

	resolveConflicts(): void {
		if (this.status === SyncStatus.HasConflicts) {
			this.editorService.openEditor({
				leftResource: this.remoteSettingsPreviewResource,
				rightResource: this.localSettingsPreviewResource,
				label: localize('fileReplaceChanges', "Remote Settings ↔ Local Settings (Settings Preview)"),
				options: {
					preserveFocus: false,
					pinned: true,
					revealIfVisible: true
				}
			});
		}
	}

	async apply(): Promise<void> {
		if (this.syncPreviewResultPromise) {
			const { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges } = await this.syncPreviewResultPromise;
			if (hasChanges) {
				const syncedRemoteUserData = remoteUserData && remoteUserData.content === remoteSettingsPreviewModel.getValue() ? remoteUserData : { content: remoteSettingsPreviewModel.getValue(), version: remoteUserData ? remoteUserData.version + 1 : 1 };
				if (!(remoteUserData && remoteUserData.version === syncedRemoteUserData.version)) {
					await this.writeToRemote(syncedRemoteUserData);
				}
				await this.writeToLocal(localSettingsPreviewModel.getValue(), fileContent, syncedRemoteUserData);
			}
			if (remoteUserData) {
				this.updateLastSyncValue(remoteUserData);
			}
		}
		this.syncPreviewResultPromise = null;
		this.setStatus(SyncStatus.Idle);
	}

	private getPreview(): Promise<ISyncPreviewResult> {
		if (!this.syncPreviewResultPromise) {
			this.syncPreviewResultPromise = this.generatePreview();
		}
		return this.syncPreviewResultPromise;
	}

	private async generatePreview(): Promise<ISyncPreviewResult> {
		const remoteUserData = await this.remoteUserDataService.read(SettingsSyncService.EXTERNAL_USER_DATA_SETTINGS_KEY);
		const fileContent = await this.getLocalFileContent();

		const localSettingsPreviewModel = this.modelService.getModel(this.localSettingsPreviewResource) || this.modelService.createModel('', this.modeService.create('jsonc'), this.localSettingsPreviewResource);
		const remoteSettingsPreviewModel = this.modelService.getModel(this.remoteSettingsPreviewResource) || this.modelService.createModel('', this.modeService.create('jsonc'), this.remoteSettingsPreviewResource);

		if (fileContent && !remoteUserData) {
			// Remote does not exist, so sync with local.
			const localContent = fileContent.value.toString();
			localSettingsPreviewModel.setValue(localContent);
			remoteSettingsPreviewModel.setValue(localContent);
			return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: true, hasConflicts: false };
		}

		if (remoteUserData && !fileContent) {
			// Settings file does not exist, so sync with remote contents.
			const remoteContent = remoteUserData.content;
			localSettingsPreviewModel.setValue(remoteContent);
			remoteSettingsPreviewModel.setValue(remoteContent);
			return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: true, hasConflicts: false };
		}

		if (fileContent && remoteUserData) {

			const localContent: string = fileContent.value.toString();
			const remoteContent: string = remoteUserData.content;
			const lastSyncData = this.getLastSyncUserData();

			// Already in Sync.
			if (localContent === remoteUserData.content) {
				localSettingsPreviewModel.setValue(localContent);
				remoteSettingsPreviewModel.setValue(remoteContent);
				return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: false, hasConflicts: false };
			}

			// Not synced till now
			if (!lastSyncData) {
				localSettingsPreviewModel.setValue(localContent);
				remoteSettingsPreviewModel.setValue(remoteContent);
				const hasConflicts = await this.mergeContents(localSettingsPreviewModel, remoteSettingsPreviewModel, null);
				return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: true, hasConflicts };
			}

			// Remote data is newer than last synced data
			if (remoteUserData.version > lastSyncData.version) {

				// Local content is same as last synced. So, sync with remote content.
				if (lastSyncData.content === localContent) {
					localSettingsPreviewModel.setValue(remoteContent);
					remoteSettingsPreviewModel.setValue(remoteContent);
					return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: true, hasConflicts: false };
				}

				// Local content is diverged from last synced. Required merge and sync.
				localSettingsPreviewModel.setValue(localContent);
				remoteSettingsPreviewModel.setValue(remoteContent);
				const hasConflicts = await this.mergeContents(localSettingsPreviewModel, remoteSettingsPreviewModel, lastSyncData.content);
				return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: true, hasConflicts };
			}

			// Remote data is same as last synced data
			if (lastSyncData.version === remoteUserData.version) {

				// Local contents are same as last synced data. No op.
				if (lastSyncData.content === localContent) {
					return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: false, hasConflicts: false };
				}

				// New local contents. Sync with Local.
				localSettingsPreviewModel.setValue(localContent);
				remoteSettingsPreviewModel.setValue(localContent);
				return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: true, hasConflicts: false };
			}

		}

		return { fileContent, remoteUserData, localSettingsPreviewModel, remoteSettingsPreviewModel, hasChanges: false, hasConflicts: false };

	}

	private getLastSyncUserData(): IUserData | null {
		const lastSyncStorageContents = this.storageService.get(SettingsSyncService.LAST_SYNC_SETTINGS_STORAGE_KEY, StorageScope.GLOBAL, undefined);
		if (lastSyncStorageContents) {
			return JSON.parse(lastSyncStorageContents);
		}
		return null;
	}

	private async getLocalFileContent(): Promise<IFileContent | null> {
		try {
			return await this.fileService.readFile(this.workbenchEnvironmentService.settingsResource);
		} catch (error) {
			if (error instanceof FileSystemProviderError && error.code !== FileSystemProviderErrorCode.FileNotFound) {
				return null;
			}
			throw error;
		}
	}

	private async mergeContents(localSettingsPreviewModel: ITextModel, remoteSettingsPreviewModel: ITextModel, lastSyncedContent: string | null): Promise<boolean> {
		const local = parse(localSettingsPreviewModel.getValue());
		const remote = parse(remoteSettingsPreviewModel.getValue());
		const base = lastSyncedContent ? parse(lastSyncedContent) : null;

		const baseToLocal = base ? this.compare(base, local) : { added: new Set<string>(), removed: new Set<string>(), updated: new Set<string>() };
		const baseToRemote = base ? this.compare(base, remote) : { added: new Set<string>(), removed: new Set<string>(), updated: new Set<string>() };
		const localToRemote = this.compare(local, remote);

		const conflicts: Set<string> = new Set<string>();

		// Removed settings in Local
		for (const key of baseToLocal.removed.keys()) {
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				conflicts.add(key);
			} else {
				this.removeSetting(remoteSettingsPreviewModel, key);
			}
		}

		// Removed settings in Remote
		for (const key of baseToRemote.removed.keys()) {
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				conflicts.add(key);
			} else {
				this.removeSetting(localSettingsPreviewModel, key);
			}
		}

		// Added settings in Local
		for (const key of baseToLocal.added.keys()) {
			// Got added in remote
			if (baseToRemote.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				const edit = this.getEdit(remoteSettingsPreviewModel, [key], local[key]);
				if (edit) {
					this.applyEditsToBuffer(edit, remoteSettingsPreviewModel);
				}
			}
		}

		// Added settings in remote
		for (const key of baseToRemote.added.keys()) {
			// Got added in local
			if (baseToLocal.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				const edit = this.getEdit(localSettingsPreviewModel, [key], remote[key]);
				if (edit) {
					this.applyEditsToBuffer(edit, localSettingsPreviewModel);
				}
			}
		}

		// Updated settings in Local
		for (const key of baseToLocal.updated.keys()) {
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				const edit = this.getEdit(remoteSettingsPreviewModel, [key], local[key]);
				if (edit) {
					this.applyEditsToBuffer(edit, remoteSettingsPreviewModel);
				}
			}
		}

		// Updated settings in Remote
		for (const key of baseToRemote.updated.keys()) {
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				const edit = this.getEdit(localSettingsPreviewModel, [key], remote[key]);
				if (edit) {
					this.applyEditsToBuffer(edit, localSettingsPreviewModel);
				}
			}
		}

		return conflicts.size > 0;
	}

	private compare(from: { [key: string]: any }, to: { [key: string]: any }): { added: Set<string>, removed: Set<string>, updated: Set<string> } {
		const fromKeys = Object.keys(from);
		const toKeys = Object.keys(to);
		const added = toKeys.filter(key => fromKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const removed = fromKeys.filter(key => toKeys.indexOf(key) === -1).reduce((r, key) => { r.add(key); return r; }, new Set<string>());
		const updated: Set<string> = new Set<string>();

		for (const key of fromKeys) {
			if (removed.has(key)) {
				continue;
			}
			const value1 = from[key];
			const value2 = to[key];
			if (!objects.equals(value1, value2)) {
				updated.add(key);
			}
		}

		return { added, removed, updated };
	}

	private removeSetting(model: ITextModel, key: string): void {
		const edit = this.getEdit(model, [key], undefined);
		if (edit) {
			this.applyEditsToBuffer(edit, model);
		}
	}

	private applyEditsToBuffer(edit: Edit, model: ITextModel): void {
		const startPosition = model.getPositionAt(edit.offset);
		const endPosition = model.getPositionAt(edit.offset + edit.length);
		const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
		let currentText = model.getValueInRange(range);
		if (edit.content !== currentText) {
			const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
			model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
		}
	}

	private getEdit(model: ITextModel, jsonPath: JSONPath, value: any): Edit | undefined {
		const insertSpaces = false;
		const tabSize = 4;
		const eol = model.getEOL();

		// Without jsonPath, the entire configuration file is being replaced, so we just use JSON.stringify
		if (!jsonPath.length) {
			const content = JSON.stringify(value, null, insertSpaces ? repeat(' ', tabSize) : '\t');
			return {
				content,
				length: model.getValue().length,
				offset: 0
			};
		}

		return setProperty(model.getValue(), jsonPath, value, { tabSize, insertSpaces, eol })[0];
	}

	private async writeToRemote(userData: IUserData): Promise<void> {
		try {
			await this.remoteUserDataService.write(SettingsSyncService.EXTERNAL_USER_DATA_SETTINGS_KEY, userData.version, userData.content);
		} catch (e) {
			if (e instanceof RemoteUserDataError && e.code === RemoteUserDataErrorCode.VersionExists) {
				// Rejected as there is a new version. Sync again
				await this.sync();
			}
			// An unknown error
			throw e;
		}
	}

	private async writeToLocal(newContent: string, oldContent: IFileContent | null, remoteUserData: IUserData): Promise<void> {
		if (oldContent) {
			try {
				// file exists before
				await this.fileService.writeFile(this.workbenchEnvironmentService.settingsResource, VSBuffer.fromString(newContent), oldContent);
			} catch (error) {
				// Error to check for dirty to sync again
				throw error;
			}
		} else {
			try {
				// file does not exist before
				await this.fileService.createFile(this.workbenchEnvironmentService.settingsResource, VSBuffer.fromString(newContent), { overwrite: false });
			} catch (error) {
				if (error instanceof FileSystemProviderError && error.code === FileSystemProviderErrorCode.FileExists) {
					await this.sync();
				}
				throw error;
			}
		}

	}

	private updateLastSyncValue(remoteUserData: IUserData): void {
		this.storageService.store(SettingsSyncService.LAST_SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(remoteUserData), StorageScope.GLOBAL);
	}

}
