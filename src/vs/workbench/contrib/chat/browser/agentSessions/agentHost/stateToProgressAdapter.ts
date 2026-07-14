/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { decodeBase64 } from '../../../../../../base/common/buffer.js';
import { escapeMarkdownLinkLabel, IMarkdownString, MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { escapeIcons } from '../../../../../../base/common/iconLabels.js';
import { marked, type Token, type Tokens, type TokensList } from '../../../../../../base/common/marked/marked.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { posix, win32 } from '../../../../../../base/common/path.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { buildSubagentChatUri, MessageKind, ToolCallContributorKind, ToolCallStatus, TurnState, ResponsePartKind, getToolFileEdits, getToolOutputText, getToolSubagentContent, readUsageInfoMeta, type ActiveTurn, type ICompletedToolCall, type Message, type ToolCallState, type ToolResultSubagentContent, type Turn, FileEditKind, ToolResultContentType, type ToolResultContent, type UsageInfo, type UsageInfoMeta } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { getToolKind } from '../../../../../../platform/agentHost/common/state/sessionReducers.js';
import { readToolCallMeta } from '../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js';
import { getChatErrorDetailsFromMeta, IChatErrorContext } from '../../../common/chatErrorMessages.js';
import { AGENT_HOST_SCHEME, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { getAgentFeedbackAttachmentMetadata, isAgentFeedbackAnnotationsAttachment, isAgentFeedbackAttachment } from '../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js';
import { getBrowserViewAttachmentMetadata, isBrowserViewAttachment } from '../../../../../../platform/agentHost/common/meta/browserViewAttachments.js';
import { isViewUnreviewedCommentsTool, isAddCommentTool } from '../../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js';
import { isCreateChatTool, isCreateSessionTool, isSendMessageTool, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from '../../../../../../platform/agentHost/common/openSessionLink.js';
import { MessageAttachmentKind, type FileEdit, type MessageAttachment, type StringOrMarkdown, type TextRange } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { normalizeFileEdit } from '../../../../../../platform/agentHost/common/fileEditDiff.js';
import product from '../../../../../../platform/product/common/product.js';
import { formatCopilotCredits, type ChatExternalEditKind, type ChatMcpAppData, type IChatAgentFeedbackReviewConfirmationData, type IChatAutoModeResolutionPart, type IChatExternalEdit, type IChatModifiedFilesConfirmationData, type IChatProgress, type IChatResponseErrorDetails, type IChatSearchToolInvocationData, type IChatSessionCreatedData, type IChatTerminalToolInvocationData, type IChatToolInputInvocationData, type IChatToolInvocationSerialized, type IChatUsage, type IChatUsagePromptTokenDetail, ToolConfirmKind, AgentFeedbackReviewCommandId } from '../../../common/chatService/chatService.js';
import { isTerminalCommandPrompt, type IChatSessionHistoryItem } from '../../../common/chatSessionsService.js';
import { type IQuotaSnapshot } from '../../../../../services/chat/common/chatEntitlementService.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { type IChatRequestVariableData } from '../../../common/model/chatModel.js';
import { AgentHostCompletionReferenceKind, restorePasteVariableEntryFromAttachment, toAgentHostCompletionVariableEntryFromMetadata, type IAgentFeedbackVariableEntry, type IChatRequestVariableEntry } from '../../../common/attachments/chatVariableEntries.js';
import { type IToolConfirmationMessages, type IToolData, type IToolResult, type IToolResultInputOutputDetails, ToolDataSource, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { MCP } from '../../../../mcp/common/modelContextProtocol.js';
import { basename } from '../../../../../../base/common/resources.js';
import { hasKey, type Mutable } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import type { IRange } from '../../../../../../editor/common/core/range.js';
import { isSessionReferenceTrajectoryAttachment, restoreSessionReferenceVariableEntryFromAttachment } from './agentHostSessionReferenceAttachment.js';

/**
 * Constructs a terminal tool session ID from a terminal URI and backend session.
 * The ID is a JSON string containing both so consumers can parse out either.
 */
export function makeAhpTerminalToolSessionId(terminalUri: string, session: URI): string {
	return JSON.stringify({ terminal: terminalUri, session: session.toString() });
}

/**
 * Parses a terminal tool session ID back into its terminal and session URIs.
 */
export function parseAhpTerminalToolSessionId(id: string): { terminal: string; session: string } | undefined {
	try {
		const parsed = JSON.parse(id);
		if (typeof parsed?.terminal === 'string' && typeof parsed?.session === 'string') {
			return parsed;
		}
	} catch { /* not an AHP terminal session ID */ }
	return undefined;
}

/**
 * Extracts the task description from `_meta.subagentDescription`, which is
 * populated from the tool's arguments at `tool_start` time by the event
 * mapper. This is the short task description (e.g., "Find related files"),
 * NOT the agent's own description.
 */
function getSubagentTaskDescription(tc: ToolCallState): string | undefined {
	const v = readToolCallMeta(tc).subagentDescription;
	return v && v.length > 0 ? v : undefined;
}

/**
 * Extracts the agent name from `_meta.subagentAgentName`.
 */
function getSubagentAgentName(tc: ToolCallState): string | undefined {
	const v = readToolCallMeta(tc).subagentAgentName;
	return v && v.length > 0 ? v : undefined;
}

/**
 * The subagent chat resource for a subagent-spawning tool call: the discovery
 * content block's resource when present, else the deterministic child chat URI
 * derived from the session + tool call id (matching the host's
 * {@link buildSubagentChatUri}, and how {@link _observeSubagentSession}
 * subscribes). Deriving it from the tool call id alone keeps the inline subagent
 * pill linkable even when the discovery content block never reaches this chat —
 * e.g. a background subagent whose `subagent_started` arrives after its spawning
 * tool call has already completed, so the running-only content update is dropped
 * by the reducer.
 */
function getSubagentChatResource(tc: ToolCallState, subagentContent: ToolResultSubagentContent | undefined, sessionResource: URI): string {
	return subagentContent?.resource ?? buildSubagentChatUri(sessionResource.toString(), tc.toolCallId);
}

/**
 * Returns MCP App render data for a tool call when it is an MCP call
 * with an `_meta.ui.resourceUri` and a known AHP `mcp://` `channel`.
 * Used by both live and serialized adapters to populate
 * `IChatToolInputInvocationData.mcpAppData` so the chat renderer mounts
 * a `ChatMcpAppSubPart` over the tool.
 *
 * Tool calls produced by an agent host always route through the AHP
 * `mcp://` side channel (and never through {@link IMcpService}), so
 * the returned data is always `kind: 'agentHost'`. The customization
 * id doubles as a stable per-session `serverId` for webview origin
 * scoping — two sessions exposing the same upstream MCP server therefore
 * get distinct webview origins (assuming distinct customization ids).
 */
function getMcpAppData(tc: ToolCallState, _sessionResource: URI): ChatMcpAppData | undefined {
	if (tc.contributor?.kind !== ToolCallContributorKind.MCP) {
		return undefined;
	}
	const ui = readToolCallMeta(tc).ui;
	if (!ui) {
		return undefined;
	}
	const resourceUri = ui.resourceUri;
	const channelValue = ui.channel;
	if (channelValue === undefined) {
		// No channel yet — the App's sub-RPCs would have nowhere to go.
		// Skip mounting until the customization reaches Ready and the
		// producer re-emits with the channel populated.
		return undefined;
	}
	return {
		kind: 'agentHost',
		resourceUri,
		serverId: tc.contributor.customizationId,
		channel: channelValue,
	};
}

function getToolRawInput(tc: ToolCallState): unknown {
	try {
		return tc.status === ToolCallStatus.Streaming || !tc.toolInput ? {} : JSON.parse(tc.toolInput);
	} catch {
		return { input: tc.status === ToolCallStatus.Streaming ? undefined : tc.toolInput };
	}
}

function buildMcpAppToolInputData(tc: ToolCallState, sessionResource: URI, existingRawInput?: unknown): IChatToolInputInvocationData | undefined {
	const mcpAppData = getMcpAppData(tc, sessionResource);
	if (!mcpAppData) {
		return undefined;
	}
	return {
		kind: 'input',
		rawInput: existingRawInput ?? getToolRawInput(tc),
		mcpAppData,
	};
}

function isSameMcpAppData(a: ChatMcpAppData | undefined, b: ChatMcpAppData | undefined): boolean {
	if (a?.kind !== b?.kind || a?.resourceUri !== b?.resourceUri) {
		return false;
	}
	if (a?.kind === 'agentHost' && b?.kind === 'agentHost') {
		return a.serverId === b.serverId && a.channel === b.channel;
	}
	if (a?.kind === 'local' && b?.kind === 'local') {
		return a.serverDefinitionId === b.serverDefinitionId && a.collectionId === b.collectionId;
	}
	return a === b;
}

/**
 * Known tool names that spawn subagent sessions. Used as a client-side
 * fallback when the server hasn't set `_meta.toolKind` (e.g. sessions
 * restored by an older server version that didn't carry `_meta`).
 */
const SUBAGENT_TOOL_NAMES: ReadonlySet<string> = new Set(['task']);

export function isSubagentToolName(toolName: string): boolean {
	return SUBAGENT_TOOL_NAMES.has(toolName);
}

export function systemNotificationToChatPart(content: StringOrMarkdown | undefined, connectionAuthority: string): IChatProgress | undefined {
	if (!content) {
		return undefined;
	}
	const value = stringOrMarkdownToString(content, connectionAuthority);
	return { kind: 'systemNotification', content: typeof value === 'string' ? new MarkdownString(value) : value };
}

/**
 * Returns true if this tool call spawns a subagent session, either because
 * the server reported `_meta.toolKind === 'subagent'` or because the tool
 * name is in the known fallback set (older snapshots without `_meta`).
 */
export function isSubagentTool(tc: ToolCallState): boolean {
	return getToolKind(tc) === 'subagent' || isSubagentToolName(tc.toolName);
}

/**
 * Finds a terminal content block in a tool call's content array.
 * Returns the terminal URI if found.
 */
export function getTerminalContentUri(content: ToolResultContent[] | undefined): string | undefined {
	if (!content) {
		return undefined;
	}
	for (const block of content) {
		if (block.type === ToolResultContentType.Terminal) {
			return block.resource;
		}
	}
	return undefined;
}

/**
 * Resolves a raw per-turn model id (as it appears on `UsageInfo.model`) into
 * the chat layer's namespaced language-model id and a human-readable display
 * details. Both halves are independent: the id flows onto request history
 * items (so the input picker shows the model that ran), while the details
 * flow onto response history items (so the response footer shows the model
 * and any usage metadata).
 */
export interface TurnModelLookup {
	/** Returns the chat-layer namespaced model id for a raw AHP model id. */
	toLanguageModelId(rawModelId: string | undefined): string | undefined;
	/** Returns the human-readable response details, or undefined if unknown. */
	toResponseDetails(rawModelId: string | undefined, usage: UsageInfo | undefined): string | undefined;
	/** Returns the Auto model routing part carried by this usage report, if any. */
	toAutoModeResolution?(usage: UsageInfo | undefined): IChatAutoModeResolutionPart | undefined;
}

/** Minimal model metadata needed to render a turn's response footer (kept small for unit testing). */
export interface ITurnResponseModel {
	readonly name: string;
	readonly pricing?: string;
}

/**
 * Formats a turn's response footer: the model display name plus usage metadata (credits or pricing).
 * `model` is the resolved model; `billedModelId` is the turn's `usage.model` when it didn't resolve to a
 * registered model (e.g. an "Auto" pick billed as `raptor-mini`), shown inline as `Auto (raptor-mini)`.
 * Returns `undefined` when the model is unknown.
 */
export function formatTurnResponseDetails(
	model: ITurnResponseModel | undefined,
	billedModelId: string | undefined,
	usage: UsageInfo | undefined,
): string | undefined {
	if (!model) {
		return undefined;
	}
	const displayName = formatTurnModelName(model, billedModelId);
	const credits = usageInfoToChatUsage(usage)?.copilotCredits;
	if (credits !== undefined) {
		const formatted = formatCopilotCredits(credits);
		const creditDetails = formatted === '1'
			? localize('agentHost.responseDetails.credit', "{0} credit", formatted)
			: localize('agentHost.responseDetails.credits', "{0} credits", formatted);
		return [displayName, creditDetails].join(' • ');
	}
	return [displayName, model.pricing].filter(Boolean).join(' · ');
}

/** Converts an agent-host Auto routing result into the shared chat UI part. */
export function usageInfoToAutoModeResolution(usage: UsageInfo | undefined, resolvedModelName: string | undefined): IChatAutoModeResolutionPart | undefined {
	const resolution = readUsageInfoMeta(usage).autoModeResolved;
	if (!resolution || typeof resolution.confidence !== 'number' || !Number.isFinite(resolution.confidence)) {
		return undefined;
	}
	const predictedLabel = resolution.predictedLabel;
	if (predictedLabel !== 'needs_reasoning' && predictedLabel !== 'no_reasoning' && predictedLabel !== 'fallback') {
		return undefined;
	}
	return {
		kind: 'autoModeResolution',
		resolvedModel: resolution.chosenModel,
		resolvedModelName: resolvedModelName ?? resolution.chosenModel,
		predictedLabel,
		confidence: Math.max(0, Math.min(1, resolution.confidence)),
	};
}

/** Appends the billed model id (e.g. `Auto (raptor-mini)`) when one is supplied. */
function formatTurnModelName(model: ITurnResponseModel, billedModelId: string | undefined): string {
	if (billedModelId) {
		return localize('agentHost.responseDetails.resolvedModel', "{0} ({1})", model.name, billedModelId);
	}
	return model.name;
}

export function usageInfoToChatUsage(usage: UsageInfo | undefined): IChatUsage | undefined {
	const hasTokens = typeof usage?.inputTokens === 'number' || typeof usage?.outputTokens === 'number';
	const copilotCredits = getCopilotCredits(usage);
	if (!hasTokens && copilotCredits === undefined) {
		return undefined;
	}
	return {
		kind: 'usage',
		promptTokens: usage?.inputTokens ?? 0,
		completionTokens: usage?.outputTokens ?? 0,
		copilotCredits,
		promptTokenDetails: contextAttributionToPromptTokenDetails(usage),
	};
}

function getCopilotCredits(usage: UsageInfo | undefined): number | undefined {
	const meta = readUsageInfoMeta(usage);
	const totalNanoAiu = meta?.copilotUsage?.totalNanoAiu;
	if (typeof totalNanoAiu === 'number' && totalNanoAiu >= 0) {
		return totalNanoAiu / 1_000_000_000;
	}
	const cost = meta?.cost;
	return typeof cost === 'number' && cost >= 0
		? cost
		: undefined;
}

/**
 * Maps SDK `kind` values to display categories used by the context-usage
 * widget. Categories follow the local agent's established grouping
 * ("System" for infrastructure, "User Context" for conversation content).
 */
function kindToCategory(kind: string): string {
	switch (kind) {
		case 'system':
		case 'toolDefinition':
			return localize('contextAttribution.category.system', "System");
		case 'tool':
		case 'skill':
		case 'subagent':
		case 'mcpServer':
		case 'plugin':
			return localize('contextAttribution.category.userContext', "User Context");
		default:
			return localize('contextAttribution.category.userContext', "User Context");
	}
}

/**
 * Human-readable labels for aggregated `kind` groups. Entries of kind
 * `system` are shown individually (they are already aggregated rollups);
 * other kinds are summed into a single row per kind.
 */
function kindToAggregateLabel(kind: string): string {
	switch (kind) {
		case 'tool': return localize('contextAttribution.label.toolResults', "Tool Results");
		case 'toolDefinition': return localize('contextAttribution.label.toolDefinitions', "Tool Definitions");
		case 'skill': return localize('contextAttribution.label.skills', "Skills");
		case 'subagent': return localize('contextAttribution.label.subAgents', "Sub-agents");
		case 'mcpServer': return localize('contextAttribution.label.mcpTools', "MCP Tools");
		case 'plugin': return localize('contextAttribution.label.plugins', "Plugins");
		default: return kind;
	}
}

/**
 * Converts the SDK's flat `contextAttribution.entries[]` into the
 * `promptTokenDetails` array consumed by the context-usage widget.
 *
 * Entries of `kind: "system"` are emitted individually (they are already
 * high-level rollups like "System prompt") unless they are a parent of
 * `toolDefinition` entries — in that case the rollup is skipped and the
 * individual `toolDefinition` entries are aggregated into their own row.
 * All other kinds are **aggregated into one row per kind** (e.g. all
 * `mcpServer` entries become a single "MCP Tools" line) to match the
 * CLI's `/context` summary view.
 * Any remaining tokens not covered by entries are reported as "Messages"
 * (conversation history: user/assistant messages and tool results).
 */
function contextAttributionToPromptTokenDetails(usage: UsageInfo | undefined): IChatUsagePromptTokenDetail[] | undefined {
	const meta = readUsageInfoMeta(usage);
	const attribution = meta?.contextAttribution;
	if (!attribution || attribution.totalTokens <= 0 || attribution.entries.length === 0) {
		return undefined;
	}
	const details: IChatUsagePromptTokenDetail[] = [];

	// Identify system entries that are parents of other entries.
	// These rollups are skipped because their children are aggregated
	// directly into their own rows to avoid double-counting.
	const parentIds = new Set<string>();
	for (const entry of attribution.entries) {
		if (entry.parentId) {
			parentIds.add(entry.parentId);
		}
	}

	// Accumulate tokens per aggregated kind
	const kindTokens = new Map<string, number>();
	// Track tokens accounted for by top-level entries (system rollups + aggregated kinds)
	let accountedTokens = 0;

	for (const entry of attribution.entries) {
		if (entry.kind === 'system') {
			if (parentIds.has(entry.id)) {
				// This system entry is a rollup parent whose children are
				// aggregated separately — skip to avoid double-counting.
				continue;
			}
			// System entries are shown individually (already high-level rollups)
			accountedTokens += entry.tokens;
			const percentageOfPrompt = Math.round((entry.tokens / attribution.totalTokens) * 100);
			if (percentageOfPrompt > 0) {
				details.push({
					category: kindToCategory('system'),
					label: entry.label,
					percentageOfPrompt,
				});
			}
		} else {
			// Aggregate all other kinds (including toolDefinition) into one row per kind
			kindTokens.set(entry.kind, (kindTokens.get(entry.kind) ?? 0) + entry.tokens);
		}
	}

	// Emit aggregated rows
	for (const [kind, tokens] of kindTokens) {
		accountedTokens += tokens;
		const percentageOfPrompt = Math.round((tokens / attribution.totalTokens) * 100);
		if (percentageOfPrompt <= 0) {
			continue;
		}
		const category = kindToCategory(kind);
		const label = kindToAggregateLabel(kind);
		details.push({ category, label, percentageOfPrompt });
	}

	// The remainder is conversation messages (user/assistant turns, tool results)
	// not attributed to any specific entry by the SDK.
	const messageTokens = Math.max(0, attribution.totalTokens - accountedTokens);
	if (messageTokens > 0) {
		const percentageOfPrompt = Math.round((messageTokens / attribution.totalTokens) * 100);
		if (percentageOfPrompt > 0) {
			details.push({
				category: localize('contextAttribution.category.userContext', "User Context"),
				label: localize('contextAttribution.label.messages', "Messages"),
				percentageOfPrompt,
			});
		}
	}

	return details.length > 0 ? details : undefined;
}

/**
 * A partial quota update derived from a usage report's `_meta.quotaSnapshots`. Structurally a
 * subset of the entitlement service's quota state, so callers merge it onto the existing quotas.
 */
export interface IAgentHostQuotaUpdate {
	readonly chat?: IQuotaSnapshot;
	readonly completions?: IQuotaSnapshot;
	readonly premiumChat?: IQuotaSnapshot;
	readonly additionalUsageEnabled?: boolean;
	readonly additionalUsageCount?: number;
	readonly resetDate?: string;
}

type AccountQuotaSnapshot = NonNullable<NonNullable<UsageInfoMeta['quotaSnapshots']>[string]>;

function mapAccountQuotaSnapshot(snapshot: AccountQuotaSnapshot): IQuotaSnapshot | undefined {
	const unlimited = snapshot.isUnlimitedEntitlement ?? false;
	const entitlement = typeof snapshot.entitlementRequests === 'number' ? snapshot.entitlementRequests : undefined;

	// Skip categories with no allocated entitlement (e.g. free-tier premium with 0 credits),
	// mirroring `parseQuotas` so we don't surface an empty premium bucket.
	if (!unlimited && entitlement === 0) {
		return undefined;
	}

	// `remainingPercentage` is required to express a usable snapshot. Treat its absence as
	// "no data" and skip the category rather than defaulting to 0, which would otherwise
	// masquerade as an exhausted quota (matching `parseQuotas`, where `percent_remaining` is required).
	if (typeof snapshot.remainingPercentage !== 'number') {
		return undefined;
	}

	const used = typeof snapshot.usedRequests === 'number' ? snapshot.usedRequests : undefined;
	const resetAt = snapshot.resetDate ? Date.parse(snapshot.resetDate) : NaN;
	return {
		percentRemaining: Math.min(100, Math.max(0, snapshot.remainingPercentage)),
		unlimited,
		entitlement: !unlimited && entitlement !== undefined && entitlement >= 0 ? entitlement : undefined,
		quotaRemaining: !unlimited && entitlement !== undefined && used !== undefined ? Math.max(0, entitlement - used) : undefined,
		resetAt: Number.isFinite(resetAt) ? resetAt : undefined,
	};
}

/**
 * Maps the per-category quota snapshots carried on a usage report's `_meta.quotaSnapshots`
 * (reported by the model-call usage event) into a partial quota update for the entitlement
 * service. Returns `undefined` when no usable snapshot is present.
 */
export function usageInfoToQuotas(usage: UsageInfo | undefined): IAgentHostQuotaUpdate | undefined {
	const meta = readUsageInfoMeta(usage);
	const snapshots = meta?.quotaSnapshots;
	if (!snapshots) {
		return undefined;
	}

	const update: Mutable<IAgentHostQuotaUpdate> = {};
	let hasAny = false;

	const chat = snapshots['chat'] && mapAccountQuotaSnapshot(snapshots['chat']);
	if (chat) {
		update.chat = chat;
		hasAny = true;
	}
	const completions = snapshots['completions'] && mapAccountQuotaSnapshot(snapshots['completions']);
	if (completions) {
		update.completions = completions;
		hasAny = true;
	}
	const premiumRaw = snapshots['premium_interactions'];
	const premiumChat = premiumRaw && mapAccountQuotaSnapshot(premiumRaw);
	if (premiumChat) {
		update.premiumChat = premiumChat;
		hasAny = true;
	}
	if (premiumRaw) {
		update.additionalUsageEnabled = premiumRaw.overageAllowedWithExhaustedQuota ?? false;
		update.additionalUsageCount = typeof premiumRaw.overage === 'number' ? premiumRaw.overage : 0;
		hasAny = true;
	}

	const resetDate = premiumRaw?.resetDate ?? snapshots['chat']?.resetDate;
	if (resetDate) {
		update.resetDate = resetDate;
	}

	return hasAny ? update : undefined;
}

/**
 * Converts completed turns from the protocol state into session history items.
 *
 * Per turn, prefers `turn.usage?.model` so each request/response pair shows
 * the model that actually ran, even if the user changed models mid-session.
 * The `lookup` callback is responsible for any session-level fallback (e.g.
 * `summary.model?.id` when usage hasn't reported a model yet).
 */
export function turnsToHistory(backendSession: URI, turns: readonly Turn[], participantId: string, connectionAuthority: string, lookup?: TurnModelLookup, errorContext?: IChatErrorContext, terminalCommandPrefix?: string): IChatSessionHistoryItem[] {
	const history: IChatSessionHistoryItem[] = [];
	for (const turn of turns) {
		const rawModelId = turn.usage?.model;
		const modelId = lookup?.toLanguageModelId(rawModelId);
		const details = lookup?.toResponseDetails(rawModelId, turn.usage);

		// Request
		const variableData = messageToVariableData(turn.message, connectionAuthority);
		const isSystemInitiated = turn.message.origin.kind === MessageKind.SystemNotification;
		// A message runs as a terminal command when it starts with the host's
		// advertised prefix and has a non-empty command after it (mirroring the
		// host-side bang parser, where a lone `!` is forwarded to the agent).
		const isTerminalRequest = isTerminalCommandPrompt(turn.message.text, terminalCommandPrefix);
		history.push({
			id: turn.id,
			type: 'request',
			prompt: turn.message.text,
			participant: participantId,
			modelId,
			...(turn.startedAt !== undefined && Number.isFinite(Date.parse(turn.startedAt)) ? { timestamp: Date.parse(turn.startedAt) } : {}),
			variableData,
			...(isSystemInitiated ? {
				isSystemInitiated: true,
			} : {}),
			...(isTerminalRequest ? {
				isTerminalRequest: true,
			} : {}),
		});

		// Response parts — iterate the unified responseParts array
		const parts: IChatProgress[] = [];
		const autoModeResolution = lookup?.toAutoModeResolution?.(turn.usage);
		if (autoModeResolution) {
			parts.push(autoModeResolution);
		}
		const usage = usageInfoToChatUsage(turn.usage);
		if (usage) {
			parts.push(usage);
		}

		for (const rp of turn.responseParts) {
			switch (rp.kind) {
				case ResponsePartKind.Markdown:
					if (rp.content) {
						parts.push({ kind: 'markdownContent', content: new MarkdownString(rp.content) });
					}
					break;
				case ResponsePartKind.ToolCall: {
					const tc = rp.toolCall as ICompletedToolCall;
					const fileEditParts = completedToolCallToEditParts(tc, connectionAuthority);
					const serialized = completedToolCallToSerialized(tc, undefined, backendSession, connectionAuthority);
					if (fileEditParts.length > 0) {
						serialized.presentation = ToolInvocationPresentation.Hidden;
					}
					parts.push(serialized);
					parts.push(...fileEditParts);
					break;
				}
				case ResponsePartKind.Reasoning:
					if (rp.content) {
						parts.push({ kind: 'thinking', value: rp.content, id: rp.id });
					}
					break;
				case ResponsePartKind.SystemNotification:
					{
						const progress = systemNotificationToChatPart(rp.content, connectionAuthority);
						if (progress) {
							parts.push(progress);
						}
					}
					break;
				case ResponsePartKind.ContentRef:
					// Content references are not restored into history;
					// they are handled separately by the content provider.
					break;
			}
		}

		// Error details for failed turns. Surfaced as the response's
		// `errorDetails` (rather than inline markdown) so the chat renders a
		// proper error — including the quota-exceeded upgrade affordance —
		// consistently with the live agent result.
		let errorDetails: IChatResponseErrorDetails | undefined;
		if (turn.state === TurnState.Error && turn.error) {
			errorDetails = getChatErrorDetailsFromMeta(turn.error, errorContext)
				?? { message: `Error: (${turn.error.errorType}) ${turn.error.message}` };
		}

		const startedAt = turn.startedAt === undefined ? undefined : Date.parse(turn.startedAt);
		const completedAt = startedAt !== undefined && Number.isFinite(startedAt) && typeof turn.duration === 'number' && Number.isFinite(turn.duration) && turn.duration >= 0
			? startedAt + turn.duration
			: undefined;
		history.push({ type: 'response', parts, participant: participantId, details, elapsedMs: turn.duration, completedAt, ...(errorDetails ? { errorDetails } : {}) });
	}
	return history;
}

/**
 * Converts a turn's persisted {@link Message} into the chat-layer
 * {@link IChatRequestVariableData} shape so attachments survive a
 * history replay (and pending/server-initiated turn synthesis). Returns
 * `undefined` when the message has no convertible attachments.
 */
export function messageToVariableData(message: Message, connectionAuthority: string): IChatRequestVariableData | undefined {
	return messageAttachmentsToVariableData(message.attachments, connectionAuthority);
}

export function messageAttachmentsToVariableData(attachments: readonly MessageAttachment[] | undefined, connectionAuthority: string): IChatRequestVariableData | undefined {
	if (!attachments?.length) {
		return undefined;
	}
	const variables: IChatRequestVariableEntry[] = [];
	// Agent feedback is sent as one annotations attachment per comment; restore
	// them into a single aggregated agentFeedback entry so history shows one
	// "N comments" chip rather than one chip per comment.
	const aggregatedFeedback = aggregateAgentFeedbackAnnotationAttachments(attachments, connectionAuthority);
	if (aggregatedFeedback) {
		variables.push(aggregatedFeedback);
	}
	for (const a of attachments) {
		if (isAgentFeedbackAnnotationsAttachment(a)) {
			continue; // handled by the aggregation above
		}
		const v = messageAttachmentToVariableEntry(a, connectionAuthority);
		if (v) {
			variables.push(v);
		}
	}
	return variables.length > 0 ? { variables } : undefined;
}

function aggregateAgentFeedbackAnnotationAttachments(attachments: readonly MessageAttachment[], connectionAuthority: string): IAgentFeedbackVariableEntry | undefined {
	const feedbackAttachments = attachments.filter(isAgentFeedbackAnnotationsAttachment);
	if (feedbackAttachments.length === 0) {
		return undefined;
	}
	let sessionResource: string | undefined;
	let annotationsResource: string | undefined;
	const feedbackItems: IAgentFeedbackVariableEntry['feedbackItems'][number][] = [];
	for (const attachment of feedbackAttachments) {
		annotationsResource ??= attachment.resource;
		const metadata = getAgentFeedbackAttachmentMetadata(attachment);
		if (!metadata) {
			continue;
		}
		sessionResource ??= metadata.sessionResource;
		for (const item of metadata.feedbackItems) {
			feedbackItems.push({
				id: item.id,
				text: item.text,
				resourceUri: toAgentHostUri(URI.parse(item.resourceUri), connectionAuthority),
				range: textRangeToIRange(item.range),
				...(item.replies?.length ? { replies: item.replies } : {}),
			});
		}
	}
	if (feedbackItems.length === 0 || !sessionResource) {
		return undefined;
	}
	return {
		kind: 'agentFeedback',
		id: generateUuid(),
		name: feedbackItems.length === 1
			? localize('agentFeedback.one', "1 comment")
			: localize('agentFeedback.many', "{0} comments", feedbackItems.length),
		value: feedbackAttachments[0].label,
		sessionResource: URI.parse(sessionResource),
		annotationsResource: annotationsResource ? URI.parse(annotationsResource) : undefined,
		feedbackItems,
	};
}

function messageAttachmentToVariableEntry(attachment: MessageAttachment, connectionAuthority: string): IChatRequestVariableEntry | undefined {
	if (isAgentFeedbackAttachment(attachment)) {
		const metadata = getAgentFeedbackAttachmentMetadata(attachment);
		if (metadata) {
			return {
				kind: 'agentFeedback',
				id: generateUuid(),
				name: attachment.label,
				value: attachment.modelRepresentation || attachment.label,
				sessionResource: URI.parse(metadata.sessionResource),
				feedbackItems: metadata.feedbackItems.map(item => ({
					id: item.id,
					text: item.text,
					resourceUri: toAgentHostUri(URI.parse(item.resourceUri), connectionAuthority),
					range: textRangeToIRange(item.range),
				})),
				_meta: attachment._meta,
			};
		}
	}

	if (attachment.type === MessageAttachmentKind.Resource) {
		if (isSessionReferenceTrajectoryAttachment(attachment)) {
			return undefined;
		}
		const uri = toAgentHostUri(URI.parse(attachment.uri), connectionAuthority);
		const name = attachment.label;
		const id = uri.toString() + (attachment.selection
			? `:${attachment.selection.range.start.line}-${attachment.selection.range.end.line}`
			: '');
		const _meta = attachment._meta;

		if (attachment.displayKind === 'directory') {
			return { kind: 'directory', id, name, value: uri, _meta };
		}
		if (attachment.displayKind === 'image') {
			return {
				kind: 'image',
				id,
				name,
				value: uri,
				isURL: true,
				references: [{ kind: 'reference', reference: uri }],
				_meta,
			};
		}
		if (attachment.selection) {
			return {
				kind: 'file',
				id,
				name,
				value: { uri, range: textRangeToIRange(attachment.selection.range) },
				_meta,
			};
		}
		return { kind: 'file', id, name, value: uri, _meta };
	}

	if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
		if (!attachment.contentType.startsWith('image/')) {
			return {
				kind: 'generic',
				id: generateUuid(),
				name: attachment.label,
				value: decodeBase64(attachment.data).buffer,
				_meta: attachment._meta,
			};
		}

		return {
			kind: 'image',
			id: generateUuid(),
			name: attachment.label || 'image',
			value: decodeBase64(attachment.data).buffer,
			mimeType: attachment.contentType,
			isURL: false,
			_meta: attachment._meta,
		};
	}

	const agentHostCompletionKind = getAgentHostCompletionKind(attachment);
	if (agentHostCompletionKind !== undefined) {
		return toAgentHostCompletionVariableEntryFromMetadata(agentHostCompletionKind, attachment.label, attachment._meta);
	}

	const modelRepresentation = attachment.type === MessageAttachmentKind.Simple ? attachment.modelRepresentation : undefined;
	if (isBrowserViewAttachment(attachment) && modelRepresentation !== undefined) {
		const metadata = getBrowserViewAttachmentMetadata(attachment);
		if (metadata) {
			return {
				kind: 'browserView',
				id: metadata.browserUri,
				name: attachment.label,
				value: URI.parse(metadata.browserUri),
				browserId: metadata.browserId,
				modelDescription: modelRepresentation,
				_meta: attachment._meta,
			};
		}
	}
	if (attachment.displayKind === 'workspace' && modelRepresentation !== undefined) {
		return {
			kind: 'workspace',
			id: attachment.label,
			name: attachment.label,
			value: modelRepresentation,
			_meta: attachment._meta,
		};
	}
	if (attachment.type === MessageAttachmentKind.Simple) {
		const sessionReferenceEntry = restoreSessionReferenceVariableEntryFromAttachment(attachment);
		if (sessionReferenceEntry) {
			return sessionReferenceEntry;
		}
	}
	const pasteEntry = restorePasteVariableEntryFromAttachment({
		label: attachment.label,
		displayKind: attachment.displayKind,
		modelRepresentation,
		_meta: attachment._meta,
	});
	if (pasteEntry) {
		return pasteEntry;
	}
	return {
		kind: 'generic',
		id: generateUuid(),
		name: attachment.label,
		value: modelRepresentation || attachment.label,
		_meta: attachment._meta,
	};
}

function getAgentHostCompletionKind(attachment: MessageAttachment): AgentHostCompletionReferenceKind | undefined {
	if (attachment.type !== MessageAttachmentKind.Simple) {
		return undefined;
	}
	switch (attachment.displayKind) {
		case 'command':
			return AgentHostCompletionReferenceKind.Command;
		case 'skill':
			return AgentHostCompletionReferenceKind.Skill;
	}
	return undefined;
}

function textRangeToIRange(range: TextRange): IRange {
	return {
		startLineNumber: range.start.line + 1,
		startColumn: range.start.character + 1,
		endLineNumber: range.end.line + 1,
		endColumn: range.end.character + 1,
	};
}

/**
 * Converts an active (in-progress) turn's accumulated state into progress
 * items suitable for replaying into the chat UI when reconnecting to a
 * session that is mid-turn.
 *
 * Returns serialized progress items for content already received (text,
 * reasoning, completed tool calls) and live {@link ChatToolInvocation}
 * objects for running tool calls and pending confirmations.
 */
export function activeTurnToProgress(sessionResource: URI, activeTurn: ActiveTurn, connectionAuthority: string): IChatProgress[] {
	const parts: IChatProgress[] = [];
	const usage = usageInfoToChatUsage(activeTurn.usage);
	if (usage) {
		parts.push(usage);
	}

	for (const rp of activeTurn.responseParts) {
		switch (rp.kind) {
			case ResponsePartKind.Markdown:
				if (rp.content) {
					parts.push({ kind: 'markdownContent', content: new MarkdownString(rp.content) });
				}
				break;
			case ResponsePartKind.Reasoning:
				if (rp.content) {
					parts.push({ kind: 'thinking', value: rp.content, id: rp.id });
				}
				break;
			case ResponsePartKind.ToolCall: {
				const tc = rp.toolCall;
				if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
					parts.push(completedToolCallToSerialized(tc as ICompletedToolCall, undefined, sessionResource, connectionAuthority));
				} else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
					parts.push(toolCallStateToInvocation(tc, undefined, sessionResource, connectionAuthority));
				}
				break;
			}
			case ResponsePartKind.SystemNotification:
				{
					const progress = systemNotificationToChatPart(rp.content, connectionAuthority);
					if (progress) {
						parts.push(progress);
					}
				}
				break;
			case ResponsePartKind.ContentRef:
				break;
		}
	}

	return parts;
}

function getTerminalInput(tc: ToolCallState): string | undefined {
	if (tc.status !== ToolCallStatus.Streaming && tc.toolInput) {
		try {
			return JSON.parse(tc.toolInput).command || tc.toolInput;
		} catch {
			return tc.toolInput;
		}
	}

	return undefined;
}

function getTerminalOutput(tc: ToolCallState) {
	if (tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.Running) {
		return undefined;
	}

	const terminalComplete = tc.content?.find(isToolResultTerminalCompleteContent);

	// Prefer the structured terminal snapshot. Text content is a compatibility
	// fallback for older/restored results and can include legacy bookkeeping.
	let text = terminalComplete?.preview;
	if (text === undefined) {
		const fallbackText = tc.content?.find(isToolResultTextContent)?.text;
		text = fallbackText === undefined ? undefined : stripLegacyTerminalExitMarkers(fallbackText);
	}
	if (text === undefined || (!text && terminalComplete?.truncated !== true)) {
		return undefined;
	}

	// The detached xterm used to render this output treats input as a raw TTY stream,
	// so a lone `\n` only advances the row without resetting the column (producing a
	// staircase). SDK terminal tools return plain text with `\n` line endings, so
	// normalize to `\r\n` here. The replace is idempotent on already-CRLF input.
	return {
		text: text.replace(/\r?\n/g, '\r\n'),
		...(terminalComplete?.truncated !== undefined ? { truncated: terminalComplete.truncated } : {}),
	};
}

function stripLegacyTerminalExitMarkers(text: string): string {
	return text.replace(/<shellId:[^>\r\n]*completed with exit code \d+>\s*$/i, '');
}

function isToolResultTextContent(content: ToolResultContent): content is Extract<ToolResultContent, { type: ToolResultContentType.Text }> {
	return content.type === ToolResultContentType.Text;
}

function getTerminalCommandState(tc: ToolCallState, fallbackSuccess?: boolean): IChatTerminalToolInvocationData['terminalCommandState'] | undefined {
	const terminalComplete = tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running
		? tc.content?.find(isToolResultTerminalCompleteContent)
		: undefined;
	if (terminalComplete?.exitCode !== undefined) {
		return { exitCode: terminalComplete.exitCode };
	}
	return fallbackSuccess === undefined ? undefined : { exitCode: fallbackSuccess ? 0 : 1 };
}

function isToolResultTerminalCompleteContent(content: ToolResultContent): content is Extract<ToolResultContent, { type: ToolResultContentType.TerminalComplete }> {
	return content.type === ToolResultContentType.TerminalComplete;
}

function getTerminalLanguage(tc: ToolCallState) {
	return tc.toolName === 'powershell' ? 'powershell' : 'shellscript';
}

/**
 * True if this tool call should render as a terminal pill in the chat UI.
 *
 * Combines three signals so the workbench renders consistently across every
 * stage of the tool lifecycle:
 *
 * 1. `existingKind === 'terminal'` — preserve the prior render decision so a
 *    tool already set up as terminal stays terminal across snapshots.
 * 2. `getToolKind(tc) === 'terminal'` with a command available — the
 *    always-available `_meta.toolKind` flag set by the event mapper for
 *    built-in `bash`/`powershell` SDK tools that never emit a
 *    {@link ToolResultContentType.Terminal} content block. We only render the
 *    terminal pill once we actually have the command (`getTerminalInput`):
 *    rendering a terminal pill with an empty command line looks broken, so
 *    until the command arrives we fall back to the generic tool widget
 *    (the `invocationMessage`).
 * 3. A `Terminal` content block in `tc.content` (Running/Completed only) —
 *    the AHP-side signal for the custom terminal tool (`agenthost-terminal:`
 *    URIs).
 *
 * Without (1) the live invocation would race against the async arrival of the
 * Terminal block via `onDidAssociateTerminal`.
 */
function isTerminalToolCall(tc: ToolCallState, existingKind?: string): boolean {
	if (existingKind === 'terminal') {
		return true;
	}
	if (getToolKind(tc) === 'terminal' && getTerminalInput(tc) !== undefined) {
		return true;
	}
	if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) {
		return !!getTerminalContentUri(tc.content);
	}
	return false;
}

/**
 * Build an {@link IChatTerminalToolInvocationData} payload from a tool-call
 * state. Single source of truth for the five places that need to (re)compute
 * the terminal payload: pending confirmation, live create, streaming refresh,
 * finalize, and history replay.
 *
 * Each field falls back to `existing` so callers can re-call on later
 * snapshots without losing values that arrived earlier. This is critical for
 * the AHP fields `terminalToolSessionId` / `terminalCommandUri`, which
 * `_reviveTerminalIfNeeded` populates asynchronously once a Terminal content
 * block arrives — refreshing from `tc` alone would clobber them whenever the
 * block hasn't landed yet.
 *
 * Completion-only fields (e.g. `terminalCommandState`) are layered on top by
 * the caller; the helper is status-agnostic.
 */
function buildTerminalToolSpecificData(
	tc: ToolCallState,
	sessionResource: URI,
	existing?: IChatTerminalToolInvocationData,
): IChatTerminalToolInvocationData {
	const terminalContentUri = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed)
		? getTerminalContentUri(tc.content)
		: undefined;
	const nextCommand = getTerminalInput(tc);
	const commandLine = nextCommand
		? { ...existing?.commandLine, original: nextCommand }
		: existing?.commandLine ?? { original: '' };
	const nextOutput = getTerminalOutput(tc);
	// Spread `existing` so any field set by a prior pass (notably the
	// async-populated AHP fields and anything we don't explicitly handle)
	// is preserved unless we have a fresh value to override it with.
	return {
		...existing,
		kind: 'terminal',
		commandLine,
		intention: tc.intention ?? existing?.intention,
		language: existing?.language ?? getTerminalLanguage(tc),
		terminalToolSessionId: terminalContentUri
			? makeAhpTerminalToolSessionId(terminalContentUri, sessionResource)
			: existing?.terminalToolSessionId,
		terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : existing?.terminalCommandUri,
		terminalCommandOutput: nextOutput ?? existing?.terminalCommandOutput,
	};
}

function getToolInputOutputDetails(tc: ToolCallState, isError: boolean, errorString: string | undefined, includeMcpOutput: boolean, connectionAuthority: string): IToolResultInputOutputDetails | undefined {
	const toolInput = tc.status === ToolCallStatus.Streaming ? undefined : tc.toolInput;
	if (!toolInput) {
		return undefined;
	}

	const output: IToolResultInputOutputDetails['output'] = [];
	if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running) {
		for (const block of tc.content ?? []) {
			switch (block.type) {
				case ToolResultContentType.Text:
					output.push({ type: 'embed', value: block.text, isText: true, mimeType: 'text/plain' });
					break;
				case ToolResultContentType.EmbeddedResource:
					output.push({ type: 'embed', value: block.data, mimeType: block.contentType });
					break;
				case ToolResultContentType.Resource:
					output.push({ type: 'ref', uri: wrapResourceUri(block.uri, connectionAuthority), mimeType: block.contentType });
					break;
			}
		}
	}

	if (output.length === 0 && errorString) {
		output.push({ type: 'embed', value: errorString, isText: true, mimeType: 'text/plain' });
	}

	return {
		input: toolInput,
		inputLanguage: 'json',
		output,
		isError,
		mcpOutput: includeMcpOutput ? toMcpCallToolResult(tc, isError, connectionAuthority) : undefined,
	};
}

/**
 * Builds a minimal {@link MCP.CallToolResult} from an agent-host tool call's
 * content blocks so the chat MCP App webview can receive a
 * `ui/notifications/tool-result` notification with the real tool output
 * (see {@link chatMcpAppModel}). Agent-host tool completions only carry our
 * own abstracted content shape (the raw MCP result is consumed by the
 * Copilot CLI's MCP host and never surfaces back over the AHP), so we
 * translate each AHP content block into the closest MCP content block:
 *  - `Text` → `MCP.TextContent`
 *  - `EmbeddedResource` with an image/audio MIME → `ImageContent`/`AudioContent`
 *  - `EmbeddedResource` (other) → `EmbeddedResource` wrapping a synthetic
 *    `data:` URI so MCP's resource shape is honored
 *  - `Resource` (content ref) → `ResourceLink` to the referenced URI
 */
function toMcpCallToolResult(tc: ToolCallState, isError: boolean, connectionAuthority: string): MCP.CallToolResult | undefined {
	if (tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.Running) {
		return undefined;
	}
	const content: MCP.ContentBlock[] = [];
	for (const block of tc.content ?? []) {
		const mcpBlock = toMcpContentBlock(block, connectionAuthority);
		if (mcpBlock) {
			content.push(mcpBlock);
		}
	}
	if (content.length === 0 && !isError) {
		return undefined;
	}
	return { content, isError: isError || undefined };
}

function toMcpContentBlock(block: ToolResultContent, connectionAuthority: string): MCP.ContentBlock | undefined {
	switch (block.type) {
		case ToolResultContentType.Text:
			return { type: 'text', text: block.text };
		case ToolResultContentType.EmbeddedResource: {
			if (block.contentType.startsWith('image/')) {
				return { type: 'image', data: block.data, mimeType: block.contentType };
			}
			if (block.contentType.startsWith('audio/')) {
				return { type: 'audio', data: block.data, mimeType: block.contentType };
			}
			return {
				type: 'resource',
				resource: {
					uri: `data:${block.contentType};base64,${block.data}`,
					mimeType: block.contentType,
					blob: block.data,
				},
			};
		}
		case ToolResultContentType.Resource: {
			const wrapped = wrapResourceUri(block.uri, connectionAuthority);
			return {
				type: 'resource_link',
				name: basename(wrapped) || wrapped.toString(),
				uri: wrapped.toString(),
				mimeType: block.contentType,
			};
		}
		default:
			return undefined;
	}
}

/**
 * Wraps a tool-result resource URI (string) via {@link toAgentHostUri} so it
 * resolves through the agent host filesystem provider on the client. The
 * underlying helper has a fast-path that returns the URI unchanged when it's
 * already a local `file://` resource, so the wrap is safe for all cases.
 */
function wrapResourceUri(uri: string, connectionAuthority: string): URI {
	return toAgentHostUri(URI.parse(uri), connectionAuthority);
}

function getToolErrorString(tc: ToolCallState): string | undefined {
	if (tc.status === ToolCallStatus.Completed) {
		return tc.error?.message;
	}
	if (tc.status === ToolCallStatus.Cancelled) {
		return typeof tc.reasonMessage === 'string' ? tc.reasonMessage : tc.reasonMessage?.markdown;
	}
	return undefined;
}

/**
 * Builds the `sessionCreated` tool-specific data for a completed, successful
 * `create_session` or `create_chat` tool call by recovering the open-session
 * link from its textual result. Returns `undefined` when the tool isn't one of
 * those or the result carries no recognizable link.
 */
function buildSessionCreatedToolData(tc: ToolCallState): IChatSessionCreatedData | undefined {
	if (tc.status !== ToolCallStatus.Completed || !tc.success) {
		return undefined;
	}
	const isSend = isSendMessageTool(tc.toolName);
	if (!isCreateSessionTool(tc.toolName) && !isCreateChatTool(tc.toolName) && !isSend) {
		return undefined;
	}
	const output = getToolOutputText(tc);
	const match = output?.match(/agent-host-session:\/\/[^\s)<>;"']+/);
	const openLink = match?.[0];
	const backend = openLink ? parseOpenSessionLinkUri(openLink) : undefined;
	if (!openLink || !backend) {
		return undefined;
	}
	// A chat-scoped link (create_chat, or send_message targeting a specific chat)
	// shows the conversation icon; a session-scoped link shows the agent icon.
	const isChat = isCreateChatTool(tc.toolName) || (isSend && !!parseOpenSessionLinkChatId(openLink));
	const label = createSessionTitleFromArgs(tc.toolInput) ?? (backend.path.replace(/^\//, '') || backend.toString());
	return { kind: 'sessionCreated', openLink, label, isChat };
}

/**
 * Derives a title for the "Open Session" button from a session tool's arguments —
 * the `prompt` (create_session/create_chat) or `message` (send_message) it was
 * started with, trimmed to one line.
 */
function createSessionTitleFromArgs(toolInput: string | undefined): string | undefined {
	if (!toolInput) {
		return undefined;
	}
	try {
		const args = JSON.parse(toolInput) as { prompt?: unknown; message?: unknown };
		const text = typeof args.prompt === 'string' ? args.prompt : (typeof args.message === 'string' ? args.message : undefined);
		if (text === undefined) {
			return undefined;
		}
		const firstLine = text.trim().split('\n')[0].trim();
		if (!firstLine) {
			return undefined;
		}
		return firstLine.length > 60 ? `${firstLine.slice(0, 57)}…` : firstLine;
	} catch {
		return undefined;
	}
}

/**
 * Converts a completed tool call from the protocol state into a serialized
 * tool invocation suitable for history replay.
 */
export function completedToolCallToSerialized(tc: ICompletedToolCall, subAgentInvocationId: string | undefined, sessionResource: URI, connectionAuthority: string): IChatToolInvocationSerialized {
	const isTerminal = isTerminalToolCall(tc);
	const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
	let invocationMsg = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? tc.displayName;

	// Check for subagent content
	const subagentContent = tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : undefined;
	const isSubagent = subagentContent || isSubagentTool(tc);
	if (isSubagent && tc.status === ToolCallStatus.Completed) {
		const resultText = getToolOutputText(tc);
		const pastTenseMsg = isSuccess
			? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg
			: invocationMsg;
		return {
			kind: 'toolInvocationSerialized',
			toolCallId: tc.toolCallId,
			toolId: tc.toolName,
			source: ToolDataSource.Internal,
			invocationMessage: invocationMsg,
			originMessage: undefined,
			pastTenseMessage: pastTenseMsg,
			isConfirmed: isSuccess
				? { type: ToolConfirmKind.ConfirmationNotNeeded }
				: { type: ToolConfirmKind.Denied },
			isComplete: true,
			presentation: undefined,
			subAgentInvocationId: subAgentInvocationId,
			toolSpecificData: {
				kind: 'subagent',
				description: getSubagentTaskDescription(tc) ?? tc.displayName,
				agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
				result: resultText,
				chatResource: getSubagentChatResource(tc, subagentContent, sessionResource),
			},
		};
	}

	let toolSpecificData: IChatTerminalToolInvocationData | IChatSearchToolInvocationData | IChatToolInputInvocationData | IChatSessionCreatedData | undefined;
	if (isTerminal) {
		toolSpecificData = {
			...buildTerminalToolSpecificData(tc, sessionResource),
			terminalCommandState: getTerminalCommandState(tc, isSuccess),
		};
	} else if (getToolKind(tc) === 'search') {
		toolSpecificData = { kind: 'search' };
	} else {
		toolSpecificData = buildSessionCreatedToolData(tc);
		if (!toolSpecificData) {
			toolSpecificData = buildMcpAppToolInputData(tc, sessionResource);
		}
	}

	let pastTenseMsg = isSuccess
		? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg
		: invocationMsg;
	// Tools that render a bespoke, client-authored message override both the
	// invocation and past-tense text here. Add new per-tool cases alongside.
	if (isAddCommentTool(tc.toolName)) {
		const ref = addCommentReference(tc);
		if (ref) {
			invocationMsg = ref;
			pastTenseMsg = ref;
		}
	}
	const resultDetails = (!toolSpecificData || toolSpecificData.kind === 'input' && toolSpecificData.mcpAppData)
		&& (tc.status !== ToolCallStatus.Completed || getToolFileEdits(tc).length === 0)
		? getToolInputOutputDetails(tc, !isSuccess, getToolErrorString(tc), !!(toolSpecificData?.kind === 'input' && toolSpecificData.mcpAppData), connectionAuthority)
		: undefined;

	return {
		kind: 'toolInvocationSerialized',
		toolCallId: tc.toolCallId,
		toolId: tc.toolName,
		source: ToolDataSource.Internal,
		invocationMessage: invocationMsg,
		originMessage: undefined,
		pastTenseMessage: isTerminal ? undefined : pastTenseMsg,
		isConfirmed: isSuccess
			? { type: ToolConfirmKind.ConfirmationNotNeeded }
			: { type: ToolConfirmKind.Denied },
		isComplete: true,
		presentation: undefined,
		subAgentInvocationId: subAgentInvocationId,
		toolSpecificData,
		resultDetails,
	};
}

/**
 * Builds {@link IChatExternalEdit} progress parts for a completed tool call
 * that produced file edits. Returns an empty array if the tool call has no
 * edits. Each emitted part carries the URI, edit kind, before/after content
 * URIs, and the diff stats already known from the agent host protocol —
 * downstream rendering can produce a static "edit pill" without re-deriving
 * any of this from an editing session.
 *
 * `connectionAuthority` is required so all emitted URIs are wrapped via
 * {@link toAgentHostUri}; otherwise the chat session would receive raw
 * remote URIs that its file system providers cannot resolve.
 */
export function completedToolCallToEditParts(tc: ICompletedToolCall, connectionAuthority: string): IChatProgress[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const fileEdits = getToolFileEdits(tc);
	if (fileEdits.length === 0) {
		return [];
	}
	const parts: IChatProgress[] = [];
	for (const edit of fileEdits) {
		const part = fileEditToExternalEdit(edit, tc.toolCallId, connectionAuthority);
		if (part) {
			parts.push(part);
		}
	}
	return parts;
}

/**
 * Translates a single protocol {@link FileEdit} record into the
 * {@link IChatExternalEdit} progress part rendered as an edit pill. All
 * URIs are wrapped through {@link toAgentHostUri} so that remote-resource
 * lookups resolve through the agent host file system provider.
 */
function fileEditToExternalEdit(edit: FileEdit, undoStopId: string, connectionAuthority: string): IChatExternalEdit | undefined {
	const normalized = normalizeFileEdit(edit);
	if (!normalized) {
		return undefined;
	}
	const diff = edit.diff && (edit.diff.added !== undefined || edit.diff.removed !== undefined)
		? { added: edit.diff.added ?? 0, removed: edit.diff.removed ?? 0 }
		: undefined;
	return {
		kind: 'externalEdit',
		uri: toAgentHostUri(normalized.resource, connectionAuthority),
		editKind: normalized.kind as ChatExternalEditKind,
		originalUri: normalized.kind === FileEditKind.Rename && normalized.beforeUri ? toAgentHostUri(normalized.beforeUri, connectionAuthority) : undefined,
		beforeContentUri: normalized.beforeContentUri ? toAgentHostUri(normalized.beforeContentUri, connectionAuthority) : undefined,
		afterContentUri: normalized.afterContentUri ? toAgentHostUri(normalized.afterContentUri, connectionAuthority) : undefined,
		diff,
		undoStopId,
	};
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 */
/**
 * URI schemes that should NOT be rewritten when they appear inside markdown
 * links received from a remote agent host. These are links that are
 * meaningful outside the agent host's workspace (e.g. web links, VS Code
 * commands) or are already wrapped in the agent-host scheme.
 */
const EXTERNAL_LINK_SCHEMES: ReadonlySet<string> = new Set([
	'http',
	'https',
	'mailto',
	'ws',
	'wss',
	'ftp',
	'ftps',
	'data',
	'blob',
	'javascript',
	'command',
	'vscode',
	'vscode-insiders',
	Schemas.vscodeBrowser,
	'copilot-skill',
	product.urlProtocol,
	AGENT_HOST_SCHEME,
]);

/**
 * Rewrites inline markdown link URIs so that non-external schemes are wrapped
 * in the `vscode-agent-host://` scheme, mirroring {@link toAgentHostUri}.
 * This allows links in markdown content streamed from a remote agent host
 * (e.g. `file:///...` or `agenthost-content:///...`) to resolve correctly on
 * the client through the agent host filesystem provider.
 *
 * Links with external schemes (http, https, mailto, command, etc.) and
 * relative/anchor-only links without a scheme are preserved as-is. The
 * markdown is parsed with marked and each `link` / `image` token is
 * rewritten individually, so link-looking text inside code spans or fenced
 * code blocks is untouched (marked emits those as `code`/`codespan` tokens
 * with no nested link tokens).
 */
export function rewriteMarkdownLinks(markdown: string, connectionAuthority: string): string {
	let tokens: TokensList;
	try {
		tokens = marked.lexer(markdown);
	} catch {
		return markdown;
	}

	const edits: { raw: string; replacement: string }[] = [];
	marked.walkTokens(tokens, token => {
		if (token.type !== 'link' && token.type !== 'image') {
			return;
		}
		const replacement = rewriteLinkTokenRaw(token as Tokens.Link | Tokens.Image, connectionAuthority);
		if (replacement !== undefined) {
			edits.push({ raw: (token as Token & { raw: string }).raw, replacement });
		}
	});

	if (edits.length === 0) {
		return markdown;
	}

	// Apply edits sequentially against the original markdown. walkTokens
	// visits tokens in document order so a forward scan is sufficient.
	let out = '';
	let pos = 0;
	for (const { raw, replacement } of edits) {
		const idx = markdown.indexOf(raw, pos);
		if (idx < 0) {
			continue;
		}
		out += markdown.substring(pos, idx) + replacement;
		pos = idx + raw.length;
	}
	return out + markdown.substring(pos);
}

/**
 * Computes the rewritten `raw` string for a single link or image token,
 * or returns `undefined` if the token should be left alone (external
 * scheme or unparseable URI).
 *
 * The output collapses to the canonical inline form `[](newHref)` (or
 * `![](newHref)` for images) — the chat renderer has richer handling for
 * empty-text agent-host links (rendering them as a file widget), so
 * preserving the original label isn't useful for most links. The one
 * exception is skill links (URIs whose basename is `SKILL.md`), where the
 * skill name is preserved as the label so the skill pill renderer can
 * display it instead of the always-identical `SKILL.md` basename. This
 * also means autolinks (`<url>`) and reference-style links
 * (`[text][ref]`) are normalized into the inline form.
 */
function rewriteLinkTokenRaw(token: Tokens.Link | Tokens.Image, connectionAuthority: string): string | undefined {
	let parsed: URI;
	try {
		parsed = URI.parse(token.href, true);
	} catch {
		return undefined;
	}
	const scheme = parsed.scheme.toLowerCase();
	if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
		return undefined;
	}
	let agentHostUri = toAgentHostUri(parsed, connectionAuthority);
	const isSkill = isSkillFileUri(parsed);
	// VS-Code-specific: links pointing at a `SKILL.md` file are rendered as a
	// rich skill pill rather than a plain markdown link. The chat renderer's
	// inline anchor widget keys off the `vscodeLinkType` query parameter (see
	// `chatInlineAnchorWidget.ts`), so we tag the URI here on the client side
	// rather than at the agent host. We do this whether or not the link came
	// in pre-tagged so older sessions and other agent providers also benefit.
	if (isSkill && !agentHostUri.query.includes('vscodeLinkType=')) {
		const existing = agentHostUri.query;
		agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : 'vscodeLinkType=skill' });
	}
	const prefix = token.type === 'image' ? '![' : '[';
	// Preserve the label for skill links (so the skill pill renderer can show
	// the skill name) and for image alt text (accessibility — the inline
	// anchor widget only applies to links, not images). For all other
	// agent-host links, leave the text empty so the chat renderer's inline
	// anchor widget takes over with its rich file-widget rendering.
	// Escape only the characters that would break out of markdown link text
	// syntax (`\` and `]`); a full markdown escape would leave visible
	// backslashes in the skill pill which extracts text without re-parsing.
	const text = isSkill || token.type === 'image' ? escapeMarkdownLinkLabel(token.text ?? '') : '';
	return `${prefix}${text}](${agentHostUri.toString()})`;
}

/**
 * Returns true when the URI's basename is `SKILL.md` (case-insensitive).
 * Used to tag skill links so the chat renderer shows the rich skill pill
 * instead of a plain markdown anchor.
 */
function isSkillFileUri(uri: URI): boolean {
	const name = basename(uri);
	return name.toLowerCase() === 'skill.md';
}

/**
 * Wraps a raw markdown string into an {@link IMarkdownString}, rewriting
 * link URIs through {@link rewriteMarkdownLinks} when a connection authority
 * is provided.
 */
export function rawMarkdownToString(content: string, connectionAuthority: string): MarkdownString {
	const rewritten = connectionAuthority ? rewriteMarkdownLinks(content, connectionAuthority) : content;
	return new MarkdownString(rewritten);
}

function parseAbsoluteFileLinkTarget(href: string): URI | undefined {
	const fragmentIndex = href.indexOf('#');
	const rawPath = fragmentIndex >= 0 ? href.substring(0, fragmentIndex) : href;
	if (rawPath.includes('?')) {
		return undefined;
	}

	const existingFragment = fragmentIndex >= 0 ? href.substring(fragmentIndex + 1) : '';
	const parsedPath = existingFragment ? { path: rawPath } : parseFileLocation(rawPath);
	let decodedPath: string;
	try {
		decodedPath = decodeURIComponent(parsedPath.path);
	} catch {
		return undefined;
	}

	const absolutePath = decodedPath;
	const isWindowsPath = win32.isAbsolute(absolutePath);
	if (!posix.isAbsolute(absolutePath) && !isWindowsPath) {
		return undefined;
	}

	const selectionFragment = formatLocationFragment(parsedPath);
	const normalizedPath = isWindowsPath ? absolutePath.replaceAll('\\', '/') : absolutePath;
	return URI.file(normalizedPath).with({ fragment: existingFragment || selectionFragment });
}

interface IFileLocation {
	readonly path: string;
	readonly line?: number;
	readonly column?: number;
}

function parseFileLocation(path: string): IFileLocation {
	const match = /^(?<path>.+?):(?<line>[1-9]\d*)(?::(?<column>[1-9]\d*))?$/.exec(path);
	if (!match?.groups) {
		return { path };
	}
	const line = Number(match.groups.line);
	const column = match.groups.column ? Number(match.groups.column) : undefined;
	if (
		!Number.isSafeInteger(line)
		|| column !== undefined && !Number.isSafeInteger(column)
	) {
		return { path };
	}
	return { path: match.groups.path, line, column };
}

function formatLocationFragment(location: IFileLocation): string {
	if (location.line === undefined) {
		return '';
	}
	return `L${location.line}${location.column !== undefined && location.column !== 1 ? `,${location.column}` : ''}`;
}

function normalizeFileUriSelection(uri: URI, href: string): URI {
	if (uri.scheme.toLowerCase() !== Schemas.file || uri.query || uri.fragment) {
		return uri;
	}
	const parsedPath = parseFileLocation(href);
	if (parsedPath.line === undefined) {
		return uri;
	}
	const fragment = formatLocationFragment(parsedPath);
	const suffixLength = href.length - parsedPath.path.length;
	return uri.with({ path: uri.path.substring(0, uri.path.length - suffixLength), fragment });
}

/** Wraps an absolute path or internal URI target for the owning Agent Host connection. */
export function rewriteAgentHostLinkTarget(href: string, connectionAuthority: string): string {
	let parsed = parseAbsoluteFileLinkTarget(href);
	if (!parsed) {
		try {
			parsed = URI.parse(href, true);
		} catch {
			return href;
		}
		const scheme = parsed.scheme.toLowerCase();
		if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
			return href;
		}
		parsed = normalizeFileUriSelection(parsed.with({ scheme }), href);
		if (!parsed.path.startsWith('/')) {
			return href;
		}
	}

	let agentHostUri: URI;
	try {
		agentHostUri = toAgentHostUri(parsed, connectionAuthority);
	} catch {
		return href;
	}
	if (isSkillFileUri(parsed) && !agentHostUri.query.includes('vscodeLinkType=')) {
		const existing = agentHostUri.query;
		agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : 'vscodeLinkType=skill' });
	}
	return agentHostUri.toString();
}

/**
 * Converts a protocol `StringOrMarkdown` value to a chat-layer `IMarkdownString`.
 *
 * When `connectionAuthority` is provided, markdown link URIs are rewritten
 * through {@link rewriteMarkdownLinks} so that remote resources resolve
 * through the agent host filesystem provider.
 */
export function stringOrMarkdownToString(value: StringOrMarkdown, connectionAuthority: string): string | IMarkdownString;
export function stringOrMarkdownToString(value: StringOrMarkdown | undefined, connectionAuthority: string): string | IMarkdownString | undefined;
export function stringOrMarkdownToString(value: StringOrMarkdown | undefined, connectionAuthority: string): string | IMarkdownString | undefined {
	if (value === undefined) {
		return undefined;
	}
	if (typeof value === 'string') {
		return value;
	}
	return rawMarkdownToString(value.markdown, connectionAuthority);
}

/**
 * Number of comment-body characters shown inline in the {@link addCommentReference}
 * pill before it is truncated with an ellipsis.
 */
const ADD_COMMENT_PREVIEW_LENGTH = 40;

/**
 * Builds the inline preview of an `addComment` comment body: whitespace is
 * collapsed to single spaces and the text is truncated to
 * {@link ADD_COMMENT_PREVIEW_LENGTH} characters with a trailing ellipsis.
 */
function addCommentPreview(text: string): string {
	const singleLine = text.replace(/\s+/g, ' ').trim();
	return singleLine.length > ADD_COMMENT_PREVIEW_LENGTH
		? `${singleLine.slice(0, ADD_COMMENT_PREVIEW_LENGTH)}…`
		: singleLine;
}

/** Whether {@link value} is a positive 1-based line/column coordinate. */
function isPositiveInteger(value: unknown): value is number {
	return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/**
 * Whether {@link value} is a valid 1-based editor range: every coordinate must
 * be an integer >= 1, since the range is later used for editor selection and
 * reveal. Invalid input is treated as unparseable so the UI falls back to the
 * server-authored message.
 */
function isOneBasedRange(value: unknown): value is IRange {
	const range = value as IRange | undefined;
	return !!range && typeof range === 'object'
		&& isPositiveInteger(range.startLineNumber)
		&& isPositiveInteger(range.startColumn)
		&& isPositiveInteger(range.endLineNumber)
		&& isPositiveInteger(range.endColumn);
}

/**
 * Builds a rich, clickable reference for the agent host `addComment` feedback
 * tool call — the tool name and the first
 * {@link ADD_COMMENT_PREVIEW_LENGTH} characters of the comment body in quotes.
 * Clicking it runs {@link AgentFeedbackReviewCommandId.RevealAt} to open the
 * file and reveal the comment (agent feedback) in the editor.
 *
 * Only call this for the `addComment` tool (gate call sites with
 * {@link isAddCommentTool}). Returns `undefined` when the arguments can't be
 * parsed, so the caller falls back to the server-authored message.
 */
function addCommentReference(tc: ToolCallState): IMarkdownString | undefined {
	// `toolInput` is absent while parameters are still streaming; every other
	// state carries it (see `ToolCallParameterFields`).
	if (tc.status === ToolCallStatus.Streaming || !tc.toolInput) {
		return undefined;
	}
	const toolInput = tc.toolInput;
	let args: { resourceUri?: unknown; range?: unknown; text?: unknown };
	try {
		args = JSON.parse(toolInput);
	} catch {
		return undefined;
	}
	if (typeof args.resourceUri !== 'string' || typeof args.text !== 'string' || !isOneBasedRange(args.range)) {
		return undefined;
	}
	const preview = escapeIcons(escapeMarkdownLinkLabel(addCommentPreview(args.text)));
	// The command resolves the owning session from the file resource, so the
	// link only needs the resource and range (both known here).
	const commandArgs = encodeURIComponent(JSON.stringify([args.resourceUri, args.range]));
	const link = `command:${AgentFeedbackReviewCommandId.RevealAt}?${commandArgs}`;
	return new MarkdownString(`[addComment "${preview}"](${link})`, {
		isTrusted: { enabledCommands: [AgentFeedbackReviewCommandId.RevealAt] },
		supportThemeIcons: true,
	});
}

/**
 * Creates a live {@link ChatToolInvocation} from the protocol's tool-call
 * state. Used during active turns to represent running tool calls in the UI.
 *
 * @param connectionAuthority Sanitized connection identifier used when
 *   wrapping remote file URIs into `vscode-agent-host:` URIs. Omit to skip
 *   URI wrapping (e.g. in tests that don't exercise the confirmation UI).
 */
export function toolCallStateToInvocation(tc: ToolCallState, subAgentInvocationId: string | undefined, sessionResource: URI, connectionAuthority: string): ChatToolInvocation {
	const toolData: IToolData = {
		id: tc.toolName,
		source: ToolDataSource.Internal,
		displayName: tc.displayName,
		modelDescription: tc.toolName,
	};

	if (tc.status === ToolCallStatus.PendingConfirmation) {
		// Tool needs confirmation — create with confirmation messages.
		// (Subagent-spawning tools never reach this state in production: the
		// Copilot SDK's `task` tool doesn't request permission, and the event
		// mapper auto-emits `tool_ready` with `confirmed: NotNeeded` paired
		// with `tool_start`. So no special-case for subagents is needed here.)
		const confirmationMessages: IToolConfirmationMessages = {
			title: isViewUnreviewedCommentsTool(tc.toolName)
				? localize('agentFeedback.reviewTitle', "Reveal unreviewed comments?")
				: stringOrMarkdownToString(tc.confirmationTitle, connectionAuthority) ?? tc.displayName,
			message: isViewUnreviewedCommentsTool(tc.toolName)
				? localize('agentFeedback.reviewMessage', "Choose which comments to reveal to the agent. Unchecked comments stay hidden.")
				: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
		};
		if (tc.options) {
			confirmationMessages.customOptions = tc.options;
		}

		let toolSpecificData: IChatTerminalToolInvocationData | IChatToolInputInvocationData | IChatModifiedFilesConfirmationData | IChatAgentFeedbackReviewConfirmationData | undefined;
		const pendingEdits = tc.edits?.items;
		if (isViewUnreviewedCommentsTool(tc.toolName)) {
			// The agent host surfaces this server tool as a confirmation (it is
			// excluded from auto-approve). Render a custom confirmation that lets
			// the user pick which unreviewed comments to reveal; the renderer
			// fetches the comments and applies the selection via feedback
			// commands, so this layer carries only the button labels.
			toolSpecificData = {
				kind: 'agentFeedbackReviewConfirmation',
				options: [localize('agentFeedback.reveal', "Reveal Selected")],
			};
		} else if (pendingEdits?.length) {
			const wrap = (uri: URI) => connectionAuthority ? toAgentHostUri(uri, connectionAuthority) : uri;
			const mapped = mapFileEdits(pendingEdits, tc.toolCallId);
			toolSpecificData = {
				kind: 'modifiedFilesConfirmation',
				options: ['Allow'],
				modifiedFiles: mapped.map(edit => {
					const resource = wrap(edit.resource);
					const originalResource = edit.originalResource ? wrap(edit.originalResource) : undefined;
					const modifiedContent = edit.afterContentUri ? wrap(edit.afterContentUri) : undefined;
					const originalContent = edit.beforeContentUri ? wrap(edit.beforeContentUri) : undefined;
					return {
						uri: resource,
						editKind: edit.kind as ChatExternalEditKind,
						originalUri: originalResource,
						modifiedContentUri: modifiedContent,
						originalContentUri: originalContent,
						insertions: edit.diff?.added,
						deletions: edit.diff?.removed,
						title: basename(edit.resource),
						description: edit.resource.path,
					};
				}),
			};
		} else if (getToolKind(tc) === 'terminal' && tc.toolInput) {
			toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
		} else if (tc.toolInput) {
			let rawInput: unknown;
			try { rawInput = JSON.parse(tc.toolInput); } catch { rawInput = { input: tc.toolInput }; }
			toolSpecificData = { kind: 'input', rawInput };
		}

		return new ChatToolInvocation(
			{
				invocationMessage: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
				confirmationMessages,
				presentation: ToolInvocationPresentation.HiddenAfterComplete,
				toolSpecificData,
			},
			toolData,
			tc.toolCallId,
			subAgentInvocationId,
			undefined,
		);
	}

	const invocation = new ChatToolInvocation(undefined, toolData, tc.toolCallId, subAgentInvocationId, undefined);
	invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? tc.displayName;

	// Tools that render a bespoke, client-authored invocation message override
	// the server text here. Add new per-tool cases alongside this branch.
	if (isAddCommentTool(tc.toolName)) {
		invocation.invocationMessage = addCommentReference(tc) ?? invocation.invocationMessage;
	}

	if (isTerminalToolCall(tc)) {
		// Set terminal toolSpecificData eagerly so the renderer shows a
		// terminal pill (expandable command + output area) from the start,
		// instead of falling back to the generic tool widget that only
		// surfaces the first line of the command via the invocation message.
		// For the SDK's built-in `bash`/`powershell` tools there's no
		// Terminal content block (they run outside AHP's terminal infra),
		// so the AHP-terminal fields (`terminalToolSessionId`,
		// `terminalCommandUri`) stay undefined — the renderer treats this
		// as a display-only terminal that still surfaces command + output.
		invocation.toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
	} else if (isSubagentTool(tc)) {
		// Subagent-spawning tool: set subagent toolSpecificData eagerly so the
		// renderer groups it correctly from the start (before child content
		// arrives). Agent metadata comes from `_meta` (set by the event
		// mapper from the tool's arguments) and is later refined by the
		// Subagent content block via `updateRunningToolSpecificData`.
		const subagentContent = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed)
			? getToolSubagentContent(tc)
			: undefined;
		invocation.toolSpecificData = {
			kind: 'subagent',
			description: getSubagentTaskDescription(tc),
			agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
			chatResource: getSubagentChatResource(tc, subagentContent, sessionResource),
		};
	} else if (getToolKind(tc) === 'search') {
		invocation.toolSpecificData = { kind: 'search' };
	} else if (tc.status !== ToolCallStatus.Streaming) {
		invocation.toolSpecificData = buildMcpAppToolInputData(tc, sessionResource);
	}

	return invocation;
}

/**
 * Updates a running tool invocation's `toolSpecificData` based on the
 * protocol tool call state. Handles terminal and subagent content detection.
 *
 * Called from the session handler when a tool transitions to Running state
 * to set the initial `toolSpecificData`, or when content changes arrive.
 */
export function updateRunningToolSpecificData(existing: ChatToolInvocation, tc: ToolCallState, sessionResource: URI, connectionAuthority: string): void {
	if (tc.status !== ToolCallStatus.Running) {
		return;
	}
	existing.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? existing.invocationMessage;
	if (isAddCommentTool(tc.toolName)) {
		existing.invocationMessage = addCommentReference(tc) ?? existing.invocationMessage;
	}


	const subagentContent = getToolSubagentContent(tc);
	if (subagentContent) {
		existing.toolSpecificData = {
			kind: 'subagent',
			isActive: existing.toolSpecificData?.kind === 'subagent' ? existing.toolSpecificData.isActive : undefined,
			description: getSubagentTaskDescription(tc),
			agentName: subagentContent.agentName,
			credits: existing.toolSpecificData?.kind === 'subagent' ? existing.toolSpecificData.credits : undefined,
			modelName: existing.toolSpecificData?.kind === 'subagent' ? existing.toolSpecificData.modelName : undefined,
			chatResource: subagentContent.resource,
		};
		// toolSpecificData is a plain property — notify state observers
		// so ChatSubagentContentPart re-reads the updated metadata.
		existing.notifyToolSpecificDataChanged();
		return;
	}

	// Refresh subagent metadata from `_meta` (set by the event mapper from
	// the tool's arguments) in case it arrived after invocation creation.
	if (existing.toolSpecificData?.kind === 'subagent') {
		const description = getSubagentTaskDescription(tc) ?? existing.toolSpecificData.description;
		const agentName = getSubagentAgentName(tc) ?? existing.toolSpecificData.agentName;
		if (description !== existing.toolSpecificData.description || agentName !== existing.toolSpecificData.agentName) {
			existing.toolSpecificData = { kind: 'subagent', isActive: existing.toolSpecificData.isActive, description, agentName, credits: existing.toolSpecificData.credits, modelName: existing.toolSpecificData.modelName, chatResource: existing.toolSpecificData.chatResource };
			existing.notifyToolSpecificDataChanged();
		}
		return;
	}

	// Mount the MCP App once the tool starts running. The channel is present
	// in `_meta.ui` from the first tool state (a tool cannot start until its
	// MCP server is Ready), but confirmation-gated tools are created without
	// `mcpAppData` (see `toolCallStateToInvocation`), so this is where the App
	// first appears for them. `buildMcpAppToolInputData` returns `undefined`
	// for non-MCP tools (search, terminal, …), so those fall through to the
	// handling below.
	const existingInput = existing.toolSpecificData?.kind === 'input' ? existing.toolSpecificData : undefined;
	const nextInput = buildMcpAppToolInputData(tc, sessionResource, existingInput?.rawInput);
	if (nextInput) {
		if (!existingInput || !isSameMcpAppData(existingInput.mcpAppData, nextInput.mcpAppData)) {
			existing.toolSpecificData = nextInput;
			existing.notifyToolSpecificDataChanged();
		}
		return;
	}

	// Refresh terminal toolSpecificData as streaming text content arrives
	// (or when terminal toolSpecificData was not set up-front because the
	// tool transitioned through the Streaming state before reaching
	// Running). Preserves AHP-terminal fields (`terminalToolSessionId`,
	// `terminalCommandUri`, `terminalCommandId`) that `_reviveTerminalIfNeeded`
	// in the session handler populates asynchronously when a Terminal
	// content block is present.
	const existingTerminal = existing.toolSpecificData?.kind === 'terminal'
		? existing.toolSpecificData
		: undefined;
	if (isTerminalToolCall(tc, existing.toolSpecificData?.kind)) {
		const next = buildTerminalToolSpecificData(tc, sessionResource, existingTerminal);
		const outputChanged = next.terminalCommandOutput?.text !== existingTerminal?.terminalCommandOutput?.text;
		const commandChanged = next.commandLine.original !== existingTerminal?.commandLine.original;
		if (!existingTerminal || outputChanged || commandChanged) {
			existing.toolSpecificData = next;
			existing.notifyToolSpecificDataChanged();
		}
	}
}

/**
 * Data returned by {@link finalizeToolInvocation} describing file edits
 * that should be routed through the editing session's external edits pipeline.
 */
export interface IToolCallFileEdit {
	/** The kind of file operation. */
	readonly kind: FileEditKind;
	/** The primary file URI (after-URI for edits/creates/renames, before-URI for deletes). */
	readonly resource: URI;
	/** For renames, the original file URI before the move. */
	readonly originalResource?: URI;
	/** URI to read the before-snapshot content from. Absent for creates. */
	readonly beforeContentUri?: URI;
	/** URI to read the after-content from. Absent for deletes. */
	readonly afterContentUri?: URI;
	/** Undo stop ID for grouping edits. */
	readonly undoStopId: string;
	/** Optional diff display metadata. */
	readonly diff?: { added?: number; removed?: number };
}

/**
 * Updates a live {@link ChatToolInvocation} with completion data from the
 * protocol's tool-call state, transitioning it to the completed state.
 *
 * Returns file edits that the caller should route through the editing
 * session's external edits pipeline.
 */
export function finalizeToolInvocation(invocation: ChatToolInvocation, tc: ToolCallState, backendSession: URI, connectionAuthority: string): IToolCallFileEdit[] {
	const isCompleted = tc.status === ToolCallStatus.Completed;
	const isCancelled = tc.status === ToolCallStatus.Cancelled;
	const isTerminal = isTerminalToolCall(tc, invocation.toolSpecificData?.kind);

	if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
		invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? invocation.invocationMessage;
	}
	// Tools that render a bespoke, client-authored message override the
	// invocation text here. Add new per-tool cases alongside this branch.
	if (isAddCommentTool(tc.toolName)) {
		invocation.invocationMessage = addCommentReference(tc) ?? invocation.invocationMessage;
	}

	// Check for subagent content — set toolSpecificData so the UI renders a subagent widget
	if (isCompleted) {
		const subagentContent = getToolSubagentContent(tc);
		if (subagentContent) {
			const resultText = getToolOutputText(tc);
			invocation.toolSpecificData = {
				kind: 'subagent',
				isActive: invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.isActive : undefined,
				description: getSubagentTaskDescription(tc),
				agentName: subagentContent.agentName,
				result: resultText,
				credits: invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.credits : undefined,
				modelName: invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData.modelName : undefined,
				chatResource: getSubagentChatResource(tc, subagentContent, backendSession),
			};
		} else if (invocation.toolSpecificData?.kind === 'subagent') {
			// Subagent-spawning tool that completed without a Subagent content
			// block. Refresh metadata + carry the tool's output as the result.
			invocation.toolSpecificData = {
				kind: 'subagent',
				isActive: invocation.toolSpecificData.isActive,
				description: getSubagentTaskDescription(tc) ?? invocation.toolSpecificData.description,
				agentName: getSubagentAgentName(tc) ?? invocation.toolSpecificData.agentName,
				result: getToolOutputText(tc),
				credits: invocation.toolSpecificData.credits,
				modelName: invocation.toolSpecificData.modelName,
				chatResource: invocation.toolSpecificData.chatResource ?? getSubagentChatResource(tc, undefined, backendSession),
			};
		}
	}

	if (isTerminal && (isCompleted || isCancelled)) {
		const existing = invocation.toolSpecificData?.kind === 'terminal' ? invocation.toolSpecificData : undefined;
		invocation.presentation = undefined;
		invocation.toolSpecificData = {
			...buildTerminalToolSpecificData(tc, backendSession, existing),
			terminalCommandState: getTerminalCommandState(tc, isCompleted && tc.success),
		};
	} else if (isCompleted && tc.pastTenseMessage) {
		invocation.pastTenseMessage = stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority);
	}
	// Tools that render a bespoke, client-authored message override the
	// past-tense text here. Add new per-tool cases alongside this branch.
	if (isCompleted && isAddCommentTool(tc.toolName)) {
		invocation.pastTenseMessage = addCommentReference(tc) ?? invocation.pastTenseMessage;
	}

	if (isCompleted) {
		const sessionCreated = buildSessionCreatedToolData(tc);
		if (sessionCreated) {
			// The tool required confirmation, so it was created with
			// `HiddenAfterComplete`; clear it so the "Open Session" pill stays
			// visible after completion.
			invocation.presentation = undefined;
			invocation.toolSpecificData = sessionCreated;
			invocation.notifyToolSpecificDataChanged();
		}
	}

	if (isCompleted) {
		const mcpAppInput = buildMcpAppToolInputData(
			tc,
			backendSession,
			invocation.toolSpecificData?.kind === 'input' ? invocation.toolSpecificData.rawInput : undefined,
		);
		if (mcpAppInput) {
			const existingInput = invocation.toolSpecificData?.kind === 'input' ? invocation.toolSpecificData : undefined;
			invocation.toolSpecificData = mcpAppInput;
			if (!existingInput || !isSameMcpAppData(existingInput.mcpAppData, mcpAppInput.mcpAppData)) {
				invocation.notifyToolSpecificDataChanged();
			}
		}
	}

	const isFailure = (isCompleted && !tc.success) || isCancelled;
	const errorMessage = isCompleted ? tc.error?.message : (isCancelled ? tc.reasonMessage : undefined);
	const errorString = typeof errorMessage === 'string' ? errorMessage : errorMessage?.markdown;
	const fileEdits = isCompleted ? fileEditsToExternalEdits(tc) : [];

	// Hide the tool widget when file edits are shown separately via onFileEdits
	if (fileEdits.length > 0 && !isFailure) {
		invocation.presentation = ToolInvocationPresentation.Hidden;
	}

	const hasMcpAppData = invocation.toolSpecificData?.kind === 'input' && !!invocation.toolSpecificData.mcpAppData;
	// The generic raw input/output details (the expandable JSON blob) are
	// suppressed for tool kinds that render their own bespoke UI — the subagent
	// card and the `sessionCreated` "Open Session" pill — so we don't duplicate
	// the result underneath them. Search results and separately-rendered file
	// edits are likewise excluded.
	const resultDetails = !isTerminal
		&& invocation.toolSpecificData?.kind !== 'subagent'
		&& invocation.toolSpecificData?.kind !== 'sessionCreated'
		&& getToolKind(tc) !== 'search'
		&& fileEdits.length === 0
		? getToolInputOutputDetails(tc, isFailure, errorString, hasMcpAppData, connectionAuthority)
		: undefined;
	const result: IToolResult | undefined = isFailure || resultDetails
		? { content: [], toolResultError: isFailure ? errorString : undefined, toolResultDetails: resultDetails }
		: undefined;
	invocation.didExecuteTool(result);

	return fileEdits;
}

/**
 * Extracts file edit content entries from a completed tool call and
 * converts them to {@link IToolCallFileEdit} data for routing through
 * the editing session's external edits pipeline.
 */
export function fileEditsToExternalEdits(tc: ToolCallState): IToolCallFileEdit[] {
	if (tc.status !== ToolCallStatus.Completed) {
		return [];
	}
	const edits = getToolFileEdits(tc);
	if (edits.length === 0) {
		return [];
	}
	return mapFileEdits(edits, tc.toolCallId);
}

/**
 * Translates a list of {@link FileEdit} records into {@link IToolCallFileEdit}
 * entries suitable for the external edits pipeline or the chat modified-files
 * confirmation UI. Shared between completed tool edits and pending write
 * confirmations.
 */
function mapFileEdits(items: readonly FileEdit[], undoStopId: string): IToolCallFileEdit[] {
	const result: IToolCallFileEdit[] = [];
	for (const edit of items) {
		const normalized = normalizeFileEdit(edit);
		if (!normalized) {
			continue;
		}

		result.push({
			kind: normalized.kind,
			resource: normalized.resource,
			originalResource: normalized.kind === FileEditKind.Rename ? normalized.beforeUri : undefined,
			beforeContentUri: normalized.beforeContentUri,
			afterContentUri: normalized.afterContentUri,
			undoStopId,
			diff: edit.diff,
		});
	}
	return result;
}
