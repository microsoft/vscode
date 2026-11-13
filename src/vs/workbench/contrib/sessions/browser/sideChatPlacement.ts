/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { derived, IObservable } from '../../../../base/common/observable.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { observableConfigValue } from '../../../../platform/observable/common/platformObservableUtils.js';
import { IChatEntitlementService } from '../../../services/chat/common/chatEntitlementService.js';
import { AgentWorkbenchLayout, ISessionsHostLayoutService } from '../../../services/sessions/browser/sessionsHostLayoutService.js';
import { ChatOriginKind, IChat } from '../../../services/sessions/common/session.js';
import { SESSIONS_SIDE_CHATS_IN_SIDE_PANE_SETTING } from '../common/sessionConfig.js';

export const ISideChatPlacementService = createDecorator<ISideChatPlacementService>('sideChatPlacementService');

/** Where the Agents window shows side chats, such as those started with `/btw`. */
export interface ISideChatPlacementService {
	readonly _serviceBrand: undefined;

	/**
	 * Whether side chats show as tabs of the main window's side pane: the grid does not show them as chat tabs, and the
	 * sessions list does not list them. Never while AI features are hidden.
	 */
	readonly inSidePane: IObservable<boolean>;
}

/** Whether `chat` is a side chat, which shows in the side pane while {@link ISideChatPlacementService.inSidePane}. */
export function isSideChat(chat: IChat): boolean {
	return chat.origin?.kind === ChatOriginKind.SideChat;
}

export class SideChatPlacementService implements ISideChatPlacementService {

	declare readonly _serviceBrand: undefined;

	readonly inSidePane: IObservable<boolean>;

	constructor(
		@IConfigurationService configurationService: IConfigurationService,
		@ISessionsHostLayoutService hostLayoutService: ISessionsHostLayoutService,
		@IChatEntitlementService chatEntitlementService: IChatEntitlementService,
	) {
		const enabled = observableConfigValue<boolean>(SESSIONS_SIDE_CHATS_IN_SIDE_PANE_SETTING, false, configurationService);
		const desktop = hostLayoutService.agentWorkbenchLayout === AgentWorkbenchLayout.Desktop;
		this.inSidePane = derived(this, reader => desktop && enabled.read(reader) === true && !chatEntitlementService.sentimentObs.read(reader).hidden);
	}
}
