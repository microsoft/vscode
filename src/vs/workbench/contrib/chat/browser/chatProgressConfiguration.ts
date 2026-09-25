/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { ChatConfiguration, ChatProgressAnimation, ChatProgressVerbosity } from '../common/constants.js';

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
			localize('chat.progressAnimation.off', "Keep the original thinking, tool, and working progress rendering without a persistent indicator or JustRide logo."),
			localize('chat.progressAnimation.weave', "Move the three logo pieces in quick beats, then reset them together."),
			localize('chat.progressAnimation.draw', "Draw the right-slanting ribbon, right edge, and left-slanting ribbon in sequence, then erase them in the same counterclockwise direction and order."),
			localize('chat.progressAnimation.orbit', "Loop the diagonal ribbons around the moving right edge, then lock the logo back together."),
			localize('chat.progressAnimation.accordion', "Compress the logo pieces toward the center, then open them back up."),
			localize('chat.progressAnimation.dial', "Rotate the logo in three steps, then pause upright."),
		],
		markdownDescription: localize('chat.experimental.persistentProgress', "Keep a working progress indicator with an animated JustRide logo at the bottom until the response finishes. Off is the default without an experiment; choose an animation to enable the indicator explicitly. Tool calls follow {0}, and reasoning is separated into collapsible previews that break the tool chain. Standalone tools retain their icons. Completed responses still follow {1}. This replaces inner working progress; terminal activity animations and rich subagent pills are unchanged. Changes apply immediately; reduced motion keeps the indicator visible without animation.", `\`#${ChatConfiguration.PersistentProgressVerbosity}#\``, `\`#${ChatConfiguration.CollapseCompletedResponses}#\``),
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
	[ChatConfiguration.PersistentProgressVerbosity]: {
		type: 'string',
		default: ChatProgressVerbosity.Compact,
		enum: Object.values(ChatProgressVerbosity),
		enumItemLabels: [
			localize('chat.progressVerbosity.verbose.label', "Verbose"),
			localize('chat.progressVerbosity.compact.label', "Compact"),
		],
		enumDescriptions: [
			localize('chat.progressVerbosity.verbose', "Keep tool calls in expanded, headerless chains without an internal scrolling limit."),
			localize('chat.progressVerbosity.compact', "Preview tool calls while they run, then collapse each group to a single expandable summary row when the response moves on."),
		],
		markdownDescription: localize('chat.experimental.persistentProgressVerbosity', "Control tool call details when {0} is enabled. Compact is the default and collapses tool groups in place when thinking or response text resumes, or the response finishes. Expand a summary to inspect its tool calls. Has no effect when persistent progress is Off. Changes apply immediately.", `\`#${ChatConfiguration.PersistentProgress}#\``),
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
} satisfies Record<string, IConfigurationPropertySchema>;

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
	key: ChatConfiguration.PersistentProgressVerbosity,
	migrateFn: value => value === 'notVerbose' ? { value: ChatProgressVerbosity.Compact } : [],
}]);
