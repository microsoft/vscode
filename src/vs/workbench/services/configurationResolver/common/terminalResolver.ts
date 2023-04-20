/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { withNullAsUndefined } from 'vs/base/common/types';
import { URI } from 'vs/base/common/uri';
import { IWorkspaceContextService, IWorkspaceFolder } from 'vs/platform/workspace/common/workspace';
import { IHistoryService } from 'vs/workbench/services/history/common/history';

export function getWorkspaceForTerminal(cwd: URI | string | undefined, workspaceContextService: IWorkspaceContextService, historyService: IHistoryService): IWorkspaceFolder | undefined {
	const cwdUri = typeof cwd === 'string' ? URI.parse(cwd) : cwd;
	let workspaceFolder = cwdUri ? withNullAsUndefined(workspaceContextService.getWorkspaceFolder(cwdUri)) : undefined;
	if (!workspaceFolder) {
		// fallback to last active workspace if cwd is not available or it is not in workspace
		// TOOD: last active workspace is known to be unreliable, we should remove this fallback eventually
		const activeWorkspaceRootUri = historyService.getLastActiveWorkspaceRoot();
		workspaceFolder = activeWorkspaceRootUri ? withNullAsUndefined(workspaceContextService.getWorkspaceFolder(activeWorkspaceRootUri)) : undefined;
	}
	return workspaceFolder;
}
