/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer, disposableTimeout, raceCancellation } from '../../../../../../base/common/async.js';
import { decodeBase64, encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { getErrorCode, isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { getChatErrorDetailsFromMeta, getCopilotPlanFromEntitlement, IChatErrorContext } from '../../../common/chatErrorMessages.js';
import { Disposable, DisposableMap, DisposableResourceMap, DisposableStore, IReference, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap, ResourceSet } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { equals } from '../../../../../../base/common/objects.js';
import { autorun, autorunPerKeyedItem, constObservable, derived, derivedOpts, IObservable, ISettableObservable, observableValue, transaction, waitForState } from '../../../../../../base/common/observable.js';
import { extUriBiasedIgnorePathCase, isEqual } from '../../../../../../base/common/resources.js';
import { StopWatch } from '../../../../../../base/common/stopwatch.js';
import { Mutable } from '../../../../../../base/common/types.js';
import { URI } from '../../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../../base/common/uuid.js';
import { IPosition } from '../../../../../../editor/common/core/position.js';
import type { IRange } from '../../../../../../editor/common/core/range.js';
import { isLocation, type Location } from '../../../../../../editor/common/languages.js';
import type { ITextModel } from '../../../../../../editor/common/model.js';
import { IModelService } from '../../../../../../editor/common/services/model.js';
import { localize } from '../../../../../../nls.js';
import { AgentHostAllowSignedOutWhenUsableSettingId, AgentProvider, AgentSession, CODEX_AGENT_PROVIDER_ID, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { isCustomizationEnabled } from '../../../../../../platform/agentHost/common/customizationEnablement.js';
import { findDeepestContainingWorkingDirectory } from '../../../../../../platform/agentHost/common/agentHostWorkingDirectories.js';
import { AgentHostElementAttachmentDisplayKind, getElementAttachmentCorrelationId, toElementAttachmentMeta } from '../../../../../../platform/agentHost/common/meta/agentElementAttachments.js';
import { AgentFeedbackAttachmentDisplayKind, AgentFeedbackAttachmentMetadataKey } from '../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js';
import { BrowserViewAttachmentDisplayKind, BrowserViewAttachmentMetadataKey } from '../../../../../../platform/agentHost/common/meta/browserViewAttachments.js';
import { readToolCallMeta } from '../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js';
import { readCompletionAttachmentMeta } from '../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import { isWorktreeUnderRepository } from '../../../../../../platform/agentHost/common/worktreePaths.js';
import { CLIENT_SEMANTIC_SEARCH_TOOL_ID, SEMANTIC_SEARCH_TOOL_NAME } from '../../../../../../platform/agentHost/common/semanticSearchConstants.js';
import { CLIENT_TOOL_SEARCH_REFERENCE_NAME, RUNTIME_TOOL_SEARCH_TOOL_NAME } from '../../../../../../platform/agentHost/common/toolSearchConstants.js';
import type { ChatInputRequestWithPlanReview, IAgentHostPlanReview } from '../../../../../../platform/agentHost/common/agentHostPlanReview.js';
import { IAgentSubscription, observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChatTruncatedAction } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { CompletionItemKind as AhpCompletionItemKind, ContentEncoding, type CompletionItem as AhpCompletionItem } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ConfirmationOptionKind, CustomizationType, JsonPrimitive, McpServerAuthRequiredState, McpServerStatus, SessionInputRequestKind, TerminalClaimKind, ToolCallContributorKind, ToolResultContentType, type ConfirmationOption, type ProtectedResourceMetadata, type SessionActiveClient, type SessionInputRequest, type SessionToolClientExecutionRequest } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, ChatTurnStartedAction, isChatAction, type ClientChatAction, type ClientSessionAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChatOriginKind, getInlineToolInput, getToolSubagentContent, isChatReadOnly, isDefaultChatUri, isMessageHiddenFromTranscript, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, SessionStatus, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, parseChatUri, mergeSessionWithDefaultChat, readSessionWorkspaceless, readUsageInfoMeta, withMessageHiddenFromTranscript, type ChatState, type ISessionWithDefaultChat, type ICompletedToolCall, type InputRequestResponsePart, type MarkdownResponsePart, type Message, type MessageAttachment, type MessageAnnotationsAttachment, type MessageChatAttachment, type MessageResourceAttachment, type MessageEmbeddedResourceAttachment, type ModelSelection, type PendingMessage, type ReasoningResponsePart, type RootState, type ChatInputAnswer, type ChatInputQuestion, type ChatInputRequest, type ChatSummary, type SessionState, type StringOrMarkdown, type ToolCallResponsePart, type ToolCallState, type ToolInput, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { packErrorForTelemetry } from '../../../../../../platform/telemetry/common/errorTelemetry.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { ITerminalChatService, type ITerminalInstance } from '../../../../terminal/browser/terminal.js';
import {
	AgentHostCompletionReferenceKind,
	ChatTranscriptContextAttachmentDisplayKind,
	getAgentHostCompletionReferenceKind,
	isAgentFeedbackVariableEntry,
	isBrowserViewVariableEntry,
	isChatReferenceVariableEntry,
	isChatTranscriptContextVariableEntry,
	isImageVariableEntry,
	toChatTranscriptContextAttachmentMeta,
	type IAgentFeedbackVariableEntry,
	type IChatRequestChatReferenceVariableEntry,
	type IChatRequestVariableEntry,
	type IElementVariableEntry,
	type IImageVariableEntry
} from '../../../common/attachments/chatVariableEntries.js';
import { coerceImageBuffer } from '../../../common/chatImageExtraction.js';
import { ChatRequestQueueKind, ConfirmedReason, ElicitationState, IChatProgress, IChatQuestionAnswers, IChatService, IChatToolInvocation, IRemotePendingRequest, ToolConfirmKind, type IChatAutoModeResolutionPart, type IChatMcpAuthenticationRequired, type IChatMcpAuthenticationRequiredServer, type IChatMcpStartingServer, type IChatMultiSelectAnswer, type IChatPlanReviewResult, type IChatResponseErrorDetails, type IChatSingleSelectAnswer, type IChatTerminalToolInvocationData, type IChatToolInvocationSerialized } from '../../../common/chatService/chatService.js';
import { isInConversationModelChoice } from '../../../common/modelSelection.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionRequestHistoryItem, isTerminalCommandPrompt, SessionType, type IChatInputCompletionItem, type IChatInputCompletionsParams, type IChatInputCompletionsResult, type IChatSessionServerRequest } from '../../../common/chatSessionsService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkingCopyService } from '../../../../../services/workingCopy/common/workingCopyService.js';
import { ChatMode } from '../../../common/chatModes.js';
import { CHAT_SUBAGENT_RESOURCE_QUERY_PARAM, ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { getLanguageModelDisplayNameWithProvider, ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { ChatInputStateOrigin, reviveSerializableInputState, type IChatModel, type IChatModelInputState, type IChatRequestVariableData, type IInputModel, type ISerializableChatModelInputState } from '../../../common/model/chatModel.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { getChatSessionType, isUntitledChatSession } from '../../../common/model/chatUri.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ILanguageModelToolsService, IToolData, IToolResult, stringifyPromptTsxPart, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../chat.js';
import { getAgentSessionProviderIcon } from '../agentSessions.js';
import { IAgentCustomizationScope, IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostSessionWorkingDirectorySynchronizer } from './agentHostSessionWorkingDirectorySynchronizer.js';
import { IAgentHostNewSessionFolderService, computeWorkingDirectories } from './agentHostNewSessionFolderService.js';
import { AgentHostSnapshotController } from './agentHostSnapshotController.js';
import { AgentHostResponseFileChangesProvider } from './agentHostResponseFileChanges.js';
import type { AgentHostPromptCacheNotification } from './agentHostPromptCacheNotification.js';
import { IChatResponseFileChangesService } from '../../chatResponseFileChangesService.js';
import { AgentHostSessionReferenceAttachmentDisplayKind, AgentHostSessionReferenceTrajectoryAttachmentDisplayKind, toSessionReferenceAttachmentMeta, toSessionReferenceModelRepresentation } from './agentHostSessionReferenceAttachment.js';
import { buildHostLocalEventsPath } from '../../copilotCliEventsUri.js';
import { toolDataToDefinition } from './agentHostToolUtils.js';
import { isCopilotCliSessionType } from './agentHostToolSetEnablementService.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostImportConversationStore } from './agentHostImportConversationStore.js';
import { activeTurnToProgress, BOOLEAN_TRUE_OPTION_ID, completedToolCallToEditParts, completedToolCallToSerialized, containsAutomaticReplyAnswer, convertProtocolAnswers, convertProtocolPlanReviewResult, createInputRequestCarousel, createInputRequestPlanReview, finalizeToolInvocation, formatTurnResponseDetails, getTerminalContent, getUrlInputRequestPresentation, isSubagentTool, makeAhpTerminalToolSessionId, messageAttachmentsToVariableData, messageToRequestOrigin, messageToVariableData, parseAhpTerminalToolSessionId, rewriteAgentHostLinkTarget, shouldObserveSubagentChat, stringOrMarkdownToString, systemNotificationToChatPart, toolCallAuthenticationServer, toolCallStateToInvocation, toolCallStateToPreparedInvocation, toolCallStateToStreamingInvocation, turnsToHistory, updateRunningToolSpecificData, updateStreamingToolInvocation, usageInfoToAutoModeResolution, usageInfoToChatUsage, usageInfoToQuotas, type IAgentHostToolInvocationOptions, type IToolCallFileEdit, type TurnModelLookup } from './stateToProgressAdapter.js';
import { resolveMcpServerAuthentication, agentHostMcpServerId, modelRequiresAgentAuthentication } from './agentHostAuth.js';
export { toolDataToDefinition };

/**
 * Upper bound on the live editor text we inline for an unsaved document, matching the 1 MB per-file cap chat uses
 * elsewhere (`chatRepoInfo`). Larger buffers are not inlined; a dirty saved file then falls back to its on-disk path.
 */
const MAX_INLINED_UNSAVED_EDITOR_BYTES = 1024 * 1024;

/** Stable id of the progress row mirroring the host's chat activity, so updates replace it in place. */
const CHAT_ACTIVITY_PROGRESS_ID = 'agentHost.chatActivity';

export const UNOBSERVED_CLIENT_TOOL_GRACE_MS = 5000;
type AgentHostInvocationFailureStage = 'resolveSession' | 'provisionalSession' | 'sessionState' | 'authentication' | 'createSession' | 'subscribeSession' | 'prepareTurn' | 'dispatchTurn' | 'observeTurn';

interface IRestoredSubagentState extends IDisposable {
	readonly onDidChange: Event<void>;
	getState(): ISessionWithDefaultChat | undefined;
}

type AgentHostInvocationFailedEvent = {
	requestId: string;
	provider: string;
	failureStage: AgentHostInvocationFailureStage;
	isFirstRequest: boolean;
	hasUserSelectedModel: boolean;
	errorName: string;
	errorCode: string | undefined;
	msg: string;
	callstack: string | undefined;
};

type AgentHostInvocationFailedClassification = {
	requestId: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The chat request identifier, used to correlate this failure with provider and host turn telemetry.' };
	provider: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The agent host provider handling the request.' };
	failureStage: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'The bounded workbench adapter stage at which the request failed.' };
	isFirstRequest: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether this was the first request in the chat session.' };
	hasUserSelectedModel: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Whether the workbench request carried a selected language model identifier.' };
	errorName: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The name of the exception.' };
	errorCode: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The exception or protocol error code, when available.' };
	msg: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error message. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	callstack: { classification: 'CallstackOrException'; purpose: 'PerformanceAndHealth'; comment: 'The error stack. VS Code telemetry scrubs file paths and likely secrets before transmission.' };
	owner: 'roblourens';
	comment: 'Captures errors that prevent an agent host request from reaching a terminal host turn.';
};


// =============================================================================
// AgentHostSessionHandler - renderer-side handler for a single agent host
// chat session type. Bridges the protocol state layer with the chat UI:
// subscribes to session state, derives IChatProgress[] from immutable state
// changes, and dispatches client actions (turnStarted, toolCallConfirmed,
// turnCancelled) back to the server.
// =============================================================================

/**
 * Options threaded into {@link AgentHostSessionHandler._observeTurn}. The
 * same observation pipeline is used for live (`_handleTurn`), reconnected
 * (snapshot from `provideChatSessionContent`), and server-initiated turns
 * (`_watchForServerInitiatedTurns`). The differences are captured here:
 *
 * - {@link sink} routes emitted progress to either the agent invoke
 *   callback (live) or `chatSession.appendProgress` (reconnect /
 *   server-initiated).
 * - {@link snapshotToolCalls} carries whatever the snapshot already emitted
 *   for each tool call: a live `ChatToolInvocation` that per-tool setup adopts
 *   rather than recreating a UI handle, or a serialized part for a tool call
 *   that had already settled, which per-tool setup must not emit again.
 * - {@link seedEmittedLengths} prevents the always-on graph from re-emitting
 *   markdown / reasoning prefixes already covered by the snapshot.
 * - {@link onTurnEnded} fires once when the turn reaches a terminal state.
 */
interface IObserveTurnOptions {
	readonly backendSession: URI;
	readonly sessionResource: URI;
	/**
	 * The chat channel URI (as a string) this turn's conversation actions
	 * (turn lifecycle, tool calls, input answers) dispatch to. For a session's
	 * default chat this is the default chat URI; for an additional peer chat it
	 * is that chat's URI. Resolved from the upstream session/chat state and
	 * stored in {@link AgentHostSessionHandler._chatURIsBySessionResource}.
	 */
	readonly chatURI: string;
	readonly turnId: string;
	readonly sink: (parts: IChatProgress[]) => void;
	readonly cancellationToken: CancellationToken;
	/**
	 * What `activeTurnToProgress` already emitted for each tool call in the
	 * reconnect snapshot, keyed by tool call id. A live `ChatToolInvocation` is
	 * adopted by per-tool setup; a serialized part means the tool call had
	 * already settled and is fully rendered, so per-tool setup emits nothing.
	 */
	readonly snapshotToolCalls?: ReadonlyMap<string, ChatToolInvocation | IChatToolInvocationSerialized>;
	readonly seedEmittedLengths?: ReadonlyMap<string, number>;
	readonly initialResponsePartCount?: number;
	readonly onTurnEnded?: (lastTurn: Turn | undefined) => void;
	readonly onFileEdits?: (tc: ToolCallState, fileEdits: IToolCallFileEdit[]) => void;
	/**
	 * When set, a failed turn does NOT emit its error as a markdown progress
	 * part. The caller surfaces it instead as the agent result's
	 * `errorDetails` (e.g. so quota errors render the upgrade affordance).
	 */
	readonly suppressErrorMarkdown?: boolean;
	/**
	 * When set, this turn is being observed as part of a subagent session.
	 * Tool calls emitted into {@link sink} are tagged with this id so the
	 * renderer groups them under the parent subagent widget. Markdown,
	 * reasoning, and input requests are not forwarded (the subagent's own
	 * session view renders those); nested subagents are observed recursively.
	 */
	readonly subAgentInvocationId?: string;
	/**
	 * When set on a subagent turn observer, an observable that accumulates
	 * copilot credits reported by this subagent's turns. Subagent turn
	 * observers add their credits here; the value is surfaced on the subagent
	 * tool's hover and forwarded into the parent turn's shared accumulator so
	 * the session cost still includes them.
	 */
	readonly subAgentCreditsAccumulator?: ISettableObservable<number>;
	/**
	 * When set on a subagent turn observer, an observable that receives the
	 * display name of the language model this subagent's turns ran on. Used to
	 * surface the model on the subagent tool's hover (mirrors the local
	 * subagent path, which sets `modelName` directly).
	 */
	readonly subAgentModelObservable?: ISettableObservable<string | undefined>;
}

/**
 * Shared context for subagent observation within a parent turn. Tracks which
 * subagent tool calls already have observers so they aren't double-subscribed.
 */
interface ISubagentContext {
	/** Active child-chat observers keyed by their spawning tool call. */
	readonly observations: DisposableMap<string>;
}

interface IOutputTerminalAttachment {
	sessionId?: string;
	readonly disposable: MutableDisposable<IDisposable>;
}

function getMcpAuthenticationRequiredServers(sessionResource: URI, state: ISessionWithDefaultChat | undefined): IChatMcpAuthenticationRequiredServer[] {
	const servers = state?.customizations?.flatMap(c => c.type === CustomizationType.McpServer
		? [c]
		: c.children?.filter(c => c.type === CustomizationType.McpServer) ?? []) ?? [];
	const toolAuthServerIds = new Set(state?.inputNeeded
		?.filter(request => request.kind === SessionInputRequestKind.ToolAuthentication)
		.map(request => request.kind === SessionInputRequestKind.ToolAuthentication
			? request.toolCall.contributor.customizationId
			: undefined)
		.filter(id => id !== undefined));
	return servers
		.filter(server => isCustomizationEnabled(server) && server.state.kind === McpServerStatus.AuthRequired && !toolAuthServerIds.has(server.id))
		.map((server): IChatMcpAuthenticationRequiredServer => {
			const state = server.state as McpServerAuthRequiredState;
			return {
				id: sessionResource.authority + '/' + server.id,
				name: server.name,
				resource: state.resource.resource,
				oauthClient: state.oauthClient,
				authorizationServers: state.resource.authorization_servers,
				supportedScopes: state.resource.scopes_supported,
				requiredScopes: state.requiredScopes,
				reason: state.reason,
			};
		});
}

interface IStartServerRequestOptions {
	readonly isSystemInitiated?: boolean;
	readonly isHidden?: boolean;
	readonly timestamp?: number;
	readonly isTerminalRequest?: boolean;
	readonly origin?: IChatSessionServerRequest['origin'];
}

function parseTimestamp(value: string): number | undefined {
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : undefined;
}

function getSubagentTiming(state: ISessionWithDefaultChat): { startedAt: number | undefined; duration: number | undefined } {
	const turns = state.activeTurn ? [...state.turns, state.activeTurn] : state.turns;
	const starts = turns
		.map(turn => turn.startedAt ? Date.parse(turn.startedAt) : undefined)
		.filter((timestamp): timestamp is number => timestamp !== undefined && Number.isFinite(timestamp));
	const startedAt = starts.length > 0 ? Math.min(...starts) : undefined;
	if (startedAt === undefined || state.activeTurn) {
		return { startedAt, duration: undefined };
	}
	const ends = state.turns.flatMap(turn => {
		const turnStartedAt = turn.startedAt ? Date.parse(turn.startedAt) : undefined;
		return turnStartedAt !== undefined && Number.isFinite(turnStartedAt) && typeof turn.duration === 'number' && Number.isFinite(turn.duration)
			? [turnStartedAt + Math.max(0, turn.duration)]
			: [];
	});
	const endedAt = ends.length > 0 ? Math.max(...ends) : undefined;
	return { startedAt, duration: endedAt !== undefined ? Math.max(0, endedAt - startedAt) : undefined };
}

function userOriginMessage(text: string, attachments: readonly MessageAttachment[] | undefined): Message {
	return attachments?.length
		? { text, origin: { kind: MessageKind.User }, attachments: [...attachments] }
		: { text, origin: { kind: MessageKind.User } };
}

/**
 * Extracts a user-facing message from a session-load failure so the actual cause
 * (e.g. a git worktree-recreation error) is shown instead of a generic message.
 * Strips the `Failed to restore session <uri>: ` wrapper that `AgentService`
 * adds around restore failures. Returns `undefined` when no message is available.
 */
export function unwrapSessionLoadErrorMessage(err: unknown): string | undefined {
	const message = err instanceof Error ? err.message : (typeof err === 'string' ? err : undefined);
	if (!message) {
		return undefined;
	}

	// The session URI in the prefix contains `scheme:/…` (colon-slash), never
	// `: ` (colon-space), so the non-greedy match stops at the wrapper separator.
	return message.replace(/^Failed to restore session .+?: /, '');
}

export function resolveRestoredSubagentChatResource(parentSession: string, toolCallId: string, catalogResource: string | undefined, persistedResource: string | undefined): string {
	if (catalogResource) {
		return catalogResource;
	}
	if (persistedResource) {
		const parsed = parseChatUri(persistedResource);
		if (parsed?.session === parentSession && parsed.chatId === `subagent/${toolCallId}`) {
			return persistedResource;
		}
	}
	return buildSubagentChatUri(parentSession, toolCallId);
}

/**
 * Resolves a session's last-used model selection from its live turns. Model
 * selection moved off the session/chat summary and onto each {@link Message};
 * the value to default to is the one carried by the most recent turn (the
 * active turn if one is running, else the last completed turn).
 */
function lastTurnModelSelection(state: ISessionWithDefaultChat | undefined): ModelSelection | undefined {
	return lastTurnMessage(state)?.model;
}

/**
 * Whether a progress emission counts as the turn's first visible progress
 * for time-to-first-progress telemetry. Mirrors the agent host's own
 * definition (text delta, response part, tool call start, or reasoning).
 */
function isFirstVisibleProgressPart(part: IChatProgress): boolean {
	return part.kind === 'markdownContent' || part.kind === 'thinking' || part.kind === 'toolInvocation';
}

function lastTurnMessage(state: ISessionWithDefaultChat | undefined): Message | undefined {
	return state?.activeTurn?.message ?? (state && state.turns.length ? state.turns[state.turns.length - 1].message : undefined);
}

function emptyDraftFromLastTurn(state: ISessionWithDefaultChat): Message | undefined {
	const message = lastTurnMessage(state);
	if (!message?.model && !message?.agent) {
		return undefined;
	}
	return {
		text: '',
		origin: { kind: MessageKind.User },
		...(message.model ? { model: message.model } : {}),
		...(message.agent ? { agent: message.agent } : {}),
	};
}

/** The draft the chat channel holds, so we only send real changes and can keep its model. */
export class DraftSyncState {
	private _synced: Message | undefined;
	private _remoteModel: ModelSelection | undefined;

	constructor(remoteDraft: Message | undefined) {
		this._synced = remoteDraft;
		this._remoteModel = remoteDraft?.model;
	}

	get synced(): Message | undefined {
		return this._synced;
	}

	get remoteModel(): ModelSelection | undefined {
		return this._remoteModel;
	}

	applyRemote(remoteDraft: Message | undefined): void {
		this._synced = remoteDraft;
		this._remoteModel = remoteDraft?.model;
	}

	shouldPublish(outgoing: Message | undefined): boolean {
		if (equals(this._synced, outgoing)) {
			return false;
		}
		this._synced = outgoing;
		return true;
	}
}

/**
 * Map a local {@link ConfirmedReason} (how the {@link ChatToolInvocation}
 * resolved its confirmation gate) to the protocol's
 * {@link ToolCallConfirmationReason}. Only called for approved reasons
 * ({@link ToolConfirmKind.Denied} / {@link ToolConfirmKind.Skipped} are
 * handled by the `approved: false` branch).
 */
function confirmedReasonToProtocol(reason: ConfirmedReason | undefined): ToolCallConfirmationReason {
	switch (reason?.type) {
		case ToolConfirmKind.ConfirmationNotNeeded:
			return ToolCallConfirmationReason.NotNeeded;
		case ToolConfirmKind.Setting:
		case ToolConfirmKind.LmServicePerTool:
			return ToolCallConfirmationReason.Setting;
		default:
			return ToolCallConfirmationReason.UserAction;
	}
}

function getClientToolPreApproval(toolCall: ToolCallState): ConfirmedReason | undefined {
	if (readToolCallMeta(toolCall).autoApproveBySetting === true) {
		return { type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove };
	}

	// Only trust `Running` and `AuthRequired` as evidence of a genuine
	// approval: they can only be entered after the agent host confirmed the
	// call, so their `confirmed` reason is authoritative. `Completed` and
	// `PendingResultConfirmation` are excluded because the reducer
	// synthesizes a `NotNeeded` confirmation when a `ChatToolCallComplete`
	// arrives while the call is still `PendingConfirmation`, which would
	// otherwise let us falsely confirm and execute a call that was never
	// approved.
	switch (toolCall.status) {
		case ToolCallStatus.Running:
		case ToolCallStatus.AuthRequired:
			switch (toolCall.confirmed) {
				case ToolCallConfirmationReason.NotNeeded:
					return { type: ToolConfirmKind.ConfirmationNotNeeded };
				case ToolCallConfirmationReason.Setting:
					return { type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove };
				case ToolCallConfirmationReason.UserAction:
					return { type: ToolConfirmKind.UserAction };
			}
	}

	return undefined;
}

/**
 * Returns the tool call's `_meta` with the transient
 * {@link IToolCallMeta.toolSearchCandidates} corpus removed. Always returns an
 * object (never `undefined`) so a completion action can force-replace the prior
 * `_meta` — the reducer keeps the existing bag when an action omits one, so an
 * explicit empty replacement is what actually drops the candidates.
 */
function metaWithoutToolSearchCandidates(source: { readonly _meta?: Record<string, unknown> }): Record<string, unknown> {
	const meta = { ...source._meta };
	delete meta['toolSearchCandidates'];
	return meta;
}

async function resolveToolInput(connection: IAgentConnection, toolInput: ToolInput | undefined): Promise<string> {
	if (toolInput === undefined) {
		return '{}';
	}
	if (typeof toolInput === 'string') {
		return toolInput;
	}
	const result = await connection.resourceRead(URI.parse(toolInput.uri));
	return result.encoding === ContentEncoding.Base64 ? decodeBase64(result.data).toString() : result.data;
}

/**
 * Converts carousel answers (IChatQuestionAnswers) to protocol
 * ChatInputAnswer records, handling text, single-select,
 * boolean, and multi-select answer shapes.
 */
export function convertCarouselAnswers(raw: IChatQuestionAnswers, questions: readonly ChatInputQuestion[] = []): Record<string, ChatInputAnswer> {
	const answers: Record<string, ChatInputAnswer> = {};
	const questionKinds = new Map(questions.map(question => [question.id, question.kind]));
	for (const [qId, answer] of Object.entries(raw)) {
		if (typeof answer === 'string') {
			answers[qId] = {
				state: ChatInputAnswerState.Submitted,
				value: { kind: ChatInputAnswerValueKind.Text, value: answer },
			};
		} else if (answer && typeof answer === 'object') {
			const multi = answer as IChatMultiSelectAnswer;
			const single = answer as IChatSingleSelectAnswer;
			if (Array.isArray(multi.selectedValues)) {
				// Multi-select answer
				answers[qId] = {
					state: ChatInputAnswerState.Submitted,
					value: {
						kind: ChatInputAnswerValueKind.SelectedMany,
						value: multi.selectedValues,
						freeformValues: multi.freeformValue ? [multi.freeformValue] : undefined,
					},
				};
			} else if (single.selectedValue && questionKinds.get(qId) === ChatInputQuestionKind.Boolean) {
				answers[qId] = {
					state: ChatInputAnswerState.Submitted,
					value: {
						kind: ChatInputAnswerValueKind.Boolean,
						value: single.selectedValue === BOOLEAN_TRUE_OPTION_ID,
					},
				};
			} else if (single.selectedValue) {
				// Single-select answer
				answers[qId] = {
					state: ChatInputAnswerState.Submitted,
					value: {
						kind: ChatInputAnswerValueKind.Selected,
						value: single.selectedValue,
						freeformValues: single.freeformValue ? [single.freeformValue] : undefined,
					},
				};
			} else if (single.freeformValue) {
				// Freeform-only answer (no selection)
				answers[qId] = {
					state: ChatInputAnswerState.Submitted,
					value: { kind: ChatInputAnswerValueKind.Text, value: single.freeformValue },
				};
			}
		}
	}
	return answers;
}

type PlanReviewInputCompletion = { response: ChatInputResponseKind; answers?: Record<string, ChatInputAnswer> };

function getPlanReviewAction(planReview: IAgentHostPlanReview, actionId: string | undefined, actionLabel: string | undefined) {
	if (actionId) {
		const action = planReview.actions.find(a => a.id === actionId);
		if (action) {
			return action;
		}
	}
	if (actionLabel) {
		return planReview.actions.find(a => a.label === actionLabel);
	}
	return undefined;
}

function submittedTextAnswer(value: string): ChatInputAnswer {
	return {
		state: ChatInputAnswerState.Submitted,
		value: { kind: ChatInputAnswerValueKind.Text, value },
	};
}

function submittedSelectedAnswer(value: string, feedback?: string): ChatInputAnswer {
	return {
		state: ChatInputAnswerState.Submitted,
		value: {
			kind: ChatInputAnswerValueKind.Selected,
			value,
			...(feedback ? { freeformValues: [feedback] } : {}),
		},
	};
}

function convertPlanReviewResult(planReview: IAgentHostPlanReview, result: IChatPlanReviewResult): PlanReviewInputCompletion {
	const feedback = result.feedback?.trim();
	if (feedback) {
		const action = getPlanReviewAction(planReview, result.actionId, result.action);
		return {
			response: ChatInputResponseKind.Accept,
			answers: {
				[planReview.answerQuestionId]: action
					? submittedSelectedAnswer(action.id, feedback)
					: submittedTextAnswer(feedback),
			},
		};
	}

	if (result.rejected) {
		return { response: ChatInputResponseKind.Decline };
	}

	const action = getPlanReviewAction(planReview, result.actionId, result.action);
	if (!action) {
		return { response: ChatInputResponseKind.Decline };
	}

	return {
		response: ChatInputResponseKind.Accept,
		answers: {
			[planReview.answerQuestionId]: submittedSelectedAnswer(action.id),
		},
	};
}

function inputRequestResponsePartKey(part: InputRequestResponsePart): string {
	return `ir:${part.request.id}:${JSON.stringify({ ...part.request, answers: undefined })}`;
}

function getChatTitle(state: Pick<SessionState, 'chats' | 'title'>, chatURI: string): string | undefined {
	const chat = state.chats.find(chat => chat.resource === chatURI);
	if (!chat) {
		return undefined;
	}
	return chat.title || (isDefaultChatUri(chatURI) ? state.title : undefined);
}

/**
 * The live invocation the reconnect snapshot emitted for this tool call, if
 * any. A tool call the snapshot rendered as a serialized part has no live
 * handle to adopt.
 */
function snapshotInvocationToAdopt(opts: IObserveTurnOptions, toolCallId: string): ChatToolInvocation | undefined {
	const emitted = opts.snapshotToolCalls?.get(toolCallId);
	return emitted instanceof ChatToolInvocation ? emitted : undefined;
}

// =============================================================================
// Chat session
// =============================================================================

class AgentHostChatSession extends Disposable implements IChatSession {
	readonly progressObs = observableValue<IChatProgress[]>('agentHostProgress', []);
	readonly isCompleteObs = observableValue<boolean>('agentHostComplete', true);
	readonly isReadOnly: IObservable<boolean>;
	private readonly _sessionState = observableValue<IObservable<SessionState | undefined>>(this, constObservable(undefined));
	private readonly _chatState = observableValue<IObservable<ChatState | undefined>>(this, constObservable(undefined));
	private readonly _promptCacheTracking = this._register(new MutableDisposable<IDisposable>());

	private readonly _onWillDispose = this._register(new Emitter<void>());
	readonly onWillDispose = this._onWillDispose.event;

	private readonly _onDidStartServerRequest = this._register(new Emitter<IChatSessionServerRequest>());
	readonly onDidStartServerRequest = this._onDidStartServerRequest.event;

	readonly interruptActiveResponseCallback: IChatSession['interruptActiveResponseCallback'];
	readonly forkSession: IChatSession['forkSession'];
	readonly renameSession: IChatSession['renameSession'];
	readonly transferredState: IChatSession['transferredState'];

	constructor(
		readonly sessionResource: URI,
		readonly history: readonly IChatSessionHistoryItem[],
		readonly title: string | undefined,
		sessionSubscription: IAgentSubscription<SessionState> | undefined,
		chatSubscription: IAgentSubscription<ChatState> | undefined,
		private readonly _promptCacheNotification: AgentHostPromptCacheNotification | undefined,
		private readonly _forkSession: ((request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => Promise<IChatSessionItem>),
		private readonly _renameSession: ((title: string, token: CancellationToken) => Promise<void>),
		inputState: ISerializableChatModelInputState | undefined,
		initialProgress: IChatProgress[] | undefined,
		historySubagentObservations: IDisposable,
		onDispose: () => void,
		interruptActiveResponse: () => boolean,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this.setStateSubscriptions(sessionSubscription, chatSubscription);
		this.isReadOnly = derived(this, reader => {
			const sessionArchived = Boolean((this._sessionState.read(reader).read(reader)?.status ?? 0) & SessionStatus.IsArchived);
			return isChatReadOnly(this._chatState.read(reader).read(reader)?.interactivity, sessionArchived);
		});

		const hasActiveTurn = initialProgress !== undefined;
		this.transferredState = inputState ? { editingSession: undefined, inputState } : undefined;
		if (hasActiveTurn) {
			this.isCompleteObs.set(false, undefined);
			this.progressObs.set(initialProgress, undefined);
		}

		this._register(historySubagentObservations);
		this._register(toDisposable(onDispose));

		// Always provide an interrupt callback so the chat UI's stop button
		// can cancel a remote turn at any time. The callback resolves the
		// current active turn at call time and dispatches ChatTurnCancelled.
		this.interruptActiveResponseCallback = async () => interruptActiveResponse();

		this.forkSession = this._forkSession;
		this.renameSession = this._renameSession;
	}

	setStateSubscriptions(sessionSubscription: IAgentSubscription<SessionState> | undefined, chatSubscription: IAgentSubscription<ChatState> | undefined): void {
		this._promptCacheTracking.clear();
		this._promptCacheTracking.value = sessionSubscription ? this._promptCacheNotification?.trackSession(this.sessionResource, sessionSubscription) : undefined;
		transaction(tx => {
			this._sessionState.set(sessionSubscription ? observableFromSubscription(this, sessionSubscription) : constObservable(undefined), tx);
			this._chatState.set(chatSubscription ? observableFromSubscription(this, chatSubscription) : constObservable(undefined), tx);
		});
	}

	override dispose(): void {
		// Fire `onWillDispose` BEFORE `super.dispose()` so listeners (notably
		// `ContributedChatSessionData` in `ChatSessionsService`) can evict
		// this session from their caches.
		if (!this._store.isDisposed) {
			this._onWillDispose.fire();
		}
		super.dispose();
	}

	/**
	 * Registers a disposable to be cleaned up when this session is disposed.
	 */
	registerDisposable<T extends IDisposable>(disposable: T): T {
		return this._register(disposable);
	}

	/**
	 * Appends new progress items to the observable. Used by the reconnection
	 * flow to stream ongoing state changes into the chat UI.
	 */
	appendProgress(items: IChatProgress[]): void {
		const current = this.progressObs.get();
		this.progressObs.set([...current, ...items], undefined);
	}

	/**
	 * Marks the active turn as complete.
	 */
	complete(): void {
		this.isCompleteObs.set(true, undefined);
	}

	/**
	 * Called by the session handler when a server-initiated turn starts.
	 * Resets the progress observable and signals listeners to create a new
	 * request+response pair in the chat model. `turnId` is the provider's turn
	 * id and is adopted as the chat request id, so features that address a turn
	 * by request id (side chats, forks) can resolve it against the host.
	 */
	startServerRequest(turnId: string, prompt: string, variableData?: IChatRequestVariableData, options?: IStartServerRequestOptions): void {
		this._logService.info('[AgentHost] Server-initiated request started');
		transaction(tx => {
			this.progressObs.set([], tx);
			this.isCompleteObs.set(false, tx);
		});
		this._onDidStartServerRequest.fire({
			id: turnId,
			prompt,
			variableData,
			isSystemInitiated: options?.isSystemInitiated,
			isHidden: options?.isHidden,
			timestamp: options?.timestamp,
			isTerminalRequest: options?.isTerminalRequest,
			origin: options?.origin,
		});
	}
}

// =============================================================================
// Session handler
// =============================================================================

export interface IAgentHostSessionHandlerConfig {
	readonly provider: AgentProvider;
	/**
	 * The URI scheme the host addresses sessions under, when it differs from
	 * {@link provider}. Defaults to {@link provider}.
	 *
	 * Session URIs are client-chosen. For agents core spawns, core picks the URI and
	 * uses the provider as the scheme. For sessions core *joins* rather than creates
	 * (cloud sandbox, where Mission Control created the session as `ahp-session:/<id>`),
	 * the creator's scheme must be used because the host's registry is keyed by the
	 * exact URI — while the UI still routes the session to the `copilot` provider.
	 */
	readonly backendSessionScheme?: string;
	readonly agentId: string;
	readonly sessionType: string;
	readonly fullName: string;
	readonly description: string;
	/** The agent connection to use for this handler. */
	readonly connection: IAgentConnection;
	/** Sanitized connection authority for constructing vscode-agent-host:// URIs. */
	readonly connectionAuthority: string;
	/** Extension identifier for the registered agent. Defaults to 'vscode.agent-host'. */
	readonly extensionId?: string;
	/** Extension display name for the registered agent. Defaults to 'Agent Host'. */
	readonly extensionDisplayName?: string;
	/**
	 * Optional callback to resolve a working directory for a new session.
	 * If not provided or unresolved, session resource resolvers are consulted before
	 * falling back to the first workspace folder.
	 */
	readonly resolveWorkingDirectory?: (sessionResource: URI) => URI | undefined;
	/** Whether a final-looking chat resource is still a client-side draft. */
	readonly isNewSession?: (sessionResource: URI) => boolean;
	/** Called after a locally-created session has been accepted by the backend. */
	readonly onSessionMaterialized?: (sessionResource: URI) => void;
	/**
	 * Optional callback invoked when the server rejects an operation because
	 * authentication is required. Should trigger interactive authentication
	 * and return true if the user authenticated successfully.
	 *
	 * @param protectedResources The protected resources from the agent's root
	 *   state that require authentication.
	 */
	readonly resolveAuthentication?: (protectedResources: ProtectedResourceMetadata[]) => Promise<boolean>;
	readonly promptCacheNotification?: AgentHostPromptCacheNotification;
}

/**
 * Converts a UTF-16 code-unit offset in `text` to a 1-based Monaco
 * `IPosition`. Used to translate AHP completion-item ranges (which use
 * offsets) into Monaco-style positions for the chat input.
 */
function offsetToPosition(text: string, offset: number): IPosition {
	let lineNumber = 1;
	let column = 1;
	const limit = Math.min(offset, text.length);
	for (let i = 0; i < limit; i++) {
		if (text.charCodeAt(i) === 10 /* \n */) {
			lineNumber++;
			column = 1;
		} else {
			column++;
		}
	}
	return { lineNumber, column };
}

class ActiveClientEntry extends Disposable {

	private readonly _activeClient: IObservable<SessionActiveClient>;
	private readonly _state = observableValue(this, true);
	private readonly _cancellation = new CancellationTokenSource();
	private readonly _reconcileSignal = observableValue(this, 0);
	private readonly _stateSubscription = this._register(new MutableDisposable<IDisposable>());
	private readonly _publishDelayer: Delayer<void>;
	private _backendSession: URI | undefined;
	private _claimRequested = false;
	private _lastPublished: SessionActiveClient | undefined;

	constructor(
		private readonly _scope: IAgentCustomizationScope,
		clientId: string,
		debounceDelay: number,
		private readonly _getSessionState: (backendSession: URI) => SessionState | undefined,
		private readonly _dispatch: (backendSession: URI, action: ClientSessionAction) => void,
	) {
		super();
		this._activeClient = _scope.activeClient(clientId);
		this._publishDelayer = this._register(new Delayer<void>(debounceDelay));
		this._register(_scope);
		this._register(toDisposable(() => this._cancellation.dispose(true)));
		this._register(autorun(reader => {
			if (!this._scope.isResolved.read(reader)) {
				return;
			}
			this._activeClient.read(reader);
			this._reconcileSignal.read(reader);
			this._requestReconciliation();
		}));
	}

	/** Snapshot of the composed active-client view. */
	getActiveClient(): SessionActiveClient {
		return this._activeClient.get();
	}

	/** Resolves once no active-client publish is pending. */
	async whenSettled(): Promise<void> {
		await waitForState(this._state, state => !state, undefined, this._cancellation.token);
	}

	/** Binds the backend session and requests this client join it. */
	claim(backendSession: URI): void {
		this._backendSession = backendSession;
		this._claimRequested = true;
		this._requestReconciliation();
	}

	/** Binds the backend session and reconciles without claiming it. */
	attach(backendSession: URI, sessionSubscription: IAgentSubscription<SessionState> | undefined): void {
		this._backendSession = backendSession;
		this._stateSubscription.value = sessionSubscription?.onDidChange(() => {
			this._reconcileSignal.set(this._reconcileSignal.get() + 1, undefined);
		});
		this._requestReconciliation();
	}

	private _requestReconciliation(): void {
		if (this._cancellation.token.isCancellationRequested) {
			return;
		}
		if (!this._scope.isResolved.get()) {
			this._state.set(true, undefined);
			return;
		}
		if (!this._backendSession) {
			this._state.set(false, undefined);
			return;
		}
		this._state.set(true, undefined);
		this._publishDelayer.trigger(async () => {
			try {
				if (this._cancellation.token.isCancellationRequested) {
					return;
				}
				const backendSession = this._backendSession;
				if (!backendSession || !this._scope.isResolved.get()) {
					return;
				}
				const activeClient = this._activeClient.get();
				const existing = this._getSessionState(backendSession)?.activeClients.find(client => client.clientId === activeClient.clientId);
				if (!existing && !this._claimRequested) {
					return;
				}
				if (equals(existing, activeClient)) {
					this._lastPublished = undefined;
					return;
				}
				if (equals(this._lastPublished, activeClient)) {
					return;
				}
				this._dispatch(backendSession, {
					type: ActionType.SessionActiveClientSet,
					activeClient,
				});
				this._lastPublished = activeClient;
			} finally {
				if (this._scope.isResolved.get()) {
					this._state.set(false, undefined);
				}
			}
		}).catch(() => { /* delayer disposed */ });
	}
}

export class AgentHostSessionHandler extends Disposable implements IChatSessionContentProvider {

	private static readonly DRAFT_SYNC_DEBOUNCE_MS = 500;
	private static readonly ACTIVE_CLIENT_RECONCILIATION_DEBOUNCE_MS = 5;

	private readonly _activeSessions = new ResourceMap<AgentHostChatSession>();
	private readonly _chatURIsBySessionResource = new ResourceMap<string>();
	/** Per-session subscription to chat model pending request changes. */
	private readonly _pendingMessageSubscriptions = this._register(new DisposableResourceMap());
	private readonly _remotePendingMessageProjections = new ResourceSet();
	/** Per-session debounced sync from chat input state to AHP draft state. */
	private readonly _draftSyncSubscriptions = this._register(new DisposableResourceMap());
	/** Per-session subscription watching for server-initiated turns. */
	private readonly _serverTurnWatchers = this._register(new DisposableResourceMap());
	/** Per-session subscription silently resolving existing MCP authentication grants. */
	private readonly _mcpAuthWatchers = this._register(new DisposableResourceMap());
	/**
	 * Ownership of actionable protocol requests, keyed by backend session URI
	 * string. `inputNeeded` is a session-level queue and the single caller of
	 * {@link invokeTool} for client tools, so it must be handled exactly once
	 * per backend session no matter how many sibling chat resources (default
	 * chat, peer chats, subagent chats) are open against it. Each such resource
	 * holds a reference; the shared watcher stays alive while any reference
	 * remains and is disposed only when the last one is released.
	 */
	private readonly _inputNeededWatchers = new Map<string, { readonly store: DisposableStore; readonly refs: Set<string> }>();
	/**
	 * Backend session each open resource's {@link _inputNeededWatchers}
	 * reference belongs to, recorded when the reference is installed. Teardown
	 * uses this to release the right reference without re-deriving the backend
	 * session via {@link _resolveSessionUri}, whose provisional mapping may
	 * already be cleared by then.
	 */
	private readonly _inputNeededWatcherBackends = new ResourceMap<URI>();
	/** One reconciliation owner per active session. */
	private readonly _activeClientEntries = new ResourceMap<ActiveClientEntry>();
	/** Historical turns with file edits, pending hydration into the editing session. */
	private readonly _pendingHistoryTurns = new ResourceMap<readonly Turn[]>();
	/**
	 * Requests a turn observer is currently rendering, keyed by
	 * {@link _toolCallKey} for tool calls and {@link _inputRequestKey} for chat
	 * input requests (the two key shapes differ in arity, so they cannot
	 * collide). The value is the claiming observer's session resource, which
	 * the session-level responder uses as the chat context when it executes a
	 * client tool so the tool runs against the chat that is actually rendering
	 * it. The session-level responder defers to those observers so the inline
	 * UI stays in charge of answering.
	 */
	private readonly _renderedRequests = observableValue<ReadonlyMap<string, URI>>(this, new Map());
	/** Tool calls whose protocol outcome has already been dispatched. */
	private readonly _resolvedToolCalls = new Set<string>();
	/**
	 * A single {@link ChatToolInvocation} per client tool call, keyed by
	 * {@link _toolCallKey}. Created lazily by whichever of the session-level
	 * watcher or the turn observer arrives first, so both act on one object:
	 * the observer renders it while the watcher executes it. Entries are
	 * dropped once the call resolves so a later call with the same ids is not
	 * mistaken for it.
	 */
	private readonly _clientToolInvocations = new Map<string, ChatToolInvocation>();
	/**
	 * Live `inputNeeded` requests per tool call, keyed by {@link _toolCallKey}.
	 * One tool call is represented by a succession of requests — a confirmation
	 * is replaced by a client execution once approved — so the shared state
	 * above is only released when the last of them goes away.
	 */
	private readonly _clientToolRetainCounts = new Map<string, number>();
	/**
	 * Per-session set of MCP server ids that already had an authentication
	 * prompt surfaced in the current conversation. A server is removed from the
	 * set once it reaches the running state ({@link McpServerStatus.Ready}), so
	 * that a later auth requirement for the same server prompts again instead of
	 * the prompt repeating on every message.
	 */
	private readonly _surfacedMcpAuthServers = new ResourceMap<Set<string>>();
	private readonly _pendingMcpAutoAuthentication = new Map<string, Promise<boolean>>();
	/** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
	private readonly _clientDispatchedTurnIds = new Set<string>();
	private readonly _turnStopWatches = new Map<string, StopWatch>();
	private readonly _config: IAgentHostSessionHandlerConfig;

	/** Active session subscriptions, keyed by backend session URI string. */
	private readonly _sessionSubscriptions = new Map<string, IReference<IAgentSubscription<SessionState>>>();
	/**
	 * Working-directory synchronizer registrations, keyed by session URI. Each
	 * lives exactly as long as that session's {@link _sessionSubscriptions} entry.
	 */
	private readonly _workingDirectoryRegistrations = this._register(new DisposableMap<string>());

	/**
	 * Active default-chat subscriptions, keyed by backend session URI string.
	 * Multi-chat is not yet surfaced: every session is served by a single
	 * implicit default chat that carries the conversation contents (turns,
	 * active turn, pending/queued messages, input requests). We subscribe to
	 * it alongside the session and merge both into the {@link ISessionWithDefaultChat}
	 * view returned by {@link _getSessionState}.
	 */
	private readonly _defaultChatSubscriptions = new Map<string, IReference<IAgentSubscription<ChatState>>>();

	/**
	 * Active subscriptions for additional (non-default) peer chats, keyed by
	 * the chat channel URI string. Populated when a chat widget is opened for
	 * a resource that carries a chatId fragment.
	 */
	private readonly _additionalChatSubscriptions = new Map<string, IReference<IAgentSubscription<ChatState>>>();

	/**
	 * Chat channel URI that owns each observed terminal, keyed by terminal URI.
	 * Recorded while observing a terminal tool call so a later claim (e.g.
	 * "Continue in Background") can attribute itself to the chat the terminal
	 * actually belongs to rather than assuming the session's default chat.
	 */
	private readonly _terminalChatURIs = new Map<string, string>();

	/**
	 * Backend session URIs with an in-flight {@link provideChatSessionContent}
	 * call, keyed by session URI string with a refcount value. While a chat is
	 * still hydrating its subscriptions, a sibling chat of the same session
	 * closing must not tear down the shared session subscription out from under
	 * it (see {@link _releaseChatSessionSubscriptions} / {@link _hasOtherSessionHold}).
	 */
	private readonly _hydratingChatSessions = new Map<string, number>();

	constructor(
		config: IAgentHostSessionHandlerConfig,
		@IChatAgentService private readonly _chatAgentService: IChatAgentService,
		@IChatService private readonly _chatService: IChatService,
		@IChatEditingService private readonly _chatEditingService: IChatEditingService,
		@ILogService private readonly _logService: ILogService,
		@IWorkspaceContextService private readonly _workspaceContextService: IWorkspaceContextService,
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@ITerminalChatService private readonly _terminalChatService: ITerminalChatService,
		@IAgentHostTerminalService private readonly _agentHostTerminalService: IAgentHostTerminalService,
		@IAgentHostSessionWorkingDirectoryResolver private readonly _workingDirectoryResolver: IAgentHostSessionWorkingDirectoryResolver,
		@IAgentHostSessionWorkingDirectorySynchronizer private readonly _workingDirectorySynchronizer: IAgentHostSessionWorkingDirectorySynchronizer,
		@IAgentHostNewSessionFolderService private readonly _newSessionFolderService: IAgentHostNewSessionFolderService,
		@IAgentHostUntitledProvisionalSessionService private readonly _provisionalService: IAgentHostUntitledProvisionalSessionService,
		@IAgentHostImportConversationStore private readonly _importConversationStore: IAgentHostImportConversationStore,
		@ILanguageModelToolsService private readonly _toolsService: ILanguageModelToolsService,
		@IChatWidgetService private readonly _chatWidgetService: IChatWidgetService,
		@ILanguageModelsService private readonly _languageModelsService: ILanguageModelsService,
		@IOpenerService private readonly _openerService: IOpenerService,
		@IAgentHostActiveClientService private readonly _activeClientService: IAgentHostActiveClientService,
		@IChatEntitlementService private readonly _chatEntitlementService: IChatEntitlementService,
		@IWorkspaceTrustRequestService private readonly _workspaceTrustRequestService: IWorkspaceTrustRequestService,
		@IWorkspaceTrustManagementService private readonly _workspaceTrustManagementService: IWorkspaceTrustManagementService,
		@IModelService private readonly _modelService: IModelService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatResponseFileChangesService private readonly _chatResponseFileChangesService: IChatResponseFileChangesService,
		@IPathService private readonly _pathService: IPathService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IAgentHostCustomizationService private readonly _customizationService: IAgentHostCustomizationService,
		@ITelemetryService private readonly _telemetryService: ITelemetryService,
	) {
		super();
		this._config = config;

		// The `inputNeeded` watchers live in a plain map (they are shared and
		// ref-counted across sibling resources), so dispose any that survive
		// when the handler goes away.
		this._register(toDisposable(() => {
			for (const { store } of this._inputNeededWatchers.values()) {
				store.dispose();
			}
			this._inputNeededWatchers.clear();
			this._inputNeededWatcherBackends.clear();
			this._terminalChatURIs.clear();
		}));
		// Drop MCP servers from the per-session surfaced set once they reach the
		// running state so a later auth requirement for the same server prompts
		// again.
		this._register(this._customizationService.onDidChangeCustomizations(() => this._reconcileSurfacedMcpAuthServers()));

		this._register(toDisposable(() => {
			for (const entry of this._activeClientEntries.values()) {
				entry.dispose();
			}
			this._activeClientEntries.clear();
		}));

		// When the user clicks "Continue in Background" on an AHP terminal
		// tool, narrow the terminal claim so the server-side tool handler
		// can detect it and return early.
		this._register(this._terminalChatService.onDidContinueInBackground(terminalToolSessionId => {
			const parsed = parseAhpTerminalToolSessionId(terminalToolSessionId);
			if (!parsed) {
				return;
			}
			// The claim identifies the owning chat. The terminal tool session ID
			// only carries the session, so use the chat recorded while observing
			// the terminal's tool call.
			const chat = this._terminalChatURIs.get(parsed.terminal);
			if (!chat) {
				this._logService.warn(`[AgentHost] Continue in background: unknown owning chat for terminal=${parsed.terminal}`);
				return;
			}
			this._logService.info(`[AgentHost] Continue in background: terminal=${parsed.terminal}, session=${parsed.session}`);
			this._config.connection.dispatch(parsed.terminal, {
				type: ActionType.TerminalClaimed,
				claim: {
					kind: TerminalClaimKind.Session,
					session: parsed.session,
					chat,
				},
			});
		}));

		// Register an editing session provider for this handler's session type
		this._register(this._chatEditingService.registerEditingSessionProvider(
			config.sessionType,
			{
				createEditingSession: (chatSessionResource: URI) => {
					return this._instantiationService.createInstance(
						AgentHostSnapshotController,
						chatSessionResource,
						config.connectionAuthority,
					);
				},
			},
		));

		// Supply the per-response "Changed N files" chat summary from the
		// authoritative server-computed per-turn changeset (the same source as
		// the Agents-app Changes view) instead of the editing session.
		this._register(this._chatResponseFileChangesService.registerProvider(
			config.sessionType,
			this._register(new AgentHostResponseFileChangesProvider(
				config.connection,
				config.connectionAuthority,
				sessionResource => this._resolveSessionUri(sessionResource),
				sessionResource => {
					const chatURI = this._chatURIsBySessionResource.get(sessionResource);
					return chatURI ? URI.parse(chatURI) : undefined;
				},
			)),
		));

		this._registerAgent();
	}

	/**
	 * Resolves the signed-in user's plan context for chat error formatting.
	 * The agent host does not know the user's plan, so quota/rate-limit
	 * messages are personalized here from `IChatEntitlementService`.
	 */
	private _chatErrorContext(): IChatErrorContext {
		const quotas = this._chatEntitlementService.quotas;
		return {
			copilotPlan: getCopilotPlanFromEntitlement(this._chatEntitlementService.entitlement),
			isUsageBasedBilling: quotas.usageBasedBilling,
			quotaResetDate: quotas.resetDate,
		};
	}

	async provideChatInputCompletions(sessionResource: URI, params: IChatInputCompletionsParams, token: CancellationToken): Promise<IChatInputCompletionsResult | undefined> {
		let backendSession: URI;
		if (isUntitledChatSession(sessionResource)) {
			// Provisional URIs are opaque; wait for the current generation instead of deriving one.
			const provisionalSession = await raceCancellation(this._provisionalService.waitForPending(sessionResource), token);
			if (token.isCancellationRequested) {
				return undefined;
			}
			if (!provisionalSession) {
				return undefined;
			}
			backendSession = provisionalSession;
		} else {
			backendSession = this._resolveSessionUri(sessionResource);
		}
		// Note: we don't forward `token` across IPC \u2014 cancellation tokens
		// don't round-trip through the proxy channel today. The post-await
		// `isCancellationRequested` check below is enough to drop a stale
		// result if the user kept typing while the request was in flight.
		const result = await this._config.connection.completions({
			kind: AhpCompletionItemKind.UserMessage,
			channel: backendSession.toString(),
			text: params.text,
			offset: params.offset,
		});
		if (token.isCancellationRequested) {
			return undefined;
		}
		const items: IChatInputCompletionItem[] = [];
		for (const raw of result.items) {
			const mapped = this._toChatInputCompletionItem(raw, params.text);
			if (mapped) {
				items.push(mapped);
			}
		}
		return { items };
	}

	provideChatInputCompletionTriggerCharacters(): Promise<readonly string[]> {
		return this._config.connection.getCompletionTriggerCharacters();
	}

	private _createCompletionItem(raw: AhpCompletionItem, text: string, attachment: IChatInputCompletionItem['attachment'], label?: string): IChatInputCompletionItem {
		const item: Mutable<IChatInputCompletionItem> = {
			insertText: raw.insertText,
			attachment
		};
		if (label !== undefined) {
			item.label = label;
		}
		if (raw.rangeStart !== undefined) {
			item.start = offsetToPosition(text, raw.rangeStart);
		}
		if (raw.rangeEnd !== undefined) {
			item.end = offsetToPosition(text, raw.rangeEnd);
		}
		return item;
	}

	private _toChatInputCompletionItem(raw: AhpCompletionItem, text: string): IChatInputCompletionItem | undefined {
		const attachment = raw.attachment;
		switch (attachment.type) {
			case MessageAttachmentKind.Simple: {
				const completionMeta = readCompletionAttachmentMeta(attachment);
				if (completionMeta?.kind === 'command') {
					return this._createCompletionItem(raw, text, {
						kind: 'command',
						command: completionMeta.command,
						description: completionMeta.description ?? '',
						...(attachment._meta !== undefined && { _meta: attachment._meta }),
					}, attachment.label !== raw.insertText ? attachment.label : undefined);
				}
				if (completionMeta?.kind === 'skill') {
					return this._createCompletionItem(raw, text, {
						kind: 'skill',
						uri: URI.parse(completionMeta.uri),
						...(completionMeta.displayName !== undefined ? { displayName: completionMeta.displayName } : {}),
						...(completionMeta.description !== undefined ? { description: completionMeta.description } : {}),
						...(attachment._meta !== undefined && { _meta: attachment._meta }),
					});
				}
				return undefined;
			}
			case MessageAttachmentKind.Resource: {
				const uri = typeof attachment.uri === 'string' ? URI.parse(attachment.uri) : URI.from(attachment.uri);
				return this._createCompletionItem(raw, text, {
					kind: 'resource',
					uri,
					displayName: attachment.label,
					isDirectory: attachment.displayKind === 'directory',
					...(attachment._meta !== undefined && { _meta: attachment._meta }),
				});
			}
			case MessageAttachmentKind.Chat: {
				return this._createCompletionItem(raw, text, {
					kind: 'chat',
					uri: URI.parse(attachment.resource),
					endTurn: attachment.endTurn,
					title: attachment.label,
					displayName: attachment.label,
					...(attachment._meta !== undefined && { _meta: attachment._meta }),
				});
			}
			default:
				// Embedded resources will be added when the workbench grows first-class support for them.
				return undefined; // unknown attachment type
		}
	}

	updateChatSessionMetadata(sessionResource: URI, metadata: Record<string, unknown>): void {
		const backendSession = this._resolveSessionUri(sessionResource);
		const state = this._getSessionState(backendSession.toString());
		if (state) {
			this._config.connection.dispatch(backendSession.toString(), {
				type: ActionType.SessionMetaChanged,
				_meta: { ...state._meta, ...metadata },
			});
			return;
		}

		this._provisionalService.setSessionCreationMetadata(sessionResource, {
			...(this._provisionalService.getInitialSessionMetadata(sessionResource) ?? {}),
			...metadata,
		});
	}

	async provideChatSessionContent(sessionResource: URI, token: CancellationToken): Promise<IChatSession> {
		if (sessionResource.path.substring(1).startsWith('untitled-')) {
			throw new Error(`Agent host chat sessions must be created by the sessions provider: ${sessionResource.toString()}`);
		}

		// For new sessions, defer backend session creation until the first request
		// arrives so the user-selected model is available. The chat resource still
		// carries the raw session id that will be used when createSession runs.
		const resolvedSession = this._resolveSessionUri(sessionResource);
		let chatURI: string | undefined;

		// The point of this is to check with the session provider or controller
		// whether this session resource represents a new session that hasn't yet
		// been created on the backend.
		const isNewSession = this._isNewSessionResource(sessionResource);
		this._logService.trace(`[AgentHost] provideChatSessionContent start: ${resolvedSession.toString()} (isNewSession=${isNewSession})`);
		const history: IChatSessionHistoryItem[] = [];
		let initialProgress: IChatProgress[] | undefined;
		let initialResponsePartCount = 0;
		let activeTurnId: string | undefined;
		let chatTitle: string | undefined;
		let draftInputState: ISerializableChatModelInputState | undefined;
		let sessionSubscription: IAgentSubscription<SessionState> | undefined;
		let chatSubscription: IAgentSubscription<ChatState> | undefined;
		const historySubagentObservations = new DisposableStore();
		// Mark this session as hydrating so that a sibling chat of the same
		// session closing while we await our subscriptions does not tear down
		// the shared session subscription (which would strand us forever).
		const hydrationKey = resolvedSession.toString();
		// Existing sessions need hydrated state before their customization scope can be resolved.
		if (isNewSession) {
			this._ensureActiveClientEntry(sessionResource);
		}
		this._hydratingChatSessions.set(hydrationKey, (this._hydratingChatSessions.get(hydrationKey) ?? 0) + 1);
		try {
			if (!isNewSession) {
				try {
					const sub = this._ensureSessionSubscription(resolvedSession.toString());
					sessionSubscription = sub;
					// Wait for both the session summary and its default-chat
					// conversation state to hydrate from the server. After the
					// multi-chat protocol adoption, turns/activeTurn live on the
					// separate chat channel, so reading them before the chat
					// subscription lands would yield an empty history.
					await this._whenSubscriptionHydrated(sub, token);
					// A failed subscription surfaces as an `Error` value; rethrow it
					// so the real reason (e.g. the working directory no longer
					// exists) is logged and rendered instead of a generic message.
					if (sub.value instanceof Error) {
						throw sub.value;
					}
					this._logService.trace(`[AgentHost] provideChatSessionContent: session state hydrated for ${resolvedSession.toString()}`);
					const rawState = this._getRawSessionState(resolvedSession.toString());
					if (!rawState) {
						throw new Error(`Session state did not hydrate for ${resolvedSession.toString()}`);
					}
					chatURI = this._resolveChatUriFromState(sessionResource, rawState);
					this._setChatURI(sessionResource, chatURI);
					const chatSub = this._ensureChatSubscription(resolvedSession.toString(), chatURI);
					chatSubscription = chatSub;
					await this._whenSubscriptionHydrated(chatSub, token);
					this._logService.trace(`[AgentHost] provideChatSessionContent: chat state hydrated for ${chatURI}`);
					const sessionState = this._getSessionState(resolvedSession.toString(), chatURI);
					if (sessionState) {
						chatTitle = getChatTitle(sessionState, chatURI);
						const draft = sessionState.draft ?? emptyDraftFromLastTurn(sessionState);
						draftInputState = this._draftToInputState(sessionResource, draft);
						if (!sessionState.draft && draft) {
							this._config.connection.dispatch(chatURI, { type: ActionType.ChatDraftChanged, draft });
						}
						const fallbackRawModelId = lastTurnModelSelection(sessionState)?.id;
						const lookup = this._createTurnModelLookup(sessionResource, fallbackRawModelId);
						history.push(...turnsToHistory(
							resolvedSession,
							sessionState.turns,
							this._config.agentId,
							this._config.connectionAuthority,
							lookup,
							this._chatErrorContext(),
							this._config.connection.initializeResult.get()?.terminalCommandPrefix,
							this._config.connection.resourceUris,
						));
						this._logService.trace(`[AgentHost] provideChatSessionContent: converted ${sessionState.turns.length} turn(s) into ${history.length} history item(s) for ${resolvedSession.toString()}`);

						// Enrich history with inner tool calls from subagent
						// child sessions. Subscribes to each child session so
						// its tool calls appear grouped under the parent widget.
						await this._enrichHistoryWithSubagentCalls(history, resolvedSession, sessionResource, sessionState, historySubagentObservations);
						this._logService.trace(`[AgentHost] provideChatSessionContent: subagent enrichment done for ${resolvedSession.toString()}`);

						// Store historical turns so the editing session can seed a
						// request-level checkpoint for each turn (with file edits
						// folded in) when the controller is created lazily. We seed
						// for every turn — not just those with edits — so "Restore
						// Checkpoint" on any historical request can find a boundary
						// to navigate to.
						if (sessionState.turns.length > 0) {
							this._pendingHistoryTurns.set(sessionResource, sessionState.turns);
						}

						// If there's an active turn, include its request in history
						// with an empty response so the chat service creates a
						// pending request, then provide accumulated progress via
						// progressObs for live streaming.
						if (sessionState.activeTurn) {
							activeTurnId = sessionState.activeTurn.id;
							const activeRawModelId = sessionState.activeTurn.usage?.model ?? fallbackRawModelId;
							history.push({
								id: sessionState.activeTurn.id,
								type: 'request',
								prompt: sessionState.activeTurn.message.text,
								participant: this._config.agentId,
								modelId: lookup.toLanguageModelId(activeRawModelId),
								timestamp: parseTimestamp(sessionState.activeTurn.startedAt),
								variableData: messageToVariableData(sessionState.activeTurn.message, this._config.connectionAuthority),
								isSystemInitiated: sessionState.activeTurn.message.origin.kind === MessageKind.SystemNotification,
								origin: messageToRequestOrigin(resolvedSession, sessionState.activeTurn.message, this._config.agentId),
							});
							history.push({
								type: 'response',
								parts: [],
								participant: this._config.agentId,
								details: lookup.toResponseDetails(activeRawModelId, sessionState.activeTurn.usage),
							});
							initialProgress = activeTurnToProgress(
								resolvedSession,
								sessionState.activeTurn,
								this._config.connectionAuthority,
								sessionResource.authority,
								this._otherClientToolInvocationOptions(resolvedSession, chatURI, sessionState.activeTurn.id),
								lookup,
								this._config.connection.resourceUris,
							);
							initialResponsePartCount = sessionState.activeTurn.responseParts.length;
							// Enrich usage entries with the actual model so the
							// context-usage widget resolves the right context window
							// on reconnection (same enrichment as _observeTurn).
							const actualModelId = this._toLanguageModelId(sessionResource, sessionState.activeTurn.usage?.model);
							if (actualModelId) {
								for (const p of initialProgress) {
									if (p.kind === 'usage') {
										p.actualModelId = actualModelId;
									}
								}
							}
							this._logService.info(`[AgentHost] Reconnecting to active turn ${activeTurnId} for session ${resolvedSession.toString()}`);
						}
					}
				} catch (err) {
					this._logService.warn(`[AgentHost] Failed to subscribe to existing session: ${resolvedSession.toString()}`, err);
					// Surface a hard load failure as a visible chat error instead of
					// a silently empty session. Only when nothing else rendered, so a
					// partially-hydrated history isn't clobbered. A bare response is
					// dropped without a preceding request, so anchor it with a
					// system-initiated request (renders as a compact notice, not a
					// user bubble) and attach the error to its response. Prefer the
					// underlying error message (e.g. the git worktree-recreation
					// failure) so the user sees the actual cause, falling back to a
					// generic message.
					if (history.length === 0) {
						history.push({
							type: 'request',
							prompt: '',
							participant: this._config.agentId,
							isSystemInitiated: true,
							systemInitiatedLabel: localize('agentHost.sessionLoadFailedLabel', "Couldn't open session"),
						});
						history.push({
							type: 'response',
							parts: [],
							participant: this._config.agentId,
							errorDetails: { message: unwrapSessionLoadErrorMessage(err) ?? localize('agentHost.sessionLoadFailed', "This session couldn't be loaded.") },
						});
					}
				}
			}
		} finally {
			const remaining = (this._hydratingChatSessions.get(hydrationKey) ?? 1) - 1;
			if (remaining > 0) {
				this._hydratingChatSessions.set(hydrationKey, remaining);
			} else {
				this._hydratingChatSessions.delete(hydrationKey);
			}
		}
		let session: AgentHostChatSession;
		try {
			session = this._instantiationService.createInstance(
				AgentHostChatSession,
				sessionResource,
				history,
				chatTitle,
				sessionSubscription,
				chatSubscription,
				this._config.promptCacheNotification,
				(request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => {
					if (!this._getSessionState(resolvedSession.toString())) {
						throw new Error('Cannot fork session before the initial request');
					}

					return this._forkSession(sessionResource, resolvedSession, request, token);
				},
				(title: string, _token: CancellationToken) => {
					this._config.connection.dispatch(this._getRenameChatURI(sessionResource, resolvedSession), {
						type: ActionType.SessionTitleChanged,
						title,
					});
					return Promise.resolve();
				},
				draftInputState,
				initialProgress,
				historySubagentObservations,
				() => {
					this._activeSessions.delete(sessionResource);
					this._disposeActiveClientEntry(sessionResource);
					this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
					this._draftSyncSubscriptions.deleteAndDispose(sessionResource);
					this._serverTurnWatchers.deleteAndDispose(sessionResource);
					this._mcpAuthWatchers.deleteAndDispose(sessionResource);
					this._releaseSessionInputNeeded(sessionResource);
					this._pendingHistoryTurns.delete(sessionResource);
					this._surfacedMcpAuthServers.delete(sessionResource);
					const chatURI = this._chatURIsBySessionResource.get(sessionResource);
					this._chatURIsBySessionResource.delete(sessionResource);
					if (chatURI) {
						this._releaseChatSessionSubscriptions(resolvedSession.toString(), chatURI);
					}
				},
				() => {
					const sessionKey = resolvedSession.toString();
					const chatURI = this._chatURIsBySessionResource.get(sessionResource);
					if (!chatURI) {
						return true;
					}
					const turnId = this._getSessionState(sessionKey, chatURI)?.activeTurn?.id;
					if (!turnId) {
						// No active turn (likely a race with completion). Noop-success.
						return true;
					}
					this._logService.info(`[AgentHost] Cancellation requested for ${sessionKey}, dispatching turnCancelled`);
					this._config.connection.dispatch(chatURI, {
						type: ActionType.ChatTurnCancelled,
						turnId,
						duration: this._turnDuration(chatURI, turnId),
					});
					return true;
				},
			);
		} catch (err) {
			historySubagentObservations.dispose();
			this._disposeActiveClientEntry(sessionResource);
			throw err;
		}
		this._activeSessions.set(sessionResource, session);
		this._configureActiveClientReconciliation(sessionResource, resolvedSession, sessionSubscription);

		if (!isNewSession) {
			// Only wire up pending-message/draft sync once the chat URI has been
			// resolved. When hydration failed (see the catch above), `chatURI`
			// stays undefined; subscribing anyway would later invoke
			// `_syncPendingMessages`, whose `_getChatURI` lookup throws because no
			// mapping was ever stored for this session resource.
			if (chatURI !== undefined) {
				this._ensurePendingMessageSubscription(sessionResource, resolvedSession);
				this._ensureDraftSyncSubscription(sessionResource, resolvedSession, chatURI);
			}

			// Eagerly create the snapshot controller once the ChatModel for
			// this session is available so that "Restore Checkpoint" works
			// on historical turns. The model may already exist (in which
			// case we run synchronously) or it may be created shortly after
			// this code runs — we keep the listener alive until our session
			// matches, since `Event.once` would be consumed by an unrelated
			// model created first.
			if (this._pendingHistoryTurns.has(sessionResource)) {
				if (this._chatService.getSession(sessionResource)) {
					this._ensureSnapshotController(sessionResource);
				} else {
					const sub = this._chatService.onDidCreateModel(model => {
						if (isEqual(model.sessionResource, sessionResource)) {
							sub.dispose();
							this._ensureSnapshotController(sessionResource);
						}
					});
					session.registerDisposable(sub);
				}
			}

			// If reconnecting to an active turn, wire up an ongoing state listener
			// to stream new progress into the session's progressObs.
			if (activeTurnId && initialProgress !== undefined) {
				this._reconnectToActiveTurn(resolvedSession, activeTurnId, session, initialProgress, initialResponsePartCount);
			}

			// For existing sessions, start watching for server-initiated turns
			// immediately. For new sessions, this is deferred to _createAndSubscribe.
			if (chatURI !== undefined) {
				this._watchForServerInitiatedTurns(resolvedSession, sessionResource);
			}
		}

		this._logService.trace(`[AgentHost] provideChatSessionContent done: ${resolvedSession.toString()} with ${history.length} history item(s)`);
		return session;
	}

	// ---- Agent registration -------------------------------------------------

	private _registerAgent(): void {
		const agentData: IChatAgentData = {
			id: this._config.agentId,
			name: this._config.agentId,
			fullName: this._config.fullName,
			description: this._config.description,
			extensionId: new ExtensionIdentifier(this._config.extensionId ?? 'vscode.agent-host'),
			extensionVersion: undefined,
			extensionPublisherId: 'vscode',
			extensionDisplayName: this._config.extensionDisplayName ?? 'Agent Host',
			isDefault: false,
			isDynamic: true,
			isCore: true,
			metadata: { themeIcon: getAgentSessionProviderIcon(this._config.sessionType) },
			slashCommands: [],
			locations: [ChatAgentLocation.Chat],
			modes: [ChatModeKind.Agent],
			disambiguation: [],
		};

		const agentImpl: IChatAgentImplementation = {
			invoke: async (request, progress, _history, cancellationToken) => {
				return this._invokeAgent(request, progress, cancellationToken);
			},
		};

		this._register(this._chatAgentService.registerDynamicAgent(agentData, agentImpl));
	}

	private async _invokeAgent(
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		cancellationToken: CancellationToken,
	): Promise<IChatAgentResult> {
		this._logService.info(`[AgentHost] _invokeAgent called for resource: ${request.sessionResource.toString()}`);

		// Gate spawning an agent on workspace trust. Viewing chat and the
		// agent list does not require trust, but sending a message does, since
		// the agent reads files, runs commands, and makes changes in the
		// session's folders. Mirrors how extension-host chat is gated. Verify
		// every local folder the session will run in — an existing session's
		// persisted working directories, or a new session's requested ones — so
		// resuming a session whose folder is no longer trusted re-prompts instead
		// of running untrusted. A workspace-less session (quick chat) resolves to
		// `undefined` and skips the gate entirely: its only cwd is an internal
		// scratch dir, not a user workspace. If the user declines, abort without
		// starting a session.
		const trustFolders = await this._resolveSessionTrustFolders(request.sessionResource, cancellationToken);
		if (cancellationToken.isCancellationRequested) {
			return {};
		}
		if (trustFolders !== undefined && !await this._ensureFoldersTrusted(trustFolders)) {
			return {};
		}
		if (cancellationToken.isCancellationRequested) {
			return {};
		}

		// A "Continue in…" migration from a local chat seeds the whole imported
		// conversation eagerly (CLI spawn, seeding turns) before any turn progress
		// streams, leaving the widget transiently empty. Only for that migration
		// case show a shimmering status if the turn is slow to start, cancelled as
		// soon as real progress streams. Normal agent-host sessions — whose first
		// turn is also slow to spawn — never flash it.
		const preparingStatus = new MutableDisposable();
		let failureStage: AgentHostInvocationFailureStage = 'resolveSession';

		try {
			failureStage = 'provisionalSession';
			// The chat-input picker may have pre-created a provisional session
			// against this resource (`IAgentHostUntitledProvisionalSessionService.getOrCreate`).
			// In that case the agent already has the session + the user's chip
			// selections in `state.config.values`; ensure we hold a refcounted
			// subscription on it so the rest of the handler observes those.
			await raceCancellation(this._provisionalService.waitForPending(request.sessionResource), cancellationToken);
			if (cancellationToken.isCancellationRequested) {
				return {};
			}
			const resolvedSession = this._resolveSessionUri(request.sessionResource);
			const sessionKey = resolvedSession.toString();
			const provisionalBackend = this._provisionalService.get(request.sessionResource);
			if (provisionalBackend) {
				this._ensureSessionSubscription(sessionKey);
			}

			failureStage = 'sessionState';
			// The sessions provider may have eagerly created this session at
			// folder-pick time and is holding the connection-level subscription
			// open with hydrated state. Use the unmanaged accessor to peek
			// without taking a fresh subscription, which would trigger a
			// duplicate snapshot fetch and (in tests) unrelated mock behaviour.
			const existingState = await this._readEagerlyCreatedSessionState(resolvedSession, cancellationToken);
			if (cancellationToken.isCancellationRequested) {
				return {};
			}

			if (!existingState) {
				// Eager-create did not produce server-side state (e.g. no
				// sessions provider involved, agent host not connected at
				// folder-pick time, or this session was created via a legacy/
				// test path). Fall back to the original create-then-subscribe
				// flow.
				//
				// If a conversation was imported ("Continue in…") into this
				// session, seed it as real editable history at creation time.
				const imported = this._importConversationStore.take(request.sessionResource);
				if (imported) {
					// Migration case: materializing the imported conversation is the
					// slow, visually-blank phase — arm the "Preparing session…" status.
					preparingStatus.value = disposableTimeout(() => {
						progress([{ kind: 'progressMessage', content: new MarkdownString(localize('agentHost.preparingSession', "Preparing session…")), shimmer: true }]);
					}, 500);
				}
				const model = imported?.model ?? this._createModelSelection(request.userSelectedModelId, request.modelConfiguration);
				const initialConfig = {
					...this._provisionalService.getInitialSessionConfig(),
					...request.agentHostSessionConfig,
				};
				await this._createAndSubscribe(
					request.sessionResource,
					model,
					Object.keys(initialConfig).length > 0 ? initialConfig : undefined,
					imported ? { turns: imported.turns, model: imported.model } : undefined,
					stage => failureStage = stage,
				);
			} else {
				failureStage = 'authentication';
				await this._ensureRequiredAuthentication(this._createModelSelection(request.userSelectedModelId, request.modelConfiguration));

				failureStage = 'subscribeSession';
				// Eager-created session: take a refcounted subscription so the
				// handler observes state changes for the duration of the chat
				// session, then wire up the per-turn machinery that
				// `_createAndSubscribe` would normally set up.
				const sessionSub = this._ensureSessionSubscription(sessionKey);
				const chatURI = this._resolveChatUriFromState(request.sessionResource, existingState);
				this._setChatURI(request.sessionResource, chatURI);
				const chatSub = this._ensureChatSubscription(sessionKey, chatURI);
				this._activeSessions.get(request.sessionResource)?.setStateSubscriptions(sessionSub, chatSub);
				this._ensurePendingMessageSubscription(request.sessionResource, resolvedSession);
				this._watchForServerInitiatedTurns(resolvedSession, request.sessionResource);

				// In the Agents window, the sessions provider supplies per-request
				// config via `request.agentHostSessionConfig` (e.g. the user's
				// permission level). Push it to the agent so its provisional record
				// materializes with those values. Workbench defaults (`isolation`,
				// `autoApprove`) are seeded upstream at provisional `createSession`
				// time, so we don't need to merge them here. Picker selections
				// already live in `existingState.config?.values` and don't need to
				// be re-dispatched.
				if (request.agentHostSessionConfig && Object.keys(request.agentHostSessionConfig).length > 0) {
					this._dispatchAction(resolvedSession, {
						type: ActionType.SessionConfigChanged,
						config: request.agentHostSessionConfig,
					});
				}
			}

			// Measure turn timings so the core `interactiveSessionProviderInvoked`
			// telemetry event is populated for agent-host providers.
			const stopWatch = StopWatch.create(false);
			let firstProgress: number | undefined;
			const measuredProgress = (parts: IChatProgress[]) => {
				// Real progress has started — cancel the pending "preparing" status.
				preparingStatus.clear();
				if (firstProgress === undefined && parts.some(isFirstVisibleProgressPart)) {
					firstProgress = stopWatch.elapsed();
				}
				progress(parts);
			};

			failureStage = 'prepareTurn';
			const completedTurn = await this._handleTurn(resolvedSession, request, measuredProgress, cancellationToken, stage => failureStage = stage);
			const details = this._getTurnResponseDetails(request.sessionResource, resolvedSession, completedTurn);
			const errorDetails = this._getTurnErrorDetails(completedTurn);

			return {
				timings: { firstProgress, totalElapsed: stopWatch.elapsed() },
				...(details ? { details } : {}),
				...(errorDetails ? { errorDetails } : {}),
			};
		} catch (error) {
			if (!isCancellationError(error)) {
				this._reportInvocationFailure(request, failureStage, error);
			}
			throw error;
		} finally {
			// Always cancel the pending "preparing" status — including when an
			// await above (state read, create/subscribe, turn handling) rejects —
			// so a stale status can never fire after the invocation has ended.
			preparingStatus.dispose();
		}
	}

	private _reportInvocationFailure(request: IChatAgentRequest, failureStage: AgentHostInvocationFailureStage, error: unknown): void {
		const packed = packErrorForTelemetry(error);
		const requests = this._chatService.getSession(request.sessionResource)?.getRequests();
		this._telemetryService.publicLogError2<AgentHostInvocationFailedEvent, AgentHostInvocationFailedClassification>('agentHost.invocationFailed', {
			requestId: request.requestId,
			provider: this._config.provider,
			failureStage,
			isFirstRequest: requests?.[0]?.id === request.requestId,
			hasUserSelectedModel: request.userSelectedModelId !== undefined,
			errorName: error instanceof Error ? error.name : typeof error,
			errorCode: getErrorCode(error),
			msg: packed.msg,
			callstack: packed.callstack,
		});
	}

	/**
	 * Builds the {@link IChatResponseErrorDetails} for a failed turn so the
	 * chat response renders a proper error (and, for quota errors, the upgrade
	 * affordance via `ChatQuotaExceededPart`). Returns `undefined` for
	 * non-error turns. Falls back to the raw error when no structured chat
	 * error was forwarded in `_meta`.
	 */
	private _getTurnErrorDetails(turn: Turn | undefined): IChatResponseErrorDetails | undefined {
		if (turn?.state !== TurnState.Error || !turn.error) {
			return undefined;
		}
		return getChatErrorDetailsFromMeta(turn.error, this._chatErrorContext())
			?? { message: localize('agentHost.turnError', "Error: ({0}) {1}", turn.error.errorType, turn.error.message) };
	}

	/**
	 * Returns the {@link SessionState} for a session that was eagerly created
	 * at folder-pick time, or `undefined` if no such session exists. Uses the
	 * unmanaged subscription accessor so we don't accidentally open a fresh
	 * subscription (which would issue a duplicate snapshot fetch on the wire,
	 * and in tests would synthesise placeholder state via the mock's auto-
	 * hydration path).
	 *
	 * If the eager subscription exists but hasn't received its first snapshot
	 * yet (creation in flight), waits for it to hydrate or error before
	 * returning. This closes a race where the chat request arrives between
	 * `createSession` resolving and the snapshot landing.
	 */
	private async _readEagerlyCreatedSessionState(resolvedSession: URI, token: CancellationToken): Promise<SessionState | undefined> {
		// If the sessions provider's eager `createSession` is still in flight, wait for it so its IIFE has a chance to
		// open the state subscription before we fall through to a duplicate `_createAndSubscribe` below. Both we and
		// the IIFE await the same promise object, so microtask FIFO runs the IIFE's continuation first (it registered
		// back in `_startNewSessionBackend`) — it opens the subscription, then we observe it (issue #319764).
		const inflight = this._config.connection.getInflightSessionCreate?.(resolvedSession);
		if (inflight) {
			try {
				await inflight;
			} catch {
				// Swallow — `getSubscriptionUnmanaged` returns undefined for a failed create, matching fall-through.
			}
			if (token.isCancellationRequested) {
				return undefined;
			}
		}

		const sub = this._config.connection.getSubscriptionUnmanaged(StateComponents.Session, resolvedSession);
		if (!sub) {
			return undefined;
		}
		if (sub.value !== undefined) {
			return sub.value instanceof Error ? undefined : sub.value;
		}

		// Snapshot is in flight. Pin the subscription with a fresh
		// refcount for the duration of the await so the eager holder
		// releasing concurrently can't tear down the underlying emitter
		// (which would leave `onDidChange` silent and hang the await).
		const pinRef = this._config.connection.getSubscription(StateComponents.Session, resolvedSession, 'AgentHostSessionHandler');
		try {
			// Settle on snapshot, error, or cancellation. Listening for the
			// error transition is essential: a failed subscribe flips the
			// subscription via `setError`, which fires `onDidError` but NOT
			// `onDidChange`, so an `onDidChange`-only wait would hang for the
			// full turn timeout (issue #5242).
			await this._whenSubscriptionHydrated(pinRef.object, token);
			const value = pinRef.object.value;
			this._logService.info(`[AgentHost] _readEagerlyCreatedSessionState: hydrated value=${value === undefined ? 'undefined' : value instanceof Error ? `error(${value.message})` : 'state'} cancelled=${token.isCancellationRequested} for ${resolvedSession.toString()}`);
			return value instanceof Error ? undefined : value;
		} finally {
			pinRef.dispose();
		}
	}

	// ---- Pending message sync -----------------------------------------------

	/**
	 * Diffs the chat model's pending requests against the protocol state in
	 * `_clientState` and dispatches Set/Removed/Reordered actions as needed.
	 */
	private _syncPendingMessages(sessionResource: URI, backendSession: URI): void {
		if (this._remotePendingMessageProjections.has(sessionResource)) {
			return;
		}
		const chatModel = this._chatService.getSession(sessionResource);
		if (!chatModel) {
			return;
		}
		const session = backendSession.toString();
		const chatURI = this._getChatURI(sessionResource);
		const pending = chatModel.getPendingRequests();
		const protocolState = this._getSessionState(session, chatURI);
		const prevSteering = protocolState?.steeringMessage;
		const prevQueued = protocolState?.queuedMessages ?? [];

		// Compute current state from chat model
		interface IPendingSnapshot { id: string; message: Message }
		let currentSteering: IPendingSnapshot | undefined;
		const currentQueued: IPendingSnapshot[] = [];
		for (const p of pending) {
			const variables = p.request.variableData?.variables ?? [];
			const messageAttachments = this._variableEntriesToAttachments(variables, sessionResource, p.request.message.text);
			const attachments = messageAttachments.length > 0 ? messageAttachments : undefined;
			const snapshot: IPendingSnapshot = { id: p.request.id, message: userOriginMessage(p.request.message.text, attachments) };
			if (p.kind === ChatRequestQueueKind.Steering) {
				currentSteering = snapshot;
			} else {
				currentQueued.push(snapshot);
			}
		}

		// --- Steering ---
		if (currentSteering) {
			if (currentSteering.id !== prevSteering?.id || !equals(currentSteering.message, prevSteering.message)) {
				this._dispatchAction(backendSession, {
					type: ActionType.ChatPendingMessageSet,
					kind: PendingMessageKind.Steering,
					id: currentSteering.id,
					message: currentSteering.message,
				}, chatURI);
			}
		} else if (prevSteering) {
			this._dispatchAction(backendSession, {
				type: ActionType.ChatPendingMessageRemoved,
				kind: PendingMessageKind.Steering,
				id: prevSteering.id,
			}, chatURI);
		}

		// --- Queued: removals ---
		const currentQueuedIds = new Set(currentQueued.map(q => q.id));
		for (const prev of prevQueued) {
			if (!currentQueuedIds.has(prev.id)) {
				this._dispatchAction(backendSession, {
					type: ActionType.ChatPendingMessageRemoved,
					kind: PendingMessageKind.Queued,
					id: prev.id,
				}, chatURI);
			}
		}

		// --- Queued: additions ---
		const prevQueuedById = new Map(prevQueued.map(q => [q.id, q]));
		for (const q of currentQueued) {
			const prev = prevQueuedById.get(q.id);
			if (!prev || !equals(q.message, prev.message)) {
				this._dispatchAction(backendSession, {
					type: ActionType.ChatPendingMessageSet,
					kind: PendingMessageKind.Queued,
					id: q.id,
					message: q.message,
				}, chatURI);
			}
		}

		// --- Queued: reordering ---
		// After additions/removals, check if the remaining common items changed order.
		// Re-read protocol state since dispatches above may have mutated it.
		const updatedProtocol = this._getSessionState(session, chatURI);
		const updatedQueued = updatedProtocol?.queuedMessages ?? [];
		if (updatedQueued.length > 1 && currentQueued.length === updatedQueued.length) {
			const needsReorder = currentQueued.some((q, i) => q.id !== updatedQueued[i].id);
			if (needsReorder) {
				this._dispatchAction(backendSession, {
					type: ActionType.ChatQueuedMessagesReordered,
					order: currentQueued.map(q => q.id),
				}, chatURI);
			}
		}
	}

	/**
	 * Projects protocol pending messages into the chat model.
	 * The protocol is authoritative, so matching local state is a no-op.
	 */
	private _applyRemotePendingMessages(sessionResource: URI, backendSession: URI): void {
		if (!this._chatService.getSession(sessionResource)) {
			return;
		}
		const chatURI = this._chatURIsBySessionResource.get(sessionResource);
		if (!chatURI) {
			return;
		}
		const state = this._getSessionState(backendSession.toString(), chatURI);
		if (!state) {
			return;
		}

		const toRemote = (pending: PendingMessage, kind: ChatRequestQueueKind): IRemotePendingRequest => ({
			id: pending.id,
			kind,
			message: pending.message.text,
			variableData: messageToVariableData(pending.message, this._config.connectionAuthority),
		});

		const remote: IRemotePendingRequest[] = [];
		if (state.steeringMessage) {
			remote.push(toRemote(state.steeringMessage, ChatRequestQueueKind.Steering));
		}
		for (const queued of state.queuedMessages ?? []) {
			remote.push(toRemote(queued, ChatRequestQueueKind.Queued));
		}

		this._remotePendingMessageProjections.add(sessionResource);
		try {
			this._chatService.syncPendingRequestsFromRemote(sessionResource, remote);
		} finally {
			this._remotePendingMessageProjections.delete(sessionResource);
		}
	}

	private _dispatchAction(channel: URI, action: ClientSessionAction | ClientChatAction, chatURI?: string): void {
		const target = isChatAction(action)
			? this._requireChatURI(chatURI, action.type)
			: channel.toString();
		this._config.connection.dispatch(target, action);
	}

	private _requireChatURI(chatURI: string | undefined, actionType: string): string {
		if (!chatURI) {
			throw new Error(`Cannot dispatch ${actionType} without a resolved AHP chat channel`);
		}
		return chatURI;
	}

	private _resolveChatUriFromState(sessionResource: URI, state: SessionState): string {
		if (sessionResource.fragment) {
			const explicitChatUri = new URLSearchParams(sessionResource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
			if (explicitChatUri) {
				const parsed = parseChatUri(explicitChatUri);
				if (!parsed || parsed.chatId !== sessionResource.fragment) {
					throw new Error(`Subagent chat URI does not match editor chat '${sessionResource.fragment}'`);
				}
				const owningSession = URI.parse(parsed.session);
				const expectedSession = this._resolveSessionUri(sessionResource);
				if (!isEqual(owningSession, expectedSession)) {
					throw new Error(`Subagent chat belongs to ${owningSession.toString()}, expected ${expectedSession.toString()}`);
				}
				return explicitChatUri;
			}
			const match = state.chats.find(summary => parseChatUri(summary.resource)?.chatId === sessionResource.fragment);
			if (!match) {
				throw new Error(`Cannot resolve chat '${sessionResource.fragment}' from session state for ${sessionResource.toString()}`);
			}
			return match.resource.toString();
		}
		if (!state.defaultChat) {
			throw new Error(`Session ${sessionResource.toString()} has no default chat`);
		}
		return state.defaultChat.toString();
	}

	private _setChatURI(sessionResource: URI, chatURI: string): void {
		this._chatURIsBySessionResource.set(sessionResource, chatURI);
	}

	private _getChatURI(sessionResource: URI): string {
		const chatURI = this._chatURIsBySessionResource.get(sessionResource);
		if (!chatURI) {
			throw new Error(`No AHP chat URI mapped for ${sessionResource.toString()}`);
		}
		return chatURI;
	}

	private _getRenameChatURI(sessionResource: URI, session: URI): string {
		const mapped = this._chatURIsBySessionResource.get(sessionResource);
		if (mapped) {
			return mapped;
		}
		if (!sessionResource.fragment) {
			return buildDefaultChatUri(session);
		}
		const explicitChat = new URLSearchParams(sessionResource.query).get(CHAT_SUBAGENT_RESOURCE_QUERY_PARAM);
		return explicitChat ?? buildChatUri(session, sessionResource.fragment);
	}

	private _getCurrentActiveClient(sessionResource: URI): SessionActiveClient {
		const entry = this._activeClientEntries.get(sessionResource);
		if (entry) {
			return entry.getActiveClient();
		}

		return {
			clientId: this._config.connection.clientId,
			tools: [],
			customizations: [],
		};
	}

	private _ensureActiveClient(sessionResource: URI, backendSession: URI): ActiveClientEntry | undefined {
		const entry = this._ensureActiveClientEntry(sessionResource);
		if (!entry) {
			return undefined;
		}
		entry.claim(backendSession);
		return entry;
	}

	private _ensureActiveClientEntry(sessionResource: URI): ActiveClientEntry | undefined {
		const existing = this._activeClientEntries.get(sessionResource);
		if (existing) {
			return existing;
		}

		const scope = this._activeClientService.acquireScope(this._config.sessionType, this._resolveCustomizationScopeRoots(sessionResource));
		if (!scope) {
			return undefined;
		}

		const entry = new ActiveClientEntry(
			scope,
			this._config.connection.clientId,
			AgentHostSessionHandler.ACTIVE_CLIENT_RECONCILIATION_DEBOUNCE_MS,
			backendSession => this._getSessionState(backendSession.toString()),
			(backendSession, action) => this._dispatchAction(backendSession, action),
		);
		this._activeClientEntries.set(sessionResource, entry);
		return entry;
	}

	private _configureActiveClientReconciliation(sessionResource: URI, backendSession: URI, sessionSubscription: IAgentSubscription<SessionState> | undefined): void {
		const entry = this._ensureActiveClientEntry(sessionResource);
		if (!entry) {
			return;
		}
		entry.attach(backendSession, sessionSubscription);
	}

	private _disposeActiveClientEntry(sessionResource: URI): void {
		const entry = this._activeClientEntries.get(sessionResource);
		if (entry) {
			this._activeClientEntries.delete(sessionResource);
			entry.dispose();
		}
	}

	// ---- Server-initiated turn detection ------------------------------------

	/**
	 * Sets up a persistent listener on the session's protocol state that
	 * detects server-initiated turns (e.g. auto-consumed queued messages).
	 * When a new `activeTurn` appears whose `turnId` was NOT dispatched by
	 * this client, it signals the {@link AgentHostChatSession} to create a
	 * new request in the chat model, removes the consumed pending request
	 * if applicable, and pipes turn progress through `progressObs`.
	 */
	private _watchForServerInitiatedTurns(backendSession: URI, sessionResource: URI): void {
		const sessionStr = backendSession.toString();
		const chatURI = this._getChatURI(sessionResource);
		this._watchForMcpAuthentication(backendSession, sessionResource, chatURI);
		this._watchForSessionInputNeeded(backendSession, sessionResource);

		// Seed from the current state so we don't treat any pre-existing active
		// turn (e.g. one being handled by _reconnectToActiveTurn) as new.
		const currentState = this._getSessionState(sessionStr, chatURI);
		let lastSeenTurnId: string | undefined = currentState?.activeTurn?.id;
		let previousQueuedIds: Set<string> | undefined;
		let previousSteeringId: string | undefined = currentState?.steeringMessage?.id;
		let previousTitle: string | undefined = currentState ? getChatTitle(currentState, chatURI) : undefined;

		const disposables = new DisposableStore();

		// MutableDisposable for per-turn progress tracking (replaced each turn)
		const turnProgressDisposable = new MutableDisposable<DisposableStore>();
		disposables.add(turnProgressDisposable);

		const sessionSub = this._ensureSessionSubscription(sessionStr);
		const chatSub = this._ensureChatSubscription(sessionStr, chatURI);
		// Conversation contents live on the chat, while its catalog title and
		// other session-scoped fields live on the session. Re-evaluate on either.
		const onChange = () => {
			const state = this._getSessionState(sessionStr, chatURI);
			if (!state) {
				return;
			}
			const e = { session: sessionStr, state };

			// Track queued message IDs so we can detect which one was consumed
			const currentQueuedIds = new Set((e.state.queuedMessages ?? []).map(m => m.id));
			const currentSteeringId = e.state.steeringMessage?.id;

			// Detect steering message removal or replacement regardless of turn changes
			if (previousSteeringId && previousSteeringId !== currentSteeringId) {
				this._chatService.removePendingRequest(sessionResource, previousSteeringId);
			}
			previousSteeringId = currentSteeringId;

			const currentTitle = getChatTitle(e.state, chatURI);
			if (currentTitle && currentTitle !== previousTitle) {
				this._chatService.setChatSessionTitle(sessionResource, currentTitle);
			}
			previousTitle = currentTitle;

			const activeTurn = e.state.activeTurn;
			if (!activeTurn || activeTurn.id === lastSeenTurnId) {
				previousQueuedIds = currentQueuedIds;
				return;
			}
			lastSeenTurnId = activeTurn.id;

			// If we dispatched this turn, the existing _handleTurn flow handles it
			if (this._clientDispatchedTurnIds.has(activeTurn.id)) {
				previousQueuedIds = currentQueuedIds;
				return;
			}

			const chatSession = this._activeSessions.get(sessionResource);
			if (!chatSession) {
				previousQueuedIds = currentQueuedIds;
				return;
			}

			this._logService.info(`[AgentHost] Server-initiated turn detected: ${activeTurn.id}`);

			// Determine which queued message was consumed by diffing queue state
			if (previousQueuedIds) {
				for (const prevId of previousQueuedIds) {
					if (!currentQueuedIds.has(prevId)) {
						this._chatService.removePendingRequest(sessionResource, prevId);
					}
				}
			}
			previousQueuedIds = currentQueuedIds;

			// Signal the session to create a new request+response pair
			chatSession.startServerRequest(
				activeTurn.id,
				activeTurn.message.text,
				messageToVariableData(activeTurn.message, this._config.connectionAuthority),
				{
					isSystemInitiated: activeTurn.message.origin.kind === MessageKind.SystemNotification,
					isHidden: isMessageHiddenFromTranscript(activeTurn.message),
					timestamp: parseTimestamp(activeTurn.startedAt),
					isTerminalRequest: isTerminalCommandPrompt(activeTurn.message.text, this._config.connection.initializeResult.get()?.terminalCommandPrefix),
					origin: messageToRequestOrigin(backendSession, activeTurn.message, this._config.agentId),
				},
			);

			// Set up turn progress tracking — reuse the same state-to-progress
			// translation as _handleTurn, but pipe output to progressObs/isCompleteObs
			const turnStore = new DisposableStore();
			turnProgressDisposable.value = turnStore;
			this._trackServerTurnProgress(backendSession, activeTurn.id, chatSession, turnStore);
		};
		disposables.add(sessionSub.onDidChange(onChange));
		disposables.add(chatSub.onDidChange(onChange));

		this._serverTurnWatchers.set(sessionResource, disposables);
	}

	private _watchForMcpAuthentication(backendSession: URI, sessionResource: URI, chatURI: string): void {
		const sessionSub = this._ensureSessionSubscription(backendSession.toString());
		let previousServers: readonly IChatMcpAuthenticationRequiredServer[] | undefined;
		const reconcile = () => {
			const servers = getMcpAuthenticationRequiredServers(sessionResource, this._getSessionState(backendSession.toString(), chatURI));
			if (equals(previousServers, servers)) {
				return;
			}
			previousServers = servers;
			void this._filterAutoGrantedMcpAuthentication(sessionResource, servers);
		};
		const disposables = new DisposableStore();
		disposables.add(sessionSub.onDidChange(reconcile));
		reconcile();
		this._mcpAuthWatchers.set(sessionResource, disposables);
	}

	private _watchForSessionInputNeeded(backendSession: URI, sessionResource: URI): void {
		// Record which backend session this resource's reference belongs to so
		// teardown can release it even after provisional state is cleared.
		this._inputNeededWatcherBackends.set(sessionResource, backendSession);

		const sessionKey = backendSession.toString();
		const existing = this._inputNeededWatchers.get(sessionKey);
		if (existing) {
			// Sibling resources against the same backend session share the one
			// watcher: only add a reference so the single session-level queue
			// is not handled — and client tools not executed — more than once.
			existing.refs.add(sessionResource.toString());
			return;
		}

		const sessionSub = this._ensureSessionSubscription(sessionKey);
		const state = observableFromSubscription(this, sessionSub);
		const store = new DisposableStore();
		this._inputNeededWatchers.set(sessionKey, { store, refs: new Set([sessionResource.toString()]) });

		// Requests that we own should be 'invoked' when pending confirmation immediately because
		// we handle showing their UI directly. For simplicity in later tool call flows, rewrite them.
		const requests = derivedOpts({ equalsFn: equals }, reader =>
			(state.read(reader)?.inputNeeded ?? []).map((request): SessionInputRequest => {
				if (request.kind === SessionInputRequestKind.ToolConfirmation
					&& request.toolCall.status === ToolCallStatus.PendingConfirmation
					&& request.toolCall.contributor?.kind === ToolCallContributorKind.Client) {
					return {
						...request,
						kind: SessionInputRequestKind.ToolClientExecution,
						clientId: request.toolCall.contributor.clientId,
					};
				}
				return request;
			})
		);

		const startedClientToolCalls = new Set<string>();
		const clientToolExecutions = new Map<string, { readonly source: CancellationTokenSource; readonly retain: IDisposable; activeAttempts: number }>();
		const releaseClientToolExecution = (key: string, execution: { readonly source: CancellationTokenSource; readonly retain: IDisposable; activeAttempts: number }) => {
			if (clientToolExecutions.get(key) !== execution) {
				return;
			}
			clientToolExecutions.delete(key);
			execution.retain.dispose();
			if (execution.activeAttempts === 0) {
				execution.source.dispose();
			}
		};
		store.add(toDisposable(() => {
			for (const execution of clientToolExecutions.values()) {
				execution.source.dispose(true);
				execution.retain.dispose();
			}
			clientToolExecutions.clear();
		}));

		// This watcher is the single point of truth for how client tools
		// execute. A turn observer only ever renders the shared invocation; it
		// never invokes the tool. Each outstanding blocker is handled here
		// exactly once, keyed by its request id.
		store.add(autorunPerKeyedItem(requests, request => request.id, (_requestId, request$, itemStore) => {
			const initial = request$.get();
			const chatURI = initial.chat.toString();

			if (initial.kind === SessionInputRequestKind.ChatInput) {
				return;
			}
			if (initial.kind !== SessionInputRequestKind.ToolClientExecution || initial.clientId !== this._config.connection.clientId) {
				return;
			}

			const key = this._toolCallKey(chatURI, initial.turnId, initial.toolCall.toolCallId);
			const requestLifecycle = itemStore.add(new MutableDisposable<IDisposable>());
			itemStore.add(this._retainToolCall(key));

			{
				let execution = clientToolExecutions.get(key);
				if (!execution) {
					execution = { source: new CancellationTokenSource(), retain: this._retainToolCall(key), activeAttempts: 0 };
					clientToolExecutions.set(key, execution);
				}
				const targetsConfirmation = initial.toolCall.status === ToolCallStatus.PendingConfirmation;
				requestLifecycle.value = toDisposable(() => {
					const state = this._clientToolInvocations.get(key)?.state.get();
					const targetsState = state?.type === IChatToolInvocation.StateKind.Streaming
						|| state?.type === (targetsConfirmation
							? IChatToolInvocation.StateKind.WaitingForConfirmation
							: IChatToolInvocation.StateKind.Executing)
						|| (execution.activeAttempts > 0
							&& (state?.type === IChatToolInvocation.StateKind.Cancelled
								|| state?.type === IChatToolInvocation.StateKind.Completed));
					if (targetsState) {
						execution.source.cancel();
					}
					if (!targetsConfirmation || state?.type !== IChatToolInvocation.StateKind.Executing) {
						releaseClientToolExecution(key, execution);
					}
				});
				let generation = 0;
				let observedRequest: SessionToolClientExecutionRequest | undefined;
				let startedRequest: SessionToolClientExecutionRequest | undefined;
				let invocationStarted = false;
				const unobservedTimer = itemStore.add(new MutableDisposable<IDisposable>());
				itemStore.add(autorun(reader => {
					const request = request$.read(reader);
					const claimant = this._renderedRequests.read(reader).get(key);
					if (request.kind !== SessionInputRequestKind.ToolClientExecution || request.clientId !== this._config.connection.clientId) {
						generation++;
						observedRequest = undefined;
						startedRequest = undefined;
						invocationStarted = false;
						unobservedTimer.clear();
						return;
					}
					if (startedClientToolCalls.has(key)) {
						startedRequest = request;
						unobservedTimer.clear();
						return;
					}
					if (!equals(observedRequest, request)) {
						observedRequest = request;
						if (invocationStarted) {
							return;
						}
						generation++;
						startedRequest = undefined;
						unobservedTimer.clear();
					}
					if (startedRequest) {
						return;
					}
					if (request.toolCall.toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME
						&& readToolCallMeta(request.toolCall).toolSearchCandidates === undefined) {
						return;
					}
					const execute = (contextSessionResource: URI | undefined) => {
						startedRequest = request;
						unobservedTimer.clear();
						const requestGeneration = generation;
						execution.activeAttempts++;
						void this._executeClientTool(
							request,
							contextSessionResource,
							execution.source.token,
							() => requestGeneration === generation && (invocationStarted || equals(request$.read(undefined), request)),
							() => {
								if (requestGeneration === generation) {
									invocationStarted = true;
									startedClientToolCalls.add(key);
								}
							},
						).finally(() => {
							execution.activeAttempts--;
							const invocation = this._clientToolInvocations.get(key);
							if (execution.activeAttempts === 0 && invocation && IChatToolInvocation.isComplete(invocation)) {
								releaseClientToolExecution(key, execution);
							} else if (execution.activeAttempts === 0 && clientToolExecutions.get(key) !== execution) {
								execution.source.dispose();
							}
						});
					};
					if (claimant) {
						execute(claimant);
					} else if (!this._clientToolRequiresConfirmation(request.toolCall)) {
						execute(undefined);
					} else if (!unobservedTimer.value) {
						const requestGeneration = generation;
						unobservedTimer.value = disposableTimeout(() => {
							if (requestGeneration === generation && !startedRequest) {
								startedRequest = request;
								startedClientToolCalls.add(key);
								this._denyClientTool(request);
							}
						}, UNOBSERVED_CLIENT_TOOL_GRACE_MS);
					}
				}));
			}
		}));
	}

	/**
	 * Releases this resource's reference to the shared per-backend-session
	 * {@link _watchForSessionInputNeeded} watcher, disposing it only once the
	 * last sibling resource has let go.
	 */
	private _releaseSessionInputNeeded(sessionResource: URI): void {
		const backendSession = this._inputNeededWatcherBackends.get(sessionResource);
		this._inputNeededWatcherBackends.delete(sessionResource);
		if (!backendSession) {
			return;
		}
		const sessionKey = backendSession.toString();
		const entry = this._inputNeededWatchers.get(sessionKey);
		if (!entry) {
			return;
		}
		entry.refs.delete(sessionResource.toString());
		if (entry.refs.size === 0) {
			this._inputNeededWatchers.delete(sessionKey);
			entry.store.dispose();
		}
	}

	/**
	 * Holds the shared state for a tool call while an `inputNeeded` request
	 * references it. Once the host stops asking — the request disappears, or the
	 * watcher is disposed — the outcome is settled, so the dispatch-funnel entry
	 * and the shared invocation are dropped and a later call with the same ids
	 * is never mistaken for this one.
	 */
	private _retainToolCall(key: string): IDisposable {
		this._clientToolRetainCounts.set(key, (this._clientToolRetainCounts.get(key) ?? 0) + 1);
		return toDisposable(() => {
			const remaining = (this._clientToolRetainCounts.get(key) ?? 1) - 1;
			if (remaining > 0) {
				this._clientToolRetainCounts.set(key, remaining);
				return;
			}
			this._clientToolRetainCounts.delete(key);
			this._forgetResolvedToolCall(key);
			this._clientToolInvocations.delete(key);
		});
	}

	/**
	 * Returns the shared {@link ChatToolInvocation} for a client tool call,
	 * creating it on first use via {@link ILanguageModelToolsService.beginToolCall}.
	 * `sessionResource` is deliberately omitted so `beginToolCall` does not
	 * append progress into a chat model (which throws once the owning request
	 * is complete); it still registers the invocation, so a later `invokeTool`
	 * with a matching `chatStreamToolCallId` attaches to this same object. The
	 * observer that renders the call and the watcher that executes it therefore
	 * act on one invocation.
	 */
	private _ensureClientToolInvocation(chatURI: string, turnId: string, toolCallId: string, toolId: string, subagentInvocationId: string | undefined): ChatToolInvocation | undefined {
		const key = this._toolCallKey(chatURI, turnId, toolCallId);
		const existing = this._clientToolInvocations.get(key);
		if (existing) {
			return existing;
		}
		const invocation = this._toolsService.beginToolCall({
			toolCallId,
			toolId,
			subagentInvocationId,
			sessionResource: undefined,
			force: true,
		}) as ChatToolInvocation | undefined;
		if (invocation) {
			this._clientToolInvocations.set(key, invocation);
		}
		return invocation;
	}

	/** The workbench tool a runtime client-tool call maps to, or `undefined` when it is not installed. */
	private _resolveClientTool(toolName: string): IToolData | undefined {
		const isCopilotSession = isCopilotCliSessionType(this._config.sessionType);
		if (isCopilotSession && toolName === SEMANTIC_SEARCH_TOOL_NAME) {
			return this._toolsService.getTool(CLIENT_SEMANTIC_SEARCH_TOOL_ID);
		}
		const clientToolName = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME ? CLIENT_TOOL_SEARCH_REFERENCE_NAME : toolName;
		return this._toolsService.getToolByName(clientToolName);
	}

	/**
	 * Whether an unclaimed client tool must wait for a rendering observer
	 * before running. There is no protocol field for this, so we use the tool's
	 * static {@link IToolData.canRequestPreApproval} signal: a tool that might
	 * ask for pre-approval could pop a confirmation, which only makes sense
	 * inside a live chat request. Limitation: this is a "might" signal — a tool
	 * may set it yet auto-approve at runtime — so an unclaimed such tool is
	 * conservatively made to wait (and denied on timeout) rather than risk a
	 * headless modal nobody can answer. Only consulted for the unclaimed case;
	 * a claimed call always runs with context regardless.
	 */
	private _clientToolRequiresConfirmation(toolCall: ToolCallState): boolean {
		return this._resolveClientTool(toolCall.toolName)?.canRequestPreApproval === true;
	}

	/**
	 * The one place a client tool is actually invoked. Ensures the shared
	 * invocation exists, parses the protocol input (preserving the tool-search
	 * candidate handling), invokes the tool, and dispatches the protocol
	 * completion. `contextSessionResource` is set when a turn observer is
	 * rendering the call: a live chat request then exists, so confirmation
	 * renders in the tool part, any pre-approval is honored, and side effects
	 * attribute to that observer's chat. Without it the tool runs headlessly,
	 * independent of whether the owning turn is live.
	 */
	private async _executeClientTool(request: SessionToolClientExecutionRequest, contextSessionResource: URI | undefined, token: CancellationToken, isCurrent: () => boolean, markInvocationStarted: () => void): Promise<void> {
		const chatURI = request.chat.toString();
		const toolCall = request.toolCall;
		const toolName = toolCall.toolName;
		const isToolSearch = toolName === RUNTIME_TOOL_SEARCH_TOOL_NAME;
		const toolData = this._resolveClientTool(toolName);

		// A tool-search completion (success or failure) must drop the transient
		// candidate corpus from `_meta` while preserving any other metadata.
		const completionMeta = isToolSearch ? { _meta: metaWithoutToolSearchCandidates(toolCall) } : {};

		const invocation = toolData
			? this._ensureClientToolInvocation(chatURI, request.turnId, toolCall.toolCallId, toolData.id, undefined)
			: undefined;
		const fail = (message: string, code: string) => {
			const pastTenseMessage = localize('agentHost.clientTool.pastTense', "Couldn't run {0}", toolCall.displayName);
			const result: IToolResult = {
				content: [],
				toolResultError: message,
				toolResultMessage: pastTenseMessage,
			};
			void invocation?.didExecuteTool(result);
			this._resolveToolCall(chatURI, request.turnId, toolCall.toolCallId, {
				type: ActionType.ChatToolCallComplete,
				turnId: request.turnId,
				toolCallId: toolCall.toolCallId,
				result: {
					success: false,
					pastTenseMessage,
					error: { message, code },
				},
				...completionMeta,
			});
		};

		if (!toolData) {
			fail(localize('agentHost.clientTool.unknown', "Tool \"{0}\" is not available on this client.", toolName), 'toolUnavailable');
			return;
		}

		if (!invocation) {
			fail(localize('agentHost.clientTool.beginFailed', "Could not create invocation for client tool \"{0}\".", toolName), 'invocationFailed');
			return;
		}

		// eslint-disable-next-line local/code-no-in-operator
		const toolInput = 'toolInput' in toolCall ? toolCall.toolInput : undefined;
		let rawInput: string;
		try {
			rawInput = await resolveToolInput(this._config.connection, toolInput);
		} catch (error) {
			if (!isCurrent() || token.isCancellationRequested || invocation.state.get().type === IChatToolInvocation.StateKind.Cancelled) {
				return;
			}
			const message = error instanceof Error ? error.message : String(error);
			this._logService.warn(`[AgentHost] Failed to read client tool input: ${toolName}`, error);
			fail(message, 'inputReadFailed');
			return;
		}
		if (!isCurrent() || token.isCancellationRequested || invocation.state.get().type === IChatToolInvocation.StateKind.Cancelled) {
			return;
		}

		let parameters: Record<string, unknown>;
		try {
			const parsed: unknown = JSON.parse(rawInput);
			if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
				throw new Error('expected JSON object');
			}
			parameters = parsed as Record<string, unknown>;
		} catch {
			fail(localize('agentHost.clientTool.badInput', "Invalid tool input for \"{0}\": expected JSON object parameters.", toolName), 'invalidInput');
			return;
		}

		const toolSearchCandidates = isToolSearch ? readToolCallMeta(toolCall).toolSearchCandidates : undefined;
		if (toolSearchCandidates !== undefined) {
			parameters = { ...parameters, candidateTools: toolSearchCandidates };
		}

		this._logService.info(`[AgentHost] Running client tool: ${toolName} (callId=${toolCall.toolCallId}, withContext=${contextSessionResource !== undefined})`);
		let result: IToolResult | undefined;
		let error: unknown;
		try {
			markInvocationStarted();
			result = await this._toolsService.invokeTool({
				callId: toolCall.toolCallId,
				toolId: toolData.id,
				parameters,
				context: contextSessionResource ? { sessionResource: contextSessionResource } : undefined,
				chatStreamToolCallId: toolCall.toolCallId,
				preApproved: toolCall.status === ToolCallStatus.PendingConfirmation ? undefined : getClientToolPreApproval(toolCall),
			}, async () => 0, token);
		} catch (err) {
			error = err;
		}

		if (!isCurrent() || token.isCancellationRequested || invocation.state.get().type === IChatToolInvocation.StateKind.Cancelled) {
			return;
		}
		if (error !== undefined) {
			if (!isCancellationError(error)) {
				this._logService.warn(`[AgentHost] Client tool failed: ${toolName}`, error);
			}
			result = { content: [], toolResultError: error instanceof Error ? error.message : String(error) };
		}

		this._resolveToolCall(chatURI, request.turnId, toolCall.toolCallId, {
			type: ActionType.ChatToolCallComplete,
			turnId: request.turnId,
			toolCallId: toolCall.toolCallId,
			result: toolResultToProtocol(result ?? { content: [] }, toolName),
			...completionMeta,
		});
	}

	/**
	 * Denies a client tool call that needs confirmation but that no sub/agent
	 * observer claimed within the grace window: there is no live surface to
	 * answer it, so report a failed completion rather than pop a headless
	 * modal.
	 */
	private _denyClientTool(request: SessionToolClientExecutionRequest): void {
		const toolCall = request.toolCall;
		this._logService.warn(`[AgentHost] Denying client tool ${toolCall.toolName} (callId=${toolCall.toolCallId}): it can request confirmation but no session claimed it within ${UNOBSERVED_CLIENT_TOOL_GRACE_MS}ms`);
		this._resolveToolCall(request.chat.toString(), request.turnId, toolCall.toolCallId, {
			type: ActionType.ChatToolCallComplete,
			turnId: request.turnId,
			toolCallId: toolCall.toolCallId,
			result: {
				success: false,
				pastTenseMessage: localize('agentHost.clientTool.unclaimed', "Couldn't run {0}", toolCall.displayName),
				error: {
					message: localize('agentHost.clientTool.unclaimedError', "{0} needs confirmation but no session was available to answer it.", toolCall.displayName),
					code: 'clientUnavailable',
				},
			},
		});
		this._clientToolInvocations.delete(this._toolCallKey(request.chat.toString(), request.turnId, toolCall.toolCallId));
	}

	/**
	 * Tracks protocol state changes for a specific server-initiated turn and
	 * pushes `IChatProgress[]` items into the session's `progressObs`.
	 * When the turn finishes, sets `isCompleteObs` to true.
	 */
	private _trackServerTurnProgress(
		backendSession: URI,
		turnId: string,
		chatSession: AgentHostChatSession,
		turnDisposables: DisposableStore,
	): void {
		const cts = new CancellationTokenSource();
		turnDisposables.add(toDisposable(() => cts.dispose(true)));
		turnDisposables.add(this._observeTurn({
			backendSession,
			sessionResource: chatSession.sessionResource,
			chatURI: this._getChatURI(chatSession.sessionResource),
			turnId,
			sink: parts => chatSession.appendProgress(parts),
			cancellationToken: cts.token,
			onTurnEnded: () => chatSession.isCompleteObs.set(true, undefined),
		}));
	}

	private _turnStopWatchKey(chatURI: string, turnId: string): string {
		return `${chatURI}\0${turnId}`;
	}

	private _ensureTurnStopWatch(chatURI: string, turnId: string): StopWatch {
		const key = this._turnStopWatchKey(chatURI, turnId);
		let stopWatch = this._turnStopWatches.get(key);
		if (!stopWatch) {
			stopWatch = StopWatch.create(false);
			this._turnStopWatches.set(key, stopWatch);
		}
		return stopWatch;
	}

	private _turnDuration(chatURI: string, turnId: string): number {
		const elapsed = this._turnStopWatches.get(this._turnStopWatchKey(chatURI, turnId))?.elapsed();
		return typeof elapsed === 'number' && Number.isFinite(elapsed) ? Math.max(0, elapsed) : 0;
	}

	private _clearTurnStopWatch(chatURI: string, turnId: string): void {
		this._turnStopWatches.delete(this._turnStopWatchKey(chatURI, turnId));
	}

	// ---- Turn handling (state-driven) ---------------------------------------

	private async _handleTurn(
		session: URI,
		request: IChatAgentRequest,
		progress: (parts: IChatProgress[]) => void,
		cancellationToken: CancellationToken,
		onFailureStage: (stage: AgentHostInvocationFailureStage) => void,
	): Promise<Turn | undefined> {
		if (cancellationToken.isCancellationRequested) {
			return;
		}

		onFailureStage('prepareTurn');
		// This waits only for local trust checks and ordered optimistic dispatch;
		// working-directory action envelopes are not a turn-start barrier.
		await this._workingDirectorySynchronizer.reconcile(session, cancellationToken);
		if (cancellationToken.isCancellationRequested) {
			return;
		}
		const turnId = request.requestId;
		this._clientDispatchedTurnIds.add(turnId);
		const chatURI = this._getChatURI(request.sessionResource);
		const turnChannel = chatURI;
		const messageAttachments = await this._convertVariablesToAttachments(request);
		if (cancellationToken.isCancellationRequested) {
			return;
		}

		// Add this connection as an active client for the session before the
		// turn goes out. We only do this on turn start (not on session open)
		// so that opening a session doesn't eagerly register this client while
		// another client is in the middle of a turn.
		this._ensureActiveClient(request.sessionResource, session);

		// Model and agent selection now travel on the turn message itself rather
		// than via the removed `session/modelChanged` / `session/agentChanged`
		// actions. The host applies the selection carried by the message before
		// sending the turn to the agent backend.
		const selectedModel = this._createModelSelection(request.userSelectedModelId, request.modelConfiguration);
		const requestedAgentUri = request.modeInstructions?.uri?.toString();

		// If the chat model has fewer previous requests than the protocol has
		// turns, a checkpoint was restored or a message was edited. Dispatch
		// session/truncated so the server drops the stale tail.
		const chatModel = this._chatService.getSession(request.sessionResource);
		const protocolState = this._getSessionState(session.toString(), chatURI);
		if (chatModel && protocolState?.turns.length) {
			// -2 since -1 will already be the current request
			const previousRequestIndex = chatModel.getRequests().findIndex(i => i.id === request.requestId) - 1;
			const previousRequest = previousRequestIndex >= 0 ? chatModel.getRequests()[previousRequestIndex] : undefined;
			if (!previousRequest && protocolState.turns.length > 0) {
				const truncateAction: ChatTruncatedAction = {
					type: ActionType.ChatTruncated,
				};
				this._config.connection.dispatch(turnChannel, truncateAction);
			} else {
				const seenAtIndex = protocolState.turns.findIndex(t => t.id === previousRequest!.id);
				if (seenAtIndex !== -1 && seenAtIndex < protocolState.turns.length - 1) {
					const truncateAction: ChatTruncatedAction = {
						type: ActionType.ChatTruncated,
						turnId: previousRequest!.id,
					};
					this._config.connection.dispatch(turnChannel, truncateAction);
				}
			}
		}

		// Dispatch session/turnStarted — the server will call sendMessage on
		// the provider as a side effect.
		const turnAction: ChatTurnStartedAction = {
			type: ActionType.ChatTurnStarted,
			turnId,
			startedAt: new Date().toISOString(),
			message: withMessageHiddenFromTranscript({
				...userOriginMessage(request.message, messageAttachments),
				...(selectedModel ? { model: selectedModel } : {}),
				...(requestedAgentUri ? { agent: { uri: requestedAgentUri } } : {}),
			}, request.hideFromTranscript),
		};
		this._ensureTurnStopWatch(turnChannel, turnId);
		onFailureStage('dispatchTurn');
		this._config.connection.dispatch(turnChannel, turnAction);

		// Ensure the snapshot controller records a sentinel checkpoint for this
		// request so it appears in requestDisablement even if the turn
		// produces no file edits.
		this._ensureSnapshotController(request.sessionResource)
			?.ensureRequestCheckpoint(request.requestId);

		// Wait for the turn to reach a terminal state. The observable graph
		// installed below drives all progress emission via the `progress`
		// sink and resolves the promise from `onTurnEnded`. Cancellation is
		// surfaced through the same path: the observer disposes itself when
		// `cancellationToken` fires, then calls `onTurnEnded(undefined)`.
		onFailureStage('observeTurn');
		return new Promise<Turn | undefined>(resolve => {
			const store = new DisposableStore();
			const cancelSub = store.add(cancellationToken.onCancellationRequested(() => {
				cancelSub.dispose();
				this._logService.info(`[AgentHost] Cancellation requested for ${session.toString()}, dispatching turnCancelled`);
				this._config.connection.dispatch(turnChannel, {
					type: ActionType.ChatTurnCancelled,
					turnId,
					duration: this._turnDuration(turnChannel, turnId),
				});
			}));

			store.add(this._observeTurn({
				backendSession: session,
				sessionResource: request.sessionResource,
				chatURI,
				turnId,
				sink: progress,
				cancellationToken,
				suppressErrorMarkdown: true,
				onTurnEnded: (lastTurn) => {
					store.dispose();
					this._clientDispatchedTurnIds.delete(turnId);
					this._activeSessions.get(request.sessionResource)?.isCompleteObs.set(true, undefined);
					resolve(lastTurn);
				},
				onFileEdits: (tc) => {
					const editParts = this._hydrateFileEdits(request.sessionResource, request.requestId, tc);
					if (editParts.length > 0) {
						progress(editParts);
					}
				},
			}));
		});
	}

	// ---- Tool confirmation --------------------------------------------------

	/**
	 * Awaits user confirmation on a PendingConfirmation tool call invocation
	 * and dispatches `ChatToolCallConfirmed` back to the server.
	 */
	private _awaitToolConfirmation(
		invocation: ChatToolInvocation,
		toolCallId: string,
		session: URI,
		turnId: string,
		cancellationToken: CancellationToken,
		getProtocolOptions: () => ConfirmationOption[] | undefined,
		chatURI?: string,
	): void {
		IChatToolInvocation.awaitConfirmation(invocation, cancellationToken).then(reason => {
			// When the user picked a custom button, resolve the matching
			// protocol option so we can forward `selectedOptionId` and
			// derive approve/deny from the option's kind.
			let selectedOption: ConfirmationOption | undefined;
			const protocolOptions = getProtocolOptions();
			if (reason.type === ToolConfirmKind.UserAction && reason.selectedButton && protocolOptions) {
				selectedOption = protocolOptions.find(o => o.id === reason.selectedButton);
			}

			const approved = selectedOption
				? selectedOption.kind === ConfirmationOptionKind.Approve
				: reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;

			this._logService.info(`[AgentHost] Tool confirmation: toolCallId=${toolCallId}, approved=${approved}, selectedOptionId=${selectedOption?.id}`);
			const target = this._requireChatURI(chatURI, ActionType.ChatToolCallConfirmed);
			this._resolveToolCall(target, turnId, toolCallId, approved
				? {
					type: ActionType.ChatToolCallConfirmed,
					turnId,
					toolCallId,
					approved: true,
					confirmed: ToolCallConfirmationReason.UserAction,
					...(selectedOption ? { selectedOptionId: selectedOption.id } : {}),
				}
				: {
					type: ActionType.ChatToolCallConfirmed,
					turnId,
					toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
					...(selectedOption ? { selectedOptionId: selectedOption.id } : {}),
				});
		}).catch(err => {
			this._logService.warn(`[AgentHost] Tool confirmation failed for toolCallId=${toolCallId}`, err);
		});
	}

	// ---- Per-turn observable graph ------------------------------------------

	/**
	 * Installs the always-on observable graph that translates session state
	 * into `IChatProgress[]` for a specific turn. The same graph is used for:
	 *   - live turns started by the user via {@link _handleTurn},
	 *   - reconnect to an in-flight turn from {@link provideChatSessionContent},
	 *   - server-initiated turns detected by {@link _watchForServerInitiatedTurns}.
	 *
	 * Differences are captured in {@link IObserveTurnOptions.sink} (where
	 * progress is delivered) and {@link IObserveTurnOptions.snapshotToolCalls} /
	 * {@link IObserveTurnOptions.seedEmittedLengths} (snapshot continuity for
	 * the reconnect case).
	 *
	 * The returned disposable owns the entire per-turn graph, including the
	 * underlying session subscription reference.
	 */
	private _observeTurn(opts: IObserveTurnOptions): IDisposable {
		const sessionKey = opts.backendSession.toString();
		const store = new DisposableStore();
		this._ensureTurnStopWatch(opts.chatURI, opts.turnId);
		// `_ensureSessionSubscription` returns a process-shared, non-refcounted
		// subscription owned by the chat session lifecycle. Do NOT release it
		// from here — other callers (the server-turn watcher, reconnect, the
		// history hydration code) share the same instance and would lose
		// their state if we tore it down.
		const sub = this._ensureSessionSubscription(sessionKey);
		const chatURI = opts.chatURI;
		const chatSub = this._ensureChatSubscription(sessionKey, chatURI);

		const sessionState$ = observableFromSubscription(this, sub);
		const chatState$ = observableFromSubscription(this, chatSub);
		// Merge the session with this resource's chat so conversation contents
		// are observable from one place.
		const mergedState$ = derived(reader => {
			const session = sessionState$.read(reader);
			if (!session) {
				return undefined;
			}
			return mergeSessionWithDefaultChat(session, chatState$.read(reader));
		});
		const turn$ = derived(reader => {
			const state = mergedState$.read(reader);
			if (!state) {
				return undefined;
			}
			return state.activeTurn?.id === opts.turnId
				? state.activeTurn
				: state.turns.find(t => t.id === opts.turnId);
		});
		const responseParts$ = derived(reader => turn$.read(reader)?.responseParts ?? []);
		const usage$ = derived(reader => turn$.read(reader)?.usage);
		store.add(autorun(reader => {
			const state = mergedState$.read(reader);
			if (state?.turns.some(turn => turn.id === opts.turnId)) {
				this._clearTurnStopWatch(opts.chatURI, opts.turnId);
			}
		}));
		const mcpAuthRequired$ = derivedOpts({ equalsFn: equals }, reader => {
			return getMcpAuthenticationRequiredServers(opts.sessionResource, mergedState$.read(reader));
		});
		const mcpStarting$ = derivedOpts({ equalsFn: equals }, reader => {
			const state = mergedState$.read(reader);
			const servers = state?.customizations?.flatMap(c => c.type === CustomizationType.McpServer
				? [c]
				: c.children?.filter(c => c.type === CustomizationType.McpServer) ?? []) ?? [];
			return servers
				.filter(server => isCustomizationEnabled(server) && server.state.kind === McpServerStatus.Starting)
				.map((server): IChatMcpStartingServer => ({
					id: opts.sessionResource.authority + '/' + server.id,
					name: server.name,
				}));
		});

		// Subagent observation context: dedups subagent tool calls so each is
		// observed once.
		const subagentContext: ISubagentContext = {
			observations: store.add(new DisposableMap()),
		};

		// Per response part. Markdown / reasoning / tool calls each get a
		// dedicated setup keyed by their stable id. Per-key closures replace
		// the `Map<string, ChatToolInvocation>` and `Map<string, number>
		// lastEmittedLengths` bookkeeping that used to live on every call
		// site of `_processSessionState`.
		store.add(autorunPerKeyedItem(
			responseParts$,
			rp => rp.kind === ResponsePartKind.ToolCall
				? `tc:${rp.toolCall.toolCallId}`
				: rp.kind === ResponsePartKind.Markdown
					? `md:${rp.id}`
					: rp.kind === ResponsePartKind.Reasoning
						? `rs:${rp.id}`
						: rp.kind === ResponsePartKind.InputRequest
							? inputRequestResponsePartKey(rp)
							: `other:${responseParts$.get().indexOf(rp)}`,
			(_key, part$, partStore) => {
				const initial = part$.get();
				switch (initial.kind) {
					case ResponsePartKind.Markdown:
						// Subagent observers don't forward markdown into the
						// parent's progress — it belongs to the subagent's own
						// session view.
						if (opts.subAgentInvocationId !== undefined) {
							break;
						}
						this._setupMarkdownPart(part$ as IObservable<MarkdownResponsePart>, partStore, opts);
						break;
					case ResponsePartKind.Reasoning:
						if (opts.subAgentInvocationId !== undefined) {
							break;
						}
						this._setupReasoningPart(part$ as IObservable<ReasoningResponsePart>, partStore, opts);
						break;
					case ResponsePartKind.ToolCall:
						this._setupToolCallPart(part$ as IObservable<ToolCallResponsePart>, partStore, opts, subagentContext);
						break;
					case ResponsePartKind.InputRequest:
						if (opts.subAgentInvocationId === undefined) {
							this._setupInputRequestPart(part$ as IObservable<InputRequestResponsePart>, partStore, opts);
						}
						break;
					case ResponsePartKind.SystemNotification:
						// System notifications don't have an id, so we have to identify it by index
						if (responseParts$.get().indexOf(initial) >= (opts.initialResponsePartCount ?? 0) && opts.subAgentInvocationId === undefined) {
							const progress = systemNotificationToChatPart(initial.content, this._config.connectionAuthority, initial._meta);
							if (progress) {
								opts.sink([progress]);
							}
						}
						break;
				}
			},
		));

		// Per-turn adjuncts skipped for subagent observers.
		if (opts.subAgentInvocationId === undefined) {
			let lastUsage: ReturnType<typeof usageInfoToChatUsage>;
			let lastAutoModeResolution: IChatAutoModeResolutionPart | undefined;
			const modelLookup = this._createTurnModelLookup(opts.sessionResource, undefined);

			this._setupMcpAuthPrompt(mcpAuthRequired$, store, opts);

			// Surface the host's chat activity — e.g. the live "Creating
			// isolated worktree (42%)" progress reported while the session's
			// worktree is being created — instead of the generic working
			// placeholder the widget would otherwise show. Restricted to the
			// window before the agent produces any content, since from then on
			// its own parts tell the story. The stable id makes each update
			// replace the previous row rather than stack another one, and the
			// row hides itself as soon as real content follows it.
			store.add(autorun(reader => {
				const activity = chatState$.read(reader)?.activity;
				if (!activity || responseParts$.read(reader).length > 0) {
					return;
				}
				opts.sink([{
					kind: 'progressMessage',
					id: CHAT_ACTIVITY_PROGRESS_ID,
					content: new MarkdownString().appendText(activity),
					shimmer: true,
				}]);
			}));

			store.add(autorun(reader => {
				const resolution = modelLookup.toAutoModeResolution?.(usage$.read(reader));
				if (!resolution || equals(lastAutoModeResolution, resolution)) {
					return;
				}
				lastAutoModeResolution = resolution;
				opts.sink([resolution]);
			}));

			// Surface a "Starting MCP servers …" progress hint when servers
			// remain in the `Starting` state past a short grace period after the
			// turn begins without any content arriving from the host. The part
			// updates as servers finish and hides once every server has started,
			// content starts being received, or the turn ends — whichever comes
			// first. It carries no interactive affordance (no "Skip").
			{
				const MCP_STARTING_GRACE_MS = 5000;

				let didAppend = false;
				const hasContent$ = responseParts$.map(r => r.length > 0);
				const hasServersStarting$ = mcpStarting$.map(s => s.length > 0);
				const serversStartingInput = observableValue('mcpStartingServersInput', constObservable<IChatMcpStartingServer[]>([]));

				store.add(autorun(reader => {
					if (hasContent$.read(reader) || !hasServersStarting$.read(reader)) {
						serversStartingInput.set(constObservable([]), undefined);
						return;
					}

					reader.store.add(disposableTimeout(() => {
						serversStartingInput.set(mcpStarting$, undefined);
						if (!didAppend) {
							didAppend = true;
							opts.sink([{
								kind: 'mcpServersStartingSlow',
								sessionResource: opts.sessionResource,
								servers: serversStartingInput.map((o, r) => o.read(r)),
							}]);
						}

					}, MCP_STARTING_GRACE_MS));
				}));

				store.add(toDisposable(() => serversStartingInput.set(constObservable([]), undefined)));
			}

			store.add(autorun(reader => {
				const rawUsage = usage$.read(reader);
				// The parent turn's usage already aggregates the parent agent's
				// calls plus every subagent's calls (the agent host folds
				// subagent usage into the parent turn under scope `''`), so it is
				// emitted as-is — no separate re-aggregation of subagent credits.
				const usage = usageInfoToChatUsage(rawUsage, modelLookup.toModelDisplayName);
				if (!usage) {
					return;
				}
				// Carry through the actual model so the context-usage widget
				// can look up context window metadata when the request-level
				// model (e.g. "auto") doesn't expose one.
				const actualModelId = this._toLanguageModelId(opts.sessionResource, rawUsage?.model);
				if (actualModelId) {
					usage.actualModelId = actualModelId;
				}
				if (lastUsage
					&& lastUsage.promptTokens === usage.promptTokens
					&& lastUsage.completionTokens === usage.completionTokens
					&& lastUsage.outputBuffer === usage.outputBuffer
					&& lastUsage.copilotCredits === usage.copilotCredits
					&& lastUsage.sessionCopilotCredits === usage.sessionCopilotCredits
					&& equals(lastUsage.promptTokenDetails, usage.promptTokenDetails)
					// A subagent's call leaves the parent's own token counts unchanged, so
					// without comparing the whole-turn totals its contribution never lands.
					&& equals(lastUsage.modelTotals, usage.modelTotals)) {
					return;
				}
				lastUsage = usage;
				opts.sink([usage]);
			}));

			// Surface the account quota snapshots the agent host reports on each model-call usage event
			// into the entitlement service, keeping the quota UI current for agent-host sessions (mirrors
			// the extension-host CLI path). `acceptQuotas` replaces top-level state and merges fields
			// within each provided category snapshot.
			let lastQuotaSignature: string | undefined;
			store.add(autorun(reader => {
				const quotaUpdate = usageInfoToQuotas(usage$.read(reader));
				if (!quotaUpdate) {
					return;
				}
				const signature = JSON.stringify(quotaUpdate);
				if (signature === lastQuotaSignature) {
					return;
				}
				lastQuotaSignature = signature;
				this._chatEntitlementService.acceptQuotas({
					...this._chatEntitlementService.quotas,
					...quotaUpdate,
				});
			}));

		}

		// For subagent observers: accumulate copilot credits from child turns
		// into the parent's accumulator so the session cost includes them, and
		// surface the per-subagent total on its tool hover.
		//
		// NOTE: this depends on the agent host reporting usage on the subagent's
		// own child turns. Some hosts (e.g. copilotcli) instead bundle a
		// subagent's model-call cost into the *parent* turn's usage and leave the
		// child turn's usage empty; for those this observer stays inert and the
		// subagent's cost is still reflected in the overall session cost via the
		// parent turn. The wiring lights up automatically for hosts that do
		// report child-turn usage.
		if (opts.subAgentInvocationId !== undefined && opts.subAgentCreditsAccumulator) {
			const accumulator = opts.subAgentCreditsAccumulator;
			let lastCredits = 0;
			store.add(autorun(reader => {
				const rawUsage = usage$.read(reader);
				const credits = usageInfoToChatUsage(rawUsage)?.copilotCredits;
				if (typeof credits === 'number' && credits !== lastCredits) {
					const delta = credits - lastCredits;
					lastCredits = credits;
					if (delta > 0) {
						transaction(tx => {
							accumulator.set(accumulator.read(undefined) + delta, tx);
						});
					}
				}
			}));
		}

		// For subagent observers: surface the language model this subagent ran
		// on so it can be shown on the subagent tool's hover. Like the credits
		// observer above, this depends on the host reporting the model on the
		// subagent's own child turns (hosts that bundle into the parent turn
		// leave this empty).
		if (opts.subAgentInvocationId !== undefined && opts.subAgentModelObservable) {
			const modelObservable = opts.subAgentModelObservable;
			store.add(autorun(reader => {
				const rawUsage = usage$.read(reader);
				const modelId = this._toLanguageModelId(opts.sessionResource, rawUsage?.model);
				const modelName = this._getLanguageModelDisplayName(modelId);
				if (modelName && modelName !== modelObservable.read(undefined)) {
					transaction(tx => modelObservable.set(modelName, tx));
				}
			}));
		}

		// Detect terminal turn state. The turn is over when the active turn
		// id no longer matches our turn id; the completed turn (if present
		// in `turns`) surfaces any error message.
		//
		// `seenActive` guards against firing `finish` on the install pass:
		// `_handleTurn` calls us right after dispatching `ChatTurnStarted`
		// but before the action has been echoed back, so the very first
		// reading of state may not yet contain our turn. We must wait until
		// we've seen our turn become active at least once before treating
		// its absence as a terminal transition.
		let terminated = false;
		let seenActive = false;
		const finish = (lastTurn: Turn | undefined) => {
			if (terminated) {
				return;
			}
			terminated = true;
			// Defer to a microtask so any other autoruns reacting to the
			// same state update (e.g. tool call finalization) finish first.
			// Self-dispose afterwards so callers do not need to track us
			// across the natural-completion path; cancellation paths can
			// still call `dispose()` proactively (idempotent).
			queueMicrotask(() => {
				if (store.isDisposed) {
					return;
				}
				try {
					opts.onTurnEnded?.(lastTurn);
				} finally {
					store.dispose();
				}
			});
		};
		store.add(autorun(reader => {
			if (terminated) {
				return;
			}
			const state = mergedState$.read(reader);
			if (!state) {
				return;
			}
			if (state.activeTurn?.id === opts.turnId) {
				seenActive = true;
				return;
			}
			// Also treat a completed turn we discover in `turns` as
			// "having seen it", so reconnect / server-initiated paths that
			// install us against an already-completed turn still finish.
			const lastTurn = state.turns.find(t => t.id === opts.turnId);
			if (lastTurn) {
				seenActive = true;
			}
			if (!seenActive) {
				return;
			}
			if (!opts.suppressErrorMarkdown && lastTurn?.state === TurnState.Error && lastTurn.error) {
				const forwarded = getChatErrorDetailsFromMeta(lastTurn.error, this._chatErrorContext());
				const content = forwarded
					? new MarkdownString(`\n\n${forwarded.message}`)
					: new MarkdownString(`\n\nError: (${lastTurn.error.errorType}) ${lastTurn.error.message}`);
				opts.sink([{ kind: 'markdownContent', content }]);
			}
			finish(lastTurn);
		}));

		store.add(opts.cancellationToken.onCancellationRequested(() => {
			// On cancellation the protocol turn has not been finalized yet
			// (the `ChatTurnCancelled` dispatch round-trips asynchronously), so
			// resolve with the current turn rather than `undefined`. This keeps
			// the turn's accumulated `usage` so the response footer still shows
			// the model and the credits consumed before the interruption.
			// Mark it `Cancelled` so error-detail extraction treats it as a
			// non-error terminal turn (an already-finalized turn keeps its own
			// state).
			const current = turn$.get();
			finish(current ? { state: TurnState.Cancelled, ...current } : undefined);
		}));

		return store;
	}

	/**
	 * Surfaces the "MCP server … requires authentication" prompt for a turn.
	 *
	 * Each server is prompted at most once per conversation: {@link mcpAuthRequired$}
	 * is session-wide, so without this guard the prompt would repeat on every
	 * message. The per-session {@link _surfacedMcpAuthServers surfaced set} tracks
	 * which servers were already prompted; it is pruned by
	 * {@link _reconcileSurfacedMcpAuthServers} once a server reaches the running
	 * state, so a server that is re-required after being authenticated (e.g.
	 * after a restart) prompts again.
	 *
	 * The emitted part lists only the servers it introduced and shrinks as they
	 * authenticate.
	 */
	private _setupMcpAuthPrompt(
		mcpAuthRequired$: IObservable<readonly IChatMcpAuthenticationRequiredServer[]>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		let part: IChatMcpAuthenticationRequired & { servers: ISettableObservable<IChatMcpAuthenticationRequiredServer[]> } | undefined;
		let ownedIds = new Set<string>();
		let runId = 0;

		store.add(autorun(reader => {
			const pendingAuth = mcpAuthRequired$.read(reader);
			const currentRunId = ++runId;
			this._filterAutoGrantedMcpAuthentication(opts.sessionResource, pendingAuth).then(servers => {
				// Ignore stale completions: a newer run has superseded this one
				// (guards against out-of-order resolution of the async filter).
				if (currentRunId !== runId) {
					return;
				}
				const surfaced = this._getSurfacedMcpAuthServers(opts.sessionResource);
				const newServers = servers.filter(server => !surfaced.has(server.id));
				// Nothing new to prompt and no live prompt to update/hide.
				if (!newServers.length && (!part || part.isUsed)) {
					return;
				}
				if (!part || part.isUsed) {
					ownedIds = new Set();
					part = {
						kind: 'mcpAuthenticationRequired',
						sessionResource: opts.sessionResource.toJSON(),
						isUsed: false,
						servers: observableValue('mcpAuthNeededServers', []),
					};
					opts.sink([part]);
				}
				for (const server of newServers) {
					surfaced.add(server.id);
					ownedIds.add(server.id);
				}
				part.servers.set(servers.filter(server => ownedIds.has(server.id)), undefined);
			});
		}));
	}

	/**
	 * Returns the mutable set of MCP server ids already surfaced for
	 * authentication in the given session, creating it on first use.
	 */
	private _getSurfacedMcpAuthServers(sessionResource: URI): Set<string> {
		let surfaced = this._surfacedMcpAuthServers.get(sessionResource);
		if (!surfaced) {
			surfaced = new Set<string>();
			this._surfacedMcpAuthServers.set(sessionResource, surfaced);
		}
		return surfaced;
	}

	/**
	 * Prunes servers that reached the running ({@link McpServerStatus.Ready})
	 * state from every session's {@link _surfacedMcpAuthServers surfaced set} so
	 * a subsequent auth requirement surfaces a fresh prompt instead of being
	 * suppressed. Only the running state counts as actioned — a server that
	 * merely left {@link McpServerStatus.AuthRequired} for an error/stopped
	 * state was not authenticated and stays suppressed.
	 */
	private _reconcileSurfacedMcpAuthServers(): void {
		for (const [sessionResource, surfaced] of this._surfacedMcpAuthServers) {
			if (surfaced.size === 0) {
				continue;
			}
			const ready = new Set(this._customizationService.getMcpServers(sessionResource)
				.filter(server => server.status === McpServerStatus.Ready)
				.map(server => server.id));
			for (const id of surfaced) {
				if (ready.has(id)) {
					surfaced.delete(id);
				}
			}
		}
	}

	private async _filterAutoGrantedMcpAuthentication(sessionResource: URI, servers: readonly IChatMcpAuthenticationRequiredServer[]): Promise<readonly IChatMcpAuthenticationRequiredServer[]> {
		const remaining: IChatMcpAuthenticationRequiredServer[] = [];
		for (const server of servers) {
			if (!await this._autoAuthenticateMcpServer(sessionResource, server)) {
				remaining.push(server);
			}
		}
		return remaining;
	}

	private async _autoAuthenticateMcpServer(sessionResource: URI, server: IChatMcpAuthenticationRequiredServer): Promise<boolean> {
		const key = JSON.stringify([
			agentHostMcpServerId(sessionResource.authority, server.name, server.resource),
			[...(server.requiredScopes ?? [])].sort(),
			server.oauthClient?.clientId,
		]);
		const pending = this._pendingMcpAutoAuthentication.get(key);
		if (pending) {
			return pending;
		}
		const operation = this._instantiationService.invokeFunction(resolveMcpServerAuthentication, {
			resource: server.resource,
			resource_name: server.name,
			authorization_servers: server.authorizationServers ? [...server.authorizationServers] : undefined,
			scopes_supported: server.supportedScopes ? [...server.supportedScopes] : undefined,
		}, {
			allowInteraction: false,
			logPrefix: '[AgentHost]',
			mcpServerId: agentHostMcpServerId(sessionResource.authority, server.name, server.resource),
			mcpServerName: server.name,
			mcpServerUrl: server.resource,
			oauthClient: server.oauthClient,
			scopes: server.requiredScopes ?? [],
			agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
			authenticate: request => this._config.connection.authenticate(request),
		}).catch(err => {
			this._logService.error(`[AgentHost] Failed to auto-authenticate MCP server '${server.name}'`, err);
			return false;
		});
		this._pendingMcpAutoAuthentication.set(key, operation);
		try {
			return await operation;
		} finally {
			if (this._pendingMcpAutoAuthentication.get(key) === operation) {
				this._pendingMcpAutoAuthentication.delete(key);
			}
		}
	}

	private _setupMarkdownPart(
		part$: IObservable<MarkdownResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		// Seed from the snapshot length so the always-on graph does not
		// re-emit content already covered by `activeTurnToProgress` on
		// reconnect.
		let lastEmitted = opts.seedEmittedLengths?.get(part$.get().id) ?? 0;
		store.add(autorun(reader => {
			const content = part$.read(reader).content;
			if (content.length <= lastEmitted) {
				return;
			}
			const delta = content.substring(lastEmitted);
			lastEmitted = content.length;
			opts.sink([{ kind: 'markdownContent', content: new MarkdownString(delta) }]);
		}));
	}

	private _setupReasoningPart(
		part$: IObservable<ReasoningResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const partId = part$.get().id;
		let lastEmitted = opts.seedEmittedLengths?.get(partId) ?? 0;
		store.add(autorun(reader => {
			const content = part$.read(reader).content;
			if (content.length <= lastEmitted) {
				return;
			}
			const delta = content.substring(lastEmitted);
			lastEmitted = content.length;
			opts.sink([{ kind: 'thinking', value: delta, id: partId }]);
		}));
	}

	private _setupToolCallPart(
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
		subagentContext: ISubagentContext,
	): void {
		const initial = part$.get().toolCall;
		// The snapshot renders a settled tool call as a serialized part, which
		// cannot be adopted. A live invocation for it would duplicate the card
		// and land a tool part between the restored markdown prefix and the
		// markdown still streaming into the same response part, splitting the
		// answer at the reconnect boundary.
		const renderedBySnapshot = !!opts.snapshotToolCalls?.has(initial.toolCallId)
			&& !snapshotInvocationToAdopt(opts, initial.toolCallId);
		if (renderedBySnapshot && !shouldObserveSubagentChat(initial)) {
			return;
		}
		const contributor = initial.contributor;
		if (contributor?.kind === ToolCallContributorKind.Client && contributor.clientId === this._config.connection.clientId) {
			// Set up before claiming: the claim is what tells the session-level
			// watcher it may execute this call, and it must find the shared
			// invocation already created when it does.
			this._setupClientToolCall(initial, part$, store, opts, subagentContext, renderedBySnapshot);
			store.add(this._markToolCallRendered(opts.chatURI, opts.turnId, initial.toolCallId, opts.sessionResource));
		} else if (contributor?.kind === ToolCallContributorKind.Client) {
			this._setupOtherClientToolCall(initial, part$, store, opts);
		} else {
			store.add(this._markToolCallRendered(opts.chatURI, opts.turnId, initial.toolCallId, opts.sessionResource));
			this._setupServerToolCall(initial, part$, store, opts, subagentContext, renderedBySnapshot);
		}
	}

	private _toolCallKey(chatURI: string, turnId: string, toolCallId: string): string {
		return `${chatURI}\0${turnId}\0${toolCallId}`;
	}

	private _inputRequestKey(chatURI: string, requestId: string): string {
		return `${chatURI}\0${requestId}`;
	}

	/** Claims a request as rendered until the returned disposable is disposed. */
	private _markRendered(key: string, sessionResource: URI): IDisposable {
		this._renderedRequests.set(new Map(this._renderedRequests.get()).set(key, sessionResource), undefined);
		return toDisposable(() => {
			const next = new Map(this._renderedRequests.get());
			next.delete(key);
			this._renderedRequests.set(next, undefined);
		});
	}

	/**
	 * Records that a turn observer is rendering this chat input request, so the
	 * session-level responder leaves its inline elicitation UI in charge.
	 */
	private _markInputRequestRendered(chatURI: string, requestId: string, sessionResource: URI): IDisposable {
		return this._markRendered(this._inputRequestKey(chatURI, requestId), sessionResource);
	}

	/**
	 * Records that a turn observer is rendering this tool call, so the
	 * session-level responder leaves its inline UI in charge. Releasing the
	 * claim also forgets the funnel entries, which is the only cleanup a tool
	 * call that never reached `inputNeeded` ever gets.
	 */
	private _markToolCallRendered(chatURI: string, turnId: string, toolCallId: string, sessionResource: URI): IDisposable {
		const key = this._toolCallKey(chatURI, turnId, toolCallId);
		const rendered = this._markRendered(key, sessionResource);
		return toDisposable(() => {
			rendered.dispose();
			this._forgetResolvedToolCall(key);
		});
	}

	/**
	 * Single funnel for tool-call outcomes, so an inline invocation and the
	 * session-level responder can both offer the action while the protocol
	 * only ever sees the first answer. Confirming and completing are distinct
	 * outcomes, so each is tracked separately.
	 */
	private _resolveToolCall(chatURI: string, turnId: string, toolCallId: string, action: ClientChatAction): void {
		const key = `${this._toolCallKey(chatURI, turnId, toolCallId)}\0${action.type}`;
		if (this._resolvedToolCalls.has(key)) {
			this._logService.trace(`[AgentHost] Tool call outcome was already dispatched: ${toolCallId} (${action.type})`);
			return;
		}
		this._resolvedToolCalls.add(key);
		this._config.connection.dispatch(chatURI, action);
	}

	private _forgetResolvedToolCall(toolCallKey: string): void {
		for (const key of this._resolvedToolCalls) {
			if (key.startsWith(`${toolCallKey}\0`)) {
				this._resolvedToolCalls.delete(key);
			}
		}
	}

	private _setupOtherClientToolCall(
		initial: ToolCallState,
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const toolCallId = initial.toolCallId;
		const adopted = snapshotInvocationToAdopt(opts, toolCallId);
		const invocation = adopted ?? toolCallStateToInvocation(
			initial,
			opts.subAgentInvocationId,
			opts.backendSession,
			this._config.connectionAuthority,
			opts.sessionResource.authority,
			this._otherClientToolInvocationOptions(opts.backendSession, opts.chatURI, opts.turnId),
			this._config.connection.resourceUris,
		);
		if (!adopted) {
			opts.sink([invocation]);
		}

		store.add(autorun(reader => {
			const toolCall = part$.read(reader).toolCall;
			if ((toolCall.status === ToolCallStatus.Completed || toolCall.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
				const fileEdits = finalizeToolInvocation(invocation, toolCall, opts.backendSession, this._config.connectionAuthority, this._config.connection.resourceUris);
				if (fileEdits.length > 0) {
					opts.onFileEdits?.(toolCall, fileEdits);
				}
			}
		}));

		store.add(toDisposable(() => {
			if (!IChatToolInvocation.isComplete(invocation)) {
				invocation.didExecuteTool(undefined);
			}
		}));
	}

	private _otherClientToolInvocationOptions(backendSession: URI, chatURI: string, turnId: string): IAgentHostToolInvocationOptions {
		return {
			currentClientId: this._config.connection.clientId,
			cancelOtherClientToolCall: toolCall => {
				const reasonMessage = localize('agentHost.otherClientTool.skippedError', "{0} was skipped from another client", toolCall.displayName);
				this._dispatchAction(backendSession, toolCall.status === ToolCallStatus.PendingConfirmation
					? {
						type: ActionType.ChatToolCallConfirmed,
						turnId,
						toolCallId: toolCall.toolCallId,
						approved: false,
						reason: ToolCallCancellationReason.Skipped,
						reasonMessage,
					}
					: {
						type: ActionType.ChatToolCallComplete,
						turnId,
						toolCallId: toolCall.toolCallId,
						result: {
							success: false,
							pastTenseMessage: localize('agentHost.otherClientTool.skipped', "Skipped {0}", toolCall.displayName),
							error: { message: reasonMessage, code: 'cancelled' },
						},
					}, chatURI);
			},
		};
	}

	/**
	 * Per-call setup for a server-driven tool. Adopts a snapshot
	 * {@link ChatToolInvocation} when present (reconnect parity); otherwise
	 * emits a fresh one. Reacts to status transitions for re-confirmation,
	 * terminal revival, finalization, and subagent observation.
	 *
	 * `renderedBySnapshot` marks a settled tool call the reconnect snapshot
	 * already rendered as a serialized part. The invocation is still built so
	 * subagent observation has something to drive, but it is not emitted —
	 * the snapshot's part is the one on screen.
	 */
	private _setupServerToolCall(
		initial: ToolCallState,
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
		subagentContext: ISubagentContext,
		renderedBySnapshot = false,
	): void {
		const toolCallId = initial.toolCallId;
		const subAgentInvocationId = opts.subAgentInvocationId;
		const adopted = snapshotInvocationToAdopt(opts, toolCallId);
		let confirmationOptions = initial.status === ToolCallStatus.PendingConfirmation ? initial.options : undefined;
		// Tools that stream their arguments (reliably: terminal/bash commands)
		// are first observed in `Streaming`. Represent them with a native
		// streaming `ChatToolInvocation` and later drive it through
		// `transitionFromStreaming` (see the autorun below), so a single card
		// spans the whole lifecycle instead of a settled placeholder plus a
		// separate confirmation card (#314858).
		let invocation: ChatToolInvocation;
		if (adopted) {
			invocation = adopted;
		} else if (initial.status === ToolCallStatus.Streaming) {
			invocation = toolCallStateToStreamingInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
			if (!renderedBySnapshot) {
				opts.sink([invocation]);
			}
		} else {
			invocation = toolCallStateToInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority, undefined, this._config.connection.resourceUris);
			if (!renderedBySnapshot) {
				opts.sink([invocation]);
			}
		}

		// Hook up a tool first observed after it already entered confirmation.
		if (initial.status === ToolCallStatus.PendingConfirmation && !IChatToolInvocation.isComplete(invocation)) {
			this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, () => confirmationOptions, opts.chatURI);
		}
		this._tryObserveSubagentToolCall(initial, invocation, store, opts, subagentContext);
		const outputTerminalAttachment: IOutputTerminalAttachment = {
			disposable: store.add(new MutableDisposable())
		};

		// Reuse the invocation whenever a tool enters confirmation to avoid duplicate cards.
		let previousStatus: ToolCallStatus | undefined = initial.status;
		store.add(autorun(reader => {
			const tc = part$.read(reader).toolCall;
			const status = tc.status;
			const priorStatus = previousStatus;
			if (status === ToolCallStatus.PendingConfirmation) {
				confirmationOptions = tc.options;
			}
			const enteringConfirmation = status === ToolCallStatus.PendingConfirmation
				&& previousStatus !== ToolCallStatus.PendingConfirmation;
			previousStatus = status;

			if (status === ToolCallStatus.Streaming) {
				updateStreamingToolInvocation(invocation, tc, this._config.connectionAuthority);
			} else if (enteringConfirmation) {
				// A re-ask is a fresh obligation, so a previous answer must not
				// suppress this one.
				this._forgetResolvedToolCall(this._toolCallKey(opts.chatURI, opts.turnId, toolCallId));
				if (!IChatToolInvocation.isComplete(invocation)) {
					const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority, undefined, this._config.connection.resourceUris);
					invocation.requestConfirmation(prepared);
					this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, () => confirmationOptions, opts.chatURI);
				}
			} else if (status === ToolCallStatus.PendingConfirmation) {
				// The protocol can refresh a pending tool's command without an
				// intervening status transition. Refresh the whole presentation, not
				// just its message, so voice exposes the command that is
				// actually awaiting approval while preserving the current gate.
				const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority, undefined, this._config.connection.resourceUris);
				invocation.updatePreparedInvocation(prepared, invocation.parameters);
			} else if (status === ToolCallStatus.AuthRequired) {
				this._ensureLeftStreaming(invocation, tc, opts);
				invocation.setAuthenticationRequired(toolCallAuthenticationServer(tc, opts.sessionResource.authority), () => {
					this._dispatchAction(opts.backendSession, {
						type: ActionType.ChatToolCallComplete,
						turnId: opts.turnId,
						toolCallId,
						result: {
							success: false,
							pastTenseMessage: localize('agentHost.mcpToolAuthentication.cancelled', "Cancelled tool call"),
							error: { message: localize('agentHost.mcpToolAuthentication.cancelledError', "MCP authentication was cancelled"), code: 'cancelled' },
						},
					}, opts.chatURI);
				});
			} else if (status === ToolCallStatus.Running || status === ToolCallStatus.PendingResultConfirmation) {
				if (priorStatus === ToolCallStatus.AuthRequired) {
					invocation.setAuthenticationResolved();
				}
				this._ensureLeftStreaming(invocation, tc, opts);
				const invocationMessage = stringOrMarkdownToString(tc.invocationMessage, this._config.connectionAuthority);
				const previousInvocationMessage = typeof invocation.invocationMessage === 'string' ? invocation.invocationMessage : invocation.invocationMessage.value;
				const nextInvocationMessage = typeof invocationMessage === 'string' ? invocationMessage : invocationMessage?.value;
				const invocationMessageChanged = nextInvocationMessage !== undefined && nextInvocationMessage !== previousInvocationMessage;
				if (invocationMessage !== undefined) {
					invocation.invocationMessage = invocationMessage;
				}
				this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession, opts.chatURI, outputTerminalAttachment);
				updateRunningToolSpecificData(invocation, tc, opts.backendSession, this._config.connectionAuthority, this._config.connection.resourceUris);
				if (invocationMessageChanged) {
					invocation.notifyToolSpecificDataChanged();
				}
			}

			this._tryObserveSubagentToolCall(tc, invocation, store, opts, subagentContext);

			if ((status === ToolCallStatus.Completed || status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
				// Detach live non-PTY output before completion synchronously rebuilds the terminal subpart.
				if (status === ToolCallStatus.Completed) {
					this._ensureLeftStreaming(invocation, tc, opts);
				}
				this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession, opts.chatURI, outputTerminalAttachment);
				const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority, this._config.connection.resourceUris);
				if (fileEdits.length > 0) {
					opts.onFileEdits?.(tc, fileEdits);
				}
			}
		}));

		// If the turn ends with the tool still mid-flight (e.g. external
		// cancellation), settle the invocation so the UI does not get stuck.
		store.add(toDisposable(() => {
			if (!IChatToolInvocation.isComplete(invocation)) {
				invocation.didExecuteTool(undefined);
			}
		}));
	}

	/** Transitions an invocation from streaming once its AHP tool call is ready. */
	private _ensureLeftStreaming(
		invocation: ChatToolInvocation,
		tc: ToolCallState,
		opts: IObserveTurnOptions,
	): void {
		if (invocation.state.read(undefined).type !== IChatToolInvocation.StateKind.Streaming) {
			return;
		}
		const prepared = toolCallStateToPreparedInvocation(tc, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority, undefined, this._config.connection.resourceUris);
		invocation.transitionFromStreaming(prepared, undefined, undefined);
	}

	/**
	 * Observes the child chat for any subagent-spawning tool, including client-provided delegated tasks.
	 */
	private _tryObserveSubagentToolCall(
		toolCall: ToolCallState,
		invocation: ChatToolInvocation,
		store: DisposableStore,
		opts: IObserveTurnOptions,
		subagentContext: ISubagentContext,
	): void {
		const toolCallId = toolCall.toolCallId;
		const hasSubagentContent = (toolCall.status === ToolCallStatus.Running || toolCall.status === ToolCallStatus.Completed)
			&& !!getToolSubagentContent(toolCall);
		if (!isSubagentTool(toolCall) && !hasSubagentContent) {
			return;
		}

		const isObserved = subagentContext.observations.has(toolCallId);
		const currentData = invocation.toolSpecificData?.kind === 'subagent' ? invocation.toolSpecificData : undefined;
		const prepared = toolCallStateToPreparedInvocation(toolCall, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority, undefined, this._config.connection.resourceUris);
		const protocolData = prepared.toolSpecificData?.kind === 'subagent' ? prepared.toolSpecificData : undefined;
		if (!protocolData) {
			return;
		}
		const chatResource = protocolData.chatResource ?? currentData?.chatResource;
		const description = protocolData.description ?? currentData?.description;
		const agentName = protocolData.agentName ?? currentData?.agentName;
		if (!currentData
			|| currentData.chatResource !== chatResource
			|| currentData.description !== description
			|| currentData.agentName !== agentName) {
			invocation.toolSpecificData = {
				...currentData,
				...protocolData,
				chatResource,
				description,
				agentName,
				isActive: currentData?.isActive ?? isObserved,
			};
			invocation.notifyToolSpecificDataChanged();
		}

		if (isObserved && !shouldObserveSubagentChat(toolCall)) {
			subagentContext.observations.deleteAndDispose(toolCallId);
			return;
		}
		if (isObserved) {
			return;
		}
		if (!shouldObserveSubagentChat(toolCall)) {
			return;
		}

		const subagentData = invocation.toolSpecificData;
		if (subagentData?.kind !== 'subagent') {
			return;
		}
		const observationStore = new DisposableStore();
		subagentContext.observations.set(toolCallId, observationStore);
		subagentData.isActive = true;
		invocation.notifyToolSpecificDataChanged();

		const perInvocationCredits = observableValue<number>('subagentInvocationCredits', 0);
		observationStore.add(autorun(reader => {
			const total = perInvocationCredits.read(reader);
			if (total > 0 && invocation.toolSpecificData?.kind === 'subagent' && invocation.toolSpecificData.credits !== total) {
				invocation.toolSpecificData.credits = total;
				invocation.notifyToolSpecificDataChanged();
			}
		}));

		const perInvocationModel = observableValue<string | undefined>('subagentInvocationModel', undefined);
		observationStore.add(autorun(reader => {
			const modelName = perInvocationModel.read(reader);
			if (modelName && invocation.toolSpecificData?.kind === 'subagent' && invocation.toolSpecificData.modelName !== modelName) {
				invocation.toolSpecificData.modelName = modelName;
				invocation.notifyToolSpecificDataChanged();
			}
		}));

		const rootInvocationId = opts.subAgentInvocationId ?? toolCallId;
		const childChatUri = subagentData.chatResource
			|| buildSubagentChatUri(opts.backendSession.toString(), toolCallId);
		this._observeSubagentSession(opts.sessionResource, opts.backendSession, toolCallId, childChatUri, rootInvocationId, invocation, opts.sink, observationStore, subagentContext, perInvocationCredits, perInvocationModel);
	}

	/**
	 * Per-call setup for a client-provided tool. The observer only renders: it
	 * obtains the shared {@link ChatToolInvocation} (created by whichever of
	 * this observer or the session-level watcher arrives first), emits it into
	 * this chat so it renders in the correct group, drives subagent
	 * presentation, and dispatches `ChatToolCallConfirmed` from the
	 * invocation's confirmation gate. It never invokes the tool — the
	 * session-level watcher owns execution.
	 */
	private _setupClientToolCall(
		initial: ToolCallState,
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
		subagentContext: ISubagentContext,
		renderedBySnapshot = false,
	): void {
		const toolCallId = initial.toolCallId;
		const toolName = initial.toolName;

		// Reconnect adoption: settle any snapshot invocation so the shared
		// invocation can take over the UI slot rather than leaving the old
		// instance orphaned.
		const adopted = snapshotInvocationToAdopt(opts, toolCallId);
		if (adopted && !IChatToolInvocation.isComplete(adopted)) {
			adopted.didExecuteTool(undefined);
		}

		const toolData = this._resolveClientTool(toolName);
		if (!toolData) {
			this._logService.warn(`[AgentHost] Client tool call for unknown tool: ${toolName}`);
			this._dispatchAction(opts.backendSession, {
				type: ActionType.ChatToolCallComplete,
				turnId: opts.turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: `Tool "${toolName}" is not available`,
					error: { message: `Tool "${toolName}" is not available on this client` },
				},
			}, opts.chatURI);
			return;
		}

		const invocation = this._ensureClientToolInvocation(opts.chatURI, opts.turnId, toolCallId, toolData.id, opts.subAgentInvocationId);
		if (!invocation) {
			this._logService.warn(`[AgentHost] Failed to begin client tool invocation: ${toolName}`);
			this._dispatchAction(opts.backendSession, {
				type: ActionType.ChatToolCallComplete,
				turnId: opts.turnId,
				toolCallId,
				result: {
					success: false,
					pastTenseMessage: `Failed to start ${toolName}`,
					error: { message: `Could not create invocation for client tool "${toolName}"` },
				},
			}, opts.chatURI);
			return;
		}

		if (isSubagentTool(initial)) {
			const prepared = toolCallStateToPreparedInvocation(initial, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority, undefined, this._config.connection.resourceUris);
			if (prepared.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData = prepared.toolSpecificData;
			}
		}
		this._tryObserveSubagentToolCall(initial, invocation, store, opts, subagentContext);

		// The shared invocation is created with no `sessionResource`, so it
		// does not `appendProgress` into a chat model. Emit it explicitly so it
		// renders in this chat / subagent group (mirrors `_setupServerToolCall`).
		if (!renderedBySnapshot) {
			opts.sink([invocation]);
		}

		let confirmationDispatched = false;

		// Drive `ChatToolCallConfirmed` from the invocation's confirmation
		// gate. The watcher's `invokeTool` transitions the shared invocation;
		// this reports the outcome to the protocol. The autorun runs
		// synchronously many times; the guard keeps it idempotent.
		store.add(autorun(reader => {
			const state = invocation.state.read(reader);
			if (confirmationDispatched) {
				return;
			}
			if (state.type === IChatToolInvocation.StateKind.Executing) {
				confirmationDispatched = true;
				const selectedOptionId = state.confirmed.type === ToolConfirmKind.UserAction ? state.confirmed.selectedButton : undefined;
				const approved = state.confirmed.type !== ToolConfirmKind.UserAction
					|| state.confirmed.selectedButtonKind !== ConfirmationOptionKind.Deny;
				this._resolveToolCall(opts.chatURI, opts.turnId, toolCallId, approved
					? {
						type: ActionType.ChatToolCallConfirmed,
						turnId: opts.turnId,
						toolCallId,
						approved: true,
						confirmed: confirmedReasonToProtocol(state.confirmed),
						...(selectedOptionId ? { selectedOptionId } : {}),
					}
					: {
						type: ActionType.ChatToolCallConfirmed,
						turnId: opts.turnId,
						toolCallId,
						approved: false,
						reason: ToolCallCancellationReason.Denied,
						...(selectedOptionId ? { selectedOptionId } : {}),
					});
			} else if (state.type === IChatToolInvocation.StateKind.Cancelled) {
				// Pre-execution cancellation (a denied confirmation). If the
				// protocol call already reached a terminal state the server
				// drove it, so suppress the dispatch.
				confirmationDispatched = true;
				const status = part$.read(undefined).toolCall.status;
				if (status === ToolCallStatus.Cancelled || status === ToolCallStatus.Completed) {
					return;
				}
				this._resolveToolCall(opts.chatURI, opts.turnId, toolCallId, {
					type: ActionType.ChatToolCallConfirmed,
					turnId: opts.turnId,
					toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
				});
			}
		}));

		store.add(autorun(reader => {
			const tc = part$.read(reader).toolCall;
			this._tryObserveSubagentToolCall(tc, invocation, store, opts, subagentContext);
			const cancellation = tc.status === ToolCallStatus.Cancelled
				? {
					reason: tc.reason === ToolCallCancellationReason.Skipped ? ToolConfirmKind.Skipped : ToolConfirmKind.Denied,
					reasonMessage: tc.reasonMessage ? stringOrMarkdownToString(tc.reasonMessage, this._config.connectionAuthority) : undefined,
				} as const
				: tc.status === ToolCallStatus.Completed && !tc.success && tc.error?.code === 'cancelled'
					? { reason: ToolConfirmKind.Skipped, reasonMessage: tc.error.message } as const
					: undefined;
			if (cancellation && !invocation.cancelFromStreaming(cancellation.reason, cancellation.reasonMessage)) {
				IChatToolInvocation.confirmWith(invocation, { type: cancellation.reason });
			}
			if ((tc.status === ToolCallStatus.Cancelled || tc.status === ToolCallStatus.Completed)
				&& !IChatToolInvocation.isComplete(invocation, reader)) {
				const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority, this._config.connection.resourceUris);
				if (fileEdits.length > 0) {
					opts.onFileEdits?.(tc, fileEdits);
				}
			}
		}));
	}

	private _setupInputRequestPart(
		part$: IObservable<InputRequestResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const inputReq = part$.get().request;
		// Claim the elicitation so the session-level responder does not cancel
		// it while an observer is rendering it. This covers all three render
		// paths below, since each is reached only through this method.
		store.add(this._markInputRequestRendered(opts.chatURI, inputReq.id, opts.sessionResource));
		const planReview = (inputReq as ChatInputRequestWithPlanReview).planReview;
		if (planReview) {
			this._setupPlanReviewInputRequest(part$, planReview, store, opts);
			return;
		}

		if (inputReq.url) {
			this._setupUrlInputRequest(part$, inputReq.url, store, opts);
			return;
		}

		const carousel = createInputRequestCarousel(inputReq, this._config.connectionAuthority);
		opts.sink([carousel]);

		let completedFromServer = false;
		store.add(autorun(reader => {
			const part = part$.read(reader);
			if (part.response === undefined) {
				return;
			}
			completedFromServer = true;
			const protocolAnswers = part.response === ChatInputResponseKind.Accept
				? part.request.answers
				: undefined;
			const carouselAnswers = convertProtocolAnswers(protocolAnswers);
			const wasUsed = carousel.isUsed;
			carousel.data = carouselAnswers ?? {};
			carousel.isUsed = true;
			carousel.answeredExternally = part.response === ChatInputResponseKind.Accept && !carouselAnswers;
			carousel.autoReply = containsAutomaticReplyAnswer(protocolAnswers);
			carousel.answeredExternally ||= carousel.autoReply;
			carousel.draftAnswers = undefined;
			carousel.draftCurrentIndex = undefined;
			carousel.draftCollapsed = undefined;
			carousel.completion.complete({ answers: carouselAnswers });
			if (!wasUsed) {
				this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(undefined, inputReq.id);
			}
		}));

		carousel.completion.p.then(result => {
			if (store.isDisposed || completedFromServer) {
				return;
			}
			if (!result.answers) {
				this._config.connection.dispatch(opts.chatURI, {
					type: ActionType.ChatInputCompleted,
					requestId: inputReq.id,
					response: ChatInputResponseKind.Cancel,
				});
			} else {
				const answers = convertCarouselAnswers(result.answers, inputReq.questions);
				this._config.connection.dispatch(opts.chatURI, {
					type: ActionType.ChatInputCompleted,
					requestId: inputReq.id,
					response: ChatInputResponseKind.Accept,
					answers,
				});
			}
		});

		if (opts.cancellationToken.isCancellationRequested) {
			carousel.completion.complete({ answers: undefined });
		} else {
			const tokenListener = opts.cancellationToken.onCancellationRequested(() => {
				carousel.completion.complete({ answers: undefined });
			});
			carousel.completion.p.finally(() => tokenListener.dispose());
		}

		store.add(toDisposable(() => {
			if (carousel.isUsed) {
				return;
			}
			carousel.data = {};
			carousel.isUsed = true;
			carousel.draftAnswers = undefined;
			carousel.draftCurrentIndex = undefined;
			carousel.draftCollapsed = undefined;
			carousel.completion.complete({ answers: undefined });
			this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(undefined, inputReq.id);
		}));
	}

	private _setupPlanReviewInputRequest(
		part$: IObservable<InputRequestResponsePart>,
		planReview: IAgentHostPlanReview,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const inputReq = part$.get().request;
		const review = createInputRequestPlanReview(inputReq, planReview, this._config.connection.resourceUris);
		opts.sink([review]);

		let inputCompleted = false;
		let latestResult: IChatPlanReviewResult | undefined = convertProtocolPlanReviewResult(planReview, ChatInputResponseKind.Accept, inputReq.answers);
		let planReviewCleared = false;
		const clearPlanReview = () => {
			if (planReviewCleared) {
				return;
			}
			planReviewCleared = true;
			this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearPlanReview(undefined, inputReq.id);
		};

		store.add(autorun(reader => {
			const part = part$.read(reader);
			if (part.response === undefined) {
				return;
			}
			inputCompleted = true;
			latestResult = convertProtocolPlanReviewResult(planReview, part.response, part.request.answers);
			review.data = latestResult;
			review.isUsed = true;
			review.draftFeedback = undefined;
			review.draftCollapsed = undefined;
			void review.completion.complete(latestResult);
			clearPlanReview();
		}));

		review.completion.p.then(result => {
			if (store.isDisposed || inputCompleted) {
				return;
			}
			const completion = result
				? convertPlanReviewResult(planReview, result)
				: { response: ChatInputResponseKind.Cancel };
			this._config.connection.dispatch(opts.chatURI, {
				type: ActionType.ChatInputCompleted,
				requestId: inputReq.id,
				...completion,
			});
		});

		if (opts.cancellationToken.isCancellationRequested) {
			review.dismiss();
		} else {
			const tokenListener = opts.cancellationToken.onCancellationRequested(() => review.dismiss());
			review.completion.p.finally(() => tokenListener.dispose());
		}

		store.add(toDisposable(() => {
			if (!review.isUsed) {
				if (inputCompleted) {
					review.data = latestResult;
					review.isUsed = true;
					review.draftFeedback = undefined;
					review.draftCollapsed = undefined;
					void review.completion.complete(latestResult);
				} else {
					review.dismiss();
				}
			}
			clearPlanReview();
		}));
	}

	/**
	 * Handle a URL-style {@link ChatInputRequest} by rendering a
	 * {@link ChatElicitationRequestPart} that prompts the user to open the
	 * URL. Clicking the accept button opens the URL via {@link IOpenerService}
	 * and dispatches `ChatInputCompleted` with `Accept`; reject dispatches
	 * `Decline`; abandonment / cancellation dispatches `Cancel`.
	 */
	private _setupUrlInputRequest(
		responsePart$: IObservable<InputRequestResponsePart>,
		url: string,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const inputReq = responsePart$.get().request;
		let completionDispatched = false;
		let completedFromServer = false;
		const settle = (response: ChatInputResponseKind) => {
			if (completionDispatched || completedFromServer) {
				return;
			}
			completionDispatched = true;
			this._config.connection.dispatch(opts.chatURI, {
				type: ActionType.ChatInputCompleted,
				requestId: inputReq.id,
				response,
			});
		};

		const presentation = getUrlInputRequestPresentation(inputReq, url);

		const part = new ChatElicitationRequestPart(
			localize('agentHost.elicit.url.title', "Authorization Required"),
			presentation.message,
			'',
			localize('agentHost.elicit.url.open', "Open {0}", presentation.authority),
			localize('agentHost.elicit.url.cancel', "Cancel"),
			async () => {
				try {
					const opened = await this._openerService.open(url, { allowCommands: false });
					if (opened) {
						settle(ChatInputResponseKind.Accept);
						return ElicitationState.Accepted;
					}
					settle(ChatInputResponseKind.Decline);
					return ElicitationState.Rejected;
				} catch {
					settle(ChatInputResponseKind.Decline);
					return ElicitationState.Rejected;
				}
			},
			async () => {
				settle(ChatInputResponseKind.Decline);
				return ElicitationState.Rejected;
			},
		);

		opts.sink([part]);

		store.add(autorun(reader => {
			const response = responsePart$.read(reader).response;
			if (response === undefined) {
				return;
			}
			completedFromServer = true;
			part.state.set(response === ChatInputResponseKind.Accept ? ElicitationState.Accepted : ElicitationState.Rejected, undefined);
			part.hide();
		}));

		if (opts.cancellationToken.isCancellationRequested) {
			settle(ChatInputResponseKind.Cancel);
			part.hide();
		} else {
			const tokenListener = opts.cancellationToken.onCancellationRequested(() => {
				settle(ChatInputResponseKind.Cancel);
				part.hide();
			});
			store.add(toDisposable(() => tokenListener.dispose()));
		}

		// Disposal (turn ended): if the user never resolved the request,
		// dispatch Cancel so the server isn't left hanging.
		store.add(toDisposable(() => {
			settle(ChatInputResponseKind.Cancel);
			part.hide();
		}));
	}

	/**
	 * Synchronizes PTY and non-PTY terminal content, including the live-to-retained output handoff, and updates invocation metadata.
	 */
	private _reviveTerminalIfNeeded(
		invocation: ChatToolInvocation,
		tc: ToolCallState,
		backendSession: URI,
		chatURI: string,
		outputTerminalAttachment: IOutputTerminalAttachment,
	): void {
		// content is only present on Running/Completed/PendingResultConfirmation.
		// toolInput is present on all post-streaming states.
		if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.PendingResultConfirmation) {
			return;
		}
		const terminalContent = getTerminalContent(tc.content);
		const terminalUri = terminalContent?.resource;
		const toolInput = getInlineToolInput(tc.toolInput);
		if (!terminalContent || !terminalUri || !toolInput) {
			return;
		}
		this._terminalChatURIs.set(terminalUri, chatURI);
		invocation.presentation = undefined;
		const sessionId = makeAhpTerminalToolSessionId(terminalUri, backendSession);
		const terminalCommandUri = URI.parse(terminalUri);
		const isPty = terminalContent.isPty !== false;
		const terminalInstance = isPty ? this._ensureTerminalInstance(terminalUri, sessionId) : undefined;
		const hasRetainedNonPtySnapshot = tc.status === ToolCallStatus.Completed
			&& !isPty
			&& terminalContent.result?.exitCode !== undefined
			&& terminalContent.result.preview !== undefined;
		if (hasRetainedNonPtySnapshot) {
			outputTerminalAttachment.disposable.clear();
			outputTerminalAttachment.sessionId = undefined;
		} else if (!isPty && outputTerminalAttachment.sessionId !== sessionId) {
			outputTerminalAttachment.disposable.value = this._agentHostTerminalService.attachOutputTerminal(this._config.connection, terminalCommandUri, sessionId);
			outputTerminalAttachment.sessionId = sessionId;
		}
		const existing = invocation.toolSpecificData?.kind === 'terminal'
			? invocation.toolSpecificData as IChatTerminalToolInvocationData
			: undefined;
		const identityChanged = !!existing && (
			existing.commandLine.original !== toolInput
			|| existing.terminalToolSessionId !== sessionId
			|| existing.terminalCommandUri?.toString() !== terminalCommandUri.toString()
		);
		if (!existing || identityChanged) {
			invocation.toolSpecificData = {
				...existing,
				kind: 'terminal',
				commandLine: { original: toolInput },
				language: 'shellscript',
				terminalToolSessionId: sessionId,
				terminalCommandUri,
				isPty,
				terminalCommandId: identityChanged ? undefined : existing?.terminalCommandId,
				terminalCommandOutput: identityChanged ? undefined : existing?.terminalCommandOutput,
				terminalCommandState: identityChanged ? undefined : existing?.terminalCommandState,
				terminalTheme: identityChanged ? undefined : existing?.terminalTheme,
			};
			invocation.notifyToolSpecificDataChanged();
		}
		const current = invocation.toolSpecificData?.kind === 'terminal'
			? invocation.toolSpecificData
			: undefined;
		if (!terminalInstance || current?.terminalCommandId) {
			if (terminalInstance) {
				void terminalInstance.catch(error => this._logService.error(`[AgentHost] Failed to revive terminal '${terminalUri}'`, error));
			}
			return;
		}
		void terminalInstance.then(() => {
			const current = invocation.toolSpecificData?.kind === 'terminal'
				? invocation.toolSpecificData
				: undefined;
			if (!current || current.terminalToolSessionId !== sessionId || current.terminalCommandId) {
				return;
			}
			const source = this._terminalChatService.getAhpCommandSource(sessionId);
			const command = source?.executingCommandObject ?? source?.commands[source.commands.length - 1];
			if (command?.id) {
				invocation.toolSpecificData = { ...current, terminalCommandId: command.id };
				invocation.notifyToolSpecificDataChanged();
			}
		}, error => this._logService.error(`[AgentHost] Failed to revive terminal '${terminalUri}'`, error));
	}

	// ---- Subagent child session observation ---------------------------------

	/**
	 * Enriches serialized history with inner tool calls from subagent child
	 * sessions. For each subagent tool call found in the history, subscribes
	 * to the corresponding child session and appends its inner tool calls
	 * (with `subAgentInvocationId` set) to the response parts.
	 */
	private async _enrichHistoryWithSubagentCalls(
		history: IChatSessionHistoryItem[],
		parentSession: URI,
		sessionResource: URI,
		sessionState: ISessionWithDefaultChat,
		observations: DisposableStore,
	): Promise<void> {
		const parentSessionStr = parentSession.toString();
		const parentToolCalls = new Map<string, ToolCallState>();
		for (const turn of sessionState.turns) {
			for (const responsePart of turn.responseParts) {
				if (responsePart.kind === ResponsePartKind.ToolCall) {
					parentToolCalls.set(responsePart.toolCall.toolCallId, responsePart.toolCall);
				}
			}
		}
		const subagentChats = new Map(sessionState.chats.flatMap(chat =>
			chat.origin?.kind === ChatOriginKind.Tool ? [[chat.origin.toolCallId, chat] as const] : []
		));
		const subagentInsertions: { item: Extract<IChatSessionHistoryItem, { type: 'response' }>; index: number; toolCallId: string; childChatUri: string }[] = [];

		for (const item of history) {
			if (item.type !== 'response') {
				continue;
			}

			for (let i = 0; i < item.parts.length; i++) {
				const part = item.parts[i];
				if (part.kind !== 'toolInvocationSerialized') {
					continue;
				}
				const subagentChat = subagentChats.get(part.toolCallId);
				if (subagentChat) {
					const existing = part.toolSpecificData?.kind === 'subagent' ? part.toolSpecificData : undefined;
					const parentToolCall = parentToolCalls.get(part.toolCallId);
					const taskDescription = parentToolCall ? readToolCallMeta(parentToolCall).subagentDescription?.trim() : undefined;
					part.toolSpecificData = {
						...existing,
						kind: 'subagent',
						description: taskDescription || subagentChat.title || existing?.description || (typeof part.invocationMessage === 'string' ? part.invocationMessage : part.invocationMessage.value),
						chatResource: subagentChat.resource.toString(),
					};
				}
				if (part.toolSpecificData?.kind === 'subagent') {
					const childChatUri = resolveRestoredSubagentChatResource(
						parentSessionStr,
						part.toolCallId,
						subagentChat?.resource.toString(),
						part.toolSpecificData.chatResource,
					);
					part.toolSpecificData.chatResource = childChatUri;
					subagentInsertions.push({ item, index: i, toolCallId: part.toolCallId, childChatUri });
				}
			}
		}

		if (subagentInsertions.length === 0) {
			return;
		}

		const childStateByUri = new Map<string, Promise<IRestoredSubagentState | undefined>>();
		const getChildState = (childChatUri: string): Promise<IRestoredSubagentState | undefined> => {
			let existing = childStateByUri.get(childChatUri);
			if (!existing) {
				existing = this._loadSubagentState(parentSessionStr, childChatUri).then(state => state ? observations.add(state) : undefined);
				childStateByUri.set(childChatUri, existing);
			}
			return existing;
		};

		const enrichedInsertions = await Promise.all(subagentInsertions.map(async ({ item, index, toolCallId, childChatUri }) => {
			try {
				const observedState = await getChildState(childChatUri);
				const childState = observedState?.getState();
				let parentPart = item.parts[index];
				if (childState) {
					this._applySubagentUsageToHistoryPart(parentPart, sessionResource, childState);
				}
				const parentToolCall = parentToolCalls.get(toolCallId);
				if (childState?.activeTurn && parentToolCall && parentPart.kind === 'toolInvocationSerialized') {
					const serialized = parentPart;
					const invocation = toolCallStateToInvocation(parentToolCall, undefined, parentSession, this._config.connectionAuthority, undefined, undefined, this._config.connection.resourceUris);
					finalizeToolInvocation(invocation, parentToolCall, parentSession, this._config.connectionAuthority, this._config.connection.resourceUris);
					invocation.presentation = serialized.presentation;
					if (serialized.toolSpecificData?.kind === 'subagent') {
						invocation.toolSpecificData = serialized.toolSpecificData;
					}
					item.parts[index] = invocation;
					parentPart = invocation;
				}
				const innerParts = childState ? this._getSubagentInnerParts(childChatUri, toolCallId, childState) : [];
				if (observedState && childState && (parentPart instanceof ChatToolInvocation || innerParts.some(part => part instanceof ChatToolInvocation))) {
					observations.add(observedState.onDidChange(() => {
						const latestState = observedState.getState();
						if (latestState) {
							this._refreshRestoredSubagentParts(parentPart, innerParts, sessionResource, childChatUri, latestState);
						}
					}));
				}
				return { item, index, innerParts };
			} catch (err) {
				this._logService.warn(`[AgentHost] Failed to enrich history with subagent calls: ${childChatUri}`, err);
				return { item, index, innerParts: [] };
			}
		}));

		for (const { item, index, innerParts } of enrichedInsertions.sort((a, b) => b.index - a.index)) {
			if (innerParts.length > 0) {
				item.parts.splice(index + 1, 0, ...innerParts);
			}
		}
	}

	private async _loadSubagentState(parentSessionUri: string, childChatUri: string): Promise<IRestoredSubagentState | undefined> {
		const childSub = this._ensureSessionSubscription(parentSessionUri);
		try {
			await this._whenSubscriptionHydrated(childSub, CancellationToken.None);
			if (childSub.value instanceof Error) {
				throw childSub.value;
			}
			const childChatSub = this._ensureChatSubscription(parentSessionUri, childChatUri);
			await this._whenSubscriptionHydrated(childChatSub, CancellationToken.None);
			if (childChatSub.value instanceof Error) {
				throw childChatSub.value;
			}
			const store = new DisposableStore();
			const onDidChange = store.add(new Emitter<void>());
			store.add(childSub.onDidChange(() => onDidChange.fire()));
			store.add(childChatSub.onDidChange(() => onDidChange.fire()));
			store.add(toDisposable(() => this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri)));
			return {
				onDidChange: onDidChange.event,
				getState: () => this._getSessionState(parentSessionUri, childChatUri),
				dispose: () => store.dispose(),
			};
		} catch (error) {
			this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri);
			throw error;
		}
	}

	/**
	 * Writes a subagent's accumulated cost (AIC) and model — summed across its
	 * child session's turns — onto its serialized subagent tool call so the
	 * hover survives a reload. Mirrors the live observers in
	 * {@link _setupServerToolCall}.
	 */
	private _applySubagentUsageToHistoryPart(part: IChatProgress, sessionResource: URI, childState: ISessionWithDefaultChat): void {
		if ((part.kind !== 'toolInvocationSerialized' && part.kind !== 'toolInvocation') || part.toolSpecificData?.kind !== 'subagent') {
			return;
		}
		let credits = 0;
		let modelName: string | undefined;
		const turns = childState.activeTurn && !childState.turns.some(turn => turn.id === childState.activeTurn?.id)
			? [...childState.turns, childState.activeTurn]
			: childState.turns;
		for (const turn of turns) {
			const turnCredits = usageInfoToChatUsage(turn.usage)?.copilotCredits;
			if (typeof turnCredits === 'number') {
				credits += turnCredits;
			}
			const turnModelId = this._toLanguageModelId(sessionResource, turn.usage?.model);
			const turnModelName = this._getLanguageModelDisplayName(turnModelId);
			if (turnModelName) {
				modelName = turnModelName;
			}
		}
		if (credits > 0) {
			part.toolSpecificData.credits = credits;
		}
		if (modelName && !part.toolSpecificData.modelName) {
			part.toolSpecificData.modelName = modelName;
		}
		const timing = getSubagentTiming(childState);
		part.toolSpecificData.isActive = !!childState.activeTurn;
		part.toolSpecificData.startedAt = timing.startedAt;
		part.toolSpecificData.duration = timing.duration;
		if (part instanceof ChatToolInvocation) {
			part.notifyToolSpecificDataChanged();
		}
	}

	private _refreshRestoredSubagentParts(parentPart: IChatProgress, innerParts: IChatProgress[], sessionResource: URI, childChatUri: string, childState: ISessionWithDefaultChat): void {
		this._applySubagentUsageToHistoryPart(parentPart, sessionResource, childState);
		const toolCalls = new Map<string, ToolCallState>();
		const turns = childState.activeTurn && !childState.turns.some(turn => turn.id === childState.activeTurn?.id)
			? [...childState.turns, childState.activeTurn]
			: childState.turns;
		for (const turn of turns) {
			for (const responsePart of turn.responseParts) {
				if (responsePart.kind === ResponsePartKind.ToolCall) {
					toolCalls.set(responsePart.toolCall.toolCallId, responsePart.toolCall);
				}
			}
		}
		const childResource = URI.parse(childChatUri);
		for (const part of innerParts) {
			if (!(part instanceof ChatToolInvocation)) {
				continue;
			}
			const toolCall = toolCalls.get(part.toolCallId);
			if (!toolCall) {
				continue;
			}
			if ((toolCall.status === ToolCallStatus.Completed || toolCall.status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(part)) {
				finalizeToolInvocation(part, toolCall, childResource, this._config.connectionAuthority, this._config.connection.resourceUris);
			} else if (toolCall.status === ToolCallStatus.Running) {
				updateRunningToolSpecificData(part, toolCall, childResource, this._config.connectionAuthority, this._config.connection.resourceUris);
				part.notifyToolSpecificDataChanged();
			}
		}
	}

	private _getSubagentInnerParts(childSessionUri: string, toolCallId: string, childState: ISessionWithDefaultChat): IChatProgress[] {
		const innerParts: IChatProgress[] = [];
		const turns = childState.activeTurn && !childState.turns.some(turn => turn.id === childState.activeTurn?.id)
			? [...childState.turns, childState.activeTurn]
			: childState.turns;
		for (const turn of turns) {
			for (const rp of turn.responseParts) {
				if (rp.kind === ResponsePartKind.ToolCall) {
					const tc = rp.toolCall;
					if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
						const completedTc = tc as ICompletedToolCall;
						const fileEditParts = completedToolCallToEditParts(completedTc, this._config.connectionAuthority);
						const serialized = completedToolCallToSerialized(completedTc, toolCallId, URI.parse(childSessionUri), this._config.connectionAuthority, this._config.connection.resourceUris);
						if (fileEditParts.length > 0) {
							serialized.presentation = ToolInvocationPresentation.Hidden;
						}
						innerParts.push(serialized);
						innerParts.push(...fileEditParts);
					} else {
						innerParts.push(toolCallStateToInvocation(tc, toolCallId, URI.parse(childSessionUri), this._config.connectionAuthority, undefined, undefined, this._config.connection.resourceUris));
					}
				}
			}
		}
		return innerParts;
	}

	/**
	 * Subscribes to a child subagent session and forwards its tool calls
	 * as progress parts into the parent session's response, with
	 * `subAgentInvocationId` set so the renderer groups them under the parent
	 * subagent widget.
	 *
	 * Implementation: builds a per-turn-id keyed observation over the child
	 * session's `turns` and `activeTurn`. Each turn id discovered gets its
	 * own {@link _observeTurn} instance running in subagent mode (which skips
	 * markdown/reasoning/input-request emission and tags tool calls with the
	 * parent tool call id). Each per-turn observer self-disposes when its
	 * turn reaches a terminal state; the outer observation is torn down when
	 * the caller disposes `disposables`.
	 */
	private _observeSubagentSession(
		sessionResource: URI,
		parentSession: URI,
		parentToolCallId: string,
		childChatUri: string,
		rootInvocationId: string,
		parentInvocation: ChatToolInvocation,
		emitProgress: (parts: IChatProgress[]) => void,
		disposables: DisposableStore,
		subagentContext: ISubagentContext,
		perInvocationCreditsAccumulator: ISettableObservable<number>,
		perInvocationModel: ISettableObservable<string | undefined>,
	): void {
		const parentSessionUri = parentSession.toString();

		const cts = new CancellationTokenSource();
		disposables.add(toDisposable(() => cts.dispose(true)));
		disposables.add(toDisposable(() => {
			if (parentInvocation.toolSpecificData?.kind === 'subagent' && parentInvocation.toolSpecificData.isActive) {
				parentInvocation.toolSpecificData.isActive = false;
				parentInvocation.notifyToolSpecificDataChanged();
			}
		}));

		try {
			const childSub = this._ensureSessionSubscription(parentSessionUri);
			const childChatSub = this._ensureChatSubscription(parentSessionUri, childChatUri);
			disposables.add(toDisposable(() => this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri)));

			const childSessionState$ = observableFromSubscription(this, childSub);
			const childChatState$ = observableFromSubscription(this, childChatSub);
			const childState$ = derived(reader => {
				const session = childSessionState$.read(reader);
				if (!session) {
					return undefined;
				}
				return mergeSessionWithDefaultChat(session, childChatState$.read(reader));
			});
			disposables.add(autorun(reader => {
				const state = childState$.read(reader);
				if (!state || (!state.activeTurn && state.turns.length === 0)) {
					return;
				}
				const isActive = !!state.activeTurn;
				if (parentInvocation.toolSpecificData?.kind === 'subagent') {
					const timing = getSubagentTiming(state);
					const lastResponsePart = state.activeTurn?.responseParts.at(-1);
					const activity = lastResponsePart?.kind === ResponsePartKind.Markdown
						? 'markdown'
						: lastResponsePart?.kind === ResponsePartKind.Reasoning
							? 'reasoning'
							: undefined;
					const fallbackDuration = !isActive && timing.duration === undefined && parentInvocation.toolSpecificData.isActive && parentInvocation.toolSpecificData.startedAt !== undefined
						? Date.now() - parentInvocation.toolSpecificData.startedAt
						: timing.duration;
					if (parentInvocation.toolSpecificData.isActive !== isActive
						|| parentInvocation.toolSpecificData.activity !== activity
						|| parentInvocation.toolSpecificData.startedAt !== timing.startedAt
						|| parentInvocation.toolSpecificData.duration !== fallbackDuration) {
						parentInvocation.toolSpecificData.isActive = isActive;
						if (activity) {
							parentInvocation.toolSpecificData.activity = activity;
						} else {
							delete parentInvocation.toolSpecificData.activity;
						}
						parentInvocation.toolSpecificData.startedAt = timing.startedAt;
						parentInvocation.toolSpecificData.duration = fallbackDuration;
						parentInvocation.notifyToolSpecificDataChanged();
					}
				}
			}));

			const childTurnIds$ = derived(reader => {
				const state = childState$.read(reader);
				if (!state) {
					return [];
				}
				const ids: { id: string }[] = state.turns.map(t => ({ id: t.id }));
				const activeId = state.activeTurn?.id;
				if (activeId !== undefined && !state.turns.some(t => t.id === activeId)) {
					ids.push({ id: activeId });
				}
				return ids;
			});

			disposables.add(autorunPerKeyedItem(
				childTurnIds$,
				t => t.id,
				(turnId, _t$, turnStore) => {
					turnStore.add(this._observeTurn({
						backendSession: parentSession,
						sessionResource,
						chatURI: childChatUri,
						turnId,
						sink: emitProgress,
						cancellationToken: cts.token,
						subAgentInvocationId: rootInvocationId,
						subAgentCreditsAccumulator: perInvocationCreditsAccumulator,
						subAgentModelObservable: perInvocationModel,
					}));
				},
			));
		} catch (err) {
			// Remove from observed set so a later state change can retry
			subagentContext.observations.deleteAndDispose(parentToolCallId);
			this._logService.warn(`[AgentHost] Failed to subscribe to subagent chat: ${childChatUri}`, err);
		}
	}

	// ---- Reconnection to active turn ----------------------------------------

	/**
	 * Wires up an ongoing state listener that streams incremental progress
	 * from an already-running turn into the chat session's progressObs.
	 * This is the reconnection counterpart of {@link _handleTurn}, which
	 * handles newly-initiated turns.
	 */
	private _reconnectToActiveTurn(
		backendSession: URI,
		turnId: string,
		chatSession: AgentHostChatSession,
		initialProgress: IChatProgress[],
		initialResponsePartCount: number,
	): void {
		const sessionKey = backendSession.toString();
		const chatURI = this._getChatURI(chatSession.sessionResource);

		// Live invocations are adopted by per-tool setup; serialized parts mark
		// a settled tool call it must not emit again.
		const snapshotToolCalls = new Map<string, ChatToolInvocation | IChatToolInvocationSerialized>();
		for (const item of initialProgress) {
			if (item instanceof ChatToolInvocation || item.kind === 'toolInvocationSerialized') {
				snapshotToolCalls.set(item.toolCallId, item);
			}
		}

		// Seed last-emitted markdown/reasoning lengths from the snapshot so
		// per-part setup only emits content beyond what `activeTurnToProgress`
		// already produced.
		const seedEmittedLengths = new Map<string, number>();
		const currentState = this._getSessionState(sessionKey, chatURI);
		if (currentState?.activeTurn) {
			for (const rp of currentState.activeTurn.responseParts) {
				if (rp.kind === ResponsePartKind.Markdown || rp.kind === ResponsePartKind.Reasoning) {
					seedEmittedLengths.set(rp.id, rp.content.length);
				}
			}
		}

		const cts = new CancellationTokenSource();
		const reconnectStore = chatSession.registerDisposable(new DisposableStore());
		reconnectStore.add(toDisposable(() => cts.dispose(true)));
		reconnectStore.add(this._observeTurn({
			backendSession,
			sessionResource: chatSession.sessionResource,
			chatURI,
			turnId,
			sink: parts => chatSession.appendProgress(parts),
			cancellationToken: cts.token,
			snapshotToolCalls,
			seedEmittedLengths,
			initialResponsePartCount,
			onTurnEnded: () => {
				chatSession.complete();
				reconnectStore.dispose();
			},
		}));
	}

	// ---- File edit routing ---------------------------------------------------

	/**
	 * Ensures the chat model has a snapshot controller bound (creating one
	 * via our registered editing-session provider if needed) and returns it.
	 * Hydrates the controller from any pending history turns on first access.
	 */
	private _ensureSnapshotController(sessionResource: URI): AgentHostSnapshotController | undefined {
		const chatModel = this._chatService.getSession(sessionResource);
		if (!chatModel) {
			return undefined;
		}

		// Start the editing session if not already started — this will use
		// our registered provider to create an AgentHostSnapshotController.
		if (!chatModel.editingSession) {
			chatModel.startEditingSession();
		}

		const editingSession = chatModel.editingSession;
		if (!(editingSession instanceof AgentHostSnapshotController)) {
			return undefined;
		}

		// Hydrate from historical turns if this is the first time
		// the controller is accessed for this chat session. We seed a
		// request-level checkpoint for every turn (not just turns with
		// edits) so "Restore Checkpoint" on any historical request can
		// find a boundary and mark subsequent requests as disabled via
		// requestDisablement.
		const pendingTurns = this._pendingHistoryTurns.get(sessionResource);
		if (pendingTurns) {
			this._pendingHistoryTurns.delete(sessionResource);
			for (const turn of pendingTurns) {
				editingSession.ensureRequestCheckpoint(turn.id);
				for (const rp of turn.responseParts) {
					if (rp.kind === ResponsePartKind.ToolCall) {
						editingSession.addToolCallEdits(turn.id, rp.toolCall);
					}
				}
			}
		}

		return editingSession;
	}

	/**
	 * Records snapshot data for a completed tool call (so restore-snapshot
	 * works) and returns the {@link IChatExternalEdit} progress parts to
	 * render the per-file edit pills.
	 */
	private _hydrateFileEdits(
		sessionResource: URI,
		requestId: string,
		tc: ToolCallState,
	): IChatProgress[] {
		const controller = this._ensureSnapshotController(sessionResource);
		controller?.addToolCallEdits(requestId, tc);
		if (tc.status !== ToolCallStatus.Completed) {
			return [];
		}
		return completedToolCallToEditParts(tc as ICompletedToolCall, this._config.connectionAuthority);
	}

	// ---- Session resolution -------------------------------------------------

	/**
	 * Attaches to an existing server-side terminal via the agent host
	 * terminal service and registers it with the terminal chat service.
	 *
	 * Returns the terminal instance created or reused by the terminal service.
	 */
	private _ensureTerminalInstance(terminalUri: string, terminalToolSessionId: string): Promise<ITerminalInstance> {
		return this._agentHostTerminalService.reviveTerminal(
			this._config.connection,
			URI.parse(terminalUri),
			terminalToolSessionId
		);
	}

	/** Maps a UI session resource to a backend provider URI. */
	private _resolveSessionUri(sessionResource: URI): URI {
		const provisionalSession = this._provisionalService.get(sessionResource);
		if (provisionalSession) {
			return provisionalSession;
		}
		const rawId = sessionResource.path.substring(1);
		return AgentSession.uri(this._config.backendSessionScheme ?? this._config.provider, rawId);
	}

	private _isNewSessionResource(sessionResource: URI): boolean {
		return !!this._config.isNewSession?.(sessionResource)
			|| this._workingDirectoryResolver.isNewSession(sessionResource);
	}

	/**
	 * Forks the conversation at the given request point into a new peer chat
	 * of the same session. AHP models forking at the chat level only, so the
	 * fork stays inside the source session and is addressed by a chat
	 * fragment on the session resource.
	 */
	private async _forkSession(
		sessionResource: URI,
		backendSession: URI,
		request: IChatSessionRequestHistoryItem | undefined,
		token: CancellationToken,
	): Promise<IChatSessionItem> {
		if (token.isCancellationRequested) {
			throw new Error('Cancelled');
		}

		const agentInfo = this._getRootState()?.agents.find(a => a.provider === this._config.provider);
		if (!agentInfo?.capabilities?.multipleChats?.fork) {
			throw new Error(`Provider ${this._config.provider} does not support forking`);
		}

		const sessionUri = backendSession.toString();
		const rawSessionState = this._getRawSessionState(sessionUri);
		if (!rawSessionState) {
			throw new Error(`Cannot fork: session state is not hydrated for ${sessionUri}`);
		}
		// Fork the chat the gesture came from — a peer chat when the resource
		// carries a chat fragment, else the session's default chat.
		const sourceChat = this._resolveChatUriFromState(sessionResource, rawSessionState);

		// Determine the turn to fork at. If a specific request is provided,
		// fork BEFORE it (keeping turns up to the previous one). This matches
		// the non-contributed path in ForkConversationAction which uses
		// `requestIndex - 1`. If no request is provided, fork the whole chat.
		const protocolState = this._getSessionState(sessionUri, sourceChat);
		let turnIndex: number | undefined;
		if (request) {
			const requestIdx = protocolState?.turns.findIndex(t => t.id === request.id);
			if (requestIdx === undefined || requestIdx < 0) {
				throw new Error(`Cannot fork: turn for request ${request.id} not found in protocol state`);
			}
			// Fork before this request — keep turns [0..requestIdx-1]
			turnIndex = requestIdx - 1;
			if (turnIndex < 0) {
				throw new Error('Cannot fork: cannot fork before the first request');
			}
		} else if (protocolState?.turns.length) {
			turnIndex = protocolState.turns.length - 1;
		}

		if (turnIndex === undefined) {
			throw new Error('Cannot fork: no turns to fork from');
		}

		const turnId = protocolState!.turns[turnIndex].id;
		const chatModel = this._chatService.getSession(sessionResource);

		const forkedChatId = generateUuid();
		const forkedChat = URI.parse(buildChatUri(backendSession, forkedChatId));
		await this._config.connection.createChat(backendSession, forkedChat, {
			model: lastTurnModelSelection(protocolState),
			fork: { source: URI.parse(sourceChat), turnId },
		});

		// The chat is only addressable once the host has published it in the
		// session's chat catalog; hydrating the returned item before then
		// fails to resolve the fragment.
		const sessionSubscription = this._ensureSessionSubscription(sessionUri);
		const forkedSummary = await waitForState(
			observableFromSubscription(this, sessionSubscription).map(state =>
				state?.chats.find(summary => parseChatUri(summary.resource)?.chatId === forkedChatId)),
			(summary): summary is ChatSummary => !!summary,
			undefined,
			token,
		);

		const forkedResource = URI.from({ scheme: this._config.sessionType, path: sessionResource.path, fragment: forkedChatId });
		const now = Date.now();
		const forkedLabel = forkedSummary.title || chatModel?.title || localize('agentHost.forkedSessionLabel', "Forked Session");

		return {
			resource: forkedResource,
			label: forkedLabel,
			iconPath: getAgentSessionProviderIcon(this._config.sessionType),
			timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
		};
	}

	private async _ensureRequiredAuthentication(model: ModelSelection | undefined): Promise<ProtectedResourceMetadata[]> {
		const agentInfo = this._getRootState()?.agents.find(a => a.provider === this._config.provider);
		const protectedResources = agentInfo?.protectedResources ?? [];
		const allowSignedOutWhenUsable = this._configurationService.getValue<boolean>(AgentHostAllowSignedOutWhenUsableSettingId) === true;
		if (modelRequiresAgentAuthentication(agentInfo, model, allowSignedOutWhenUsable) && this._config.resolveAuthentication) {
			const authenticated = await this._config.resolveAuthentication(protectedResources);
			if (!authenticated) {
				throw new Error(localize('agentHost.authRequired', "Authentication is required to start a session. Please sign in and try again."));
			}
		}
		return protectedResources;
	}

	/** Creates a new backend session and subscribes to its state. */
	private async _createAndSubscribe(sessionResource: URI, model: ModelSelection | undefined, config?: Record<string, unknown>, importConversation?: { readonly turns: readonly Turn[]; readonly model?: ModelSelection }, onFailureStage?: (stage: AgentHostInvocationFailureStage) => void): Promise<URI> {
		const workingDirectories = this._resolveRequestedWorkingDirectories(sessionResource);
		const requestedSession = this._resolveSessionUri(sessionResource);
		const meta = this._provisionalService.getInitialSessionMetadata(sessionResource);

		this._logService.trace(`[AgentHost] Creating new session, model=${model?.id ?? '(default)'}, provider=${this._config.provider}`);

		onFailureStage?.('authentication');
		const protectedResources = await this._ensureRequiredAuthentication(model);

		const activeClientEntry = this._ensureActiveClientEntry(sessionResource);
		if (activeClientEntry) {
			await activeClientEntry.whenSettled();
		}
		const activeClient = this._getCurrentActiveClient(sessionResource);

		// Opt in to bring-up progress (chiefly the lazy first-use SDK download)
		// so the editor window surfaces the same download notification the
		// Agents window does. The host echoes the download's own identity on
		// each frame; this token only records interest.
		const progressToken = generateUuid();

		let session: URI;
		onFailureStage?.('createSession');
		try {
			session = await this._config.connection.createSession({
				session: requestedSession,
				_meta: meta,
				model,
				provider: this._config.provider,
				workingDirectories,
				config,
				importConversation,
				activeClient,
				progressToken,
			});
		} catch (err) {
			// If authentication is required (e.g. token expired), try interactive auth and retry once
			if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
				onFailureStage?.('authentication');
				this._logService.info('[AgentHost] Authentication required, prompting user...');
				const authenticated = await this._config.resolveAuthentication(protectedResources);
				if (authenticated) {
					onFailureStage?.('createSession');
					session = await this._config.connection.createSession({
						session: requestedSession,
						_meta: meta,
						model,
						provider: this._config.provider,
						workingDirectories,
						config,
						importConversation,
						activeClient,
						progressToken,
					});
				} else {
					throw new Error(localize('agentHost.authRequired', "Authentication is required to start a session. Please sign in and try again."));
				}
			} else {
				throw err;
			}
		}
		this._provisionalService.clearSessionCreationMetadata(sessionResource);

		if (requestedSession && !isEqual(session, requestedSession)) {
			throw new Error(`Agent host returned unexpected session URI. Expected ${requestedSession.toString()}, got ${session.toString()}`);
		}
		this._config.onSessionMaterialized?.(sessionResource);

		this._logService.trace(`[AgentHost] Created session: ${session.toString()}`);

		// Subscribe to the new session's state
		onFailureStage?.('subscribeSession');
		const newSub = this._ensureSessionSubscription(session.toString());
		this._configureActiveClientReconciliation(sessionResource, session, newSub);
		if (!this._getSessionState(session.toString())) {
			// Wait for the subscription to hydrate. `_whenSubscriptionHydrated`
			// settles on snapshot, error, or cancellation and attaches its
			// listeners before re-checking the value, closing the race where a
			// concurrent consumer (e.g. the chat-input picker) hydrates the
			// subscription between our check and the listener attachment. It
			// also settles on `onDidError` — a failed subscribe flips the
			// subscription via `setError`, which fires `onDidError` but NOT
			// `onDidChange`, so an `onDidChange`-only wait would hang for the
			// full turn timeout (issue #5242).
			await this._whenSubscriptionHydrated(newSub, CancellationToken.None);
		}

		const rawState = this._requireRawSessionState(session.toString());
		const chatURI = this._resolveChatUriFromState(sessionResource, rawState);
		this._setChatURI(sessionResource, chatURI);
		const chatSub = this._ensureChatSubscription(session.toString(), chatURI);
		this._activeSessions.get(sessionResource)?.setStateSubscriptions(newSub, chatSub);

		// Start syncing the chat model's pending requests to the protocol
		this._ensurePendingMessageSubscription(sessionResource, session);

		// Start watching for server-initiated turns on this session
		this._watchForServerInitiatedTurns(session, sessionResource);

		return session;
	}

	/**
	 * Keeps chat model and protocol pending messages synchronized in both directions.
	 * No-ops if already subscribed.
	 */
	private _ensurePendingMessageSubscription(sessionResource: URI, backendSession: URI): void {
		if (this._pendingMessageSubscriptions.has(sessionResource)) {
			return;
		}
		const chatModel = this._chatService?.getSession(sessionResource);
		if (chatModel) {
			const store = new DisposableStore();
			this._pendingMessageSubscriptions.set(sessionResource, store);

			// Hydrate first so the initial outbound diff cannot remove another client's messages.
			this._applyRemotePendingMessages(sessionResource, backendSession);

			store.add(chatModel.onDidChangePendingRequests(() => {
				this._syncPendingMessages(sessionResource, backendSession);
			}));
			this._syncPendingMessages(sessionResource, backendSession);

			const sessionStr = backendSession.toString();
			const chatURI = this._chatURIsBySessionResource.get(sessionResource);
			if (chatURI) {
				const onRemoteChange = () => this._applyRemotePendingMessages(sessionResource, backendSession);
				store.add(this._ensureSessionSubscription(sessionStr).onDidChange(onRemoteChange));
				store.add(this._ensureChatSubscription(sessionStr, chatURI).onDidChange(onRemoteChange));
			}
			return;
		}

		this._pendingMessageSubscriptions.set(sessionResource, this._chatService.onDidCreateModel(model => {
			if (!isEqual(model.sessionResource, sessionResource)) {
				return;
			}
			this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
			this._ensurePendingMessageSubscription(sessionResource, backendSession);
		}));
	}

	private _ensureDraftSyncSubscription(sessionResource: URI, backendSession: URI, chatKey: string): void {
		if (this._draftSyncSubscriptions.has(sessionResource)) {
			return;
		}
		const store = new DisposableStore();
		this._draftSyncSubscriptions.set(sessionResource, store);
		this._acquireOrWaitForSession(sessionResource, store).then(chatModel => {
			if (!chatModel || store.isDisposed) {
				return;
			}
			this._installDraftSync(sessionResource, chatModel, backendSession, chatKey, store);
		}, err => {
			if (!store.isDisposed) {
				this._logService.error(`[AgentHost] Failed to wait for chat model for draft sync: ${sessionResource.toString()}`, err);
			}
		});
	}

	private async _acquireOrWaitForSession(sessionResource: URI, owner: DisposableStore): Promise<IChatModel | undefined> {
		const existing = this._chatService.getSession(sessionResource);
		if (existing) {
			return existing;
		}
		const waitStore = owner.add(new DisposableStore());
		try {
			return await new Promise<IChatModel | undefined>(resolve => {
				waitStore.add(toDisposable(() => resolve(undefined)));
				waitStore.add(this._chatService.onDidCreateModel(model => {
					if (isEqual(model.sessionResource, sessionResource)) {
						resolve(model);
					}
				}));
			});
		} finally {
			waitStore.dispose();
		}
	}

	private _installDraftSync(sessionResource: URI, chatModel: IChatModel, backendSession: URI, chatKey: string, store: DisposableStore): void {
		const inputModel = chatModel.inputModel;
		if (!inputModel) {
			return;
		}
		const delayer = store.add(new Delayer<void>(AgentHostSessionHandler.DRAFT_SYNC_DEBOUNCE_MS));
		const chatSubscription = this._ensureChatSubscription(backendSession.toString(), chatKey);
		const readRemoteDraft = (): Message | undefined => {
			const value = chatSubscription.value;
			return value && !(value instanceof Error) ? value.draft : undefined;
		};
		const draftState = new DraftSyncState(readRemoteDraft());
		// The last `draft` object seen on the chat channel. Protocol state is
		// immutable, so an identical reference means the draft did not change —
		// letting the listener bail on a reference check instead of a deep
		// compare, which matters because it runs on every chat state change
		// (each streaming delta), not just draft changes.
		let lastRemoteDraft = draftState.synced;
		const syncDraft = (state: IChatModelInputState | undefined): void => {
			if (state?.origin === ChatInputStateOrigin.Remote) {
				return;
			}
			let draft = this._inputStateToDraft(sessionResource, state);
			// Don't overwrite the channel's model with one we only fell back to.
			if (draft && draftState.remoteModel && !isInConversationModelChoice(state?.selectedModelReason)) {
				draft = { ...draft, model: draftState.remoteModel };
			}
			if (!draftState.shouldPublish(draft)) {
				return;
			}

			this._config.connection.dispatch(chatKey, {
				type: ActionType.ChatDraftChanged,
				draft,
			});
		};
		store.add(autorun(reader => {
			const state = inputModel.state.read(reader);
			delayer.trigger(() => syncDraft(state)).catch(() => { /* delayer disposed */ });
		}));
		store.add(chatSubscription.onDidChange(() => {
			const remoteDraft = readRemoteDraft();
			if (remoteDraft === lastRemoteDraft) {
				return;
			}
			lastRemoteDraft = remoteDraft;
			if (equals(draftState.synced, remoteDraft)) {
				return;
			}
			const localDraft = this._inputStateToDraft(sessionResource, inputModel.state.get());
			if (!equals(draftState.synced, localDraft)) {
				// The pending outbound debounce will publish the local edit (last writer wins).
				return;
			}
			draftState.applyRemote(remoteDraft);
			this._applyRemoteDraft(inputModel, sessionResource, remoteDraft);
		}));
		store.add(toDisposable(() => {
			delayer.cancel();
			syncDraft(inputModel.state.get());
		}));
	}

	/** Applies a remote draft without replacing local input state the protocol does not carry. */
	private _applyRemoteDraft(inputModel: IInputModel, sessionResource: URI, draft: Message | undefined): void {
		if (!draft) {
			inputModel.setState({
				inputText: '',
				selections: [],
				attachments: [],
				origin: ChatInputStateOrigin.Remote,
			});
			return;
		}
		const serializedState = this._draftToInputState(sessionResource, draft);
		if (!serializedState) {
			return;
		}
		const state = reviveSerializableInputState(serializedState);
		const partialState: Partial<IChatModelInputState> = {
			inputText: state.inputText,
			selections: state.selections,
			attachments: state.attachments,
			mode: state.mode,
			origin: ChatInputStateOrigin.Remote,
		};
		if (state.selectedModel) {
			partialState.selectedModel = state.selectedModel;
			partialState.modelConfiguration = state.modelConfiguration;
		}
		inputModel.setState(partialState);
	}

	private _inputStateToDraft(sessionResource: URI, state: IChatModelInputState | undefined): Message | undefined {
		if (!state) {
			return undefined;
		}
		const model = this._createModelSelection(state.selectedModel?.identifier, state.modelConfiguration);
		const agentUri = state.mode.kind === ChatModeKind.Agent && state.mode.id !== ChatMode.Agent.id ? state.mode.id : undefined;
		const attachments = this._variableEntriesToAttachments(state.attachments, sessionResource, state.inputText, false);
		if (!state.inputText && !model && !agentUri && attachments.length === 0) {
			return undefined;
		}
		return {
			text: state.inputText,
			origin: { kind: MessageKind.User },
			...(attachments.length > 0 ? { attachments } : {}),
			...(model ? { model } : {}),
			...(agentUri ? { agent: { uri: agentUri } } : {}),
		};
	}

	/**
	 * Check if an error is an "authentication required" error.
	 * Checks for the AHP_AUTH_REQUIRED error code when available,
	 * with a message-based fallback for transports that don't preserve
	 * structured error codes (e.g. ProxyChannel).
	 */
	private _isAuthRequiredError(err: unknown): boolean {
		if (err instanceof ProtocolError && err.code === AHP_AUTH_REQUIRED) {
			return true;
		}
		if (err instanceof Error && err.message.includes('Authentication required')) {
			return true;
		}
		return false;
	}

	private _createModelSelection(languageModelIdentifier: string | undefined, modelConfiguration: Record<string, unknown> | undefined): ModelSelection | undefined {
		const rawModelId = this._extractRawModelId(languageModelIdentifier);
		if (!rawModelId) {
			return undefined;
		}

		// Forward model-specific config values as-is. Most pickers produce strings,
		// but a synthesized numeric picker (e.g. the context-size picker, whose enum
		// values are token counts) hands back a number; the protocol `config` bag
		// carries JSON primitives, so the selection survives into it (and is mapped
		// to the SDK context tier by the agent's `getCopilotContextTier`).
		const config: Record<string, JsonPrimitive> = {};
		for (const [key, value] of Object.entries(modelConfiguration ?? {})) {
			if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
				config[key] = value;
			}
		}

		return Object.keys(config).length > 0 ? { id: rawModelId, config } : { id: rawModelId };
	}

	private _draftToInputState(sessionResource: URI, draft: Message | undefined): ISerializableChatModelInputState | undefined {
		if (!draft) {
			return undefined;
		}
		const modelId = this._toLanguageModelId(sessionResource, draft.model?.id);
		const metadata = modelId ? this._languageModelsService.lookupLanguageModel(modelId) : undefined;
		const variableData = messageAttachmentsToVariableData(draft.attachments, this._config.connectionAuthority, draft.text);
		const cursor = offsetToPosition(draft.text, draft.text.length);
		return {
			attachments: variableData?.variables ?? [],
			contrib: {},
			inputText: draft.text,
			mode: { id: draft.agent?.uri ?? ChatMode.Agent.id, kind: ChatModeKind.Agent },
			selectedModel: modelId && metadata ? {
				identifier: modelId,
				metadata,
				...(draft.model?.config ? { modelConfiguration: draft.model.config } : {}),
			} : undefined,
			selections: [{
				selectionStartLineNumber: cursor.lineNumber,
				selectionStartColumn: cursor.column,
				positionLineNumber: cursor.lineNumber,
				positionColumn: cursor.column,
			}],
		};
	}

	/**
	 * Extracts the raw model id from a language-model service identifier.
	 * E.g. "agent-host-copilot:claude-sonnet-4-20250514" → "claude-sonnet-4-20250514".
	 * Foreign extension-host identifiers (`${vendor}/${id}`) are dropped so
	 * the agent host falls back to its default model.
	 */
	private _extractRawModelId(languageModelIdentifier: string | undefined): string | undefined {
		if (!languageModelIdentifier) {
			return undefined;
		}
		const prefix = this._config.sessionType + ':';
		if (languageModelIdentifier.startsWith(prefix)) {
			return languageModelIdentifier.substring(prefix.length);
		}
		if (languageModelIdentifier.includes('/')) {
			this._logService.warn(`[AgentHost] Dropping foreign model identifier '${languageModelIdentifier}' for session type '${this._config.sessionType}'; falling back to default model.`);
			return undefined;
		}
		return languageModelIdentifier;
	}

	private _toLanguageModelId(sessionResource: URI, rawModelId: string | undefined): string | undefined {
		if (!rawModelId) {
			return undefined;
		}
		const prefix = `${getChatSessionType(sessionResource)}:`;
		return rawModelId.startsWith(prefix) ? rawModelId : `${prefix}${rawModelId}`;
	}

	private _getLanguageModelDisplayName(modelIdentifier: string | undefined): string | undefined {
		if (!modelIdentifier) {
			return undefined;
		}
		const metadata = this._languageModelsService.lookupLanguageModel(modelIdentifier);
		return metadata ? getLanguageModelDisplayNameWithProvider({ identifier: modelIdentifier, metadata }, this._languageModelsService) : undefined;
	}

	private _getTurnResponseDetails(sessionResource: URI, backendSession: URI, turn: Turn | undefined): string | undefined {
		const fallbackRawModelId = turn?.message?.model?.id ?? lastTurnModelSelection(this._getSessionState(backendSession.toString()))?.id;
		return this._createTurnModelLookup(sessionResource, fallbackRawModelId).toResponseDetails(turn?.usage?.model, turn?.usage);
	}

	/**
	 * Builds a per-turn model lookup that namespaces raw AHP model ids into
	 * chat-layer language-model ids and resolves human-readable display
	 * names via the registered language-model providers (so the chat UI's
	 * per-response footer can show e.g. "Claude Opus 4.7" instead of the
	 * raw model id). `fallbackRawModelId` is used when a turn's
	 * `usage?.model` is not yet set (e.g. older sessions or turns that
	 * never reported usage).
	 */
	private _createTurnModelLookup(sessionResource: URI, fallbackRawModelId: string | undefined): TurnModelLookup {
		const resolveRaw = (rawModelId: string | undefined): string | undefined => rawModelId ?? fallbackRawModelId;
		// Try the raw billed id and its dots-normalised form (slug mismatch:
		// `claude-sonnet-4-6` → `.6`) before falling back to the picked model.
		const lookupRawModel = (rawModelId: string | undefined): { identifier: string; model: ILanguageModelChatMetadata; resolvedFromRaw: true } | undefined => {
			const normalizedRaw = rawModelId?.replace(/-(\d+)$/, '.$1');
			for (const candidate of [rawModelId, normalizedRaw !== rawModelId ? normalizedRaw : undefined]) {
				const modelId = this._toLanguageModelId(sessionResource, candidate);
				if (!modelId) { continue; }
				const model = this._languageModelsService.lookupLanguageModel(modelId);
				if (model) { return { identifier: modelId, model, resolvedFromRaw: true }; }
			}
			return undefined;
		};
		const lookupModel = (rawModelId: string | undefined): { identifier: string; model: ILanguageModelChatMetadata; resolvedFromRaw: boolean } | undefined => {
			const rawModel = lookupRawModel(rawModelId);
			if (rawModel) {
				return rawModel;
			}
			const fallbackModelId = this._toLanguageModelId(sessionResource, fallbackRawModelId);
			if (fallbackModelId) {
				const model = this._languageModelsService.lookupLanguageModel(fallbackModelId);
				if (model) { return { identifier: fallbackModelId, model, resolvedFromRaw: false }; }
			}
			return undefined;
		};
		return {
			toLanguageModelId: (rawModelId) => this._toLanguageModelId(sessionResource, resolveRaw(rawModelId)),
			toModelDisplayName: rawModelId => lookupRawModel(rawModelId)?.model.name,
			toResponseDetails: (rawModelId, usage) => {
				const resolved = lookupModel(rawModelId);
				// resolvedFromRaw=false means we fell back to the picked model; surface billedModelId so
				// e.g. an "Auto" pick reads "Auto (raptor-mini)".
				const billedModelId = resolved && !resolved.resolvedFromRaw ? rawModelId : undefined;
				const responseModel = resolved ? {
					name: getLanguageModelDisplayNameWithProvider({ identifier: resolved.identifier, metadata: resolved.model }, this._languageModelsService),
					pricing: resolved.model.pricing,
				} : undefined;
				return formatTurnResponseDetails(responseModel, billedModelId, usage);
			},
			toAutoModeResolution: usage => {
				const resolution = readUsageInfoMeta(usage).autoModeResolved;
				const resolved = resolution ? lookupModel(resolution.chosenModel) : undefined;
				const resolvedModelName = resolved?.resolvedFromRaw ? resolved.model.name : undefined;
				return usageInfoToAutoModeResolution(usage, resolvedModelName);
			},
		};
	}

	private _resolveRequestedWorkingDirectory(sessionResource: URI): URI | undefined {
		return this._config.resolveWorkingDirectory?.(sessionResource)
			?? this._newSessionFolderService?.getFolder(sessionResource)
			?? this._workingDirectoryResolver?.resolve(sessionResource)
			?? this._newSessionFolderService?.getDefaultFolder()
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	/** `undefined` is preserved for createSession to let the host choose its working directories. */
	private _resolveRequestedWorkingDirectories(sessionResource: URI): readonly URI[] | undefined {
		const primary = this._resolveRequestedWorkingDirectory(sessionResource);
		return computeWorkingDirectories(primary, this._workspaceContextService.getWorkspace().folders.map(folder => folder.uri), this._getRootState(), this._config.provider);
	}

	/**
	 * Scope roots always describe a concrete customization lookup. This differs
	 * from `_resolveRequestedWorkingDirectories`: its `undefined` is protocol
	 * meaningful and lets the host choose working directories for createSession.
	 *
	 * An existing session's roots are fixed at creation and persisted in its
	 * state, so they are read from there rather than recomputed from the current
	 * workspace — otherwise a single-folder session opened inside a multi-root
	 * workspace would pick up the other workspace folders. New sessions have no
	 * state yet, so they fall back to the workspace-derived set they will be
	 * created with.
	 */
	private _resolveCustomizationScopeRoots(sessionResource: URI): readonly URI[] {
		if (!this._isNewSessionResource(sessionResource)) {
			const own = this._existingSessionWorkingDirectories(sessionResource);
			// An empty set is meaningful (a workspace-less session), so only a
			// missing (`undefined`) result falls back to the workspace-derived set.
			if (own !== undefined) {
				return own;
			}
		}
		return this._resolveRequestedWorkingDirectories(sessionResource) ?? [];
	}

	/**
	 * The working directories an already-created session was started with, read
	 * from its authoritative (hydrated) state.
	 *
	 * Returns `undefined` when the session's working directories are absent — no
	 * hydrated state yet, or a session that inherits its directories — so callers
	 * fall back to the workspace-derived set. An explicit empty set is
	 * authoritative and returned as `[]`: a workspace-less session must not
	 * inherit the current workspace's roots. This mirrors the host-side
	 * `undefined` (inherit) vs `[]` (explicitly none) distinction.
	 */
	private _existingSessionWorkingDirectories(sessionResource: URI): readonly URI[] | undefined {
		const backendSession = this._resolveSessionUri(sessionResource);
		const dirs = this._getRawSessionState(backendSession.toString())?.workingDirectories;
		if (dirs === undefined) {
			return undefined;
		}
		return dirs.map(directory => typeof directory === 'string' ? URI.parse(directory) : directory);
	}

	/**
	 * Resolves the local folders the agent will run in, for the workspace-trust
	 * gate: an existing session's persisted working directories, or a new session's
	 * requested ones.
	 *
	 * Returns `undefined` for a workspace-less session (a quick chat) to signal the
	 * caller to skip the folder-trust gate entirely: its only working directory is
	 * an internal scratch dir (`~/.copilot/chats/<id>`), an implementation detail
	 * rather than a user workspace, so it must not be treated as a trust root.
	 * Otherwise an explicit empty set is honored and only a genuinely unresolved set
	 * falls back to the requested/workspace folders.
	 */
	private async _resolveSessionTrustFolders(sessionResource: URI, token: CancellationToken): Promise<readonly URI[] | undefined> {
		if (!this._isNewSessionResource(sessionResource)) {
			// Read the authoritative session state once — prefer already-hydrated
			// handler-level state, otherwise the eager/connection-level state — so
			// the workspace-less marker and the persisted folders come from the same
			// snapshot, and the gate checks the session's real persisted folders, not
			// the current workspace (which, if it happens to be trusted, would
			// otherwise let an untrusted persisted folder resume without consent).
			const backendSession = this._resolveSessionUri(sessionResource);
			let state = this._getRawSessionState(backendSession.toString());
			if (state?.workingDirectories === undefined) {
				state = await this._readEagerlyCreatedSessionState(backendSession, token) ?? state;
			}
			// A workspace-less session (quick chat) runs only in an internal scratch
			// dir that is not a user workspace; never gate trust on it.
			if (state && readSessionWorkspaceless(state._meta)) {
				return undefined;
			}
			const dirs = state?.workingDirectories;
			if (state && dirs !== undefined) {
				// Inherit trust for a VS Code-created worktree from the trusted base
				// repository so the gate does not prompt for it. Done here (the gate
				// already read the state) so `_ensureFoldersTrusted` short-circuits.
				await this._inheritWorktreeTrust(state);
				return dirs.map(directory => typeof directory === 'string' ? URI.parse(directory) : directory);
			}
		}
		return this._resolveRequestedWorkingDirectories(sessionResource) ?? [];
	}

	/**
	 * Grants (and persists) trust for a worktree-isolated session's VS Code-created
	 * worktree when the base repository the user already trusts is trusted, so the
	 * trust gate does not prompt for the worktree.
	 *
	 * This lives in the handler because `_invokeAgent` is the only universal
	 * chokepoint every turn passes through — follow-up turns bypass the sessions
	 * open gate ({@link ISessionsService.canOpenSession}). Protocol `SessionState`
	 * does not carry the sessions layer's `gitRepository.workTreeUri`, so
	 * eligibility uses the isolation config plus a structural guard: only a strict
	 * descendant of the repository's `.worktrees` sibling
	 * ({@link isWorktreeUnderRepository}) can inherit trust — a trusted base URI is
	 * never enough on its own, and the shared `<repo>.worktrees` container is
	 * excluded so a grant can never cascade to every worktree. Mirrors the
	 * sessions-layer `ensureSessionWorktreesTrusted`; kept separate because
	 * `workbench` must not import `sessions`.
	 */
	private async _inheritWorktreeTrust(state: SessionState): Promise<void> {
		if (state.config?.values[SessionConfigKey.Isolation] !== 'worktree') {
			return;
		}
		const repositoryRootRaw = state.project?.uri;
		if (!repositoryRootRaw) {
			return;
		}
		const repositoryRoot = typeof repositoryRootRaw === 'string' ? URI.parse(repositoryRootRaw) : repositoryRootRaw;
		// Keep only individual worktrees under `<repo>.worktrees` (never the shared
		// container itself), so a trusted base repo grants trust for exactly this
		// session's worktree and not for every sibling worktree.
		const worktreeFolders = (state.workingDirectories ?? [])
			.map(directory => typeof directory === 'string' ? URI.parse(directory) : directory)
			.filter(folder => isWorktreeUnderRepository(folder, repositoryRoot));
		if (worktreeFolders.length === 0) {
			return;
		}
		const [repoTrust, ...folderTrusts] = await Promise.all([
			this._workspaceTrustManagementService.getUriTrustInfo(repositoryRoot),
			...worktreeFolders.map(folder => this._workspaceTrustManagementService.getUriTrustInfo(folder)),
		]);
		if (!repoTrust.trusted) {
			return;
		}
		const untrusted = worktreeFolders.filter((_, index) => !folderTrusts[index].trusted);
		if (untrusted.length > 0) {
			await this._workspaceTrustManagementService.setUrisTrust(untrusted, true);
		}
	}

	/**
	 * Ensures every local (file-scheme) folder the agent will run in is trusted
	 * before a session is spawned; returns `false` if the user declines any. Trust
	 * is checked for all folders in parallel and only untrusted folders are prompted
	 * for, one at a time.
	 */
	private async _ensureFoldersTrusted(folders: readonly URI[]): Promise<boolean> {
		const message = localize('agentHost.workspaceTrust', "AI features are currently only supported in trusted workspaces.");
		const localFolders = folders.filter(folder => folder.scheme === Schemas.file);
		if (localFolders.length === 0) {
			return !!await this._workspaceTrustRequestService.requestWorkspaceTrust({ message });
		}

		// Check every folder's trust in parallel so an already-trusted session (the
		// common case) returns immediately without prompting or sequential awaits.
		const trustInfos = await Promise.all(localFolders.map(folder => this._workspaceTrustManagementService.getUriTrustInfo(folder)));
		const untrustedFolders = localFolders.filter((_, index) => !trustInfos[index].trusted);
		if (untrustedFolders.length === 0) {
			return true;
		}

		// Prompt for each untrusted folder one at a time (trust dialogs are modal).
		// A folder in the open workspace is gated via whole-workspace trust (matching
		// extension-host chat); others via per-resource trust.
		for (const folder of untrustedFolders) {
			const trusted = this._workspaceContextService.getWorkspaceFolder(folder)
				? await this._workspaceTrustRequestService.requestWorkspaceTrust({ message })
				: await this._workspaceTrustRequestService.requestResourcesTrust({ uri: folder, message });
			if (!trusted) {
				return false;
			}
		}
		return true;
	}

	private _convertVariablesToAttachments(request: IChatAgentRequest): MessageAttachment[] {
		const attachments = this._variableEntriesToAttachments(request.variables.variables, request.sessionResource, request.message);
		const explicitCount = attachments.length;
		this._appendActiveEditorAttachments(attachments, request);
		if (attachments.length !== explicitCount) {
			this._logService.trace(`[AgentHost] Forwarded ${attachments.length - explicitCount} active editor attachment(s); ${attachments.length} total`);
		}
		return attachments;
	}

	/**
	 * Forward the active editor (which the suggested-context flow omits in agent mode) as ambient context, deduped
	 * against files the user attached explicitly. Gated on
	 * {@link ChatConfiguration.ImplicitContextActiveEditor} (on by default, off in the Agents window).
	 * Unsaved handling lives in {@link _convertVariableToAttachment}.
	 */
	private _appendActiveEditorAttachments(attachments: MessageAttachment[], request: IChatAgentRequest): void {
		if (!this._configurationService.getValue<boolean>(ChatConfiguration.ImplicitContextActiveEditor)) {
			return;
		}
		const implicitContext = this._chatWidgetService.getWidgetBySessionResource(request.sessionResource)?.input.implicitContext;
		if (!implicitContext) {
			return;
		}
		// Key on source entries (not produced attachments) so inlined unsaved buffers (no URI) still dedupe.
		const existingKeys = new Set<string>();
		for (const v of request.variables.variables) {
			const key = this._fileEntryDedupeKey(v, request.sessionResource);
			if (key) {
				existingKeys.add(key);
			}
		}
		// Backends that read files from disk can't see an untitled buffer, so don't forward it as a
		// broken path unless we inline its live text below.
		const skipUntitled = !this._backendInlinesUnsavedEditors();
		for (const entry of implicitContext.values) {
			if (entry.value === undefined) {
				continue;
			}
			if (entry.uri?.scheme === Schemas.vscodeBrowser) {
				continue;
			}
			if (skipUntitled && entry.uri?.scheme === Schemas.untitled) {
				continue;
			}
			const key = this._fileEntryDedupeKey(entry, request.sessionResource);
			if (key) {
				if (existingKeys.has(key)) {
					continue;
				}
				existingKeys.add(key);
			}
			const attachment = this._convertVariableToAttachment(entry, request.sessionResource, request.message);
			if (!Array.isArray(attachment) && attachment) {
				attachments.push(attachment);
			}
		}
	}

	/** Dedupe identity for a file/implicit entry: rebased URI, suffixed with the range for a selection. */
	private _fileEntryDedupeKey(entry: IChatRequestVariableEntry, sessionResource: URI): string | undefined {
		if (entry.kind !== 'file' && entry.kind !== 'implicit') {
			return undefined;
		}
		const value = entry.value;
		const uri = isLocation(value) ? value.uri : (value instanceof URI ? value : undefined);
		if (!uri) {
			return undefined;
		}
		const selection = this._entrySelection(entry);
		return this._attachmentDedupeKey(this._rebaseAttachmentUri(uri, sessionResource).toString(), selection);
	}

	/** The selection range carried by a file/implicit entry, or `undefined` for whole-document references. */
	private _entrySelection(entry: IChatRequestVariableEntry): MessageEmbeddedResourceAttachment['selection'] {
		const location = this._entrySelectionLocation(entry);
		return location ? { range: this._toTextRange(location.range) } : undefined;
	}

	/** Dedupe identity: the bare URI for a whole document, suffixed with the range for a selection. */
	private _attachmentDedupeKey(uri: string, selection?: MessageResourceAttachment['selection']): string {
		if (!selection) {
			return uri;
		}
		const { start, end } = selection.range;
		return `${uri}#${start.line}:${start.character}-${end.line}:${end.character}`;
	}

	/**
	 * Whether this backend reads referenced files from disk (rather than seeing the editor's
	 * in-memory buffer) and therefore needs the live text of an unsaved / dirty editor inlined as
	 * an embedded resource. Copilot CLI and Codex both run as separate processes with only disk
	 * access, so a `@path` mention (or an `untitled:` URI) would give them stale or missing content.
	 */
	private _backendInlinesUnsavedEditors(): boolean {
		return this._config.provider === SessionType.CopilotCLI || this._config.provider === CODEX_AGENT_PROVIDER_ID;
	}

	/** A resource is unsaved when it's untitled or a saved file with in-memory (dirty) changes. */
	private _isUnsavedResource(uri: URI): boolean {
		return uri.scheme === Schemas.untitled || this._workingCopyService.isDirty(uri);
	}

	/**
	 * Inline the live (in-memory) text of an unsaved editor as an embedded resource so a path-reading backend still
	 * gets current content, preserving the entry's selection, range and `_meta`. Selection entries inline only the
	 * selected text; whole-document entries inline the full buffer. Returns `undefined` when no loaded text model is
	 * available or the inlined text exceeds {@link MAX_INLINED_UNSAVED_EDITOR_BYTES}.
	 */
	private _buildUnsavedEditorAttachment(uri: URI, v: IChatRequestVariableEntry, range: MessageAttachment['range']): MessageAttachment | undefined {
		const model = this._modelService.getModel(uri);
		if (!model) {
			return undefined;
		}
		const text = this._getUnsavedEditorAttachmentText(model, this._entryModelSelectionRange(v));
		const buffer = text === undefined ? undefined : VSBuffer.fromString(text);
		if (!buffer || buffer.byteLength > MAX_INLINED_UNSAVED_EDITOR_BYTES) {
			this._logService.trace(`[AgentHost] Skipping inline of unsaved editor ${uri.toString()}: exceeds ${MAX_INLINED_UNSAVED_EDITOR_BYTES} byte cap`);
			return undefined;
		}
		const selection = this._entrySelection(v);
		const attachment: MessageEmbeddedResourceAttachment = {
			type: MessageAttachmentKind.EmbeddedResource,
			label: v.name,
			displayKind: selection ? 'selection' : 'document',
			data: encodeBase64(buffer),
			contentType: 'text/plain',
		};
		if (selection) {
			attachment.selection = selection;
		}
		if (range) {
			attachment.range = range;
		}
		if (v._meta) {
			attachment._meta = v._meta;
		}
		return attachment;
	}

	/**
	 * The inline text to send for an unsaved editor: the selected text for a selection, else the whole buffer. Uses the
	 * model length APIs so an over-cap buffer is skipped (returns `undefined`) without ever being materialized.
	 */
	private _getUnsavedEditorAttachmentText(model: ITextModel, range: IRange | undefined): string | undefined {
		if (range) {
			const selection = model.validateRange(range);
			const selectionLength = model.getValueLengthInRange(selection);
			if (selectionLength > 0) {
				return selectionLength > MAX_INLINED_UNSAVED_EDITOR_BYTES ? undefined : model.getValueInRange(selection);
			}
		}
		return model.getValueLength() > MAX_INLINED_UNSAVED_EDITOR_BYTES ? undefined : model.getValue();
	}

	/** The editor range of a file/implicit selection entry, used to slice the live model; `undefined` otherwise. */
	private _entryModelSelectionRange(entry: IChatRequestVariableEntry): IRange | undefined {
		return this._entrySelectionLocation(entry)?.range;
	}

	/** The {@link Location} of a file/implicit entry that represents a selection, or `undefined` for whole documents. */
	private _entrySelectionLocation(entry: IChatRequestVariableEntry): Location | undefined {
		const value = entry.value;
		const isSelectionEntry = (entry.kind === 'file' || (entry.kind === 'implicit' && entry.isSelection)) && isLocation(value);
		return isSelectionEntry ? value as Location : undefined;
	}

	private _variableEntriesToAttachments(variables: readonly IChatRequestVariableEntry[], sessionResource: URI, messageText?: string, materializePastes = true): MessageAttachment[] {
		const attachments: MessageAttachment[] = [];
		for (const v of variables) {
			const attachment = this._convertVariableToAttachment(v, sessionResource, messageText, materializePastes);
			if (Array.isArray(attachment)) {
				attachments.push(...attachment);
			} else if (attachment) {
				attachments.push(attachment);
			}
		}
		if (attachments.length > 0) {
			this._logService.trace(`[AgentHost] Converted ${attachments.length} attachments from ${variables.length} explicit variables`);
		}
		return attachments;
	}

	private _convertVariableToAttachment(v: IChatRequestVariableEntry, sessionResource: URI, messageText: string | undefined, materializePastes = true): MessageAttachment | MessageAttachment[] | undefined {
		const referenceRange = this._toAttachmentReferenceRange(messageText, v.range);
		// Copilot CLI and Codex can't read unsaved content from disk, so inline the live buffer; drop unreadable schemes.
		if ((v.kind === 'file' || v.kind === 'implicit') && this._backendInlinesUnsavedEditors()) {
			const uri = isLocation(v.value) ? v.value.uri : (v.value instanceof URI ? v.value : undefined);
			if (uri && this._isUnsavedResource(uri)) {
				const embedded = this._buildUnsavedEditorAttachment(uri, v, referenceRange);
				if (embedded) {
					return embedded;
				}
				if (uri.scheme !== Schemas.file) {
					return undefined;
				}
			}
		}
		// File/implicit: a selection Location → 'selection'; a whole document/URI → 'document' (range dropped).
		if ((v.kind === 'file' || (v.kind === 'implicit' && v.isSelection)) && isLocation(v.value)) {
			return this._toSelectionAttachment(v.value, v.name, 'selection', sessionResource, v._meta, referenceRange);
		}
		if (v.kind === 'implicit' && isLocation(v.value)) {
			return this._toResourceAttachment(v.value.uri, v.name, 'document', sessionResource, v._meta, referenceRange);
		}
		if ((v.kind === 'file' || v.kind === 'implicit') && v.value instanceof URI) {
			return this._toResourceAttachment(v.value, v.name, 'document', sessionResource, v._meta, referenceRange);
		}
		if (v.kind === 'directory' && v.value instanceof URI) {
			return this._toResourceAttachment(v.value, v.name, 'directory', sessionResource, v._meta, referenceRange);
		}
		// Symbol: a Location with a 'symbol' display hint.
		if (v.kind === 'symbol' && isLocation(v.value)) {
			return this._toSelectionAttachment(v.value, v.name, 'symbol', sessionResource, v._meta, referenceRange);
		}
		// Prompt files (.prompt.md) — treated as a referenced document.
		if (v.kind === 'promptFile' && v.value instanceof URI) {
			return this._toResourceAttachment(v.value, v.name, 'document', sessionResource, v._meta, referenceRange);
		}
		// Image: send inline as base64 when we have the bytes; otherwise fall
		// back to a file resource reference.
		if (isImageVariableEntry(v)) {
			return this._toImageAttachment(v, sessionResource, referenceRange);
		}
		if (isAgentFeedbackVariableEntry(v)) {
			return this._toAgentFeedbackAttachment(v);
		}
		if (v.kind === 'sessionReference' && v.value instanceof URI) {
			const trajectoryPath = this._toSessionReferenceTrajectoryPath(v.value);
			if (!trajectoryPath) {
				return undefined;
			}
			return this._toSessionReferenceAttachments(v, v.value, trajectoryPath, referenceRange);
		}
		// Browser views are live pages rather than filesystem resources. Preserve
		// the page ID as model-readable context so the agent can address the page
		// with browser tools without trying to read the vscode-browser URI.
		if (isBrowserViewVariableEntry(v)) {
			return this._toSimpleAttachment(
				v.name,
				v.modelDescription ?? `Browser page: ${v.name}. The pageId is "${v.browserId}".`,
				{
					...v._meta,
					[BrowserViewAttachmentMetadataKey]: { browserId: v.browserId, browserUri: v.value.toString() },
				},
				BrowserViewAttachmentDisplayKind,
				referenceRange,
			);
		}
		if (v.kind === 'element') {
			const correlationId = getElementAttachmentCorrelationId(v) ?? v.id;
			const metadata = { ...v._meta, ...toElementAttachmentMeta(correlationId) };
			const elementAttachment = this._toSimpleAttachment(v.name, v.value, metadata, AgentHostElementAttachmentDisplayKind, referenceRange);
			const imageAttachment = this._toElementImageAttachment(v, sessionResource, metadata);
			return imageAttachment ? [elementAttachment, imageAttachment] : elementAttachment;
		}
		// Pasted text is materialized by the agent host so large payloads stay out of synchronized state.
		if (v.kind === 'paste') {
			return materializePastes
				? this._toEmbeddedTextAttachment(v.name, v.code, v._meta, referenceRange)
				: this._toSimpleAttachment(v.name, v.code, v._meta, undefined, referenceRange);
		}
		if (v.kind === 'promptText') {
			return this._toSimpleAttachment(v.name, v.value, v._meta, undefined, referenceRange);
		}
		if (v.kind === 'workspace') {
			return this._toSimpleAttachment(v.name, v.value, v._meta, 'workspace', referenceRange);
		}
		if (isChatTranscriptContextVariableEntry(v)) {
			return this._toSimpleAttachment(v.name, v.value, toChatTranscriptContextAttachmentMeta(v), ChatTranscriptContextAttachmentDisplayKind, referenceRange);
		}
		if (v.kind === 'string' && typeof v.value === 'string') {
			return this._toSimpleAttachment(v.name, v.value, v._meta, undefined, referenceRange);
		}
		const agentHostCompletionKind = getAgentHostCompletionReferenceKind(v);
		if (agentHostCompletionKind === AgentHostCompletionReferenceKind.Command) {
			return this._toSimpleAttachment(v.name, undefined, v._meta, 'command', referenceRange);
		}
		if (agentHostCompletionKind === AgentHostCompletionReferenceKind.Skill) {
			return this._toSimpleAttachment(v.name, undefined, v._meta, 'skill', referenceRange);
		}
		if (isChatReferenceVariableEntry(v)) {
			return this._toChatReferenceAttachment(v, referenceRange);
		}
		return undefined;
	}

	private _toChatReferenceAttachment(v: IChatRequestChatReferenceVariableEntry, range?: MessageAttachment['range']): MessageAttachment {
		const attachment: MessageChatAttachment = {
			type: MessageAttachmentKind.Chat,
			resource: v.value.toString(),
			label: v.name,
		};
		if (v.endTurn !== undefined) {
			attachment.endTurn = v.endTurn;
		}
		if (range) {
			attachment.range = range;
		}
		if (v._meta) {
			attachment._meta = v._meta;
		}
		return attachment;
	}

	private _toElementImageAttachment(v: IElementVariableEntry, sessionResource: URI, metadata: Record<string, unknown>): MessageAttachment | undefined {
		if (v.imageData instanceof Uint8Array) {
			return {
				type: MessageAttachmentKind.EmbeddedResource,
				label: `${v.name} screenshot`,
				displayKind: 'image',
				data: encodeBase64(VSBuffer.wrap(v.imageData)),
				contentType: v.imageMimeType ?? 'image/png',
				_meta: metadata,
			};
		}
		if (URI.isUri(v.imageData)) {
			return this._toResourceAttachment(v.imageData, `${v.name} screenshot`, 'image', sessionResource, metadata);
		}
		return undefined;
	}

	private _toSessionReferenceAttachment(v: IChatRequestVariableEntry, sessionResource: URI, trajectoryPath: string, range?: MessageAttachment['range']): MessageAttachment {
		return this._toSimpleAttachment(
			v.name,
			toSessionReferenceModelRepresentation(v.name, sessionResource, trajectoryPath),
			{ ...(v._meta ?? {}), ...toSessionReferenceAttachmentMeta(sessionResource) },
			AgentHostSessionReferenceAttachmentDisplayKind,
			range
		);
	}

	private _toSessionReferenceAttachments(v: IChatRequestVariableEntry, sessionResource: URI, trajectoryPath: string, range?: MessageAttachment['range']): MessageAttachment[] {
		return [
			this._toSessionReferenceAttachment(v, sessionResource, trajectoryPath, range),
			this._toSessionReferenceTrajectoryAttachment(v, sessionResource, trajectoryPath),
		];
	}

	private _toSessionReferenceTrajectoryAttachment(v: IChatRequestVariableEntry, sessionResource: URI, trajectoryPath: string): MessageAttachment {
		return {
			type: MessageAttachmentKind.Resource,
			uri: URI.file(trajectoryPath).toString(),
			label: `${v.name} trajectory`,
			displayKind: AgentHostSessionReferenceTrajectoryAttachmentDisplayKind,
			_meta: { ...(v._meta ?? {}), ...toSessionReferenceAttachmentMeta(sessionResource) },
		};
	}

	private _toSessionReferenceTrajectoryPath(sessionResource: URI): string | undefined {
		// TODO: Support non-Copilot-CLI session references through IChatModel or a first-class AHP attachment path.
		// TODO: Support full EH-to-AH session porting for continue/resume flows.
		return buildHostLocalEventsPath(
			sessionResource,
			this._pathService.userHome({ preferLocal: true }),
			authority => this._remoteAgentHostService.connections.find(connection => agentHostAuthority(connection.address) === authority),
		);
	}

	private _toResourceAttachment(uri: URI, label: string, displayKind: string, sessionResource: URI, _meta: Record<string, unknown> | undefined, range?: MessageAttachment['range']): MessageAttachment | undefined {
		const attachmentUri = this._rebaseAttachmentUri(uri, sessionResource);
		const attachment: MessageAttachment = { type: MessageAttachmentKind.Resource, uri: attachmentUri.toString(), label, displayKind };
		if (range) {
			attachment.range = range;
		}
		if (_meta) {
			attachment._meta = _meta;
		}
		return attachment;
	}

	private _toSelectionAttachment(location: Location, label: string, displayKind: string, sessionResource: URI, _meta: Record<string, unknown> | undefined, range?: MessageAttachment['range']): MessageAttachment | undefined {
		const attachmentUri = this._rebaseAttachmentUri(location.uri, sessionResource);
		const attachment: MessageAttachment = {
			type: MessageAttachmentKind.Resource,
			uri: attachmentUri.toString(),
			label,
			displayKind,
			selection: { range: this._toTextRange(location.range) },
		};
		if (range) {
			attachment.range = range;
		}
		if (_meta) {
			attachment._meta = _meta;
		}
		return attachment;
	}

	private _toImageAttachment(v: IImageVariableEntry, sessionResource: URI, range?: MessageAttachment['range']): MessageAttachment | undefined {
		const buffer = coerceImageBuffer(v.value);
		const contentType = v.mimeType ?? 'image/png';
		if (buffer) {
			const attachment: MessageAttachment = {
				type: MessageAttachmentKind.EmbeddedResource,
				label: v.name,
				displayKind: 'image',
				data: encodeBase64(VSBuffer.wrap(buffer)),
				contentType,
			};
			if (range) {
				attachment.range = range;
			}
			if (v._meta) {
				attachment._meta = v._meta;
			}
			return attachment;
		}
		// No inline bytes — fall back to a file reference if one is available.
		const refUri = v.references?.find(r => URI.isUri(r.reference))?.reference;
		if (URI.isUri(refUri)) {
			return this._toResourceAttachment(refUri, v.name, 'image', sessionResource, v._meta, range);
		}
		return undefined;
	}

	private _toAgentFeedbackAttachment(v: IAgentFeedbackVariableEntry): MessageAttachment | MessageAttachment[] {
		// Agent-host sessions back their feedback with annotations on the
		// session's annotations channel. Emit one MessageAnnotationsAttachment
		// per comment, referencing the specific annotation id, so the agent can
		// read them via the `listComments` tool and act on exactly these
		// comments. Each item id is the annotation id.
		const annotationsResource = v.annotationsResource?.toString();
		if (annotationsResource && v.feedbackItems.length > 0) {
			return v.feedbackItems.map((item): MessageAnnotationsAttachment => {
				const itemMeta = {
					id: item.id,
					text: item.text,
					resourceUri: item.resourceUri.toString(),
					range: this._toTextRange(item.range),
					...(item.replies?.length ? { replies: [...item.replies] } : {}),
				};
				return {
					type: MessageAttachmentKind.Annotations,
					label: v.name,
					displayKind: AgentFeedbackAttachmentDisplayKind,
					resource: annotationsResource,
					annotationIds: [item.id],
					_meta: {
						...(v._meta ?? {}),
						[AgentFeedbackAttachmentMetadataKey]: {
							sessionResource: v.sessionResource.toString(),
							feedbackItems: [itemMeta],
						},
					},
				};
			});
		}

		// Fallback: no annotations channel resolved — send the feedback inline
		// as a single simple attachment carrying the model representation.
		const feedbackItems = v.feedbackItems.map(item => ({
			id: item.id,
			text: item.text,
			resourceUri: item.resourceUri.toString(),
			range: this._toTextRange(item.range),
			...(item.replies?.length ? { replies: [...item.replies] } : {}),
		}));
		return this._toSimpleAttachment(
			v.name,
			typeof v.value === 'string' ? v.value : undefined,
			{
				...(v._meta ?? {}),
				[AgentFeedbackAttachmentMetadataKey]: {
					sessionResource: v.sessionResource.toString(),
					feedbackItems,
				},
			},
			AgentFeedbackAttachmentDisplayKind,
		);
	}

	private _toSimpleAttachment(label: string, modelRepresentation: string | undefined, _meta: Record<string, unknown> | undefined, displayKind?: string, range?: MessageAttachment['range']): MessageAttachment {
		const attachment: MessageAttachment = { type: MessageAttachmentKind.Simple, label };
		if (modelRepresentation !== undefined) {
			attachment.modelRepresentation = modelRepresentation;
		}
		if (range) {
			attachment.range = range;
		}
		if (displayKind) {
			attachment.displayKind = displayKind;
		}
		if (_meta) {
			attachment._meta = _meta;
		}
		return attachment;
	}

	private _toEmbeddedTextAttachment(label: string, text: string, _meta: Record<string, unknown> | undefined, range?: MessageAttachment['range']): MessageEmbeddedResourceAttachment {
		const attachment: MessageEmbeddedResourceAttachment = {
			type: MessageAttachmentKind.EmbeddedResource,
			label,
			data: encodeBase64(VSBuffer.fromString(text)),
			contentType: 'text/plain',
		};
		if (range) {
			attachment.range = range;
		}
		if (_meta) {
			attachment._meta = _meta;
		}
		return attachment;
	}

	private _toAttachmentReferenceRange(messageText: string | undefined, range: IChatRequestVariableEntry['range']): MessageAttachment['range'] | undefined {
		if (!messageText || !range || range.start < 0 || range.endExclusive > messageText.length || range.start > range.endExclusive) {
			return undefined;
		}
		const start = offsetToPosition(messageText, range.start);
		const end = offsetToPosition(messageText, range.endExclusive);
		return {
			start: { line: start.lineNumber - 1, character: start.column - 1 },
			end: { line: end.lineNumber - 1, character: end.column - 1 },
		};
	}

	private _toTextRange(range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number }) {
		return {
			start: { line: range.startLineNumber - 1, character: range.startColumn - 1 },
			end: { line: range.endLineNumber - 1, character: range.endColumn - 1 },
		};
	}

	/**
	 * Rebase a `file:`-scheme attachment URI from the session's requested
	 * working directory onto the server-resolved working directory. This
	 * matters on the first turn of a worktree-isolated session, where the
	 * provider creates a worktree under a different path than the workspace
	 * folder the workbench attached the file from. Returns the URI unchanged
	 * if the requested and resolved directories match, the URI is not under
	 * the requested directory, or either side is unavailable.
	 */
	private _rebaseAttachmentUri(uri: URI, sessionResource: URI): URI {
		const requestedDirectories = this._resolveRequestedWorkingDirectories(sessionResource);
		const requestedDir = requestedDirectories?.[0];
		if (!requestedDir || requestedDir.scheme !== 'file') {
			return uri;
		}
		const owningRequestedDirectory = findDeepestContainingWorkingDirectory(uri, requestedDirectories);
		if (!owningRequestedDirectory || !extUriBiasedIgnorePathCase.isEqual(owningRequestedDirectory, requestedDir)) {
			return uri;
		}
		const backendSession = this._resolveSessionUri(sessionResource);
		const rawResolvedDir = this._getSessionState(backendSession.toString())?.workingDirectories?.[0];
		const resolvedDir = typeof rawResolvedDir === 'string' ? URI.parse(rawResolvedDir) : rawResolvedDir;
		if (!resolvedDir || resolvedDir.scheme !== 'file') {
			return uri;
		}
		if (extUriBiasedIgnorePathCase.isEqual(requestedDir, resolvedDir)) {
			return uri;
		}
		const rel = extUriBiasedIgnorePathCase.relativePath(requestedDir, uri);
		if (rel === undefined) {
			return uri;
		}
		if (rel === '') {
			return resolvedDir;
		}
		return URI.joinPath(resolvedDir, ...rel.split('/'));
	}

	// ---- Lifecycle ----------------------------------------------------------

	// ---- Session subscription helpers ----------------------------------------

	/**
	 * Get or create a session subscription. The first call for a given URI
	 * triggers a server subscribe; subsequent calls increment the refcount.
	 */
	private _ensureSessionSubscription(sessionUri: string): IAgentSubscription<SessionState> {
		let ref = this._sessionSubscriptions.get(sessionUri);
		if (ref?.object.value instanceof Error) {
			this._sessionSubscriptions.delete(sessionUri);
			ref.dispose();
			this._workingDirectoryRegistrations.deleteAndDispose(sessionUri);
			ref = undefined;
		}
		if (!ref) {
			ref = this._config.connection.getSubscription(StateComponents.Session, URI.parse(sessionUri), 'AgentHostSessionHandler');
			this._sessionSubscriptions.set(sessionUri, ref);
			this._workingDirectoryRegistrations.set(sessionUri, this._workingDirectorySynchronizer.register({
				session: URI.parse(sessionUri),
				provider: this._config.provider,
				connection: this._config.connection,
				subscription: ref.object,
			}));
		}
		return ref.object;
	}

	/**
	 * Get or create the default-chat subscription for a session. Mirrors the
	 * refcount lifecycle of {@link _ensureSessionSubscription}.
	 */
	private _ensureDefaultChatSubscription(sessionUri: string): IAgentSubscription<ChatState> {
		let ref = this._defaultChatSubscriptions.get(sessionUri);
		if (ref?.object.value instanceof Error) {
			this._defaultChatSubscriptions.delete(sessionUri);
			ref.dispose();
			ref = undefined;
		}
		if (!ref) {
			const state = this._requireRawSessionState(sessionUri);
			const defaultChat = state.defaultChat;
			if (!defaultChat) {
				throw new Error(`Session ${sessionUri} has no default chat`);
			}
			const chatUri = URI.parse(defaultChat.toString());
			ref = this._config.connection.getSubscription(StateComponents.Chat, chatUri, 'AgentHostSessionHandler');
			this._defaultChatSubscriptions.set(sessionUri, ref);
		}
		return ref.object;
	}

	/**
	 * Release the subscriptions held by a single chat session on dispose.
	 *
	 * Unlike {@link _releaseSessionSubscription} (which tears down every chat
	 * of a session at once), this only releases the disposed chat's own
	 * conversation subscription and never touches sibling peer chats: closing
	 * one chat of a multi-chat session must not strand another chat — including
	 * one that is concurrently hydrating in {@link provideChatSessionContent} —
	 * on a disposed subscription. The session summary subscription (and its
	 * lockstep default-chat subscription) is shared by every chat of the
	 * session, so it is only torn down once no sibling chat session is still
	 * active or mid-hydration for the same backend session.
	 */
	private _releaseChatSessionSubscriptions(sessionUri: string, chatUri: string): void {
		// Release this chat's own conversation subscription. The default chat's
		// subscription is keyed by session URI and torn down together with the
		// shared session subscription below; peer chats own a dedicated entry.
		if (chatUri !== this._getRawSessionState(sessionUri)?.defaultChat?.toString()) {
			const chatRef = this._additionalChatSubscriptions.get(chatUri);
			if (chatRef) {
				this._additionalChatSubscriptions.delete(chatUri);
				chatRef.dispose();
			}
		}
		// Keep the shared session subscription alive while any sibling chat of
		// the same backend session is still active or hydrating.
		if (this._hasOtherSessionHold(sessionUri)) {
			return;
		}
		const ref = this._sessionSubscriptions.get(sessionUri);
		if (ref) {
			this._sessionSubscriptions.delete(sessionUri);
			ref.dispose();
			this._workingDirectoryRegistrations.deleteAndDispose(sessionUri);
		}
		const chatRef = this._defaultChatSubscriptions.get(sessionUri);
		if (chatRef) {
			this._defaultChatSubscriptions.delete(sessionUri);
			chatRef.dispose();
		}
	}

	/**
	 * Returns whether another chat session for the given backend session URI is
	 * still active or in the middle of hydrating its subscriptions, so the
	 * shared session subscription must be kept alive. Callers invoke this after
	 * removing their own entry from {@link _activeSessions}.
	 */
	private _hasOtherSessionHold(sessionUri: string): boolean {
		if ((this._hydratingChatSessions.get(sessionUri) ?? 0) > 0) {
			return true;
		}
		for (const resource of this._activeSessions.keys()) {
			if (this._resolveSessionUri(resource).toString() === sessionUri) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Read the current optimistic session state for a backend session URI,
	 * merged with its default chat so conversation contents (turns, active
	 * turn, pending/queued messages, input requests) are visible.
	 */
	/**
	 * Resolves once a subscription has received its first snapshot (its
	 * `value` is no longer `undefined`) — i.e. it has hydrated with state or
	 * an error. Resolves immediately if already hydrated or if cancellation
	 * is requested.
	 */
	private _whenSubscriptionHydrated<T>(sub: IAgentSubscription<T>, token: CancellationToken): Promise<void> {
		if (sub.value !== undefined || token.isCancellationRequested) {
			return Promise.resolve();
		}
		return new Promise<void>(resolve => {
			const store = new DisposableStore();
			const settle = () => { store.dispose(); resolve(); };
			store.add(sub.onDidChange(() => { if (sub.value !== undefined) { settle(); } }));
			const onDidError = sub.onDidError;
			if (onDidError) {
				store.add(onDidError(settle));
			}
			store.add(token.onCancellationRequested(settle));
			if (sub.value !== undefined) { settle(); }
		});
	}

	private _getSessionState(sessionUri: string, chatUri?: string): ISessionWithDefaultChat | undefined {
		const value = this._getRawSessionState(sessionUri);
		if (!value) {
			return undefined;
		}
		const defaultChat = value.defaultChat?.toString();
		const chatState = chatUri && chatUri !== defaultChat
			? this._getAdditionalChatState(chatUri)
			: this._getDefaultChatState(sessionUri);
		return mergeSessionWithDefaultChat(value, chatState);
	}

	private _getRawSessionState(sessionUri: string): SessionState | undefined {
		const ref = this._sessionSubscriptions.get(sessionUri);
		const value = ref?.object.value;
		return value && !(value instanceof Error) ? value : undefined;
	}

	private _requireRawSessionState(sessionUri: string): SessionState {
		const state = this._getRawSessionState(sessionUri);
		if (!state) {
			throw new Error(`Session state is not hydrated for ${sessionUri}`);
		}
		return state;
	}

	private _requireDefaultChatUri(sessionUri: string): string {
		const defaultChat = this._requireRawSessionState(sessionUri).defaultChat;
		if (!defaultChat) {
			throw new Error(`Session ${sessionUri} has no default chat`);
		}
		return defaultChat.toString();
	}

	/** Read the current optimistic default-chat state for a backend session URI. */
	private _getDefaultChatState(sessionUri: string): ChatState | undefined {
		const ref = this._defaultChatSubscriptions.get(sessionUri);
		if (!ref) {
			return undefined;
		}
		const value = ref.object.value;
		return (value && !(value instanceof Error)) ? value : undefined;
	}

	/** Read the current optimistic state for an additional peer chat URI. */
	private _getAdditionalChatState(chatUri: string): ChatState | undefined {
		const ref = this._additionalChatSubscriptions.get(chatUri);
		if (!ref) {
			return undefined;
		}
		const value = ref.object.value;
		return (value && !(value instanceof Error)) ? value : undefined;
	}

	/**
	 * Get or create the subscription for an additional peer chat, keyed by the
	 * chat channel URI. Mirrors {@link _ensureDefaultChatSubscription} but for
	 * non-default chats so their conversation contents hydrate independently.
	 */
	private _ensureAdditionalChatSubscription(chatUri: string): IAgentSubscription<ChatState> {
		let ref = this._additionalChatSubscriptions.get(chatUri);
		if (ref?.object.value instanceof Error) {
			this._additionalChatSubscriptions.delete(chatUri);
			ref.dispose();
			ref = undefined;
		}
		if (!ref) {
			ref = this._config.connection.getSubscription(StateComponents.Chat, URI.parse(chatUri), 'AgentHostSessionHandler');
			this._additionalChatSubscriptions.set(chatUri, ref);
		}
		return ref.object;
	}

	/**
	 * Subscribe to the conversation channel of `sessionResource`'s chat and
	 * return the {@link IAgentSubscription}. Routes to the default-chat
	 * subscription (fragment-less resource) or to an additional peer chat.
	 */
	private _ensureChatSubscription(sessionUri: string, chatUri: string): IAgentSubscription<ChatState> {
		return chatUri === this._requireDefaultChatUri(sessionUri)
			? this._ensureDefaultChatSubscription(sessionUri)
			: this._ensureAdditionalChatSubscription(chatUri);
	}

	resolveChatResponseUri(_sessionResource: URI, href: string, _kind: 'link' | 'image'): string {
		return rewriteAgentHostLinkTarget(href, this._config.connectionAuthority);
	}

	/**
	 * Read the current root state.
	 */
	private _getRootState(): RootState | undefined {
		const value = this._config.connection.rootState.value;
		return (value && !(value instanceof Error)) ? value : undefined;
	}

	override dispose(): void {
		for (const [, session] of this._activeSessions) {
			session.dispose();
		}
		this._activeSessions.clear();
		for (const ref of this._sessionSubscriptions.values()) {
			ref.dispose();
		}
		this._sessionSubscriptions.clear();
		for (const ref of this._defaultChatSubscriptions.values()) {
			ref.dispose();
		}
		this._defaultChatSubscriptions.clear();
		for (const ref of this._additionalChatSubscriptions.values()) {
			ref.dispose();
		}
		this._additionalChatSubscriptions.clear();
		super.dispose();
	}
}

// =============================================================================
// Client-provided tool helpers
// =============================================================================

/**
 * Converts an internal {@link IToolResult} to a protocol
 * {@link import('../../../../../../platform/agentHost/common/state/protocol/state.js').ToolCallResult}.
 */
export function toolResultToProtocol(result: IToolResult, toolName: string): {
	success: boolean;
	pastTenseMessage: StringOrMarkdown;
	content?: ({ type: ToolResultContentType.Text; text: string } | { type: ToolResultContentType.EmbeddedResource; data: string; contentType: string })[];
	error?: { message: string };
} {
	const isError = !!result.toolResultError;
	const defaultPastTense = isError ? `${toolName} failed` : `Ran ${toolName}`;
	const pastTense: StringOrMarkdown = typeof result.toolResultMessage === 'string'
		? result.toolResultMessage
		: result.toolResultMessage
			? { markdown: result.toolResultMessage.value }
			: defaultPastTense;

	const content: ({ type: ToolResultContentType.Text; text: string } | { type: ToolResultContentType.EmbeddedResource; data: string; contentType: string })[] = [];
	for (const part of result.content) {
		if (part.kind === 'text') {
			content.push({ type: ToolResultContentType.Text, text: part.value });
		} else if (part.kind === 'promptTsx') {
			content.push({ type: ToolResultContentType.Text, text: stringifyPromptTsxPart(part) });
		} else if (part.kind === 'data') {
			content.push({
				type: ToolResultContentType.EmbeddedResource,
				data: encodeBase64(part.value.data),
				contentType: part.value.mimeType,
			});
		}
	}

	return {
		success: !isError,
		pastTenseMessage: pastTense,
		content: content.length > 0 ? content : undefined,
		error: isError
			? { message: typeof result.toolResultError === 'string' ? result.toolResultError : `${toolName} encountered an error` }
			: undefined,
	};
}
