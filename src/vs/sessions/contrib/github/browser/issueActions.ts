/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { resolveSessionCommandTarget } from '../../../../workbench/contrib/sessions/browser/sessionCommandTarget.js';
import { getSessionIssues, IIssueActionContext, isIssueActionContext } from '../../../../workbench/contrib/sessions/browser/github/gitHubReferenceActions.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';

class CopyIssueUrlAction extends Action2 {
	static readonly ID = 'workbench.agentSessions.action.copyIssueUrl';

	constructor() {
		super({
			id: CopyIssueUrlAction.ID,
			title: localize2('agentSessions.copyIssueUrl', "Copy Issue URL"),
			f1: false,
		});
	}

	override async run(accessor: ServicesAccessor, sessionOrContext?: ISession | ISession[] | IIssueActionContext): Promise<void> {
		const clipboardService = accessor.get(IClipboardService);
		const target = (Array.isArray(sessionOrContext) ? sessionOrContext[0] : sessionOrContext) ?? resolveSessionCommandTarget(accessor, [])?.session;
		const issue = isIssueActionContext(target) ? target.issue : getSessionIssues(target)[0];
		if (!issue) {
			return;
		}

		await clipboardService.writeText(issue.uri.toString(true));
	}
}
registerAction2(CopyIssueUrlAction);
