/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createHash } from 'crypto';
import { isEqual } from '../../../base/common/extpath.js';
import { Schemas } from '../../../base/common/network.js';
import { join } from '../../../base/common/path.js';
import { isLinux } from '../../../base/common/platform.js';
import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { Promises, RimRafMode } from '../../../base/node/pfs.js';
import { IBackupMainService } from './backup.js';
import { ISerializedBackupWorkspaces, IEmptyWindowBackupInfo, isEmptyWindowBackupInfo, deserializeWorkspaceInfos, deserializeFolderInfos, ISerializedWorkspaceBackupInfo, ISerializedFolderBackupInfo, ISerializedEmptyWindowBackupInfo } from '../node/backup.js';
import { IConfigurationService } from '../../configuration/common/configuration.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { IStateService } from '../../state/node/state.js';
import { HotExitConfiguration, IFilesConfiguration } from '../../files/common/files.js';
import { ILogService } from '../../log/common/log.js';
import { IFolderBackupInfo, isFolderBackupInfo, IWorkspaceBackupInfo } from '../common/backup.js';
import { isWorkspaceIdentifier } from '../../workspace/common/workspace.js';
import { createEmptyWorkspaceIdentifier } from '../../workspaces/node/workspaces.js';

export class BackupMainService implements IBackupMainService {

	declare readonly _serviceBrand: undefined;

	private static readonly backupWorkspacesMetadataStorageKey = 'backupWorkspaces';

	protected backupHome = this.environmentMainService.backupHome;

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
		@IStateService private readonly stateService: IStateService
	) {
	}

	async initialize(): Promise<void> {

		// read backup workspaces
		const serializedBackupWorkspaces = this.stateService.getItem<ISerializedBackupWorkspaces>(BackupMainService.backupWorkspacesMetadataStorageKey) ?? { workspaces: [], folders: [], emptyWindows: [] };

		// validate empty workspaces backups first
		this.emptyWindows = await this.validateEmptyWorkspaces(serializedBackupWorkspaces.emptyWindows);

		// validate workspace backups
		this.workspaces = await this.validateWorkspaces(deserializeWorkspaceInfos(serializedBackupWorkspaces));

		// validate folder backups
		this.folders = await this.validateFolders(deserializeFolderInfos(serializedBackupWorkspaces));

		// store metadata in case some workspaces or folders have been removed
		this.storeWorkspacesMetadata();
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

	registerWorkspaceBackup(workspaceInfo: IWorkspaceBackupInfo): string;
	registerWorkspaceBackup(workspaceInfo: IWorkspaceBackupInfo, migrateFrom: string): Promise<string>;
	registerWorkspaceBackup(workspaceInfo: IWorkspaceBackupInfo, migrateFrom?: string): string | Promise<string> {
		if (!this.workspaces.some(workspace => workspaceInfo.workspace.id === workspace.workspace.id)) {
			this.workspaces.push(workspaceInfo);
			this.storeWorkspacesMetadata();
		}

		const backupPath = join(this.backupHome, workspaceInfo.workspace.id);

		if (migrateFrom) {
			return this.moveBackupFolder(backupPath, migrateFrom).then(() => backupPath);
		}

		return backupPath;
	}

	private async moveBackupFolder(backupPath: string, moveFromPath: string): Promise<void> {

		// Target exists: make sure to convert existing backups to empty window backups
		if (await Promises.exists(backupPath)) {
			await this.convertToEmptyWindowBackup(backupPath);
		}

		// When we have data to migrate from, move it over to the target location
		if (await Promises.exists(moveFromPath)) {
			try {
				await Promises.rename(moveFromPath, backupPath, false /* no retry */);
			} catch (error) {
				this.logService.error(`Backup: Could not move backup folder to new location: ${error.toString()}`);
			}
		}
	}

	registerFolderBackup(folderInfo: IFolderBackupInfo): string {
		if (!this.folders.some(folder => this.backupUriComparer.isEqual(folderInfo.folderUri, folder.folderUri))) {
			this.folders.push(folderInfo);
			this.storeWorkspacesMetadata();
		}

		return join(this.backupHome, this.getFolderHash(folderInfo));
	}

	registerEmptyWindowBackup(emptyWindowInfo: IEmptyWindowBackupInfo): string {
		if (!this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, emptyWindowInfo.backupFolder))) {
			this.emptyWindows.push(emptyWindowInfo);
			this.storeWorkspacesMetadata();
		}

		return join(this.backupHome, emptyWindowInfo.backupFolder);
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

				const backupPath = join(this.backupHome, workspace.id);
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

				const backupPath = join(this.backupHome, this.getFolderHash(folderInfo));
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

				const backupPath = join(this.backupHome, backupFolder);
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

	private prepareNewEmptyWindowBackup(): IEmptyWindowBackupInfo {

		// We are asked to prepare a new empty window backup folder.
		// Empty windows backup folders are derived from a workspace
		// identifier, so we generate a new empty workspace identifier
		// until we found a unique one.

		let emptyWorkspaceIdentifier = createEmptyWorkspaceIdentifier();
		while (this.emptyWindows.some(emptyWindow => !!emptyWindow.backupFolder && this.backupPathComparer.isEqual(emptyWindow.backupFolder, emptyWorkspaceIdentifier.id))) {
			emptyWorkspaceIdentifier = createEmptyWorkspaceIdentifier();
		}

		return { backupFolder: emptyWorkspaceIdentifier.id };
	}

	private async convertToEmptyWindowBackup(backupPath: string): Promise<boolean> {
		const newEmptyWindowBackupInfo = this.prepareNewEmptyWindowBackup();

		// Rename backupPath to new empty window backup path
		const newEmptyWindowBackupPath = join(this.backupHome, newEmptyWindowBackupInfo.backupFolder);
		try {
			await Promises.rename(backupPath, newEmptyWindowBackupPath, false /* no retry */);
		} catch (error) {
			this.logService.error(`Backup: Could not rename backup folder: ${error.toString()}`);
			return false;
		}
		this.emptyWindows.push(newEmptyWindowBackupInfo);

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
			backupPath = join(this.backupHome, backupLocation.backupFolder);
		}

		// Folder
		else if (isFolderBackupInfo(backupLocation)) {
			backupPath = join(this.backupHome, this.getFolderHash(backupLocation));
		}

		// Workspace
		else {
			backupPath = join(this.backupHome, backupLocation.workspace.id);
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


	private storeWorkspacesMetadata(): void {
		const serializedBackupWorkspaces: ISerializedBackupWorkspaces = {
			workspaces: this.workspaces.map(({ workspace, remoteAuthority }) => {
				const serializedWorkspaceBackupInfo: ISerializedWorkspaceBackupInfo = {
					id: workspace.id,
					configURIPath: workspace.configPath.toString()
				};

				if (remoteAuthority) {
					serializedWorkspaceBackupInfo.remoteAuthority = remoteAuthority;
				}

				return serializedWorkspaceBackupInfo;
			}),
			folders: this.folders.map(({ folderUri, remoteAuthority }) => {
				const serializedFolderBackupInfo: ISerializedFolderBackupInfo =
				{
					folderUri: folderUri.toString()
				};

				if (remoteAuthority) {
					serializedFolderBackupInfo.remoteAuthority = remoteAuthority;
				}

				return serializedFolderBackupInfo;
			}),
			emptyWindows: this.emptyWindows.map(({ backupFolder, remoteAuthority }) => {
				const serializedEmptyWindowBackupInfo: ISerializedEmptyWindowBackupInfo = {
					backupFolder
				};

				if (remoteAuthority) {
					serializedEmptyWindowBackupInfo.remoteAuthority = remoteAuthority;
				}

				return serializedEmptyWindowBackupInfo;
			})
		};

		this.stateService.setItem(BackupMainService.backupWorkspacesMetadataStorageKey, serializedBackupWorkspaces);
	}

	protected getFolderHash(folder: IFolderBackupInfo): string {
		const folderUri = folder.folderUri;

		let key: string;
		if (folderUri.scheme === Schemas.file) {
			key = isLinux ? folderUri.fsPath : folderUri.fsPath.toLowerCase(); // for backward compatibility, use the fspath as key
		} else {
			key = folderUri.toString().toLowerCase();
		}

		return createHash('md5').update(key).digest('hex'); // CodeQL [SM04514] Using MD5 to convert a file path to a fixed length
	}
}
