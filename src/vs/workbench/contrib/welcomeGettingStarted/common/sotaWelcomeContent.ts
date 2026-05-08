/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Son of Anton fork-specific welcome content. Lives next to the upstream
// gettingStartedContent.ts so the upstream file can be rebased without losing
// the SOTA walkthroughs. The contribution wires this in alongside (and ahead
// of) the upstream walkthrough definitions.

import { localize } from '../../../../nls.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
// Type-only import to avoid a circular value cycle: gettingStartedContent.ts
// pulls `sotaWalkthroughs` back in at the bottom of its module evaluation.
import type { BuiltinGettingStartedCategory } from './gettingStartedContent.js';

const sotaWelcomeIcon = registerIcon(
	'getting-started-sota-welcome',
	Codicon.sparkle,
	localize('getting-started-sota-welcome-icon', 'Icon used for the Son of Anton welcome walkthrough'),
);

const sotaEasterEggIcon = registerIcon(
	'getting-started-sota-easter-egg',
	Codicon.heart,
	localize('getting-started-sota-easter-egg-icon', 'Icon used for the Son of Anton easter egg walkthrough'),
);

const linkButton = (title: string, href: string): string => `[${title}](${href})`;

/**
 * The primary "Welcome to Son of Anton" walkthrough. Replaces the upstream
 * Setup walkthrough on first launch by virtue of being featured and listed
 * first in {@link sotaWalkthroughs}.
 */
const SotaWelcomeWalkthrough: BuiltinGettingStartedCategory = {
	id: 'SotaWelcome',
	title: localize('sota.welcome.title', 'Welcome to Son of Anton'),
	description: localize(
		'sota.welcome.description',
		'AI-native code editor with Claude orchestration, code graph context, and a multi-agent dispatch system.',
	),
	isFeatured: true,
	icon: sotaWelcomeIcon,
	walkthroughPageTitle: localize('sota.welcome.walkthroughPageTitle', 'Welcome to Son of Anton'),
	content: {
		type: 'steps',
		steps: [
			{
				id: 'sota.welcome.banner',
				title: localize('sota.welcome.banner.title', 'A different kind of editor'),
				description: localize(
					'sota.welcome.banner.description.interpolated',
					"Son of Anton is a fork of VS Code wired to Claude, a code knowledge graph, and the Model Context Protocol. Start by setting up your AI provider so Anton can do real work for you.\n{0}",
					linkButton(
						localize('sota.welcome.banner.button', 'Open Setup Wizard'),
						'command:sota.openSetupWizard',
					),
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
			{
				id: 'sota.welcome.openChat',
				title: localize('sota.welcome.openChat.title', 'Open the chat sidebar'),
				description: localize(
					'sota.welcome.openChat.description.interpolated',
					"Anton lives in the chat sidebar. Open it from the activity bar, or use the keyboard.\n\nKeyboard shortcut: `Ctrl+L` (Windows/Linux) / `Cmd+L` (macOS).\n{0}",
					linkButton(
						localize('sota.welcome.openChat.button', 'Open Anton Chat'),
						'command:workbench.view.extension.sota-chat',
					),
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
			{
				id: 'sota.welcome.slashCommand',
				title: localize('sota.welcome.slashCommand.title', 'Try a slash command'),
				description: localize(
					'sota.welcome.slashCommand.description',
					"In the chat input, slash commands give you direct access to Anton's machinery:\n- `/help` lists every available command.\n- `/specialist` dispatches to a focused sub-agent (review, refactor, tests, exploration).\n- `/agents` shows the live status of every agent currently working on your behalf.",
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
			{
				id: 'sota.welcome.mcp',
				title: localize('sota.welcome.mcp.title', 'Configure MCP servers'),
				description: localize(
					'sota.welcome.mcp.description.interpolated',
					"Anton uses the Model Context Protocol to expose tools (graph queries, vector search, workspace files) to the LLM. Wire up extra MCP servers in your settings under `sota.mcp.servers`.\n{0}",
					linkButton(
						localize('sota.welcome.mcp.button', 'Open MCP Settings'),
						'command:workbench.action.openSettings?%5B%22sota.mcp.servers%22%5D',
					),
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
			{
				id: 'sota.welcome.mentionFile',
				title: localize('sota.welcome.mentionFile.title', 'Mention a file in chat'),
				description: localize(
					'sota.welcome.mentionFile.description',
					"Type `@` in the chat input to attach context. `@file` pins a specific file, `@workspace` includes a graph-routed slice of the codebase, and `@selection` brings in whatever you have highlighted in the editor.",
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
		],
	},
};

/**
 * Optional secondary walkthrough surfacing fun internals. Not featured so it
 * sits below the welcome card on the walkthrough list.
 */
const SotaEasterEggWalkthrough: BuiltinGettingStartedCategory = {
	id: 'SotaEasterEggs',
	title: localize('sota.easter.title', 'Easter Eggs'),
	description: localize(
		'sota.easter.description',
		'Hidden bits and pieces scattered through Son of Anton. Mostly homages.',
	),
	isFeatured: false,
	icon: sotaEasterEggIcon,
	walkthroughPageTitle: localize('sota.easter.walkthroughPageTitle', 'Son of Anton Easter Eggs'),
	content: {
		type: 'steps',
		steps: [
			{
				id: 'sota.easter.konami',
				title: localize('sota.easter.konami.title', 'Try the Konami code'),
				description: localize(
					'sota.easter.konami.description',
					'With the workbench focused, tap `↑ ↑ ↓ ↓ ← → ← → B A`. We make no promises about what happens next.',
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
			{
				id: 'sota.easter.outputChannel',
				title: localize('sota.easter.outputChannel.title', 'Open the Son of Anton output channel'),
				description: localize(
					'sota.easter.outputChannel.description.interpolated',
					"Anton narrates its work in a dedicated output channel. Useful for debugging, fun for snooping.\n{0}",
					linkButton(
						localize('sota.easter.outputChannel.button', 'Show Output Channel'),
						'command:workbench.action.output.toggleOutput',
					),
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
			{
				id: 'sota.easter.quote',
				title: localize('sota.easter.quote.title', 'Run "Son of Anton: Show Silicon Valley Quote"'),
				description: localize(
					'sota.easter.quote.description.interpolated',
					"From the command palette, summon a randomly chosen Silicon Valley quote. They are deeply unhelpful and that is the point.\n{0}",
					linkButton(
						localize('sota.easter.quote.button', 'Open Command Palette'),
						'command:workbench.action.showCommands',
					),
				),
				media: { type: 'markdown', path: 'sotaWelcomeArt' },
			},
		],
	},
};

/**
 * Walkthroughs surfaced by the fork. The order here matters: featured
 * walkthroughs render first on the welcome page, so SotaWelcome takes
 * precedence over the upstream Setup walkthrough.
 */
export const sotaWalkthroughs: BuiltinGettingStartedCategory[] = [
	SotaWelcomeWalkthrough,
	SotaEasterEggWalkthrough,
];
