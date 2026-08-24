/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isCancellationError, onUnexpectedError } from '../../../../base/common/errors.js';
import { Schemas } from '../../../../base/common/network.js';
import { FileOperationResult, IFileService, toFileOperationResult } from '../../../../platform/files/common/files.js';
import { IWorkspaceContextService, WorkbenchState } from '../../../../platform/workspace/common/workspace.js';
import { IWorkspacesService } from '../../../../platform/workspaces/common/workspaces.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';

/**
 * Remote counterpart to the local remove-on-failed-open in `WindowsMainService.resolvePath`
 * (see #74465). Prunes the current single-folder workspace's remote folder URI from
 * Recently Opened when the remote file system answers `FILE_NOT_FOUND` (#319230).
 * Transient errors (`FILE_OTHER_ERROR` / `Unavailable`) must not drop entries.
 */
export async function pruneRecentRemoteFolderIfMissing(
	contextService: IWorkspaceContextService,
	fileService: IFileService,
	workspacesService: IWorkspacesService,
): Promise<void> {
	if (contextService.getWorkbenchState() !== WorkbenchState.FOLDER) {
		return;
	}

	const folderUri = contextService.getWorkspace().folders[0]?.uri;
	if (!folderUri || folderUri.scheme !== Schemas.vscodeRemote) {
		return; // only mirror the local remove-on-failed-open for vscode-remote authorities
	}

	try {
		await fileService.stat(folderUri);
	} catch (error) {
		// Only prune on an authoritative not-found answer. Any other error
		// (provider not registered / activating, host unreachable, WSL distro down,
		// container not built, etc.) maps to `FILE_OTHER_ERROR` and leaves the entry intact.
		if (toFileOperationResult(error) === FileOperationResult.FILE_NOT_FOUND) {
			await workspacesService.removeRecentlyOpened([folderUri]);
		}
	}
}

class RecentRemoteFolderPrunerContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.recentRemoteFolderPruner';

	constructor(
		@IWorkspaceContextService contextService: IWorkspaceContextService,
		@IFileService fileService: IFileService,
		@IWorkspacesService workspacesService: IWorkspacesService,
	) {
		pruneRecentRemoteFolderIfMissing(contextService, fileService, workspacesService).catch(error => {
			if (!isCancellationError(error)) {
				onUnexpectedError(error);
			}
		});
	}
}

registerWorkbenchContribution2(RecentRemoteFolderPrunerContribution.ID, RecentRemoteFolderPrunerContribution, WorkbenchPhase.Eventually);
