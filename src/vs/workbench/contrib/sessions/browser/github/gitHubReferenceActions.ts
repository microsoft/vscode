/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize2 } from '../../../../../nls.js';
import { ICommandAction } from '../../../../../platform/action/common/action.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { IURLService } from '../../../../../platform/url/common/url.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { getGitHubPullRequestRefs, IGitHubIssueRef, IGitHubPullRequestRef, ISession } from '../../../../services/sessions/common/session.js';
import { OPEN_ISSUE_ACTION_ID, OPEN_PULL_REQUEST_ACTION_ID } from '../../common/github/types.js';
import { resolveSessionCommandTarget } from '../sessionCommandTarget.js';

const githubPullRequestsExtensionId = 'github.vscode-pull-request-github';
const openIssueWebviewPath = '/open-issue-webview';

/** The pull request a command acts on, such as the one of a chat's pull request pill. */
export interface IPullRequestActionContext {
	readonly pullRequest: IGitHubPullRequestRef;
}

/** The issue a command acts on, such as the one of a chat's issue pill. */
export interface IIssueActionContext {
	readonly issue: IGitHubIssueRef;
}

export function isPullRequestActionContext(target: unknown): target is IPullRequestActionContext {
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

export function isIssueActionContext(target: unknown): target is IIssueActionContext {
	if (!target || typeof target !== 'object') {
		return false;
	}

	const candidate = target as { readonly issue?: IGitHubIssueRef };
	return !!candidate.issue &&
		typeof candidate.issue.owner === 'string' &&
		typeof candidate.issue.repo === 'string' &&
		typeof candidate.issue.number === 'number' &&
		URI.isUri(candidate.issue.uri);
}

export function getSessionPullRequest(session: ISession | undefined): IGitHubPullRequestRef | undefined {
	const gitHubInfo = session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
	return getGitHubPullRequestRefs(gitHubInfo)[0];
}

export function getSessionIssues(session: ISession | undefined): readonly IGitHubIssueRef[] {
	return session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.issues ?? [];
}

export const openPullRequestCommand = {
	id: OPEN_PULL_REQUEST_ACTION_ID,
	title: localize2('agentSessions.openPullRequest', "Open Pull Request"),
	icon: Codicon.gitPullRequest,
} satisfies ICommandAction;

/** Opens the pull request of a session or of a {@link IPullRequestActionContext}, such as a chat's pull request pill. */
class OpenPullRequestAction extends Action2 {

	constructor() {
		super({ ...openPullRequestCommand, f1: false });
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: ISession | ISession[] | IPullRequestActionContext): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const targets = Array.isArray(sessionOrContext) ? sessionOrContext : [sessionOrContext ?? resolveSessionCommandTarget(accessor, [])?.session];
		for (const target of targets) {
			const pullRequest = isPullRequestActionContext(target) ? target.pullRequest : getSessionPullRequest(target);
			if (pullRequest) {
				await openerService.open(pullRequest.uri, { openExternal: true, allowContributedOpeners: true });
			}
		}
	}
}
registerAction2(OpenPullRequestAction);

/** Opens the issue of a session or of a {@link IIssueActionContext}, such as a chat's issue pill. */
class OpenIssueAction extends Action2 {

	constructor() {
		super({
			id: OPEN_ISSUE_ACTION_ID,
			title: localize2('agentSessions.openIssue', 'Open Issue'),
			icon: Codicon.issues,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: ISession | ISession[] | IIssueActionContext): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const extensionService = accessor.get(IExtensionService);
		const urlService = accessor.get(IURLService);
		const target = (Array.isArray(sessionOrContext) ? sessionOrContext[0] : sessionOrContext) ?? resolveSessionCommandTarget(accessor, [])?.session;
		const issue = isIssueActionContext(target) ? target.issue : getSessionIssues(target)[0];
		if (!issue) {
			return;
		}

		if (await extensionService.getExtension(githubPullRequestsExtensionId)) {
			const uri = urlService.create({
				authority: githubPullRequestsExtensionId,
				path: openIssueWebviewPath,
				query: JSON.stringify({
					owner: issue.owner,
					repo: issue.repo,
					issueNumber: issue.number,
				}),
			});
			if (await urlService.open(uri, { trusted: true })) {
				return;
			}
		}

		await openerService.open(issue.uri, { openExternal: true });
	}
}
registerAction2(OpenIssueAction);
