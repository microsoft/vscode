/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../platform/clipboard/common/clipboardService.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../common/agentHostSessionsProvider.js';
import { ChatSessionProviderIdContext } from '../../../common/contextkeys.js';
import { getSessionBranchName, ISession } from '../../../services/sessions/common/session.js';
import { SessionItemContextMenuId, SessionItemHasBranchNameContext } from '../../sessions/browser/views/sessionsList.js';

registerAction2(class CopySessionBranchNameAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.agentHost.copySessionBranchName',
			title: localize2('copySessionBranchName', "Copy Session Branch Name"),
			menu: [{
				id: SessionItemContextMenuId,
				group: '2_open',
				order: 3,
				when: ContextKeyExpr.and(
					ContextKeyExpr.regex(ChatSessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
					SessionItemHasBranchNameContext,
				),
			}]
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		const branchName = getSessionBranchName(session);
		if (!branchName) {
			return;
		}

		await accessor.get(IClipboardService).writeText(branchName);
	}
});
