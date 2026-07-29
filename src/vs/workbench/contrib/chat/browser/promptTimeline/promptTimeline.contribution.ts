/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import product from '../../../../../platform/product/common/product.js';
import { IConfigurationRegistry, Extensions as ConfigurationExtensions } from '../../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../../platform/registry/common/platform.js';
import { Extensions as WorkbenchExtensions, IConfigurationMigrationRegistry } from '../../../../common/configuration.js';
import { ChatWidget } from '../widget/chatWidget.js';
import { PROMPT_TIMELINE_RAIL_SETTING, PROMPT_TIMELINE_RAIL_STYLES, PROMPT_TIMELINE_STICKY_HEADER_SETTING } from '../../common/promptTimeline.js';
import { PromptTimelineWidgetContrib } from './promptTimelineWidgetContrib.js';

const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);

configurationRegistry.registerConfiguration({
	id: 'chat',
	properties: {
		[PROMPT_TIMELINE_STICKY_HEADER_SETTING]: {
			type: 'boolean',
			// On by default outside stable while the feature is being tried out.
			default: product.quality !== 'stable',
			description: localize('chat.promptTimeline.stickyHeader', "Controls whether the current prompt is pinned to the top of the chat transcript while scrolling."),
			tags: ['experimental'],
			experiment: { mode: 'startup' },
		},
	},
});

configurationRegistry.registerConfiguration({
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
	},
});

// The sticky header used to be an Agents-window-only setting; carry an explicit opt-in over to the
// chat-wide setting that now drives it in both windows.
Registry.as<IConfigurationMigrationRegistry>(WorkbenchExtensions.ConfigurationMigration).registerConfigurationMigrations([{
	key: 'sessions.promptTimeline.stickyHeader',
	migrateFn: value => ([
		['sessions.promptTimeline.stickyHeader', { value: undefined }],
		[PROMPT_TIMELINE_STICKY_HEADER_SETTING, { value }],
	])
}]);

ChatWidget.CONTRIBS.push(PromptTimelineWidgetContrib);
