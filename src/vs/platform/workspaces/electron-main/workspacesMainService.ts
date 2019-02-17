/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IWorkspacesMainService, IWorkspaceIdentifier, hasWorkspaceFileExtension, UNTITLED_WORKSPACE_NAME, IResolvedWorkspace, IStoredWorkspaceFolder, isStoredWorkspaceFolder, IWorkspaceFolderCreationData, massageFolderPathForWorkspace, rewriteWorkspaceFileForNewLocation } from 'vs/platform/workspaces/common/workspaces';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { join, dirname } from 'vs/base/common/path';
import { mkdirp, writeFile, readFile } from 'vs/base/node/pfs';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { isLinux } from 'vs/base/common/platform';
import { delSync, readdirSync, writeFileAndFlushSync } from 'vs/base/node/extfs';
import { Event, Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { isEqual } from 'vs/base/common/extpath';
import { createHash } from 'crypto';
import * as json from 'vs/base/common/json';
import { toWorkspaceFolders } from 'vs/platform/workspace/common/workspace';
import { URI } from 'vs/base/common/uri';
import { Schemas } from 'vs/base/common/network';
import { Disposable } from 'vs/base/common/lifecycle';
import { originalFSPath, dirname as resourcesDirname, isEqualOrParent, joinPath } from 'vs/base/common/resources';

export interface IStoredWorkspace {
	folders: IStoredWorkspaceFolder[];
}

export class WorkspacesMainService extends Disposable implements IWorkspacesMainService {

	_serviceBrand: any;

	private readonly untitledWorkspacesHome: URI; // local URI that contains all untitled workspaces

	private readonly _onUntitledWorkspaceDeleted = this._register(new Emitter<IWorkspaceIdentifier>());
	get onUntitledWorkspaceDeleted(): Event<IWorkspaceIdentifier> { return this._onUntitledWorkspaceDeleted.event; }

	constructor(
		@IEnvironmentService private readonly environmentService: IEnvironmentService,
		@ILogService private readonly logService: ILogService
	) {
		super();

		this.untitledWorkspacesHome = environmentService.untitledWorkspacesHome;
	}

	resolveLocalWorkspaceSync(uri: URI): IResolvedWorkspace | null {
		if (!this.isWorkspacePath(uri)) {
			return null; // does not look like a valid workspace config file
		}
		if (uri.scheme !== Schemas.file) {
			return null;
		}

		let contents: string;
		try {
			contents = readFileSync(uri.fsPath, 'utf8');
		} catch (error) {
			return null; // invalid workspace
		}

		return this.doResolveWorkspace(uri, contents);
	}

	private isWorkspacePath(uri: URI): boolean {
		return this.isInsideWorkspacesHome(uri) || hasWorkspaceFileExtension(uri.path);
	}

	private doResolveWorkspace(path: URI, contents: string): IResolvedWorkspace | null {
		try {
			const workspace = this.doParseStoredWorkspace(path, contents);
			const workspaceIdentifier = this.getWorkspaceIdentifier(path);
			return {
				id: workspaceIdentifier.id,
				configPath: workspaceIdentifier.configPath,
				folders: toWorkspaceFolders(workspace.folders, resourcesDirname(path))
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

	private isInsideWorkspacesHome(path: URI): boolean {
		return isEqualOrParent(path, this.environmentService.untitledWorkspacesHome);
	}

	createUntitledWorkspace(folders?: IWorkspaceFolderCreationData[]): Promise<IWorkspaceIdentifier> {
		const { workspace, storedWorkspace } = this.newUntitledWorkspace(folders);
		const configPath = workspace.configPath.fsPath;

		return mkdirp(dirname(configPath)).then(() => {
			return writeFile(configPath, JSON.stringify(storedWorkspace, null, '\t')).then(() => workspace);
		});
	}

	createUntitledWorkspaceSync(folders?: IWorkspaceFolderCreationData[]): IWorkspaceIdentifier {
		const { workspace, storedWorkspace } = this.newUntitledWorkspace(folders);
		const configPath = workspace.configPath.fsPath;

		const configPathDir = dirname(configPath);
		if (!existsSync(configPathDir)) {
			const configPathDirDir = dirname(configPathDir);
			if (!existsSync(configPathDirDir)) {
				mkdirSync(configPathDirDir);
			}
			mkdirSync(configPathDir);
		}

		writeFileAndFlushSync(configPath, JSON.stringify(storedWorkspace, null, '\t'));

		return workspace;
	}

	private newUntitledWorkspace(folders: IWorkspaceFolderCreationData[] = []): { workspace: IWorkspaceIdentifier, storedWorkspace: IStoredWorkspace } {
		const randomId = (Date.now() + Math.round(Math.random() * 1000)).toString();
		const untitledWorkspaceConfigFolder = joinPath(this.untitledWorkspacesHome, randomId);
		const untitledWorkspaceConfigPath = joinPath(untitledWorkspaceConfigFolder, UNTITLED_WORKSPACE_NAME);

		const storedWorkspace: IStoredWorkspace = {
			folders: folders.map(folder => {
				const folderResource = folder.uri;
				let storedWorkspace: IStoredWorkspaceFolder;

				// File URI
				if (folderResource.scheme === Schemas.file) {
					storedWorkspace = { path: massageFolderPathForWorkspace(originalFSPath(folderResource), untitledWorkspaceConfigFolder, []) };
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
			workspace: this.getWorkspaceIdentifier(untitledWorkspaceConfigPath),
			storedWorkspace
		};
	}

	getWorkspaceId(configPath: URI): string {
		let workspaceConfigPath = configPath.scheme === Schemas.file ? originalFSPath(configPath) : configPath.toString();
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
		return this.isInsideWorkspacesHome(workspace.configPath);
	}

	saveWorkspaceAs(workspace: IWorkspaceIdentifier, targetConfigPath: string): Promise<IWorkspaceIdentifier> {

		if (workspace.configPath.scheme !== Schemas.file) {
			throw new Error('Only local workspaces can be saved with this API. Use WorkspaceEditingService.saveWorkspaceAs on the renderer instead.');
		}

		const configPath = originalFSPath(workspace.configPath);

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
		const configPath = originalFSPath(workspace.configPath);
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
			const untitledWorkspacePaths = readdirSync(this.untitledWorkspacesHome.fsPath).map(folder => joinPath(this.untitledWorkspacesHome, folder, UNTITLED_WORKSPACE_NAME));
			for (const untitledWorkspacePath of untitledWorkspacePaths) {
				const workspace = this.getWorkspaceIdentifier(untitledWorkspacePath);
				if (!this.resolveLocalWorkspaceSync(untitledWorkspacePath)) {
					this.doDeleteUntitledWorkspaceSync(workspace);
				} else {
					untitledWorkspaces.push(workspace);
				}
			}
		} catch (error) {
			if (error && error.code !== 'ENOENT') {
				this.logService.warn(`Unable to read folders in ${this.untitledWorkspacesHome} (${error}).`);
			}
		}
		return untitledWorkspaces;
	}
}
