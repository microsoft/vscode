/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isLinux, isWindows } from '../../../../base/common/platform.js';
import { URI } from '../../../../base/common/uri.js';
import { IWorkspace, toWorkspaceFolder, Workspace as BaseWorkspace, WorkspaceFolder } from '../../common/workspace.js';

export class Workspace extends BaseWorkspace {
	constructor(
		id: string,
		folders: WorkspaceFolder[] = [],
		configuration: URI | null = null,
		ignorePathCasing: (key: URI) => boolean = () => !isLinux
	) {
		super(id, folders, false, configuration, ignorePathCasing);
	}
}

const wsUri = URI.file(isWindows ? 'C:\\testWorkspace' : '/testWorkspace');
export const TestWorkspace = testWorkspace(wsUri);

export function testWorkspace(...resource: URI[]): Workspace {
	return new Workspace('test-workspace', resource.map(toWorkspaceFolder));
}

/**
 * Creates an `IWorkspace` fake whose uri is derived from its configuration and folders.
 */
export function testIWorkspace(workspace: Omit<IWorkspace, 'uri'> & { uri?: URI }): IWorkspace {
	return { uri: workspace.configuration ?? (workspace.folders.length === 1 ? workspace.folders[0].uri : undefined), ...workspace };
}
