/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ISession } from '../../../services/sessions/common/session.js';
import { OpenSessionInNewWindowCommandId, SessionItemContextMenuId } from '../browser/views/sessionsList.js';

export class OpenSessionInNewAgentsWindowAction extends Action2 {

	constructor() {
		super({
			id: OpenSessionInNewWindowCommandId,
			title: localize2('openInNewWindow', "Open in New Window"),
			menu: [{
				id: SessionItemContextMenuId,
				group: 'navigation',
				order: 0,
				when: ContextKeyExpr.and(IsSessionsWindowContext, IsAuxiliaryWindowContext.toNegated()),
			}]
		});
	}

	async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		if (!context) {
			return;
		}

		const nativeHostService = accessor.get(INativeHostService);
		const sessions = Array.isArray(context) ? context : [context];
		for (const session of sessions) {
			await nativeHostService.openAgentsWindow({ sessionResource: session.resource.toJSON(), forceNewWindow: true });
		}
	}
}

registerAction2(OpenSessionInNewAgentsWindowAction);
