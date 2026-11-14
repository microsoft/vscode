/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../common/contributions.js';
import { ChatConfiguration } from '../../../chat/common/constants.js';
import { AgentsViewGate } from './agentsViewGate.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'chat',
	title: localize('chatConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		[ChatConfiguration.SessionsViewEnabled]: {
			type: 'boolean',
			default: false,
			tags: ['experimental'],
			experiment: { mode: 'startup' },
			markdownDescription: localize('chat.sessionsView.enabled', "Controls whether the Sessions view of the Agents window shows in the Primary Side Bar of editor windows. Requires a reload to take effect."),
		},
	},
});

// Its sessions services and the chat part are those of every editor window (see editorWindowSessions.contribution.ts): the gate enables them
registerWorkbenchContribution2(AgentsViewGate.ID, AgentsViewGate, WorkbenchPhase.BlockStartup);
