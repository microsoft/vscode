/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { IWorkbenchContribution, registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import './chatWindowActions.js';
import './openChatInWindow.js';
import './sessionChatViewEditor.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../common/chatWindows.js';
import { SessionsChatWindowProvider } from './sessionsChatWindowProvider.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[CHAT_WINDOWS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('sessions.chatWindows.enabled', "Controls whether chats of the Agents window can be opened in windows of their own, and whether the chat windows that were open are restored at startup. Turning it off hides the actions that open chat windows; the chat windows that are open stay until closed."),
		},
	}
});

/** Provides the chat windows of the Agents window: what they show of a session, their chrome and their look. */
export class SessionsChatWindowProviderContribution extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.sessionsChatWindowProvider';

	constructor(
		@IChatWindowService chatWindowService: IChatWindowService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		const provider = this._register(instantiationService.createInstance(SessionsChatWindowProvider));
		this._register(chatWindowService.registerProvider(provider));
	}
}

registerWorkbenchContribution2(SessionsChatWindowProviderContribution.ID, SessionsChatWindowProviderContribution, WorkbenchPhase.BlockRestore);
