/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as arrays from 'vs/base/common/arrays';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as platform from 'vs/base/common/platform';
import * as extfs from 'vs/base/node/extfs';
import { IBackupWorkspacesFormat, IBackupMainService } from 'vs/platform/backup/common/backup';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { IFilesConfiguration, HotExitConfiguration } from 'vs/platform/files/common/files';
import { ILogService } from "vs/platform/log/common/log";
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier, IWorkspacesMainService, IWorkspaceSavedEvent } from "vs/platform/workspaces/common/workspaces";

export class BackupMainService implements IBackupMainService {

	public _serviceBrand: any;

	protected backupHome: string;
	protected workspacesJsonPath: string;

	protected backups: IBackupWorkspacesFormat;

	constructor(
		@IEnvironmentService environmentService: IEnvironmentService,
		@IConfigurationService private configurationService: IConfigurationService,
		@ILogService private logService: ILogService,
		@IWorkspacesMainService private workspacesService: IWorkspacesMainService
	) {
		this.backupHome = environmentService.backupHome;
		this.workspacesJsonPath = environmentService.backupWorkspacesPath;

		this.loadSync();
		this.registerListeners();
	}

	private registerListeners(): void {
		this.workspacesService.onWorkspaceSaved(e => this.onWorkspaceSaved(e));
	}

	private onWorkspaceSaved(e: IWorkspaceSavedEvent): void {

		// A workspace was saved to a new configuration location. Make sure to update
		// our backup state with this new location.
		let needsUpdate = false;
		this.backups.rootWorkspaces.forEach(workspace => {
			if (workspace.id === e.workspace.id && workspace.configPath !== e.workspace.configPath) {
				workspace.configPath = e.workspace.configPath;
				needsUpdate = true;
			}
		});

		if (needsUpdate) {
			this.saveSync();
		}
	}

	public getWorkspaceBackups(): IWorkspaceIdentifier[] {
		if (this.isHotExitOnExitAndWindowClose()) {
			// Only non-folder windows are restored on main process launch when
			// hot exit is configured as onExitAndWindowClose.
			return [];
		}

		return this.backups.rootWorkspaces.slice(0); // return a copy
	}

	public getFolderBackupPaths(): string[] {
		if (this.isHotExitOnExitAndWindowClose()) {
			// Only non-folder windows are restored on main process launch when
			// hot exit is configured as onExitAndWindowClose.
			return [];
		}

		return this.backups.folderWorkspaces.slice(0); // return a copy
	}

	private isHotExitOnExitAndWindowClose(): boolean {
		const config = this.configurationService.getConfiguration<IFilesConfiguration>();

		return config && config.files && config.files.hotExit === HotExitConfiguration.ON_EXIT_AND_WINDOW_CLOSE;
	}

	public getEmptyWindowBackupPaths(): string[] {
		return this.backups.emptyWorkspaces.slice(0); // return a copy
	}

	public registerWorkspaceBackupSync(workspace: IWorkspaceIdentifier): string {
		this.pushBackupPathsSync(workspace, this.backups.rootWorkspaces);

		return path.join(this.backupHome, workspace.id);
	}

	public registerFolderBackupSync(folderPath: string): string {
		this.pushBackupPathsSync(folderPath, this.backups.folderWorkspaces);

		return path.join(this.backupHome, this.getFolderHash(folderPath));
	}

	public registerEmptyWindowBackupSync(backupFolder?: string): string {

		// Generate a new folder if this is a new empty workspace
		if (!backupFolder) {
			backupFolder = this.getRandomEmptyWindowId();
		}

		this.pushBackupPathsSync(backupFolder, this.backups.emptyWorkspaces);

		return path.join(this.backupHome, backupFolder);
	}

	private pushBackupPathsSync(workspaceIdentifier: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, target: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[]): void {
		if (this.indexOf(workspaceIdentifier, target) === -1) {
			target.push(workspaceIdentifier);
			this.saveSync();
		}
	}

	protected removeBackupPathSync(workspaceIdentifier: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, target: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[]): void {
		if (!target) {
			return;
		}

		const index = this.indexOf(workspaceIdentifier, target);
		if (index === -1) {
			return;
		}

		target.splice(index, 1);
		this.saveSync();
	}

	private indexOf(workspaceIdentifier: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, target: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[]): number {
		if (!target) {
			return -1;
		}

		const sanitizedWorkspaceIdentifier = this.sanitizeId(workspaceIdentifier);

		return arrays.firstIndex(target, id => this.sanitizeId(id) === sanitizedWorkspaceIdentifier);
	}

	private sanitizeId(workspaceIdentifier: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier): string {
		if (typeof workspaceIdentifier === 'string') {
			return this.sanitizePath(workspaceIdentifier);
		}

		return workspaceIdentifier.id;
	}

	protected loadSync(): void {
		let backups: IBackupWorkspacesFormat;
		try {
			backups = JSON.parse(fs.readFileSync(this.workspacesJsonPath, 'utf8').toString()); // invalid JSON or permission issue can happen here
		} catch (error) {
			backups = Object.create(null);
		}

		// Ensure rootWorkspaces is a object[]
		if (backups.rootWorkspaces) {
			const rws = backups.rootWorkspaces;
			if (!Array.isArray(rws) || rws.some(r => typeof r !== 'object')) {
				backups.rootWorkspaces = [];
			}
		} else {
			backups.rootWorkspaces = [];
		}

		// Ensure folderWorkspaces is a string[]
		if (backups.folderWorkspaces) {
			const fws = backups.folderWorkspaces;
			if (!Array.isArray(fws) || fws.some(f => typeof f !== 'string')) {
				backups.folderWorkspaces = [];
			}
		} else {
			backups.folderWorkspaces = [];
		}

		// Ensure emptyWorkspaces is a string[]
		if (backups.emptyWorkspaces) {
			const fws = backups.emptyWorkspaces;
			if (!Array.isArray(fws) || fws.some(f => typeof f !== 'string')) {
				backups.emptyWorkspaces = [];
			}
		} else {
			backups.emptyWorkspaces = [];
		}

		this.backups = this.dedupeBackups(backups);

		// Validate backup workspaces
		this.validateBackupWorkspaces(backups);
	}

	protected dedupeBackups(backups: IBackupWorkspacesFormat): IBackupWorkspacesFormat {

		// De-duplicate folder/workspace backups. don't worry about cleaning them up any duplicates as
		// they will be removed when there are no backups.
		backups.folderWorkspaces = arrays.distinct(backups.folderWorkspaces, ws => this.sanitizePath(ws));
		backups.rootWorkspaces = arrays.distinct(backups.rootWorkspaces, ws => this.sanitizePath(ws.id));

		return backups;
	}

	private validateBackupWorkspaces(backups: IBackupWorkspacesFormat): void {
		const staleBackupWorkspaces: { workspaceIdentifier: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier; backupPath: string; target: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[] }[] = [];

		const workspaceAndFolders: { workspaceIdentifier: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier, target: (IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier)[] }[] = [];
		workspaceAndFolders.push(...backups.rootWorkspaces.map(r => ({ workspaceIdentifier: r, target: backups.rootWorkspaces })));
		workspaceAndFolders.push(...backups.folderWorkspaces.map(f => ({ workspaceIdentifier: f, target: backups.folderWorkspaces })));

		// Validate Workspace and Folder Backups
		workspaceAndFolders.forEach(workspaceOrFolder => {
			const workspaceId = workspaceOrFolder.workspaceIdentifier;
			const workspacePath = typeof workspaceId === 'string' ? workspaceId : workspaceId.configPath;
			const backupPath = path.join(this.backupHome, typeof workspaceId === 'string' ? this.getFolderHash(workspaceId) : workspaceId.id);
			const hasBackups = this.hasBackupsSync(backupPath);
			const missingWorkspace = hasBackups && !fs.existsSync(workspacePath);

			// If the workspace/folder has no backups, make sure to delete it
			// If the workspace/folder has backups, but the target workspace is missing, convert backups to empty ones
			if (!hasBackups || missingWorkspace) {
				staleBackupWorkspaces.push({ workspaceIdentifier: workspaceId, backupPath, target: workspaceOrFolder.target });

				if (missingWorkspace) {
					const identifier = this.getRandomEmptyWindowId();
					this.pushBackupPathsSync(identifier, this.backups.emptyWorkspaces);
					const newEmptyWindowBackupPath = path.join(path.dirname(backupPath), identifier);
					try {
						fs.renameSync(backupPath, newEmptyWindowBackupPath);
					} catch (ex) {
						this.logService.error(`Backup: Could not rename backup folder for missing workspace: ${ex.toString()}`);

						this.removeBackupPathSync(identifier, this.backups.emptyWorkspaces);
					}
				}
			}
		});

		// Validate Empty Windows
		backups.emptyWorkspaces.forEach(backupFolder => {
			const backupPath = path.join(this.backupHome, backupFolder);
			if (!this.hasBackupsSync(backupPath)) {
				staleBackupWorkspaces.push({ workspaceIdentifier: backupFolder, backupPath, target: backups.emptyWorkspaces });
			}
		});

		// Clean up stale backups
		staleBackupWorkspaces.forEach(staleBackupWorkspace => {
			const { backupPath, workspaceIdentifier, target } = staleBackupWorkspace;

			try {
				extfs.delSync(backupPath);
			} catch (ex) {
				this.logService.error(`Backup: Could not delete stale backup: ${ex.toString()}`);
			}

			this.removeBackupPathSync(workspaceIdentifier, target);
		});
	}

	private hasBackupsSync(backupPath: string): boolean {
		try {
			const backupSchemas = extfs.readdirSync(backupPath);
			if (backupSchemas.length === 0) {
				return false; // empty backups
			}

			return backupSchemas.some(backupSchema => {
				try {
					return extfs.readdirSync(path.join(backupPath, backupSchema)).length > 0;
				} catch (error) {
					return false; // invalid folder
				}
			});
		} catch (error) {
			return false; // backup path does not exist
		}
	}

	private saveSync(): void {
		try {
			// The user data directory must exist so only the Backup directory needs to be checked.
			if (!fs.existsSync(this.backupHome)) {
				fs.mkdirSync(this.backupHome);
			}

			fs.writeFileSync(this.workspacesJsonPath, JSON.stringify(this.backups));
		} catch (ex) {
			this.logService.error(`Backup: Could not save workspaces.json: ${ex.toString()}`);
		}
	}

	private getRandomEmptyWindowId(): string {
		return (Date.now() + Math.round(Math.random() * 1000)).toString();
	}

	private sanitizePath(p: string): string {
		return platform.isLinux ? p : p.toLowerCase();
	}

	protected getFolderHash(folderPath: string): string {
		return crypto.createHash('md5').update(this.sanitizePath(folderPath)).digest('hex');
	}
}
