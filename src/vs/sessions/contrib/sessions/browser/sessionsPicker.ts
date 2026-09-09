/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { fromNow } from '../../../../base/common/date.js';
import { IReader } from '../../../../base/common/observable.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IQuickPickItem } from '../../../../platform/quickinput/common/quickInput.js';
import { ISessionsListModelService } from '../../../services/sessions/browser/sessionsListModelService.js';
import { getGitHubPullRequestRefs, getHighestPriorityPullRequestIcon, getUntitledSessionTitle, isActiveSessionStatus, ISession, SessionStatus } from '../../../services/sessions/common/session.js';

export interface ISessionQuickPickItem extends IQuickPickItem {
	readonly session: ISession;
}

export function createSessionQuickPickItem(session: ISession, sessionsListModelService: ISessionsListModelService, reader: IReader): ISessionQuickPickItem {
	const title = session.title.read(reader) || getUntitledSessionTitle(session.isQuickChat?.read(reader) ?? false);
	const status = session.status.read(reader);
	const isRead = session.isRead.read(reader);
	const isArchived = session.isArchived.read(reader);
	const workspace = session.workspace.read(reader);
	const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
	const pullRequestIcon = getHighestPriorityPullRequestIcon(getGitHubPullRequestRefs(gitHubInfo).map(pullRequest => pullRequest.icon));
	const completedStateIcon = session.completedStateIcon?.read(reader) ?? pullRequestIcon;
	const icon = sessionsListModelService.getStatusIcon(status, isRead, isArchived, completedStateIcon);

	const detailParts: string[] = [];
	if (workspace?.label) {
		const isWorkspaceFolder = workspace.folders.length > 0 && workspace.folders[0]?.gitRepository?.workTreeUri === undefined;
		const workspaceIcon = workspace.typeIcon ?? (workspace.isVirtualWorkspace ? Codicon.cloud : isWorkspaceFolder ? Codicon.folder : Codicon.worktree);
		detailParts.push(`$(${Codicon.blank.id}) $(${workspaceIcon.id}) ${workspace.label}`);
	} else {
		detailParts.push(`$(${Codicon.blank.id})`);
	}
	detailParts.push(fromNow(session.updatedAt.read(reader), true, true));

	return {
		id: session.sessionId,
		label: title,
		detail: detailParts.join(' \u00B7 '),
		iconClass: ThemeIcon.asClassName(icon),
		iconColor: icon.color,
		session,
	};
}

export interface ISessionsPickerGroups {
	readonly needsInput: readonly ISession[];
	readonly unread: readonly ISession[];
	readonly recent: readonly ISession[];
	readonly other: readonly ISession[];
}

/** Groups sessions by picker priority while preserving their existing order. */
export function groupSessionsForPicker(recentSessions: readonly ISession[], otherSessions: readonly ISession[], reader?: IReader): ISessionsPickerGroups {
	const needsInput: ISession[] = [];
	const unread: ISession[] = [];
	const recent: ISession[] = [];
	const other: ISession[] = [];

	const groupSession = (session: ISession, remaining: ISession[]): void => {
		const status = session.status.read(reader);
		if (session.isArchived.read(reader)) {
			return;
		} else if (status === SessionStatus.NeedsInput) {
			needsInput.push(session);
		} else if (!isActiveSessionStatus(status) && !session.isRead.read(reader)) {
			unread.push(session);
		} else {
			remaining.push(session);
		}
	};

	for (const session of recentSessions) {
		groupSession(session, recent);
	}
	for (const session of otherSessions) {
		groupSession(session, other);
	}

	return { needsInput, unread, recent, other };
}
