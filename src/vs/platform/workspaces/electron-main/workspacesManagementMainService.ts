/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import electron from 'electron';
import { Emitter, Event } from '../../../base/common/event.js';
import { parse } from '../../../base/common/json.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { Schemas } from '../../../base/common/network.js';
import { dirname, join } from '../../../base/common/path.js';
import { basename, extUriBiasedIgnorePathCase, joinPath, originalFSPath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { Promises } from '../../../base/node/pfs.js';
import { localize } from '../../../nls.js';
import { IBackupMainService } from '../../backup/electron-main/backup.js';
import { IDialogMainService } from '../../dialogs/electron-main/dialogMainService.js';
import { IEnvironmentMainService } from '../../environment/electron-main/environmentMainService.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IUserDataProfilesMainService } from '../../userDataProfile/electron-main/userDataProfile.js';
import { ICodeWindow } from '../../window/electron-main/window.js';
import { findWindowOnWorkspaceOrFolder } from '../../windows/electron-main/windowsFinder.js';
import { isWorkspaceIdentifier, IWorkspaceIdentifier, IResolvedWorkspace, hasWorkspaceFileExtension, UNTITLED_WORKSPACE_NAME, isUntitledWorkspace } from '../../workspace/common/workspace.js';
import { getStoredWorkspaceFolder, IEnterWorkspaceResult, isStoredWorkspaceFolder, IStoredWorkspace, IStoredWorkspaceFolder, IUntitledWorkspaceInfo, IWorkspaceFolderCreationData, toWorkspaceFolders } from '../common/workspaces.js';
import { getWorkspaceIdentifier } from '../node/workspaces.js';

export const IWorkspacesManagementMainService = createDecorator<IWorkspacesManagementMainService>('workspacesManagementMainService');

export interface IWorkspaceEnteredEvent {
	readonly window: ICodeWindow;
	readonly workspace: IWorkspaceIdentifier;
}

export interface IWorkspacesManagementMainService {

	readonly _serviceBrand: undefined;

	readonly onDidDeleteUntitledWorkspace: Event<IWorkspaceIdentifier>;
	readonly onDidEnterWorkspace: Event<IWorkspaceEnteredEvent>;

	enterWorkspace(intoWindow: ICodeWindow, openedWindows: ICodeWindow[], path: URI): Promise<IEnterWorkspaceResult | undefined>;

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier>;

	deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void>;

	getUntitledWorkspaces(): IUntitledWorkspaceInfo[];
	isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean;

	resolveLocalWorkspace(path: URI): Promise<IResolvedWorkspace | undefined>;

	getWorkspaceIdentifier(workspacePath: URI): Promise<IWorkspaceIdentifier>;
}

export class WorkspacesManagementMainService extends Disposable implements IWorkspacesManagementMainService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidDeleteUntitledWorkspace = this._register(new Emitter<IWorkspaceIdentifier>());
	readonly onDidDeleteUntitledWorkspace: Event<IWorkspaceIdentifier> = this._onDidDeleteUntitledWorkspace.event;

	private readonly _onDidEnterWorkspace = this._register(new Emitter<IWorkspaceEnteredEvent>());
	readonly onDidEnterWorkspace: Event<IWorkspaceEnteredEvent> = this._onDidEnterWorkspace.event;

	private readonly untitledWorkspacesHome = this.environmentMainService.untitledWorkspacesHome; // local URI that contains all untitled workspaces

	private untitledWorkspaces: IUntitledWorkspaceInfo[] = [];

	constructor(
		@IEnvironmentMainService private readonly environmentMainService: IEnvironmentMainService,
		@ILogService private readonly logService: ILogService,
		@IUserDataProfilesMainService private readonly userDataProfilesMainService: IUserDataProfilesMainService,
		@IBackupMainService private readonly backupMainService: IBackupMainService,
		@IDialogMainService private readonly dialogMainService: IDialogMainService
	) {
		super();
	}

	async initialize(): Promise<void> {

		// Reset
		this.untitledWorkspaces = [];

		// Resolve untitled workspaces
		try {
			const untitledWorkspacePaths = (await Promises.readdir(this.untitledWorkspacesHome.with({ scheme: Schemas.file }).fsPath)).map(folder => joinPath(this.untitledWorkspacesHome, folder, UNTITLED_WORKSPACE_NAME));
			for (const untitledWorkspacePath of untitledWorkspacePaths) {
				const workspace = getWorkspaceIdentifier(untitledWorkspacePath);
				const resolvedWorkspace = await this.resolveLocalWorkspace(untitledWorkspacePath);
				if (!resolvedWorkspace) {
					await this.deleteUntitledWorkspace(workspace);
				} else {
					this.untitledWorkspaces.push({ workspace, remoteAuthority: resolvedWorkspace.remoteAuthority });
				}
			}
		} catch (error) {
			if (error.code !== 'ENOENT') {
				this.logService.warn(`Unable to read folders in ${this.untitledWorkspacesHome} (${error}).`);
			}
		}
	}

	resolveLocalWorkspace(uri: URI): Promise<IResolvedWorkspace | undefined> {
		return this.doResolveLocalWorkspace(uri, path => fs.promises.readFile(path, 'utf8'));
	}

	private doResolveLocalWorkspace(uri: URI, contentsFn: (path: string) => string): IResolvedWorkspace | undefined;
	private doResolveLocalWorkspace(uri: URI, contentsFn: (path: string) => Promise<string>): Promise<IResolvedWorkspace | undefined>;
	private doResolveLocalWorkspace(uri: URI, contentsFn: (path: string) => string | Promise<string>): IResolvedWorkspace | undefined | Promise<IResolvedWorkspace | undefined> {
		if (!this.isWorkspacePath(uri)) {
			return undefined; // does not look like a valid workspace config file
		}

		if (uri.scheme !== Schemas.file) {
			return undefined;
		}

		try {
			const contents = contentsFn(uri.fsPath);
			if (contents instanceof Promise) {
				return contents.then(value => this.doResolveWorkspace(uri, value), error => undefined /* invalid workspace */);
			} else {
				return this.doResolveWorkspace(uri, contents);
			}
		} catch {
			return undefined; // invalid workspace
		}
	}

	private isWorkspacePath(uri: URI): boolean {
		return isUntitledWorkspace(uri, this.environmentMainService) || hasWorkspaceFileExtension(uri);
	}

	private doResolveWorkspace(path: URI, contents: string): IResolvedWorkspace | undefined {
		try {
			const workspace = this.doParseStoredWorkspace(path, contents);
			const workspaceIdentifier = getWorkspaceIdentifier(path);
			return {
				id: workspaceIdentifier.id,
				configPath: workspaceIdentifier.configPath,
				folders: toWorkspaceFolders(workspace.folders, workspaceIdentifier.configPath, extUriBiasedIgnorePathCase),
				remoteAuthority: workspace.remoteAuthority,
				transient: workspace.transient
			};
		} catch (error) {
			this.logService.warn(error.toString());
		}

		return undefined;
	}

	private doParseStoredWorkspace(path: URI, contents: string): IStoredWorkspace {

		// Parse workspace file
		const storedWorkspace: IStoredWorkspace = parse(contents); // use fault tolerant parser

		// Filter out folders which do not have a path or uri set
		if (storedWorkspace && Array.isArray(storedWorkspace.folders)) {
			storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
		} else {
			throw new Error(`${path.toString(true)} looks like an invalid workspace file.`);
		}

		return storedWorkspace;
	}

	async createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[], remoteAuthority?: string): Promise<IWorkspaceIdentifier> {
		const { workspace, storedWorkspace } = this.newUntitledWorkspace(folders, remoteAuthority);
		const configPath = workspace.configPath.fsPath;

		await fs.promises.mkdir(dirname(configPath), { recursive: true });
		await Promises.writeFile(configPath, JSON.stringify(storedWorkspace, null, '\t'));

		this.untitledWorkspaces.push({ workspace, remoteAuthority });

		return workspace;
	}

	private newUntitledWorkspace(folders: IWorkspaceFolderCreationData[] = [], remoteAuthority?: string): { workspace: IWorkspaceIdentifier; storedWorkspace: IStoredWorkspace } {
		const randomId = (Date.now() + Math.round(Math.random() * 1000)).toString();
		const untitledWorkspaceConfigFolder = joinPath(this.untitledWorkspacesHome, randomId);
		const untitledWorkspaceConfigPath = joinPath(untitledWorkspaceConfigFolder, UNTITLED_WORKSPACE_NAME);

		const storedWorkspaceFolder: IStoredWorkspaceFolder[] = [];

		for (const folder of folders) {
			storedWorkspaceFolder.push(getStoredWorkspaceFolder(folder.uri, true, folder.name, untitledWorkspaceConfigFolder, extUriBiasedIgnorePathCase));
		}

		return {
			workspace: getWorkspaceIdentifier(untitledWorkspaceConfigPath),
			storedWorkspace: { folders: storedWorkspaceFolder, remoteAuthority }
		};
	}

	async getWorkspaceIdentifier(configPath: URI): Promise<IWorkspaceIdentifier> {
		return getWorkspaceIdentifier(configPath);
	}

	isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean {
		return isUntitledWorkspace(workspace.configPath, this.environmentMainService);
	}

	async deleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void> {
		if (!this.isUntitledWorkspace(workspace)) {
			return; // only supported for untitled workspaces
		}

		// Delete from disk
		await this.doDeleteUntitledWorkspace(workspace);

		// unset workspace from profiles
		this.userDataProfilesMainService.unsetWorkspace(workspace);

		// Event
		this._onDidDeleteUntitledWorkspace.fire(workspace);
	}

	private async doDeleteUntitledWorkspace(workspace: IWorkspaceIdentifier): Promise<void> {
		const configPath = originalFSPath(workspace.configPath);
		try {

			// Delete Workspace
			await Promises.rm(dirname(configPath));

			// Mark Workspace Storage to be deleted
			const workspaceStoragePath = join(this.environmentMainService.workspaceStorageHome.with({ scheme: Schemas.file }).fsPath, workspace.id);
			if (await Promises.exists(workspaceStoragePath)) {
				await Promises.writeFile(join(workspaceStoragePath, 'obsolete'), '');
			}

			// Remove from list
			this.untitledWorkspaces = this.untitledWorkspaces.filter(untitledWorkspace => untitledWorkspace.workspace.id !== workspace.id);
		} catch (error) {
			this.logService.warn(`Unable to delete untitled workspace ${configPath} (${error}).`);
		}
	}

	getUntitledWorkspaces(): IUntitledWorkspaceInfo[] {
		return this.untitledWorkspaces;
	}

	async enterWorkspace(window: ICodeWindow, windows: ICodeWindow[], path: URI): Promise<IEnterWorkspaceResult | undefined> {
		if (!window || !window.win || !window.isReady) {
			return undefined; // return early if the window is not ready or disposed
		}

		const isValid = await this.isValidTargetWorkspacePath(window, windows, path);
		if (!isValid) {
			return undefined; // return early if the workspace is not valid
		}

		const result = await this.doEnterWorkspace(window, getWorkspaceIdentifier(path));
		if (!result) {
			return undefined;
		}

		// Emit as event
		this._onDidEnterWorkspace.fire({ window, workspace: result.workspace });

		return result;
	}

	private async isValidTargetWorkspacePath(window: ICodeWindow, windows: ICodeWindow[], workspacePath?: URI): Promise<boolean> {
		if (!workspacePath) {
			return true;
		}

		if (isWorkspaceIdentifier(window.openedWorkspace) && extUriBiasedIgnorePathCase.isEqual(window.openedWorkspace.configPath, workspacePath)) {
			return false; // window is already opened on a workspace with that path
		}

		// Prevent overwriting a workspace that is currently opened in another window
		if (findWindowOnWorkspaceOrFolder(windows, workspacePath)) {
			await this.dialogMainService.showMessageBox({
				type: 'info',
				buttons: [localize({ key: 'ok', comment: ['&& denotes a mnemonic'] }, "&&OK")],
				message: localize('workspaceOpenedMessage', "Unable to save workspace '{0}'", basename(workspacePath)),
				detail: localize('workspaceOpenedDetail', "The workspace is already opened in another window. Please close that window first and then try again.")
			}, electron.BrowserWindow.getFocusedWindow() ?? undefined);

			return false;
		}

		return true; // OK
	}

	private async doEnterWorkspace(window: ICodeWindow, workspace: IWorkspaceIdentifier): Promise<IEnterWorkspaceResult | undefined> {
		if (!window.config) {
			return undefined;
		}

		window.focus();

		// Register window for backups and migrate current backups over
		let backupPath: string | undefined;
		if (!window.config.extensionDevelopmentPath) {
			if (window.config.backupPath) {
				backupPath = await this.backupMainService.registerWorkspaceBackup({ workspace, remoteAuthority: window.remoteAuthority }, window.config.backupPath);
			} else {
				backupPath = this.backupMainService.registerWorkspaceBackup({ workspace, remoteAuthority: window.remoteAuthority });
			}
		}

		// if the window was opened on an untitled workspace, delete it.
		if (isWorkspaceIdentifier(window.openedWorkspace) && this.isUntitledWorkspace(window.openedWorkspace)) {
			await this.deleteUntitledWorkspace(window.openedWorkspace);
		}

		// Update window configuration properly based on transition to workspace
		window.config.workspace = workspace;
		window.config.backupPath = backupPath;

		return { workspace, backupPath };
	}
}
