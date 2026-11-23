/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, raceTimeout, RunOnceScheduler } from '../../../../../base/common/async.js';
import { decodeBase64 } from '../../../../../base/common/buffer.js';
import { escapeMarkdownSyntaxTokens } from '../../../../../base/common/htmlContent.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { removeAnsiEscapeCodes } from '../../../../../base/common/strings.js';
import { URI } from '../../../../../base/common/uri.js';
import { linesDiffComputers } from '../../../../../editor/common/diff/linesDiffComputers.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM } from '../../../../../platform/agentHost/common/agentHostSessionIdentity.js';
import { parseAgentHostHarness } from '../../../../../platform/agentHost/common/agentHostSessionType.js';
import type { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { normalizeFileEdit } from '../../../../../platform/agentHost/common/fileEditDiff.js';
import { readAgentPlanReview } from '../../../../../platform/agentHost/common/meta/agentPlanReview.js';
import { readAgentSystemNotificationMeta } from '../../../../../platform/agentHost/common/meta/agentSystemNotificationMeta.js';
import { readToolCallMeta } from '../../../../../platform/agentHost/common/meta/agentToolCallMeta.js';
import { ReasoningEffortConfigKey } from '../../../../../platform/agentHost/common/reasoningEffort.js';
import type { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ContentEncoding } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';
import {
	ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, FileEditKind, getAgentHostChatId, getInlineToolInput, getSessionChatResource,
	getToolFileEdits, getToolSubagentContent, getTurnError, isMessageHiddenFromTranscript, isMessageRequestHiddenFromTranscript, MessageAttachmentKind, MessageKind, PendingMessageKind,
	ResponsePartKind, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState,
	type ActiveTurn, type ChatInputRequest, type ChatState, type InputRequestResponsePart, type ISessionFileDiff, type Message, type MessageAttachment, type PendingMessage,
	type ResponsePart, type SessionState, type StringOrMarkdown, type ToolCallState, type ToolInput, type Turn,
} from '../../../../../platform/agentHost/common/state/sessionState.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatSessionObservedStatus, ChatSessionUserMessageOrigin, IChatSessionContentRef, IChatSessionEventAttachment, IChatSessionEventInput, IChatSessionFidelity, IChatSessionTranscriptSink, IChatSessionTranscriptSource } from '../../common/sessionObserver/chatSessionObserver.js';
import { COPILOT_CLI_EH_SCHEME } from '../copilotCliEventsUri.js';

type Ev = IChatSessionEventInput;
type Questions = Extract<Ev, { kind: 'question' }>['questions'];
type Answers = Extract<Ev, { kind: 'questionAnswer' }>['answers'];
type Envelope = { readonly id: string; readonly at: number; readonly turnId: string; readonly rawType: string };

const OWNER = 'ChatSessionObserver';
/** Tool output longer than this is stored out of line; the event carries a preview. */
const LARGE_OUTPUT_CHARS = 16_384;
const OUTPUT_PREVIEW_CHARS = 2_000;
/** Content refs larger than this are not fetched. */
const MAX_CONTENT_BYTES = 8 * 1024 * 1024;
const MAX_DIFF_CHARS = 2_000_000;
const MAX_PENDING_CONTENT = 256;
const DIFF_CONTEXT_LINES = 3;
const LIVE_DEBOUNCE_MS = 200;
/**
 * How long an active turn's agent stays quiet after its last words, with nothing of its own
 * running, before the turn counts as handed back while background work (a shell) keeps it open.
 */
const QUIET_HAND_BACK_MS = 3_000;
/** The same while the host lists no background work: a turn normally completes within a second of its last words. */
const QUIET_HAND_BACK_UNLISTED_MS = 15_000;
const HYDRATE_TIMEOUT_MS = 20_000;
const CONTENT_TIMEOUT_MS = 10_000;

export type AgentHostContentKind = 'resource' | 'terminal';

/** Content the projector needs from the host: a `resourceRead` ref, or the retained output of a non-PTY terminal. */
export interface IAgentHostContentRequest {
	readonly kind: AgentHostContentKind;
	readonly uri: string;
}

export function agentHostContentKey(request: IAgentHostContentRequest): string {
	return `${request.kind}:${request.uri}`;
}

export interface IAgentHostTranscriptProjectorOptions {
	storeContent(text: string): IChatSessionContentRef;
	/** Fetched content: `undefined` while not fetched yet, `null` when unavailable. Without it no content is fetched. */
	readContent?(request: IAgentHostContentRequest): string | null | undefined;
	/** Maps a host resource into client space; defaults to parsing it. */
	mapUri?(uri: string): URI;
	/** The chat-session resource that shows a subagent's chat. */
	childSession?(chatUri: string): URI | undefined;
	/** What the harness's reasoning text is. */
	readonly reasoning?: 'full' | 'summary';
	now?(): number;
}

/** The parts of a chat's state the projector reads. */
export type IAgentHostChatSnapshot = Pick<ChatState, 'turns' | 'activeTurn' | 'queuedMessages' | 'steeringMessage' | 'modifiedAt' | 'backgroundWork'>;

const PENDING = new class ContentPending extends Error { }();

function parseTime(value: string | undefined): number | undefined {
	const time = value ? Date.parse(value) : NaN;
	return Number.isFinite(time) ? time : undefined;
}

function textOf(value: StringOrMarkdown | undefined): string {
	return value === undefined ? '' : typeof value === 'string' ? value : value.markdown;
}

/** A message as markdown: plain text escaped, so its links are only the ones it really has. */
function markdownOf(value: StringOrMarkdown): string {
	return typeof value === 'string' ? escapeMarkdownSyntaxTokens(value) : value.markdown;
}

function isTextual(contentType: string | undefined): boolean {
	return !contentType || /^text\/|json|xml|javascript|typescript|yaml|markdown|x-sh/i.test(contentType);
}

function messageOrigin(message: Message): ChatSessionUserMessageOrigin {
	switch (message.origin?.kind) {
		case MessageKind.User: return 'user';
		case MessageKind.Agent: return 'agent';
		case MessageKind.Tool: return 'extension';
		case MessageKind.Automation: return 'autopilot';
		case MessageKind.SystemNotification: return 'notification';
		default: return 'system';
	}
}

function attachmentOf(a: MessageAttachment, mapUri: (uri: string) => URI): IChatSessionEventAttachment {
	const selection = a.type === MessageAttachmentKind.Resource || a.type === MessageAttachmentKind.EmbeddedResource ? a.selection : undefined;
	const range = selection ? { startLineNumber: selection.range.start.line + 1, endLineNumber: selection.range.end.line + 1 } : undefined;
	const uri = a.type === MessageAttachmentKind.Resource ? mapUri(a.uri) : undefined;
	const hint = a.displayKind;
	const kind: IChatSessionEventAttachment['kind'] = hint === 'image' || (a.type === MessageAttachmentKind.EmbeddedResource && a.contentType.startsWith('image/')) ? 'image'
		: hint === 'directory' ? 'directory'
			: hint === 'symbol' ? 'symbol'
				: range || hint === 'selection' ? 'selection'
					: a.type === MessageAttachmentKind.Resource || hint === 'document' ? 'file'
						: 'other';
	return { kind, label: a.label, ...(uri ? { uri } : {}), ...(range ? { range } : {}) };
}

function modeOf(message: Message): string | undefined {
	const agent = message.agent?.uri;
	if (!agent) {
		return undefined;
	}
	const name = agent.replace(/[?#].*$/, '').split('/').pop() ?? agent;
	return name.replace(/(\.agent|\.chatmode)?\.md$/i, '') || agent;
}

function questionsOf(request: ChatInputRequest): Questions {
	const questions = request.questions ?? [];
	const preamble = [request.message, request.url].filter(Boolean).join('\n');
	if (!questions.length) {
		return [{ text: preamble || 'Input requested', kind: 'text' }];
	}
	return questions.map((q, i) => {
		const own = q.message || q.title || q.id;
		const text = i === 0 && preamble && preamble !== own ? `${preamble}\n\n${own}` : own;
		switch (q.kind) {
			case ChatInputQuestionKind.SingleSelect: return { text, kind: 'single', options: q.options.map(o => o.label) };
			case ChatInputQuestionKind.MultiSelect: return { text, kind: 'multi', options: q.options.map(o => o.label) };
			case ChatInputQuestionKind.Boolean: return { text, kind: 'single', options: ['yes', 'no'] };
			default: return { text, kind: 'text' };
		}
	});
}

function answersOf(request: ChatInputRequest, response: ChatInputResponseKind): Answers {
	const questions = request.questions ?? [];
	if (!questions.length) {
		return [{ selected: [response] }];
	}
	if (response !== ChatInputResponseKind.Accept) {
		return questions.map(() => ({}));
	}
	return questions.map(q => {
		const answer = request.answers?.[q.id];
		if (!answer || answer.state === ChatInputAnswerState.Skipped) {
			return answer?.freeformValues?.length ? { text: answer.freeformValues.join('\n') } : {};
		}
		const options = q.kind === ChatInputQuestionKind.SingleSelect || q.kind === ChatInputQuestionKind.MultiSelect ? q.options : [];
		const label = (id: string) => options.find(o => o.id === id)?.label ?? id;
		const value = answer.value;
		switch (value.kind) {
			case ChatInputAnswerValueKind.Text: return { text: value.value };
			case ChatInputAnswerValueKind.Number: return { text: String(value.value) };
			case ChatInputAnswerValueKind.Boolean: return { selected: [value.value ? 'yes' : 'no'] };
			case ChatInputAnswerValueKind.Selected: return { selected: [label(value.value)], ...(value.freeformValues?.length ? { text: value.freeformValues.join('\n') } : {}) };
			case ChatInputAnswerValueKind.SelectedMany: return { selected: value.value.map(label), ...(value.freeformValues?.length ? { text: value.freeformValues.join('\n') } : {}) };
			default: return {};
		}
	});
}

/** Whether the parts of an in-progress turn block on the user: an open input request, or a confirmation/auth gate. */
function awaitsUser(parts: readonly ResponsePart[]): boolean {
	return parts.some(part => {
		if (part.kind === ResponsePartKind.InputRequest) {
			return part.response === undefined;
		}
		if (part.kind !== ResponsePartKind.ToolCall) {
			return false;
		}
		const status = part.toolCall.status;
		return status === ToolCallStatus.PendingResultConfirmation || status === ToolCallStatus.AuthRequired
			|| status === ToolCallStatus.PendingConfirmation && readToolCallMeta(part.toolCall).autoApproveBySetting !== true;
	});
}

/** The tool call once its confirmation is resolved, when it may carry content. */
function afterConfirmation(tc: ToolCallState) {
	switch (tc.status) {
		case ToolCallStatus.Running:
		case ToolCallStatus.AuthRequired:
		case ToolCallStatus.PendingResultConfirmation:
		case ToolCallStatus.Completed:
			return tc;
		default:
			return undefined;
	}
}

/** What changes when the agent does more: the parts, the last one's text, and each tool call's status. */
function partsShape(parts: readonly ResponsePart[]): string {
	const last = parts.at(-1);
	return `${parts.length}:${last?.kind === ResponsePartKind.Markdown ? last.content.length : last?.kind ?? ''}:${parts.map(p => p.kind === ResponsePartKind.ToolCall ? p.toolCall.status : '').join('')}`;
}

function turnEnd(turn: Turn | undefined): number | undefined {
	const start = parseTime(turn?.startedAt);
	return start !== undefined && turn?.duration !== undefined ? start + turn.duration : undefined;
}

function splitLines(text: string): string[] {
	if (!text) {
		return [];
	}
	const lines = text.split(/\r\n|\r|\n/);
	if (lines.at(-1) === '') {
		lines.pop();
	}
	return lines;
}

/** A unified diff of two versions of a file, with git-style headers and three lines of context. */
export function computeUnifiedDiff(path: string, before: string | undefined, after: string | undefined): { readonly diff: string; readonly added: number; readonly removed: number } {
	const a = before === undefined ? [] : splitLines(before);
	const b = after === undefined ? [] : splitLines(after);
	const header = [`--- ${before === undefined ? '/dev/null' : `a${path}`}`, `+++ ${after === undefined ? '/dev/null' : `b${path}`}`];
	if (!a.length || !b.length) {
		if (!a.length && !b.length) {
			return { diff: '', added: 0, removed: 0 };
		}
		const hunk = `@@ -${a.length ? 1 : 0},${a.length} +${b.length ? 1 : 0},${b.length} @@`;
		return { diff: [...header, hunk, ...a.map(l => `-${l}`), ...b.map(l => `+${l}`)].join('\n'), added: b.length, removed: a.length };
	}
	const changes = linesDiffComputers.getDefault().computeDiff(a, b, { ignoreTrimWhitespace: false, maxComputationTimeMs: 1000, computeMoves: false }).changes;
	if (!changes.length) {
		return { diff: '', added: 0, removed: 0 };
	}
	const out = [...header];
	let added = 0;
	let removed = 0;
	for (let i = 0; i < changes.length;) {
		let j = i;
		while (j + 1 < changes.length && changes[j + 1].original.startLineNumber - changes[j].original.endLineNumberExclusive <= 2 * DIFF_CONTEXT_LINES) {
			j++;
		}
		const lead = Math.min(DIFF_CONTEXT_LINES, changes[i].original.startLineNumber - 1);
		const originalStart = changes[i].original.startLineNumber - lead;
		const modifiedStart = changes[i].modified.startLineNumber - lead;
		const originalEnd = Math.min(a.length + 1, changes[j].original.endLineNumberExclusive + DIFF_CONTEXT_LINES);
		const body: string[] = [];
		let line = originalStart;
		for (let k = i; k <= j; k++) {
			const change = changes[k];
			for (; line < change.original.startLineNumber; line++) {
				body.push(` ${a[line - 1]}`);
			}
			for (let l = change.original.startLineNumber; l < change.original.endLineNumberExclusive; l++) {
				body.push(`-${a[l - 1]}`);
			}
			for (let l = change.modified.startLineNumber; l < change.modified.endLineNumberExclusive; l++) {
				body.push(`+${b[l - 1]}`);
			}
			removed += change.original.length;
			added += change.modified.length;
			line = change.original.endLineNumberExclusive;
		}
		for (; line < originalEnd; line++) {
			body.push(` ${a[line - 1]}`);
		}
		const originalLength = originalEnd - originalStart;
		const modifiedLength = body.filter(l => l[0] !== '-').length;
		out.push(`@@ -${originalLength ? originalStart : originalStart - 1},${originalLength} +${modifiedLength ? modifiedStart : modifiedStart - 1},${modifiedLength} @@`, ...body);
		i = j + 1;
	}
	return { diff: out.join('\n'), added, removed };
}

/**
 * Maps an agent-host chat (its completed `turns` and its `activeTurn`) into the event log,
 * incrementally: every event has an id derived from protocol ids and is emitted exactly once,
 * streaming content once it closes. Content stored outside the state tree (content refs,
 * retained terminal output, edit snapshots) is read through `readContent`; the projection
 * stops at the first piece not fetched yet, so the log stays in order, and lists what to
 * fetch in {@link pendingContent}.
 */
export class AgentHostTranscriptProjector {
	private readonly emitted = new Set<string>();
	/** Completed turns whose every event is in the log. */
	private readonly finished = new Set<string>();
	/** Turns seen while in progress: their events are stamped when observed. */
	private readonly liveTurns = new Set<string>();
	/** How many times each turn was resumed (`ChatTurnResume`): a failed turn that runs again under its id. */
	private readonly resumes = new Map<string, number>();
	private readonly needed = new Map<string, IAgentHostContentRequest>();
	private readonly consumed = new Set<string>();
	private reads: string[] = [];
	private dry = false;
	private lastPending = '';
	private pendingCount = 0;
	private readonly pendingSince = new Map<string, number>();
	private state: IAgentHostChatSnapshot | undefined;
	/** The active turn's agent fell quiet after its last words: since when, and how its parts looked. */
	private quiet: { turnId: string; shape: string; since: number; wait: number } | undefined;
	/** The active turn handed back while its host kept it open: how its parts looked then. */
	private quietEnd: { turnId: string; shape: string; n: number } | undefined;
	private readonly quietEnds = new Map<string, number>();
	private readonly now: () => number;
	private readonly mapUri: (uri: string) => URI;

	constructor(private readonly options: IAgentHostTranscriptProjectorOptions) {
		this.now = options.now ?? Date.now;
		this.mapUri = options.mapUri ?? (uri => URI.parse(uri));
	}

	/** Content the projection waits for, and content later events will need. */
	get pendingContent(): readonly IAgentHostContentRequest[] {
		return [...this.needed.values()];
	}

	/** Keys of content the last projection used up. */
	get consumedContent(): readonly string[] {
		return [...this.consumed];
	}

	get status(): ChatSessionObservedStatus {
		const state = this.state;
		if (state?.activeTurn) {
			return awaitsUser(state.activeTurn.responseParts) ? 'question' : this.quietEnd?.turnId === state.activeTurn.id ? 'waiting' : 'working';
		}
		switch (state?.turns.at(-1)?.state) {
			case TurnState.Cancelled: return 'cancelled';
			case TurnState.Error: return 'failed';
			default: return 'waiting';
		}
	}

	get info(): { readonly lastActivityAt?: number; readonly lastRequestStartedAt?: number; readonly lastRequestEndedAt?: number; readonly model?: string; readonly reasoningEffort?: string } {
		const state = this.state;
		const last = state?.turns.at(-1);
		const active = state?.activeTurn;
		const startedAt = parseTime(active?.startedAt) ?? parseTime(last?.startedAt);
		const endedAt = active ? undefined : turnEnd(last);
		const message = active?.message ?? last?.message;
		const model = active ? message?.model?.id : last?.usage?.model ?? message?.model?.id;
		const effort = message?.model?.config?.[ReasoningEffortConfigKey];
		const lastActivityAt = Math.max(parseTime(state?.modifiedAt) ?? 0, startedAt ?? 0, endedAt ?? 0);
		return {
			...(lastActivityAt ? { lastActivityAt } : {}),
			...(startedAt !== undefined ? { lastRequestStartedAt: startedAt } : {}),
			...(endedAt !== undefined ? { lastRequestEndedAt: endedAt } : {}),
			...(model ? { model } : {}),
			...(typeof effort === 'string' ? { reasoningEffort: effort } : {}),
		};
	}

	/** When to project again to see whether the quiet active turn has handed back. */
	get quietCheckInMs(): number | undefined {
		return this.quiet ? Math.max(0, this.quiet.since + this.quiet.wait - this.now()) : undefined;
	}

	project(state: IAgentHostChatSnapshot): Ev[] {
		this.state = state;
		this.needed.clear();
		this.consumed.clear();
		const out: Ev[] = [];
		try {
			this.projectState(state, out);
		} catch (e) {
			if (e !== PENDING) {
				throw e;
			}
			// Name everything the rest of the log needs, so it is fetched in one round.
			this.dry = true;
			try {
				this.projectState(state, []);
			} finally {
				this.dry = false;
			}
		}
		return out;
	}

	private projectState(state: IAgentHostChatSnapshot, out: Ev[]): void {
		let previousModel: string | undefined;
		for (const turn of state.turns) {
			if (!this.finished.has(turn.id)) {
				this.projectTurn(turn, turn, previousModel, out);
				if (!this.dry) {
					this.finished.add(turn.id);
				}
			}
			previousModel = turn.message.model?.id ?? previousModel;
		}
		const active = state.activeTurn;
		if (active && this.finished.has(active.id) && !this.dry) {
			// Resumed: the last turn failed with a resumable error and runs again under its id
			// (`ChatTurnResume` moves it back to the active turn). Reopen it, so its new work and its
			// next end reach the log; what was already logged stays logged.
			this.finished.delete(active.id);
			const n = (this.resumes.get(active.id) ?? 0) + 1;
			this.resumes.set(active.id, n);
			out.push({ id: `start:${active.id}:resume${n}`, at: this.now(), turnId: active.id, rawType: 'turn/resume', kind: 'turnStarted', trigger: 'system' });
		}
		if (active && !this.finished.has(active.id)) {
			if (!this.dry) {
				this.liveTurns.add(active.id);
				this.reopenAfterQuiet(active, out);
			}
			this.projectTurn(active, undefined, previousModel, out);
		}
		if (!this.dry) {
			this.projectQuietHandBack(state, out);
			this.projectPending(state, out);
		}
	}

	/** A turn that handed back while its host kept it open, where the agent works again: it is open until its next end. */
	private reopenAfterQuiet(active: ActiveTurn, out: Ev[]): void {
		if (this.quietEnd?.turnId === active.id && partsShape(active.responseParts) !== this.quietEnd.shape) {
			out.push({ id: `start:${active.id}:quiet${this.quietEnd.n}`, at: this.now(), turnId: active.id, rawType: 'turn/quietResume', kind: 'turnStarted', trigger: 'system' });
			this.quietEnd = undefined;
		}
	}

	/**
	 * The agent's last words, with none of its own tools running, while its host keeps the turn open
	 * (for a background shell, say): after a quiet spell the turn ends for the user, a hand-back.
	 */
	private projectQuietHandBack(state: IAgentHostChatSnapshot, out: Ev[]): void {
		const active = state.activeTurn;
		if (!active || this.quietEnd?.turnId === active.id) {
			this.quiet = undefined;
			return;
		}
		const parts = active.responseParts;
		const shape = partsShape(parts);
		const last = parts.at(-1);
		const running = parts.some(p => p.kind === ResponsePartKind.ToolCall && p.toolCall.status !== ToolCallStatus.Completed && p.toolCall.status !== ToolCallStatus.Cancelled);
		if (last?.kind !== ResponsePartKind.Markdown || !last.content.trim() || running || awaitsUser(parts)) {
			this.quiet = undefined;
			return;
		}
		const now = this.now();
		const wait = state.backgroundWork?.length ? QUIET_HAND_BACK_MS : QUIET_HAND_BACK_UNLISTED_MS;
		if (this.quiet?.turnId !== active.id || this.quiet.shape !== shape) {
			this.quiet = { turnId: active.id, shape, since: now, wait };
			return;
		}
		this.quiet.wait = wait;
		if (now - this.quiet.since < wait) {
			return;
		}
		// The last words close now, as they would at the turn's end.
		const key = `md:${active.id}:${last.id}`;
		this.once(key, out, () => ({ id: key, at: now, turnId: active.id, rawType: last.kind, kind: 'agentText', text: last.content, final: true }));
		const n = (this.quietEnds.get(active.id) ?? 0) + 1;
		this.quietEnds.set(active.id, n);
		out.push({ id: `end:${active.id}:quiet${n}`, at: now, turnId: active.id, rawType: 'turn/quiet', kind: 'turnEnded', outcome: 'needsInput' });
		this.quietEnd = { turnId: active.id, shape, n };
		this.quiet = undefined;
	}

	private once(key: string, out: Ev[], build: () => Ev | readonly Ev[] | undefined): void {
		if (this.emitted.has(key)) {
			return;
		}
		this.reads = [];
		const built = build();
		if (this.dry || built === undefined) {
			return;
		}
		this.emitted.add(key);
		for (const read of this.reads) {
			this.consumed.add(read);
		}
		if (Array.isArray(built)) {
			out.push(...built);
		} else {
			out.push(built as Ev);
		}
	}

	private content(request: IAgentHostContentRequest, sizeHint?: number): string | null {
		if (sizeHint !== undefined && sizeHint > MAX_CONTENT_BYTES) {
			return null;
		}
		const text = this.options.readContent ? this.options.readContent(request) : null;
		if (text === undefined) {
			if (this.needed.size < MAX_PENDING_CONTENT) {
				this.needed.set(agentHostContentKey(request), request);
			}
			if (this.dry) {
				return null;
			}
			throw PENDING;
		}
		this.reads.push(agentHostContentKey(request));
		return text;
	}

	private store(text: string): IChatSessionContentRef {
		return this.dry ? { id: '', size: text.length } : this.options.storeContent(text);
	}

	/** `completed` is the turn itself once it is in `turns`. */
	private projectTurn(turn: Turn | ActiveTurn, completed: Turn | undefined, previousModel: string | undefined, out: Ev[]): void {
		const turnId = turn.id;
		const done = completed !== undefined;
		const startedAt = parseTime(turn.startedAt);
		const live = this.liveTurns.has(turnId);
		const at = () => live ? this.now() : startedAt ?? this.now();
		const env = (id: string, rawType: string, when = at()): Envelope => ({ id, at: when, turnId, rawType });
		const message = turn.message;
		const origin = messageOrigin(message);
		const model = message.model?.id;

		this.once(`start:${turnId}`, out, () => {
			const when = startedAt ?? at();
			const effort = message.model?.config?.[ReasoningEffortConfigKey];
			const mode = modeOf(message);
			const hidden = isMessageHiddenFromTranscript(message) || isMessageRequestHiddenFromTranscript(message);
			const events: Ev[] = [
				{ ...env(`start:${turnId}`, 'turn', when), kind: 'turnStarted', trigger: origin === 'user' ? 'user' : origin === 'autopilot' ? 'autopilot' : 'system' },
				{
					...env(`user:${turnId}`, `message/${message.origin?.kind ?? 'unknown'}`, when), kind: 'userMessage', text: message.text, origin,
					attachments: (message.attachments ?? []).map(a => attachmentOf(a, this.mapUri)),
					...(model ? { model } : {}), ...(typeof effort === 'string' ? { reasoningEffort: effort } : {}), ...(mode ? { mode } : {}),
					...(hidden ? { hiddenFromTranscript: true } : {}),
				},
			];
			if (model && previousModel && model !== previousModel) {
				events.push({ ...env(`model:${turnId}`, 'message/model', when), kind: 'modelChanged', model, ...(typeof effort === 'string' ? { reasoningEffort: effort } : {}) });
			}
			return events;
		});

		const parts = turn.responseParts;
		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];
			const closed = done || i < parts.length - 1;
			switch (part.kind) {
				case ResponsePartKind.Markdown: {
					if (closed && part.content.trim()) {
						const key = `md:${turnId}:${part.id}`;
						this.once(key, out, () => ({ ...env(key, part.kind), kind: 'agentText', text: part.content, final: done && !this.hasLaterAgentWork(parts, i) }));
					}
					break;
				}
				case ResponsePartKind.Reasoning: {
					if (closed || part.duration !== undefined) {
						const key = `rs:${turnId}:${part.id}`;
						this.once(key, out, () => ({
							...env(key, part.kind, parseTime(part.startedAt) ?? at()), kind: 'reasoning',
							...(part.content ? { text: part.content } : {}), availability: part.content ? this.options.reasoning ?? 'full' : 'redacted',
							...(part.duration !== undefined ? { durationMs: part.duration } : {}),
						}));
					}
					break;
				}
				case ResponsePartKind.ContentRef: {
					const key = `ref:${turnId}:${part.uri}`;
					this.once(key, out, () => {
						const text = isTextual(part.contentType) ? this.content({ kind: 'resource', uri: part.uri }, part.sizeHint) : null;
						return text !== null
							? { ...env(key, part.kind), kind: 'agentText', text, final: done && !this.hasLaterAgentWork(parts, i) }
							: { ...env(key, part.kind), kind: 'notification', text: `${part.contentType ?? 'content'}: ${part.uri}`, source: 'contentRef' };
					});
					break;
				}
				case ResponsePartKind.ToolCall:
					this.projectTool(part.toolCall, done, env, out);
					break;
				case ResponsePartKind.InputRequest:
					this.projectInput(part, env, out);
					break;
				case ResponsePartKind.SystemNotification: {
					const key = `note:${turnId}:${i}`;
					this.once(key, out, () => ({ ...env(key, part.kind), kind: 'notification', text: textOf(part.content), source: readAgentSystemNotificationMeta(part).kind ?? 'system' }));
					break;
				}
				case ResponsePartKind.Error: {
					const key = `err:${turnId}:${i}`;
					this.once(key, out, () => ({
						...env(key, part.kind), kind: 'error', message: part.error.message, code: part.error.errorType,
						...(part.error.stack ? { details: part.error.stack } : {}), ...(part.resumable ? { resumable: true } : {}),
					}));
					break;
				}
				default:
					break;
			}
		}

		if (!completed) {
			return;
		}
		const error = completed.state === TurnState.Error ? getTurnError(completed) : undefined;
		// A resumed turn ends again: each end is its own event.
		const resumed = this.resumes.get(turnId);
		const errId = resumed ? `err:${turnId}:resume${resumed}` : `err:${turnId}`;
		const endId = resumed ? `end:${turnId}:resume${resumed}` : `end:${turnId}`;
		if (error && !parts.some(p => p.kind === ResponsePartKind.Error)) {
			this.once(errId, out, () => ({ ...env(errId, 'turn/error'), kind: 'error', message: error.message, code: error.errorType }));
		}
		const quietEnd = this.quietEnd?.turnId === turnId ? this.quietEnd : undefined;
		if (quietEnd && !this.dry) {
			this.quietEnd = undefined;
			// It ended for the user at its quiet hand-back; the host closing it later adds nothing.
			if (completed.state === TurnState.Complete && partsShape(parts) === quietEnd.shape) {
				return;
			}
		}
		this.once(endId, out, () => {
			const when = turnEnd(completed) ?? at();
			const last = parts.at(-1);
			switch (completed.state) {
				case TurnState.Cancelled:
					return { ...env(endId, `turn/${completed.state}`, when), kind: 'turnEnded', outcome: 'cancelled', cancelledBy: 'user' };
				case TurnState.Error:
					return { ...env(endId, `turn/${completed.state}`, when), kind: 'turnEnded', outcome: 'failed', ...(error ? { reason: error.message } : {}) };
				default:
					return {
						...env(endId, `turn/${completed.state}`, when), kind: 'turnEnded',
						outcome: last?.kind === ResponsePartKind.InputRequest && last.response === undefined ? 'needsInput' : 'completed',
					};
			}
		});
	}

	private hasLaterAgentWork(parts: readonly ResponsePart[], index: number): boolean {
		return parts.slice(index + 1).some(p => p.kind === ResponsePartKind.Markdown || p.kind === ResponsePartKind.ToolCall || p.kind === ResponsePartKind.ContentRef || p.kind === ResponsePartKind.InputRequest);
	}

	private projectTool(tc: ToolCallState, done: boolean, env: (id: string, rawType: string) => Envelope, out: Ev[]): void {
		const callId = tc.toolCallId;
		const rawType = `toolCall/${tc.status}`;
		if (tc.status === ToolCallStatus.Streaming && !done) {
			return;
		}
		const meta = readToolCallMeta(tc);
		this.once(`call:${callId}`, out, () => ({
			...env(`call:${callId}`, rawType), kind: 'toolCall', callId, name: tc.toolName, displayName: tc.displayName,
			input: tc.status === ToolCallStatus.Streaming ? this.parseInput(tc.partialInput) : this.toolInput(tc.toolInput),
			...(tc.invocationMessage && textOf(tc.invocationMessage) ? { message: markdownOf(tc.invocationMessage) } : {}),
			...(tc.contributor ? { contributor: tc.contributor.kind === ToolCallContributorKind.MCP ? `mcp:${meta.mcpServerName ?? tc.contributor.customizationId}` : `client:${tc.contributor.clientId}` } : {}),
		}));

		const permission = () => this.once(`perm:${callId}`, out, () => ({
			...env(`perm:${callId}`, rawType), kind: 'permission', permissionId: callId, callId,
			title: textOf(tc.status === ToolCallStatus.PendingConfirmation ? tc.confirmationTitle ?? tc.invocationMessage : tc.invocationMessage) || tc.displayName,
			...(tc.status === ToolCallStatus.PendingConfirmation && tc.confirmationTitle ? { detail: textOf(tc.invocationMessage) } : {}),
			...(tc.status === ToolCallStatus.PendingConfirmation && tc.options?.length ? { options: tc.options.map(o => o.label) } : {}),
		}));
		if (tc.status === ToolCallStatus.PendingConfirmation && meta.autoApproveBySetting !== true) {
			permission();
		}
		const confirmedCall = afterConfirmation(tc);
		const confirmed = confirmedCall?.confirmed;
		if (confirmed === ToolCallConfirmationReason.UserAction || confirmed !== undefined && this.emitted.has(`perm:${callId}`)) {
			permission();
			const option = confirmedCall?.selectedOption?.label;
			this.once(`permd:${callId}`, out, () => ({ ...env(`permd:${callId}`, rawType), kind: 'permissionDecision', permissionId: callId, decision: confirmed === ToolCallConfirmationReason.UserAction ? 'allowed' : 'auto', ...(option ? { option } : {}) }));
		}
		if (tc.status === ToolCallStatus.Cancelled && tc.reason === ToolCallCancellationReason.Denied) {
			permission();
			this.once(`permd:${callId}`, out, () => ({ ...env(`permd:${callId}`, rawType), kind: 'permissionDecision', permissionId: callId, decision: 'denied', ...(tc.selectedOption ? { option: tc.selectedOption.label } : {}) }));
		}

		// A finished tool can ask the user to approve its result before the model sees it.
		const resultPermissionId = `${callId}:result`;
		const resultPermission = () => this.once(`perm:${resultPermissionId}`, out, () => ({ ...env(`perm:${resultPermissionId}`, rawType), kind: 'permission', permissionId: resultPermissionId, callId, title: `Review the result of ${tc.displayName}` }));
		if (tc.status === ToolCallStatus.PendingResultConfirmation) {
			resultPermission();
		}
		if (tc.status === ToolCallStatus.Completed && this.emitted.has(`perm:${resultPermissionId}`)) {
			this.once(`permd:${resultPermissionId}`, out, () => ({ ...env(`permd:${resultPermissionId}`, rawType), kind: 'permissionDecision', permissionId: resultPermissionId, decision: 'allowed' }));
		}
		if (tc.status === ToolCallStatus.Cancelled && tc.reason === ToolCallCancellationReason.ResultDenied) {
			resultPermission();
			this.once(`permd:${resultPermissionId}`, out, () => ({ ...env(`permd:${resultPermissionId}`, rawType), kind: 'permissionDecision', permissionId: resultPermissionId, decision: 'denied' }));
		}

		const content = confirmedCall?.content;
		const subagent = content ? getToolSubagentContent({ content }) : undefined;
		const childChat = subagent?.resource ?? meta.subagentChatUri;
		if (subagent || meta.toolKind === 'subagent') {
			this.once(`sa:${callId}`, out, () => {
				const child = childChat ? this.options.childSession?.(childChat) : undefined;
				const description = subagent?.description ?? meta.subagentDescription;
				return {
					...env(`sa:${callId}`, rawType), kind: 'subagentStarted', callId, name: subagent?.title ?? meta.subagentAgentName ?? tc.displayName,
					...(child ? { childSession: child } : {}), ...(description ? { description } : {}),
				};
			});
		}

		const terminal = tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled;
		if (!terminal && !done) {
			return;
		}
		if (tc.status === ToolCallStatus.Completed) {
			this.once(`out:${callId}`, out, () => this.toolOutput(tc, env(`out:${callId}`, rawType)));
			getToolFileEdits(tc).forEach((edit, k) => {
				const key = `edit:${callId}:${k}`;
				this.once(key, out, () => this.edit(edit, callId, env(key, rawType)));
			});
		}
		const exitCode = content?.find(c => c.type === ToolResultContentType.Terminal && c.result?.exitCode !== undefined);
		const durationMs = meta['vscode.toolCallDurationMs'];
		this.once(`res:${callId}`, out, () => {
			const base = { ...env(`res:${callId}`, rawType), kind: 'toolResult' as const, callId, ...(typeof durationMs === 'number' ? { durationMs } : {}) };
			if (tc.status === ToolCallStatus.Completed) {
				return {
					...base, status: tc.success ? 'completed' : 'failed',
					...(exitCode?.type === ToolResultContentType.Terminal && exitCode.result?.exitCode !== undefined ? { exitCode: exitCode.result.exitCode } : {}),
					...(tc.error ? { error: tc.error.message } : !tc.success ? { error: textOf(tc.pastTenseMessage) || 'failed' } : {}),
					...(tc.structuredContent ? { structured: tc.structuredContent } : {}),
				};
			}
			if (tc.status === ToolCallStatus.Cancelled) {
				const reason = textOf(tc.reasonMessage);
				return { ...base, status: tc.reason === ToolCallCancellationReason.Skipped ? 'cancelled' : 'denied', ...(reason ? { error: reason } : {}) };
			}
			// The turn ended while the tool was still going.
			return { ...base, status: 'cancelled' };
		});
		if (subagent || meta.toolKind === 'subagent') {
			this.once(`sae:${callId}`, out, () => {
				const child = childChat ? this.options.childSession?.(childChat) : undefined;
				const status = tc.status === ToolCallStatus.Completed ? (tc.success ? 'completed' : 'failed') : 'cancelled';
				return { ...env(`sae:${callId}`, rawType), parentId: `sa:${callId}`, kind: 'subagentEnded', callId, status, ...(child ? { childSession: child } : {}) };
			});
		}
	}

	private parseInput(raw: string | undefined): unknown {
		if (raw === undefined) {
			return {};
		}
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	}

	private toolInput(input: ToolInput | undefined): unknown {
		if (input === undefined || typeof input === 'string') {
			return this.parseInput(getInlineToolInput(input));
		}
		const text = this.content({ kind: 'resource', uri: input.uri }, input.sizeHint);
		return text === null ? { ref: input.uri } : this.parseInput(text);
	}

	private toolOutput(tc: Extract<ToolCallState, { status: ToolCallStatus.Completed }>, envelope: Envelope): Ev | undefined {
		const pieces: string[] = [];
		let truncated = false;
		let stream: 'stdout' | 'content' = 'content';
		for (const block of tc.content ?? []) {
			switch (block.type) {
				case ToolResultContentType.Text:
					pieces.push(block.text);
					break;
				case ToolResultContentType.Terminal: {
					stream = 'stdout';
					const preview = block.result?.preview;
					// Only a non-PTY terminal is this call's own output; a PTY may be a shell other calls share.
					const full = block.isPty === false && (block.result?.truncated || preview === undefined) ? this.content({ kind: 'terminal', uri: block.resource }) : null;
					if (preview !== undefined && pieces.at(-1) === preview) {
						pieces.pop();
					}
					if (full !== null) {
						pieces.push(full);
					} else if (preview !== undefined) {
						pieces.push(block.isPty === false ? preview : removeAnsiEscapeCodes(preview));
						truncated ||= block.result?.truncated === true;
					}
					break;
				}
				case ToolResultContentType.EmbeddedResource:
					pieces.push(isTextual(block.contentType) ? decodeBase64(block.data).toString() : `[${block.contentType}, ${Math.floor(block.data.length * 3 / 4)} bytes]`);
					break;
				case ToolResultContentType.Resource: {
					const text = isTextual(block.contentType) ? this.content({ kind: 'resource', uri: block.uri }, block.sizeHint) : null;
					pieces.push(text ?? `[${block.contentType ?? 'resource'}] ${block.uri}`);
					break;
				}
				default:
					// File edits and subagents have their own events.
					break;
			}
		}
		const text = pieces.join('\n');
		if (!text) {
			return undefined;
		}
		if (text.length > LARGE_OUTPUT_CHARS) {
			return { ...envelope, kind: 'toolOutput', callId: tc.toolCallId, stream, text: text.slice(0, OUTPUT_PREVIEW_CHARS), ref: this.store(text), totalChars: text.length, truncated: true };
		}
		return { ...envelope, kind: 'toolOutput', callId: tc.toolCallId, stream, text, totalChars: text.length, truncated };
	}

	private edit(edit: ISessionFileDiff, callId: string, envelope: Envelope): Ev | undefined {
		const normalized = normalizeFileEdit(edit);
		if (!normalized) {
			return undefined;
		}
		const before = edit.before ? this.content({ kind: 'resource', uri: edit.before.content.uri }, edit.before.content.sizeHint) : undefined;
		const after = edit.after ? this.content({ kind: 'resource', uri: edit.after.content.uri }, edit.after.content.sizeHint) : undefined;
		const operation = normalized.kind === FileEditKind.Create ? 'create' : normalized.kind === FileEditKind.Delete ? 'delete' : normalized.kind === FileEditKind.Rename ? 'rename' : 'modify';
		const fileUri = (edit.before ?? edit.after)!.uri;
		const readable = before !== null && after !== null && (before?.length ?? 0) + (after?.length ?? 0) <= MAX_DIFF_CHARS;
		const diff = readable ? computeUnifiedDiff(URI.parse(fileUri).path, before, after) : undefined;
		return {
			...envelope, kind: 'edit', callId, uri: this.mapUri(fileUri), operation,
			...(operation === 'rename' && edit.after ? { newUri: this.mapUri(edit.after.uri) } : {}),
			...(typeof before === 'string' ? { before: this.store(before) } : {}),
			...(typeof after === 'string' ? { after: this.store(after) } : {}),
			unifiedDiff: diff?.diff ?? '',
			added: edit.diff?.added ?? diff?.added ?? 0,
			removed: edit.diff?.removed ?? diff?.removed ?? 0,
		};
	}

	private projectInput(part: InputRequestResponsePart, env: (id: string, rawType: string) => Envelope, out: Ev[]): void {
		const request = part.request;
		const id = request.id;
		const rawType = part.response ? `inputRequest/${part.response}` : 'inputRequest';
		const plan = readAgentPlanReview(request);
		if (plan) {
			const review = plan.review;
			this.once(`plan:${id}`, out, () => ({
				...env(`plan:${id}`, rawType), kind: 'planReview', reviewId: id, title: review.title, plan: review.content,
				...(review.planUri ? { planUri: this.mapUri(review.planUri) } : {}), actions: review.actions.map(a => a.label), canProvideFeedback: review.canProvideFeedback,
			}));
			if (part.response !== undefined) {
				const response = part.response;
				this.once(`pland:${id}`, out, () => {
					const result = plan.fromInputCompletion(response, request.answers);
					const action = result?.action ?? (response === ChatInputResponseKind.Cancel ? 'cancel' : result?.feedback ? 'feedback' : 'reject');
					return { ...env(`pland:${id}`, rawType), kind: 'planReviewDecision', reviewId: id, action, ...(result?.feedback ? { feedback: result.feedback } : {}) };
				});
			}
			return;
		}
		this.once(`q:${id}`, out, () => ({ ...env(`q:${id}`, 'inputRequest'), kind: 'question', questionId: id, questions: questionsOf(request) }));
		if (part.response !== undefined) {
			const response = part.response;
			this.once(`qa:${id}`, out, () => ({ ...env(`qa:${id}`, rawType), kind: 'questionAnswer', questionId: id, answers: answersOf(request, response), actor: 'user' }));
		}
	}

	private projectPending(state: IAgentHostChatSnapshot, out: Ev[]): void {
		const messages: PendingMessage[] = [...state.queuedMessages ?? []];
		if (state.steeringMessage && !messages.some(m => m.id === state.steeringMessage!.id)) {
			messages.push({ ...state.steeringMessage, kind: PendingMessageKind.Steering });
		}
		const now = this.now();
		const items = messages.map(m => ({ id: m.id, kind: m.kind === PendingMessageKind.Steering ? 'steering' as const : 'queued' as const, text: m.message.text, at: this.pendingSince.get(m.id) ?? now }));
		const key = items.length ? JSON.stringify(items.map(i => [i.id, i.kind, i.text])) : '';
		if (key === this.lastPending) {
			return;
		}
		this.lastPending = key;
		this.pendingSince.clear();
		for (const item of items) {
			this.pendingSince.set(item.id, item.at);
		}
		out.push({ id: `pending:${++this.pendingCount}`, at: now, rawType: 'queuedMessages', kind: 'pending', items });
	}
}

async function whenHydrated<T>(subscription: IAgentSubscription<T>, timeoutMs: number): Promise<T> {
	if (subscription.value === undefined) {
		await new Promise<void>(resolve => {
			const store = new DisposableStore();
			const settle = () => {
				store.dispose();
				resolve();
			};
			store.add(subscription.onDidChange(() => {
				if (subscription.value !== undefined) {
					settle();
				}
			}));
			// A failed subscribe fires `onDidError`, not `onDidChange`.
			if (subscription.onDidError) {
				store.add(subscription.onDidError(settle));
			}
			const handle = setTimeout(settle, timeoutMs);
			store.add(toDisposable(() => clearTimeout(handle)));
		});
	}
	const value = subscription.value;
	if (value === undefined) {
		throw new Error('Timed out waiting for the agent host');
	}
	if (value instanceof Error) {
		throw value;
	}
	return value;
}

/** The chat-session resource the workbench opens for a subagent's chat inside its parent session. */
function subagentResource(parent: URI, chatUri: string): URI {
	const query = new URLSearchParams(parent.query);
	query.set(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, chatUri);
	return parent.with({ fragment: getAgentHostChatId(chatUri), query: query.toString() });
}

/** The chat a session resource shows: a subagent chat, a peer chat by its id, or the session's default chat. */
function chatOf(resource: URI, session: SessionState): string | undefined {
	const explicit = new URLSearchParams(resource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
	if (explicit) {
		return explicit;
	}
	return resource.fragment ? getSessionChatResource(session, resource.fragment, session.defaultChat) : session.defaultChat;
}

class AgentHostChatObservation extends Disposable {
	private readonly cache = new Map<string, string | null>();
	private readonly inflight = new Map<string, Promise<void>>();
	private readonly limiter = new Limiter<void>(8);
	private readonly projector: AgentHostTranscriptProjector;
	private readonly scheduler = this._register(new RunOnceScheduler(() => this.flushAndFetch(), LIVE_DEBOUNCE_MS));
	/** A quiet active turn is projected again once its wait is over, though nothing changed. */
	private readonly quietCheck = this._register(new RunOnceScheduler(() => this.flushAndFetch(), QUIET_HAND_BACK_MS));
	private disposed = false;

	constructor(
		private readonly connection: IAgentConnection,
		resource: URI,
		private readonly chat: IAgentSubscription<ChatState>,
		private readonly sink: IChatSessionTranscriptSink,
		private readonly fidelity: IChatSessionFidelity,
	) {
		super();
		this.projector = new AgentHostTranscriptProjector({
			storeContent: text => sink.storeContent(text),
			readContent: request => this.cache.get(agentHostContentKey(request)),
			mapUri: uri => connection.resourceUris.fromAgentHost(URI.parse(uri)),
			childSession: chatUri => subagentResource(resource, chatUri),
			reasoning: fidelity.reasoning === 'summary' ? 'summary' : 'full',
		});
		this._register(chat.onDidChange(() => this.scheduler.schedule()));
		if (chat.onDidApplySnapshot) {
			this._register(chat.onDidApplySnapshot(() => this.scheduler.schedule()));
		}
		this._register(toDisposable(() => {
			this.disposed = true;
			this.limiter.dispose();
		}));
	}

	/** Projects the full history, fetching the content it needs. */
	async load(): Promise<void> {
		for (let round = 0; round < 64 && !this.disposed; round++) {
			const wanted = this.flush();
			if (!wanted.length) {
				return;
			}
			await this.fetch(wanted);
		}
	}

	private flushAndFetch(): void {
		const wanted = this.flush();
		if (wanted.length) {
			void this.fetch(wanted).then(() => {
				if (!this.disposed) {
					this.scheduler.schedule();
				}
			});
		}
	}

	private flush(): IAgentHostContentRequest[] {
		const state = this.chat.value;
		if (this.disposed || !state || state instanceof Error) {
			return [];
		}
		const events = this.projector.project(state);
		if (events.length) {
			this.sink.append(events);
		}
		const wanted = this.projector.pendingContent;
		if (wanted.length) {
			for (const key of this.projector.consumedContent) {
				this.cache.delete(key);
			}
		} else {
			this.cache.clear();
		}
		this.sink.patchInfo({ status: this.projector.status, ...this.projector.info, fidelity: this.fidelity });
		const quietIn = this.projector.quietCheckInMs;
		if (quietIn === undefined) {
			this.quietCheck.cancel();
		} else if (!this.quietCheck.isScheduled()) {
			this.quietCheck.schedule(quietIn + LIVE_DEBOUNCE_MS);
		}
		return wanted.filter(r => !this.cache.has(agentHostContentKey(r)));
	}

	private fetch(requests: readonly IAgentHostContentRequest[]): Promise<void> {
		if (this.disposed) {
			return Promise.resolve();
		}
		return Promise.all(requests.map(request => {
			const key = agentHostContentKey(request);
			let pending = this.inflight.get(key);
			if (!pending) {
				pending = this.limiter.queue(async () => {
					const text = this.disposed ? null : await raceTimeout(request.kind === 'terminal' ? this.readTerminal(request.uri) : this.readResource(request.uri), CONTENT_TIMEOUT_MS).catch(() => null);
					this.cache.set(key, text ?? null);
				}).finally(() => this.inflight.delete(key));
				this.inflight.set(key, pending);
			}
			return pending;
		})).then(() => undefined);
	}

	private async readResource(uri: string): Promise<string | null> {
		const result = await this.connection.resourceRead(URI.parse(uri));
		const text = result.encoding === ContentEncoding.Base64 ? decodeBase64(result.data).toString() : result.data;
		return text.includes('\0') ? null : text;
	}

	private async readTerminal(uri: string): Promise<string | null> {
		const ref = this.connection.getSubscription(StateComponents.Terminal, URI.parse(uri), OWNER);
		try {
			const state = await whenHydrated(ref.object, CONTENT_TIMEOUT_MS);
			const text = state.content.map(part => part.type === 'command' ? part.output : part.value).join('');
			return state.isPty === false ? text : removeAnsiEscapeCodes(text);
		} finally {
			ref.dispose();
		}
	}
}

/**
 * The transcript source for agent-host sessions (Claude, Codex, and remote agent hosts):
 * subscribes to the session's chat channel on the owning connection, so the full history and
 * every live change reach the log whether or not a widget shows the session. Local Copilot CLI
 * sessions are left to the Copilot CLI source, which reads the CLI's own log.
 */
export class AgentHostTranscriptSource extends Disposable implements IChatSessionTranscriptSource {
	readonly id = 'agentHost';
	readonly priority = 50;

	private connectionsService: IAgentHostConnectionsService | null | undefined;

	constructor(
		@IInstantiationService private readonly instantiationService: IInstantiationService,
		@ILogService private readonly logService: ILogService,
	) {
		super();
	}

	/** Looked up lazily: entry points and tests without agent hosts don't register the service. */
	private get connections(): IAgentHostConnectionsService | undefined {
		if (this.connectionsService === undefined) {
			try {
				this.connectionsService = this.instantiationService.invokeFunction(accessor => accessor.get(IAgentHostConnectionsService));
			} catch {
				this.connectionsService = null;
			}
		}
		return this.connectionsService ?? undefined;
	}

	canObserve(resource: URI): boolean {
		// A local Copilot agent-host session is the Copilot CLI source's when its CLI log is found
		// under the session's id (richer: model calls, per-event times); this source takes it otherwise.
		if (resource.scheme === COPILOT_CLI_EH_SCHEME || !parseAgentHostHarness(resource.scheme)) {
			return false;
		}
		try {
			return !!this.connections?.resolveSessionResourceIdentity(resource);
		} catch {
			return false;
		}
	}

	async observe(resource: URI, sink: IChatSessionTranscriptSink): Promise<IDisposable> {
		const resolution = this.connections?.resolveSessionResource(resource);
		if (!resolution) {
			throw new Error(`No connected agent host for ${resource.toString()}`);
		}
		const { connection, backendSession } = resolution;
		const store = new DisposableStore();
		try {
			const sessionRef = store.add(connection.getSubscription(StateComponents.Session, backendSession, OWNER));
			const session = await whenHydrated(sessionRef.object, HYDRATE_TIMEOUT_MS);
			const chatUri = chatOf(resource, session);
			if (!chatUri) {
				throw new Error(`Session ${backendSession.toString()} has no chat for ${resource.toString()}`);
			}
			const chatRef = store.add(connection.getSubscription(StateComponents.Chat, URI.parse(chatUri), OWNER));
			await whenHydrated(chatRef.object, HYDRATE_TIMEOUT_MS);
			const harness = parseAgentHostHarness(resource.scheme);
			const fidelity: IChatSessionFidelity = {
				// Claude and Codex return reasoning summaries, not the raw chain of thought.
				reasoning: harness === 'claude' || harness === 'codex' ? 'summary' : 'full',
				toolOutput: 'full',
				// Codex reports changes per turn on the changeset channel rather than in its tool results.
				diffs: harness === 'codex' ? 'none' : 'perEdit',
				timestamps: 'perTurn',
				modelCalls: false,
				liveWithoutWidget: true,
				liveLatencyMs: LIVE_DEBOUNCE_MS,
			};
			const observation = store.add(new AgentHostChatObservation(connection, resource, chatRef.object, sink, fidelity));
			await observation.load();
			this.logService.trace(`[chatSessionObserver] subscribed to ${chatUri} for ${resource.toString()}`);
			return store;
		} catch (e) {
			store.dispose();
			throw e;
		}
	}
}
