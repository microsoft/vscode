/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import * as fs from 'fs';
import { isEqual } from 'vs/base/common/extpath';
import { Schemas } from 'vs/base/common/network';
import { join } from 'vs/base/common/path';
import { isLinux } from 'vs/base/common/platform';
import { extUriBiasedIgnorePathCase } from 'vs/base/common/resources';
import { URI } from 'vs/base/common/uri';
import { Promises, RimRafMode } from 'vs/base/node/pfs';
import { TaskSequentializer } from 'vs/base/common/async';
import { IBackupMainService } from 'vs/platform/backup/electron-main/backup';
import { ISerializedBackupWorkspaces, IEmptyWindowBackupInfo, isEmptyWindowBackupInfo, deserializeWorkspaceInfos, deserializeFolderInfos } from 'vs/platform/backup/node/backup';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IEnvironmentMainService } from 'vs/platform/environment/electron-main/environmentMainService';
import { ILifecycleMainService, ShutdownEvent } from 'vs/platform/lifecycle/electron-main/lifecycleMainService';
import { HotExitConfiguration, IFilesConfiguration } from 'vs/platform/files/common/files';
import { ILogService } from 'vs/platform/log/common/log';
import { IFolderBackupInfo, isFolderBackupInfo, IWorkspaceBackupInfo } from 'vs/platform/backup/common/backup';
import { IWorkspaceIdentifier, isWorkspaceIdentifier } from 'vs/platform/workspace/common/workspace';

export class BackupMainService implements IBackupMainService {

	declare readonly _serviceBrand: undefined;

	protected backupHome = this.environmentMainService.backupHome;

	protected workspacesJsonPath = join(this.backupHome, 'workspaces.json');
	protected readonly workspacesJsonSaveSequentializer = new TaskSequentializer();
	private lastKnownWorkspacesJsonContents: string | undefined = undefined;
	private workspacesJsonWriteCounter = 0;

	private workspaces: IWorkspaceBackupInfo[] = [];
	private folders: IFolderBackupInfo[] = [];
	private emptyWindows: IEmptyWindowBackupInfo[] = [];

	// Comparers for paths and resources that will
	// - ignore path casing on Windows/macOS
	// - respect path casing on Linux
	private readonly backupUriComparer = extUriBiasedIgnorePathCase;
	private readonly backupPathComparer = { isEqual: (pathA: string, pathB: string) => isEqual(pathA, pathB, !isLinux) };

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@ILifecycleMainService private readonly lifecycleMainService: ILifecycleMainService
	) {
		this.registerListeners();
	}

	private registerListeners(): void {
		this.lifecycleMainService.onWillShutdown(e => this.onWillShutdown(e));
	}

	private onWillShutdown(e: ShutdownEvent): void {

		// Prolong shutdown for pending metadata writes
		e.join(this.workspacesJsonSaveSequentializer.join());
	}

	async initialize(): Promise<void> {

		// typically we have no writes before `initialize`, but conceptually
		// we have to ensure to await pending writes before reading metadata
		await this.workspacesJsonSaveSequentializer.join();

		// read workspace metadata
		let serializedBackupWorkspaces: ISerializedBackupWorkspaces = Object.create(null);
		try {
			const workspacesMetadata = await this.readWorkspacesMetadata();
			if (workspacesMetadata) {
				serializedBackupWorkspaces = JSON.parse(workspacesMetadata);
			}
		} catch (error) {
			// invalid JSON or permission issue can happen here
		}

		// validate empty workspaces backups first
		this.emptyWindows = await this.validateEmptyWorkspaces(serializedBackupWorkspaces.emptyWorkspaceInfos);

		// validate workspace backups
		this.workspaces = await this.validateWorkspaces(deserializeWorkspaceInfos(serializedBackupWorkspaces));

		// validate folder backups
		this.folders = await this.validateFolders(deserializeFolderInfos(serializedBackupWorkspaces));

		// save again in case some workspaces or folders have been removed
		this.writeWorkspacesMetadata();
	}

	protected getWorkspaceBackups(): IWorkspaceBackupInfo[] {
		if (this.isHotExitOnExitAndWindowClose()) {
			// Only non-folder windows are restored on main process launch when
			// hot exit is configured as onExitAndWindowClose.
			return [];
		}

		return this.workspaces.slice(0); // return a copy
	}

	protected getFolderBackups(): IFolderBackupInfo[] {
		if (this.isHotExitOnExitAndWindowClose()) {
			// Only non-folder windows are restored on main process launch when
			// hot exit is configured as onExitAndWindowClose.
			return [];
		}

		return this.folders.slice(0); // return a copy
	}

	isHotExitEnabled(): boolean {
		return this.getHotExitConfig() !== HotExitConfiguration.OFF;
	}

	private isHotExitOnExitAndWindowClose(): boolean {
		return this.getHotExitConfig() === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE;
	}

	private getHotExitConfig(): string {
		const config = this.configurationService.getValue<IFilesConfiguration>();

		return config?.files?.hotExit || HotExitConfiguration.ON_EXIT;
	}

	getEmptyWindowBackups(): IEmptyWindowBackupInfo[] {
		return this.emptyWindows.slice(0); // return a copy
	}

	registerWorkspaceBackup(workspaceInfo: IWorkspaceBackupInfo, migrateFrom?: string): string {
		if (!this.workspaces.some(workspace => workspaceInfo.workspace.id === workspace.workspace.id)) {
			this.workspaces.push(workspaceInfo);
			this.writeWorkspacesMetadata();
		}

		const backupPath = this.getBackupPath(workspaceInfo.workspace.id);

		if (migrateFrom) {
			this.moveBackupFolderSync(backupPath, migrateFrom);
		}

		return backupPath;
	}

	private moveBackupFolderSync(backupPath: string, moveFromPath: string): void {

		// Target exists: make sure to convert existing backups to empty window backups
		if (fs.existsSync(backupPath)) {
			this.convertToEmptyWindowBackupSync(backupPath);
		}

		// When we have data to migrate from, move it over to the target location
		if (fs.existsSync(moveFromPath)) {
			try {
				fs.renameSync(moveFromPath, backupPath);
			} catch (error) {
				this.logService.error(`Backup: Could not move backup folder to new location: ${error.toString()}`);
			}
		}
	}

	unregisterWorkspaceBackup(workspace: IWorkspaceIdentifier): void {
		const id = workspace.id;
		const index = this.workspaces.findIndex(workspace => workspace.workspace.id === id);
		if (index !== -1) {
			this.workspaces.splice(index, 1);
			this.writeWorkspacesMetadata();
		}
	}

	registerFolderBackup(folderInfo: IFolderBackupInfo): string {
		if (!this.folders.some(folder => this.backupUriComparer.isEqual(folderInfo.folderUri, folder.folderUri))) {
			this.folders.push(folderInfo);
			this.writeWorkspacesMetadata();
		}

		return this.getBackupPath(this.getFolderHash(folderInfo));
	}

	unregisterFolderBackup(folderUri: URI): void {
		const index = this.folders.findIndex(folder => this.backupUriComparer.isEqual(folderUri, folder.folderUri));
		if (index !== -1) {
			this.folders.splice(index, 1);
			this.writeWorkspacesMetadata();
		}
	}

	registerEmptyWindowBackup(backupFolderCandidate?: string, remoteAuthority?: string): string {

		// Generate a new folder if this is a new empty workspace
		const backupFolder = backupFolderCandidate || this.getRandomEmptyWindowId();
		if (!this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, backupFolder))) {
			this.emptyWindows.push({ backupFolder, remoteAuthority });
			this.writeWorkspacesMetadata();
		}

		return this.getBackupPath(backupFolder);
	}

	unregisterEmptyWindowBackup(backupFolder: string): void {
		const index = this.emptyWindows.findIndex(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, backupFolder));
		if (index !== -1) {
			this.emptyWindows.splice(index, 1);
			this.writeWorkspacesMetadata();
		}
	}

	private getBackupPath(oldFolderHash: string): string {
		return join(this.backupHome, oldFolderHash);
	}

	private async validateWorkspaces(rootWorkspaces: IWorkspaceBackupInfo[]): Promise<IWorkspaceBackupInfo[]> {
		if (!Array.isArray(rootWorkspaces)) {
			return [];
		}

		const seenIds: Set<string> = new Set();
		const result: IWorkspaceBackupInfo[] = [];

		// Validate Workspaces
		for (const workspaceInfo of rootWorkspaces) {
			const workspace = workspaceInfo.workspace;
			if (!isWorkspaceIdentifier(workspace)) {
				return []; // wrong format, skip all entries
			}

			if (!seenIds.has(workspace.id)) {
				seenIds.add(workspace.id);

				const backupPath = this.getBackupPath(workspace.id);
				const hasBackups = await this.doHasBackups(backupPath);

				// If the workspace has no backups, ignore it
				if (hasBackups) {
					if (workspace.configPath.scheme !== Schemas.file || await Promises.exists(workspace.configPath.fsPath)) {
						result.push(workspaceInfo);
					} else {
						// If the workspace has backups, but the target workspace is missing, convert backups to empty ones
						await this.convertToEmptyWindowBackup(backupPath);
					}
				} else {
					await this.deleteStaleBackup(backupPath);
				}
			}
		}

		return result;
	}

	private async validateFolders(folderWorkspaces: IFolderBackupInfo[]): Promise<IFolderBackupInfo[]> {
		if (!Array.isArray(folderWorkspaces)) {
			return [];
		}

		const result: IFolderBackupInfo[] = [];
		const seenIds: Set<string> = new Set();
		for (const folderInfo of folderWorkspaces) {
			const folderURI = folderInfo.folderUri;
			const key = this.backupUriComparer.getComparisonKey(folderURI);
			if (!seenIds.has(key)) {
				seenIds.add(key);

				const backupPath = this.getBackupPath(this.getFolderHash(folderInfo));
				const hasBackups = await this.doHasBackups(backupPath);

				// If the folder has no backups, ignore it
				if (hasBackups) {
					if (folderURI.scheme !== Schemas.file || await Promises.exists(folderURI.fsPath)) {
						result.push(folderInfo);
					} else {
						// If the folder has backups, but the target workspace is missing, convert backups to empty ones
						await this.convertToEmptyWindowBackup(backupPath);
					}
				} else {
					await this.deleteStaleBackup(backupPath);
				}
			}
		}

		return result;
	}

	private async validateEmptyWorkspaces(emptyWorkspaces: IEmptyWindowBackupInfo[]): Promise<IEmptyWindowBackupInfo[]> {
		if (!Array.isArray(emptyWorkspaces)) {
			return [];
		}

		const result: IEmptyWindowBackupInfo[] = [];
		const seenIds: Set<string> = new Set();

		// Validate Empty Windows
		for (const backupInfo of emptyWorkspaces) {
			const backupFolder = backupInfo.backupFolder;
			if (typeof backupFolder !== 'string') {
				return [];
			}

			if (!seenIds.has(backupFolder)) {
				seenIds.add(backupFolder);

				const backupPath = this.getBackupPath(backupFolder);
				if (await this.doHasBackups(backupPath)) {
					result.push(backupInfo);
				} else {
					await this.deleteStaleBackup(backupPath);
				}
			}
		}

		return result;
	}

	private async deleteStaleBackup(backupPath: string): Promise<void> {
		try {
			await Promises.rm(backupPath, RimRafMode.MOVE);
		} catch (error) {
			this.logService.error(`Backup: Could not delete stale backup: ${error.toString()}`);
		}
	}

	private async convertToEmptyWindowBackup(backupPath: string): Promise<boolean> {

		// New empty window backup
		let newBackupFolder = this.getRandomEmptyWindowId();
		while (this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, newBackupFolder))) {
			newBackupFolder = this.getRandomEmptyWindowId();
		}

		// Rename backupPath to new empty window backup path
		const newEmptyWindowBackupPath = this.getBackupPath(newBackupFolder);
		try {
			await Promises.rename(backupPath, newEmptyWindowBackupPath);
		} catch (error) {
			this.logService.error(`Backup: Could not rename backup folder: ${error.toString()}`);
			return false;
		}
		this.emptyWindows.push({ backupFolder: newBackupFolder });

		return true;
	}

	private convertToEmptyWindowBackupSync(backupPath: string): boolean {

		// New empty window backup
		let newBackupFolder = this.getRandomEmptyWindowId();
		while (this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, newBackupFolder))) {
			newBackupFolder = this.getRandomEmptyWindowId();
		}

		// Rename backupPath to new empty window backup path
		const newEmptyWindowBackupPath = this.getBackupPath(newBackupFolder);
		try {
			fs.renameSync(backupPath, newEmptyWindowBackupPath);
		} catch (error) {
			this.logService.error(`Backup: Could not rename backup folder: ${error.toString()}`);
			return false;
		}
		this.emptyWindows.push({ backupFolder: newBackupFolder });

		return true;
	}

	async getDirtyWorkspaces(): Promise<Array<IWorkspaceBackupInfo | IFolderBackupInfo>> {
		const dirtyWorkspaces: Array<IWorkspaceBackupInfo | IFolderBackupInfo> = [];

		// Workspaces with backups
		for (const workspace of this.workspaces) {
			if ((await this.hasBackups(workspace))) {
				dirtyWorkspaces.push(workspace);
			}
		}

		// Folders with backups
		for (const folder of this.folders) {
			if ((await this.hasBackups(folder))) {
				dirtyWorkspaces.push(folder);
			}
		}

		return dirtyWorkspaces;
	}

	private hasBackups(backupLocation: IWorkspaceBackupInfo | IEmptyWindowBackupInfo | IFolderBackupInfo): Promise<boolean> {
		let backupPath: string;

		// Empty
		if (isEmptyWindowBackupInfo(backupLocation)) {
			backupPath = backupLocation.backupFolder;
		}

		// Folder
		else if (isFolderBackupInfo(backupLocation)) {
			backupPath = this.getBackupPath(this.getFolderHash(backupLocation));
		}

		// Workspace
		else {
			backupPath = this.getBackupPath(backupLocation.workspace.id);
		}

		return this.doHasBackups(backupPath);
	}

	private async doHasBackups(backupPath: string): Promise<boolean> {
		try {
			const backupSchemas = await Promises.readdir(backupPath);

			for (const backupSchema of backupSchemas) {
				try {
					const backupSchemaChildren = await Promises.readdir(join(backupPath, backupSchema));
					if (backupSchemaChildren.length > 0) {
						return true;
					}
				} catch (error) {
					// invalid folder
				}
			}
		} catch (error) {
			// backup path does not exist
		}

		return false;
	}

	private async readWorkspacesMetadata(): Promise<string | undefined> {
		try {
			this.lastKnownWorkspacesJsonContents = await Promises.readFile(this.workspacesJsonPath, 'utf8');
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.logService.error(`Backup: Could not read workspaces.json: ${error.toString()}`);
			}
		}

		return this.lastKnownWorkspacesJsonContents;
	}

	private writeWorkspacesMetadata(): void {

		// No pending save: directly set as pending
		if (!this.workspacesJsonSaveSequentializer.hasPending()) {
			this.workspacesJsonSaveSequentializer.setPending(++this.workspacesJsonWriteCounter, this.doWriteWorkspacesMetadata());
		}

		// Pending task: schedule to run next
		else {
			this.workspacesJsonSaveSequentializer.setNext(() => this.doWriteWorkspacesMetadata());
		}
	}

	private async doWriteWorkspacesMetadata(): Promise<void> {
		try {
			const newWorkspacesJsonContentsContents = JSON.stringify(this.serializeBackups());
			if (this.lastKnownWorkspacesJsonContents !== newWorkspacesJsonContentsContents) {
				await Promises.writeFile(this.workspacesJsonPath, newWorkspacesJsonContentsContents);
				this.lastKnownWorkspacesJsonContents = newWorkspacesJsonContentsContents;
			}
		} catch (error) {
			this.logService.error(`Backup: Could not save workspaces.json: ${error.toString()}`);
		}
	}

	private serializeBackups(): ISerializedBackupWorkspaces {
		return {
			rootURIWorkspaces: this.workspaces.map(workspace => (
				{
					id: workspace.workspace.id,
					configURIPath: workspace.workspace.configPath.toString(),
					remoteAuthority: workspace.remoteAuthority
				}
			)),
			folderWorkspaceInfos: this.folders.map(folder => (
				{
					folderUri: folder.folderUri.toString(),
					remoteAuthority: folder.remoteAuthority
				}
			)),
			emptyWorkspaceInfos: this.emptyWindows
		};
	}

	private getRandomEmptyWindowId(): string {
		return (Date.now() + Math.round(Math.random() * 1000)).toString();
	}

	protected getFolderHash(folder: IFolderBackupInfo): string {
		const folderUri = folder.folderUri;
		let key: string;

		if (folderUri.scheme === Schemas.file) {
			// for backward compatibility, use the fspath as key
			key = isLinux ? folderUri.fsPath : folderUri.fsPath.toLowerCase();
		} else {
			key = folderUri.toString().toLowerCase();
		}

		return createHash('md5').update(key).digest('hex');
	}
}
