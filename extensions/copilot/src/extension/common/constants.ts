/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ChatLocation } from '../../platform/chat/common/commonTypes';

export const enum Intent {
	Explain = 'explain',
	Review = 'review',
	Tests = 'tests',
	Fix = 'fix',
	New = 'new',
	NewNotebook = 'newNotebook',
	notebookEditor = 'notebookEditor',
	InlineChat = 'inlineChat',
	Search = 'search',
	SemanticSearch = 'semanticSearch',
	Terminal = 'terminal',
	TerminalExplain = 'terminalExplain',
	VSCode = 'vscode',
	Unknown = 'unknown',
	SetupTests = 'setupTests',
	Editor = 'editor',
	Doc = 'doc',
	Edit = 'edit',
	Agent = 'editAgent',
	Generate = 'generate',
	SearchPanel = 'searchPanel',
	SearchKeywords = 'searchKeywords',
	AskAgent = 'askAgent',
}

export const GITHUB_PLATFORM_AGENT = 'github.copilot-dynamic.platform';

// TODO@jrieken THIS IS WEIRD. We should read this from package.json
export const agentsToCommands: Partial<Record<Intent, Record<string, Intent>>> = {
	[Intent.Agent]: {
		'explain': Intent.Explain,
		'edit': Intent.Edit,
		'review': Intent.Review,
		'tests': Intent.Tests,
		'fix': Intent.Fix,
		'new': Intent.New,
		'newNotebook': Intent.NewNotebook,
		'semanticSearch': Intent.SemanticSearch,
		'setupTests': Intent.SetupTests,
		'compact': Intent.Agent,
	},
	[Intent.VSCode]: {
		'search': Intent.Search,
	},
	[Intent.Terminal]: {
		'explain': Intent.TerminalExplain
	},
	[Intent.Editor]: {
		'doc': Intent.Doc,
		'fix': Intent.Fix,
		'explain': Intent.Explain,
		'review': Intent.Review,
		'tests': Intent.Tests,
		'edit': Intent.Edit,
		'generate': Intent.Generate
	}
};

// TODO@roblourens gotta tighten up the terminology of "commands", "intents", etc...
export function getAgentForIntent(intentId: Intent, location: ChatLocation): { agent: string; command?: string } | undefined {
	if (Object.keys(agentsToCommands).includes(intentId)) {
		return { agent: intentId };
	}

	for (const [agent, commands] of Object.entries(agentsToCommands)) {
		if (location === ChatLocation.Editor && agent !== Intent.Editor) {
			continue;
		}

		if (Object.values(commands).includes(intentId)) {
			return { agent, command: intentId };
		}
	}
}

export const EXTENSION_ID = 'GitHub.copilot-chat';
