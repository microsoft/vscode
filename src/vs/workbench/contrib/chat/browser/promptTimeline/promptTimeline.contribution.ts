/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { PROMPT_TIMELINE_DISPLAY_SETTING, PROMPT_TIMELINE_RAIL_STYLES, PROMPT_TIMELINE_STICKY_SCROLL_SETTING } from '../../common/promptTimeline.js';
import { PromptTimelineWidgetContrib } from './promptTimelineWidgetContrib.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'chat',
	properties: {
		[PROMPT_TIMELINE_STICKY_SCROLL_SETTING]: {
			type: 'boolean',
			default: true,
			description: localize('chat.stickyScroll.enabled', "Controls whether the current prompt is pinned to the top of the chat transcript while scrolling."),
			experiment: { mode: 'startup' },
		},
	},
});

configurationRegistry.registerConfiguration({
	id: 'sessions',
	properties: {
		[PROMPT_TIMELINE_DISPLAY_SETTING]: {
			type: 'string',
			enum: [...PROMPT_TIMELINE_RAIL_STYLES],
			enumDescriptions: [
				localize('sessions.chatTimeline.display.off', "Do not show the prompt timeline."),
				localize('sessions.chatTimeline.display.ruler', "Show an overview ruler beside the transcript scrollbar that fans into prompt pills on engagement."),
				localize('sessions.chatTimeline.display.gutter', "Show a minimal handle in the transcript's left gutter that opens a list of prompts on hover."),
			],
			default: 'gutter',
			description: localize('sessions.chatTimeline.display', "Controls how the prompt timeline is displayed next to the chat transcript in the Agents window."),
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
	},
});

ChatWidget.CONTRIBS.push(PromptTimelineWidgetContrib);
