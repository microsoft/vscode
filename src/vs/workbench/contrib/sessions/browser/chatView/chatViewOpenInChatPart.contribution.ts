/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, derived, observableFromEvent } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../../platform/contextkey/common/contextkey.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ActiveAuxiliaryContext, AuxiliaryBarMaximizeHiddenContext } from '../../../../common/contextkeys.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { ChatViewContainerId, ChatViewId } from '../../../chat/browser/chat.js';
import { IChatViewSessionsListService } from '../../../chat/browser/widgetHosts/viewPane/chatViewSessionsList.js';
import { ChatContextKeys } from '../../../chat/common/actions/chatContextKeys.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { IEditorWindowSessionsRuntime } from '../editorWindow/editorWindowSessionsRuntime.js';
import { AgentsViewAvailable } from '../agentsView/agentsChatPartContext.js';
import { IEditorWindowChatPartService } from '../agentsView/agentsChatPartContribution.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	properties: {
		[ChatConfiguration.ChatViewSessionsOpenInChatPart]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.viewSessions.openInChatPart', "Controls whether the chats of agent sessions open in the chat part beside the Chat view instead of in the Chat view. Other chats, such as local chats, stay in the Chat view."),
		},
	},
});

/** The chat part docks beside the Chat view: the Agents viewlet docks it beside its own view, over this. */
const CHAT_VIEW_ANCHOR_PRIORITY = 1;

/**
 * Opens the chats of agent sessions in the chat part beside the Chat view while {@link ChatConfiguration.ChatViewSessionsOpenInChatPart}
 * is on, in local editor windows: what would show such a chat in the Chat view shows it in the chat part, as the Agents viewlet
 * does. Other chats, such as local chats, stay in the Chat view. While it is off, the chat part does not show.
 */
export class ChatViewOpenInChatPartContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.chatViewOpenInChatPart';

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService environmentService: IWorkbenchEnvironmentService,
		@IEditorWindowChatPartService chatPartService: IEditorWindowChatPartService,
		@IEditorWindowSessionsRuntime sessionsRuntime: IEditorWindowSessionsRuntime,
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@IChatViewSessionsListService private readonly _sessionsListService: IChatViewSessionsListService,
	) {
		super();

		if (environmentService.remoteAuthority || environmentService.isSessionsWindow) {
			return;
		}

		const setting = observableConfigValue(ChatConfiguration.ChatViewSessionsOpenInChatPart, false, configurationService);
		// What the chat part's host needs to show chats: not with AI features disabled, nor with agents disabled
		const available = ContextKeyExpr.and(ChatContextKeys.enabled, AgentsViewAvailable)!;
		const availableKeys = new Set(available.keys());
		const chatAvailable = observableFromEvent(this, Event.filter(_contextKeyService.onDidChangeContext, e => e.affectsSome(availableKeys)), () => _contextKeyService.contextMatchesRules(available));
		const enabled = derived(this, reader => setting.read(reader) && chatAvailable.read(reader));
		this._register(chatPartService.enable({ anchorViewId: ChatViewId, anchorPriority: CHAT_VIEW_ANCHOR_PRIORITY, enabled, ownsNewChat: false }));
		// The sessions that the chat part shows are known while the Chat view lists them
		this._register(autorun(reader => {
			if (enabled.read(reader)) {
				reader.store.add(sessionsRuntime.enable({ viewIds: [ChatViewId] }));
			}
		}));
		this._hideMaximizeWhileSessionsOnly();
	}

	/**
	 * While the Chat view shows only its sessions, as its sessions list says, the secondary side bar does not offer to
	 * maximize it.
	 */
	private _hideMaximizeWhileSessionsOnly(): void {
		const hidden = AuxiliaryBarMaximizeHiddenContext.bindTo(this._contextKeyService);
		const activeAuxiliaryKeys = new Set([ActiveAuxiliaryContext.key]);
		const activeAuxiliary = observableFromEvent(this, Event.filter(this._contextKeyService.onDidChangeContext, e => e.affectsSome(activeAuxiliaryKeys)), () => this._contextKeyService.getContextKeyValue<string>(ActiveAuxiliaryContext.key));
		this._register(autorun(reader => {
			const sessionsOnly = this._sessionsListService.sessionsOnly.read(reader);
			hidden.set(sessionsOnly && activeAuxiliary.read(reader) === ChatViewContainerId);
		}));
		this._register(toDisposable(() => hidden.reset()));
	}
}

registerWorkbenchContribution2(ChatViewOpenInChatPartContribution.ID, ChatViewOpenInChatPartContribution, WorkbenchPhase.BlockStartup);
