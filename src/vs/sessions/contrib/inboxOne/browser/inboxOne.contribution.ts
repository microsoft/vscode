/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './inboxNotificationsAccessibility.js';
import { timeout } from '../../../../base/common/async.js';
import { KeyChord, KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IsDevelopmentContext } from '../../../../platform/contextkey/common/contextkeys.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { EditorAreaFocusContext, IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { InboxNotificationsView } from './inboxNotificationsView.js';
import { InboxNotificationsService } from './inboxNotificationsService.js';
import { IInboxNotificationsService } from '../common/inboxNotificationsService.js';
import { INBOX_NOTIFICATIONS_VIEW_ID, SHOW_INBOX_NOTIFICATIONS_COMMAND_ID } from './inboxNotificationsConstants.js';

registerSingleton(IInboxNotificationsService, InboxNotificationsService, InstantiationType.Delayed);

class InboxNotificationsCustomViewContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsInboxNotificationsView';

	constructor(
		@IContextKeyService contextKeyService: IContextKeyService,
		@ICustomViewService customViewService: ICustomViewService,
	) {
		super();

		this._register(customViewService.registerCustomView({
			id: INBOX_NOTIFICATIONS_VIEW_ID,
			ctor: new SyncDescriptor(InboxNotificationsView),
		}, {
			restore: contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key) === true,
		}));

		const chatEnabledContextKeys = new Set([ChatContextKeys.enabled.key]);
		this._register(contextKeyService.onDidChangeContext(event => {
			if (event.affectsSome(chatEnabledContextKeys)
				&& !contextKeyService.getContextKeyValue<boolean>(ChatContextKeys.enabled.key)
				&& customViewService.activeCustomView.get()?.id === INBOX_NOTIFICATIONS_VIEW_ID) {
				customViewService.hideCustomView();
			}
		}));
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
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, EditorAreaFocusContext.negate()),
				primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyMod.CtrlCmd | KeyCode.KeyI),
			},
		});
	}

	run(accessor: ServicesAccessor): void {
		accessor.get(ICustomViewService).showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
	}
}

class ShowInboxAgentMergeAlwaysSpotlightDebugAction extends Action2 {

	constructor() {
		super({
			id: 'sessions.inboxNotifications.debug.showAgentMergeAlwaysSpotlight',
			title: localize2('sessions.debug.showInboxAgentMergeAlwaysSpotlight', "Show Inbox Agent Merge Always Spotlight"),
			category: Categories.Developer,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, IsDevelopmentContext),
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const customViewService = accessor.get(ICustomViewService);
		const notificationService = accessor.get(INotificationService);

		customViewService.showCustomView(INBOX_NOTIFICATIONS_VIEW_ID);
		await timeout(0);

		const view = InboxNotificationsView.getActiveInstance();
		if (!view) {
			notificationService.warn(localize('inboxNotifications.debug.viewUnavailable', "Inbox view is not available. Open Inbox and try again."));
			return;
		}

		const shown = await view.debugShowAgentMergeAlwaysSpotlight();
		if (!shown) {
			notificationService.warn(localize('inboxNotifications.debug.noEligibleNotification', "No eligible Agent Merge inbox notification is available to spotlight."));
		}
	}
}

registerAction2(ShowInboxNotificationsAction);
registerAction2(ShowInboxAgentMergeAlwaysSpotlightDebugAction);
