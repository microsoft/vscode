/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as objects from 'vs/base/common/objects';
import { Disposable } from 'vs/base/common/lifecycle';
import { IFileService, FileSystemProviderErrorCode, FileSystemProviderError, IFileContent } from 'vs/platform/files/common/files';
import { IWorkbenchEnvironmentService } from 'vs/workbench/services/environment/common/environmentService';
import { IStorageService, StorageScope } from 'vs/platform/storage/common/storage';
import { IUserDataSyncStoreService, IUserData, UserDataSyncStoreError, UserDataSyncStoreErrorCode, ISynchroniser, SyncStatus, SETTINGS_PREVIEW_RESOURCE } from 'vs/workbench/services/userData/common/userData';
import { VSBuffer } from 'vs/base/common/buffer';
import { parse, findNodeAtLocation, parseTree, ParseError } from 'vs/base/common/json';
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
import { IHistoryService } from 'vs/workbench/services/history/common/history';
import { CancelablePromise, createCancelablePromise, ThrottledDelayer } from 'vs/base/common/async';

interface ISyncPreviewResult {
	readonly fileContent: IFileContent | null;
	readonly remoteUserData: IUserData | null;
	readonly hasLocalChanged: boolean;
	readonly hasRemoteChanged: boolean;
	readonly hasConflicts: boolean;
}

export class SettingsSynchroniser extends Disposable implements ISynchroniser {

	private static LAST_SYNC_SETTINGS_STORAGE_KEY: string = 'LAST_SYNC_SETTINGS_CONTENTS';
	private static EXTERNAL_USER_DATA_SETTINGS_KEY: string = 'settings';

	private syncPreviewResultPromise: CancelablePromise<ISyncPreviewResult> | null = null;

	private _status: SyncStatus = SyncStatus.Idle;
	get status(): SyncStatus { return this._status; }
	private _onDidChangStatus: Emitter<SyncStatus> = this._register(new Emitter<SyncStatus>());
	readonly onDidChangeStatus: Event<SyncStatus> = this._onDidChangStatus.event;

	private readonly throttledDelayer: ThrottledDelayer<void>;
	private _onDidChangeLocal: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeLocal: Event<void> = this._onDidChangeLocal.event;

	constructor(
		@IFileService private readonly fileService: IFileService,
		@IWorkbenchEnvironmentService private readonly workbenchEnvironmentService: IWorkbenchEnvironmentService,
		@IStorageService private readonly storageService: IStorageService,
		@IUserDataSyncStoreService private readonly userDataSyncStoreService: IUserDataSyncStoreService,
		@IModelService private readonly modelService: IModelService,
		@IModeService private readonly modeService: IModeService,
		@IEditorService private readonly editorService: IEditorService,
		@ILogService private readonly logService: ILogService,
		@IHistoryService private readonly historyService: IHistoryService,
	) {
		super();
		this.throttledDelayer = this._register(new ThrottledDelayer<void>(500));
		this._register(Event.filter(this.fileService.onFileChanges, e => e.contains(this.workbenchEnvironmentService.settingsResource))(() => this.throttledDelayer.trigger(() => this.onDidChangeSettings())));
	}

	private async onDidChangeSettings(): Promise<void> {
		const localFileContent = await this.getLocalFileContent();
		const lastSyncData = this.getLastSyncUserData();
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

	handleConflicts(): boolean {
		if (this.status !== SyncStatus.HasConflicts) {
			return false;
		}
		const resourceInput = {
			resource: SETTINGS_PREVIEW_RESOURCE,
			label: localize('Settings Conflicts', "Local ↔ Remote (Settings Conflicts)"),
			options: {
				preserveFocus: false,
				pinned: false,
				revealIfVisible: true,
			},
			mode: 'jsonc'
		};
		this.editorService.openEditor(resourceInput).then(() => this.historyService.remove(resourceInput));
		return true;
	}

	async continueSync(): Promise<boolean> {
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

		if (await this.fileService.exists(SETTINGS_PREVIEW_RESOURCE)) {
			const settingsPreivew = await this.fileService.readFile(SETTINGS_PREVIEW_RESOURCE);
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
				this.updateLastSyncValue(remoteUserData);
			}

			// Delete the preview
			await this.fileService.del(SETTINGS_PREVIEW_RESOURCE);
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
		const { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts } = this.computeChanges(fileContent, remoteUserData);
		if (hasLocalChanged || hasRemoteChanged) {
			await this.fileService.writeFile(SETTINGS_PREVIEW_RESOURCE, VSBuffer.fromString(settingsPreview));
		}
		return { fileContent, remoteUserData, hasLocalChanged, hasRemoteChanged, hasConflicts };
	}

	private computeChanges(fileContent: IFileContent | null, remoteUserData: IUserData | null): { settingsPreview: string, hasLocalChanged: boolean, hasRemoteChanged: boolean, hasConflicts: boolean } {

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
			if (!lastSyncData // First time sync
				|| lastSyncData.content !== localContent // Local has moved forwarded
				|| lastSyncData.content !== remoteContent // Remote has moved forwarded
			) {
				this.logService.trace('Settings Sync: Merging remote contents with settings file.');
				const { settingsPreview, hasChanges, hasConflicts } = this.mergeContents(localContent, remoteContent, lastSyncData ? lastSyncData.content : null);
				if (hasChanges) {
					// Sync only if there are changes
					hasLocalChanged = settingsPreview !== localContent; // Local has changed
					hasRemoteChanged = settingsPreview !== remoteContent; // Remote has changed
					return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };
				}
			}
		}

		this.logService.trace('Settings Sync: No changes.');
		return { settingsPreview, hasLocalChanged, hasRemoteChanged, hasConflicts };

	}

	private mergeContents(localContent: string, remoteContent: string, lastSyncedContent: string | null): { settingsPreview: string, hasChanges: boolean; hasConflicts: boolean } {
		const local = parse(localContent);
		const remote = parse(remoteContent);
		const localToRemote = this.compare(local, remote);

		if (localToRemote.added.size === 0 && localToRemote.removed.size === 0 && localToRemote.updated.size === 0) {
			// No changes found between local and remote.
			return { settingsPreview: localContent, hasChanges: false, hasConflicts: false };
		}

		const settingsPreviewModel = this.modelService.createModel(localContent, this.modeService.create('jsonc'));
		const base = lastSyncedContent ? parse(lastSyncedContent) : null;
		const baseToLocal = base ? this.compare(base, local) : { added: Object.keys(local).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };
		const baseToRemote = base ? this.compare(base, remote) : { added: Object.keys(remote).reduce((r, k) => { r.add(k); return r; }, new Set<string>()), removed: new Set<string>(), updated: new Set<string>() };

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
			const remoteContent = remoteEdit ? `${remoteEdit.content.substring(remoteEdit.offset + remoteEdit.length + 1)},${settingsPreviewModel.getEOL()}` : '';
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

		return { settingsPreview: settingsPreviewModel.getValue(), hasChanges: true, hasConflicts: conflicts.size > 0 };
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

	private getLastSyncUserData(): IUserData | null {
		const lastSyncStorageContents = this.storageService.get(SettingsSynchroniser.LAST_SYNC_SETTINGS_STORAGE_KEY, StorageScope.GLOBAL, undefined);
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

	private async writeToRemote(content: string, ref: string | null): Promise<string> {
		return this.userDataSyncStoreService.write(SettingsSynchroniser.EXTERNAL_USER_DATA_SETTINGS_KEY, content, ref);
	}

	private async writeToLocal(newContent: string, oldContent: IFileContent | null): Promise<void> {
		if (oldContent) {
			// file exists already
			await this.fileService.writeFile(this.workbenchEnvironmentService.settingsResource, VSBuffer.fromString(newContent), oldContent);
		} else {
			// file does not exist
			await this.fileService.createFile(this.workbenchEnvironmentService.settingsResource, VSBuffer.fromString(newContent), { overwrite: false });
		}
	}

	private updateLastSyncValue(remoteUserData: IUserData): void {
		const lastSyncUserData = this.getLastSyncUserData();
		if (lastSyncUserData && lastSyncUserData.ref === remoteUserData.ref) {
			return;
		}
		this.storageService.store(SettingsSynchroniser.LAST_SYNC_SETTINGS_STORAGE_KEY, JSON.stringify(remoteUserData), StorageScope.GLOBAL);
	}

}
