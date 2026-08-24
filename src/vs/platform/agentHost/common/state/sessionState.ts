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

import { distinct } from '../../../../base/common/arrays.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../base/common/buffer.js';
import { hasKey, type Mutable } from '../../../../base/common/types.js';
import { URI as ResourceURI } from '../../../../base/common/uri.js';
import type { IProductService } from '../../../product/common/productService.js';
import { readToolCallMeta } from '../meta/agentToolCallMeta.js';
import {
	ResponsePartKind,
	SessionStatus,
	ToolCallStatus,
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
	type ResponsePart,
	type RootState, type RuleCustomization, type SessionActiveClient,
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

/**
 * Well-known keys that may appear on {@link UsageInfo._meta}.
 * Clients MAY read these to provide enhanced UI (e.g. credit cost display).
 */
export interface UsageInfoMeta {
	/** Per-turn credit cost reported by the backend. */
	cost?: number;
	/** The concrete model selected by Copilot Auto and the routing explanation. */
	autoModeResolved?: IAutoModeResolvedInfo;
	/** Copilot-specific usage breakdown, including nano-AIU totals. */
	copilotUsage?: {
		/** This turn's nano-AIU cost. */
		totalNanoAiu?: number;
		/**
		 * The whole session's accumulated nano-AIU cost, as reported by the
		 * backend rather than summed from the turns. Clients SHOULD prefer this
		 * over adding up per-turn totals: it is authoritative, and it also
		 * covers work billed outside any turn (e.g. an out-of-turn compaction).
		 */
		sessionTotalNanoAiu?: number;
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
	/**
	 * Per-model token totals accumulated across every model call in the turn,
	 * including calls made by subagents and the summarization call a compaction
	 * performs. Unlike {@link UsageInfo.inputTokens}, which describes only the
	 * most recent model call, these are whole-turn sums, so clients can report
	 * what a completed turn consumed in aggregate.
	 */
	turnTokenTotals?: readonly ITurnTokenTotal[];
	/** Per-model token totals for this turn only, excluding descendant sub-agents (sum a tree without double-counting). */
	directTurnTokenTotals?: readonly ITurnTokenTotal[];
	/** Copilot usage for this turn only. The root's {@link copilotUsage} stays inclusive of descendants. */
	directCopilotUsage?: {
		readonly totalNanoAiu?: number;
	};
	[key: string]: unknown;
}

const MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY = 'vscode.chat.hiddenFromTranscript';
const MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX = '<!-- vscode-hidden-from-transcript -->\n';

function readMessageMeta(message: Message): { readonly hiddenFromTranscript: boolean } {
	const meta = message._meta;
	return {
		hiddenFromTranscript: meta?.[MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY] === true,
	};
}

export function isMessageHiddenFromTranscript(message: Message): boolean {
	return readMessageMeta(message).hiddenFromTranscript
		|| message.text.startsWith(MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX);
}

export function withMessageHiddenFromTranscript(message: Message, hidden: boolean | undefined): Message {
	if (!hidden) {
		return message;
	}
	return {
		...message,
		text: message.text.startsWith(MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX) ? message.text : MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX + message.text,
		_meta: {
			...message._meta,
			[MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY]: true,
		},
	};
}

/** Whole-turn token consumption attributed to a single model. */
export interface ITurnTokenTotal {
	readonly model: string;
	readonly inputTokens: number;
	readonly cachedTokens: number;
	readonly outputTokens: number;
}

export interface IAutoModeResolvedInfo {
	readonly chosenModel: string;
	readonly reasoningBucket?: 'low' | 'medium' | 'high';
	readonly categoryScores?: Readonly<Record<string, number | undefined>>;
	readonly predictedLabel?: string;
	readonly confidence?: number;
	readonly candidateModels?: readonly string[];
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
	const autoModeResolved = readAutoModeResolvedInfo(meta['autoModeResolved']);
	if (autoModeResolved) { result.autoModeResolved = autoModeResolved; }
	const copilotUsage = meta['copilotUsage'];
	if (copilotUsage && typeof copilotUsage === 'object' && !Array.isArray(copilotUsage)) {
		const rawUsage = copilotUsage as Record<string, unknown>;
		const usage: Mutable<NonNullable<UsageInfoMeta['copilotUsage']>> = {};
		if (typeof rawUsage['totalNanoAiu'] === 'number') { usage.totalNanoAiu = rawUsage['totalNanoAiu']; }
		if (typeof rawUsage['sessionTotalNanoAiu'] === 'number') { usage.sessionTotalNanoAiu = rawUsage['sessionTotalNanoAiu']; }
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
	const turnTokenTotals = readTurnTokenTotals(meta['turnTokenTotals']);
	if (turnTokenTotals) {
		result.turnTokenTotals = turnTokenTotals;
	}
	const directTurnTokenTotals = readTurnTokenTotals(meta['directTurnTokenTotals']);
	if (directTurnTokenTotals) {
		result.directTurnTokenTotals = directTurnTokenTotals;
	}
	const directCopilotUsage = meta['directCopilotUsage'];
	if (directCopilotUsage && typeof directCopilotUsage === 'object' && !Array.isArray(directCopilotUsage)) {
		const totalNanoAiu = (directCopilotUsage as Record<string, unknown>)['totalNanoAiu'];
		if (typeof totalNanoAiu === 'number') {
			result.directCopilotUsage = { totalNanoAiu };
		}
	}
	return result;
}

/**
 * Reads whole-turn per-model token totals, dropping rows that are not fully
 * formed. Returns `undefined` when no usable row survives, so callers can treat
 * "absent" and "present but meaningless" identically.
 */
function readTurnTokenTotals(value: unknown): readonly ITurnTokenTotal[] | undefined {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const totals: ITurnTokenTotal[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object' || Array.isArray(item)) {
			continue;
		}
		const raw = item as Record<string, unknown>;
		if (typeof raw['model'] !== 'string' || !raw['model']
			|| !isTokenCount(raw['inputTokens'])
			|| !isTokenCount(raw['cachedTokens'])
			|| !isTokenCount(raw['outputTokens'])
		) {
			continue;
		}
		totals.push({
			model: raw['model'],
			inputTokens: raw['inputTokens'],
			cachedTokens: raw['cachedTokens'],
			outputTokens: raw['outputTokens'],
		});
	}
	return totals.length > 0 ? totals : undefined;
}

function isTokenCount(value: unknown): value is number {
	return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/**
 * Whether a usage report actually records consumption, as opposed to merely
 * existing.
 *
 * A turn can carry a token-less {@link UsageInfo} that exists only to hold
 * routing metadata — notably a Copilot Auto turn restored from the event log,
 * which keeps `_meta.autoModeResolved` even though the usage event itself is
 * ephemeral and was never persisted. Callers that ask "does this turn have
 * usage?" almost always mean "does it have numbers to show", so route that
 * question through here rather than testing the object for truthiness.
 */
export function hasReportedUsage(usage: UsageInfo | undefined): boolean {
	if (!usage) {
		return false;
	}
	if (typeof usage.inputTokens === 'number' || typeof usage.outputTokens === 'number') {
		return true;
	}
	const meta = readUsageInfoMeta(usage);
	// Negative totals are treated as absent, matching how credits are read for display.
	return (typeof meta.copilotUsage?.totalNanoAiu === 'number' && meta.copilotUsage.totalNanoAiu >= 0)
		// A report can carry only the session total — a compaction billed while no turn
		// was active advances it without any per-event billing payload — and that is
		// still consumption worth showing.
		|| (typeof meta.copilotUsage?.sessionTotalNanoAiu === 'number' && meta.copilotUsage.sessionTotalNanoAiu >= 0)
		|| (typeof meta.cost === 'number' && meta.cost >= 0);
}

function readAutoModeResolvedInfo(value: unknown): IAutoModeResolvedInfo | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['chosenModel'] !== 'string') {
		return undefined;
	}
	const result: Mutable<IAutoModeResolvedInfo> = { chosenModel: raw['chosenModel'] };
	const reasoningBucket = raw['reasoningBucket'];
	if (reasoningBucket === 'low' || reasoningBucket === 'medium' || reasoningBucket === 'high') {
		result.reasoningBucket = reasoningBucket;
	}
	const categoryScores = raw['categoryScores'];
	if (categoryScores && typeof categoryScores === 'object' && !Array.isArray(categoryScores)) {
		const scores: Record<string, number> = {};
		for (const [category, score] of Object.entries(categoryScores as Record<string, unknown>)) {
			if (typeof score === 'number') {
				scores[category] = score;
			}
		}
		result.categoryScores = scores;
	}
	if (typeof raw['predictedLabel'] === 'string') { result.predictedLabel = raw['predictedLabel']; }
	if (typeof raw['confidence'] === 'number') { result.confidence = raw['confidence']; }
	if (Array.isArray(raw['candidateModels']) && raw['candidateModels'].every(candidate => typeof candidate === 'string')) {
		result.candidateModels = raw['candidateModels'];
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

/** Reserved key for durable source-control workflow provenance. */
export const SESSION_META_SOURCE_CONTROL_KEY = 'vscode.sourceControl';

export const SESSION_META_PROMPT_CACHE_KEY = 'vscode.promptCache';

export const SESSION_META_MULTI_ROOT_KEY = 'multiRoot';

/** Reserved key for whether a session was first discovered in a provider-native catalog. */
export const SESSION_META_EXTERNAL_KEY = 'vscode.external';

const MAX_WORKSPACE_FILE_LENGTH = 4096;

/** Multi-root workspace provenance attached by the creating client. */
export interface ISessionMultiRootMetadata {
	readonly workspaceFile: string;
}

/** Reads validated multi-root workspace provenance from session metadata. */
export function readSessionMultiRootMetadata(meta: SessionMeta | undefined): ISessionMultiRootMetadata | undefined {
	return validateSessionMultiRootMetadata(meta?.[SESSION_META_MULTI_ROOT_KEY]);
}

/** Parses validated multi-root workspace provenance from its persisted JSON representation. */
export function parseSessionMultiRootMetadata(value: string | undefined): ISessionMultiRootMetadata | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return validateSessionMultiRootMetadata(JSON.parse(value));
	} catch {
		return undefined;
	}
}

/** Returns session metadata with the multi-root workspace provenance updated or removed. */
export function withSessionMultiRootMetadata(meta: SessionMeta | undefined, multiRoot: ISessionMultiRootMetadata | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (multiRoot) {
		next[SESSION_META_MULTI_ROOT_KEY] = multiRoot;
	} else {
		delete next[SESSION_META_MULTI_ROOT_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

function validateSessionMultiRootMetadata(value: unknown): ISessionMultiRootMetadata | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.workspaceFile !== 'string' || raw.workspaceFile.length === 0 || raw.workspaceFile.length > MAX_WORKSPACE_FILE_LENGTH) {
		return undefined;
	}
	try {
		if (!ResourceURI.parse(raw.workspaceFile, true).scheme) {
			return undefined;
		}
	} catch {
		return undefined;
	}
	return { workspaceFile: raw.workspaceFile };
}

/** Latest known prompt-cache state for the model active in an agent session. */
export interface ISessionPromptCacheState {
	readonly modelId: string;
	readonly cacheExpiresAt: string;
}

/** Reads the latest known prompt-cache state from session metadata. */
export function readSessionPromptCacheState(meta: SessionMeta | undefined): ISessionPromptCacheState | undefined {
	const value = meta?.[SESSION_META_PROMPT_CACHE_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	return typeof raw['modelId'] === 'string' && typeof raw['cacheExpiresAt'] === 'string'
		? { modelId: raw['modelId'], cacheExpiresAt: raw['cacheExpiresAt'] }
		: undefined;
}

/** Returns session metadata with the prompt-cache slot updated or removed. */
export function withSessionPromptCacheState(meta: SessionMeta | undefined, promptCache: ISessionPromptCacheState | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (promptCache) {
		next[SESSION_META_PROMPT_CACHE_KEY] = promptCache;
	} else {
		delete next[SESSION_META_PROMPT_CACHE_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/** Reserved key for the harness-owned new-session folder-picker decision. */
export const SESSION_META_FOLDER_PICKER_KEY = 'vscode.folderPicker';

/**
 * Harness-owned decision about the multi-root new-session Folder picker for an
 * agent-host session, carried under {@link SessionMeta} at
 * {@link SESSION_META_FOLDER_PICKER_KEY}.
 *
 * The provider (harness) owns this because the signal differs per backend — for
 * example Copilot hides the picker when at most one workspace folder carries
 * hooks under `.github/hooks/` (pinning that folder as {@link primary} when
 * exactly one does), since the Copilot agent only applies hooks from the primary
 * working directory, and shows the picker when several folders carry hooks so
 * the user resolves the ambiguity. When {@link primary} is set, it names the
 * working directory the client should auto-select before the session starts.
 */
export interface ISessionFolderPickerDecision {
	/** Whether the client should hide the multi-root Folder picker. */
	readonly hidden: boolean;
	/**
	 * The working directory the client should auto-select as the primary, as a
	 * URI string. Present only when the harness pins a specific folder (it
	 * always accompanies `hidden: true`, but a `hidden` decision need not pin
	 * one — e.g. when no folder carries hooks the current selection is kept).
	 */
	readonly primary?: string;
}

/** Reads the validated folder-picker decision from session metadata. */
export function readSessionFolderPickerDecision(meta: SessionMeta | undefined): ISessionFolderPickerDecision | undefined {
	return validateSessionFolderPickerDecision(meta?.[SESSION_META_FOLDER_PICKER_KEY]);
}

/** Parses the validated folder-picker decision from its persisted JSON representation. */
export function parseSessionFolderPickerDecision(value: string | undefined): ISessionFolderPickerDecision | undefined {
	if (!value) {
		return undefined;
	}
	try {
		return validateSessionFolderPickerDecision(JSON.parse(value));
	} catch {
		return undefined;
	}
}

function validateSessionFolderPickerDecision(value: unknown): ISessionFolderPickerDecision | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw['hidden'] !== 'boolean') {
		return undefined;
	}
	const primary = raw['primary'];
	// `primary` is only valid on a hidden, pinned decision (see
	// ISessionFolderPickerDecision); reject the contradictory `{ hidden: false,
	// primary }` so malformed persisted/remote metadata can't make the client
	// both reveal the picker and auto-select/recreate the session.
	if (primary !== undefined && (typeof primary !== 'string' || primary.length === 0 || raw['hidden'] !== true)) {
		return undefined;
	}
	return primary !== undefined ? { hidden: true, primary } : { hidden: raw['hidden'] };
}

/** Returns session metadata with the folder-picker decision updated or removed. */
export function withSessionFolderPickerDecision(meta: SessionMeta | undefined, decision: ISessionFolderPickerDecision | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (decision) {
		next[SESSION_META_FOLDER_PICKER_KEY] = decision.primary !== undefined
			? { hidden: decision.hidden, primary: decision.primary }
			: { hidden: decision.hidden };
	} else {
		delete next[SESSION_META_FOLDER_PICKER_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

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
	/**
	 * Whether `HEAD` is detached, which is why {@link branchName} is absent.
	 * Distinguishes a legitimately branch-less checkout from git state left
	 * behind by a probe that failed before it could resolve the branch.
	 */
	readonly isDetachedHead?: boolean;
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
	/** Whether the current branch has commits not contained in its local base branch. */
	readonly hasBaseBranchChanges?: boolean;
	/** GitHub repository owner parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubOwner?: string;
	/** GitHub owner parsed from the current branch's upstream or push remote. */
	readonly githubHeadOwner?: string;
	/** GitHub repository name parsed from the working copy's GitHub remote (preferring `origin`, falling back to the first GitHub remote). */
	readonly githubRepo?: string;
}

export const enum SessionSourceControlOutcome {
	Merge = 'merge',
	PullRequest = 'pullRequest',
}

/** Durable source-control workflow provenance for a session. */
export interface ISessionSourceControlState {
	readonly merge?: {
		/** Resulting target-branch HEAD after the most recent successful merge. */
		readonly commit: string;
	};
	readonly latestOutcome?: SessionSourceControlOutcome;
}

/** Reads validated source-control workflow provenance from session metadata. */
export function readSessionSourceControlState(meta: SessionMeta | undefined): ISessionSourceControlState | undefined {
	const value = meta?.[SESSION_META_SOURCE_CONTROL_KEY];
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		return undefined;
	}

	const raw = value as Record<string, unknown>;
	let merge: ISessionSourceControlState['merge'];
	const rawMerge = raw['merge'];
	if (rawMerge && typeof rawMerge === 'object' && !Array.isArray(rawMerge)) {
		const commit = (rawMerge as Record<string, unknown>)['commit'];
		merge = typeof commit === 'string' && commit.length > 0 ? { commit } : undefined;
	}

	const rawLatestOutcome = raw['latestOutcome'];
	const latestOutcome = rawLatestOutcome === SessionSourceControlOutcome.Merge || rawLatestOutcome === SessionSourceControlOutcome.PullRequest
		? rawLatestOutcome
		: undefined;
	if (!merge && (!latestOutcome || latestOutcome === SessionSourceControlOutcome.Merge)) {
		return undefined;
	}
	return { merge, latestOutcome };
}

/** Returns session metadata with source-control workflow provenance updated. */
export function withSessionSourceControlState(meta: SessionMeta | undefined, state: ISessionSourceControlState | undefined): SessionMeta | undefined {
	const next: SessionMeta = { ...meta };
	if (state) {
		next[SESSION_META_SOURCE_CONTROL_KEY] = state;
	} else {
		delete next[SESSION_META_SOURCE_CONTROL_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
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
	/** GitHub pull request URLs found for the session's checkouts, most recent first. */
	readonly pullRequestUrls?: readonly string[];
	/** Pull requests that predate a folder-isolated session. An empty array is a captured baseline. */
	readonly initialPullRequestUrls?: readonly string[];
	/** Pull requests explicitly associated through user intent, most recent first. */
	readonly associatedPullRequestUrls?: readonly string[];
	/**
	 * URLs of the GitHub issues referenced by the session's user messages, in
	 * order of first appearance.
	 */
	readonly issueUrls?: readonly string[];
	/**
	 * The name of the branch the most recent {@link pullRequestUrls} entry was found (or created) for.
	 * A pull request always relates to a branch: when the working copy switches
	 * to a different branch the host keeps reporting the known pull request but
	 * resumes looking for one that belongs to the newly checked out branch.
	 */
	readonly pullRequestBranchName?: string;
}

/**
 * Whether the known pull request of `gitHubState` belongs to `branchName`.
 *
 * State persisted before pull requests were tracked per branch has no
 * {@link ISessionGitHubState.pullRequestBranchName}; such a pull request is
 * optimistically treated as belonging to the given branch so existing sessions
 * keep their pull request affordances until the host has verified which branch
 * it actually belongs to.
 */
export function hasSessionPullRequestForBranch(gitHubState: ISessionGitHubState | undefined, branchName: string | undefined): boolean {
	if (!gitHubState?.pullRequestUrls?.length) {
		return false;
	}
	return gitHubState.pullRequestBranchName === undefined || gitHubState.pullRequestBranchName === branchName;
}

/** Returns pull requests related to the session rather than inherited from its folder checkout. */
export function getSessionRelatedPullRequestUrls(gitHubState: ISessionGitHubState | undefined): readonly string[] {
	const pullRequestUrls = gitHubState?.pullRequestUrls ?? [];
	const initialPullRequestUrls = gitHubState?.initialPullRequestUrls;
	const initialUrls = new Set(initialPullRequestUrls?.map(url => url.toLowerCase()) ?? []);
	const associatedUrls = new Set(gitHubState?.associatedPullRequestUrls?.map(url => url.toLowerCase()) ?? []);
	return pullRequestUrls.filter(url => !initialUrls.has(url.toLowerCase()) || associatedUrls.has(url.toLowerCase()));
}

/** Maximum pull requests retained for a session. */
export const MAX_SESSION_PULL_REQUEST_REFERENCES = 10;

function normalizeSessionPullRequestUrls(urls: readonly string[]): string[] {
	const normalizedUrls = urls.map(url => {
		const match = /^https:\/\/(?<host>[^/]+)\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/.exec(url);
		const groups = match?.groups;
		return groups
			? `https://${groups['host'].toLowerCase()}/${groups['owner']}/${groups['repo']}/pull/${groups['number']}`
			: url;
	});
	return distinct(normalizedUrls, url => url.toLowerCase()).slice(0, MAX_SESSION_PULL_REQUEST_REFERENCES);
}

/** Returns GitHub state with `pullRequestUrl` moved to the front of its bounded history. */
export function withMostRecentSessionPullRequest(gitHubState: ISessionGitHubState | undefined, pullRequestUrl: string, branchName: string): ISessionGitHubState {
	const pullRequestUrls = normalizeSessionPullRequestUrls([
		pullRequestUrl,
		...(gitHubState?.pullRequestUrls ?? [])
	]);

	return {
		pullRequestUrls,
		pullRequestBranchName: branchName,
	};
}

/** Returns state that promotes a pull request from the folder baseline into the session. */
export function withMostRecentRelatedSessionPullRequest(gitHubState: ISessionGitHubState | undefined, pullRequestUrl: string, branchName: string): ISessionGitHubState {
	const next = withMostRecentSessionPullRequest(gitHubState, pullRequestUrl, branchName);
	const promotedUrl = normalizeSessionPullRequestUrls([pullRequestUrl])[0]?.toLowerCase();
	const initialPullRequestUrls = gitHubState?.initialPullRequestUrls;
	const associatedPullRequestUrls = normalizeSessionPullRequestUrls([
		pullRequestUrl,
		...(gitHubState?.associatedPullRequestUrls ?? [])
	]);
	return {
		...next,
		associatedPullRequestUrls,
		...(initialPullRequestUrls !== undefined ? {
			initialPullRequestUrls: initialPullRequestUrls.filter(url => url.toLowerCase() !== promotedUrl)
		} : {}),
	};
}

/** Returns state that records a pull request in the folder-session baseline. */
export function withInitialSessionPullRequest(gitHubState: ISessionGitHubState | undefined, pullRequestUrl?: string): ISessionGitHubState {
	return {
		initialPullRequestUrls: normalizeSessionPullRequestUrls([
			...(pullRequestUrl ? [pullRequestUrl] : []),
			...(gitHubState?.initialPullRequestUrls ?? [])
		])
	};
}

/** Returns state that records a user-referenced pull request without changing checkout PR state. */
export function withMostRecentReferencedSessionPullRequest(gitHubState: ISessionGitHubState | undefined, pullRequestUrl: string): ISessionGitHubState {
	const associatedPullRequestUrls = normalizeSessionPullRequestUrls([
		pullRequestUrl,
		...(gitHubState?.associatedPullRequestUrls ?? [])
	]);
	return {
		associatedPullRequestUrls,
	};
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
		isDetachedHead?: boolean;
		baseBranchName?: string;
		upstreamBranchName?: string;
		incomingChanges?: number;
		outgoingChanges?: number;
		uncommittedChanges?: number;
		hasBaseBranchChanges?: boolean;
		githubOwner?: string;
		githubHeadOwner?: string;
		githubRepo?: string;
	} = {};
	if (typeof raw['hasGitHubRemote'] === 'boolean') { result.hasGitHubRemote = raw['hasGitHubRemote']; }
	if (typeof raw['branchName'] === 'string') { result.branchName = raw['branchName']; }
	if (typeof raw['isDetachedHead'] === 'boolean') { result.isDetachedHead = raw['isDetachedHead']; }
	if (typeof raw['baseBranchName'] === 'string') { result.baseBranchName = raw['baseBranchName']; }
	if (typeof raw['upstreamBranchName'] === 'string') { result.upstreamBranchName = raw['upstreamBranchName']; }
	if (typeof raw['incomingChanges'] === 'number') { result.incomingChanges = raw['incomingChanges']; }
	if (typeof raw['outgoingChanges'] === 'number') { result.outgoingChanges = raw['outgoingChanges']; }
	if (typeof raw['uncommittedChanges'] === 'number') { result.uncommittedChanges = raw['uncommittedChanges']; }
	if (typeof raw['hasBaseBranchChanges'] === 'boolean') { result.hasBaseBranchChanges = raw['hasBaseBranchChanges']; }
	if (typeof raw['githubOwner'] === 'string') { result.githubOwner = raw['githubOwner']; }
	if (typeof raw['githubHeadOwner'] === 'string') { result.githubHeadOwner = raw['githubHeadOwner']; }
	if (typeof raw['githubRepo'] === 'string') { result.githubRepo = raw['githubRepo']; }
	return result;
}

/**
 * Whether a session's git state should be recomputed because it does not
 * describe a usable checkout.
 *
 * A state that was never computed obviously qualifies. So does one that is
 * missing its branch without a detached `HEAD` to explain it: `git status` is
 * the only probe that reports the branch, so such a state is the residue of a
 * probe that failed, and consumers that key off the branch (Agent Merge binds
 * its pull request that way) stay stranded until it is recomputed. A detached
 * `HEAD` is a legitimate branch-less checkout and must not be mistaken for it,
 * or every caller would refresh in a loop against a repository that will never
 * report a branch.
 */
export function needsSessionGitStateRefresh(gitState: ISessionGitState | undefined): boolean {
	return gitState === undefined || (gitState.branchName === undefined && !gitState.isDetachedHead);
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
		pullRequestUrls?: readonly string[];
		initialPullRequestUrls?: readonly string[];
		associatedPullRequestUrls?: readonly string[];
		issueUrls?: readonly string[];
		pullRequestBranchName?: string;
	} = {};

	if (typeof raw['owner'] === 'string') { result.owner = raw['owner']; }
	if (typeof raw['repo'] === 'string') { result.repo = raw['repo']; }
	const pullRequestUrls = Array.isArray(raw['pullRequestUrls'])
		? raw['pullRequestUrls'].filter((url): url is string => typeof url === 'string')
		: typeof raw['pullRequestUrl'] === 'string'
			? [raw['pullRequestUrl']]
			: [];
	if (pullRequestUrls.length > 0) {
		result.pullRequestUrls = normalizeSessionPullRequestUrls(pullRequestUrls);
	}
	if (Array.isArray(raw['initialPullRequestUrls'])) {
		result.initialPullRequestUrls = normalizeSessionPullRequestUrls(raw['initialPullRequestUrls'].filter((url): url is string => typeof url === 'string'));
	}
	if (Array.isArray(raw['associatedPullRequestUrls'])) {
		const associatedPullRequestUrls = normalizeSessionPullRequestUrls(raw['associatedPullRequestUrls'].filter((url): url is string => typeof url === 'string'));
		if (associatedPullRequestUrls.length > 0) {
			result.associatedPullRequestUrls = associatedPullRequestUrls;
		}
	}
	if (Array.isArray(raw['issueUrls'])) { result.issueUrls = raw['issueUrls'].filter((url): url is string => typeof url === 'string'); }
	if (typeof raw['pullRequestBranchName'] === 'string') { result.pullRequestBranchName = raw['pullRequestBranchName']; }
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
 * Reserved key under {@link SessionSummaryMeta} recording how deeply a session
 * was spawned via the `create_session` host tool (0 for a top-level, user-created
 * session). Used to bound recursive session creation. VS Code-specific convention
 * layered on top of the protocol's generic `_meta` bag.
 */
export const SESSION_META_SPAWN_DEPTH_KEY = 'agentHost/sessionSpawnDepth';

/**
 * Reads the `create_session` spawn depth from a {@link SessionSummaryMeta} bag,
 * returning `0` when the key is absent or not a finite number.
 */
export function readSessionSpawnDepth(meta: SessionSummaryMeta | undefined): number {
	const value = meta?.[SESSION_META_SPAWN_DEPTH_KEY];
	return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Returns a new {@link SessionSummaryMeta} with the `create_session` spawn depth
 * set to `depth`, preserving any other keys in the bag.
 */
export function withSessionSpawnDepth(meta: SessionSummaryMeta | undefined, depth: number): SessionSummaryMeta {
	return { ...meta, [SESSION_META_SPAWN_DEPTH_KEY]: depth };
}

export type SessionIdleNotification = 'once' | 'always';
export type SessionCreatorNotificationState = 'waitingForCompletion' | 'notified';

export interface ISessionOrchestration {
	readonly parentSession: string;
	readonly creatorSession: string;
	readonly label?: string;
	readonly coordinateWithCreator: boolean;
	readonly notifyOnIdle?: SessionIdleNotification;
	/** Durable delivery state used to wait for a work outcome and deduplicate replayed statuses. */
	readonly creatorNotificationState?: SessionCreatorNotificationState;
}

export const SESSION_META_ORCHESTRATION_KEY = 'agentHost/orchestration';
export const AH_META_ORCHESTRATION_DB_KEY = 'agentHost.orchestration';

export function readSessionOrchestration(meta: SessionSummaryMeta | undefined): ISessionOrchestration | undefined {
	const value = meta?.[SESSION_META_ORCHESTRATION_KEY];
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const candidate = value as { [key: string]: unknown };
	if (typeof candidate.parentSession !== 'string' || typeof candidate.coordinateWithCreator !== 'boolean') {
		return undefined;
	}
	const creatorSession = typeof candidate.creatorSession === 'string' ? candidate.creatorSession : candidate.parentSession;
	const label = typeof candidate.label === 'string' ? candidate.label : undefined;
	const notifyOnIdle = candidate.notifyOnIdle === 'once' || candidate.notifyOnIdle === 'always' ? candidate.notifyOnIdle : undefined;
	const creatorNotificationState = candidate.creatorNotificationState === 'waitingForCompletion' || candidate.creatorNotificationState === 'notified'
		? candidate.creatorNotificationState
		: undefined;
	return {
		parentSession: candidate.parentSession,
		creatorSession,
		coordinateWithCreator: candidate.coordinateWithCreator,
		...(label !== undefined ? { label } : {}),
		...(notifyOnIdle !== undefined ? { notifyOnIdle } : {}),
		...(creatorNotificationState !== undefined ? { creatorNotificationState } : {}),
	};
}

export function parseSessionOrchestration(value: string | undefined): ISessionOrchestration | undefined {
	if (value === undefined) {
		return undefined;
	}
	try {
		return readSessionOrchestration({ [SESSION_META_ORCHESTRATION_KEY]: JSON.parse(value) });
	} catch {
		return undefined;
	}
}

export function withSessionOrchestration(meta: SessionSummaryMeta | undefined, orchestration: ISessionOrchestration): SessionSummaryMeta {
	return { ...meta, [SESSION_META_ORCHESTRATION_KEY]: orchestration };
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

/** Whether the session was first discovered in a provider-native catalog. */
export function readSessionExternal(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_EXTERNAL_KEY] === true;
}

/** Returns a copy of `meta` with the external-session provenance marker updated. */
export function withSessionExternal(meta: SessionSummaryMeta | undefined, external: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (external) {
		next[SESSION_META_EXTERNAL_KEY] = true;
	} else {
		delete next[SESSION_META_EXTERNAL_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * `_meta` key marking a session as an un-adopted legacy Copilot CLI session
 * surfaced (only under the migrate setting) as adoptable. Clients read it to
 * avoid passively subscribing to — and thereby migrating — the session before
 * the user opens it. Cleared implicitly once the session is adopted (it no
 * longer surfaces as adoptable).
 */
export const SESSION_META_EHCLI_ADOPTABLE_KEY = 'ehcliAdoptable';

/** Whether the session is an un-adopted legacy Copilot CLI session surfaced as adoptable. */
export function readSessionEhcliAdoptable(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_EHCLI_ADOPTABLE_KEY] === true;
}

/** Returns a new {@link SessionSummaryMeta} with the adoptable-legacy marker set. */
export function withSessionEhcliAdoptable(meta: SessionSummaryMeta | undefined): SessionSummaryMeta {
	return { ...meta, [SESSION_META_EHCLI_ADOPTABLE_KEY]: true };
}

/**
 * Session-DB key recording that a session was adopted from a legacy Copilot CLI
 * (extension-host) chat. Unlike {@link SESSION_META_EHCLI_ADOPTABLE_KEY} this
 * survives adoption, so consumers can keep treating the session as legacy for
 * the rest of its life — a migrated session must not change how it is listed.
 */
export const AH_META_EHCLI_ADOPTED_DB_KEY = 'agentHost.ehcliAdopted';

/** `_meta` key mirroring {@link AH_META_EHCLI_ADOPTED_DB_KEY} on a summary. */
export const SESSION_META_EHCLI_ADOPTED_KEY = 'ehcliAdopted';

/** Whether the session was adopted from a legacy Copilot CLI chat. */
export function readSessionEhcliAdopted(meta: SessionSummaryMeta | undefined): boolean {
	return meta?.[SESSION_META_EHCLI_ADOPTED_KEY] === true;
}

/** Returns a copy of `meta` with the adopted-legacy provenance marker updated. */
export function withSessionEhcliAdopted(meta: SessionSummaryMeta | undefined, adopted: boolean): SessionSummaryMeta | undefined {
	const next: { [key: string]: unknown } = { ...meta };
	if (adopted) {
		next[SESSION_META_EHCLI_ADOPTED_KEY] = true;
	} else {
		delete next[SESSION_META_EHCLI_ADOPTED_KEY];
	}
	return Object.keys(next).length > 0 ? next : undefined;
}

/**
 * Whether a session should be matched against a workspace folder by its project
 * (repository) root in addition to its working directories. True only for
 * legacy Copilot CLI sessions, which run out of a worktree outside the
 * repository; agent-host-native worktree sessions are deliberately not surfaced
 * in a window opened on their source repository.
 */
export function readSessionMatchesByProjectRoot(meta: SessionSummaryMeta | undefined): boolean {
	return readSessionEhcliAdoptable(meta) || readSessionEhcliAdopted(meta);
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
