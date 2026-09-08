/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Immutable state types for the sessions process protocol.
// See protocol.md for the full design rationale.
//
// Most types are imported from the auto-generated protocol layer
// (synced from the agent-host-protocol repo). This file adds VS Code-specific
// helpers and re-exports.

import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { hasKey } from '../../../../base/common/types.js';
import { URI as ResourceURI } from '../../../../base/common/uri.js';
import { readToolCallMeta } from '../meta/agentToolCallMeta.js';
import { readUsageInfoMeta, type ITurnTokenTotal, type UsageInfoMeta } from '../meta/usageInfoMeta.js';
import { readLegacyTurnError } from './legacyProtocolCompatibility.js';
import {
	ResponsePartKind,
	SessionStatus,
	ToolCallStatus,
	TurnState,
	SessionLifecycle,
	TerminalState,
	ToolResultContentType,
	ToolResultFileEditContent,
	ChatOriginKind,
	ChatInteractivity,
	type ActiveTurn,
	type ChangesetState,
	type ChatState,
	type ChatSummary,
	type ErrorInfo,
	type ErrorResponsePart,
	type PendingMessage,
	type Turn,
	type AnnotationsState,
	type AutomationState,
	type AutomationRunState,
	type URI as ProtocolURI,
	type RootState,
	type SessionState,
	type SessionSummary,
	type TextRange,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallResult,
	type ToolCallState,
	type ToolInput,
	type ToolResultContent,
	type ToolResultSubagentContent,
	type ToolResultTextContent,
	type UsageInfo,
	type Message,
} from './protocol/state.js';

// Re-export everything from the protocol state module
export {
	ChangesetOperationScope, ChangesetOperationStatus, ChangesetStatus, CustomizationLoadStatus,
	CustomizationType, MessageAttachmentKind, MessageKind,
	PendingMessageKind,
	PolicyState,
	ResponsePartKind,
	ChatInteractivity,
	ChatOriginKind,
	SessionLifecycle,
	SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus,
	ToolResultContentType,
	TurnState, type ActiveTurn, type AgentCustomization, type AgentCapabilities, type AgentInfo, type AgentSelection, type Annotation, type AnnotationEntry, type AnnotationOrigin, type AnnotationsState, type AnnotationsSummary, type Changeset, type ChangesetFile,
	type ChangesetOperation, type ChangesetState, type ChatState, type ChatSummary, type ChatOrigin, type ChildCustomization, type ClientPluginCustomization, type ConfigPropertySchema,
	type ConfigSchema,
	type ContentRef, type Customization, type CustomizationDegradedState,
	type CustomizationErrorState, type CustomizationLoadedState, type CustomizationLoadingState, type CustomizationLoadState, type DirectoryCustomization, type ErrorInfo, type HookCustomization, type FileEdit as ISessionFileDiff, type ToolResultEmbeddedResourceContent as IToolResultBinaryContent, type MarkdownResponsePart, type McpServerCustomization, type MessageAttachment,
	type MessageResourceAttachment, type MessageEmbeddedResourceAttachment, type MessageAnnotationsAttachment, type MessageChatAttachment, type ModelSelection, type PendingMessage, type PluginCustomization, type ProjectInfo, type PromptCustomization, type ReasoningResponsePart,
	type ErrorResponsePart, type ResponsePart,
	type RootState, type RuleCustomization, type SessionActiveClient,
	type AutomationState, type AutomationRunState,
	type SessionConfigState, type SessionModelInfo,
	type SessionState,
	type SessionSummary, type SkillCustomization, type Snapshot, type StringOrMarkdown, type TerminalState, type TextRange,
	type ToolAnnotations,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallPendingConfirmationState,
	type ToolCallPendingResultConfirmationState,
	type ToolCallResponsePart,
	type ToolCallResult,
	type ToolCallRiskAssessment,
	type ToolCallRiskAssessmentCompleteState,
	type ToolCallRiskAssessmentLoadingState,
	type ToolCallRunningState,
	type ToolCallState,
	type ToolCallStreamingState,
	type ToolCallContributor,
	type ToolDefinition, type ToolInput, type ToolResultContent,
	type ToolResultFileEditContent,
	type TerminalCommandResult,
	type ToolResultSubagentContent,
	type ToolResultTerminalContent,
	type ToolResultTextContent,
	type Turn, type URI, type UsageInfo,
	type Message
} from './protocol/state.js';

export function getErrorResponsePart(turn: Turn | ActiveTurn | undefined): ErrorResponsePart | undefined {
	if (!turn) {
		return undefined;
	}
	const part = turn.responseParts.at(-1);
	return part?.kind === ResponsePartKind.Error ? part : undefined;
}

export function createErrorResponsePart(error: ErrorInfo, resumable = false): ErrorResponsePart {
	return {
		kind: ResponsePartKind.Error,
		error,
		...(resumable ? { resumable: true } : {}),
	};
}

export function mergeLogicalTurnUsage(previous: UsageInfo | undefined, current: UsageInfo | undefined): UsageInfo | undefined {
	if (!previous) {
		return current;
	}
	if (!current) {
		return previous;
	}

	const previousMeta = readUsageInfoMeta(previous);
	const currentMeta = readUsageInfoMeta(current);
	const cost = sumDefined(previousMeta.cost, currentMeta.cost);
	const totalNanoAiu = sumDefined(previousMeta.copilotUsage?.totalNanoAiu, currentMeta.copilotUsage?.totalNanoAiu);
	const turnTokenTotals = mergeTurnTokenTotals(previousMeta.turnTokenTotals, currentMeta.turnTokenTotals);
	const directTotalNanoAiu = sumDefined(previousMeta.directCopilotUsage?.totalNanoAiu, currentMeta.directCopilotUsage?.totalNanoAiu);
	const directTurnTokenTotals = mergeTurnTokenTotals(previousMeta.directTurnTokenTotals, currentMeta.directTurnTokenTotals);
	const meta = previous._meta !== undefined || current._meta !== undefined ? {
		...previous._meta,
		...current._meta,
		...(cost !== undefined ? { cost } : {}),
		...(previousMeta.copilotUsage || currentMeta.copilotUsage ? {
			copilotUsage: {
				...previousMeta.copilotUsage,
				...currentMeta.copilotUsage,
				...(totalNanoAiu !== undefined ? { totalNanoAiu } : {}),
			},
		} : {}),
		...(turnTokenTotals ? { turnTokenTotals } : {}),
		...(directTotalNanoAiu !== undefined ? { directCopilotUsage: { totalNanoAiu: directTotalNanoAiu } } : {}),
		...(directTurnTokenTotals ? { directTurnTokenTotals } : {}),
	} : undefined;

	return {
		...previous,
		...current,
		model: current.model ?? previous.model,
		...(meta ? { _meta: meta } : {}),
	};
}

function sumDefined(first: number | undefined, second: number | undefined): number | undefined {
	return first === undefined ? second : second === undefined ? first : first + second;
}

function mergeTurnTokenTotals(previous: UsageInfoMeta['turnTokenTotals'], current: UsageInfoMeta['turnTokenTotals']): UsageInfoMeta['turnTokenTotals'] {
	if (!previous && !current) {
		return undefined;
	}
	const totals = new Map<string, ITurnTokenTotal>();
	for (const total of [...previous ?? [], ...current ?? []]) {
		const existing = totals.get(total.model);
		totals.set(total.model, existing ? {
			model: total.model,
			inputTokens: existing.inputTokens + total.inputTokens,
			cachedTokens: existing.cachedTokens + total.cachedTokens,
			outputTokens: existing.outputTokens + total.outputTokens,
		} : { ...total });
	}
	return [...totals.values()];
}

export {
	isHostNoticeTurn,
	isMessageHiddenFromTranscript,
	isMessageRequestHiddenFromTranscript,
	lastAttributableTurnId,
	readMessageSystemInitiatedLabel,
	withMessageHiddenFromTranscript,
	withMessageRequestHiddenFromTranscript,
	withMessageSystemInitiatedLabel,
} from '../meta/messageTranscriptMeta.js';
export { hasReportedUsage, readUsageInfoMeta } from '../meta/usageInfoMeta.js';
export type { IAutoModeResolvedInfo, IContextAttributionData, IContextAttributionEntry, ITurnTokenTotal, UsageInfoMeta } from '../meta/usageInfoMeta.js';

export {
	ChangesetOperationTargetKind, type ChangesetOperationFollowUp, type ChangesetOperationTarget
} from './protocol/commands.js';

// Canonical chat-input type names (the protocol renamed the former
// `SessionInput*` types to `ChatInput*` when input requests moved onto the
// chat channel). Re-exported here so consumers can import them from the glue
// layer.
export {
	ChatInputAnswerState,
	ChatInputAnswerValueKind,
	ChatInputQuestionKind,
	ChatInputResponseKind,
	type ChatInputAnswer,
	type ChatInputOption,
	type ChatInputQuestion,
	type ChatInputRequest,
	type InputRequestResponsePart,
} from './protocol/state.js';

// ---- File edit kind ---------------------------------------------------------

/**
 * The kind of file edit operation. Derived from the presence/absence of
 * `before`/`after` in {@link ToolResultFileEditContent}.
 */
export const enum FileEditKind {
	/** Content edit (same file URI, different content). */
	Edit = 'edit',
	/** File creation (no before state). */
	Create = 'create',
	/** File deletion (no after state). */
	Delete = 'delete',
	/** File rename/move (different before and after URIs). */
	Rename = 'rename',
}

// ---- Well-known URIs --------------------------------------------------------

/** URI for the root state subscription. */
export const ROOT_STATE_URI = 'ahp-root://';

/** Scheme used by {@link ROOT_STATE_URI}. */
export const AHP_ROOT_SCHEME = 'ahp-root';

/** Scheme used by resource-watch channel URIs (`ahp-resource-watch:/<encoded>`). */
export const AHP_RESOURCE_WATCH_SCHEME = 'ahp-resource-watch';

/**
 * Encode a resource-watch descriptor into its canonical channel URI. The
 * descriptor is serialised into the URI path so the receiver can recover
 * the watch parameters without any server-side bookkeeping — subscribe is
 * the only point where state is materialised (an `IFileService` watcher
 * is attached on the first subscriber and held through a grace window
 * after the last drops).
 */
export function buildResourceWatchChannelUri(descriptor: {
	readonly root: string;
	readonly recursive?: boolean;
	readonly excludes?: { items: readonly string[] };
	readonly includes?: { items: readonly string[] };
}): string {
	const payload: Record<string, unknown> = { root: descriptor.root };
	if (descriptor.recursive) { payload.recursive = true; }
	if (descriptor.excludes && descriptor.excludes.items.length > 0) {
		payload.excludes = [...descriptor.excludes.items];
	}
	if (descriptor.includes && descriptor.includes.items.length > 0) {
		payload.includes = [...descriptor.includes.items];
	}

	const json = encodeBase64(VSBuffer.fromString(JSON.stringify(payload)), false, true);
	return `${AHP_RESOURCE_WATCH_SCHEME}://r/${json}`;
}

/**
 * Inverse of {@link buildResourceWatchChannelUri}. Returns `undefined` if
 * `uri` is not a well-formed `ahp-resource-watch:` URI — callers should
 * surface that as a not-found error to the client.
 */
export function parseResourceWatchChannelUri(uri: string): {
	root: string;
	recursive: boolean;
	excludes?: { items: string[] };
	includes?: { items: string[] };
} | undefined {
	let parsed: ResourceURI;
	try {
		parsed = ResourceURI.parse(uri);
	} catch {
		return undefined;
	}
	if (parsed.scheme !== AHP_RESOURCE_WATCH_SCHEME) {
		return undefined;
	}
	const encoded = parsed.path.replace(/^\//, '');
	if (!encoded) {
		return undefined;
	}
	try {
		const payload = JSON.parse(decodeBase64(encoded).toString()) as { root?: unknown; recursive?: unknown; excludes?: unknown; includes?: unknown };
		if (typeof payload.root !== 'string') {
			return undefined;
		}

		return {
			root: payload.root,
			recursive: payload.recursive === true,
			...(Array.isArray(payload.excludes) ? { excludes: { items: payload.excludes.filter((x): x is string => typeof x === 'string') } } : {}),
			...(Array.isArray(payload.includes) ? { includes: { items: payload.includes.filter((x): x is string => typeof x === 'string') } } : {}),
		};
	} catch {
		return undefined;
	}
}

/** Returns `true` when `uri` identifies a resource-watch channel. */
export function isAhpResourceWatchChannel(uri: string): boolean {
	try {
		return ResourceURI.parse(uri).scheme === AHP_RESOURCE_WATCH_SCHEME;
	} catch {
		return false;
	}
}

/**
 * Returns `true` when `uri` identifies the root channel, regardless of
 * whether the caller passes the canonical wire form (`'ahp-root://'`) or a
 * variant that has been round-tripped through the workbench {@link URI} class
 * (which normalizes the authority-less form to `'ahp-root:'`). Always prefer
 * this helper over a direct `=== ROOT_STATE_URI` comparison so the two
 * spellings stay interchangeable.
 */
export function isAhpRootChannel(uri: string): boolean {
	if (uri === ROOT_STATE_URI) {
		return true;
	}
	try {
		return ResourceURI.parse(uri).scheme === AHP_ROOT_SCHEME;
	} catch {
		return false;
	}
}

/**
 * Mints a session-unique opaque id for a customization, derived from its
 * source URI and (when present) its `range` within the source. Plugins MAY
 * declare multiple children (e.g. MCP servers, hooks) inside the same
 * manifest file; including the range disambiguates them without an extra
 * mapping table.
 *
 * The range is appended as a reserved `#range=` query-style suffix; any
 * existing `#` in the URI is percent-encoded first so a source URI that
 * already contains a fragment cannot collide with a ranged id.
 */
export function customizationId(uri: string, range?: TextRange): string {
	if (!range) {
		return uri;
	}
	const safeUri = uri.replace(/#/g, '%23');
	return `${safeUri}#range=${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}

// ---- VS Code-specific derived types -----------------------------------------

/**
 * A tool call in a terminal state, stored in completed turns.
 */
export type ICompletedToolCall = ToolCallCompletedState | ToolCallCancelledState;

/**
 * Derived status type for the tool call lifecycle.
 */
export type ToolCallStatusString = ToolCallState['status'];

// ---- Tool output helper -----------------------------------------------------

/**
 * Extracts a plain-text tool output string from a tool call result's `content`
 * array. Joins all text-type content parts into a single string.
 *
 * Returns `undefined` if there are no text content parts.
 */
export function getToolOutputText(result: ToolCallResult): string | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}

	const textParts: ToolResultTextContent[] = [];
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Text) {
			textParts.push(c);
		}
	}
	if (textParts.length === 0) {
		return undefined;
	}
	return textParts.map(p => p.text).join('\n');
}

/** Returns inline tool input, leaving referenced content to asynchronous consumers. */
export function getInlineToolInput(toolInput: ToolInput | undefined): string | undefined {
	return typeof toolInput === 'string' ? toolInput : undefined;
}

/**
 * Extracts file edit content entries from a tool call result's `content` array.
 * Returns an empty array if there are no file edit content parts.
 */
export function getToolFileEdits(result: ToolCallResult): ToolResultFileEditContent[] {
	if (!result.content || result.content.length === 0) {
		return [];
	}
	const edits: ToolResultFileEditContent[] = [];
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.FileEdit) {
			edits.push(c);
		}
	}
	return edits;
}

/**
 * Extracts the first subagent content entry from a tool call's `content` array.
 * Works with both completed tool call results and running tool call states.
 * Returns `undefined` if there are no subagent content parts.
 */
export function getToolSubagentContent(result: { content?: readonly ToolResultContent[] }): ToolResultSubagentContent | undefined {
	if (!result.content || result.content.length === 0) {
		return undefined;
	}
	for (const c of result.content) {
		if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent) {
			return c as ToolResultSubagentContent;
		}
	}
	return undefined;
}

// ---- Subagent URI helpers ---------------------------------------------------

const SUBAGENT_URI_SEGMENT = 'subagent';
const SUBAGENT_URI_MARKER = `/${SUBAGENT_URI_SEGMENT}/`;
const SUBAGENT_URI_PATH_REGEX = /^(?<parentPath>.+)\/subagent\/(?<toolCallId>.+)$/;

function asResourceUri(uri: ProtocolURI | ResourceURI): ResourceURI {
	return typeof uri === 'string' ? ResourceURI.parse(uri) : uri;
}

function getSubagentBasePath(parentSession: ProtocolURI | ResourceURI): { parent: ResourceURI; path: string } {
	const parent = asResourceUri(parentSession);
	const parentPath = parent.path.endsWith('/') ? parent.path.slice(0, -1) : parent.path;
	return { parent, path: `${parentPath}${SUBAGENT_URI_MARKER}` };
}

/**
 * Builds a subagent session URI from a parent session URI and tool call ID.
 * Convention: `{parentSessionUri}/subagent/{toolCallId}`
 */
export function buildSubagentSessionUri(parentSession: ProtocolURI | ResourceURI, toolCallId: string): string {
	const { parent, path } = getSubagentBasePath(parentSession);
	return parent.with({ path: `${path}${toolCallId}` }).toString();
}

/**
 * Parses a subagent session URI into its parent session URI and tool call ID.
 * Returns `undefined` if the URI does not follow the subagent convention.
 */
export function parseSubagentSessionUri(uri: ProtocolURI | ResourceURI): { parentSession: ResourceURI; toolCallId: string } | undefined {
	const resource = asResourceUri(uri);
	const match = SUBAGENT_URI_PATH_REGEX.exec(resource.path);
	if (!match?.groups) {
		return undefined;
	}
	return {
		parentSession: resource.with({ path: match.groups.parentPath }),
		toolCallId: match.groups.toolCallId,
	};
}

/**
 * Returns whether a session URI represents a subagent session.
 */
export function isSubagentSession(uri: ProtocolURI | ResourceURI): boolean {
	return parseSubagentSessionUri(uri) !== undefined;
}

/**
 * Builds the string prefix used by the state manager for cached subagent sessions.
 */
export function buildSubagentSessionUriPrefix(parentSession: ProtocolURI | ResourceURI): string {
	const { parent, path } = getSubagentBasePath(parentSession);
	return parent.with({ path }).toString();
}

// ---- Factory helpers --------------------------------------------------------

export function createRootState(): RootState {
	return {
		agents: [],
		activeSessions: 0,
	};
}

/**
 * Creates the initial flat {@link SessionState} for a session from its
 * root-channel {@link SessionSummary} catalog entry. Session metadata
 * ({@link SessionMetadata}) — and the shared `_meta` bag — are inlined directly
 * onto the state.
 */
export function createSessionState(summary: SessionSummary): SessionState {
	const state: SessionState = {
		provider: summary.provider,
		title: summary.title,
		status: summary.status,
		lifecycle: SessionLifecycle.Creating,
		activeClients: [],
		chats: [],
		defaultChat: undefined,
	};
	if (summary.activity !== undefined) { state.activity = summary.activity; }
	if (summary.project !== undefined) { state.project = summary.project; }
	if (summary.workingDirectories !== undefined) { state.workingDirectories = summary.workingDirectories; }
	if (summary.annotations !== undefined) { state.annotations = summary.annotations; }
	if (summary._meta !== undefined) { state._meta = summary._meta; }
	return state;
}

/**
 * Creates an empty {@link ChatState} for a chat. The summary fields are
 * denormalized onto the chat state per the protocol contract; callers pass
 * the chat's catalog summary and this seeds an empty conversation.
 */
export function createChatState(summary: ChatSummary): ChatState {
	return {
		resource: summary.resource,
		title: summary.title,
		status: summary.status,
		activity: summary.activity,
		modifiedAt: summary.modifiedAt,
		origin: summary.origin,
		interactivity: summary.interactivity,
		workingDirectories: summary.workingDirectories,
		turns: [],
		activeTurn: undefined,
	};
}

/**
 * Derives the default-chat {@link ChatSummary} for a session from its
 * {@link SessionSummary}. The default chat inherits the session's title,
 * status, activity and working directory, and is marked as a
 * {@link ChatOriginKind.User | user-originated} chat. Both the session and
 * chat `modifiedAt` are ISO-8601 strings, so it is carried over directly.
 */
export function createDefaultChatSummary(session: SessionSummary, chatUri: ProtocolURI): ChatSummary {
	const summary: ChatSummary = {
		resource: chatUri,
		title: session.title,
		status: session.status,
		modifiedAt: session.modifiedAt,
		origin: { kind: ChatOriginKind.User },
	};
	if (session.activity !== undefined) { summary.activity = session.activity; }
	// `workingDirectories` is deliberately NOT copied: per the protocol it is a
	// per-chat SUBSET override and, when absent, the chat inherits the session's
	// full set of working directories (see `mergeSessionWithDefaultChat`).
	// Seeding it here would denormalize the session default onto every chat as a
	// fake override, which then goes stale when the session's working
	// directories are resolved later (e.g. a worktree resolved at
	// materialization).
	return summary;
}

/** Activity bits (0-4) of {@link SessionStatus}; the high bits carry orthogonal flags (IsRead / IsArchived). */
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;

/** Whether the active turn has a `PendingConfirmation` tool call auto-approved by the session's bypass setting. */
function hasAutoApprovedPendingConfirmation(state: ChatState): boolean {
	return !!state.activeTurn?.responseParts.some(part =>
		part.kind === ResponsePartKind.ToolCall
		&& part.toolCall.status === ToolCallStatus.PendingConfirmation
		&& readToolCallMeta(part.toolCall).autoApproveBySetting === true,
	);
}

/** Whether the chat is genuinely blocked on user input (an open input request, an auth-required tool, or a non-auto-approved confirmation gate). */
function chatAwaitsUserInput(state: ChatState): boolean {
	return !!state.activeTurn?.responseParts.some(part => {
		// An open elicitation always awaits the user until it is answered.
		if (part.kind === ResponsePartKind.InputRequest) {
			return part.response === undefined;
		}
		if (part.kind !== ResponsePartKind.ToolCall) {
			return false;
		}
		const status = part.toolCall.status;
		// Result-confirmation and auth-required gates always require the user; a
		// parameter-confirmation gate only when it was not auto-approved.
		if (status === ToolCallStatus.PendingResultConfirmation || status === ToolCallStatus.AuthRequired) {
			return true;
		}
		return status === ToolCallStatus.PendingConfirmation
			&& readToolCallMeta(part.toolCall).autoApproveBySetting !== true;
	});
}

/**
 * Projects a chat's status for session-summary aggregation, demoting an
 * `InputNeeded` back to `InProgress` only when it is caused solely by an
 * auto-approved confirmation — otherwise a session with bypass approvals flashes
 * "input needed" in the sessions list while an auto-approved tool runs.
 */
function chatSummaryStatus(state: ChatState): SessionStatus {
	const status = state.status;
	if ((status & SessionStatus.InputNeeded) !== SessionStatus.InputNeeded) {
		return status;
	}
	// Only demote when we can positively attribute the InputNeeded to an
	// auto-approved confirmation with no genuine blocker present; otherwise (e.g.
	// a restored summary whose activeTurn is not loaded) preserve the status.
	if (hasAutoApprovedPendingConfirmation(state) && !chatAwaitsUserInput(state)) {
		return (status & ~STATUS_ACTIVITY_MASK) | SessionStatus.InProgress;
	}
	return status;
}

/**
 * Derives a {@link ChatSummary} from a fully-populated {@link ChatState} by
 * projecting out the denormalized summary fields. Used to keep the parent
 * session's `chats` catalog in sync with a chat's denormalized state.
 */
export function chatSummaryFromState(state: ChatState): ChatSummary {
	const summary: ChatSummary = {
		resource: state.resource,
		title: state.title,
		status: chatSummaryStatus(state),
		modifiedAt: state.modifiedAt,
	};
	if (state.activity !== undefined) { summary.activity = state.activity; }
	if (state.origin !== undefined) { summary.origin = state.origin; }
	if (state.interactivity !== undefined) { summary.interactivity = state.interactivity; }
	if (state.workingDirectories !== undefined) { summary.workingDirectories = state.workingDirectories; }
	return summary;
}

/**
 * The effective interactivity of a chat given its session's archived state.
 *
 * `interactivity` is the general read-only mechanism (e.g. subagent worker
 * chats are `ReadOnly`). An archived session is read-only too, so its
 * interactive chats are downgraded to `ReadOnly`. `Hidden` chats stay hidden —
 * archiving only downgrades `Full` chats. Absent interactivity defaults to
 * `Full` for backward compatibility.
 *
 * The host uses this to enforce read-only turns off a single signal
 * ({@link isChatReadOnly}) rather than special-casing archived; the same rule
 * is mirrored client-side to hide the composer.
 */
export function effectiveChatInteractivity(interactivity: ChatInteractivity | undefined, sessionArchived: boolean): ChatInteractivity {
	if (interactivity === ChatInteractivity.Hidden) {
		return ChatInteractivity.Hidden;
	}
	if (sessionArchived) {
		return ChatInteractivity.ReadOnly;
	}
	return interactivity ?? ChatInteractivity.Full;
}

/**
 * Whether a chat rejects user-dispatched turns, given its own interactivity and
 * its session's archived state. `true` for `ReadOnly` chats (including archived
 * sessions' interactive chats). See {@link effectiveChatInteractivity}.
 */
export function isChatReadOnly(interactivity: ChatInteractivity | undefined, sessionArchived: boolean): boolean {
	return effectiveChatInteractivity(interactivity, sessionArchived) === ChatInteractivity.ReadOnly;
}

export function createActiveTurn(id: string, message: Message, startedAt: string): ActiveTurn {
	return {
		id,
		startedAt,
		message,
		responseParts: [],
		usage: undefined,
	};
}

export function getTurnError(turn: Turn | undefined): ErrorInfo | undefined {
	if (turn?.state !== TurnState.Error) {
		return undefined;
	}
	const part = turn.responseParts[turn.responseParts.length - 1];
	return part?.kind === ResponsePartKind.Error ? part.error : readLegacyTurnError(turn);
}

export const enum StateComponents {
	Root,
	Session,
	Chat,
	Terminal,
	Changeset,
	Annotations,
	AutomationCatalog,
	AutomationRun,
}

export type ComponentToState = {
	[StateComponents.Root]: RootState;
	[StateComponents.Session]: SessionState;
	[StateComponents.Chat]: ChatState;
	[StateComponents.Terminal]: TerminalState;
	[StateComponents.Changeset]: ChangesetState;
	[StateComponents.Annotations]: AnnotationsState;
	[StateComponents.AutomationCatalog]: AutomationState;
	[StateComponents.AutomationRun]: AutomationRunState;
};

// ---- Default chat URI helpers ----------------------------------------------

/**
 * Singleton channel containing the host-owned automation catalogue.
 */
export const AHP_AUTOMATIONS_SCHEME = 'ahp-automations';
export const AUTOMATION_CATALOG_URI = `${AHP_AUTOMATIONS_SCHEME}://`;

/**
 * Returns whether `uri` identifies the singleton automation catalogue channel,
 * including forms normalized by the workbench {@link ResourceURI} class.
 */
export function isAhpAutomationCatalogChannel(uri: string): boolean {
	if (uri === AUTOMATION_CATALOG_URI) {
		return true;
	}
	try {
		return ResourceURI.parse(uri).scheme === AHP_AUTOMATIONS_SCHEME;
	} catch {
		return false;
	}
}

/** Returns whether `uri` identifies one automation-run channel. */
export function isAhpAutomationRunChannel(uri: string): boolean {
	try {
		return ResourceURI.parse(uri).scheme === 'ahp-automation-run';
	} catch {
		return false;
	}
}

/** Scheme used by chat channel URIs (`ahp-chat://...`). */
export const AHP_CHAT_SCHEME = 'ahp-chat';

/** Chat id of the default chat that every session owns. */
export const DEFAULT_CHAT_ID = 'default';

/**
 * Derives the deterministic channel URI for a chat within a session. Every chat
 * — the default chat and any additional peer chats — encodes its owning session
 * URI into the path so producers and consumers can recover the session without a
 * lookup table (see {@link parseChatUri}). The chat id is carried in the URI
 * authority.
 *
 * `ahp-chat://<chatId>/<base64(sessionUri)>`
 */
export function buildChatUri(sessionUri: ProtocolURI | ResourceURI, chatId: string): string {
	const session = typeof sessionUri === 'string' ? sessionUri : sessionUri.toString();
	const encoded = encodeBase64(VSBuffer.fromString(session), false, true);
	return `${AHP_CHAT_SCHEME}://${chatId}/${encoded}`;
}

/**
 * Derives the deterministic default-chat channel URI for a session. While the
 * protocol allows a session to contain many chats, every session always owns a
 * default chat whose URI is derived from the owning session URI so producers and
 * consumers can compute it without a lookup table.
 *
 * The session URI is encoded into the path so {@link parseChatUri} can recover
 * it.
 */
export function buildDefaultChatUri(sessionUri: ProtocolURI | ResourceURI): string {
	return buildChatUri(sessionUri, DEFAULT_CHAT_ID);
}

const SUBAGENT_CHAT_ID = 'subagent';

export function isSubagentChatUri(uri: ProtocolURI | ResourceURI): boolean {
	const parsed = typeof uri === 'string' ? ResourceURI.parse(uri) : uri;
	return parsed.scheme === AHP_CHAT_SCHEME && parsed.authority === SUBAGENT_CHAT_ID;
}

export function buildSubagentChatUri(sessionUri: ProtocolURI | ResourceURI, toolCallId: string): string {
	const session = typeof sessionUri === 'string' ? sessionUri : sessionUri.toString();
	const encoded = encodeBase64(VSBuffer.fromString(session), false, true);
	return `${AHP_CHAT_SCHEME}://${SUBAGENT_CHAT_ID}/${encoded}/${encodeURIComponent(toolCallId)}`;
}

/**
 * Inverse of {@link buildChatUri}: recovers the owning session URI and chat id
 * from any chat channel URI. Returns `undefined` when `uri` is not a well-formed
 * chat URI.
 */
export function parseChatUri(uri: ProtocolURI | ResourceURI): { session: string; chatId: string } | undefined {
	let parsed: ResourceURI;
	try {
		parsed = typeof uri === 'string' ? ResourceURI.parse(uri) : uri;
	} catch {
		return undefined;
	}
	if (parsed.scheme !== AHP_CHAT_SCHEME || !parsed.authority) {
		return undefined;
	}
	const encoded = parsed.path.replace(/^\//, '');
	if (!encoded) {
		return undefined;
	}
	try {
		if (parsed.authority === SUBAGENT_CHAT_ID) {
			const [sessionPart, ...toolCallIdParts] = encoded.split('/');
			const toolCallId = toolCallIdParts.join('/');
			if (!sessionPart || !toolCallId) {
				return undefined;
			}
			return { session: decodeBase64(sessionPart).toString(), chatId: `${SUBAGENT_CHAT_ID}/${decodeURIComponent(toolCallId)}` };
		}
		return { session: decodeBase64(encoded).toString(), chatId: parsed.authority };
	} catch {
		return undefined;
	}
}

/**
 * Inverse of {@link buildDefaultChatUri}: recovers the owning session URI from a
 * chat channel URI. Returns `undefined` when `uri` is not a well-formed chat URI.
 * Accepts any chat URI (default or additional) so callers that only need the
 * parent session can use it uniformly.
 */
export function parseDefaultChatUri(uri: ProtocolURI | ResourceURI): string | undefined {
	return parseChatUri(uri)?.session;
}

export function parseRequiredSessionUriFromChatUri(uri: ProtocolURI | ResourceURI): string {
	const session = parseDefaultChatUri(uri);
	if (session === undefined) {
		throw new Error(`Malformed AHP chat URI: ${typeof uri === 'string' ? uri : uri.toString()}`);
	}
	return session;
}

/** Returns `true` when `uri` is the default chat of its session. */
export function isDefaultChatUri(uri: ProtocolURI | ResourceURI): boolean {
	return parseChatUri(uri)?.chatId === DEFAULT_CHAT_ID;
}

export function getSessionChatResource(state: Pick<SessionState, 'defaultChat'> & { readonly chats: readonly Pick<ChatSummary, 'resource'>[] }, chatId: string): ProtocolURI | undefined {
	return chatId === DEFAULT_CHAT_ID
		? state.defaultChat ?? state.chats.find(chat => isDefaultChatUri(chat.resource))?.resource
		: state.chats.find(chat => parseChatUri(chat.resource)?.chatId === chatId)?.resource;
}

/**
 * Resolves a feature-level `(session, chat)` pair to the single chat URI used by
 * the agent session/chat surface. A session always owns a DEFAULT chat addressed
 * by the session URI itself; additional (peer) chats are addressed by their own
 * chat channel URIs. This is the one place default-chat resolution lives so
 * agents never re-derive "is this the default chat?".
 */
export function resolveChatUri(session: ResourceURI, chat: ResourceURI): ResourceURI {
	return isDefaultChatUri(chat) ? session : chat;
}

/**
 * Resolves the URI a chat's persisted data is stored under — the same
 * {@link resolveChatUri} rule applied to a chat channel URI alone, recovering
 * the owning session from the channel. Agents key their per-session database
 * and data directory by this value, so anything reading or writing that storage
 * from outside the agent must derive it the same way. Returns `undefined` when
 * `chatChannel` is not a parseable chat channel URI.
 */
export function chatStorageUri(chatChannel: ProtocolURI | ResourceURI): ResourceURI | undefined {
	const parsed = parseChatUri(chatChannel);
	if (!parsed) {
		return undefined;
	}
	return resolveChatUri(ResourceURI.parse(parsed.session), ResourceURI.parse(chatChannel.toString()));
}

/** Returns `true` when `uri` identifies a chat channel. */
export function isAhpChatChannel(uri: string): boolean {
	try {
		return ResourceURI.parse(uri).scheme === AHP_CHAT_SCHEME;
	} catch {
		return false;
	}
}

// ---- Session + default-chat composite --------------------------------------

/**
 * A single chat's effective session context: the shared {@link SessionState}
 * (working directories, active clients, config, customizations/MCP scope, …)
 * resolved for one chat and merged with that chat's conversation contents.
 *
 * The protocol moved turns and pending state off the session and onto a
 * per-chat channel, and lets a chat override the session's working directories
 * with a subset (e.g. {@link ChatState.workingDirectories}). This composite
 * recombines the session with one of its chats — default or peer — so consumers
 * read the chat's effective context and conversation through one object without
 * walking back to the session to re-derive shared state. The
 * {@link ISessionWithDefaultChat.workingDirectories} carry the chat's *effective*
 * working directories (its own subset override when present, else the session's
 * full set).
 */
export interface ISessionWithDefaultChat extends SessionState {
	/** Completed turns of this chat. */
	turns: Turn[];
	/** Currently in-progress turn of this chat. */
	activeTurn?: ActiveTurn;
	/** Steering message pending on this chat. */
	steeringMessage?: PendingMessage;
	/** Queued messages pending on this chat. */
	queuedMessages?: PendingMessage[];
	/** Draft input of this chat. */
	draft?: Message;
}

/**
 * Projects a {@link SessionState} and one of its {@link ChatState | chats}
 * (default or peer) into that chat's {@link ISessionWithDefaultChat | effective
 * session context}. Per-chat overrides (the working-directories subset) are
 * layered over the session defaults, and the conversation fields are taken from
 * the chat. When the chat state is absent (e.g. not yet hydrated) the
 * conversation fields default to empty and the session defaults apply.
 */
export function mergeSessionWithDefaultChat(session: SessionState, chat: ChatState | undefined): ISessionWithDefaultChat {
	return {
		...session,
		workingDirectories: chat?.workingDirectories ?? session.workingDirectories,
		turns: chat?.turns ?? [],
		activeTurn: chat?.activeTurn,
		steeringMessage: chat?.steeringMessage,
		queuedMessages: chat?.queuedMessages,
		draft: chat?.draft,
	};
}

/**
 * Resolves the active turn of a session's default chat, if any.
 */
export function getActiveTurn(chat: ChatState | undefined): ActiveTurn | undefined {
	return chat?.activeTurn;
}

/**
 * Resolves the default chat's catalog summary from a session, if present.
 */
export function getDefaultChat(session: SessionState): ChatSummary | undefined {
	if (session.defaultChat !== undefined) {
		const match = session.chats.find(c => c.resource === session.defaultChat);
		if (match) {
			return match;
		}
	}
	return session.chats[0];
}

// ---- SessionMeta accessors -------------------------------------------------

export {
	AH_META_CREATED_BY_SESSION_DB_KEY,
	AH_META_EHCLI_ADOPTED_DB_KEY,
	AH_META_EHCLI_LAST_TURN_DB_KEY,
	AH_META_HAS_WORKSPACE_TRANSITIONS_DB_KEY,
	AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY,
	AH_META_WORKSPACELESS_DB_KEY,
	MAX_SESSION_PULL_REQUEST_REFERENCES,
	SESSION_META_CREATED_BY_SESSION_KEY,
	SESSION_META_EHCLI_ADOPTABLE_KEY,
	SESSION_META_EHCLI_ADOPTED_KEY,
	SESSION_META_EHCLI_LAST_TURN_KEY,
	SESSION_META_EXTERNAL_KEY,
	SESSION_META_FOLDER_PICKER_KEY,
	SESSION_META_GIT_KEY,
	SESSION_META_GITHUB_KEY,
	SESSION_META_HAS_WORKSPACE_TRANSITIONS_KEY,
	SESSION_META_MULTI_ROOT_KEY,
	SESSION_META_PROMPT_CACHE_KEY,
	SESSION_META_SOURCE_CONTROL_KEY,
	SESSION_META_SPAWN_DEPTH_KEY,
	SESSION_META_WORKSPACELESS_KEY,
	getSessionRelatedPullRequestUrls,
	hasSessionPullRequestForBranch,
	needsSessionGitStateRefresh,
	parseSessionCreationReference,
	parseSessionFolderPickerDecision,
	parseSessionMultiRootMetadata,
	readSessionCreationReference,
	readSessionEhcliAdoptable,
	readSessionEhcliAdopted,
	readSessionEhcliLastMigratedTurn,
	readSessionExternal,
	readSessionFolderPickerDecision,
	readSessionGitHubState,
	readSessionGitState,
	readSessionHasWorkspaceTransitions,
	readSessionMatchesByProjectRoot,
	readSessionMultiRootMetadata,
	readSessionPromptCacheState,
	readSessionSourceControlState,
	readSessionSpawnDepth,
	readSessionWorkspaceless,
	withInitialSessionPullRequest,
	withMostRecentRelatedSessionPullRequest,
	withMostRecentSessionPullRequest,
	withSessionCreationReference,
	withSessionEhcliAdoptable,
	withSessionEhcliAdopted,
	withSessionEhcliLastMigratedTurn,
	withSessionExternal,
	withSessionFolderPickerDecision,
	withSessionGitHubState,
	withSessionGitState,
	withSessionHasWorkspaceTransitions,
	withSessionMultiRootMetadata,
	withSessionPromptCacheState,
	withSessionSourceControlState,
	withSessionSpawnDepth,
	withSessionWorkspaceless,
	SessionSourceControlOutcome,
} from '../meta/sessionMeta.js';
export type {
	ISessionCreationReference,
	ISessionFolderPickerDecision,
	ISessionGitHubState,
	ISessionGitState,
	ISessionMultiRootMetadata,
	ISessionPromptCacheState,
	ISessionSourceControlState,
	SessionMeta,
	SessionSummaryMeta,
} from '../meta/sessionMeta.js';

/**
 * Session-database metadata key recording whether a session is archived. Written by
 * the AH orchestrator (`AgentSideEffects` on `SessionIsArchivedChanged`) and read by
 * both the orchestrator (`AgentService` restore/list) and agents (e.g. `CopilotAgent`
 * decides whether to recreate a missing worktree vs. resume read-only for history).
 * {@link AH_META_IS_DONE_DB_KEY} is the legacy name kept for sessions persisted before
 * the rename; readers fall back to it when {@link AH_META_IS_ARCHIVED_DB_KEY} is absent.
 */
export const AH_META_IS_ARCHIVED_DB_KEY = 'isArchived';

/** Legacy metadata key for the archived flag; see {@link AH_META_IS_ARCHIVED_DB_KEY}. */
export const AH_META_IS_DONE_DB_KEY = 'isDone';

/**
 * Session-database metadata key recording whether a session has been read. This is
 * the only durable representation of read state; the in-memory truth is
 * {@link SessionStatus.IsRead}. The host owns it — no agent SDK tracks read state.
 */
export const AH_META_IS_READ_DB_KEY = 'isRead';

/** Returns `status` with `flag` set or cleared. */
export function withSessionStatusFlag(status: SessionStatus, flag: SessionStatus, set: boolean): SessionStatus {
	return set ? (status | flag) : (status & ~flag);
}

/** Whether the {@link SessionStatus.IsRead} flag bit is set. */
export function isSessionStatusRead(status: SessionStatus | undefined): boolean {
	return status !== undefined && (status & SessionStatus.IsRead) !== 0;
}

/** Whether the {@link SessionStatus.IsArchived} flag bit is set. */
export function isSessionStatusArchived(status: SessionStatus | undefined): boolean {
	return status !== undefined && (status & SessionStatus.IsArchived) !== 0;
}

// ---- RootState _meta accessors ---------------------------------------------

export {
	ROOT_META_HOST_BUILD_KEY,
	formatHostBuildInfo,
	hostBuildInfoFromProduct,
	readHostBuildInfo,
	withHostBuildInfo,
} from '../meta/rootStateMeta.js';
export type { IHostBuildInfo, RootMeta } from '../meta/rootStateMeta.js';
