/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ChatWidget } from '../../../../workbench/contrib/chat/browser/widget/chatWidget.js';
import { PROMPT_TIMELINE_RAIL_SETTING, PROMPT_TIMELINE_RAIL_STYLES, PROMPT_TIMELINE_STICKY_HEADER_SETTING } from '../common/promptTimeline.js';
import { PromptTimelineWidgetContrib } from './promptTimelineWidgetContrib.js';

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	id: 'sessions',
	properties: {
		[PROMPT_TIMELINE_RAIL_SETTING]: {
			type: 'string',
			enum: [...PROMPT_TIMELINE_RAIL_STYLES],
			enumDescriptions: [
				localize('sessions.promptTimeline.rail.off', "Do not show the prompt timeline."),
				localize('sessions.promptTimeline.rail.ruler', "Show an overview ruler beside the transcript scrollbar that fans into prompt pills on engagement."),
				localize('sessions.promptTimeline.rail.dock', "Show a minimal handle on the transcript's left edge that opens a list of prompts on hover."),
			],
			default: 'off',
			description: localize('sessions.promptTimeline.rail', "Controls whether the prompt timeline is shown next to the chat transcript in the Agents window."),
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
		[PROMPT_TIMELINE_STICKY_HEADER_SETTING]: {
			type: 'boolean',
			default: false,
			description: localize('sessions.promptTimeline.stickyHeader', "Controls whether the current prompt is pinned to the top of the chat transcript while scrolling in the Agents window."),
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
	},
});

ChatWidget.CONTRIBS.push(PromptTimelineWidgetContrib);
