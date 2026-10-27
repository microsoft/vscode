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
import { Disposable, MutableDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
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
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { IAgentsActivityService } from '../../../services/activity/browser/agentsActivityService.js';
import { ICustomViewService } from '../../../services/customView/browser/customViewService.js';
import { InboxNotificationsView } from './inboxNotificationsView.js';
import { InboxNotificationsService } from './inboxNotificationsService.js';
import { IInboxNotificationsService } from '../common/inboxNotificationsService.js';
import { CHAT_INBOX_ENABLED_SETTING, ChatInboxEnabledContext, INBOX_NOTIFICATIONS_VIEW_ID, SHOW_INBOX_NOTIFICATIONS_COMMAND_ID } from './inboxNotificationsConstants.js';

registerSingleton(IInboxNotificationsService, InboxNotificationsService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[CHAT_INBOX_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.MACHINE,
			included: false,
			tags: ['experimental', 'advanced'],
			description: localize('chat.agentSessions.inbox.enabled', "Enables the Sessions Inbox: a prioritized, actionable notifications view. When disabled, the Inbox entry in the Sessions list, the Inbox view, and its Show Inbox command are hidden."),
			experiment: { mode: 'auto' },
		},
	},
});

/** Mirrors the Inbox enablement setting into a context key for `when` clauses and section visibility. */
class ChatInboxEnabledContextContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.chatInboxEnabledContext';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IContextKeyService contextKeyService: IContextKeyService,
	) {
		super();
		const key = ChatInboxEnabledContext.bindTo(contextKeyService);
		const update = () => key.set(configurationService.getValue<boolean>(CHAT_INBOX_ENABLED_SETTING) === true);
		update();
		this._register(configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration(CHAT_INBOX_ENABLED_SETTING)) {
				update();
			}
		}));
	}
}

registerWorkbenchContribution2(ChatInboxEnabledContextContribution.ID, ChatInboxEnabledContextContribution, WorkbenchPhase.BlockStartup);

export class InboxNotificationsCustomViewContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsInboxNotificationsView';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@ICustomViewService customViewService: ICustomViewService,
		@IAgentsActivityService agentsActivityService: IAgentsActivityService,
	) {
		super();

		const inboxEnabled = observableConfigValue(CHAT_INBOX_ENABLED_SETTING, false, configurationService);
		const enabled = derived(this, reader => inboxEnabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);
		const viewRegistration = this._register(new MutableDisposable());
		let restore = enabled.get();
		this._register(toDisposable(() => agentsActivityService.setEnabled(false)));
		this._register(autorun(reader => {
			const isEnabled = enabled.read(reader);
			agentsActivityService.setEnabled(isEnabled);
			if (isEnabled) {
				viewRegistration.value = customViewService.registerCustomView({
					id: INBOX_NOTIFICATIONS_VIEW_ID,
					ctor: new SyncDescriptor(InboxNotificationsView),
				}, { restore });
				restore = false;
			} else {
				if (customViewService.activeCustomView.read(undefined)?.id === INBOX_NOTIFICATIONS_VIEW_ID) {
					customViewService.hideCustomView();
				}
				viewRegistration.clear();
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
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatInboxEnabledContext),
			keybinding: {
				weight: KeybindingWeight.SessionsContrib,
				when: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, ChatInboxEnabledContext, EditorAreaFocusContext.negate()),
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
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatInboxEnabledContext, IsDevelopmentContext),
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
