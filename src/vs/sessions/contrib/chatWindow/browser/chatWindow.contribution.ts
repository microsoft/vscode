/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/chatWindow.css';
import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { CHAT_WINDOWS_ENABLED_SETTING, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowService } from './chatWindowService.js';
import { ChatWindowChangesetActionsContribution, chatWindowEditorAreaContribution } from './chatWindowEditorArea.js';
import { chatWindowLayoutActionsContribution } from './chatWindowLayoutActions.js';
import { chatWindowTerminalActionsContribution } from './chatWindowTerminalActions.js';
import { ChatWindowsRestoration, openChatInWindowContribution } from './openChatInWindow.js';
import './chatWindowChangesFileList.js';

registerSingleton(IChatWindowService, ChatWindowService, InstantiationType.Delayed);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[CHAT_WINDOWS_ENABLED_SETTING]: {
			type: 'boolean',
			default: true,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('sessions.chatWindows.enabled', "Controls whether chats of the Agents window can be opened in windows of their own, and whether the chat windows that were open are restored at startup. Turning it off hides the actions that open chat windows; the chat windows that are open stay until closed."),
		},
	}
});

registerWorkbenchContribution2(ChatWindowsRestoration.ID, ChatWindowsRestoration, WorkbenchPhase.AfterRestored);
registerWorkbenchContribution2(ChatWindowChangesetActionsContribution.ID, ChatWindowChangesetActionsContribution, WorkbenchPhase.AfterRestored);

/**
 * The modules that register the actions of chat windows. Imported by name, so that losing one of the imports, such as in
 * a merge, fails to compile rather than silently dropping its actions.
 */
export const chatWindowContributions = [chatWindowEditorAreaContribution, chatWindowLayoutActionsContribution, chatWindowTerminalActionsContribution, openChatInWindowContribution] as const;
