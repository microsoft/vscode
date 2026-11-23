/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IEditorService } from '../../../../workbench/services/editor/common/editorService.js';
import { Menus, SessionActivityBarGroup } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { ISessionsHostLayoutService } from '../../../../workbench/services/sessions/browser/sessionsHostLayoutService.js';
import { sessionActivityBarChatActionContext, SessionHasPullRequestContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { getSessionPullRequest, IPullRequestActionContext, isPullRequestActionContext, openPullRequestCommand } from '../../../../workbench/contrib/sessions/browser/github/gitHubReferenceActions.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { OPEN_PULL_REQUEST_ACTION_ID, OPEN_PULL_REQUEST_CHANGES_ACTION_ID } from '../../../../workbench/contrib/sessions/common/github/types.js';
import { createPullRequestChangesEditorInput } from './pullRequestChangesMultiDiffSourceResolver.js';

MenuRegistry.appendMenuItems([{
	id: Menus.SessionItemContextMenu,
	item: { command: openPullRequestCommand, group: 'navigation', order: 4, when: SessionHasPullRequestContext },
}, {
	id: Menus.SessionActivityBar,
	item: { command: openPullRequestCommand, group: SessionActivityBarGroup.SidePanel, order: 100, when: sessionActivityBarChatActionContext(OPEN_PULL_REQUEST_ACTION_ID) },
}]);

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

	override async run(accessor: ServicesAccessor, sessionOrContext?: ISession | IPullRequestActionContext): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const layoutService = accessor.get(ISessionsHostLayoutService);

		const target = sessionOrContext ?? resolveSessionCommandTarget(accessor, [])?.session;
		const pullRequest = isPullRequestActionContext(target) ? target.pullRequest : getSessionPullRequest(target);
		if (!pullRequest) {
			return;
		}

		layoutService.revealEditorPartExplicitly();
		await editorService.openEditor(createPullRequestChangesEditorInput(pullRequest));
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
				group: '3_copy',
				order: 2,
				when: SessionHasPullRequestContext
			}],
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: ISession | ISession[] | IPullRequestActionContext): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const targets = Array.isArray(sessionOrContext) ? sessionOrContext : [sessionOrContext ?? resolveSessionCommandTarget(accessor, [])?.session];
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
