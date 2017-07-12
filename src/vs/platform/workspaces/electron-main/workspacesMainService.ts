/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWorkspacesMainService, IWorkspace, IStoredWorkspace } from "vs/platform/workspaces/common/workspaces";
import { TPromise } from "vs/base/common/winjs.base";
import { isParent } from "vs/platform/files/common/files";
import { IEnvironmentService } from "vs/platform/environment/common/environment";
import { extname, join } from "path";
import { mkdirp, writeFile } from "vs/base/node/pfs";
import { readFileSync } from "fs";
import { isLinux } from "vs/base/common/platform";

export class WorkspacesMainService implements IWorkspacesMainService {

	public _serviceBrand: any;

	protected workspacesHome: string;

	constructor( @IEnvironmentService private environmentService: IEnvironmentService) {
		this.workspacesHome = environmentService.workspacesHome;
	}

	public resolveWorkspaceSync(path: string): IWorkspace {
		const isWorkspace = isParent(path, this.environmentService.workspacesHome, !isLinux /* ignore case */) || extname(path) === '.code';
		if (!isWorkspace) {
			return null; // does not look like a valid workspace config file
		}

		try {
			const workspace = JSON.parse(readFileSync(path, 'utf8')) as IStoredWorkspace;
			if (typeof workspace.id !== 'string' || !Array.isArray(workspace.folders)) {
				return null; // looks like an invalid workspace file
			}

			return {
				id: workspace.id,
				folders: workspace.folders,
				configPath: path
			};
		} catch (error) {
			return null; // unable to read or parse as workspace file
		}
	}

	public createWorkspace(folders: string[] = []): TPromise<IWorkspace> {
		const workspaceId = this.nextWorkspaceId();
		const workspaceConfigFolder = join(this.workspacesHome, workspaceId);
		const workspaceConfigPath = join(workspaceConfigFolder, 'workspace.json');

		return mkdirp(workspaceConfigFolder).then(() => {
			const storedWorkspace: IStoredWorkspace = {
				id: workspaceId,
				folders
			};

			return writeFile(workspaceConfigPath, JSON.stringify(storedWorkspace, null, '\t')).then(() => ({
				id: workspaceId,
				folders,
				configPath: workspaceConfigPath
			}));
		});
	}

	private nextWorkspaceId(): string {
		return (Date.now() + Math.round(Math.random() * 1000)).toString();
	}
}