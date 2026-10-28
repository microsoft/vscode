/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { IConfigurationPropertySchema } from '../../../../platform/configuration/common/configurationRegistry.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { ConfigurationKeyValuePairs, ConfigurationMigration, Extensions, IConfigurationMigrationRegistry } from '../../../common/configuration.js';
import { ChatConfiguration, ChatProgressAnimation, ChatProgressVerbosity } from '../common/constants.js';

const legacyPersistentProgressSetting = 'chat.experimental.persistentProgress';
const legacyPersistentProgressVerbositySetting = 'chat.experimental.persistentProgressVerbosity';

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
		markdownDescription: localize('chat.experimental.persistentProgress', "Keep a working progress indicator at the bottom until the response finishes, with a colored or monochrome Draw animation, or without an icon. The indicator reports running subagents and background commands from the current or earlier requests, even while the main response progresses. The default is Draw in all versions of VS Code. Experiments can override the default; an explicit setting takes precedence. Tool calls follow {0}. Except in Conversation mode, reasoning is separated into collapsible previews that break the tool chain. Standalone tools retain their icons. Completed responses still follow {1}. This replaces inner working progress; terminal activity animations and rich subagent pills are unchanged. Changes apply immediately; reduced motion keeps the indicator visible without animation.", `\`#${ChatConfiguration.PersistentProgressVerbosity}#\``, `\`#${ChatConfiguration.CollapseCompletedResponses}#\``),
		tags: ['experimental'],
		experiment: { mode: 'auto', name: `config.${legacyPersistentProgressSetting}` },
	},
	[ChatConfiguration.PersistentProgressVerbosity]: {
		type: 'string',
		default: ChatProgressVerbosity.Compact,
		enum: Object.values(ChatProgressVerbosity),
		enumItemLabels: [
			localize('chat.progressVerbosity.verbose.label', "Verbose"),
			localize('chat.progressVerbosity.compact.label', "Compact"),
			localize('chat.progressVerbosity.conversation.label', "Conversation"),
		],
		enumDescriptions: [
			localize('chat.progressVerbosity.verbose', "Keep tool calls in expanded, headerless chains without an internal scrolling limit."),
			localize('chat.progressVerbosity.compact', "Preview tool calls while they run, then collapse each group to a single expandable summary row when the response moves on."),
			localize('chat.progressVerbosity.conversation', "Collapse reasoning and tool calls together into a single section that names the current tool call or reasoning heading while it runs, then shows a generated summary or Finished thinking once it finishes."),
		],
		markdownDescription: localize('chat.experimental.persistentProgressVerbosity', "Control tool call details when {0} is enabled. Compact is the default and collapses tool groups in place when thinking or response text resumes, or the response finishes. When Agent Host activity data is available, headers summarize up to three activity groups, prioritizing edits and commands, without language model requests. Remaining activity is counted as other steps. Failed, skipped, denied, and unfinished tool invocations remain explicit, including in the other-steps count. Completed shell invocations count as commands without tracking later background process status. Groups with no recognized activity or outcome use a step count. Expand a summary to inspect all its tool calls. Conversation collapses reasoning and tool calls between response text into one section that starts collapsed, names the current tool call, or the heading of the current reasoning summary (Thinking when the reasoning has no heading), while it runs, and shows a generated summary or Finished thinking once it finishes. Has no effect when persistent progress is Off. Changes apply immediately.", `\`#${ChatConfiguration.PersistentProgress}#\``),
		tags: ['experimental'],
		experiment: { mode: 'auto', name: `config.${legacyPersistentProgressVerbositySetting}` },
	},
} satisfies Record<string, IConfigurationPropertySchema>;

const legacyThinkingDeprecationMessage = localize('chat.agent.thinking.deprecation', "This setting will be deprecated in a future release. Use {0} and {1} to control thinking and progress presentation instead.", `\`#${ChatConfiguration.PersistentProgress}#\``, `\`#${ChatConfiguration.PersistentProgressVerbosity}#\``);

export const legacyChatThinkingConfigurationProperties = {
	[ChatConfiguration.ThinkingStyle]: {
		type: 'string',
		default: 'fixedScrolling',
		enum: ['collapsed', 'collapsedPreview', 'fixedScrolling'],
		enumDescriptions: [
			localize('chat.agent.thinkingMode.collapsed', "Thinking parts will be collapsed by default."),
			localize('chat.agent.thinkingMode.collapsedPreview', "Thinking parts will be expanded first, then collapse once we reach a part that is not thinking."),
			localize('chat.agent.thinkingMode.fixedScrolling', "Show thinking in a fixed-height streaming panel that auto-scrolls; click header to expand to full height."),
		],
		description: localize('chat.agent.thinkingStyle', "Controls how thinking is rendered. Read-only chats always use the collapsed preview style."),
		markdownDeprecationMessage: legacyThinkingDeprecationMessage,
		tags: ['experimental'],
	},
	[ChatConfiguration.ThinkingGenerateTitles]: {
		type: 'boolean',
		default: true,
		description: localize('chat.agent.thinking.generateTitles', "Generate a summary only when a live thinking section finishes with its header in view. A single extracted reasoning heading is used directly without a model request; multiple headings are used as summary input. Opening a chat, returning to it, scrolling or expanding existing sections never generates titles. Sections that finish off-screen or in background chats keep their existing title or Finished thinking."),
		tags: ['experimental'],
	},
	'chat.agent.thinking.collapsedTools': {
		type: 'string',
		default: 'always',
		enum: ['off', 'withThinking', 'always'],
		enumDescriptions: [
			localize('chat.agent.thinking.collapsedTools.off', "Tool calls are shown separately, not collapsed into thinking."),
			localize('chat.agent.thinking.collapsedTools.withThinking', "Tool calls are collapsed into thinking sections when thinking is present."),
			localize('chat.agent.thinking.collapsedTools.always', "Tool calls are always collapsed, even without thinking."),
		],
		markdownDescription: localize('chat.agent.thinking.collapsedTools', "Controls how tool calls are displayed in relation to thinking sections."),
		markdownDeprecationMessage: legacyThinkingDeprecationMessage,
		tags: ['experimental'],
	},
	[ChatConfiguration.TerminalToolsInThinking]: {
		type: 'boolean',
		default: true,
		markdownDescription: localize('chat.agent.thinking.terminalTools', "When enabled, terminal tool calls are displayed inside the thinking dropdown with a simplified view."),
		markdownDeprecationMessage: legacyThinkingDeprecationMessage,
		tags: ['experimental'],
	},
	[ChatConfiguration.ThinkingPhrases]: {
		type: 'object',
		default: {
			mode: 'append',
			phrases: []
		},
		properties: {
			mode: {
				type: 'string',
				enum: ['replace', 'append'],
				default: 'append',
				description: localize('chat.agent.thinking.phrases.mode', "'replace' replaces all default phrases entirely; 'append' adds your phrases to all default categories.")
			},
			phrases: {
				type: 'array',
				items: { type: 'string' },
				default: [],
				description: localize('chat.agent.thinking.phrases.phrases', "Custom loading messages to show during thinking, working progress, terminal, and tool operations.")
			}
		},
		additionalProperties: false,
		markdownDescription: localize('chat.agent.thinking.phrases', "Customize the loading messages shown during agent thinking and progress indicators. Use `\"mode\": \"replace\"` to use only your phrases, or `\"mode\": \"append\"` to add them to the defaults."),
		markdownDeprecationMessage: legacyThinkingDeprecationMessage,
		tags: ['experimental'],
	},
} satisfies Record<string, IConfigurationPropertySchema>;

Registry.as<IConfigurationMigrationRegistry>(Extensions.ConfigurationMigration).registerConfigurationMigrations([
	{
		key: ChatConfiguration.PersistentProgress,
		legacyKey: legacyPersistentProgressSetting,
		migrate: (value: unknown) => typeof value === 'string' && ['weave', 'orbit', 'accordion', 'dial', 'ribbon'].includes(value) ? ChatProgressAnimation.Draw : value,
	},
	{
		key: ChatConfiguration.PersistentProgressVerbosity,
		legacyKey: legacyPersistentProgressVerbositySetting,
		migrate: (value: unknown) => value === 'notVerbose' ? ChatProgressVerbosity.Compact : value,
	},
].flatMap<ConfigurationMigration>(({ key, legacyKey, migrate }) => [{
	key: legacyKey,
	includeApplication: true,
	migrateFn: (value, accessor) => {
		if (value === undefined) {
			return [];
		}
		const pairs: ConfigurationKeyValuePairs = [[legacyKey, { value: undefined }]];
		if (accessor(key) === undefined) {
			pairs.push([key, { value: migrate(value) }]);
		}
		return pairs;
	},
}, {
	key,
	includeApplication: true,
	migrateFn: value => {
		const migrated = migrate(value);
		return migrated === value ? [] : { value: migrated };
	},
}]));
