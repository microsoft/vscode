/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Delayer, disposableTimeout, raceCancellation } from '../../../../../../base/common/async.js';
import { encodeBase64, VSBuffer } from '../../../../../../base/common/buffer.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { MarkdownString } from '../../../../../../base/common/htmlContent.js';
import { getChatErrorDetailsFromMeta, getCopilotPlanFromEntitlement, IChatErrorContext } from '../../../common/chatErrorMessages.js';
import { Disposable, DisposableResourceMap, DisposableStore, IReference, MutableDisposable, toDisposable, type IDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { equals } from '../../../../../../base/common/objects.js';
import { autorun, autorunPerKeyedItem, constObservable, derived, derivedOpts, IObservable, ISettableObservable, observableValue, transaction } from '../../../../../../base/common/observable.js';
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
import { AgentProvider, AgentSession, CODEX_AGENT_PROVIDER_ID, type IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { agentHostAuthority } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { AgentFeedbackAttachmentDisplayKind, AgentFeedbackAttachmentMetadataKey } from '../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js';
import { BrowserViewAttachmentDisplayKind, BrowserViewAttachmentMetadataKey } from '../../../../../../platform/agentHost/common/meta/browserViewAttachments.js';
import { readToolCallMeta } from '../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js';
import { readCompletionAttachmentMeta } from '../../../../../../platform/agentHost/common/meta/agentCompletionAttachmentMeta.js';
import { IRemoteAgentHostService } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { SessionConfigKey } from '../../../../../../platform/agentHost/common/sessionConfigKeys.js';
import type { ChatInputRequestWithPlanReview, IAgentHostPlanReview } from '../../../../../../platform/agentHost/common/agentHostPlanReview.js';
import { IAgentSubscription, observableFromSubscription } from '../../../../../../platform/agentHost/common/state/agentSubscription.js';
import { ChatTruncatedAction } from '../../../../../../platform/agentHost/common/state/protocol/actions.js';
import { CompletionItemKind as AhpCompletionItemKind, type CompletionItem as AhpCompletionItem } from '../../../../../../platform/agentHost/common/state/protocol/commands.js';
import { ConfirmationOptionKind, CustomizationType, JsonPrimitive, McpServerAuthRequiredState, McpServerStatus, SessionInputRequestKind, TerminalClaimKind, ToolCallContributorKind, ToolResultContentType, type ConfirmationOption, type ProtectedResourceMetadata, type SessionActiveClient } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, ChatTurnStartedAction, isChatAction, type ChatAction, type ClientChatAction, type ClientSessionAction, type ChatInputCompletedAction } from '../../../../../../platform/agentHost/common/state/sessionActions.js';
import { AHP_AUTH_REQUIRED, ProtocolError } from '../../../../../../platform/agentHost/common/state/sessionProtocol.js';
import { buildSubagentChatUri, getToolSubagentContent, MessageAttachmentKind, MessageKind, PendingMessageKind, ResponsePartKind, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, StateComponents, ToolCallCancellationReason, ToolCallConfirmationReason, ToolCallStatus, TurnState, parseChatUri, mergeSessionWithDefaultChat, readUsageInfoMeta, type ChatState, type ISessionWithDefaultChat, type ClientPluginCustomization, type ICompletedToolCall, type MarkdownResponsePart, type Message, type MessageAttachment, type MessageAnnotationsAttachment, type MessageResourceAttachment, type MessageEmbeddedResourceAttachment, type ModelSelection, type ReasoningResponsePart, type RootState, type ChatInputAnswer, type ChatInputQuestion, type ChatInputRequest, type SessionState, type ToolCallResponsePart, type ToolCallState, type Turn } from '../../../../../../platform/agentHost/common/state/sessionState.js';
import { ExtensionIdentifier } from '../../../../../../platform/extensions/common/extensions.js';
import { IInstantiationService } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../../platform/opener/common/opener.js';
import { IPathService } from '../../../../../services/path/common/pathService.js';
import { IWorkspaceContextService } from '../../../../../../platform/workspace/common/workspace.js';
import { IWorkspaceTrustRequestService } from '../../../../../../platform/workspace/common/workspaceTrust.js';
import { IAgentHostTerminalService } from '../../../../terminal/browser/agentHostTerminalService.js';
import { ITerminalChatService } from '../../../../terminal/browser/terminal.js';
import {
	AgentHostCompletionReferenceKind,
	getAgentHostCompletionReferenceKind,
	isAgentFeedbackVariableEntry,
	isBrowserViewVariableEntry,
	isImageVariableEntry,
	type IAgentFeedbackVariableEntry,
	type IChatRequestVariableEntry,
	type IImageVariableEntry
} from '../../../common/attachments/chatVariableEntries.js';
import { coerceImageBuffer } from '../../../common/chatImageExtraction.js';
import { ChatRequestQueueKind, ConfirmedReason, ElicitationState, IChatProgress, IChatQuestion, IChatQuestionAnswers, IChatService, IChatToolInvocation, ToolConfirmKind, type IChatAutoModeResolutionPart, type IChatMcpAuthenticationRequired, type IChatMcpAuthenticationRequiredServer, type IChatMcpStartingServer, type IChatMultiSelectAnswer, type IChatPlanReviewResult, type IChatQuestionAnswerValue, type IChatResponseErrorDetails, type IChatSingleSelectAnswer, type IChatTerminalToolInvocationData } from '../../../common/chatService/chatService.js';
import { IChatSession, IChatSessionContentProvider, IChatSessionHistoryItem, IChatSessionItem, IChatSessionRequestHistoryItem, isTerminalCommandPrompt, SessionType, type IChatInputCompletionItem, type IChatInputCompletionsParams, type IChatInputCompletionsResult, type IChatSessionServerRequest } from '../../../common/chatSessionsService.js';
import { IChatEntitlementService } from '../../../../../services/chat/common/chatEntitlementService.js';
import { IWorkingCopyService } from '../../../../../services/workingCopy/common/workingCopyService.js';
import { ChatMode } from '../../../common/chatModes.js';
import { ChatAgentLocation, ChatConfiguration, ChatModeKind } from '../../../common/constants.js';
import { IChatEditingService } from '../../../common/editing/chatEditingService.js';
import { ILanguageModelChatMetadata, ILanguageModelsService } from '../../../common/languageModels.js';
import { type IChatModel, type IChatModelInputState, type IChatRequestVariableData, type ISerializableChatModelInputState } from '../../../common/model/chatModel.js';
import { ChatElicitationRequestPart } from '../../../common/model/chatProgressTypes/chatElicitationRequestPart.js';
import { ChatPlanReviewData } from '../../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { ChatQuestionCarouselData } from '../../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatToolInvocation } from '../../../common/model/chatProgressTypes/chatToolInvocation.js';
import { getChatSessionType } from '../../../common/model/chatUri.js';
import { IChatAgentData, IChatAgentImplementation, IChatAgentRequest, IChatAgentResult, IChatAgentService } from '../../../common/participants/chatAgents.js';
import { ILanguageModelToolsService, IToolInvocation, IToolResult, ToolInvocationPresentation } from '../../../common/tools/languageModelToolsService.js';
import { IChatWidgetService } from '../../chat.js';
import { getAgentSessionProviderIcon } from '../agentSessions.js';
import { IAgentHostActiveClientService } from './agentHostActiveClientService.js';
import { IAgentHostCustomizationService } from './agentHostCustomizationService.js';
import { IAgentHostSessionWorkingDirectoryResolver } from './agentHostSessionWorkingDirectoryResolver.js';
import { IAgentHostNewSessionFolderService } from './agentHostNewSessionFolderService.js';
import { AgentHostSnapshotController } from './agentHostSnapshotController.js';
import { AgentHostResponseFileChangesProvider } from './agentHostResponseFileChanges.js';
import { IChatResponseFileChangesService } from '../../chatResponseFileChangesService.js';
import { AgentHostSessionReferenceAttachmentDisplayKind, AgentHostSessionReferenceTrajectoryAttachmentDisplayKind, toSessionReferenceAttachmentMeta, toSessionReferenceModelRepresentation } from './agentHostSessionReferenceAttachment.js';
import { buildHostLocalEventsPath } from '../../copilotCliEventsUri.js';
import { toolDataToDefinition } from './agentHostToolUtils.js';
import { IAgentHostUntitledProvisionalSessionService } from './agentHostUntitledProvisionalSessionService.js';
import { IAgentHostImportConversationStore } from './agentHostImportConversationStore.js';
import { activeTurnToProgress, completedToolCallToEditParts, completedToolCallToSerialized, finalizeToolInvocation, formatTurnResponseDetails, getTerminalContentUri, isSubagentTool, makeAhpTerminalToolSessionId, messageAttachmentsToVariableData, messageToVariableData, parseAhpTerminalToolSessionId, rawMarkdownToString, rewriteAgentHostLinkTarget, stringOrMarkdownToString, systemNotificationToChatPart, toolCallAuthenticationServer, toolCallConfirmationMessages, toolCallStateToInvocation, turnsToHistory, updateRunningToolSpecificData, usageInfoToAutoModeResolution, usageInfoToChatUsage, usageInfoToQuotas, type IToolCallFileEdit, type TurnModelLookup } from './stateToProgressAdapter.js';
import { resolveMcpServerAuthentication, agentHostMcpServerId } from './agentHostAuth.js';
export { toolDataToDefinition };

/**
 * Upper bound on the live editor text we inline for an unsaved document, matching the 1 MB per-file cap chat uses
 * elsewhere (`chatRepoInfo`). Larger buffers are not inlined; a dirty saved file then falls back to its on-disk path.
 */
const MAX_INLINED_UNSAVED_EDITOR_BYTES = 1024 * 1024;
const BOOLEAN_TRUE_OPTION_ID = 'true';
const BOOLEAN_FALSE_OPTION_ID = 'false';

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
 * - {@link adoptInvocations} carries `ChatToolInvocation` instances that
 *   `activeTurnToProgress` already produced so per-tool setup adopts them
 *   rather than recreating UI handles.
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
	readonly adoptInvocations?: ReadonlyMap<string, ChatToolInvocation>;
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
	/** Tool call IDs already subscribed — prevents duplicate observers. */
	readonly observedToolIds: Set<string>;
}

interface IStartServerRequestOptions {
	readonly isSystemInitiated?: boolean;
	readonly timestamp?: number;
	readonly isTerminalRequest?: boolean;
}

function parseTimestamp(value: string): number | undefined {
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : undefined;
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

function shouldAutoApproveClientToolCall(toolCall: ToolCallState): boolean {
	return readToolCallMeta(toolCall).autoApproveBySetting === true;
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

function convertProtocolAnswer(answer: ChatInputAnswer): IChatQuestionAnswerValue | undefined {
	if (answer.state !== ChatInputAnswerState.Submitted) {
		return undefined;
	}
	switch (answer.value.kind) {
		case ChatInputAnswerValueKind.Text:
			return answer.value.value;
		case ChatInputAnswerValueKind.Number:
		case ChatInputAnswerValueKind.Boolean:
			return String(answer.value.value);
		case ChatInputAnswerValueKind.Selected:
			return {
				selectedValue: answer.value.value,
				freeformValue: answer.value.freeformValues?.[0],
			};
		case ChatInputAnswerValueKind.SelectedMany:
			return {
				selectedValues: answer.value.value,
				freeformValue: answer.value.freeformValues?.[0],
			};
	}
}

function convertProtocolAnswers(raw: Record<string, ChatInputAnswer> | undefined): IChatQuestionAnswers | undefined {
	if (!raw) {
		return undefined;
	}
	const answers: IChatQuestionAnswers = {};
	for (const [questionId, answer] of Object.entries(raw)) {
		const converted = convertProtocolAnswer(answer);
		if (converted !== undefined) {
			answers[questionId] = converted;
		}
	}
	return Object.keys(answers).length > 0 ? answers : undefined;
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

function convertProtocolPlanReviewResult(planReview: IAgentHostPlanReview, response: ChatInputResponseKind, answers: Record<string, ChatInputAnswer> | undefined): IChatPlanReviewResult | undefined {
	if (response === ChatInputResponseKind.Decline) {
		return { rejected: true };
	}
	if (response !== ChatInputResponseKind.Accept) {
		return undefined;
	}

	const answer = answers?.[planReview.answerQuestionId];
	if (!answer || answer.state === ChatInputAnswerState.Skipped) {
		return undefined;
	}

	const value = answer.value;
	if (value.kind === ChatInputAnswerValueKind.Text) {
		const feedback = value.value.trim();
		return feedback ? { rejected: false, feedback, feedbackOverall: feedback } : undefined;
	}
	if (value.kind !== ChatInputAnswerValueKind.Selected) {
		return undefined;
	}

	const action = getPlanReviewAction(planReview, value.value, undefined);
	const feedback = value.freeformValues?.find(v => v.trim().length > 0)?.trim();
	return {
		rejected: false,
		action: action?.label ?? value.value,
		actionId: action?.id ?? value.value,
		...(feedback ? { feedback, feedbackOverall: feedback } : {}),
	};
}

// =============================================================================
// Chat session
// =============================================================================

class AgentHostChatSession extends Disposable implements IChatSession {
	readonly progressObs = observableValue<IChatProgress[]>('agentHostProgress', []);
	readonly isCompleteObs = observableValue<boolean>('agentHostComplete', true);

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
		private readonly _forkSession: ((request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => Promise<IChatSessionItem>),
		private readonly _renameSession: ((title: string, token: CancellationToken) => Promise<void>),
		inputState: ISerializableChatModelInputState | undefined,
		initialProgress: IChatProgress[] | undefined,
		onDispose: () => void,
		interruptActiveResponse: () => boolean,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		const hasActiveTurn = initialProgress !== undefined;
		this.transferredState = inputState ? { editingSession: undefined, inputState } : undefined;
		if (hasActiveTurn) {
			this.isCompleteObs.set(false, undefined);
			this.progressObs.set(initialProgress, undefined);
		}

		this._register(toDisposable(onDispose));

		// Always provide an interrupt callback so the chat UI's stop button
		// can cancel a remote turn at any time. The callback resolves the
		// current active turn at call time and dispatches ChatTurnCancelled.
		this.interruptActiveResponseCallback = async () => interruptActiveResponse();

		this.forkSession = this._forkSession;
		this.renameSession = this._renameSession;
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
	 * request+response pair in the chat model.
	 */
	startServerRequest(prompt: string, variableData?: IChatRequestVariableData, options?: IStartServerRequestOptions): void {
		this._logService.info('[AgentHost] Server-initiated request started');
		transaction(tx => {
			this.progressObs.set([], tx);
			this.isCompleteObs.set(false, tx);
		});
		this._onDidStartServerRequest.fire({
			prompt,
			variableData,
			isSystemInitiated: options?.isSystemInitiated,
			timestamp: options?.timestamp,
			isTerminalRequest: options?.isTerminalRequest,
		});
	}
}

// =============================================================================
// Session handler
// =============================================================================

export interface IAgentHostSessionHandlerConfig {
	readonly provider: AgentProvider;
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
	/**
	 * Optional callback invoked when the server rejects an operation because
	 * authentication is required. Should trigger interactive authentication
	 * and return true if the user authenticated successfully.
	 *
	 * @param protectedResources The protected resources from the agent's root
	 *   state that require authentication.
	 */
	readonly resolveAuthentication?: (protectedResources: ProtectedResourceMetadata[]) => Promise<boolean>;
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
export class AgentHostSessionHandler extends Disposable implements IChatSessionContentProvider {

	private static readonly DRAFT_SYNC_DEBOUNCE_MS = 500;

	private readonly _activeSessions = new ResourceMap<AgentHostChatSession>();
	private readonly _chatURIsBySessionResource = new ResourceMap<string>();
	/** Per-session subscription to chat model pending request changes. */
	private readonly _pendingMessageSubscriptions = this._register(new DisposableResourceMap());
	/** Per-session debounced sync from chat input state to AHP draft state. */
	private readonly _draftSyncSubscriptions = this._register(new DisposableResourceMap());
	/** Per-session subscription watching for server-initiated turns. */
	private readonly _serverTurnWatchers = this._register(new DisposableResourceMap());
	/** Historical turns with file edits, pending hydration into the editing session. */
	private readonly _pendingHistoryTurns = new ResourceMap<readonly Turn[]>();
	/**
	 * Per-session set of MCP server ids that already had an authentication
	 * prompt surfaced in the current conversation. A server is removed from the
	 * set once it reaches the running state ({@link McpServerStatus.Ready}), so
	 * that a later auth requirement for the same server prompts again instead of
	 * the prompt repeating on every message.
	 */
	private readonly _surfacedMcpAuthServers = new ResourceMap<Set<string>>();
	/** Turn IDs dispatched by this client, used to distinguish server-originated turns. */
	private readonly _clientDispatchedTurnIds = new Set<string>();
	private readonly _turnStopWatches = new Map<string, StopWatch>();
	private readonly _config: IAgentHostSessionHandlerConfig;

	/** Active session subscriptions, keyed by backend session URI string. */
	private readonly _sessionSubscriptions = new Map<string, IReference<IAgentSubscription<SessionState>>>();

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
		@IModelService private readonly _modelService: IModelService,
		@IWorkingCopyService private readonly _workingCopyService: IWorkingCopyService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IChatResponseFileChangesService private readonly _chatResponseFileChangesService: IChatResponseFileChangesService,
		@IPathService private readonly _pathService: IPathService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IAgentHostCustomizationService private readonly _customizationService: IAgentHostCustomizationService,
	) {
		super();
		this._config = config;

		// Drop MCP servers from the per-session surfaced set once they reach the
		// running state so a later auth requirement for the same server prompts
		// again.
		this._register(this._customizationService.onDidChangeCustomizations(() => this._reconcileSurfacedMcpAuthServers()));

		this._register(autorun(reader => {
			const defs = this._activeClientService.getClientTools(this._config.sessionType).read(reader);
			const clientId = this._config.connection.clientId;
			for (const [sessionResource] of this._activeSessions) {
				const backendSession = this._resolveSessionUri(sessionResource);
				const state = this._getSessionState(backendSession.toString());
				const existing = state?.activeClients.find(c => c.clientId === clientId);
				if (existing) {
					this._dispatchAction(backendSession, {
						type: ActionType.SessionActiveClientSet,
						activeClient: { ...existing, tools: [...defs] },
					});
				}
			}
		}));

		// When the user clicks "Continue in Background" on an AHP terminal
		// tool, narrow the terminal claim so the server-side tool handler
		// can detect it and return early.
		this._register(this._terminalChatService.onDidContinueInBackground(terminalToolSessionId => {
			const parsed = parseAhpTerminalToolSessionId(terminalToolSessionId);
			if (!parsed) {
				return;
			}
			this._logService.info(`[AgentHost] Continue in background: terminal=${parsed.terminal}, session=${parsed.session}`);
			this._config.connection.dispatch(parsed.terminal, {
				type: ActionType.TerminalClaimed,
				claim: {
					kind: TerminalClaimKind.Session,
					session: parsed.session,
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
			)),
		));

		// Push customization changes to sessions where this client is already active without reclaiming.
		const customizationsObs = this._activeClientService.getCustomizations(config.sessionType);
		this._register(autorun(reader => {
			const refs = customizationsObs.read(reader);
			const clientId = this._config.connection.clientId;
			for (const [sessionResource] of this._activeSessions) {
				const backendSession = this._resolveSessionUri(sessionResource);
				const state = this._getSessionState(backendSession.toString());
				const existing = state?.activeClients.find(c => c.clientId === clientId);
				if (existing && !equals(existing.customizations ?? [], refs)) {
					this._dispatchActiveClient(backendSession, [...refs]);
				}
			}
		}));

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
		const backendSession = this._resolveSessionUri(sessionResource);
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

	private _createCompletionItem(raw: AhpCompletionItem, text: string, attachment: IChatInputCompletionItem['attachment']): IChatInputCompletionItem {
		const item: Mutable<IChatInputCompletionItem> = {
			insertText: raw.insertText,
			attachment
		};
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
					});
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
			default:
				// Embedded resources will be added when the workbench grows first-class support for them.
				return undefined; // unknown attachment type
		}
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
		const history: IChatSessionHistoryItem[] = [];
		let initialProgress: IChatProgress[] | undefined;
		let initialResponsePartCount = 0;
		let activeTurnId: string | undefined;
		let sessionTitle: string | undefined;
		let draftInputState: ISerializableChatModelInputState | undefined;
		// Mark this session as hydrating so that a sibling chat of the same
		// session closing while we await our subscriptions does not tear down
		// the shared session subscription (which would strand us forever).
		const hydrationKey = resolvedSession.toString();
		this._hydratingChatSessions.set(hydrationKey, (this._hydratingChatSessions.get(hydrationKey) ?? 0) + 1);
		try {
			if (!isNewSession) {
				try {
					const sub = this._ensureSessionSubscription(resolvedSession.toString());
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
					const rawState = this._getRawSessionState(resolvedSession.toString());
					if (!rawState) {
						throw new Error(`Session state did not hydrate for ${resolvedSession.toString()}`);
					}
					chatURI = this._resolveChatUriFromState(sessionResource, rawState);
					this._setChatURI(sessionResource, chatURI);
					const chatSub = this._ensureChatSubscription(resolvedSession.toString(), chatURI);
					await this._whenSubscriptionHydrated(chatSub, token);
					const sessionState = this._getSessionState(resolvedSession.toString(), chatURI);
					if (sessionState) {
						sessionTitle = sessionState.title;
						const draft = sessionState.draft ?? emptyDraftFromLastTurn(sessionState);
						draftInputState = this._draftToInputState(sessionResource, draft);
						if (!sessionState.draft && draft) {
							this._config.connection.dispatch(chatURI, { type: ActionType.ChatDraftChanged, draft });
						}
						const fallbackRawModelId = lastTurnModelSelection(sessionState)?.id;
						const lookup = this._createTurnModelLookup(sessionResource, fallbackRawModelId);
						history.push(...turnsToHistory(resolvedSession, sessionState.turns, this._config.agentId, this._config.connectionAuthority, lookup, this._chatErrorContext(), this._config.connection.initializeResult.get()?.terminalCommandPrefix));

						// Enrich history with inner tool calls from subagent
						// child sessions. Subscribes to each child session so
						// its tool calls appear grouped under the parent widget.
						await this._enrichHistoryWithSubagentCalls(history, resolvedSession, sessionResource);

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
								type: 'request',
								prompt: sessionState.activeTurn.message.text,
								participant: this._config.agentId,
								modelId: lookup.toLanguageModelId(activeRawModelId),
								timestamp: parseTimestamp(sessionState.activeTurn.startedAt),
								variableData: messageToVariableData(sessionState.activeTurn.message, this._config.connectionAuthority),
								isSystemInitiated: sessionState.activeTurn.message.origin.kind === MessageKind.SystemNotification,
							});
							history.push({
								type: 'response',
								parts: [],
								participant: this._config.agentId,
								details: lookup.toResponseDetails(activeRawModelId, sessionState.activeTurn.usage),
							});
							initialProgress = activeTurnToProgress(resolvedSession, sessionState.activeTurn, this._config.connectionAuthority, sessionResource.authority);
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
		const session = this._instantiationService.createInstance(
			AgentHostChatSession,
			sessionResource,
			history,
			sessionTitle,
			(request: IChatSessionRequestHistoryItem | undefined, token: CancellationToken) => {
				if (!this._getSessionState(resolvedSession.toString())) {
					throw new Error('Cannot fork session before the initial request');
				}

				return this._forkSession(sessionResource, resolvedSession, request, token);
			},
			(title: string, _token: CancellationToken) => {
				this._config.connection.dispatch(resolvedSession.toString(), {
					type: ActionType.SessionTitleChanged,
					title,
				});
				return Promise.resolve();
			},
			draftInputState,
			initialProgress,
			() => {
				this._activeSessions.delete(sessionResource);
				this._pendingMessageSubscriptions.deleteAndDispose(sessionResource);
				this._draftSyncSubscriptions.deleteAndDispose(sessionResource);
				this._serverTurnWatchers.deleteAndDispose(sessionResource);
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
		this._activeSessions.set(sessionResource, session);

		if (!isNewSession) {
			this._ensurePendingMessageSubscription(sessionResource, resolvedSession);
			if (chatURI !== undefined) {
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
		// target folder. Mirrors how extension-host chat is gated. If the user
		// declines, abort without starting a session.
		if (!await this._ensureWorkspaceTrust(request.sessionResource)) {
			return {};
		}

		// A "Continue in…" migration from a local chat seeds the whole imported
		// conversation eagerly (CLI spawn, seeding turns) before any turn progress
		// streams, leaving the widget transiently empty. Only for that migration
		// case show a shimmering status if the turn is slow to start, cancelled as
		// soon as real progress streams. Normal agent-host sessions — whose first
		// turn is also slow to spawn — never flash it.
		const preparingStatus = new MutableDisposable();

		try {
			const resolvedSession = this._resolveSessionUri(request.sessionResource);
			const sessionKey = resolvedSession.toString();

			// The chat-input picker may have pre-created a provisional session
			// against this resource (`IAgentHostUntitledProvisionalSessionService.getOrCreate`).
			// In that case the agent already has the session + the user's chip
			// selections in `state.config.values`; ensure we hold a refcounted
			// subscription on it so the rest of the handler observes those.
			await raceCancellation(this._provisionalService.waitForPending(request.sessionResource), cancellationToken);
			if (cancellationToken.isCancellationRequested) {
				return {};
			}
			const provisionalBackend = this._provisionalService.get(request.sessionResource);
			if (provisionalBackend) {
				this._ensureSessionSubscription(sessionKey);
			}

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
					undefined,
					Object.keys(initialConfig).length > 0 ? initialConfig : undefined,
					imported ? { turns: imported.turns, model: imported.model } : undefined,
				);
			} else {
				// Eager-created session: take a refcounted subscription so the
				// handler observes state changes for the duration of the chat
				// session, then wire up the per-turn machinery that
				// `_createAndSubscribe` would normally set up.
				this._ensureSessionSubscription(sessionKey);
				this._setChatURI(request.sessionResource, this._resolveChatUriFromState(request.sessionResource, existingState));
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

			const completedTurn = await this._handleTurn(resolvedSession, request, measuredProgress, cancellationToken);
			const details = this._getTurnResponseDetails(request.sessionResource, resolvedSession, completedTurn);
			const errorDetails = this._getTurnErrorDetails(completedTurn);

			return {
				timings: { firstProgress, totalElapsed: stopWatch.elapsed() },
				...(details ? { details } : {}),
				...(errorDetails ? { errorDetails } : {}),
			};
		} finally {
			// Always cancel the pending "preparing" status — including when an
			// await above (state read, create/subscribe, turn handling) rejects —
			// so a stale status can never fire after the invocation has ended.
			preparingStatus.dispose();
		}
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
		interface IPendingSnapshot { id: string; text: string; attachments?: MessageAttachment[] }
		let currentSteering: IPendingSnapshot | undefined;
		const currentQueued: IPendingSnapshot[] = [];
		for (const p of pending) {
			const variables = p.request.variableData?.variables ?? [];
			const messageAttachments = this._variableEntriesToAttachments(variables, sessionResource, p.request.message.text);
			const attachments = messageAttachments.length > 0 ? messageAttachments : undefined;
			const snapshot: IPendingSnapshot = { id: p.request.id, text: p.request.message.text, attachments };
			if (p.kind === ChatRequestQueueKind.Steering) {
				currentSteering = snapshot;
			} else {
				currentQueued.push(snapshot);
			}
		}

		// --- Steering ---
		if (currentSteering) {
			if (currentSteering.id !== prevSteering?.id || currentSteering.text !== prevSteering.message.text) {
				this._dispatchAction(backendSession, {
					type: ActionType.ChatPendingMessageSet,
					kind: PendingMessageKind.Steering,
					id: currentSteering.id,
					message: userOriginMessage(currentSteering.text, currentSteering.attachments),
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
			if (!prev || q.text !== prev.message.text) {
				this._dispatchAction(backendSession, {
					type: ActionType.ChatPendingMessageSet,
					kind: PendingMessageKind.Queued,
					id: q.id,
					message: userOriginMessage(q.text, q.attachments),
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

	private _getCurrentActiveClient(): SessionActiveClient {
		return this._activeClientService.getActiveClient(this._config.sessionType, this._config.connection.clientId);
	}

	private _ensureActiveClientForMessage(backendSession: URI): void {
		const state = this._getSessionState(backendSession.toString());
		const activeClient = this._getCurrentActiveClient();
		const existing = state?.activeClients.find(c => c.clientId === activeClient.clientId);
		if (equals(existing, activeClient)) {
			return;
		}
		this._dispatchAction(backendSession, {
			type: ActionType.SessionActiveClientSet,
			activeClient,
		});
	}

	/**
	 * Dispatches `session/activeClientSet` to add this connection as an
	 * active client for this session and publish the current customizations
	 * and client-provided tools. This client never removes itself.
	 */
	private _dispatchActiveClient(backendSession: URI, customizations: ClientPluginCustomization[]): void {
		const current = this._getCurrentActiveClient();
		this._dispatchAction(backendSession, {
			type: ActionType.SessionActiveClientSet,
			activeClient: { ...current, customizations },
		});
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

		// Seed from the current state so we don't treat any pre-existing active
		// turn (e.g. one being handled by _reconnectToActiveTurn) as new.
		const currentState = this._getSessionState(sessionStr, chatURI);
		let lastSeenTurnId: string | undefined = currentState?.activeTurn?.id;
		let previousQueuedIds: Set<string> | undefined;
		let previousSteeringId: string | undefined = currentState?.steeringMessage?.id;
		let previousTitle: string | undefined = currentState?.title;

		const disposables = new DisposableStore();

		// MutableDisposable for per-turn progress tracking (replaced each turn)
		const turnProgressDisposable = new MutableDisposable<DisposableStore>();
		disposables.add(turnProgressDisposable);

		const sessionSub = this._ensureSessionSubscription(sessionStr);
		const chatSub = this._ensureChatSubscription(sessionStr, chatURI);
		// Conversation contents now live on the default chat, while title and
		// other session-scoped fields stay on the session. Re-evaluate on a
		// change to either channel, reading the merged view.
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

			const currentTitle = e.state.title;
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
				activeTurn.message.text,
				messageToVariableData(activeTurn.message, this._config.connectionAuthority),
				{
					isSystemInitiated: activeTurn.message.origin.kind === MessageKind.SystemNotification,
					timestamp: parseTimestamp(activeTurn.startedAt),
					isTerminalRequest: isTerminalCommandPrompt(activeTurn.message.text, this._config.connection.initializeResult.get()?.terminalCommandPrefix),
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
	): Promise<Turn | undefined> {
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
		this._ensureActiveClientForMessage(session);

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
			message: {
				...userOriginMessage(request.message, messageAttachments),
				...(selectedModel ? { model: selectedModel } : {}),
				...(requestedAgentUri ? { agent: { uri: requestedAgentUri } } : {}),
			},
		};
		this._ensureTurnStopWatch(turnChannel, turnId);
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
		protocolOptions?: ConfirmationOption[],
		chatURI?: string,
	): void {
		IChatToolInvocation.awaitConfirmation(invocation, cancellationToken).then(reason => {
			// When the user picked a custom button, resolve the matching
			// protocol option so we can forward `selectedOptionId` and
			// derive approve/deny from the option's kind.
			let selectedOption: ConfirmationOption | undefined;
			if (reason.type === ToolConfirmKind.UserAction && reason.selectedButton && protocolOptions) {
				selectedOption = protocolOptions.find(o => o.id === reason.selectedButton);
			}

			const approved = selectedOption
				? selectedOption.kind === ConfirmationOptionKind.Approve
				: reason.type !== ToolConfirmKind.Denied && reason.type !== ToolConfirmKind.Skipped;

			this._logService.info(`[AgentHost] Tool confirmation: toolCallId=${toolCallId}, approved=${approved}, selectedOptionId=${selectedOption?.id}`);
			const target = this._requireChatURI(chatURI, ActionType.ChatToolCallConfirmed);
			if (approved) {
				this._config.connection.dispatch(target, {
					type: ActionType.ChatToolCallConfirmed,
					turnId,
					toolCallId,
					approved: true,
					confirmed: ToolCallConfirmationReason.UserAction,
					...(selectedOption ? { selectedOptionId: selectedOption.id } : {}),
				});
			} else {
				this._config.connection.dispatch(target, {
					type: ActionType.ChatToolCallConfirmed,
					turnId,
					toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
					...(selectedOption ? { selectedOptionId: selectedOption.id } : {}),
				});
			}
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
	 * progress is delivered) and {@link IObserveTurnOptions.adoptInvocations} /
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
		// (turns, active turn, input requests) are observable from one place.
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
		const inputRequests$ = derived(reader => mergedState$.read(reader)?.inputRequests ?? []);
		const usage$ = derived(reader => turn$.read(reader)?.usage);
		store.add(autorun(reader => {
			const state = mergedState$.read(reader);
			if (state?.turns.some(turn => turn.id === opts.turnId)) {
				this._clearTurnStopWatch(opts.chatURI, opts.turnId);
			}
		}));
		const mcpAuthRequired$ = derivedOpts({ equalsFn: equals }, reader => {
			const state = mergedState$.read(reader);
			const servers = state?.customizations?.flatMap(c => c.type === CustomizationType.McpServer
				? [c]
				: c.children?.filter(c => c.type === CustomizationType.McpServer) ?? []) ?? [];
			const toolAuthServerIds = new Set(state?.inputNeeded
				?.filter(request => request.kind === SessionInputRequestKind.ToolAuthentication)
				.map(request => request.kind === SessionInputRequestKind.ToolAuthentication
					? request.toolCall.contributor.customizationId
					: undefined)
				.filter(id => id !== undefined));
			const authRequiredServers = servers.filter(server => server.enabled && server.state.kind === McpServerStatus.AuthRequired && !toolAuthServerIds.has(server.id));
			return authRequiredServers.map((server): IChatMcpAuthenticationRequiredServer => {
				const state = server.state as McpServerAuthRequiredState;
				return {
					id: opts.sessionResource.authority + '/' + server.id,
					name: server.name,
					resource: state.resource.resource,
					authorizationServers: state.resource.authorization_servers,
					supportedScopes: state.resource.scopes_supported,
					requiredScopes: state.requiredScopes,
					reason: state.reason,
				};
			});
		});
		const mcpStarting$ = derivedOpts({ equalsFn: equals }, reader => {
			const state = mergedState$.read(reader);
			const servers = state?.customizations?.flatMap(c => c.type === CustomizationType.McpServer
				? [c]
				: c.children?.filter(c => c.type === CustomizationType.McpServer) ?? []) ?? [];
			return servers
				.filter(server => server.enabled && server.state.kind === McpServerStatus.Starting)
				.map((server): IChatMcpStartingServer => ({
					id: opts.sessionResource.authority + '/' + server.id,
					name: server.name,
				}));
		});

		// Subagent observation context: dedups subagent tool calls so each is
		// observed once.
		const subagentContext: ISubagentContext = {
			observedToolIds: new Set<string>(),
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
					case ResponsePartKind.SystemNotification:
						// System notifications don't have an id, so we have to identify it by index
						if (responseParts$.get().indexOf(initial) >= (opts.initialResponsePartCount ?? 0) && opts.subAgentInvocationId === undefined) {
							const progress = systemNotificationToChatPart(initial.content, this._config.connectionAuthority);
							if (progress) {
								opts.sink([progress]);
							}
						}
						break;
				}
			},
		));

		// Per input request carousel. Skipped for subagent observers — input
		// requests on a subagent session are surfaced through that session's
		// own view, not the parent.
		if (opts.subAgentInvocationId === undefined) {
			let lastUsage: ReturnType<typeof usageInfoToChatUsage>;
			let lastAutoModeResolution: IChatAutoModeResolutionPart | undefined;
			const modelLookup = this._createTurnModelLookup(opts.sessionResource, undefined);

			this._setupMcpAuthPrompt(mcpAuthRequired$, store, opts);

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
				const usage = usageInfoToChatUsage(rawUsage);
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
					&& equals(lastUsage.promptTokenDetails, usage.promptTokenDetails)) {
					return;
				}
				lastUsage = usage;
				opts.sink([usage]);
			}));

			// Surface the account quota snapshots the agent host reports on each model-call usage event
			// into the entitlement service, keeping the quota UI current for agent-host sessions (mirrors
			// the extension-host CLI path). `acceptQuotas` replaces state, so shallow-merge the top-level
			// container and deep-merge each per-category snapshot to preserve fields the usage event
			// doesn't carry (e.g. `hasQuota`, `usageBasedBilling` from a prior full entitlement fetch).
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
				const existing = this._chatEntitlementService.quotas;
				this._chatEntitlementService.acceptQuotas({
					...existing,
					...quotaUpdate,
					chat: quotaUpdate.chat ? { ...existing.chat, ...quotaUpdate.chat } : existing.chat,
					completions: quotaUpdate.completions ? { ...existing.completions, ...quotaUpdate.completions } : existing.completions,
					premiumChat: quotaUpdate.premiumChat ? { ...existing.premiumChat, ...quotaUpdate.premiumChat } : existing.premiumChat,
				});
			}));

			store.add(autorunPerKeyedItem(
				inputRequests$,
				ir => ir.id,
				(_id, ir$, irStore) => {
					this._setupInputRequest(ir$.get(), irStore, opts);
				},
			));
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
				const modelName = modelId ? this._languageModelsService.lookupLanguageModel(modelId)?.name : undefined;
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
			try {
				const authenticated = await this._instantiationService.invokeFunction(resolveMcpServerAuthentication, {
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
					scopes: server.requiredScopes ?? [],
					agentHost: { scheme: sessionResource.scheme, authority: sessionResource.authority },
					authenticate: request => this._config.connection.authenticate(request),
				});
				if (!authenticated) {
					remaining.push(server);
				}
			} catch (err) {
				this._logService.error(`[AgentHost] Failed to auto-authenticate MCP server '${server.name}'`, err);
				remaining.push(server);
			}
		}
		return remaining;
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
		const contributor = initial.contributor;
		if (contributor?.kind === ToolCallContributorKind.Client && contributor.clientId === this._config.connection.clientId) {
			this._setupClientToolCall(initial, part$, store, opts);
		} else {
			this._setupServerToolCall(initial, part$, store, opts, subagentContext);
		}
	}

	/**
	 * Per-call setup for a server-driven tool. Adopts a snapshot
	 * {@link ChatToolInvocation} when present (reconnect parity); otherwise
	 * emits a fresh one. Reacts to status transitions for re-confirmation,
	 * terminal revival, finalization, and subagent observation.
	 */
	private _setupServerToolCall(
		initial: ToolCallState,
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
		subagentContext: ISubagentContext,
	): void {
		const toolCallId = initial.toolCallId;
		const subAgentInvocationId = opts.subAgentInvocationId;
		const adopted = opts.adoptInvocations?.get(toolCallId);
		let invocation = adopted
			?? toolCallStateToInvocation(initial, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
		if (!adopted) {
			opts.sink([invocation]);
		}

		const tryObserveSubagent = (tc: ToolCallState) => {
			if (subagentContext.observedToolIds.has(toolCallId)) {
				return;
			}
			// Only observe a tool once it has started running (or finished).
			if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.Completed) {
				return;
			}
			// Observe as a subagent if the tool is a known subagent-spawning
			// tool (from `_meta.toolKind`/name) or already carries a Subagent
			// content block (older restored snapshots). We deliberately do NOT
			// *require* the content block: the child chat URI is derived from
			// the tool call id alone (see `_observeSubagentSession`), so the
			// block is not needed to subscribe. This keeps observation robust
			// even when the discovery content block never reaches this chat —
			// e.g. an agent host that does not route it to the immediate
			// parent chat of a nested subagent, or a restored snapshot that
			// predates it. Gating on the block would otherwise leave such a
			// nested subagent — and any client tools it calls — unobserved,
			// hanging the session.
			if (!isSubagentTool(tc) && !getToolSubagentContent(tc)) {
				return;
			}
			subagentContext.observedToolIds.add(toolCallId);
			if (invocation.toolSpecificData?.kind === 'subagent') {
				invocation.toolSpecificData.isActive = true;
				invocation.notifyToolSpecificDataChanged();
			}

			// Track this subagent's own running credit (AIC) total so it can be
			// surfaced on the subagent tool's hover and persisted via its
			// `toolSpecificData`. The parent turn's reported cost already
			// includes this subagent (the agent host folds subagent usage into
			// the parent turn), so it is NOT re-added to the parent here.
			const perInvocationCredits = observableValue<number>('subagentInvocationCredits', 0);
			store.add(autorun(reader => {
				const total = perInvocationCredits.read(reader);
				if (total > 0 && invocation.toolSpecificData?.kind === 'subagent' && invocation.toolSpecificData.credits !== total) {
					invocation.toolSpecificData.credits = total;
					invocation.notifyToolSpecificDataChanged();
				}
			}));

			// Track the model this subagent ran on so it can be surfaced on
			// the subagent tool's hover (mirrors the local subagent path).
			const perInvocationModel = observableValue<string | undefined>('subagentInvocationModel', undefined);
			store.add(autorun(reader => {
				const modelName = perInvocationModel.read(reader);
				if (modelName && invocation.toolSpecificData?.kind === 'subagent' && invocation.toolSpecificData.modelName !== modelName) {
					invocation.toolSpecificData.modelName = modelName;
					invocation.notifyToolSpecificDataChanged();
				}
			}));

			// Group descendant tool calls under the root subagent so the
			// renderer nests the whole tree under one container; for the
			// top-level subagent the root is this tool call itself.
			const rootInvocationId = subAgentInvocationId ?? toolCallId;
			const childChatUri = (invocation.toolSpecificData?.kind === 'subagent' && invocation.toolSpecificData.chatResource)
				|| buildSubagentChatUri(opts.backendSession.toString(), toolCallId);
			this._observeSubagentSession(opts.sessionResource, opts.backendSession, toolCallId, childChatUri, rootInvocationId, invocation, opts.sink, store, subagentContext, perInvocationCredits, perInvocationModel);
		};

		// Initial confirmation hookup. The autorun below only handles
		// *transitions* back into `PendingConfirmation` (server-driven
		// re-confirmation), not the initial state, because
		// `toolCallStateToInvocation` already created the invocation in
		// `WaitingForConfirmation`. Without this explicit call, no listener
		// would observe the user's confirmation answer.
		if (initial.status === ToolCallStatus.PendingConfirmation && !IChatToolInvocation.isComplete(invocation)) {
			this._awaitToolConfirmation(invocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, initial.options, opts.chatURI);
		}
		tryObserveSubagent(initial);

		// Stream subsequent status transitions. Re-confirmation is detected
		// from a `tc.status` transition (Running → PendingConfirmation), not
		// from comparing against `invocation.state`: the user's local
		// confirmation flips `invocation.state` to `Executing` before the
		// server echoes Running, and a state-comparison check would
		// spuriously trigger re-confirmation in that gap.
		let previousStatus: ToolCallStatus | undefined;
		store.add(autorun(reader => {
			const tc = part$.read(reader).toolCall;
			const status = tc.status;
			const priorStatus = previousStatus;
			const isReconfirmation = previousStatus !== undefined
				&& previousStatus !== ToolCallStatus.PendingConfirmation
				&& status === ToolCallStatus.PendingConfirmation;
			previousStatus = status;

			if (isReconfirmation) {
				// Server bounced the call back to PendingConfirmation
				// (e.g. write confirmation after edit). Settle the old
				// invocation and replace it with a fresh one carrying the
				// new confirmation messages.
				invocation.didExecuteTool(undefined);
				const confirmInvocation = toolCallStateToInvocation(tc, subAgentInvocationId, opts.backendSession, this._config.connectionAuthority, opts.sessionResource.authority);
				opts.sink([confirmInvocation]);
				invocation = confirmInvocation;
				this._awaitToolConfirmation(confirmInvocation, toolCallId, opts.backendSession, opts.turnId, opts.cancellationToken, tc.options, opts.chatURI);
			} else if (status === ToolCallStatus.PendingConfirmation) {
				invocation.updateConfirmationMessages(toolCallConfirmationMessages(tc, this._config.connectionAuthority));
			} else if (status === ToolCallStatus.AuthRequired) {
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
				invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, this._config.connectionAuthority);
				this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession);
				updateRunningToolSpecificData(invocation, tc, opts.backendSession, this._config.connectionAuthority);
			}

			tryObserveSubagent(tc);

			if ((status === ToolCallStatus.Completed || status === ToolCallStatus.Cancelled) && !IChatToolInvocation.isComplete(invocation)) {
				// Revive terminal before finalizing — handles the case where
				// Running was skipped (e.g. throttling) and terminal content
				// only appears at Completed time.
				this._reviveTerminalIfNeeded(invocation, tc, opts.backendSession);
				const fileEdits = finalizeToolInvocation(invocation, tc, opts.backendSession, this._config.connectionAuthority);
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

	/**
	 * Per-call setup for a client-provided tool. Eagerly creates a streaming
	 * {@link ChatToolInvocation} so the UI has a handle, then invokes the
	 * tool once parameters are available. The inner autorun on `part$` is
	 * idempotent: `invoked` ensures `invokeTool` runs at most once,
	 * `confirmationDispatched` ensures `ChatToolCallConfirmed` is sent at
	 * most once.
	 */
	private _setupClientToolCall(
		initial: ToolCallState,
		part$: IObservable<ToolCallResponsePart>,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const toolCallId = initial.toolCallId;
		const toolName = initial.toolName;

		// Reconnect adoption: settle any snapshot invocation so the new
		// streaming one created by `beginToolCall` can take over the UI
		// slot rather than leaving the old instance orphaned.
		const adopted = opts.adoptInvocations?.get(toolCallId);
		if (adopted && !IChatToolInvocation.isComplete(adopted)) {
			adopted.didExecuteTool(undefined);
		}

		const toolData = this._toolsService.getToolByName(toolName);
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

		const invocation = this._toolsService.beginToolCall({
			toolCallId,
			toolId: toolData.id,
			subagentInvocationId: opts.subAgentInvocationId,
			sessionResource: opts.sessionResource,
			force: true,
		}) as ChatToolInvocation | undefined;

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

		const cts = new CancellationTokenSource();
		store.add(toDisposable(() => cts.dispose(true)));

		let invoked = false;
		let approvedDispatched = false;
		let confirmationDispatched = false;

		// Drive `ChatToolCallConfirmed` from the invocation's confirmation
		// gate. The autorun runs synchronously many times; the guards keep it
		// idempotent.
		store.add(autorun(reader => {
			const state = invocation.state.read(reader);
			const tc = part$.read(reader).toolCall;
			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && shouldAutoApproveClientToolCall(tc)) {
				state.confirm({ type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove });
				return;
			}
			if (confirmationDispatched) {
				return;
			}
			if (state.type === IChatToolInvocation.StateKind.Executing) {
				confirmationDispatched = true;
				if (cts.token.isCancellationRequested) {
					return;
				}
				approvedDispatched = true;
				this._dispatchAction(opts.backendSession, {
					type: ActionType.ChatToolCallConfirmed,
					turnId: opts.turnId,
					toolCallId,
					approved: true,
					confirmed: confirmedReasonToProtocol(state.confirmed),
				}, opts.chatURI);
			} else if (state.type === IChatToolInvocation.StateKind.Cancelled) {
				// Pre-execution cancellation. If the server already knows
				// (cts cancelled), suppress the dispatch — the server
				// transitioned the call itself.
				confirmationDispatched = true;
				if (cts.token.isCancellationRequested) {
					return;
				}
				this._dispatchAction(opts.backendSession, {
					type: ActionType.ChatToolCallConfirmed,
					turnId: opts.turnId,
					toolCallId,
					approved: false,
					reason: ToolCallCancellationReason.Denied,
				}, opts.chatURI);
			}
		}));

		const handleSettled = (result: IToolResult | undefined, err: unknown) => {
			if (cts.token.isCancellationRequested) {
				return;
			}

			if (err !== undefined) {
				if (!isCancellationError(err)) {
					if (!approvedDispatched) {
						this._logService.warn(`[AgentHost] Client tool rejected pre-execution: ${toolName}`, err);
					} else {
						this._logService.warn(`[AgentHost] Client tool invocation failed: ${toolName}`, err);
					}
				}

				result = { content: [], toolResultError: err instanceof Error ? err.message : String(err) };
			}

			const protocolToolCall = part$.get().toolCall;
			const isProtocolToolCallComplete = protocolToolCall.status === ToolCallStatus.Completed || protocolToolCall.status === ToolCallStatus.Cancelled;
			if (!isProtocolToolCallComplete) {
				this._dispatchAction(opts.backendSession, {
					type: ActionType.ChatToolCallComplete,
					turnId: opts.turnId,
					toolCallId,
					result: toolResultToProtocol(result ?? { content: [] }, toolName),
				}, opts.chatURI);
			}
		};

		// React to part$ updates: route external cancellation, and try to
		// invoke once parameters are present. Idempotent via `invoked` and
		// `cts.token.isCancellationRequested`.
		store.add(autorun(reader => {
			const tc = part$.read(reader).toolCall;
			const state = invocation.state.read(reader);
			if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && shouldAutoApproveClientToolCall(tc)) {
				state.confirm({ type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove });
			}
			if (tc.status === ToolCallStatus.Cancelled || tc.status === ToolCallStatus.Completed) {
				// The protocol tool call reached a terminal state. If this was
				// driven by the server (e.g. the client-tool bridge abandoned the
				// call because the client was considered disconnected, the turn was
				// superseded, or a reconnect occurred) while our local `invokeTool`
				// is still running, cancel it so the tool cleans up (e.g. dismisses a
				// pending question carousel) instead of blocking forever on an answer
				// nobody will consume. In the normal path we complete the call
				// ourselves first, so `invokeTool` has already settled and this
				// cancellation is a harmless no-op.
				if (cts.token.isCancellationRequested) {
					return;
				}
				cts.cancel();
				if (!invoked && tc.status === ToolCallStatus.Cancelled) {
					// No `invokeTool` is listening to the CTS — transition
					// the invocation to `Cancelled` ourselves.
					invocation.cancelFromStreaming(ToolConfirmKind.Skipped);
				}
				return;
			}
			if (invoked || cts.token.isCancellationRequested) {
				return;
			}
			// eslint-disable-next-line local/code-no-in-operator
			let toolInput = 'toolInput' in tc ? tc.toolInput : undefined;
			if (toolInput === undefined) {
				// Still streaming — parameters may still be arriving. Once
				// we move past Streaming, treat a missing toolInput as `{}`
				// so zero-argument tools are not stuck.
				if (tc.status === ToolCallStatus.Streaming) {
					return;
				}
				toolInput = '{}';
			}
			invoked = true;

			let parameters: Record<string, unknown> = {};
			try {
				const parsed: unknown = JSON.parse(toolInput);
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
					throw new Error('expected JSON object');
				}
				parameters = parsed as Record<string, unknown>;
			} catch {
				this._logService.warn(`[AgentHost] Failed to parse tool input for ${toolName}`);
				this._dispatchAction(opts.backendSession, {
					type: ActionType.ChatToolCallComplete,
					turnId: opts.turnId,
					toolCallId,
					result: {
						success: false,
						pastTenseMessage: `Failed to execute ${toolName}`,
						error: { message: `Invalid tool input for "${toolName}": expected JSON object parameters` },
					},
				}, opts.chatURI);
				return;
			}

			const inv: IToolInvocation = {
				callId: toolCallId,
				toolId: invocation.toolId,
				parameters,
				context: { sessionResource: opts.sessionResource },
				chatStreamToolCallId: toolCallId,
				// If the agent host already resolved auto-approval for this call,
				// pass it through so the invocation transitions straight to
				// executing instead of briefly flashing a confirmation prompt
				// (which would flicker "needs input" in the sessions list).
				preApproved: shouldAutoApproveClientToolCall(tc)
					? { type: ToolConfirmKind.Setting, id: SessionConfigKey.AutoApprove }
					: undefined,
			};
			const noOpCountTokens = async () => 0;
			this._logService.info(`[AgentHost] Invoking client tool: ${toolName} (callId=${toolCallId})`);
			this._toolsService.invokeTool(inv, noOpCountTokens, cts.token).then(
				result => handleSettled(result, undefined),
				err => handleSettled(undefined, err),
			);
		}));
	}

	private _setupInputRequest(
		inputReq: ChatInputRequest,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const planReview = (inputReq as ChatInputRequestWithPlanReview).planReview;
		if (planReview) {
			this._setupPlanReviewInputRequest(inputReq, planReview, store, opts);
			return;
		}

		if (inputReq.url) {
			this._setupUrlInputRequest(inputReq, inputReq.url, store, opts);
			return;
		}

		const questions: IChatQuestion[] = (inputReq.questions ?? []).map((q): IChatQuestion => {
			let title = q.title;
			let message = q.message;
			if (!title) {
				const EOL = q.message.indexOf('\n');
				title = EOL === -1 ? q.message : q.message.substring(0, EOL).trim();
				message = EOL === -1 ? '' : q.message.substring(EOL + 1).trim();
			}
			const detailedMessage = new MarkdownString(message, { isTrusted: false });

			switch (q.kind) {
				case ChatInputQuestionKind.SingleSelect:
					return {
						id: q.id,
						type: 'singleSelect',
						title,
						detailedMessage,
						required: q.required,
						allowFreeformInput: q.allowFreeformInput ?? true,
						options: q.options.map(o => ({ id: o.id, label: o.label, value: o.id })),
					};
				case ChatInputQuestionKind.MultiSelect:
					return {
						id: q.id,
						type: 'multiSelect',
						title,
						detailedMessage,
						required: q.required,
						allowFreeformInput: q.allowFreeformInput ?? true,
						options: q.options.map(o => ({ id: o.id, label: o.label, value: o.id })),
					};
				case ChatInputQuestionKind.Boolean:
					return {
						id: q.id,
						type: 'singleSelect',
						title,
						detailedMessage,
						required: q.required,
						allowFreeformInput: false,
						defaultValue: q.defaultValue === undefined ? undefined : String(q.defaultValue),
						options: [
							{ id: BOOLEAN_TRUE_OPTION_ID, label: localize('chat.inputRequest.boolean.true', "True"), value: BOOLEAN_TRUE_OPTION_ID },
							{ id: BOOLEAN_FALSE_OPTION_ID, label: localize('chat.inputRequest.boolean.false', "False"), value: BOOLEAN_FALSE_OPTION_ID },
						],
					};
				case ChatInputQuestionKind.Text:
					return {
						id: q.id,
						type: 'text',
						title,
						detailedMessage,
						required: q.required,
						defaultValue: q.defaultValue,
					};
				default:
					return {
						id: q.id,
						type: 'text',
						title,
						detailedMessage,
						required: q.required,
					};
			}
		});

		if (questions.length === 0) {
			// Fallback for input requests with no structured questions —
			// create a single text question from the message.
			questions.push({
				id: 'answer',
				type: 'text',
				title: inputReq.message ?? '',
				required: true,
			});
		}

		const carousel = new ChatQuestionCarouselData(
			questions,
			/* allowSkip */ true,
			inputReq.id,
			/* data */ undefined,
			/* isUsed */ undefined,
			/* message */ inputReq.message ? rawMarkdownToString(inputReq.message, this._config.connectionAuthority) : undefined,
		);
		opts.sink([carousel]);

		// Track the latest server-known answers — initially what was on the
		// request when it appeared, then overwritten by `ChatInputCompleted`
		// when the server applies it. The disposal path uses this to settle
		// the carousel with the server's authoritative answers.
		let latestProtocolAnswers: Record<string, ChatInputAnswer> | undefined = inputReq.answers;

		// An `Accept` without structured answers means the input was answered
		// outside the carousel UI (e.g. via voice), so render "Answered" not "Skipped".
		let latestResponseKind: ChatInputResponseKind | undefined;

		// Capture protocol answers from `ChatInputCompleted` BEFORE the
		// reducer drops the request from state — by the time disposal runs,
		// the action payload is no longer reachable. Also overwrite the
		// carousel's `data` so it reflects the server's authoritative answer
		// even if the user already locally submitted (mirrors legacy
		// `_applyCompletedInputRequest` behavior).
		const sub = this._ensureChatSubscription(opts.backendSession.toString(), opts.chatURI);
		store.add(sub.onWillApplyAction(envelope => {
			const action = envelope.action as ChatAction;
			if (action.type !== ActionType.ChatInputCompleted || action.requestId !== inputReq.id) {
				return;
			}
			latestResponseKind = action.response;
			latestProtocolAnswers = action.response === ChatInputResponseKind.Accept
				? (action as ChatInputCompletedAction).answers ?? latestProtocolAnswers
				: undefined;
			const carouselAnswers = convertProtocolAnswers(latestProtocolAnswers);
			carousel.data = carouselAnswers ?? {};
			carousel.answeredExternally = latestResponseKind === ChatInputResponseKind.Accept && !carouselAnswers;
			carousel.draftAnswers = undefined;
			carousel.draftCurrentIndex = undefined;
			carousel.draftCollapsed = undefined;
		}));

		// User-driven completion → dispatch `ChatInputCompleted`. The
		// state echo (handled above) updates the carousel with the server's
		// authoritative answer afterwards.
		carousel.completion.p.then(result => {
			if (store.isDisposed) {
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

		// Disposal: the request was either completed (action seen via
		// `onWillApplyAction`) or abandoned (turn ended). Settle the
		// carousel with whatever server answers we last captured and clear
		// the input UI to mirror legacy `_syncInputRequests` behavior.
		store.add(toDisposable(() => {
			if (carousel.isUsed) {
				return;
			}
			const carouselAnswers = convertProtocolAnswers(latestProtocolAnswers);
			carousel.data = carouselAnswers ?? {};
			carousel.isUsed = true;
			carousel.answeredExternally = latestResponseKind === ChatInputResponseKind.Accept && !carouselAnswers;
			carousel.draftAnswers = undefined;
			carousel.draftCurrentIndex = undefined;
			carousel.draftCollapsed = undefined;
			carousel.completion.complete({ answers: carouselAnswers });
			this._chatWidgetService.getWidgetBySessionResource(opts.sessionResource)?.input.clearQuestionCarousel(undefined, inputReq.id);
		}));
	}

	private _setupPlanReviewInputRequest(
		inputReq: ChatInputRequest,
		planReview: IAgentHostPlanReview,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		const review = new ChatPlanReviewData(
			planReview.title,
			planReview.content,
			planReview.actions.map(action => ({
				id: action.id,
				label: action.label,
				...(action.description ? { description: action.description } : {}),
				...(action.default ? { default: true } : {}),
				...(action.permissionLevel ? { permissionLevel: action.permissionLevel } : {}),
			})),
			planReview.canProvideFeedback,
			planReview.planUri ? URI.parse(planReview.planUri).toJSON() : undefined,
			inputReq.id,
		);
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

		const sub = this._ensureChatSubscription(opts.backendSession.toString(), opts.chatURI);
		store.add(sub.onWillApplyAction(envelope => {
			const action = envelope.action as ChatAction;
			if (action.type !== ActionType.ChatInputCompleted || action.requestId !== inputReq.id) {
				return;
			}
			inputCompleted = true;
			latestResult = convertProtocolPlanReviewResult(planReview, action.response, (action as ChatInputCompletedAction).answers);
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
		inputReq: ChatInputRequest,
		url: string,
		store: DisposableStore,
		opts: IObserveTurnOptions,
	): void {
		let settled = false;
		const settle = (response: ChatInputResponseKind) => {
			if (settled) {
				return;
			}
			settled = true;
			this._config.connection.dispatch(opts.chatURI, {
				type: ActionType.ChatInputCompleted,
				requestId: inputReq.id,
				response,
			});
		};

		let authority = url;
		try {
			authority = URI.parse(url).authority || url;
		} catch {
			// Fall back to the raw URL string.
		}

		const message = new MarkdownString();
		if (inputReq.message) {
			message.appendText(inputReq.message);
			message.appendMarkdown('\n\n');
		}
		message.appendMarkdown(localize('agentHost.elicit.url.instruction', "Open this URL?"));
		message.appendCodeblock('', url);

		const part = new ChatElicitationRequestPart(
			localize('agentHost.elicit.url.title', "Authorization Required"),
			message,
			'',
			localize('agentHost.elicit.url.open', "Open {0}", authority),
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

		// Server-side completion (e.g. another client answered or the
		// agent observed completion). Mark settled so disposal doesn't
		// re-dispatch a Cancel, and hide the part from the UI.
		const sub = this._ensureChatSubscription(opts.backendSession.toString(), opts.chatURI);
		store.add(sub.onWillApplyAction(envelope => {
			const action = envelope.action as ChatAction;
			if (action.type === ActionType.ChatInputCompleted && action.requestId === inputReq.id) {
				settled = true;
				if (action.response === ChatInputResponseKind.Accept) {
					part.state.set(ElicitationState.Accepted, undefined);
				} else {
					part.state.set(ElicitationState.Rejected, undefined);
				}
				part.hide();
			}
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
	 * Detects terminal content in a tool call and creates a local terminal
	 * instance backed by the agent host connection. Updates the invocation's
	 * `toolSpecificData` to `kind: 'terminal'` and clears
	 * `HiddenAfterComplete` so the terminal UI stays visible.
	 */
	private _reviveTerminalIfNeeded(
		invocation: ChatToolInvocation,
		tc: ToolCallState,
		backendSession: URI,
	): void {
		// content is only present on Running/Completed/PendingResultConfirmation.
		// toolInput is present on all post-streaming states.
		if (tc.status !== ToolCallStatus.Running && tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.PendingResultConfirmation) {
			return;
		}
		const terminalUri = getTerminalContentUri(tc.content);
		if (!terminalUri || !tc.toolInput) {
			return;
		}
		invocation.presentation = undefined;
		const toolInput = tc.toolInput;
		const sessionId = makeAhpTerminalToolSessionId(terminalUri, backendSession);
		const terminalCommandUri = URI.parse(terminalUri);
		const terminalInstance = this._ensureTerminalInstance(terminalUri, backendSession);
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
		if (current?.terminalCommandId) {
			void terminalInstance.catch(error => this._logService.error(`[AgentHost] Failed to revive terminal '${terminalUri}'`, error));
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
	): Promise<void> {
		const parentSessionStr = parentSession.toString();
		const subagentInsertions: { item: Extract<IChatSessionHistoryItem, { type: 'response' }>; index: number; toolCallId: string }[] = [];

		for (const item of history) {
			if (item.type !== 'response') {
				continue;
			}

			for (let i = 0; i < item.parts.length; i++) {
				const part = item.parts[i];
				if (part.kind === 'toolInvocationSerialized' && part.toolSpecificData?.kind === 'subagent') {
					subagentInsertions.push({ item, index: i, toolCallId: part.toolCallId });
				}
			}
		}

		if (subagentInsertions.length === 0) {
			return;
		}

		const childStateByUri = new Map<string, Promise<ISessionWithDefaultChat | undefined>>();
		const getChildState = (childChatUri: string): Promise<ISessionWithDefaultChat | undefined> => {
			let existing = childStateByUri.get(childChatUri);
			if (!existing) {
				existing = this._loadSubagentState(parentSessionStr, childChatUri);
				childStateByUri.set(childChatUri, existing);
			}
			return existing;
		};

		const enrichedInsertions = await Promise.all(subagentInsertions.map(async ({ item, index, toolCallId }) => {
			const childChatUri = buildSubagentChatUri(parentSessionStr, toolCallId);
			try {
				const childState = await getChildState(childChatUri);
				if (childState) {
					// Surface this subagent's accumulated cost (AIC) and model on
					// its tool's hover after a reload by writing them onto the
					// serialized subagent tool call.
					this._applySubagentUsageToHistoryPart(item.parts[index], sessionResource, childState);
				}
				return { item, index, innerParts: childState ? this._getSubagentInnerParts(childChatUri, toolCallId, childState) : [] };
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

	private async _loadSubagentState(parentSessionUri: string, childChatUri: string): Promise<ISessionWithDefaultChat | undefined> {
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
			return this._getSessionState(parentSessionUri, childChatUri);
		} finally {
			this._releaseChatSessionSubscriptions(parentSessionUri, childChatUri);
		}
	}

	/**
	 * Writes a subagent's accumulated cost (AIC) and model — summed across its
	 * child session's turns — onto its serialized subagent tool call so the
	 * hover survives a reload. Mirrors the live observers in
	 * {@link _setupServerToolCall}.
	 */
	private _applySubagentUsageToHistoryPart(part: IChatProgress, sessionResource: URI, childState: ISessionWithDefaultChat): void {
		if (part.kind !== 'toolInvocationSerialized' || part.toolSpecificData?.kind !== 'subagent') {
			return;
		}
		let credits = 0;
		let modelName: string | undefined;
		for (const turn of childState.turns) {
			const turnCredits = usageInfoToChatUsage(turn.usage)?.copilotCredits;
			if (typeof turnCredits === 'number') {
				credits += turnCredits;
			}
			const turnModelId = this._toLanguageModelId(sessionResource, turn.usage?.model);
			const turnModelName = turnModelId ? this._languageModelsService.lookupLanguageModel(turnModelId)?.name : undefined;
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
	}

	private _getSubagentInnerParts(childSessionUri: string, toolCallId: string, childState: ISessionWithDefaultChat): IChatProgress[] {
		const innerParts: IChatProgress[] = [];
		for (const turn of childState.turns) {
			for (const rp of turn.responseParts) {
				if (rp.kind === ResponsePartKind.ToolCall) {
					const tc = rp.toolCall;
					if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
						const completedTc = tc as ICompletedToolCall;
						const fileEditParts = completedToolCallToEditParts(completedTc, this._config.connectionAuthority);
						const serialized = completedToolCallToSerialized(completedTc, toolCallId, URI.parse(childSessionUri), this._config.connectionAuthority);
						if (fileEditParts.length > 0) {
							serialized.presentation = ToolInvocationPresentation.Hidden;
						}
						innerParts.push(serialized);
						innerParts.push(...fileEditParts);
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
				if (parentInvocation.toolSpecificData?.kind === 'subagent' && parentInvocation.toolSpecificData.isActive !== isActive) {
					parentInvocation.toolSpecificData.isActive = isActive;
					parentInvocation.notifyToolSpecificDataChanged();
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
			subagentContext.observedToolIds.delete(parentToolCallId);
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

		// Extract live ChatToolInvocation objects from the initial progress
		// array so per-tool setup adopts the same instances the chat UI holds.
		const adoptInvocations = new Map<string, ChatToolInvocation>();
		for (const item of initialProgress) {
			if (item instanceof ChatToolInvocation) {
				adoptInvocations.set(item.toolCallId, item);
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
			adoptInvocations,
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
	 * Returns the `terminalToolSessionId` to use for the tool invocation.
	 */
	private async _ensureTerminalInstance(terminalUri: string, backendSession: URI): Promise<string> {
		const terminalToolSessionId = makeAhpTerminalToolSessionId(terminalUri, backendSession);
		const parsedUri = URI.parse(terminalUri);
		await this._agentHostTerminalService.reviveTerminal(
			this._config.connection,
			parsedUri,
			terminalToolSessionId
		);

		return terminalToolSessionId;
	}

	/** Maps a UI session resource to a backend provider URI. */
	private _resolveSessionUri(sessionResource: URI): URI {
		const rawId = sessionResource.path.substring(1);
		return AgentSession.uri(this._config.provider, rawId);
	}

	private _isNewSessionResource(sessionResource: URI): boolean {
		return !!this._config.isNewSession?.(sessionResource)
			|| this._workingDirectoryResolver.isNewSession(sessionResource);
	}

	/**
	 * Forks a session at the given request point by creating a new backend
	 * session with the `fork` parameter. Returns an {@link IChatSessionItem}
	 * pointing to the newly created session.
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

		// Determine the turn index to fork at. If a specific request is
		// provided, fork BEFORE it (keeping turns up to the previous one).
		// This matches the non-contributed path in ForkConversationAction
		// which uses `requestIndex - 1`. If no request is provided, fork
		// the entire session.
		const protocolState = this._getSessionState(backendSession.toString());
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

		const forkedSession = await this._createAndSubscribe(sessionResource, lastTurnModelSelection(protocolState), {
			session: backendSession,
			turnIndex,
			turnId,
		});

		const forkedRawId = AgentSession.id(forkedSession);
		const forkedResource = URI.from({ scheme: this._config.sessionType, path: `/${forkedRawId}` });
		const now = Date.now();

		const forkedTitle = this._getSessionState(forkedSession.toString())?.title;
		const forkedLabel = forkedTitle || chatModel?.title || localize('agentHost.forkedSessionLabel', "Forked Session");

		return {
			resource: forkedResource,
			label: forkedLabel,
			iconPath: getAgentSessionProviderIcon(this._config.sessionType),
			timing: { created: now, lastRequestStarted: now, lastRequestEnded: now },
		};
	}

	/** Creates a new backend session and subscribes to its state. */
	private async _createAndSubscribe(sessionResource: URI, model: ModelSelection | undefined, fork?: { session: URI; turnIndex: number; turnId: string }, config?: Record<string, unknown>, importConversation?: { readonly turns: readonly Turn[]; readonly model?: ModelSelection }): Promise<URI> {
		const workingDirectory = this._resolveRequestedWorkingDirectory(sessionResource);
		const requestedSession = fork ? undefined : this._resolveSessionUri(sessionResource);

		this._logService.trace(`[AgentHost] Creating new session, model=${model?.id ?? '(default)'}, provider=${this._config.provider}${fork ? `, fork from ${fork.session.toString()} at index ${fork.turnIndex}` : ''}`);

		// Eagerly authenticate before creating the session if the agent
		// declares required protected resources. This avoids a wasted
		// round-trip where createSession fails with AuthRequired.
		const agentInfo = this._getRootState()?.agents.find(a => a.provider === this._config.provider);
		const protectedResources = agentInfo?.protectedResources ?? [];
		const hasRequiredAuth = protectedResources.some(r => r.required !== false);
		if (hasRequiredAuth && this._config.resolveAuthentication) {
			const authenticated = await this._config.resolveAuthentication(protectedResources);
			if (!authenticated) {
				throw new Error(localize('agentHost.authRequired', "Authentication is required to start a session. Please sign in and try again."));
			}
		}

		const activeClient = this._getCurrentActiveClient();

		// Opt in to bring-up progress (chiefly the lazy first-use SDK download)
		// so the editor window surfaces the same download notification the
		// Agents window does. The host echoes the download's own identity on
		// each frame; this token only records interest.
		const progressToken = generateUuid();

		let session: URI;
		try {
			session = await this._config.connection.createSession({
				session: requestedSession,
				model,
				provider: this._config.provider,
				workingDirectory,
				fork,
				config,
				importConversation,
				activeClient,
				progressToken,
			});
		} catch (err) {
			// If authentication is required (e.g. token expired), try interactive auth and retry once
			if (this._isAuthRequiredError(err) && this._config.resolveAuthentication) {
				this._logService.info('[AgentHost] Authentication required, prompting user...');
				const authenticated = await this._config.resolveAuthentication(protectedResources);
				if (authenticated) {
					session = await this._config.connection.createSession({
						session: requestedSession,
						model,
						provider: this._config.provider,
						workingDirectory,
						fork,
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

		if (requestedSession && !isEqual(session, requestedSession)) {
			throw new Error(`Agent host returned unexpected session URI. Expected ${requestedSession.toString()}, got ${session.toString()}`);
		}

		this._logService.trace(`[AgentHost] Created session: ${session.toString()}`);

		// Subscribe to the new session's state
		const newSub = this._ensureSessionSubscription(session.toString());
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
		this._ensureChatSubscription(session.toString(), chatURI);

		// Start syncing the chat model's pending requests to the protocol
		this._ensurePendingMessageSubscription(sessionResource, session);

		// Start watching for server-initiated turns on this session
		this._watchForServerInitiatedTurns(session, sessionResource);

		return session;
	}

	/**
	 * Ensures that the chat model's pending request changes are synced to the
	 * protocol for a given session. No-ops if already subscribed.
	 */
	private _ensurePendingMessageSubscription(sessionResource: URI, backendSession: URI): void {
		if (this._pendingMessageSubscriptions.has(sessionResource)) {
			return;
		}
		const chatModel = this._chatService?.getSession(sessionResource);
		if (chatModel) {
			this._pendingMessageSubscriptions.set(sessionResource, chatModel.onDidChangePendingRequests(() => {
				this._syncPendingMessages(sessionResource, backendSession);
			}));
			this._syncPendingMessages(sessionResource, backendSession);
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
		let lastDraft = this._getSessionState(backendSession.toString(), chatKey)?.draft;
		store.add(autorun(reader => {
			const state = inputModel.state.read(reader);
			delayer.trigger(() => {
				const draft = this._inputStateToDraft(sessionResource, state);
				if (equals(lastDraft, draft)) {
					return;
				}
				lastDraft = draft;

				this._config.connection.dispatch(chatKey, {
					type: ActionType.ChatDraftChanged,
					draft,
				});
			}).catch(() => { /* delayer disposed */ });
		}));
	}

	private _inputStateToDraft(sessionResource: URI, state: IChatModelInputState | undefined): Message | undefined {
		if (!state) {
			return undefined;
		}
		const model = this._createModelSelection(state.selectedModel?.identifier, state.modelConfiguration);
		const agentUri = state.mode.kind === ChatModeKind.Agent && state.mode.id !== ChatMode.Agent.id ? state.mode.id : undefined;
		const attachments = this._variableEntriesToAttachments(state.attachments, sessionResource, state.inputText);
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
		const variableData = messageAttachmentsToVariableData(draft.attachments, this._config.connectionAuthority);
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
		// Try the raw billed id, its dots-normalised form (slug mismatch: `claude-sonnet-4-6` → `.6`),
		// then the fallback (picked) id. Only the last path sets resolvedFromRaw=false so the caller
		// can surface billedModelId (e.g. "Auto (raptor-mini)") when the billed model is unregistered.
		const lookupModel = (rawModelId: string | undefined): { model: ILanguageModelChatMetadata; resolvedFromRaw: boolean } | undefined => {
			const normalizedRaw = rawModelId?.replace(/-(\d+)$/, '.$1');
			for (const candidate of [rawModelId, normalizedRaw !== rawModelId ? normalizedRaw : undefined]) {
				const modelId = this._toLanguageModelId(sessionResource, candidate);
				if (!modelId) { continue; }
				const model = this._languageModelsService.lookupLanguageModel(modelId);
				if (model) { return { model, resolvedFromRaw: true }; }
			}
			const fallbackModelId = this._toLanguageModelId(sessionResource, fallbackRawModelId);
			if (fallbackModelId) {
				const model = this._languageModelsService.lookupLanguageModel(fallbackModelId);
				if (model) { return { model, resolvedFromRaw: false }; }
			}
			return undefined;
		};
		return {
			toLanguageModelId: (rawModelId) => this._toLanguageModelId(sessionResource, resolveRaw(rawModelId)),
			toResponseDetails: (rawModelId, usage) => {
				const resolved = lookupModel(rawModelId);
				// resolvedFromRaw=false means we fell back to the picked model; surface billedModelId so
				// e.g. an "Auto" pick reads "Auto (raptor-mini)".
				const billedModelId = resolved && !resolved.resolvedFromRaw ? rawModelId : undefined;
				return formatTurnResponseDetails(resolved?.model, billedModelId, usage);
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
			?? this._newSessionFolderService.getFolder(sessionResource)
			?? this._workingDirectoryResolver.resolve(sessionResource)
			?? this._newSessionFolderService.getDefaultFolder()
			?? this._workspaceContextService.getWorkspace().folders[0]?.uri;
	}

	/**
	 * Ensures the workspace/folder the agent will run in is trusted before a
	 * session is spawned. Returns `false` if the user declines.
	 *
	 * When the agent runs inside the currently open workspace (editor window),
	 * gate on workspace trust to match how extension-host chat is gated. When
	 * it targets a standalone folder outside the open workspace (Agents window
	 * per-session folders), gate on that folder's trust instead. Both request
	 * helpers resolve immediately when the target is already trusted, so this
	 * never double-prompts.
	 */
	private async _ensureWorkspaceTrust(sessionResource: URI): Promise<boolean> {
		const message = localize('agentHost.workspaceTrust', "AI features are currently only supported in trusted workspaces.");
		const workingDirectory = this._resolveRequestedWorkingDirectory(sessionResource);

		if (!workingDirectory || this._workspaceContextService.getWorkspaceFolder(workingDirectory)) {
			return !!await this._workspaceTrustRequestService.requestWorkspaceTrust({ message });
		}

		return !!await this._workspaceTrustRequestService.requestResourcesTrust({ uri: workingDirectory, message });
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

	private _variableEntriesToAttachments(variables: readonly IChatRequestVariableEntry[], sessionResource: URI, messageText?: string): MessageAttachment[] {
		const attachments: MessageAttachment[] = [];
		for (const v of variables) {
			const attachment = this._convertVariableToAttachment(v, sessionResource, messageText);
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

	private _convertVariableToAttachment(v: IChatRequestVariableEntry, sessionResource: URI, messageText?: string): MessageAttachment | MessageAttachment[] | undefined {
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
		// Pasted code, prompt text, workspace context, and free-form string entries: surface their
		// textual representation as an opaque attachment.
		if (v.kind === 'paste') {
			return this._toSimpleAttachment(v.name, v.code, v._meta, undefined, referenceRange);
		}
		if (v.kind === 'promptText') {
			return this._toSimpleAttachment(v.name, v.value, v._meta, undefined, referenceRange);
		}
		if (v.kind === 'workspace') {
			return this._toSimpleAttachment(v.name, v.value, v._meta, 'workspace', referenceRange);
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
		const requestedDir = this._resolveRequestedWorkingDirectory(sessionResource);
		if (!requestedDir || requestedDir.scheme !== 'file') {
			return uri;
		}
		const backendSession = this._resolveSessionUri(sessionResource);
		const rawResolvedDir = this._getSessionState(backendSession.toString())?.workingDirectory;
		const resolvedDir = typeof rawResolvedDir === 'string' ? URI.parse(rawResolvedDir) : rawResolvedDir;
		if (!resolvedDir || resolvedDir.scheme !== 'file') {
			return uri;
		}
		if (extUriBiasedIgnorePathCase.isEqual(requestedDir, resolvedDir)) {
			return uri;
		}
		if (!extUriBiasedIgnorePathCase.isEqualOrParent(uri, requestedDir)) {
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
			ref = undefined;
		}
		if (!ref) {
			ref = this._config.connection.getSubscription(StateComponents.Session, URI.parse(sessionUri), 'AgentHostSessionHandler');
			this._sessionSubscriptions.set(sessionUri, ref);
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
	pastTenseMessage: string;
	content?: ({ type: ToolResultContentType.Text; text: string } | { type: ToolResultContentType.EmbeddedResource; data: string; contentType: string })[];
	error?: { message: string };
} {
	const isError = !!result.toolResultError;
	const pastTense = typeof result.toolResultMessage === 'string'
		? result.toolResultMessage
		: result.toolResultMessage?.value
		?? (isError ? `${toolName} failed` : `Ran ${toolName}`);

	const content: ({ type: ToolResultContentType.Text; text: string } | { type: ToolResultContentType.EmbeddedResource; data: string; contentType: string })[] = [];
	for (const part of result.content) {
		if (part.kind === 'text') {
			content.push({ type: ToolResultContentType.Text, text: part.value });
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
