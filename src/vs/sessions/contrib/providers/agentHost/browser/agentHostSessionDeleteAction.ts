/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ANY_AGENT_HOST_PROVIDER_RE } from '../../../../common/agentHostSessionsProvider.js';
import { ChatSessionProviderIdContext } from '../../../../common/contextkeys.js';
import { ISession } from '../../../../services/sessions/common/session.js';
import { confirmAndDeleteSessions } from '../../../sessions/browser/deleteSessionHelper.js';
import { SessionItemContextMenuId } from '../../../sessions/browser/views/sessionsList.js';

registerAction2(class DeleteAgentHostSessionAction extends Action2 {
	constructor() {
		super({
			id: 'sessionsViewPane.agentHost.deleteSession',
			title: localize2('deleteAgentHostSession', "Delete..."),
			menu: [{
				id: SessionItemContextMenuId,
				group: '1_edit',
				order: 4,
				when: ContextKeyExpr.regex(ChatSessionProviderIdContext.key, ANY_AGENT_HOST_PROVIDER_RE),
			}]
		});
	}

	run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		return confirmAndDeleteSessions(accessor, context);
	}
});
