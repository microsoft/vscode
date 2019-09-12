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
import { parse, findNodeAtLocation, parseTree } from 'vs/base/common/json';
import { URI } from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { IModelService } from 'vs/editor/common/services/modelService';
import { IModeService } from 'vs/editor/common/services/modeService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { localize } from 'vs/nls';
import { setProperty } from 'vs/base/common/jsonEdit';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { EditOperation } from 'vs/editor/common/core/editOperation';
import { Emitter, Event } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { Position } from 'vs/editor/common/core/position';
import { InMemoryFileSystemProvider } from 'vs/workbench/services/userData/common/inMemoryUserDataProvider';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData | null;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly hasConflicts: boolean;
}

export class SettingsSyncService extends Disposable implements ISynchroniser {
	_serviceBrand: undefined;

	private static LAST_SYNC_SETTINGS_STORAGE_KEY: string = 'LAST_SYNC_SETTINGS_CONTENTS';
	private static EXTERNAL_USER_DATA_SETTINGS_KEY: string = 'settings';

	private readonly settingsPreviewResource: URI;

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
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IEditorService private readonly editorService: IEditorService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		const settingsPreviewScheme = 'vscode-in-memory';
		this.settingsPreviewResource = this.workbenchEnvironmentService.settingsResource.with({ scheme: settingsPreviewScheme });
		this.fileService.registerProvider(settingsPreviewScheme, new InMemoryFileSystemProvider());
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

		try {
			const result = await this.getPreview();
			if (result.hasConflicts) {
				this.setStatus(SyncStatus.HasConflicts);
				return false;
			}
			await this.apply();
			return true;
		} catch (e) {
			this.setStatus(SyncStatus.Idle);
			throw e;
		}
	}

	resolveConflicts(): void {
		if (this.status === SyncStatus.HasConflicts) {
			this.editorService.openEditor({
				resource: this.settingsPreviewResource,
				label: localize('settings preview', "Settings Preview"),
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
			const result = await this.syncPreviewResultPromise;
			let remoteUserData = result.remoteUserData;
			const settingsPreivew = await this.fileService.readFile(this.settingsPreviewResource);
			const content = settingsPreivew.value.toString();
			if (result.hasRemoteChanged) {
				const ref = await this.writeToRemote(content, remoteUserData ? remoteUserData.ref : null);
				remoteUserData = { ref, content };
			}
			if (result.hasLocalChanged) {
				await this.writeToLocal(content, result.fileContent);
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
		// Get file content last to get the latest
		const fileContent = await this.getLocalFileContent();
		const { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts } = await this.computeChanges(fileContent, remoteUserData);
		if (hasLocalChanged || hasRemoteChanged) {
			await this.fileService.writeFile(this.settingsPreviewResource, VSBuffer.fromString(settingsPreview));
		}
		return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
	}

	private async computeChanges(fileContent: IFileContent | null, remoteUserData: IUserData | null): Promise<{ settingsPreview: string, hasLocalChanged: boolean, hasRemoteChanged: boolean, hasConflicts: boolean }> {

		let hasLocalChanged: boolean = false;
		let hasRemoteChanged: boolean = false;
		let hasConflicts: boolean = false;
		let settingsPreview: string = '';

		// First time sync to remote
		if (fileContent && !remoteUserData) {
			this.logService.trace('Settings Sync: Remote contents does not exist. So sync with settings file.');
			hasRemoteChanged = true;
			settingsPreview = fileContent.value.toString();
			return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };
		}

		// Settings file does not exist, so sync with remote contents.
		if (remoteUserData && !fileContent) {
			this.logService.trace('Settings Sync: Settings file does not exist. So sync with remote contents');
			hasLocalChanged = true;
			settingsPreview = remoteUserData.content;
			return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };
		}

		if (fileContent && remoteUserData) {

			const localContent: string = fileContent.value.toString();
			const remoteContent: string = remoteUserData.content;
			const lastSyncData = this.getLastSyncUserData();

			// Already in Sync.
			if (localContent === remoteUserData.content) {
				this.logService.trace('Settings Sync: Settings file and remote contents are in sync.');
				settingsPreview = localContent;
				return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };
			}

			// First time Sync to Local
			if (!lastSyncData) {
				this.logService.trace('Settings Sync: Syncing remote contents with settings file for the first time.');
				hasLocalChanged = hasRemoteChanged = true;
				const mergeResult = await this.mergeContents(localContent, remoteContent, null);
				return { settingsPreview: mergeResult.settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts: mergeResult.hasConflicts };
			}

			// Remote has moved forward
			if (remoteUserData.ref !== lastSyncData.ref) {

				// Local content is same as last synced. So, sync with remote content.
				if (lastSyncData.content === localContent) {
					this.logService.trace('Settings Sync: Settings file has not changed from last time synced. So replace with remote contents.');
					hasLocalChanged = true;
					settingsPreview = remoteContent;
					return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };
				}

				// Local content is diverged from last synced. Required merge and sync.
				this.logService.trace('Settings Sync: Settings file is diverged from last time synced. Require merge and sync.');
				hasLocalChanged = hasRemoteChanged = true;
				const mergeResult = await this.mergeContents(localContent, remoteContent, lastSyncData.content);
				return { settingsPreview: mergeResult.settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts: mergeResult.hasConflicts };
			}

			// Remote data is same as last synced data
			if (lastSyncData.ref === remoteUserData.ref) {

				// Local contents are same as last synced data. No op.
				if (lastSyncData.content === localContent) {
					this.logService.trace('Settings Sync: Settings file and remote contents have not changed. So no sync needed.');
					return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };
				}

				// New local contents. Sync with Local.
				this.logService.trace('Settings Sync: Remote contents have not changed. Settings file has changed. So sync with settings file.');
				hasRemoteChanged = true;
				settingsPreview = localContent;
				return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };
			}

		}

		return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };

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

	private async mergeContents(localContent: string, remoteContent: string, lastSyncedContent: string | null): Promise<{ settingsPreview: string, hasConflicts: boolean }> {
		const local = parse(localContent);
		const remote = parse(remoteContent);
		const base = lastSyncedContent ? parse(lastSyncedContent) : null;
		const settingsPreviewModel = this.modelService.createModel(localContent, this.modeService.create('jsonc'));

		const baseToLocal = base ? this.compare(base, local) : { added: new Set<string>(), removed: new Set<string>(), updated: new Set<string>() };
		const baseToRemote = base ? this.compare(base, remote) : { added: new Set<string>(), removed: new Set<string>(), updated: new Set<string>() };
		const localToRemote = this.compare(local, remote);

		const conflicts: Set<string> = new Set<string>();

		// Removed settings in Local
		for (const key of baseToLocal.removed.keys()) {
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				conflicts.add(key);
			}
		}

		// Removed settings in Remote
		for (const key of baseToRemote.removed.keys()) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				conflicts.add(key);
			} else {
				this.editSetting(settingsPreviewModel, key, undefined);
			}
		}

		// Added settings in Local
		for (const key of baseToLocal.added.keys()) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got added in remote
			if (baseToRemote.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			}
		}

		// Added settings in remote
		for (const key of baseToRemote.added.keys()) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got added in local
			if (baseToLocal.added.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				this.editSetting(settingsPreviewModel, key, remote[key]);
			}
		}

		// Updated settings in Local
		for (const key of baseToLocal.updated.keys()) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in remote
			if (baseToRemote.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			}
		}

		// Updated settings in Remote
		for (const key of baseToRemote.updated.keys()) {
			if (conflicts.has(key)) {
				continue;
			}
			// Got updated in local
			if (baseToLocal.updated.has(key)) {
				// Has different value
				if (localToRemote.updated.has(key)) {
					conflicts.add(key);
				}
			} else {
				this.editSetting(settingsPreviewModel, key, remote[key]);
			}
		}

		for (const key of conflicts.keys()) {
			const tree = parseTree(settingsPreviewModel.getValue());
			const valueNode = findNodeAtLocation(tree, [key]);
			const remoteEdit = setProperty(`{${settingsPreviewModel.getEOL()}\t${settingsPreviewModel.getEOL()}}`, [key], remote[key], { tabSize: 4, insertSpaces: false, eol: settingsPreviewModel.getEOL() })[0];
			const remoteContent = remoteEdit ? remoteEdit.content.substring(remoteEdit.offset + remoteEdit.length + 1) + settingsPreviewModel.getEOL() : '';
			if (valueNode) {
				// Updated in Local and Remote with different value
				const keyPosition = settingsPreviewModel.getPositionAt(valueNode.parent!.offset);
				const valuePosition = settingsPreviewModel.getPositionAt(valueNode.offset + valueNode.length);
				const editOperations = [
					EditOperation.insert(new Position(keyPosition.lineNumber - 1, settingsPreviewModel.getLineMaxColumn(keyPosition.lineNumber - 1)), `${settingsPreviewModel.getEOL()}<<<<<<< local`),
					EditOperation.insert(new Position(valuePosition.lineNumber, settingsPreviewModel.getLineMaxColumn(valuePosition.lineNumber)), `${settingsPreviewModel.getEOL()}=======${settingsPreviewModel.getEOL()}${remoteContent}>>>>>>> remote`)
				];
				settingsPreviewModel.pushEditOperations([new Selection(keyPosition.lineNumber, keyPosition.column, keyPosition.lineNumber, keyPosition.column)], editOperations, () => []);
			} else {
				// Removed in Local, but updated in Remote
				const position = new Position(settingsPreviewModel.getLineCount() - 1, settingsPreviewModel.getLineMaxColumn(settingsPreviewModel.getLineCount() - 1));
				const editOperations = [
					EditOperation.insert(position, `${settingsPreviewModel.getEOL()}<<<<<<< local${settingsPreviewModel.getEOL()}=======${settingsPreviewModel.getEOL()}${remoteContent}>>>>>>> remote`)
				];
				settingsPreviewModel.pushEditOperations([new Selection(position.lineNumber, position.column, position.lineNumber, position.column)], editOperations, () => []);
			}
		}

		return { settingsPreview: settingsPreviewModel.getValue(), hasConflicts: conflicts.size > 0 };
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

	private editSetting(model: ITextModel, key: string, value: any | undefined): void {
		const insertSpaces = false;
		const tabSize = 4;
		const eol = model.getEOL();
		const edit = setProperty(model.getValue(), [key], value, { tabSize, insertSpaces, eol })[0];
		if (edit) {
			const startPosition = model.getPositionAt(edit.offset);
			const endPosition = model.getPositionAt(edit.offset + edit.length);
			const range = new Range(startPosition.lineNumber, startPosition.column, endPosition.lineNumber, endPosition.column);
			let currentText = model.getValueInRange(range);
			if (edit.content !== currentText) {
				const editOperation = currentText ? EditOperation.replace(range, edit.content) : EditOperation.insert(startPosition, edit.content);
				model.pushEditOperations([new Selection(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column)], [editOperation], () => []);
			}
		}
	}

	private async writeToRemote(content: string, ref: string | null): Promise<string> {
		try {
			return await this.remoteUserDataService.write(SettingsSyncService.EXTERNAL_USER_DATA_SETTINGS_KEY, content, ref);
		} catch (e) {
			if (e instanceof RemoteUserDataError && e.code === RemoteUserDataErrorCode.Rejected) {
				// Rejected as there is a new version. Sync again
			}
			// An unknown error
			throw e;
		}
	}

	private async writeToLocal(newContent: string, oldContent: IFileContent | null): Promise<void> {
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
