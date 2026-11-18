/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IObservable } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { AMBIENT_AGENT_HOST_AUTHORITY, IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { buildOpenSessionLinkUri, parseOpenSessionLinkChatId, parseOpenSessionLinkConnectionAuthority, parseOpenSessionLinkTurnId, parseOpenSessionLinkUri } from '../../../../../platform/agentHost/common/openSessionLink.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';

/** The most entries the history keeps; recording beyond it drops the oldest. */
export const MAX_CHAT_REQUEST_HISTORY_ENTRIES = 1000;

/** The longest prompt text an entry keeps; longer prompts are stored truncated. */
export const MAX_CHAT_REQUEST_HISTORY_PROMPT_LENGTH = 10_000;

/**
 * A chat request sent from this machine, whichever Agent Host handled it.
 *
 * Only the prompt text, when it was sent and a link back are kept, with a small display snapshot so results stay
 * readable while their host is offline. Responses and attached context are never stored.
 */
export interface IChatRequestHistoryEntry {
	readonly id: string;
	/** The request text as the user sent it, truncated to {@link MAX_CHAT_REQUEST_HISTORY_PROMPT_LENGTH}. */
	readonly prompt: string;
	/** When the request was sent, in milliseconds since the epoch. */
	readonly timestamp: number;
	/** The portable `agent-host-session://` link that opens the chat and reveals the request through its `turn=`. */
	readonly link: string;
	/** The chat resource the request was sent in on this machine, to follow the chat's deletion and moves. */
	readonly chatResource: string;
	/** The chat's title when the request was sent, or as it was last seen. */
	readonly title?: string;
	/** The label of the Agent Host that handled the request. */
	readonly host?: string;
	/**
	 * The remote authority of the window whose own agent host handled the request, when that window was connected to a
	 * remote. Such a link names that window's agent host only as the window's host, so it opens only in a window with the
	 * same remote authority.
	 */
	readonly remoteAuthority?: string;
}

/** An entry to record, before the history assigns its ID. */
export type IChatRequestHistoryRecord = Omit<IChatRequestHistoryEntry, 'id'>;

/** The parts of an entry that change as its chat is renamed, moved or replaced. */
export type IChatRequestHistoryEntryUpdate = Partial<Pick<IChatRequestHistoryEntry, 'link' | 'chatResource' | 'title'>>;

export interface IChatRequestHistorySearchOptions {
	/** The most results to return. */
	readonly limit?: number;
	/** Only requests sent at or after this time, in milliseconds since the epoch. */
	readonly since?: number;
}

export const IChatRequestHistoryService = createDecorator<IChatRequestHistoryService>('chatRequestHistoryService');

/**
 * The per-machine history of chat requests the user sent, shared by all windows and never synced.
 *
 * The history is available while `chat.requestHistory.enabled` is on and AI features are not disabled. While it is
 * unavailable nothing is recorded or returned, but recorded entries are kept until the user clears them.
 */
export interface IChatRequestHistoryService {
	readonly _serviceBrand: undefined;

	/** Whether the history records and returns requests in this window. */
	readonly enabled: IObservable<boolean>;

	/** Every entry, newest first, including those other windows record. Empty while the history is unavailable. */
	readonly entries: IObservable<readonly IChatRequestHistoryEntry[]>;

	/** Records a request; a request already recorded under the same link is replaced. Does nothing while unavailable. */
	record(record: IChatRequestHistoryRecord): void;

	/** Applies the update `select` returns to each entry it returns one for. */
	update(select: (entry: IChatRequestHistoryEntry) => IChatRequestHistoryEntryUpdate | undefined): void;

	/** Removes the entries `select` picks. */
	remove(select: (entry: IChatRequestHistoryEntry) => boolean): void;

	/** Removes every entry. */
	clear(): void;

	/** The entries matching `query`, newest first. An empty query matches every entry. */
	search(query: string, options?: IChatRequestHistorySearchOptions): readonly IChatRequestHistoryEntry[];
}

/**
 * The entries whose prompt, title or host contain every whitespace-separated term of `query`, ignoring case, newest
 * first.
 */
export function searchChatRequestHistory(entries: readonly IChatRequestHistoryEntry[], query: string, options?: IChatRequestHistorySearchOptions): IChatRequestHistoryEntry[] {
	const terms = query.toLocaleLowerCase().split(/\s+/).filter(term => term.length > 0);
	const results: IChatRequestHistoryEntry[] = [];
	for (const entry of [...entries].sort((a, b) => b.timestamp - a.timestamp)) {
		if (options?.since !== undefined && entry.timestamp < options.since) {
			continue;
		}
		const haystack = `${entry.prompt}\n${entry.title ?? ''}\n${entry.host ?? ''}`.toLocaleLowerCase();
		if (terms.every(term => haystack.includes(term))) {
			results.push(entry);
			if (options?.limit !== undefined && results.length >= options.limit) {
				break;
			}
		}
	}
	return results;
}

/** The chat a link opens: its backend session, its host's connection authority, and its chat ID, absent for the default chat. */
export interface IChatRequestHistoryLinkTarget {
	readonly backendSession: URI;
	readonly connectionAuthority: string | undefined;
	readonly chatId: string | undefined;
}

export function getChatRequestHistoryLinkTarget(link: string): IChatRequestHistoryLinkTarget | undefined {
	const backendSession = parseOpenSessionLinkUri(link);
	return backendSession && {
		backendSession,
		connectionAuthority: parseOpenSessionLinkConnectionAuthority(link),
		chatId: parseOpenSessionLinkChatId(link),
	};
}

/** The link to the same request once its chat is `target`, as after the chat moved to another session. */
export function retargetChatRequestHistoryLink(link: string, target: IChatRequestHistoryLinkTarget): string {
	return buildOpenSessionLinkUri(target.backendSession, target.chatId, parseOpenSessionLinkTurnId(link), target.connectionAuthority);
}

/** Whether `link` opens a chat of `target`'s session and, for the `chat` scope, `target`'s chat. */
export function chatRequestHistoryLinkMatches(link: string, target: IChatRequestHistoryLinkTarget, scope: 'chat' | 'session'): boolean {
	const linked = getChatRequestHistoryLinkTarget(link);
	return !!linked
		&& linked.backendSession.toString() === target.backendSession.toString()
		&& (linked.connectionAuthority === undefined || target.connectionAuthority === undefined || linked.connectionAuthority === target.connectionAuthority)
		&& (scope === 'session' || linked.chatId === target.chatId);
}

/**
 * Whether the link of `entry` opens its request in a window with the remote authority `windowRemoteAuthority`. A request
 * a window's own agent host handled is linked to that window's host, which another window connected elsewhere does not
 * have; requests on other hosts open from any window connected to their host.
 */
export function canOpenChatRequestHistoryEntryIn(entry: IChatRequestHistoryEntry, windowRemoteAuthority: string | undefined): boolean {
	const connectionAuthority = parseOpenSessionLinkConnectionAuthority(entry.link);
	return connectionAuthority !== undefined && connectionAuthority !== AMBIENT_AGENT_HOST_AUTHORITY
		|| entry.remoteAuthority === windowRemoteAuthority;
}

/** The chat a link to the client chat `chatResource` opens, from its session's backend identity. */
export function getChatRequestHistoryLinkTargetOf(chatResource: URI, connectionsService: IAgentHostConnectionsService): IChatRequestHistoryLinkTarget | undefined {
	const identity = connectionsService.resolveSessionResourceIdentity(chatResource.with({ fragment: '' }));
	return identity && {
		backendSession: identity.backendSession,
		connectionAuthority: identity.connectionAuthority,
		chatId: chatResource.fragment || undefined,
	};
}

/**
 * Picks the entries of the client chat `chatResource` or, for the `session` scope, of every chat of its session: those
 * recorded under its resource, and those whose link opens it in a window with `windowRemoteAuthority`, which another
 * window may have recorded under its own resource for the chat.
 */
export function createChatRequestHistoryChatMatcher(chatResource: URI, scope: 'chat' | 'session', connectionsService: IAgentHostConnectionsService, windowRemoteAuthority: string | undefined): (entry: IChatRequestHistoryEntry) => boolean {
	const session = chatResource.with({ fragment: '' }).toString();
	const target = getChatRequestHistoryLinkTargetOf(chatResource, connectionsService);
	return entry => (scope === 'chat' ? entry.chatResource === chatResource.toString() : URI.parse(entry.chatResource).with({ fragment: '' }).toString() === session)
		|| !!target && canOpenChatRequestHistoryEntryIn(entry, windowRemoteAuthority) && chatRequestHistoryLinkMatches(entry.link, target, scope);
}
