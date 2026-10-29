/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './inboxNotificationsAccessibility.js';
import { localize, localize2 } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { autorun, derived } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { registerWorkbenchContribution2, WorkbenchPhase, type IWorkbenchContribution } from '../../../../workbench/common/contributions.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { SessionsCategories } from '../../../common/categories.js';
import { IWindowCanvasService } from '../../../services/canvas/browser/windowCanvasService.js';
import { InboxNotificationsView } from './inboxNotificationsView.js';
import { InboxNotificationsService } from './inboxNotificationsService.js';
import { IInboxCanvasHostService, UnsupportedInboxCanvasHostService } from './inboxCanvasHost.js';
import { IInboxNotificationsService } from '../common/inboxNotificationsService.js';
import { CHAT_INBOX_ENABLED_SETTING, ChatInboxEnabledContext, INBOX_CANVAS_ID, SHOW_INBOX_NOTIFICATIONS_COMMAND_ID } from './inboxNotificationsConstants.js';

registerSingleton(IInboxNotificationsService, InboxNotificationsService, InstantiationType.Delayed);
registerSingleton(IInboxCanvasHostService, UnsupportedInboxCanvasHostService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[CHAT_INBOX_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.MACHINE,
			included: false,
			tags: ['experimental', 'advanced'],
			description: localize('chat.agentSessions.inbox.enabled', "Enables the Sessions Inbox: a prioritized, actionable notifications canvas. When disabled, the Inbox entry in the Sessions list, the Inbox canvas, and its Show Inbox command are hidden."),
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

export class InboxNotificationsCanvasContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsInboxNotificationsView';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
		@IWindowCanvasService canvasService: IWindowCanvasService,
	) {
		super();

		const inboxEnabled = observableConfigValue(CHAT_INBOX_ENABLED_SETTING, false, configurationService);
		const enabled = derived(this, reader => inboxEnabled.read(reader) && !chatEntitlementService.sentimentObs.read(reader).hidden);
		const viewRegistration = this._register(new MutableDisposable());
		this._register(autorun(reader => {
			const isEnabled = enabled.read(reader);
			if (isEnabled) {
				viewRegistration.value = canvasService.registerCanvas({
					id: INBOX_CANVAS_ID,
					title: localize('inbox.canvas.title', "Inbox"),
					icon: Codicon.inbox,
					ctor: new SyncDescriptor(InboxNotificationsView, [undefined, undefined]),
				});
			} else {
				viewRegistration.clear();
				void canvasService.closeCanvas(INBOX_CANVAS_ID).catch(onUnexpectedError);
			}
		}));
	}
}

registerWorkbenchContribution2(InboxNotificationsCanvasContribution.ID, InboxNotificationsCanvasContribution, WorkbenchPhase.BlockRestore);

class ShowInboxNotificationsAction extends Action2 {

	constructor() {
		super({
			id: SHOW_INBOX_NOTIFICATIONS_COMMAND_ID,
			title: localize2('sessions.showInboxNotifications', "Show Inbox"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, ChatInboxEnabledContext),
		});
	}

	run(accessor: ServicesAccessor): Promise<void> {
		return accessor.get(IWindowCanvasService).openCanvas(INBOX_CANVAS_ID);
	}
}

registerAction2(ShowInboxNotificationsAction);
