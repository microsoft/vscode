/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspacesMainService, IWorkspaceIdentifier, hasWorkspaceFileExtension, UNTITLED_WORKSPACE_NAME, IResolvedWorkspace, IStoredWorkspaceFolder, isStoredWorkspaceFolder, IWorkspaceFolderCreationData } from 'vs/platform/workspaces/common/workspaces';
import { isParent } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join, dirname } from 'path';
import { mkdirp, writeFile, readFile } from 'vs/base/node/pfs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { isLinux } from 'vs/base/common/platform';
import { delSync, readdirSync, writeFileAndFlushSync } from 'vs/base/node/extfs';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { isEqual } from 'vs/base/common/paths';
import { createHash } from 'crypto';
import * as json from 'vs/base/common/json';
import { massageFolderPathForWorkspace, rewriteWorkspaceFileForNewLocation } from 'vs/platform/workspaces/node/workspaces';
import { toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { Disposable } from 'vs/base/common/lifecycle';
import { fsPath, dirname as resourcesDirname } from 'vs/base/common/resources';

export interface IStoredWorkspace {
	folders: IStoredWorkspaceFolder[];
}

export class WorkspacesMainService extends Disposable implements IWorkspacesMainService {

	_serviceBrand: any;

	private workspacesHome: string;

	private readonly _onUntitledWorkspaceDeleted = this._register(new Emitter<IWorkspaceIdentifier>());
	get onUntitledWorkspaceDeleted(): Event<IWorkspaceIdentifier> { return this._onUntitledWorkspaceDeleted.event; }

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.workspacesHome = environmentService.workspacesHome;
	}

	resolveWorkspaceSync(path: string): IResolvedWorkspace | null {
		if (!this.isWorkspacePath(path)) {
			return null; // does not look like a valid workspace config file
		}

		let contents: string;
		try {
			contents = readFileSync(path, 'utf8');
		} catch (error) {
			return null; // invalid workspace
		}

		return this.doResolveWorkspace(URI.file(path), contents);
	}

	private isWorkspacePath(path: string): boolean {
		return this.isInsideWorkspacesHome(path) || hasWorkspaceFileExtension(path);
	}

	private doResolveWorkspace(path: URI, contents: string): IResolvedWorkspace | null {
		try {
			const workspace = this.doParseStoredWorkspace(path, contents);
			const workspaceIdentifier = this.getWorkspaceIdentifier(path);
			return {
				id: workspaceIdentifier.id,
				configPath: workspaceIdentifier.configPath,
				folders: toWorkspaceFolders(workspace.folders, resourcesDirname(path)!)
			};
		} catch (error) {
			this.logService.warn(error.toString());
		}

		return null;
	}

	private doParseStoredWorkspace(path: URI, contents: string): IStoredWorkspace {

		// Parse workspace file
		let storedWorkspace: IStoredWorkspace = json.parse(contents); // use fault tolerant parser

		// Filter out folders which do not have a path or uri set
		if (Array.isArray(storedWorkspace.folders)) {
			storedWorkspace.folders = storedWorkspace.folders.filter(folder => isStoredWorkspaceFolder(folder));
		}

		// Validate
		if (!Array.isArray(storedWorkspace.folders)) {
			throw new Error(`${path.toString()} looks like an invalid workspace file.`);
		}

		return storedWorkspace;
	}

	private isInsideWorkspacesHome(path: string): boolean {
		return isParent(path, this.environmentService.workspacesHome, !isLinux /* ignore case */);
	}

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[]): Promise<IWorkspaceIdentifier> {
		const { workspace, configParent, storedWorkspace } = this.newUntitledWorkspace(folders);

		return mkdirp(configParent).then(() => {
			return writeFile(workspace.configPath.fsPath, JSON.stringify(storedWorkspace, null, '\t')).then(() => workspace);
		});
	}

	createUntitledWorkspaceSync(folders?: IWorkspaceFolderCreationData[]): IWorkspaceIdentifier {
		const { workspace, configParent, storedWorkspace } = this.newUntitledWorkspace(folders);

		if (!existsSync(this.workspacesHome)) {
			mkdirSync(this.workspacesHome);
		}

		mkdirSync(configParent);

		writeFileAndFlushSync(workspace.configPath.fsPath, JSON.stringify(storedWorkspace, null, '\t'));

		return workspace;
	}

	private newUntitledWorkspace(folders: IWorkspaceFolderCreationData[] = []): { workspace: IWorkspaceIdentifier, configParent: string, storedWorkspace: IStoredWorkspace } {
		const randomId = (Date.now() + Math.round(Math.random() * 1000)).toString();
		const untitledWorkspaceConfigFolder = join(this.workspacesHome, randomId);
		const untitledWorkspaceConfigPath = join(untitledWorkspaceConfigFolder, UNTITLED_WORKSPACE_NAME);

		const storedWorkspace: IStoredWorkspace = {
			folders: folders.map(folder => {
				const folderResource = folder.uri;
				let storedWorkspace: IStoredWorkspaceFolder;

				// File URI
				if (folderResource.scheme === Schemas.file) {
					storedWorkspace = { path: massageFolderPathForWorkspace(fsPath(folderResource), URI.file(untitledWorkspaceConfigFolder), []) };
				}

				// Any URI
				else {
					storedWorkspace = { uri: folderResource.toString(true) };
				}

				if (folder.name) {
					storedWorkspace.name = folder.name;
				}

				return storedWorkspace;
			})
		};

		return {
			workspace: this.getWorkspaceIdentifier(URI.file(untitledWorkspaceConfigPath)),
			configParent: untitledWorkspaceConfigFolder,
			storedWorkspace
		};
	}

	getWorkspaceId(configPath: URI): string {
		let workspaceConfigPath = configPath.scheme === Schemas.file ? fsPath(configPath) : configPath.toString();
		if (!isLinux) {
			workspaceConfigPath = workspaceConfigPath.toLowerCase(); // sanitize for platform file system
		}

		return createHash('md5').update(workspaceConfigPath).digest('hex');
	}

	getWorkspaceIdentifier(configPath: URI): IWorkspaceIdentifier {
		return {
			configPath,
			id: this.getWorkspaceId(configPath)
		};
	}

	isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean {
		return workspace.configPath.scheme === Schemas.file && this.isInsideWorkspacesHome(fsPath(workspace.configPath));
	}

	saveWorkspaceAs(workspace: IWorkspaceIdentifier, targetConfigPath: string): Promise<IWorkspaceIdentifier> {

		if (workspace.configPath.scheme !== Schemas.file) {
			throw new Error('Only local workspaces can be saved with this API. Use WorkspaceEditingService.saveWorkspaceAs on the renderer instead.');
		}

		const configPath = fsPath(workspace.configPath);

		// Return early if target is same as source
		if (isEqual(configPath, targetConfigPath, !isLinux)) {
			return Promise.resolve(workspace);
		}

		// Read the contents of the workspace file and resolve it
		return readFile(configPath).then(raw => {
			const targetConfigPathURI = URI.file(targetConfigPath);
			const newRawWorkspaceContents = rewriteWorkspaceFileForNewLocation(raw.toString(), workspace.configPath, targetConfigPathURI);

			return writeFile(targetConfigPath, newRawWorkspaceContents).then(() => {
				return this.getWorkspaceIdentifier(targetConfigPathURI);
			});
		});
	}

	deleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void {
		if (!this.isUntitledWorkspace(workspace)) {
			return; // only supported for untitled workspaces
		}

		// Delete from disk
		this.doDeleteUntitledWorkspaceSync(workspace);

		// Event
		this._onUntitledWorkspaceDeleted.fire(workspace);
	}

	private doDeleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void {
		const configPath = fsPath(workspace.configPath);
		try {
			// Delete Workspace
			delSync(dirname(configPath));

			// Mark Workspace Storage to be deleted
			const workspaceStoragePath = join(this.environmentService.workspaceStorageHome, workspace.id);
			if (existsSync(workspaceStoragePath)) {
				writeFileSync(join(workspaceStoragePath, 'obsolete'), '');
			}
		} catch (error) {
			this.logService.warn(`Unable to delete untitled workspace ${configPath} (${error}).`);
		}
	}

	getUntitledWorkspacesSync(): IWorkspaceIdentifier[] {
		let untitledWorkspaces: IWorkspaceIdentifier[] = [];
		try {
			const untitledWorkspacePaths = readdirSync(this.workspacesHome).map(folder => join(this.workspacesHome, folder, UNTITLED_WORKSPACE_NAME));
			for (const untitledWorkspacePath of untitledWorkspacePaths) {
				const workspace = this.getWorkspaceIdentifier(URI.file(untitledWorkspacePath));
				if (!this.resolveWorkspaceSync(untitledWorkspacePath)) {
					this.doDeleteUntitledWorkspaceSync(workspace);
				} else {
					untitledWorkspaces.push(workspace);
				}
			}
		} catch (error) {
			if (error && error.code !== 'ENOENT') {
				this.logService.warn(`Unable to read folders in ${this.workspacesHome} (${error}).`);
			}
		}
		return untitledWorkspaces;
	}
}
