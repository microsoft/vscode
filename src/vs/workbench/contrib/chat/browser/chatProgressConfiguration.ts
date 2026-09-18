/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ChatConfiguration, ChatProgressAnimation } from '../common/constants.js';

export const chatProgressConfigurationProperties = {
	[ChatConfiguration.PersistentProgress]: {
		type: 'string',
		default: ChatProgressAnimation.Off,
		enum: Object.values(ChatProgressAnimation),
		enumItemLabels: [
			localize('chat.progressAnimation.off.label', "Off"),
			localize('chat.progressAnimation.weave.label', "Weave"),
			localize('chat.progressAnimation.draw.label', "Draw"),
			localize('chat.progressAnimation.orbit.label', "Orbit and Lock"),
			localize('chat.progressAnimation.accordion.label', "Accordion"),
			localize('chat.progressAnimation.dial.label', "Dial Rotation"),
		],
		enumDescriptions: [
			localize('chat.progressAnimation.off', "Keep the original thinking, tool, and working progress rendering without a persistent indicator or VS Code logo."),
			localize('chat.progressAnimation.weave', "Move the three logo pieces in quick beats, then reset them together."),
			localize('chat.progressAnimation.draw', "Draw the right-slanting ribbon, right edge, and left-slanting ribbon in sequence, then erase them in the same counterclockwise direction and order."),
			localize('chat.progressAnimation.orbit', "Loop the diagonal ribbons around the moving right edge, then lock the logo back together."),
			localize('chat.progressAnimation.accordion', "Compress the logo pieces toward the center, then open them back up."),
			localize('chat.progressAnimation.dial', "Rotate the logo in three steps, then pause upright."),
		],
		markdownDescription: localize('chat.experimental.persistentProgress', "Keep a working progress indicator with an animated VS Code logo at the bottom until the response finishes. Selecting an animation shows tool calls in expanded, headerless chains without an internal scrolling limit. Reasoning is separated into collapsible previews that break the tool chain, and standalone tools retain their icons. Completed responses still follow the {0} setting. This replaces inner working progress; terminal activity animations and rich subagent pills are unchanged. Off preserves the original thinking, tool, and progress rendering. Changes apply immediately; reduced motion keeps the indicator visible without animation.", `\`#${ChatConfiguration.CollapseCompletedResponses}#\``),
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
} satisfies Record<string, IConfigurationPropertySchema>;
