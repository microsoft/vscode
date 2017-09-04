/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspacesMainService, IWorkspaceIdentifier, IStoredWorkspace, WORKSPACE_EXTENSION, IWorkspaceSavedEvent, UNTITLED_WORKSPACE_NAME, IResolvedWorkspace } from 'vs/platform/workspaces/common/workspaces';
import { TPromise } from 'vs/base/common/winjs.base';
import { isParent } from 'vs/platform/files/common/files';
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { extname, join, dirname, isAbsolute, resolve, relative } from 'path';
import { mkdirp, writeFile, readFile } from 'vs/base/node/pfs';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { isLinux } from 'vs/base/common/platform';
import { delSync, readdirSync } from 'vs/base/node/extfs';
import Event, { Emitter } from 'vs/base/common/event';
import { ILogService } from 'vs/platform/log/common/log';
import { isEqual, isEqualOrParent } from 'vs/base/common/paths';
import { coalesce } from 'vs/base/common/arrays';
import { createHash } from 'crypto';
import URI from 'vs/base/common/uri';
import * as json from 'vs/base/common/json';

// TODO@Ben migration
export interface ILegacyStoredWorkspace {
	id: string;
	folders: string[];
}

export class WorkspacesMainService implements IWorkspacesMainService {

	public _serviceBrand: any;

	protected workspacesHome: string;

	private _onWorkspaceSaved: Emitter<IWorkspaceSavedEvent>;
	private _onUntitledWorkspaceDeleted: Emitter<IWorkspaceIdentifier>;

	constructor(
		@IEnvironmentService private environmentService: IEnvironmentService,
		@ILogService private logService: ILogService
	) {
		this.workspacesHome = environmentService.workspacesHome;

		this._onWorkspaceSaved = new Emitter<IWorkspaceSavedEvent>();
		this._onUntitledWorkspaceDeleted = new Emitter<IWorkspaceIdentifier>();
	}

	public get onWorkspaceSaved(): Event<IWorkspaceSavedEvent> {
		return this._onWorkspaceSaved.event;
	}

	public get onUntitledWorkspaceDeleted(): Event<IWorkspaceIdentifier> {
		return this._onUntitledWorkspaceDeleted.event;
	}

	public resolveWorkspace(path: string): TPromise<IResolvedWorkspace> {
		if (!this.isWorkspacePath(path)) {
			return TPromise.as(null); // does not look like a valid workspace config file
		}

		return readFile(path).then(contents => this.doResolveWorkspace(path, contents.toString()));
	}

	public resolveWorkspaceSync(path: string): IResolvedWorkspace {
		if (!this.isWorkspacePath(path)) {
			return null; // does not look like a valid workspace config file
		}

		return this.doResolveWorkspace(path, readFileSync(path, 'utf8'));
	}

	private isWorkspacePath(path: string): boolean {
		return this.isInsideWorkspacesHome(path) || extname(path) === `.${WORKSPACE_EXTENSION}`;
	}

	private doResolveWorkspace(path: string, contents: string): IResolvedWorkspace {
		try {
			const workspace = this.doParseStoredWorkspace(path, contents);

			// relative paths get resolved against the workspace location
			workspace.folders.forEach(folder => {
				if (!isAbsolute(folder.path)) {
					folder.path = resolve(dirname(path), folder.path);
				}
			});

			return {
				id: this.getWorkspaceId(path),
				configPath: path,
				folders: workspace.folders
			};
		} catch (error) {
			this.logService.log(error.toString());
		}

		return null;
	}

	private doParseStoredWorkspace(path: string, contents: string): IStoredWorkspace {

		// Parse workspace file
		let storedWorkspace: IStoredWorkspace;
		try {
			storedWorkspace = json.parse(contents); // use fault tolerant parser
		} catch (error) {
			throw new Error(`${path} cannot be parsed as JSON file (${error}).`);
		}

		// TODO@Ben migration
		const legacyStoredWorkspace = (<any>storedWorkspace) as ILegacyStoredWorkspace;
		if (legacyStoredWorkspace.folders.some(folder => typeof folder === 'string')) {
			storedWorkspace.folders = legacyStoredWorkspace.folders.map(folder => ({ path: URI.parse(folder).fsPath }));
			writeFileSync(path, JSON.stringify(storedWorkspace, null, '\t'));
		}

		// Filter out folders which do not have a path set
		if (Array.isArray(storedWorkspace.folders)) {
			storedWorkspace.folders = storedWorkspace.folders.filter(folder => !!folder.path);
		}

		// Validate
		if (!Array.isArray(storedWorkspace.folders) || storedWorkspace.folders.length === 0) {
			throw new Error(`${path} looks like an invalid workspace file.`);
		}

		return storedWorkspace;
	}

	private isInsideWorkspacesHome(path: string): boolean {
		return isParent(path, this.environmentService.workspacesHome, !isLinux /* ignore case */);
	}

	public createWorkspace(folders: string[]): TPromise<IWorkspaceIdentifier> {
		const { workspace, configParent, storedWorkspace } = this.createUntitledWorkspace(folders);

		return mkdirp(configParent).then(() => {
			return writeFile(workspace.configPath, JSON.stringify(storedWorkspace, null, '\t')).then(() => workspace);
		});
	}

	public createWorkspaceSync(folders: string[]): IWorkspaceIdentifier {
		const { workspace, configParent, storedWorkspace } = this.createUntitledWorkspace(folders);

		if (!existsSync(this.workspacesHome)) {
			mkdirSync(this.workspacesHome);
		}

		mkdirSync(configParent);

		writeFileSync(workspace.configPath, JSON.stringify(storedWorkspace, null, '\t'));

		return workspace;
	}

	private createUntitledWorkspace(folders: string[]): { workspace: IWorkspaceIdentifier, configParent: string, storedWorkspace: IStoredWorkspace } {
		const randomId = (Date.now() + Math.round(Math.random() * 1000)).toString();
		const untitledWorkspaceConfigFolder = join(this.workspacesHome, randomId);
		const untitledWorkspaceConfigPath = join(untitledWorkspaceConfigFolder, UNTITLED_WORKSPACE_NAME);

		const storedWorkspace: IStoredWorkspace = {
			folders: folders.map(folder => ({
				path: folder
			}))
		};

		return {
			workspace: {
				id: this.getWorkspaceId(untitledWorkspaceConfigPath),
				configPath: untitledWorkspaceConfigPath
			},
			configParent: untitledWorkspaceConfigFolder,
			storedWorkspace
		};
	}

	public getWorkspaceId(workspaceConfigPath: string): string {
		if (!isLinux) {
			workspaceConfigPath = workspaceConfigPath.toLowerCase(); // sanitize for platform file system
		}

		return createHash('md5').update(workspaceConfigPath).digest('hex');
	}

	public isUntitledWorkspace(workspace: IWorkspaceIdentifier): boolean {
		return this.isInsideWorkspacesHome(workspace.configPath);
	}

	public saveWorkspace(workspace: IWorkspaceIdentifier, targetConfigPath: string): TPromise<IWorkspaceIdentifier> {

		// Return early if target is same as source
		if (isEqual(workspace.configPath, targetConfigPath, !isLinux)) {
			return TPromise.as(workspace);
		}

		// Read the contents of the workspace file and resolve it
		return readFile(workspace.configPath).then(rawWorkspaceContents => {
			let storedWorkspace: IStoredWorkspace;
			try {
				storedWorkspace = this.doParseStoredWorkspace(workspace.configPath, rawWorkspaceContents.toString());
			} catch (error) {
				return TPromise.wrapError(error);
			}

			const sourceConfigFolder = dirname(workspace.configPath);
			const targetConfigFolder = dirname(targetConfigPath);

			// Rewrite absolute paths to relative paths if the target workspace folder
			// is a parent of the location of the workspace file itself. Otherwise keep
			// using absolute paths.
			storedWorkspace.folders.forEach(folder => {
				if (!isAbsolute(folder.path)) {
					folder.path = resolve(sourceConfigFolder, folder.path); // relative paths get resolved against the workspace location
				}

				if (isEqualOrParent(folder.path, targetConfigFolder, !isLinux)) {
					folder.path = relative(targetConfigFolder, folder.path) || '.'; // absolute paths get converted to relative ones to workspace location if possible
				}
			});

			return writeFile(targetConfigPath, JSON.stringify(storedWorkspace, null, '\t')).then(() => {
				const savedWorkspaceIdentifier = { id: this.getWorkspaceId(targetConfigPath), configPath: targetConfigPath };

				// Event
				this._onWorkspaceSaved.fire({ workspace: savedWorkspaceIdentifier, oldConfigPath: workspace.configPath });

				// Delete untitled workspace
				this.deleteUntitledWorkspaceSync(workspace);

				return savedWorkspaceIdentifier;
			});
		});
	}

	public deleteUntitledWorkspaceSync(workspace: IWorkspaceIdentifier): void {
		if (!this.isUntitledWorkspace(workspace)) {
			return; // only supported for untitled workspaces
		}

		// Delete from disk
		this.doDeleteUntitledWorkspaceSync(workspace.configPath);

		// Event
		this._onUntitledWorkspaceDeleted.fire(workspace);
	}

	private doDeleteUntitledWorkspaceSync(configPath: string): void {
		try {
			delSync(dirname(configPath));
		} catch (error) {
			this.logService.log(`Unable to delete untitled workspace ${configPath} (${error}).`);
		}
	}

	public getUntitledWorkspacesSync(): IWorkspaceIdentifier[] {
		let untitledWorkspacePaths: string[] = [];
		try {
			untitledWorkspacePaths = readdirSync(this.workspacesHome).map(folder => join(this.workspacesHome, folder, UNTITLED_WORKSPACE_NAME));
		} catch (error) {
			this.logService.log(`Unable to read folders in ${this.workspacesHome} (${error}).`);
		}

		const untitledWorkspaces: IWorkspaceIdentifier[] = coalesce(untitledWorkspacePaths.map(untitledWorkspacePath => {
			const workspace = this.resolveWorkspaceSync(untitledWorkspacePath);
			if (!workspace) {
				this.doDeleteUntitledWorkspaceSync(untitledWorkspacePath);

				return null; // invalid workspace
			}

			return { id: workspace.id, configPath: untitledWorkspacePath };
		}));

		return untitledWorkspaces;
	}
}