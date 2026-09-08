/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../base/common/codicons.js';
import { IReader } from '../../base/common/observable.js';
import { ThemeIcon } from '../../base/common/themables.js';
import { getSessionWorkspaceKind, ISession, SessionWorkspaceKind } from '../services/sessions/common/session.js';

export interface ISessionWorkspaceDisplayInfo {
	readonly label: string;
	readonly icon: ThemeIcon;
	readonly workingDirectoryPath: string | undefined;
	readonly branch: string | undefined;
	readonly worktreePending: boolean;
}

/** Returns the workspace presentation shared by the command center and Files pill. */
export function getSessionWorkspaceDisplayInfo(session: ISession | undefined, reader: IReader): ISessionWorkspaceDisplayInfo | undefined {
	const workspace = session?.workspace.read(reader);
	if (!workspace?.label) {
		return undefined;
	}

	const worktreePending = session?.worktreePending?.read(reader) ?? false;
	const kind = getSessionWorkspaceKind(workspace, worktreePending);
	const icon = workspace.typeIcon ?? (kind === SessionWorkspaceKind.Virtual ? Codicon.cloudCompact : kind === SessionWorkspaceKind.Folder ? Codicon.folderCompact : Codicon.worktreeCompact);
	const folder = workspace.folders[0];
	const branch = worktreePending ? undefined : folder?.gitRepository?.branchName?.trim() || undefined;
	const workingDirectoryPath = worktreePending ? undefined : folder?.workingDirectory.fsPath;
	return { label: workspace.label, icon, workingDirectoryPath, branch, worktreePending };
}
