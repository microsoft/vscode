/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './inboxNotificationsAccessibility.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { InboxNotificationsView } from './inboxNotificationsView.js';
import { InboxNotificationsService } from './inboxNotificationsService.js';
import { IInboxNotificationsService } from '../common/inboxNotificationsService.js';
import { INBOX_NOTIFICATIONS_VIEW_ID, SHOW_INBOX_NOTIFICATIONS_COMMAND_ID } from './inboxNotificationsConstants.js';

registerSingleton(IInboxNotificationsService, InboxNotificationsService, InstantiationType.Delayed);

class InboxNotificationsCustomViewContribution implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsInboxNotificationsView';

	constructor(
		@ICustomViewService customViewService: ICustomViewService,
	) {
		customViewService.registerCustomView({
			id: INBOX_NOTIFICATIONS_VIEW_ID,
			ctor: new SyncDescriptor(InboxNotificationsView),
		});
	}
}

registerWorkbenchContribution2(InboxNotificationsCustomViewContribution.ID, InboxNotificationsCustomViewContribution, WorkbenchPhase.BlockRestore);

class ShowInboxNotificationsAction extends Action2 {

	constructor() {
		super({
			id: SHOW_INBOX_NOTIFICATIONS_COMMAND_ID,
			title: localize2('sessions.showInboxNotifications', "Show Inbox"),
			f1: true,
			precondition: ChatContextKeys.enabled,
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(ICustomViewService).showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
	}
}

registerAction2(ShowInboxNotificationsAction);
