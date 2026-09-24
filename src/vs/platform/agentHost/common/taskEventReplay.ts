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

import { ChunkEnvelope, Reassembler } from './webPubSub/chunking.js';
import { ActionEnvelope, ActionType, StateAction } from './state/protocol/common/actions.js';
import { SessionDefaultChatChangedAction } from './state/protocol/channels-session/actions.js';
import { chatReducer } from './state/protocol/channels-chat/reducer.js';
import { ChatState } from './state/protocol/channels-chat/state.js';
import { sessionReducer } from './state/protocol/channels-session/reducer.js';
import { SessionLifecycle, SessionState, SessionStatus } from './state/protocol/channels-session/state.js';
import { ChatAction, SessionAction } from './state/sessionActions.js';

/**
 * Highest transport sequence number that may legitimately appear *below* the expected next
 * sequence. Mission Control re-hosts a dormant session on a fresh mirror process whose transport
 * sequence restarts at 0 or 1 while `/events` continues with only the new actions; anything
 * further back is a genuine gap.
 */
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
	 * Channel of the session's default chat, as the recorded history named it.
	 *
	 * Resolved from the history rather than derived locally: the host writes whatever channel
	 * convention it uses (today `<session>/chat`), which need not match the URI a client would
	 * build for the same chat.
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
 * Decode the persisted transport layer into ordered envelopes, grouped by session.
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
			entry = { envelopes: [], modifiedAt: at, nextSeq: seq, reassembler: new Reassembler(), abandonedChunkGroup: false };
			sessions.set(session, entry);
		}
		entry.modifiedAt = at;

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
			entry.nextSeq = seq;
			entry.reassembler = new Reassembler();
		}
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
 * Routed by **action type**, not channel scheme: recorded channels are whatever the host wrote
 * (today `<session>/chat`, not the `ahp-chat://` URI a client builds), so matching on a scheme would
 * silently drop every chat action. The live subscriptions route the same way.
 *
 * A session may own several peer chats, so each chat channel found in the history gets its own fold
 * — discovered from the envelopes rather than assumed, which keeps forked and peer chats intact.
 */
function foldSession(session: string, entry: ISessionReplayState): IReplayedSession {
	let state = seedSessionState();
	const chats = new Map<string, ChatState>();
	// The host announces its default chat via `session/defaultChatChanged`; until then the
	// deterministic `<session>/chat` is the convention it writes.
	let defaultChat = `${session}/chat`;

	for (const envelope of entry.envelopes) {
		const channel = envelope.channel;
		const action: StateAction = envelope.action;

		if (action.type.startsWith('session/') && channel === session) {
			state = sessionReducer(state, action as SessionAction);
			if (action.type === ActionType.SessionDefaultChatChanged) {
				defaultChat = (action as SessionDefaultChatChangedAction).defaultChat || `${session}/chat`;
			}
			continue;
		}
		if (action.type.startsWith('chat/')) {
			const current = chats.get(channel) ?? seedChatState(channel, entry.modifiedAt);
			chats.set(channel, chatReducer(current, action as ChatAction));
		}
		// Other channels (terminals, changesets, annotations) carry no conversation history and
		// are intentionally skipped.
	}

	// A session whose history never announced its chats still owns a default chat, so surface an
	// empty one rather than a session that appears to have no conversation at all.
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
