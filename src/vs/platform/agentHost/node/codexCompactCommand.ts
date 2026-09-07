/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { localize } from '../../../nls.js';
import { AgentSession, CODEX_AGENT_PROVIDER_ID } from '../common/agent.js';
import { toCommandCompletionAttachmentMeta } from '../common/meta/agentCompletionAttachmentMeta.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import type { URI } from '../common/state/protocol/common/state.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { extractLeadingSlashToken, matchesSlashCompletion } from './agentHostSlashCompletion.js';

export const CODEX_COMPACT_SLASH_COMMAND = 'compact';

export class CodexCompactCompletionProvider implements IAgentHostCompletionItemProvider {
	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Slash] as const;

	constructor(private readonly _hasHistory: (session: URI) => boolean) { }

	async provideCompletionItems(params: CompletionsParams, _token: CancellationToken): Promise<readonly CompletionItem[]> {
		if (AgentSession.provider(params.channel) !== CODEX_AGENT_PROVIDER_ID || !this._hasHistory(params.channel)) {
			return [];
		}
		const leading = extractLeadingSlashToken(params.text, params.offset);
		if (!leading || !matchesSlashCompletion(leading.typed, CODEX_COMPACT_SLASH_COMMAND)) {
			return [];
		}
		return [{
			insertText: `/${CODEX_COMPACT_SLASH_COMMAND} `,
			rangeStart: leading.rangeStart,
			rangeEnd: leading.rangeEnd,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: `/${CODEX_COMPACT_SLASH_COMMAND}`,
				_meta: toCommandCompletionAttachmentMeta({
					command: CODEX_COMPACT_SLASH_COMMAND,
					description: localize('codex.compact.description', "Compact this conversation's context"),
				}),
			},
		}];
	}
}
