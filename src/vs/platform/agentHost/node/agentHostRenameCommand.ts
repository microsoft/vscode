/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { localize } from '../../../nls.js';
import type { URI } from '../common/state/protocol/common/state.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { extractLeadingSlashToken } from './agentHostSlashCompletion.js';

/** The generic, agent-agnostic `/rename` slash command name. */
export const RENAME_SLASH_COMMAND = 'rename';

/**
 * Parses a leading `/rename [title]` command at the very start of `prompt`.
 *
 * Mirrors `parseLeadingSlashCommand` (the Copilot CLI slash parser): the
 * command must be `/rename`, followed either by end-of-input or at least one
 * whitespace character. `/renamed`, `/rename-foo`, or a leading-space
 * `/rename` all return `undefined`. Match is case-sensitive.
 *
 * Returns the trimmed new title (possibly an empty string when no title is
 * supplied) when the prompt is a rename command, or `undefined` when it is not.
 * Callers MUST distinguish "not a rename command" (`undefined`) from "rename
 * with empty title" (`''`).
 */
export function parseRenameCommand(prompt: string): string | undefined {
	const match = /^\/rename(?:$|\s+([\s\S]*))/.exec(prompt);
	if (!match) {
		return undefined;
	}
	return (match[1] ?? '').trim();
}

/**
 * Generic completion provider that contributes the `/rename` slash command
 * for every agent-host session type. Unlike agent-specific slash commands
 * (e.g. Copilot's `/compact`), `/rename` is not forwarded to any agent SDK;
 * it is intercepted in the agent-host send path and redirected to a
 * `SessionTitleChanged` action (see the rename handling in `AgentSideEffects`).
 *
 * The completion is only offered for sessions that already have history —
 * renaming a session before the first turn has no meaningful target.
 */
export class AgentHostRenameCompletionProvider implements IAgentHostCompletionItemProvider {
	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	constructor(private readonly _hasHistory: (session: URI) => boolean) { }

	async provideCompletionItems(params: CompletionsParams, _token: CancellationToken): Promise<readonly CompletionItem[]> {
		const leading = extractLeadingSlashToken(params.text, params.offset);
		if (!leading) {
			return [];
		}
		if (!this._hasHistory(params.channel)) {
			return [];
		}
		// `/abc` → typed = 'abc'; empty after just '/' → typed = ''.
		const typed = leading.typed;
		if (typed.length > 0 && !RENAME_SLASH_COMMAND.startsWith(typed)) {
			return [];
		}
		return [{
			insertText: '/' + RENAME_SLASH_COMMAND + ' ',
			rangeStart: leading.rangeStart,
			rangeEnd: leading.rangeEnd,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: '/' + RENAME_SLASH_COMMAND,
				_meta: {
					command: RENAME_SLASH_COMMAND,
					description: localize('agentHostSlashCommand.rename.description', "Rename this chat"),
				},
			},
		}];
	}
}
