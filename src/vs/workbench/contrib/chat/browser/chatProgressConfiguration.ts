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
		default: ChatProgressAnimation.Draw,
		enum: Object.values(ChatProgressAnimation),
		enumItemLabels: [
			localize('chat.progressAnimation.off.label', "Off"),
			localize('chat.progressAnimation.draw.label', "Draw"),
			localize('chat.progressAnimation.drawMonochrome.label', "Draw (Monochrome)"),
			localize('chat.progressAnimation.drawMonochromeNoIcon.label', "Draw (Monochrome, No Icon)"),
		],
		enumDescriptions: [
			localize('chat.progressAnimation.off', "Keep the original thinking, tool, and working progress rendering without a persistent indicator or VS Code logo."),
			localize('chat.progressAnimation.draw', "Tie the VS Code mark with fast parabolic ribbon motion, hold it, then unravel it before a brief rest."),
			localize('chat.progressAnimation.drawMonochrome', "Use the Draw animation with the same grayscale treatment as the VS Code icon in the Agents window. High contrast themes retain their contrast color."),
			localize('chat.progressAnimation.drawMonochromeNoIcon', "Keep the same persistent progress text and tool rendering as Draw (Monochrome), but hide the VS Code icon."),
		],
		markdownDescription: localize('chat.experimental.persistentProgress', "Keep a working progress indicator at the bottom until the response finishes, with a colored or monochrome Draw animation, or without an icon. The indicator reports running subagents and background commands from the current or earlier requests, even while the main response progresses. The default is Draw in all versions of VS Code. Experiments can override the default; an explicit setting takes precedence. Tool calls follow {0}, and reasoning is separated into collapsible previews that break the tool chain. Standalone tools retain their icons. Completed responses still follow {1}. This replaces inner working progress; terminal activity animations and rich subagent pills are unchanged. Changes apply immediately; reduced motion keeps the indicator visible without animation.", `\`#${ChatConfiguration.PersistentProgressVerbosity}#\``, `\`#${ChatConfiguration.CollapseCompletedResponses}#\``),
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
		markdownDescription: localize('chat.experimental.persistentProgressVerbosity', "Control tool call details when {0} is enabled. Compact is the default and collapses tool groups in place when thinking or response text resumes, or the response finishes. When Agent Host activity data is available, headers summarize up to three activity groups, prioritizing edits and commands, without language model requests. Remaining activity is counted as other steps. Failed, skipped, denied, and unfinished tool invocations remain explicit, including in the other-steps count. Completed shell invocations count as commands without tracking later background process status. Groups with no recognized activity or outcome use a step count. Expand a summary to inspect all its tool calls. Has no effect when persistent progress is Off. Changes apply immediately.", `\`#${ChatConfiguration.PersistentProgress}#\``),
		tags: ['experimental'],
		experiment: { mode: 'auto' },
	},
} satisfies Record<string, IConfigurationPropertySchema>;

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration).registerConfigurationMigrations([{
	key: ChatConfiguration.PersistentProgress,
	migrateFn: value => ['weave', 'orbit', 'accordion', 'dial', 'ribbon'].includes(value) ? { value: ChatProgressAnimation.Draw } : [],
}, {
	key: ChatConfiguration.PersistentProgressVerbosity,
	migrateFn: value => value === 'notVerbose' ? { value: ChatProgressVerbosity.Compact } : [],
}]);
