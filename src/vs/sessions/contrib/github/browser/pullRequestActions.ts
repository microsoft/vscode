/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { URI } from '../../../../base/common/uri.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { IMultiDiffEditorResource } from '../../../../workbench/common/editor.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus } from '../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { SessionHasPullRequestContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getGitHubPullRequestRefs, IGitHubPullRequestRef, ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { IGitHubChangedFile, IGitHubPullRequestChanges, OPEN_PULL_REQUEST_ACTION_ID, OPEN_PULL_REQUEST_CHANGES_ACTION_ID } from '../common/types.js';
import { toPRContentUri } from '../common/utils.js';
import { IGitHubService } from './githubService.js';

class PullRequestActionContext {
	constructor(readonly pullRequest: IGitHubPullRequestRef) { }
}

function isPullRequestActionContext(target: unknown): target is PullRequestActionContext {
	if (!target || typeof target !== 'object') {
		return false;
	}

	const candidate = target as { readonly pullRequest?: IGitHubPullRequestRef };
	return !!candidate.pullRequest &&
		typeof candidate.pullRequest.owner === 'string' &&
		typeof candidate.pullRequest.repo === 'string' &&
		typeof candidate.pullRequest.number === 'number' &&
		URI.isUri(candidate.pullRequest.uri);
}

class OpenPullRequestAction extends Action2 {
	static readonly ID = OPEN_PULL_REQUEST_ACTION_ID;

	constructor() {
		super({
			id: OpenPullRequestAction.ID,
			title: localize2('agentSessions.openPullRequest', "Open Pull Request"),
			icon: Codicon.gitPullRequest,
			f1: false,
			menu: [{
				id: Menus.SessionItemContextMenu,
				group: '2_pullRequest',
				order: 0,
				when: SessionHasPullRequestContext
			}],
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | ISession[] | PullRequestActionContext): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const openerService = accessor.get(IOpenerService);
		const targets = Array.isArray(sessionOrContext) ? sessionOrContext : [sessionOrContext ?? sessionsService.activeSession.get()];
		for (const target of targets) {
			const pullRequest = isPullRequestActionContext(target) ? target.pullRequest : getSessionPullRequest(target);
			if (pullRequest) {
				await openerService.open(pullRequest.uri, { openExternal: true, allowContributedOpeners: true });
			}
		}
	}
}
registerAction2(OpenPullRequestAction);

function getSessionPullRequest(session: ISession | undefined): IGitHubPullRequestRef | undefined {
	const gitHubInfo = session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
	return getGitHubPullRequestRefs(gitHubInfo)[0];
}

/**
 * Matches the GitHub Pull Requests extension's overview editor title: the
 * number followed by the title, truncated near 20 characters on a word boundary.
 */
function getPullRequestEditorTitle(pullRequestNumber: number, title: string): string {
	const maxLength = 20;
	let truncated = title;
	if (title.length > maxLength) {
		const lastSpace = title.lastIndexOf(' ', maxLength);
		truncated = `${title.substring(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
	}
	return `#${pullRequestNumber} ${truncated}`;
}

/** Maps a pull request's changed file to remote `copilot-pr` content for each side of its diff. */
function toPullRequestChangeResource(pullRequest: IGitHubPullRequestRef, changes: IGitHubPullRequestChanges, file: IGitHubChangedFile): IMultiDiffEditorResource {
	const params = { owner: pullRequest.owner, repo: pullRequest.repo, prNumber: pullRequest.number, status: file.status };
	return {
		original: {
			resource: file.status !== 'added'
				? toPRContentUri(file.previous_filename || file.filename, { ...params, commitSha: changes.baseSha, isBase: true, previousFileName: file.previous_filename })
				: undefined,
		},
		modified: {
			resource: file.status !== 'removed'
				? toPRContentUri(file.filename, { ...params, commitSha: changes.headSha, isBase: false })
				: undefined,
		},
	};
}

class OpenPullRequestChangesAction extends Action2 {
	static readonly ID = OPEN_PULL_REQUEST_CHANGES_ACTION_ID;

	constructor() {
		super({
			id: OpenPullRequestChangesAction.ID,
			title: localize2('agentSessions.openPullRequestChanges', "Open Pull Request Changes"),
			icon: Codicon.diffMultiple,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | PullRequestActionContext): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const gitHubService = accessor.get(IGitHubService);
		const editorService = accessor.get(IEditorService);
		const layoutService = accessor.get(IAgentWorkbenchLayoutService);
		const notificationService = accessor.get(INotificationService);

		const target = sessionOrContext ?? sessionsService.activeSession.get();
		const pullRequest = isPullRequestActionContext(target) ? target.pullRequest : getSessionPullRequest(target);
		if (!pullRequest) {
			return;
		}

		let changes: IGitHubPullRequestChanges;
		try {
			changes = await gitHubService.getPullRequestChanges(pullRequest.owner, pullRequest.repo, pullRequest.number);
		} catch (error) {
			if (!isCancellationError(error)) {
				notificationService.error(localize('agentSessions.openPullRequestChangesFailed', "Could not load the changes of pull request #{0}: {1}", pullRequest.number, toErrorMessage(error)));
			}
			return;
		}

		if (changes.files.length === 0) {
			notificationService.info(localize('agentSessions.pullRequestHasNoChanges', "Pull request #{0} has no file changes.", pullRequest.number));
			return;
		}

		layoutService.revealEditorPartExplicitly();
		await editorService.openEditor({
			// Reopening the same pull request revision reveals its existing editor.
			multiDiffSource: URI.from({ scheme: 'multi-diff-editor', path: `/${pullRequest.owner}/${pullRequest.repo}/pull/${pullRequest.number}/${changes.baseSha}...${changes.headSha}` }),
			label: getPullRequestEditorTitle(pullRequest.number, changes.title),
			resources: changes.files.map(file => toPullRequestChangeResource(pullRequest, changes, file)),
			options: { pinned: true },
		});
	}
}
registerAction2(OpenPullRequestChangesAction);

class CopyPullRequestUrlAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.copyPullRequestUrl';

	constructor() {
		super({
			id: CopyPullRequestUrlAction.ID,
			title: localize2('agentSessions.copyPullRequestUrl', "Copy Pull Request URL"),
			f1: false,
			menu: [{
				id: Menus.SessionItemContextMenu,
				group: '2_pullRequest',
				order: 1,
				when: SessionHasPullRequestContext
			}],
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | ISession[] | PullRequestActionContext): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const sessionsService = accessor.get(ISessionsService);
		const targets = Array.isArray(sessionOrContext) ? sessionOrContext : [sessionOrContext ?? sessionsService.activeSession.get()];
		const pullRequestUrls = targets.flatMap(target => {
			const pullRequest = isPullRequestActionContext(target) ? target.pullRequest : getSessionPullRequest(target);
			return pullRequest ? [pullRequest.uri.toString(true)] : [];
		});
		if (pullRequestUrls.length === 0) {
			return;
		}

		await clipboardService.writeText(pullRequestUrls.join('\n'));
	}
}
registerAction2(CopyPullRequestUrlAction);
