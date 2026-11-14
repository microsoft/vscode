/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { AgentsChatPartService, IAgentsChatPartService } from './agentsChatPart.js';
import { AgentsChatPartFrame, IAgentsChatPartFrame } from './agentsChatPartFrame.js';
import { ChatViewSessionsGate } from './chatViewSessionsGate.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.ChatViewSessionsListEnabled]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.viewSessions.sessionsList.enabled', "Controls whether the Chat view of editor windows shows the sessions of the Agents window, with their chats, in place of its own chats. Local chats are not available while it is on. Requires a reload to take effect."),
		},
		[ChatConfiguration.ChatViewSessionsOpenInChatPart]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.viewSessions.openInChatPart', "Controls whether sessions opened from the Sessions view show in the chat part beside the editor area by default, rather than in the view itself. Show Chat in Chat Part and Show Chat in View change it for a window. Applies when {0} is on.", '`#chat.viewSessions.sessionsList.enabled#`'),
		},
	},
});

// The chat part, and the chats it shows; the other services of the sessions of editor windows are those of editorWindowSessions.contribution.ts
registerSingleton(IAgentsChatPartFrame, AgentsChatPartFrame, InstantiationType.Delayed);
registerSingleton(IAgentsChatPartService, AgentsChatPartService, InstantiationType.Delayed);

registerWorkbenchContribution2(ChatViewSessionsGate.ID, ChatViewSessionsGate, WorkbenchPhase.BlockStartup);
