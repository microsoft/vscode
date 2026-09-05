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
import { IURLService } from '../../../../platform/url/common/url.js';
import { IExtensionService } from '../../../../workbench/services/extensions/common/extensions.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IGitHubIssueRef, ISession } from '../../../services/sessions/common/session.js';
import { IActiveSession } from '../../../services/sessions/common/sessionsManagement.js';
import { OPEN_ISSUE_ACTION_ID } from '../common/types.js';

const githubPullRequestsExtensionId = 'github.vscode-pull-request-github';
const openIssueWebviewPath = '/open-issue-webview';

class IssueActionContext {
	constructor(readonly issue: IGitHubIssueRef) { }
}

function isIssueActionContext(target: unknown): target is IssueActionContext {
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

class OpenIssueAction extends Action2 {
	static readonly ID = OPEN_ISSUE_ACTION_ID;

	constructor() {
		super({
			id: OpenIssueAction.ID,
			title: localize2('agentSessions.openIssue', 'Open Issue'),
			icon: Codicon.issues,
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | ISession[] | IssueActionContext): Promise<void> {
		const openerService = accessor.get(IOpenerService);
		const sessionsService = accessor.get(ISessionsService);
		const extensionService = accessor.get(IExtensionService);
		const urlService = accessor.get(IURLService);
		const target = (Array.isArray(sessionOrContext) ? sessionOrContext[0] : sessionOrContext) ?? sessionsService.activeSession.get();
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

function getSessionIssues(session: ISession | undefined): readonly IGitHubIssueRef[] {
	return session?.workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get()?.issues ?? [];
}

class CopyIssueUrlAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.copyIssueUrl';

	constructor() {
		super({
			id: CopyIssueUrlAction.ID,
			title: localize2('agentSessions.copyIssueUrl', "Copy Issue URL"),
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: IActiveSession | ISession | ISession[] | IssueActionContext): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const sessionsService = accessor.get(ISessionsService);
		const target = (Array.isArray(sessionOrContext) ? sessionOrContext[0] : sessionOrContext) ?? sessionsService.activeSession.get();
		const issue = isIssueActionContext(target) ? target.issue : getSessionIssues(target)[0];
		if (!issue) {
			return;
		}

		await clipboardService.writeText(issue.uri.toString(true));
	}
}
registerAction2(CopyIssueUrlAction);
