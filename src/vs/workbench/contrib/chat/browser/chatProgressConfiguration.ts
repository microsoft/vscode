/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ChatConfiguration, ChatProgressAnimation } from '../common/constants.js';

export const chatProgressConfigurationProperties = {
	[ChatConfiguration.PersistentProgress]: {
		type: 'boolean',
		default: false,
		markdownDescription: localize('chat.experimental.persistentProgress.enabled', "Keep a working progress indicator with the VS Code logo until the response finishes, including while tools, subagents, or interactive prompts are shown. This replaces standalone working indicators and inner thinking progress; terminal activity animations and rich subagent pills are unchanged. In collapsed thinking mode only, the last active thinking section owns progress: the logo stays in its header, and text shimmers in the header when collapsed or inside when expanded. Other thinking styles always keep the bottom indicator. When disabled, use the original progress UI without the persistent indicator or logo."),
		tags: ['experimental'],
	},
	[ChatConfiguration.PersistentProgressAnimation]: {
		type: 'string',
		default: ChatProgressAnimation.Off,
		enum: Object.values(ChatProgressAnimation),
		enumItemLabels: [
			localize('chat.progressAnimation.off.label', "Off"),
			localize('chat.progressAnimation.weave.label', "Weave"),
			localize('chat.progressAnimation.orbit.label', "Orbit and Lock"),
			localize('chat.progressAnimation.accordion.label', "Accordion"),
			localize('chat.progressAnimation.dial.label', "Dial Rotation"),
		],
		enumDescriptions: [
			localize('chat.progressAnimation.off', "Show the VS Code logo without a special animation."),
			localize('chat.progressAnimation.weave', "Move the three logo pieces in quick beats, then reset them together."),
			localize('chat.progressAnimation.orbit', "Loop the diagonal ribbons around the moving right edge, then lock the logo back together."),
			localize('chat.progressAnimation.accordion', "Compress the logo pieces toward the center, then open them back up."),
			localize('chat.progressAnimation.dial', "Rotate the logo in three steps, then pause upright."),
		],
		markdownDescription: localize('chat.experimental.persistentProgress.animation', "Controls the logo animation when #chat.experimental.persistentProgress.enabled# is on. Off shows a static logo. Choosing an animation does not enable persistent progress. Changes apply immediately, and reduced motion disables all logo animations."),
		tags: ['experimental'],
	},
} satisfies Record<string, IConfigurationPropertySchema>;
