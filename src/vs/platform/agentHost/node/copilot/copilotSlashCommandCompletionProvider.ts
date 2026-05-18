/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { localize } from '../../../../nls.js';
import { AgentSession } from '../../common/agentService.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../../common/state/protocol/state.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from '../agentHostCompletions.js';
import { extractLeadingSlashToken } from '../agentHostSlashCompletion.js';

/**
 * Slash-command name and the token we surface to the user / round-trip on
 * the {@link MessageAttachmentKind.Simple} attachment's `_meta`.
 */
export type CopilotSlashCommandName = 'plan' | 'compact';

const COMMANDS: readonly CopilotSlashCommandName[] = ['plan', 'compact'];
function getCommandDescription(command: CopilotSlashCommandName): string {
	switch (command) {
		case 'plan': return localize('copilotSlashCommand.plan.description', "Create an implementation plan before coding");
		case 'compact': return localize('copilotSlashCommand.compact.description', "Free up context by compacting the conversation history");
	}
}
/**
 * Lookup hook used by {@link CopilotSlashCommandCompletionProvider} to
 * decide whether history-dependent commands (e.g. `/compact`) make sense
 * for a given session. Sessions that haven't been materialized yet — i.e.
 * the user hasn't sent a first message — have no history.
 */
export interface ICopilotSlashCommandSessionInfo {
	/** `sessionId` is the raw id (URI path without the leading slash). */
	hasHistory(sessionId: string): boolean;
}

/**
 * Result of {@link parseLeadingSlashCommand}.
 */
export interface IParsedLeadingSlashCommand {
	readonly command: CopilotSlashCommandName;
	/** Trimmed text following the command (empty if none). */
	readonly rest: string;
}

/**
 * Parses a Copilot CLI slash command at the very start of `prompt`.
 *
 * The command must be `/plan` or `/compact`, followed either by end-of-input
 * or by at least one whitespace character. `/compact-hello`, `/plans`, or a
 * leading-space `/compact` all return `undefined`. Match is case-sensitive.
 */
export function parseLeadingSlashCommand(prompt: string): IParsedLeadingSlashCommand | undefined {
	const match = /^\/(plan|compact)(?:$|\s+([\s\S]*))/.exec(prompt);
	if (!match) {
		return undefined;
	}
	return {
		command: match[1] as CopilotSlashCommandName,
		rest: (match[2] ?? '').trim(),
	};
}

/**
 * Completion provider for Copilot CLI slash commands. Only fires for
 * sessions whose URI scheme is `copilotcli` and only when the input begins
 * with `/`.
 *
 * The returned items carry a {@link MessageAttachmentKind.Simple}
 * attachment, which the workbench bridge maps into command/skill completion
 * attachments. Command dispatch happens text-side in
 * `CopilotAgentSession.send` via {@link parseLeadingSlashCommand}, so the
 * feature works whether the user picks the item or types it manually.
 */
export class CopilotSlashCommandCompletionProvider implements IAgentHostCompletionItemProvider {
	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	constructor(private readonly copilotcliId: string, private readonly _sessionInfo?: ICopilotSlashCommandSessionInfo) { }

	async provideCompletionItems(params: CompletionsParams, _token: CancellationToken): Promise<readonly CompletionItem[]> {
		if (AgentSession.provider(params.session) !== this.copilotcliId) {
			return [];
		}
		const leading = extractLeadingSlashToken(params.text, params.offset);
		if (!leading) {
			return [];
		}

		// Raw session id is the URI path without the leading slash.
		const sessionId = AgentSession.id(params.session);
		const hasHistory = this._sessionInfo?.hasHistory(sessionId) ?? true;

		// `/abc` → typed = 'abc'; empty after just '/' → typed = ''.
		const typed = leading.typed;
		const items: CompletionItem[] = [];
		for (const command of COMMANDS) {
			if (typed.length > 0 && !command.startsWith(typed)) {
				continue;
			}
			// `/compact` only makes sense once the session has prior turns to compact.
			if (command === 'compact' && !hasHistory) {
				continue;
			}
			if (command === 'compact') {
				// Disabled for now, untill we fix this.
				continue;
			}
			items.push({
				insertText: command === 'plan' ? '/' + command + ' ' : '/' + command,
				rangeStart: 0,
				rangeEnd: leading.rangeEnd,
				attachment: {
					type: MessageAttachmentKind.Simple,
					label: '/' + command,
					_meta: { command, description: getCommandDescription(command) },
				},
			});
		}
		return items;
	}
}
