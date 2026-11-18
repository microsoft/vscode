/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'vscode' {

	// Observe every chat session the editor knows, of every provider, as a provider-neutral,
	// append-only event log: complete history, then live additions, with or without a widget.

	export enum ChatSessionObservedStatus {
		Working = 1,
		Waiting = 2,
		Question = 3,
		Finished = 4,
		Failed = 5,
		Cancelled = 6
	}

	export enum ChatSessionReasoningFidelity {
		Full = 1,
		Summary = 2,
		None = 3
	}

	export enum ChatSessionToolOutputFidelity {
		Full = 1,
		Truncated = 2
	}

	export enum ChatSessionDiffFidelity {
		PerEdit = 1,
		PerTurn = 2,
		Aggregate = 3,
		None = 4
	}

	export enum ChatSessionTimestampFidelity {
		PerEvent = 1,
		PerTurn = 2
	}

	/**
	 * What a session's provider can and cannot supply. Consumers must treat a missing
	 * capability as "not available", never as "did not happen".
	 */
	export interface ChatSessionFidelity {
		readonly reasoning: ChatSessionReasoningFidelity;
		readonly toolOutput: ChatSessionToolOutputFidelity;
		readonly diffs: ChatSessionDiffFidelity;
		readonly timestamps: ChatSessionTimestampFidelity;
		readonly modelCalls: boolean;
		readonly liveWithoutWidget: boolean;
		/** How late a live event can arrive, e.g. the poll interval of a remote provider. */
		readonly liveLatencyMs: number;
	}

	export interface ChatSessionCapabilities {
		readonly steering: boolean;
		readonly queueing: boolean;
		readonly inputSuggestions: boolean;
		readonly questions: boolean;
		readonly planReview: boolean;
	}

	export interface ChatSessionRepository {
		readonly remoteUrl: string;
		readonly owner?: string;
		readonly name?: string;
		readonly branch?: string;
		readonly baseBranch?: string;
		readonly head?: string;
	}

	export interface ChatSessionInfo {
		readonly resource: Uri;
		/** `local`, `copilotCli`, `agentHost`, `cloud`, or a contributed session type. */
		readonly provider: string;
		/** For agent host sessions: `copilot`, `claude`, `codex`, ... */
		readonly harness?: string;
		readonly title: string;
		readonly description?: string;
		readonly status: ChatSessionObservedStatus;
		readonly createdAt: number;
		readonly lastActivityAt: number;
		readonly lastRequestStartedAt?: number;
		readonly lastRequestEndedAt?: number;
		readonly readState: { readonly isRead: boolean; readonly lastReadAt?: number };
		readonly archived: boolean;
		readonly workspace?: { readonly folder?: Uri; readonly worktree?: Uri; readonly repositoryRoot?: Uri };
		readonly repository?: ChatSessionRepository;
		readonly pullRequest?: { readonly url: string; readonly number: number; readonly title?: string; readonly state?: string };
		readonly changes?: { readonly files: number; readonly insertions: number; readonly deletions: number };
		readonly model?: string;
		readonly mode?: string;
		readonly reasoningEffort?: string;
		readonly parent?: Uri;
		readonly children?: readonly Uri[];
		readonly capabilities: ChatSessionCapabilities;
		readonly fidelity: ChatSessionFidelity;
	}

	export interface ChatSessionsChangeEvent {
		readonly added: readonly ChatSessionInfo[];
		readonly removed: readonly Uri[];
		readonly changed: readonly ChatSessionInfo[];
	}

	/** A large payload (tool output, a file version) that resolves on demand. */
	export interface ChatSessionContentRef {
		readonly id: string;
		readonly size: number;
	}

	export enum ChatSessionAttachmentKind {
		File = 1,
		Selection = 2,
		Directory = 3,
		Image = 4,
		Symbol = 5,
		Url = 6,
		PromptFile = 7,
		Other = 8
	}

	export interface ChatSessionEventAttachment {
		readonly kind: ChatSessionAttachmentKind;
		readonly label: string;
		readonly uri?: Uri;
		readonly range?: Range;
	}

	export enum ChatSessionEventKind {
		TurnStarted = 1,
		UserMessage = 2,
		AgentText = 3,
		Reasoning = 4,
		ToolCall = 5,
		ToolOutput = 6,
		ToolResult = 7,
		Edit = 8,
		EditDecision = 9,
		Question = 10,
		QuestionAnswer = 11,
		PlanReview = 12,
		PlanReviewDecision = 13,
		Permission = 14,
		PermissionDecision = 15,
		Todos = 16,
		SubagentStarted = 17,
		SubagentEnded = 18,
		Compaction = 19,
		ModelCall = 20,
		ModelChanged = 21,
		ModeChanged = 22,
		Notification = 23,
		PullRequest = 24,
		Error = 25,
		TurnEnded = 26,
		Pending = 27,
		Input = 28,
		TranscriptVisibility = 29
	}

	export enum ChatSessionTurnTrigger {
		User = 1,
		System = 2,
		Autopilot = 3,
		Steering = 4,
		Queued = 5
	}

	export enum ChatSessionMessageOrigin {
		User = 1,
		System = 2,
		Autopilot = 3,
		Notification = 4,
		Skill = 5,
		Extension = 6,
		Agent = 7
	}

	export enum ChatSessionSubmitKind {
		Send = 1,
		Steer = 2,
		Queue = 3
	}

	export enum ChatSessionReasoningAvailability {
		Full = 1,
		Summary = 2,
		Redacted = 3,
		None = 4
	}

	export enum ChatSessionToolOutputStream {
		Stdout = 1,
		Stderr = 2,
		Content = 3
	}

	export enum ChatSessionToolResultStatus {
		Completed = 1,
		Failed = 2,
		Cancelled = 3,
		Denied = 4,
		TimedOut = 5
	}

	export enum ChatSessionEditOperation {
		Modify = 1,
		Create = 2,
		Delete = 3,
		Rename = 4
	}

	export enum ChatSessionEditDecision {
		Kept = 1,
		Undone = 2,
		ModifiedByUser = 3
	}

	export enum ChatSessionQuestionKind {
		SingleSelect = 1,
		MultiSelect = 2,
		Text = 3
	}

	export enum ChatSessionAnswerActor {
		User = 1,
		Auto = 2
	}

	export enum ChatSessionPermissionDecision {
		Allowed = 1,
		Denied = 2,
		Auto = 3
	}

	export enum ChatSessionTodoStatus {
		NotStarted = 1,
		InProgress = 2,
		Completed = 3
	}

	export enum ChatSessionSubagentStatus {
		Completed = 1,
		Failed = 2,
		Cancelled = 3
	}

	export enum ChatSessionCompactionTrigger {
		Auto = 1,
		Manual = 2
	}

	export enum ChatSessionPullRequestAction {
		Opened = 1,
		Updated = 2,
		Linked = 3
	}

	export enum ChatSessionTurnOutcome {
		Completed = 1,
		NeedsInput = 2,
		Cancelled = 3,
		Failed = 4
	}

	export enum ChatSessionCanceller {
		User = 1,
		System = 2
	}

	export enum ChatSessionPendingKind {
		Queued = 1,
		Steering = 2
	}

	export interface ChatSessionEventBase {
		/** Gapless and ordered per session. */
		readonly seq: number;
		readonly id: string;
		/** Epoch milliseconds. */
		readonly at: number;
		readonly turnId?: string;
		/** Nesting: a subagent's events carry its `SubagentStarted` event id. */
		readonly parentId?: string;
		/** The provider's own event type, for diagnostics. */
		readonly rawType?: string;
	}

	export interface ChatSessionTurnStartedEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.TurnStarted;
		readonly trigger: ChatSessionTurnTrigger;
	}

	export interface ChatSessionUserMessageEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.UserMessage;
		readonly text: string;
		readonly origin: ChatSessionMessageOrigin;
		readonly submitKind?: ChatSessionSubmitKind;
		readonly attachments: readonly ChatSessionEventAttachment[];
		readonly model?: string;
		readonly mode?: string;
		readonly reasoningEffort?: string;
		readonly hiddenFromTranscript?: boolean;
	}

	export interface ChatSessionAgentTextEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.AgentText;
		readonly text: string;
		readonly final: boolean;
	}

	export interface ChatSessionReasoningEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Reasoning;
		readonly text?: string;
		readonly availability: ChatSessionReasoningAvailability;
		readonly durationMs?: number;
	}

	export interface ChatSessionToolCallEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.ToolCall;
		readonly callId: string;
		readonly name: string;
		readonly displayName?: string;
		readonly input: unknown;
		readonly contributor?: string;
		/**
		 * What the session's transcript shows for the call, as markdown, with the links it shows
		 * (the file it reads or edits, the page it fetches).
		 */
		readonly message?: string;
	}

	export interface ChatSessionToolOutputEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.ToolOutput;
		readonly callId: string;
		readonly stream?: ChatSessionToolOutputStream;
		readonly text?: string;
		readonly ref?: ChatSessionContentRef;
		readonly totalChars: number;
		readonly truncated: boolean;
	}

	export interface ChatSessionToolResultEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.ToolResult;
		readonly callId: string;
		readonly status: ChatSessionToolResultStatus;
		readonly exitCode?: number;
		readonly durationMs?: number;
		readonly error?: string;
		readonly structured?: unknown;
	}

	export interface ChatSessionEditEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Edit;
		readonly callId?: string;
		readonly uri: Uri;
		readonly operation: ChatSessionEditOperation;
		readonly newUri?: Uri;
		readonly before?: ChatSessionContentRef;
		readonly after?: ChatSessionContentRef;
		readonly unifiedDiff: string;
		readonly added: number;
		readonly removed: number;
	}

	export interface ChatSessionEditDecisionEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.EditDecision;
		readonly uris: readonly Uri[];
		readonly decision: ChatSessionEditDecision;
	}

	export interface ChatSessionQuestionItem {
		readonly text: string;
		readonly kind: ChatSessionQuestionKind;
		readonly options?: readonly string[];
	}

	export interface ChatSessionQuestionEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Question;
		readonly questionId: string;
		readonly questions: readonly ChatSessionQuestionItem[];
	}

	export interface ChatSessionQuestionAnswerEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.QuestionAnswer;
		readonly questionId: string;
		readonly answers: readonly { readonly selected?: readonly string[]; readonly text?: string }[];
		readonly actor: ChatSessionAnswerActor;
	}

	export interface ChatSessionPlanReviewEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.PlanReview;
		readonly reviewId: string;
		readonly title: string;
		readonly plan: string;
		readonly planUri?: Uri;
		readonly actions: readonly string[];
		readonly canProvideFeedback: boolean;
	}

	export interface ChatSessionPlanReviewDecisionEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.PlanReviewDecision;
		readonly reviewId: string;
		readonly action: string;
		readonly feedback?: string;
	}

	export interface ChatSessionPermissionEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Permission;
		readonly permissionId: string;
		readonly callId?: string;
		readonly title: string;
		readonly detail?: string;
		readonly options?: readonly string[];
	}

	export interface ChatSessionPermissionDecisionEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.PermissionDecision;
		readonly permissionId: string;
		readonly decision: ChatSessionPermissionDecision;
		readonly option?: string;
	}

	export interface ChatSessionTodoItem {
		readonly id: string;
		readonly title: string;
		readonly status: ChatSessionTodoStatus;
	}

	/** A full snapshot of the session's todo list. */
	export interface ChatSessionTodosEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Todos;
		readonly items: readonly ChatSessionTodoItem[];
	}

	export interface ChatSessionSubagentStartedEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.SubagentStarted;
		readonly childSession?: Uri;
		readonly name: string;
		readonly description?: string;
		readonly callId?: string;
	}

	export interface ChatSessionSubagentEndedEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.SubagentEnded;
		readonly childSession?: Uri;
		readonly callId?: string;
		readonly status: ChatSessionSubagentStatus;
		readonly summary?: string;
	}

	export interface ChatSessionCompactionEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Compaction;
		readonly summary: string;
		readonly coversThroughSeq: number;
		readonly trigger: ChatSessionCompactionTrigger;
	}

	export interface ChatSessionModelCallEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.ModelCall;
		readonly model: string;
		readonly reasoningEffort?: string;
		readonly inputTokens?: number;
		readonly outputTokens?: number;
	}

	export interface ChatSessionModelChangedEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.ModelChanged;
		readonly model: string;
		readonly reasoningEffort?: string;
	}

	export interface ChatSessionModeChangedEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.ModeChanged;
		readonly mode: string;
	}

	export interface ChatSessionNotificationEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Notification;
		readonly text: string;
		readonly source: string;
	}

	export interface ChatSessionPullRequestEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.PullRequest;
		readonly url: string;
		readonly number: number;
		readonly title?: string;
		readonly action: ChatSessionPullRequestAction;
	}

	export interface ChatSessionErrorEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Error;
		readonly message: string;
		readonly code?: string;
		readonly details?: string;
		readonly resumable?: boolean;
	}

	export interface ChatSessionTurnEndedEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.TurnEnded;
		readonly outcome: ChatSessionTurnOutcome;
		readonly cancelledBy?: ChatSessionCanceller;
		readonly reason?: string;
	}

	export interface ChatSessionPendingItem {
		readonly id: string;
		readonly kind: ChatSessionPendingKind;
		readonly text: string;
		readonly at: number;
	}

	/** A full snapshot of the session's pending (queued and steering) messages. */
	export interface ChatSessionPendingEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Pending;
		readonly items: readonly ChatSessionPendingItem[];
	}

	/** The user's unsent text; `text` only with consent. */
	export interface ChatSessionInputEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.Input;
		readonly textLength: number;
		readonly text?: string;
	}

	export interface ChatSessionTranscriptVisibilityEvent extends ChatSessionEventBase {
		readonly kind: ChatSessionEventKind.TranscriptVisibility;
		readonly visible: boolean;
	}

	export type ChatSessionEvent =
		| ChatSessionTurnStartedEvent
		| ChatSessionUserMessageEvent
		| ChatSessionAgentTextEvent
		| ChatSessionReasoningEvent
		| ChatSessionToolCallEvent
		| ChatSessionToolOutputEvent
		| ChatSessionToolResultEvent
		| ChatSessionEditEvent
		| ChatSessionEditDecisionEvent
		| ChatSessionQuestionEvent
		| ChatSessionQuestionAnswerEvent
		| ChatSessionPlanReviewEvent
		| ChatSessionPlanReviewDecisionEvent
		| ChatSessionPermissionEvent
		| ChatSessionPermissionDecisionEvent
		| ChatSessionTodosEvent
		| ChatSessionSubagentStartedEvent
		| ChatSessionSubagentEndedEvent
		| ChatSessionCompactionEvent
		| ChatSessionModelCallEvent
		| ChatSessionModelChangedEvent
		| ChatSessionModeChangedEvent
		| ChatSessionNotificationEvent
		| ChatSessionPullRequestEvent
		| ChatSessionErrorEvent
		| ChatSessionTurnEndedEvent
		| ChatSessionPendingEvent
		| ChatSessionInputEvent
		| ChatSessionTranscriptVisibilityEvent;

	export interface ChatSessionObservation extends Disposable {
		readonly info: ChatSessionInfo;
		/** The full log so far, in `seq` order. */
		readonly events: readonly ChatSessionEvent[];
		readonly onDidReceiveEvents: Event<readonly ChatSessionEvent[]>;
		readonly onDidChangeInfo: Event<ChatSessionInfo>;
		fetchContent(ref: ChatSessionContentRef): Thenable<string>;
	}

	export enum ChatSessionHost {
		ChatView = 1,
		ChatEditor = 2,
		QuickChat = 3,
		AgentsWindow = 4,
		Inbox = 5
	}

	export enum ChatSessionWindowKind {
		Editor = 1,
		Agents = 2
	}

	/** Where a chat surface shows a session, in this window. */
	export interface ActiveChatSession {
		readonly resource: Uri;
		readonly host: ChatSessionHost;
		readonly windowKind: ChatSessionWindowKind;
		readonly windowFocused: boolean;
		readonly inputFocused: boolean;
	}

	export namespace chat {
		/** Every session the editor knows, all providers, open in a widget or not. */
		export function getChatSessions(filter?: { readonly activeSince?: number }): Thenable<readonly ChatSessionInfo[]>;
		export const onDidChangeChatSessions: Event<ChatSessionsChangeEvent>;
		/**
		 * The full transcript plus a live subscription. Works headlessly (no widget).
		 * `fromSeq` resumes after a reload.
		 */
		export function observeChatSession(resource: Uri, options?: { readonly fromSeq?: number }): Thenable<ChatSessionObservation>;
		/** Which session each chat surface in this window shows, and whether it has focus. */
		export const activeChatSessions: readonly ActiveChatSession[];
		export const onDidChangeActiveChatSessions: Event<readonly ActiveChatSession[]>;
		/** Focus a session in the surface where it lives (opening it when needed). */
		export function openChatSession(resource: Uri): Thenable<void>;
		/** Open the session and scroll to the turn or part an event belongs to. */
		export function revealChatSessionEvent(resource: Uri, eventId: string): Thenable<void>;
		/** A diff editor with the before and after of an `Edit` event. */
		export function openChatSessionEditDiff(resource: Uri, eventId: string): Thenable<void>;
	}
}
