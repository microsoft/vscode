/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Replays the AHP frames Mission Control persists for a task back into session and chat state,
// without a live relay connection.
//
// When a sandbox's compute is deleted the relay is gone for good, but Mission Control keeps a mirror
// of every `ActionEnvelope` it relayed, so the history can be rebuilt from
// `GET /agents/tasks/<id>/events`.
//
// Only the transport boundary is decoded here — ordering, chunk integrity, and the minimal envelope
// shape. The envelopes are folded by the same `sessionReducer` / `chatReducer` the live
// subscriptions use, so a replayed session and a live one cannot drift.

import { equals } from '../../../base/common/objects.js';
import { ChunkEnvelope, Reassembler } from './webPubSub/chunking.js';
import { ActionEnvelope, ActionType, StateAction } from './state/protocol/common/actions.js';
import { chatReducer } from './state/protocol/channels-chat/reducer.js';
import { ChatOriginKind, ChatState } from './state/protocol/channels-chat/state.js';
import { sessionReducer } from './state/protocol/channels-session/reducer.js';
import { SessionLifecycle, SessionState, SessionStatus } from './state/protocol/channels-session/state.js';
import { ChatAction, SessionAction } from './state/sessionActions.js';

/** Highest starting sequence allowed for a new mirror epoch after exact duplicates are removed. */
const MAX_RESTART_EPOCH_INITIAL_SEQUENCE = 1;

/** A persisted history that could not be decoded. Distinct from a transport/HTTP failure. */
export class TaskEventReplayError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TaskEventReplayError';
	}
}

/** The replayed state of a single session found in a task's persisted history. */
export interface IReplayedSession {
	/** Session channel URI (`ahp-session:/<uuid>`). */
	readonly session: string;
	/** Folded session-channel state. */
	readonly state: SessionState;
	/** Folded chat-channel state, keyed by chat channel URI. */
	readonly chats: ReadonlyMap<string, ChatState>;
	/**
	 * The host-announced default chat, or a sole recorded chat consistent with all recorded catalogue evidence.
	 * History without either retains the legacy `<session>/chat` fallback.
	 */
	readonly defaultChat: string;
	/** Timestamp of the last persisted event, ISO 8601. */
	readonly modifiedAt: string;
}

/**
 * Outcome of replaying a task's persisted AHP history.
 *
 * {@link truncated} MUST be surfaced rather than presented as a complete transcript: a partial
 * tail means the recorded conversation stops short of what actually happened.
 */
export interface IReplayedTaskHistory {
	/** Every session the task's history covers. A task may own more than one. */
	readonly sessions: readonly IReplayedSession[];
	/** Whether the recorded history ends mid-action, so the tail is missing. */
	readonly truncated: boolean;
}

/** Per-session accumulator used while decoding the transport layer. */
interface ISessionReplayState {
	readonly envelopes: ActionEnvelope[];
	readonly eventsBySeq: Map<number, Record<string, unknown>>;
	modifiedAt: string;
	nextSeq: number;
	reassembler: Reassembler;
	/** Whether an earlier mirror epoch ended with a chunk group that never completed. */
	abandonedChunkGroup: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, field: string, eventIndex: number): string {
	if (typeof value !== 'string' || !value.trim()) {
		throw new TaskEventReplayError(`Task AHP event ${eventIndex} has an invalid ${field}.`);
	}
	return value;
}

function requireNonNegativeInteger(value: unknown, field: string, eventIndex: number): number {
	if (!Number.isInteger(value) || (value as number) < 0) {
		throw new TaskEventReplayError(`Task AHP event ${eventIndex} has an invalid ${field}.`);
	}
	return value as number;
}

/**
 * Validate the minimal envelope shape the fold depends on. The action payload itself is left to
 * the reducers, which already tolerate unknown action types.
 */
function parseActionEnvelope(value: unknown, eventIndex: number): ActionEnvelope {
	if (!isRecord(value)) {
		throw new TaskEventReplayError(`Task AHP event ${eventIndex} did not contain an ActionEnvelope object.`);
	}
	requireNonEmptyString(value['channel'], 'payload.data.channel', eventIndex);
	requireNonNegativeInteger(value['serverSeq'], 'payload.data.serverSeq', eventIndex);

	const action = value['action'];
	if (!isRecord(action)) {
		throw new TaskEventReplayError(`Task AHP event ${eventIndex} has an invalid payload.data.action.`);
	}
	requireNonEmptyString(action['type'], 'payload.data.action.type', eventIndex);

	const rejectionReason = value['rejectionReason'];
	if (rejectionReason !== undefined && rejectionReason !== null) {
		requireNonEmptyString(rejectionReason, 'payload.data.rejectionReason', eventIndex);
	}

	// The live path (`agentHostProtocolClient`) likewise forwards the wire envelope as-is;
	// the protocol's `URI` is a string alias, so no revival is needed.
	return value as unknown as ActionEnvelope;
}

/** Normalize a bare session id to its channel URI. */
function sessionChannelFor(sessionId: string): string {
	return sessionId.startsWith('ahp-session:/') ? sessionId : `ahp-session:/${sessionId}`;
}

function seedSessionState(): SessionState {
	return {
		provider: '',
		title: '',
		status: SessionStatus.Idle,
		lifecycle: SessionLifecycle.Ready,
		activeClients: [],
		chats: [],
	};
}

function seedChatState(chatChannel: string, modifiedAt: string): ChatState {
	return {
		resource: chatChannel,
		title: '',
		status: SessionStatus.Idle,
		modifiedAt,
		turns: [],
	};
}

/**
 * Decode the persisted transport layer into ordered envelopes, grouped by session, ignoring exact
 * duplicate records within each mirror epoch.
 *
 * Throws on a genuine sequence gap or a corrupt record — a history that cannot be trusted must
 * not be shown as if it were complete.
 */
function decodeEvents(events: readonly unknown[]): Map<string, ISessionReplayState> {
	const sessions = new Map<string, ISessionReplayState>();

	for (const [eventIndex, value] of events.entries()) {
		if (!isRecord(value)) {
			throw new TaskEventReplayError(`Task AHP event ${eventIndex} must be an object.`);
		}
		if (value['ns'] !== 'ahp') {
			throw new TaskEventReplayError(`Task AHP event ${eventIndex} has an invalid ns.`);
		}

		const session = sessionChannelFor(requireNonEmptyString(value['session_id'], 'session_id', eventIndex));
		const seq = requireNonNegativeInteger(value['seq'], 'seq', eventIndex);
		const at = requireNonEmptyString(value['at'], 'at', eventIndex);

		let entry = sessions.get(session);
		if (!entry) {
			entry = { envelopes: [], eventsBySeq: new Map(), modifiedAt: at, nextSeq: seq, reassembler: new Reassembler(), abandonedChunkGroup: false };
			sessions.set(session, entry);
		}
		// Persisted batches can overlap; never fold an already-seen delta or chunk twice.
		if (equals(entry.eventsBySeq.get(seq), value)) {
			continue;
		}

		const startsRestartEpoch = seq !== entry.nextSeq && seq < entry.nextSeq && seq <= MAX_RESTART_EPOCH_INITIAL_SEQUENCE;
		if (seq !== entry.nextSeq && !startsRestartEpoch) {
			throw new TaskEventReplayError(
				`Task AHP event ${eventIndex} for session '${session}' has sequence ${seq}; expected ${entry.nextSeq}.`);
		}
		if (startsRestartEpoch) {
			// Mission Control re-hosted the session on a fresh mirror process. Keep the fold so far,
			// but never carry a half-assembled chunk group across process lifetimes. A group still
			// buffered at the restart is an action the previous epoch never finished emitting, so
			// remember it — replacing the reassembler is what would otherwise lose that fact.
			entry.abandonedChunkGroup ||= entry.reassembler.inFlightGroupCount > 0;
			entry.eventsBySeq.clear();
			entry.nextSeq = seq;
			entry.reassembler = new Reassembler();
		}
		entry.eventsBySeq.set(seq, value);
		entry.modifiedAt = at;
		entry.nextSeq += 1;

		let reassembled: unknown;
		try {
			reassembled = entry.reassembler.ingest(value['payload'] as ChunkEnvelope);
		} catch (error) {
			const message = error instanceof Error ? error.message : 'unknown chunking failure';
			throw new TaskEventReplayError(
				`Task AHP event ${eventIndex} for session '${session}' could not be reassembled: ${message}`);
		}

		// As in live ingestion, an incomplete group has produced no action yet. Chunks arrive as a
		// contiguous, non-interleaved run, so a group still buffered when the events run out is a
		// truncated tail (a torn one fails the sequence check above). Keep the complete actions and
		// report the loss rather than discarding everything.
		if (reassembled === null) {
			continue;
		}

		const envelope = parseActionEnvelope(reassembled, eventIndex);
		// A rejected action never mutated host state, so it must not mutate the replayed state.
		if (!envelope.rejectionReason) {
			entry.envelopes.push(envelope);
		}
	}

	return sessions;
}

/**
 * Fold one session's envelopes into session state plus a chat state per chat channel.
 *
 * Routed by action type, not channel scheme, so host-defined chat URIs are preserved.
 *
 * A session may own several peer chats, so each chat channel found in the history gets its own fold
 * — discovered from the envelopes rather than assumed, which keeps forked and peer chats intact.
 */
function foldSession(session: string, entry: ISessionReplayState): IReplayedSession {
	let state = seedSessionState();
	const chats = new Map<string, ChatState>();
	// Catalogue evidence the reducer cannot keep. A chat created together with its session is only
	// ever announced in the subscribe snapshot, which the mirror never sees, so its later
	// `session/chatUpdated` frames name a chat the folded catalogue lacks and the reducer drops
	// them. Such a mention still attests that the host has the chat; only a removal rules it out.
	// `removed` outlives the catalogue too: a removal whose addition predates the mirror leaves
	// the folded catalogue untouched.
	const mentioned = new Set<string>();
	const removed = new Set<string>();

	for (const envelope of entry.envelopes) {
		const channel = envelope.channel;
		const action: StateAction = envelope.action;

		if (action.type.startsWith('session/') && channel === session) {
			const sessionAction = action as SessionAction;
			switch (sessionAction.type) {
				case ActionType.SessionChatAdded:
					removed.delete(sessionAction.summary.resource);
					break;
				case ActionType.SessionChatUpdated:
					mentioned.add(sessionAction.chat);
					break;
				case ActionType.SessionChatsReordered:
					for (const chat of sessionAction.chats) {
						mentioned.add(chat);
					}
					break;
				case ActionType.SessionChatRemoved:
					mentioned.delete(sessionAction.chat);
					removed.add(sessionAction.chat);
					break;
			}
			state = sessionReducer(state, sessionAction);
			continue;
		}
		if (action.type.startsWith('chat/')) {
			const current = chats.get(channel) ?? seedChatState(channel, entry.modifiedAt);
			chats.set(channel, chatReducer(current, action as ChatAction));
		}
		// Other channels (terminals, changesets, annotations) carry no conversation history and
		// are intentionally skipped.
	}

	const catalogue = new Map(state.chats.map(chat => [chat.resource, chat]));
	const isPeer = (chat: string) => {
		const origin = catalogue.get(chat)?.origin;
		return !!origin && origin.kind !== ChatOriginKind.User;
	};
	const candidates = [...chats.keys()].filter(chat => !removed.has(chat) && !isPeer(chat));
	const [candidate] = candidates;
	const reachesCandidateCache = new Map<string, boolean>();
	const reachesCandidate = (chat: string): boolean => {
		const visited = new Set<string>();
		let current = chat;
		while (current !== candidate && !reachesCandidateCache.has(current)) {
			if (visited.has(current) || removed.has(current)) {
				break;
			}
			visited.add(current);
			const origin = catalogue.get(current)?.origin;
			if (origin?.kind !== ChatOriginKind.Tool && origin?.kind !== ChatOriginKind.Fork && origin?.kind !== ChatOriginKind.SideChat) {
				break;
			}
			current = origin.chat;
		}
		const result = current === candidate || reachesCandidateCache.get(current) === true;
		for (const resource of visited) {
			reachesCandidateCache.set(resource, result);
		}
		return result;
	};
	// Only infer a default when every retained peer's ancestry leads to the candidate.
	const unambiguousChat = candidates.length === 1
		&& state.chats.every(chat => reachesCandidate(chat.resource))
		&& [...mentioned].every(reachesCandidate)
		? candidate : undefined;
	const defaultChat = state.defaultChat || unambiguousChat || `${session}/chat`;
	if (!chats.has(defaultChat)) {
		chats.set(defaultChat, seedChatState(defaultChat, entry.modifiedAt));
	}

	return { session, state, chats, defaultChat, modifiedAt: entry.modifiedAt };
}

/**
 * Replay Mission Control's persisted AHP frames for a task.
 *
 * Returns `undefined` when the task has no AHP history at all (a cloud task that never ran on a
 * sandbox), which is not an error.
 */
export function replayTaskAhpEvents(events: readonly unknown[]): IReplayedTaskHistory | undefined {
	const decoded = decodeEvents(events);
	if (decoded.size === 0) {
		return undefined;
	}

	const sessions: IReplayedSession[] = [];
	let truncated = false;
	for (const [session, entry] of decoded) {
		sessions.push(foldSession(session, entry));
		// Counts *any* group left buffered, including one abandoned mid-stream, plus groups a
		// restart epoch left unfinished before its reassembler was replaced.
		truncated ||= entry.abandonedChunkGroup || entry.reassembler.inFlightGroupCount > 0;
	}
	return { sessions, truncated };
}

/**
 * Decode the `events` array of a Mission Control `GET /agents/tasks/<id>/events` response.
 *
 * The `total` cross-check guards against a silently short page being folded into a transcript
 * that looks whole.
 */
export function parseTaskEventsResponse(body: unknown): readonly unknown[] {
	if (!isRecord(body) || !Array.isArray(body['events'])) {
		throw new TaskEventReplayError('Task AHP history response is malformed.');
	}
	const total = body['total'];
	if (!Number.isInteger(total) || (total as number) < 0) {
		throw new TaskEventReplayError('Task AHP history response has an invalid total.');
	}
	if (total !== body['events'].length) {
		throw new TaskEventReplayError('Task AHP history response has an inconsistent total.');
	}
	return body['events'];
}
