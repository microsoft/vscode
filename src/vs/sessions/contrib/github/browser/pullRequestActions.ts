/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IOpenerService } from '../../../../platform/opener/common/opener.js';
import { Menus } from '../../../browser/menus.js';
import { SessionHasPullRequestContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { getGitHubPullRequestRefs, IGitHubPullRequestRef, ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { OPEN_PULL_REQUEST_ACTION_ID } from '../common/types.js';

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
