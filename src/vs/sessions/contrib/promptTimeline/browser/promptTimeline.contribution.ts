/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { PROMPT_TIMELINE_ENABLED_SETTING } from '../common/promptTimeline.js';
import { registerPromptTimelineActions } from './promptTimelineActions.js';
import { PromptTimelineWidgetContrib } from './promptTimelineWidgetContrib.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[PROMPT_TIMELINE_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			description: localize('sessions.promptTimeline.enabled', "Controls whether the prompt timeline rail is shown alongside the chat transcript in the Agents window. The rail lets you scan and jump between the prompts you have sent."),
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
	},
});

ChatWidget.CONTRIBS.push(PromptTimelineWidgetContrib);
registerPromptTimelineActions();
