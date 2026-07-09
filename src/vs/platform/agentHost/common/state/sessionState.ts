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
import { hasKey, type Mutable } from '../../../../base/common/types.js';
import { URI as ResourceURI } from '../../../../base/common/uri.js';
import type { IProductService } from '../../../product/common/productService.js';
import {
	SessionLifecycle,
	TerminalState,
	ToolResultContentType,
	ToolResultFileEditContent,
	ChatOriginKind,
	type ActiveTurn,
	type ChangesetState,
	type ChatState,
	type ChatSummary,
	type ChatInputRequest,
	type PendingMessage,
	type Turn,
	type AnnotationsState,
	type URI as ProtocolURI,
	type RootState,
	type SessionState,
	type SessionSummary,
	type TextRange,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallResult,
	type ToolCallState,
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
	ChatInputAnswerState as SessionInputAnswerState,
	ChatInputAnswerValueKind as SessionInputAnswerValueKind,
	ChatInputQuestionKind as SessionInputQuestionKind,
	ChatInputResponseKind as SessionInputResponseKind,
	ChatOriginKind,
	SessionLifecycle,
	SessionStatus, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus,
	ToolResultContentType,
	TurnState, type ActiveTurn, type AgentCustomization, type AgentCapabilities, type AgentInfo, type AgentSelection, type Annotation, type AnnotationEntry, type AnnotationsState, type AnnotationsSummary, type Changeset, type ChangesetFile,
	type ChangesetOperation, type ChangesetState, type ChatState, type ChatSummary, type ChatInteractivity, type ChatOrigin, type ChildCustomization, type ClientPluginCustomization, type ConfigPropertySchema,
	type ConfigSchema,
	type ContentRef, type Customization, type CustomizationDegradedState,
	type CustomizationErrorState, type CustomizationLoadedState, type CustomizationLoadingState, type CustomizationLoadState, type DirectoryCustomization, type ErrorInfo, type HookCustomization, type FileEdit as ISessionFileDiff, type ToolResultEmbeddedResourceContent as IToolResultBinaryContent, type MarkdownResponsePart, type McpServerCustomization, type MessageAttachment,
	type MessageResourceAttachment, type MessageEmbeddedResourceAttachment, type MessageAnnotationsAttachment, type ModelSelection, type PendingMessage, type PluginCustomization, type ProjectInfo, type PromptCustomization, type ReasoningResponsePart,
	type ResponsePart,
	type RootState, type RuleCustomization, type SessionActiveClient,
	type SessionConfigState, type ChatInputAnswer as SessionInputAnswer,
	type ChatInputOption as SessionInputOption, type ChatInputQuestion as SessionInputQuestion, type ChatInputRequest as SessionInputRequest, type SessionModelInfo,
	type SessionState,
	type SessionSummary, type SkillCustomization, type Snapshot, type StringOrMarkdown, type TerminalState, type TextRange,
	type ToolAnnotations,
	type ToolCallCancelledState,
	type ToolCallCompletedState,
	type ToolCallPendingConfirmationState,
	type ToolCallPendingResultConfirmationState,
	type ToolCallResponsePart,
	type ToolCallResult,
	type ToolCallRunningState,
	type ToolCallState,
	type ToolCallStreamingState,
	type ToolCallContributor,
	type ToolDefinition, type ToolResultContent,
	type ToolResultFileEditContent,
	type ToolResultTerminalCompleteContent,
	type ToolResultSubagentContent,
	type ToolResultTerminalContent,
	type ToolResultTextContent,
	type Turn, type URI, type UsageInfo,
	type Message
} from './protocol/state.js';

/**
 * Well-known keys that may appear on {@link UsageInfo._meta}.
 * Clients MAY read these to provide enhanced UI (e.g. credit cost display).
 */
export interface UsageInfoMeta {
	/** Per-turn credit cost reported by the backend. */
	cost?: number;
	/** Copilot-specific usage breakdown, including nano-AIU totals. */
	copilotUsage?: {
		totalNanoAiu?: number;
		[key: string]: unknown;
	};
	/**
	 * Per-category account quota snapshots reported by the backend on the
	 * model-call usage event, keyed by quota type (e.g. `chat`,
	 * `premium_interactions`). Clients MAY use these to keep the account quota
	 * UI current without a separate quota fetch.
	 */
	quotaSnapshots?: {
		[quotaType: string]: {
			readonly isUnlimitedEntitlement?: boolean;
			readonly entitlementRequests?: number;
			readonly usedRequests?: number;
			readonly remainingPercentage?: number;
			readonly overage?: number;
			readonly overageAllowedWithExhaustedQuota?: boolean;
			/** ISO 8601 date when the quota resets, if applicable. */
			readonly resetDate?: string;
		} | undefined;
	};
	/**
	 * Per-source context-window attribution breakdown reported by the SDK's
	 * `session.rpc.metadata.getContextAttribution()`. Populated asynchronously
	 * after each usage event and piped to the context-usage widget as
	 * `promptTokenDetails`.
	 */
	contextAttribution?: IContextAttributionData;
	[key: string]: unknown;
}

/**
 * Mirrors the SDK's `SessionContextAttribution` shape — a flat list of
 * per-source entries describing what occupies the session's context window.
 */
export interface IContextAttributionData {
	readonly totalTokens: number;
	readonly entries: readonly IContextAttributionEntry[];
	readonly compactions: { readonly count: number };
}

export interface IContextAttributionEntry {
	readonly kind: string;
	readonly id: string;
	readonly label: string;
	readonly tokens: number;
	readonly parentId?: string;
	readonly attributes?: Readonly<Record<string, string | undefined>>;
}

type AccountQuotaSnapshot = NonNullable<NonNullable<UsageInfoMeta['quotaSnapshots']>[string]>;

function readAccountQuotaSnapshot(value: unknown): AccountQuotaSnapshot | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const snapshot: Mutable<AccountQuotaSnapshot> = {};
	if (typeof raw['isUnlimitedEntitlement'] === 'boolean') { snapshot.isUnlimitedEntitlement = raw['isUnlimitedEntitlement']; }
	if (typeof raw['entitlementRequests'] === 'number') { snapshot.entitlementRequests = raw['entitlementRequests']; }
	if (typeof raw['usedRequests'] === 'number') { snapshot.usedRequests = raw['usedRequests']; }
	if (typeof raw['remainingPercentage'] === 'number') { snapshot.remainingPercentage = raw['remainingPercentage']; }
	if (typeof raw['overage'] === 'number') { snapshot.overage = raw['overage']; }
	if (typeof raw['overageAllowedWithExhaustedQuota'] === 'boolean') { snapshot.overageAllowedWithExhaustedQuota = raw['overageAllowedWithExhaustedQuota']; }
	if (typeof raw['resetDate'] === 'string') { snapshot.resetDate = raw['resetDate']; }
	return snapshot;
}

/**
 * Reads the well-known {@link UsageInfoMeta} keys from a usage report's open
 * `_meta` bag, ignoring unrelated provider-specific keys and validating each
 * field's type. Always read {@link UsageInfo._meta} through this helper rather
 * than casting the bag to {@link UsageInfoMeta}, so a malformed or partial bag
 * degrades to absent fields instead of producing values of the wrong runtime
 * type. Returns an empty object when the bag is absent.
 */
export function readUsageInfoMeta(usage: UsageInfo | undefined): UsageInfoMeta {
	const meta = usage?._meta;
	if (!meta) {
		return {};
	}
	const result: Mutable<UsageInfoMeta> = {};
	if (typeof meta['cost'] === 'number') { result.cost = meta['cost']; }
	const copilotUsage = meta['copilotUsage'];
	if (copilotUsage && typeof copilotUsage === 'object' && !Array.isArray(copilotUsage)) {
		const rawUsage = copilotUsage as Record<string, unknown>;
		const usage: Mutable<NonNullable<UsageInfoMeta['copilotUsage']>> = {};
		if (typeof rawUsage['totalNanoAiu'] === 'number') { usage.totalNanoAiu = rawUsage['totalNanoAiu']; }
		result.copilotUsage = usage;
	}
	const quotaSnapshots = meta['quotaSnapshots'];
	if (quotaSnapshots && typeof quotaSnapshots === 'object' && !Array.isArray(quotaSnapshots)) {
		const snapshots: Mutable<NonNullable<UsageInfoMeta['quotaSnapshots']>> = {};
		for (const [quotaType, value] of Object.entries(quotaSnapshots as Record<string, unknown>)) {
			snapshots[quotaType] = readAccountQuotaSnapshot(value);
		}
		result.quotaSnapshots = snapshots;
	}
	const contextAttribution = readContextAttribution(meta['contextAttribution']);
	if (contextAttribution) {
		result.contextAttribution = contextAttribution;
	}
	return result;
}

function readContextAttribution(value: unknown): IContextAttributionData | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['totalTokens'] !== 'number' || !Array.isArray(raw['entries'])) {
		return undefined;
	}
	const entries: IContextAttributionEntry[] = [];
	for (const item of raw['entries']) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			continue;
		}
		const entry = item as Record<string, unknown>;
		if (typeof entry['kind'] !== 'string' || typeof entry['id'] !== 'string'
			|| typeof entry['label'] !== 'string' || typeof entry['tokens'] !== 'number') {
			continue;
		}
		entries.push({
			kind: entry['kind'],
			id: entry['id'],
			label: entry['label'],
			tokens: entry['tokens'],
			parentId: typeof entry['parentId'] === 'string' ? entry['parentId'] : undefined,
			attributes: entry['attributes'] && typeof entry['attributes'] === 'object' && !Array.isArray(entry['attributes'])
				? filterStringAttributes(entry['attributes'] as Record<string, unknown>)
				: undefined,
		});
	}
	const compactionsRaw = raw['compactions'];
	const compactions = compactionsRaw && typeof compactionsRaw === 'object' && !Array.isArray(compactionsRaw)
		&& typeof (compactionsRaw as Record<string, unknown>)['count'] === 'number'
		? { count: (compactionsRaw as Record<string, unknown>)['count'] as number }
		: { count: 0 };
	return { totalTokens: raw['totalTokens'] as number, entries, compactions };
}

function filterStringAttributes(raw: Record<string, unknown>): Record<string, string | undefined> {
	const result: Record<string, string | undefined> = {};
	for (const [key, value] of Object.entries(raw)) {
		if (typeof value === 'string' || value === undefined) {
			result[key] = value;
		}
	}
	return result;
}

export {
	ChangesetOperationTargetKind, type ChangesetOperationFollowUp, type ChangesetOperationTarget
} from './protocol/commands.js';

// Canonical chat-input type names (the protocol renamed the former
// `SessionInput*` types to `ChatInput*` when input requests moved onto the
// chat channel). Re-exported here so consumers can import them from the glue
// layer alongside the legacy `SessionInput*` aliases above.
export {
	ChatInputAnswerState,
	ChatInputAnswerValueKind,
	ChatInputQuestionKind,
	ChatInputResponseKind,
	type ChatInputAnswer,
	type ChatInputOption,
	type ChatInputQuestion,
	type ChatInputRequest,
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
	if (summary.workingDirectory !== undefined) { state.workingDirectory = summary.workingDirectory; }
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
		workingDirectory: summary.workingDirectory,
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
	// `workingDirectory` is deliberately NOT copied: per the protocol it is a
	// per-chat OVERRIDE and, when absent, the chat inherits the session's
	// working directory (see `mergeSessionWithDefaultChat`). Seeding it here
	// would denormalize the session default onto every chat as a fake override,
	// which then goes stale when the session's working directory is resolved
	// later (e.g. a worktree resolved at materialization).
	return summary;
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
		status: state.status,
		modifiedAt: state.modifiedAt,
	};
	if (state.activity !== undefined) { summary.activity = state.activity; }
	if (state.origin !== undefined) { summary.origin = state.origin; }
	if (state.interactivity !== undefined) { summary.interactivity = state.interactivity; }
	if (state.workingDirectory !== undefined) { summary.workingDirectory = state.workingDirectory; }
	return summary;
}

export function createActiveTurn(id: string, message: Message): ActiveTurn {
	return {
		id,
		message,
		responseParts: [],
		usage: undefined,
	};
}

export const enum StateComponents {
	Root,
	Session,
	Chat,
	Terminal,
	Changeset,
	Annotations,
}

export type ComponentToState = {
	[StateComponents.Root]: RootState;
	[StateComponents.Session]: SessionState;
	[StateComponents.Chat]: ChatState;
	[StateComponents.Terminal]: TerminalState;
	[StateComponents.Changeset]: ChangesetState;
	[StateComponents.Annotations]: AnnotationsState;
};

// ---- Default chat URI helpers ----------------------------------------------

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
 * (working directory, active clients, config, customizations/MCP scope, …)
 * resolved for one chat and merged with that chat's conversation contents.
 *
 * The protocol moved turns and pending/input state off the session and onto a
 * per-chat channel, and lets a chat override session defaults (e.g.
 * {@link ChatState.workingDirectory}). This composite recombines the session
 * with one of its chats — default or peer — so consumers read the chat's
 * effective context and conversation through one object without walking back to
 * the session to re-derive shared state. The inherited
 * {@link SessionState.workingDirectory} carries the chat's *effective* working
 * directory (its own override when present, else the session default).
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
	/** Input requests outstanding on this chat. */
	inputRequests?: ChatInputRequest[];
	/** Draft input of this chat. */
	draft?: Message;
}

/**
 * Projects a {@link SessionState} and one of its {@link ChatState | chats}
 * (default or peer) into that chat's {@link ISessionWithDefaultChat | effective
 * session context}. Per-chat overrides (currently the working directory) are
 * layered over the session defaults, and the conversation fields are taken from
 * the chat. When the chat state is absent (e.g. not yet hydrated) the
 * conversation fields default to empty and the session defaults apply.
 */
export function mergeSessionWithDefaultChat(session: SessionState, chat: ChatState | undefined): ISessionWithDefaultChat {
	return {
		...session,
		workingDirectory: chat?.workingDirectory ?? session.workingDirectory,
		turns: chat?.turns ?? [],
		activeTurn: chat?.activeTurn,
		steeringMessage: chat?.steeringMessage,
		queuedMessages: chat?.queuedMessages,
		inputRequests: chat?.inputRequests,
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

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link SessionState}. Keys SHOULD be namespaced (e.g. `git`, `vscode.foo`)
 * to avoid collisions; values MUST be JSON-serializable.
 */
export type SessionMeta = Record<string, unknown>;

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link SessionSummary}. Keys SHOULD be namespaced (e.g. `git`, `vscode.foo`)
 * to avoid collisions; values MUST be JSON-serializable.
 */
export type SessionSummaryMeta = Record<string, unknown>;

/**
 * Reserved key under {@link SessionMeta} for the well-known git-state
 * payload. Value at this key, when present, MUST be shaped like
 * {@link ISessionGitState}. This is a VS Code-specific convention layered
 * on top of the protocol's generic `_meta` bag — the protocol itself does
 * not know about git state.
 */
export const SESSION_META_GIT_KEY = 'git';

/**
 * Reserved key under {@link SessionMeta} for the well-known GitHub-state
 * payload. Value at this key, when present, MUST be shaped like
 * {@link ISessionGitHubState}. This is a VS Code-specific convention layered
 * on top of the protocol's generic `_meta` bag — the protocol itself does
 * not know about GitHub state.
 */
export const SESSION_META_GITHUB_KEY = 'github';

/**
 * Git state of a session's working directory, carried under
 * {@link SessionMeta} at {@link SESSION_META_GIT_KEY}. Used by clients to
 * drive source-control affordances (e.g. PR/merge buttons in the Agents
 * app).
 *
 * All fields are optional — agents that do not track a particular field
 * should omit it rather than send a placeholder, so clients can distinguish
 * "unknown" from "known to be zero".
 */
export interface ISessionGitState {
	/** Whether the working directory has a `github.com` git remote. */
	readonly hasGitHubRemote?: boolean;
	/** Current branch name. */
	readonly branchName?: string;
	/** Base branch the work targets (e.g. `main`). */
	readonly baseBranchName?: string;
	/** Upstream tracking branch (e.g. `origin/feature`). */
	readonly upstreamBranchName?: string;
	/** Number of commits the upstream branch has ahead of the local branch. */
	readonly incomingChanges?: number;
	/** Number of commits the local branch has ahead of the upstream branch. */
	readonly outgoingChanges?: number;
	/** Number of files with uncommitted changes. */
	readonly uncommittedChanges?: number;
	/** GitHub repository owner parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubOwner?: string;
	/** GitHub repository name parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubRepo?: string;
}

/**
 * GitHub state of a session, carried under {@link SessionMeta} at
 * {@link SESSION_META_GITHUB_KEY}. Used by clients to drive GitHub-specific
 * affordances (e.g. PR/merge buttons in the Agents app).
 *
 * All fields are optional — agents that do not track a particular field
 * should omit it rather than send a placeholder, so clients can distinguish
 * "unknown" from "known to be zero".
 */
export interface ISessionGitHubState {
	/** The owner of the GitHub repository. */
	readonly owner?: string;
	/** The name of the GitHub repository. */
	readonly repo?: string;
	/** The URL of the GitHub pull request. */
	readonly pullRequestUrl?: string;
}

/**
 * Reads the well-known git-state payload from {@link SessionMeta}, if
 * present. Returns `undefined` when the meta bag is absent or the value at
 * the git key is not a plain object (e.g. an array or a primitive).
 * Individual fields with wrong types are silently dropped so partial state
 * still propagates.
 *
 * Unlike the other typed readers, this takes the raw {@link SessionMeta} value
 * rather than its parent {@link SessionState}: the sessions provider stores and
 * reads a detached meta snapshot without retaining the owning state.
 */
export function readSessionGitState(meta: SessionMeta | undefined): ISessionGitState | undefined {
	const value = meta?.[SESSION_META_GIT_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const result: {
		hasGitHubRemote?: boolean;
		branchName?: string;
		baseBranchName?: string;
		upstreamBranchName?: string;
		incomingChanges?: number;
		outgoingChanges?: number;
		uncommittedChanges?: number;
		githubOwner?: string;
		githubRepo?: string;
	} = {};
	if (typeof raw['hasGitHubRemote'] === 'boolean') { result.hasGitHubRemote = raw['hasGitHubRemote']; }
	if (typeof raw['branchName'] === 'string') { result.branchName = raw['branchName']; }
	if (typeof raw['baseBranchName'] === 'string') { result.baseBranchName = raw['baseBranchName']; }
	if (typeof raw['upstreamBranchName'] === 'string') { result.upstreamBranchName = raw['upstreamBranchName']; }
	if (typeof raw['incomingChanges'] === 'number') { result.incomingChanges = raw['incomingChanges']; }
	if (typeof raw['outgoingChanges'] === 'number') { result.outgoingChanges = raw['outgoingChanges']; }
	if (typeof raw['uncommittedChanges'] === 'number') { result.uncommittedChanges = raw['uncommittedChanges']; }
	if (typeof raw['githubOwner'] === 'string') { result.githubOwner = raw['githubOwner']; }
	if (typeof raw['githubRepo'] === 'string') { result.githubRepo = raw['githubRepo']; }
	return result;
}

/**
 * Returns a new {@link SessionMeta} with the git-state payload set to
 * `gitState`, or with the git slot removed if `gitState` is `undefined`.
 * Returns `undefined` if the result would be empty.
 */
export function withSessionGitState(meta: SessionMeta | undefined, gitState: ISessionGitState | undefined): SessionMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (gitState !== undefined) {
		next[SESSION_META_GIT_KEY] = gitState;
	} else {
		delete next[SESSION_META_GIT_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Reads the well-known GitHub state payload from {@link SessionSummaryMeta}, if
 * present. Returns `undefined` when the meta bag is absent or the value at the
 * GitHub key is not a plain object (e.g. an array or a primitive).
 * Individual fields with wrong types are silently dropped so partial state
 * still propagates.
 *
 * Unlike the other typed readers, this takes the raw {@link SessionSummaryMeta}
 * value rather than its parent {@link SessionState}: the sessions provider stores and
 * reads a detached meta snapshot without retaining the owning state.
 */
export function readSessionGitHubState(meta: SessionSummaryMeta | undefined): ISessionGitHubState | undefined {
	const value = meta?.[SESSION_META_GITHUB_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	const result: {
		owner?: string;
		repo?: string;
		pullRequestUrl?: string;
	} = {};

	if (typeof raw['owner'] === 'string') { result.owner = raw['owner']; }
	if (typeof raw['repo'] === 'string') { result.repo = raw['repo']; }
	if (typeof raw['pullRequestUrl'] === 'string') { result.pullRequestUrl = raw['pullRequestUrl']; }
	return result;
}

/**
 * Returns a new {@link SessionSummaryMeta} with the GitHub-state payload set to
 * `gitHubState`, or with the GitHub slot removed if `gitHubState` is `undefined`.
 * Returns `undefined` if the result would be empty.
 */
export function withSessionGitHubState(meta: SessionSummaryMeta | undefined, gitHubState: ISessionGitHubState | undefined): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (gitHubState !== undefined) {
		next[SESSION_META_GITHUB_KEY] = gitHubState;
	} else {
		delete next[SESSION_META_GITHUB_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Reserved key under {@link SessionSummaryMeta} marking a session as
 * workspace-less: a session with no workspace/folder binding (surfaced in the
 * UI as a "Quick Chat"). Carried on the summary bag (not the full state) so
 * clients can group/style such sessions in session lists without subscribing to
 * full session state. VS Code-specific convention layered on the protocol's
 * generic `_meta` bag.
 */
export const SESSION_META_WORKSPACELESS_KEY = 'workspaceless';

/**
 * Session-database metadata key recording whether a session is workspace-less (a
 * workspace-less chat). Owned by the AH service: `AgentService` writes it centrally at
 * create/materialize and overlays it onto every agent's summary `_meta` in
 * `listSessions`; agents only read it (e.g. to pick the workspace-less system prompt
 * on resume) and never persist it themselves.
 */
export const AH_META_WORKSPACELESS_DB_KEY = 'agentHost.workspaceless';

/**
 * Reads the workspace-less marker from {@link SessionSummaryMeta}. Returns
 * `true` only when the well-known key is present and set to boolean `true`.
 */
export function readSessionWorkspaceless(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_WORKSPACELESS_KEY] === true;
}

/**
 * Returns a new {@link SessionSummaryMeta} with the workspace-less marker set,
 * or with the slot removed when `workspaceless` is `false`. Returns `undefined`
 * if the result would be empty.
 */
export function withSessionWorkspaceless(meta: SessionSummaryMeta | undefined, workspaceless: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (workspaceless) {
		next[SESSION_META_WORKSPACELESS_KEY] = true;
	} else {
		delete next[SESSION_META_WORKSPACELESS_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

// ---- RootState _meta accessors ---------------------------------------------

/**
 * VS Code-side alias for the protocol's open `_meta` property bag on
 * {@link RootState}. Keys SHOULD be namespaced to avoid collisions; values MUST
 * be JSON-serializable.
 */
export type RootMeta = Record<string, unknown>;

/**
 * Reserved key under {@link RootMeta} for the well-known host-build payload.
 * Value at this key, when present, MUST be shaped like {@link IHostBuildInfo}.
 * This is a VS Code-specific convention layered on top of the protocol's
 * generic `_meta` bag — the protocol itself does not know about build info.
 */
export const ROOT_META_HOST_BUILD_KEY = 'hostBuild';

/**
 * Build information about the program hosting the agent host (the VS Code CLI),
 * carried under {@link RootMeta} at {@link ROOT_META_HOST_BUILD_KEY}. Lets a
 * client see which build is hosting it — useful when inspecting the output of a
 * remote agent host.
 *
 * All fields except {@link version} are optional — a build that does not track
 * a particular field should omit it.
 */
export interface IHostBuildInfo {
	/** Product version (e.g. `1.96.0`). */
	readonly version: string;
	/** Commit SHA of the build, if known. */
	readonly commit?: string;
	/** Build date (ISO 8601), if known. */
	readonly date?: string;
	/** Release quality (e.g. `stable`, `insider`), if known. */
	readonly quality?: string;
}

/**
 * Derives {@link IHostBuildInfo} from the host's {@link IProductService}.
 */
export function hostBuildInfoFromProduct(productService: IProductService): IHostBuildInfo {
	return {
		version: productService.version,
		commit: productService.commit,
		date: productService.date,
		quality: productService.quality,
	};
}

/**
 * Reads the well-known host-build payload from {@link RootMeta}, if present.
 * Returns `undefined` when the meta bag is absent or the value at the host-build
 * key is not a plain object with a string `version`. Optional fields with wrong
 * types are silently dropped.
 */
export function readHostBuildInfo(state: RootState | undefined): IHostBuildInfo | undefined {
	const meta = state?._meta;
	const value = meta?.[ROOT_META_HOST_BUILD_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['version'] !== 'string') {
		return undefined;
	}
	const result: { version: string; commit?: string; date?: string; quality?: string } = {
		version: raw['version'],
	};
	if (typeof raw['commit'] === 'string') { result.commit = raw['commit']; }
	if (typeof raw['date'] === 'string') { result.date = raw['date']; }
	if (typeof raw['quality'] === 'string') { result.quality = raw['quality']; }
	return result;
}

/**
 * Returns a new {@link RootMeta} with the host-build payload set to
 * `buildInfo`, or with the slot removed if `buildInfo` is `undefined`. Returns
 * `undefined` if the result would be empty.
 */
export function withHostBuildInfo(meta: RootMeta | undefined, buildInfo: IHostBuildInfo | undefined): RootMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (buildInfo !== undefined) {
		next[ROOT_META_HOST_BUILD_KEY] = buildInfo;
	} else {
		delete next[ROOT_META_HOST_BUILD_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Formats {@link IHostBuildInfo} as a short single-line human-readable string,
 * e.g. `1.96.0 (commit abc1234, 2024-01-02T03:04:05Z, insider)`.
 */
export function formatHostBuildInfo(info: IHostBuildInfo): string {
	const details: string[] = [];
	if (info.commit) { details.push(`commit ${info.commit}`); }
	if (info.date) { details.push(info.date); }
	if (info.quality) { details.push(info.quality); }
	return details.length > 0 ? `${info.version} (${details.join(', ')})` : info.version;
}
