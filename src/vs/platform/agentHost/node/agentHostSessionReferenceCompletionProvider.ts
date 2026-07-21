/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../base/common/cancellation.js';
import { AgentSession, type AgentProvider, type IAgentSessionMetadata } from '../common/agentService.js';
import { toSessionReferenceAttachmentMeta } from '../common/meta/agentSessionReferenceMeta.js';
import { SESSION_REFERENCE_DISPLAY_DATE_META_KEY } from '../common/meta/agentCompletionAttachmentMeta.js';
import { CompletionItem, CompletionItemKind, CompletionsParams } from '../common/state/protocol/commands.js';
import { MessageAttachmentKind } from '../common/state/protocol/state.js';
import { CompletionTriggerCharacter, IAgentHostCompletionItemProvider } from './agentHostCompletions.js';
import { extractAtToken, isSessionReferenceToken, SESSION_TOKEN } from './agentHostCompletionTokens.js';

/**
 * Provides `#session` completions for a harness — one item per other session of
 * the same provider on this host. Accepting an item inserts an inline
 * `#session:<title>` reference and attaches the referenced session as context;
 * the harness resolves it to the session's log at send time (see the built-in
 * `/troubleshoot` skill).
 *
 * Harness-agnostic: a harness registers one instance with its own provider id
 * and a `listSessions` accessor. Runs in the agent host so the capability is
 * identical across every client (workbench chat, Agents window) and works
 * standalone/remote — the host owns the session list and the logs. Only fires
 * for the owning provider's sessions once the user starts typing `#session`.
 */
export class AgentHostSessionReferenceCompletionProvider implements IAgentHostCompletionItemProvider {
	readonly kinds: ReadonlySet<CompletionItemKind> = new Set([CompletionItemKind.UserMessage]);
	readonly triggerCharacters = [CompletionTriggerCharacter.Hash] as const;

	/**
	 * How long a resolved session list is reused before it is re-fetched. The
	 * `#`-token completion path re-queries the host on every keystroke (see
	 * `AgentHostInputCompletionsBase`), which would otherwise call
	 * {@link _listSessions} - a client round-trip plus per-session metadata
	 * reads - once per character. The list changes rarely relative to typing
	 * speed, so a brief cache collapses a burst of keystrokes into one call
	 * while staying fresh enough for the picker.
	 */
	private static readonly _sessionsCacheTtlMs = 2500;

	/**
	 * Cached session list scoped to this instance (one per {@link IAgent}, so
	 * per host - a local and a remote agent never share this). `settled` gates
	 * TTL expiry: an in-flight fetch is always reused (dedupe), and the TTL is
	 * measured from when the fetch resolved.
	 */
	private _sessionsCache?: { at: number; readonly value: Promise<readonly IAgentSessionMetadata[]>; settled: boolean };

	constructor(
		private readonly _providerId: AgentProvider,
		private readonly _listSessions: () => Promise<readonly IAgentSessionMetadata[]>,
		private readonly _now: () => number = () => Date.now(),
	) { }

	async provideCompletionItems(params: CompletionsParams, token: CancellationToken): Promise<readonly CompletionItem[]> {
		if (AgentSession.provider(params.channel) !== this._providerId) {
			return [];
		}
		const at = extractAtToken(params.text, params.offset);
		if (!at || at.triggerChar !== CompletionTriggerCharacter.Hash) {
			return [];
		}
		// Participate once the token is heading toward `#session` — any non-empty
		// prefix of `session` (so items appear as soon as `#s` is typed) or the
		// full `#session:<filter>`. A bare `#` is left to the file-reference
		// provider so we don't pollute it with the whole session list.
		if (!isSessionReferenceToken(at.token)) {
			return [];
		}

		const sessions = await this._listSessionsCached();
		if (token.isCancellationRequested) {
			return [];
		}

		const currentId = AgentSession.id(params.channel);
		return sessions
			.filter(session => AgentSession.id(session.session) !== currentId)
			.sort((a, b) => b.modifiedTime - a.modifiedTime)
			.map(session => this._toCompletionItem(session, at.rangeStart, at.rangeEnd));
	}

	/**
	 * Fetches the session list, reusing an in-flight fetch or a resolved result
	 * within {@link _sessionsCacheTtlMs}. A rejected fetch is not cached, so the
	 * next keystroke retries.
	 */
	private _listSessionsCached(): Promise<readonly IAgentSessionMetadata[]> {
		const cache = this._sessionsCache;
		if (cache && (!cache.settled || this._now() - cache.at < AgentHostSessionReferenceCompletionProvider._sessionsCacheTtlMs)) {
			return cache.value;
		}
		const value = this._listSessions();
		const entry: { at: number; readonly value: Promise<readonly IAgentSessionMetadata[]>; settled: boolean } = { at: this._now(), value, settled: false };
		this._sessionsCache = entry;
		value.then(
			() => { entry.at = this._now(); entry.settled = true; },
			() => { if (this._sessionsCache === entry) { this._sessionsCache = undefined; } },
		);
		return value;
	}

	private _toCompletionItem(session: IAgentSessionMetadata, rangeStart: number, rangeEnd: number): CompletionItem {
		// Collapse whitespace so the inline `#session:<title>` reference stays on
		// one line even when the title contains newlines.
		const title = (session.summary ?? '').replace(/\s+/g, ' ').trim() || 'Untitled session';
		const insertText = `${CompletionTriggerCharacter.Hash}${SESSION_TOKEN}:${title} `;
		return {
			insertText,
			rangeStart,
			rangeEnd,
			attachment: {
				type: MessageAttachmentKind.Simple,
				label: title,
				displayKind: 'sessionReference',
				modelRepresentation: `Referenced chat session: ${title}`,
				_meta: {
					...toSessionReferenceAttachmentMeta({
						sessionResource: session.session.toString(),
						sessionID: AgentSession.id(session.session),
					}),
					// Display-only: shown as the completion's description (like the
					// local session picker), ignored by send-time resolution.
					[SESSION_REFERENCE_DISPLAY_DATE_META_KEY]: new Date(session.modifiedTime).toLocaleString(),
				},
			},
		};
	}
}
