/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { InstantiationType, registerSingleton } from '../../../../../platform/instantiation/common/extensions.js';
import { IAgentSessionsService } from '../agentSessions/agentSessionsService.js';
import { AgentSessionStatus, getAgentChangesSummary } from '../agentSessions/agentSessionsModel.js';
import { IChatPlanReviewResult, IChatQuestionAnswers, IChatQuestionCarousel, IChatSendRequestOptions, IChatService, IChatToolInvocation, ToolConfirmKind } from '../../common/chatService/chatService.js';
import { IBackendQuestionAnswer, resolveQuestionAnswers } from '../../common/voiceClient/voiceQuestionAnswers.js';
import { ChatQuestionCarouselData } from '../../common/model/chatProgressTypes/chatQuestionCarouselData.js';
import { ChatPlanReviewData } from '../../common/model/chatProgressTypes/chatPlanReviewData.js';
import { IChatModel } from '../../common/model/chatModel.js';
import { ILanguageModelChatMetadataAndIdentifier } from '../../common/languageModels.js';
import { ChatAgentLocation, ChatModeKind } from '../../common/constants.js';
import { ILanguageModelToolsService } from '../../common/tools/languageModelToolsService.js';
import { IVoiceDispatchResult, IVoiceModelReference, IVoiceToolCall, markPendingIdResolved, peekPendingId } from '../../common/voiceClient/voiceClientService.js';
import { getVoiceConfirmationType } from '../../common/voiceClient/voiceConfirmation.js';
import { CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isExplicitFileOrImageVariableEntry } from '../../common/attachments/chatVariableEntries.js';
import { toAgentHostBackendSessionUri } from '../agentSessions/agentHost/agentHostSessionUri.js';

/**
 * Callbacks that require access to the chat widget or view state.
 * Implemented by the ChatViewPane to bridge UI concerns.
 */
export interface IVoiceToolDispatchDelegate {
	/** Accept input text in the current chat widget. Returns false if no widget available. */
	acceptInput(text: string): boolean;
	/** Get the resource URI of the currently active session. */
	getCurrentSessionResource(): Promise<URI | undefined>;
	/** Switch the view to a different session by resource URI. */
	switchToSession(resource: URI): Promise<boolean>;
	/** Set the session all subsequent voice turns and actions belong to. */
	setTargetSession(resource: URI): void;
	/** The explicit voice target, or the currently shown session when unpinned. */
	getTargetSessionResource(): URI | undefined;
	/** Select a model in the currently shown voice input. */
	selectModel(requestedModel: string): Promise<IVoiceModelSelectionResult>;
	/** Get the set of auto-approved session resource strings. */
	getAutoApprovedSessions(): Set<string>;
	/** Mark all current sessions as auto-approved. */
	addAllAutoApprovedSessions(): void;
	/** Remove a session from auto-approved set. */
	removeAutoApprovedSession(resource: string): void;
	/** Trigger an auto-approve check cycle. */
	triggerAutoApproveCheck(): void;
}

export interface IVoiceModelSelectionResult {
	readonly ok: boolean;
	readonly reason?: 'no_input' | 'model_not_found' | 'ambiguous_model' | 'selection_failed';
	readonly selected_model?: IVoiceModelReference;
	readonly available_models?: readonly IVoiceModelReference[];
}

function voiceModelReference(model: ILanguageModelChatMetadataAndIdentifier): IVoiceModelReference {
	return {
		identifier: model.identifier,
		name: model.metadata.name,
		vendor: model.metadata.vendor,
	};
}

function normalizeModelName(value: string): string {
	return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Resolve only exact identifiers or unique normalized names; never guess among similar models. */
export function resolveVoiceModel(models: readonly ILanguageModelChatMetadataAndIdentifier[], requestedModel: string): IVoiceModelSelectionResult & { readonly identifier?: string } {
	const exactIdentifier = models.find(model => model.identifier === requestedModel);
	if (exactIdentifier) {
		return { ok: true, identifier: exactIdentifier.identifier, selected_model: voiceModelReference(exactIdentifier) };
	}

	const normalized = normalizeModelName(requestedModel);
	const exactMatches = models.filter(model => [
		model.metadata.name,
		model.metadata.id,
		model.metadata.family,
		`${model.metadata.name} ${model.metadata.vendor}`,
	].some(candidate => normalizeModelName(candidate) === normalized));
	if (exactMatches.length === 1) {
		return { ok: true, identifier: exactMatches[0].identifier, selected_model: voiceModelReference(exactMatches[0]) };
	}
	if (exactMatches.length > 1) {
		return { ok: false, reason: 'ambiguous_model', available_models: exactMatches.map(voiceModelReference) };
	}

	const related = normalized ? models.filter(model => [model.metadata.name, model.metadata.id, model.metadata.family]
		.some(candidate => normalizeModelName(candidate).includes(normalized) || normalized.includes(normalizeModelName(candidate)))) : [];
	return {
		ok: false,
		reason: related.length > 1 ? 'ambiguous_model' : 'model_not_found',
		available_models: (related.length > 0 ? related : models).slice(0, 10).map(voiceModelReference),
	};
}

export interface IVoiceToolDispatchService {
	readonly _serviceBrand: undefined;

	/**
	 * Set the delegate that bridges widget/UI concerns.
	 * Must be called before dispatching tool calls.
	 */
	setDelegate(delegate: IVoiceToolDispatchDelegate): void;

	/**
	 * Dispatch a tool call and return the result string.
	 */
	dispatchToolCall(toolCall: IVoiceToolCall): Promise<string>;

	/**
	 * Apply a backend-resolved response to whatever a session is waiting on.
	 *
	 * Separate from `dispatchToolCall` because it answers with a structured
	 * outcome rather than a string: the backend only speaks an acknowledgement
	 * for something it has actually observed, so "it landed" and "it didn't"
	 * have to be distinguishable.
	 */
	respondToSession(toolCall: IVoiceToolCall): Promise<IVoiceDispatchResult>;
}

export const IVoiceToolDispatchService = createDecorator<IVoiceToolDispatchService>('voiceToolDispatchService');

/** Action labels displayed in the status bar during tool execution. */
const ACTION_LABELS: Record<string, string> = {
	send_to_chat: localize('agentsVoice.action.sendToChat', "Sending to chat..."),
	get_session_info: localize('agentsVoice.action.getSessionInfo', "Checking sessions..."),
	get_session_changes: localize('agentsVoice.action.getSessionChanges', "Checking changes..."),
	get_session_thread: localize('agentsVoice.action.getSessionThread', "Checking conversation..."),
	respond_to_session: localize('agentsVoice.action.respond', "Responding..."),
	focus_session: localize('agentsVoice.action.focusSession', "Focusing session..."),
	set_model: localize('agentsVoice.action.setModel', "Changing model..."),
	auto_approve_session: localize('agentsVoice.action.autoApprove', "Auto-approving session..."),
	revoke_auto_approve: localize('agentsVoice.action.revokeAutoApprove', "Revoking auto-approve..."),
};

export class VoiceToolDispatchService implements IVoiceToolDispatchService {

	declare readonly _serviceBrand: undefined;

	private _delegate: IVoiceToolDispatchDelegate | undefined;

	constructor(
		@IAgentSessionsService private readonly agentSessionsService: IAgentSessionsService,
		@IChatService private readonly chatService: IChatService,
		@ILanguageModelToolsService private readonly toolsService: ILanguageModelToolsService,
	) { }

	setDelegate(delegate: IVoiceToolDispatchDelegate): void {
		this._delegate = delegate;
	}

	/** Get the action label for a tool call name. */
	static getActionLabel(name: string): string {
		return ACTION_LABELS[name] ?? localize('agentsVoice.action.working', "Working...");
	}

	private get _agentModeOptions(): IChatSendRequestOptions {
		const allTools: Record<string, boolean> = {};
		for (const tool of this.toolsService.getTools(undefined)) {
			allTools[tool.id] = true;
		}
		return {
			modeInfo: {
				kind: ChatModeKind.Agent,
				isBuiltin: true,
				modeInstructions: undefined,
				telemetryModeId: 'agent',
				applyCodeBlockSuggestionId: undefined,
			},
			instructionContext: {
				modeKind: ChatModeKind.Agent,
				enabledTools: allTools,
			},
			userSelectedTools: constObservable(allTools),
		};
	}

	async dispatchToolCall(toolCall: IVoiceToolCall): Promise<string> {
		const delegate = this._delegate;
		if (!delegate) {
			return 'error: no delegate set';
		}

		const args = toolCall.args;
		const argString = (k: string): string => {
			const v = args[k];
			return typeof v === 'string' ? v : '';
		};

		switch (toolCall.name) {
			case 'send_to_chat': {
				const text = argString('text');
				if (text) {
					if (!delegate.acceptInput(text)) {
						const resource = await delegate.getCurrentSessionResource();
						if (resource) {
							await this.chatService.sendRequest(resource, text, this._agentModeOptions);
						} else {
							const ref = this.chatService.startNewLocalSession(ChatAgentLocation.Chat);
							await this.chatService.sendRequest(ref.object.sessionResource, text, this._agentModeOptions);
							ref.dispose();
						}
					}
				}
				break;
			}
			case 'focus_session': {
				const targetSessionId = argString('coding_session_id');
				const targetResource = this._findSessionResource(targetSessionId);
				if (targetResource) {
					const currentResource = await delegate.getCurrentSessionResource();
					const switched = targetResource.toString() === currentResource?.toString()
						|| await delegate.switchToSession(targetResource);
					if (switched) {
						delegate.setTargetSession(targetResource);
						return JSON.stringify({ ok: true, session_id: targetResource.toString() });
					}
				}
				return JSON.stringify({ ok: false, reason: targetResource ? 'switch_failed' : 'session_not_found' });
			}
			case 'set_model': {
				const requestedModel = argString('model_id') || argString('model');
				if (!requestedModel) {
					return JSON.stringify({ ok: false, reason: 'model_not_found' });
				}
				const target = await this._showActionTarget(argString('coding_session_id'));
				if (!target.ok) {
					return JSON.stringify(target);
				}
				return JSON.stringify(await delegate.selectModel(requestedModel));
			}
			case 'auto_approve_session': {
				delegate.addAllAutoApprovedSessions();
				break;
			}
			case 'revoke_auto_approve': {
				const sessionResource = await delegate.getCurrentSessionResource();
				if (sessionResource) {
					delegate.removeAutoApprovedSession(sessionResource.toString());
				}
				break;
			}
			case 'get_session_info': {
				return await this._gatherSessionInfo();
			}
			case 'get_session_changes': {
				const sessionId = typeof toolCall.args?.coding_session_id === 'string'
					? toolCall.args.coding_session_id
					: undefined;
				return await this._gatherSessionChanges(sessionId);
			}
			case 'get_session_thread': {
				const sessionId = typeof toolCall.args?.coding_session_id === 'string'
					? toolCall.args.coding_session_id
					: undefined;
				const rawN = toolCall.args?.last_n_turns;
				const lastN = typeof rawN === 'number' && rawN > 0 ? Math.min(10, Math.floor(rawN)) : 3;
				return await this._gatherSessionThread(sessionId, lastN);
			}
		}
		return 'ok';
	}

	private _findSessionResource(sessionId: string): URI | undefined {
		if (!sessionId) {
			return undefined;
		}
		const agentSession = this.agentSessionsService.model.sessions
			.find(session => !session.isArchived() && session.resource.toString() === sessionId);
		if (agentSession) {
			return agentSession.resource;
		}
		for (const model of this.chatService.chatModels.get()) {
			if (model.sessionResource.toString() === sessionId) {
				return model.sessionResource;
			}
		}
		return undefined;
	}

	private async _showActionTarget(sessionId: string): Promise<{ ok: true; resource: URI } | { ok: false; reason: 'no_session' | 'session_not_found' | 'switch_failed' }> {
		const delegate = this._delegate;
		if (!delegate) {
			return { ok: false, reason: 'no_session' };
		}
		const resource = sessionId
			? this._findSessionResource(sessionId)
			: delegate.getTargetSessionResource() ?? await delegate.getCurrentSessionResource();
		if (!resource) {
			return { ok: false, reason: sessionId ? 'session_not_found' : 'no_session' };
		}
		const current = await delegate.getCurrentSessionResource();
		if (current?.toString() !== resource.toString() && !await delegate.switchToSession(resource)) {
			return { ok: false, reason: 'switch_failed' };
		}
		if (sessionId) {
			delegate.setTargetSession(resource);
		}
		return { ok: true, resource };
	}

	/**
	 * Apply a backend-resolved response to the exact pending part it names.
	 *
	 * Routing is by `pending_id` + `request_id` with no fallback: the path this
	 * replaces fell back to the focused session, so a spoken "yes" could approve
	 * a prompt the user was not looking at. A response that cannot find its part
	 * is reported as stale instead. Answer values are matched exactly; see
	 * `resolveQuestionAnswers`.
	 */
	async respondToSession(toolCall: IVoiceToolCall): Promise<IVoiceDispatchResult> {
		const args = toolCall.args;
		const argString = (key: string): string => {
			const value = args[key];
			return typeof value === 'string' ? value : '';
		};
		const response = args['response'];
		if (!response || typeof response !== 'object' || Array.isArray(response)) {
			return { ok: false, reason: 'unsupported' };
		}
		const responseType = (response as Record<string, unknown>)['type'];
		if (responseType !== 'approve' && responseType !== 'reject' && responseType !== 'answer' && responseType !== 'skip') {
			return { ok: false, reason: 'unsupported' };
		}

		const resolved = await this._resolveModelForResponse(argString('coding_session_id'));
		if (!resolved) {
			return { ok: false, reason: 'no_session' };
		}
		// A freshly loaded session holds its only reference here, so everything
		// that reads the model, including the awaited confirmation send, has to
		// happen before it is released.
		try {
			return await this._applyResponse(
				resolved.model,
				argString('request_id'),
				argString('pending_id'),
				responseType,
				response as Record<string, unknown>,
			);
		} finally {
			resolved.dispose();
		}
	}

	private async _applyResponse(
		model: IChatModel,
		requestId: string,
		pendingId: string,
		responseType: 'approve' | 'reject' | 'answer' | 'skip',
		response: Record<string, unknown>,
	): Promise<IVoiceDispatchResult> {
		const request = model.getRequests().find(candidate => candidate.id === requestId);
		const parts = request?.response?.response.value;
		if (!request || !parts) {
			return { ok: false, reason: 'stale_pending' };
		}
		const index = parts.findIndex(candidate => peekPendingId(request.id, candidate) === pendingId);
		if (index < 0) {
			return { ok: false, reason: 'stale_pending' };
		}
		const part = parts[index];

		if (part.kind === 'questionCarousel') {
			if (responseType !== 'answer' && responseType !== 'skip') {
				return { ok: false, reason: 'unsupported' };
			}
			return this._answerCarousel(request.id, part as IChatQuestionCarousel, response, responseType === 'skip');
		}

		if (responseType === 'answer' || responseType === 'skip') {
			return { ok: false, reason: 'unsupported' };
		}
		const approve = responseType === 'approve';

		if (part.kind === 'planReview' && part instanceof ChatPlanReviewData) {
			return this._resolvePlanReview(part, approve) ? { ok: true } : { ok: false, reason: 'stale_pending' };
		}

		if (part.kind === 'toolInvocation') {
			if (getVoiceConfirmationType([part]) !== 'tool') {
				return { ok: false, reason: 'unsupported' };
			}
			// A provider may keep multiple rehydrated copies pending while it sends
			// this response. Retire the shared occurrence before invoking the callback
			// so none of those copies can submit the same approval a second time.
			markPendingIdResolved(pendingId);
			const confirmed = IChatToolInvocation.confirmWith(
				part as IChatToolInvocation,
				approve ? { type: ToolConfirmKind.UserAction } : { type: ToolConfirmKind.Denied },
			);
			return confirmed ? { ok: true } : { ok: false, reason: 'stale_pending' };
		}

		return { ok: false, reason: 'unsupported' };
	}

	private _resolvePlanReview(plan: ChatPlanReviewData, approve: boolean): boolean {
		if (plan.isUsed) {
			return false;
		}
		let result: IChatPlanReviewResult;
		if (approve) {
			const action = plan.actions.find(candidate => candidate.default) ?? plan.actions[0];
			if (!action) {
				return false;
			}
			result = {
				action: action.label,
				actionId: action.id,
				rejected: false,
			};
		} else {
			result = { rejected: true };
		}
		plan.data = result;
		plan.isUsed = true;
		void plan.completion.complete(result);
		return true;
	}

	/** Resolve a coding session id to its chat model, never falling back to the focused session. */
	private async _resolveModelForResponse(codingSessionId: string): Promise<{ model: IChatModel; dispose(): void } | undefined> {
		if (!codingSessionId) {
			return undefined;
		}
		const agentSession = this.agentSessionsService.model.sessions
			.find(session => !session.isArchived() && session.resource.toString() === codingSessionId);
		if (agentSession) {
			const loaded = this.chatService.getSession(agentSession.resource);
			if (loaded) {
				return { model: loaded, dispose: () => { } };
			}
		}
		for (const chatModel of this.chatService.chatModels.get()) {
			if (chatModel.sessionResource.toString() === codingSessionId) {
				return { model: chatModel, dispose: () => { } };
			}
		}
		if (!agentSession) {
			return undefined;
		}
		const cts = new CancellationTokenSource();
		const ref = await this.chatService
			.acquireOrLoadSession(agentSession.resource, ChatAgentLocation.Chat, cts.token, 'voice-respond')
			.catch(() => undefined);
		cts.dispose();
		if (!ref) {
			return undefined;
		}
		const model = this.chatService.getSession(agentSession.resource);
		if (!model) {
			ref.dispose();
			return undefined;
		}
		// This reference is the only thing keeping the just-loaded session alive;
		// releasing it here would let the model be disposed out from under the
		// caller, potentially mid-`sendRequest`.
		return { model, dispose: () => ref.dispose() };
	}

	/**
	 * Fill in a question carousel exactly as the widget's own submit path does.
	 *
	 * A `skip` carries whatever the user answered before saying "skip", which on
	 * an untouched form is nothing at all. That empty case is why skipping is its
	 * own response type: an `answer` with zero answers is indistinguishable from
	 * a backend that resolved nothing, and is correctly refused below.
	 */
	private _answerCarousel(
		requestId: string,
		carousel: IChatQuestionCarousel,
		response: Record<string, unknown>,
		skip: boolean,
	): IVoiceDispatchResult {
		if (carousel.isUsed || carousel.answeredExternally) {
			return { ok: false, reason: 'stale_pending' };
		}
		if (skip && !carousel.allowSkip) {
			return { ok: false, reason: 'stale_pending' };
		}
		const raw = response['answers'];
		// Only an absent `answers` means "none". A present non-array is a
		// malformed call, and coercing it to empty would let a skip succeed while
		// discarding whatever was actually meant.
		if (raw !== undefined && !Array.isArray(raw)) {
			return { ok: false, reason: 'invalid_answer' };
		}
		const rawAnswers = (raw ?? []) as IBackendQuestionAnswer[];
		let answers: IChatQuestionAnswers | undefined;
		if (rawAnswers.length > 0) {
			answers = resolveQuestionAnswers(carousel.questions, rawAnswers);
			if (!answers) {
				return { ok: false, reason: 'invalid_answer' };
			}
		} else if (!skip) {
			return { ok: false, reason: 'invalid_answer' };
		}
		// The widget refuses to submit while a required question is blank, so a
		// spoken answer must not be able to submit what a click cannot. Absence is
		// the only blank possible: `resolveQuestionAnswers` rejects rather than
		// emitting an empty value. The backend only dispatches a fully answered
		// form, so this is a backstop.
		if (!skip && carousel.questions.some(question => question.required && answers?.[question.id] === undefined)) {
			return { ok: false, reason: 'invalid_answer' };
		}
		// Checked before mutating: a form with neither a deferred completion nor
		// an id to notify cannot be resolved, and marking it used would leave it
		// answered on screen while the assistant reports that it did not land.
		if (!(carousel instanceof ChatQuestionCarouselData) && !carousel.resolveId) {
			return { ok: false, reason: 'unsupported' };
		}
		// `dismiss` also completes the deferred promise an agent-hosted carousel
		// is blocked on; marking it used without that leaves the agent waiting.
		if (carousel instanceof ChatQuestionCarouselData) {
			carousel.dismiss(answers);
		} else {
			carousel.data = answers;
			carousel.isUsed = true;
		}
		if (carousel.resolveId) {
			this.chatService.notifyQuestionCarouselAnswer(requestId, carousel.resolveId, answers);
		}
		return { ok: true };
	}


	private async _gatherSessionInfo(): Promise<string> {
		const agentSessions = this.agentSessionsService.model.sessions.filter(session => !session.isArchived());
		const currentResource = await this._delegate?.getCurrentSessionResource();
		const activeResource = this._delegate?.getTargetSessionResource() ?? currentResource;
		const agentResources = new Set(agentSessions.map(session => session.resource.toString()));
		const inputDetails = (model: IChatModel | undefined) => {
			const state = model?.inputModel?.state?.get();
			const selected = state?.selectedModel;
			const attachments = state?.attachments.filter(isExplicitFileOrImageVariableEntry) ?? [];
			return {
				...(selected ? { selected_model: voiceModelReference(selected) } : {}),
				...(attachments.length ? {
					attachment_names: attachments.map(attachment => attachment.name).slice(0, 10),
					attachment_count: attachments.length,
				} : {}),
			};
		};
		const lastResponseSummary = (model: IChatModel | undefined): string | undefined => {
			const summary = model?.getRequests().at(-1)?.response?.response.value
				.filter(part => part.kind === 'markdownContent')
				.map(part => (part as { content: { value: string } }).content.value)
				.join(' ')
				.slice(0, 500);
			return summary || undefined;
		};

		const sessionData: Array<Record<string, unknown> & { state: string; is_active: boolean; last_activity: number }> = agentSessions.map(session => {
			const model = this.chatService.getSession(session.resource);
			const changes = getAgentChangesSummary(session.changes);
			const state = session.status === AgentSessionStatus.InProgress ? 'working'
				: session.status === AgentSessionStatus.NeedsInput ? 'waiting_for_input'
					: session.status === AgentSessionStatus.Completed ? 'idle'
						: 'unknown';
			const lastActivity = session.timing.lastRequestEnded ?? session.timing.lastRequestStarted ?? session.timing.created ?? 0;
			return {
				id: (toAgentHostBackendSessionUri(session.resource) ?? session.resource).toString(),
				label: session.label || undefined,
				session_type: 'agent' as const,
				state,
				is_active: activeResource?.toString() === session.resource.toString(),
				insertions: changes?.insertions ?? 0,
				deletions: changes?.deletions ?? 0,
				last_activity: lastActivity,
				last_activity_minutes_ago: lastActivity ? Math.max(0, Math.round((Date.now() - lastActivity) / 60000)) : undefined,
				last_response_summary: lastResponseSummary(model),
				...inputDetails(model),
			};
		});

		for (const model of this.chatService.chatModels.get()) {
			const sessionId = model.sessionResource.toString();
			const isActive = activeResource?.toString() === sessionId;
			if (agentResources.has(sessionId) || (model.getRequests().length === 0 && !isActive)) {
				continue;
			}
			const needsInput = model.requestNeedsInput?.get();
			const inProgress = model.hasActiveRequest?.get();
			const lastActivity = model.lastMessageDate || 0;
			sessionData.push({
				id: (toAgentHostBackendSessionUri(model.sessionResource) ?? model.sessionResource).toString(),
				label: model.title || undefined,
				session_type: 'chat',
				state: needsInput ? 'waiting_for_input' : inProgress ? 'working' : 'idle',
				is_active: isActive,
				insertions: 0,
				deletions: 0,
				last_activity: lastActivity,
				last_activity_minutes_ago: lastActivity ? Math.max(0, Math.round((Date.now() - lastActivity) / 60000)) : undefined,
				last_response_summary: lastResponseSummary(model),
				...inputDetails(model),
			});
		}

		sessionData.sort((a, b) => Number(b.is_active) - Number(a.is_active) || b.last_activity - a.last_activity);
		const counts = sessionData.reduce((result, session) => {
			if (session.state === 'working') { result.working++; }
			else if (session.state === 'waiting_for_input') { result.waiting_for_input++; }
			else if (session.state === 'idle') { result.idle++; }
			return result;
		}, { working: 0, waiting_for_input: 0, idle: 0 });
		const visibleSessions = sessionData.slice(0, 20).map(({ last_activity, ...session }) => session);
		return JSON.stringify({
			total_sessions: sessionData.length,
			counts,
			sessions: visibleSessions,
			truncated: visibleSessions.length < sessionData.length,
		});
	}

	/**
	 * Resolve a coding_session_id (resource URI string) to an IAgentSession.
	 * Falls back to the currently active session when id is missing/unknown.
	 */
	private async _resolveSession(coding_session_id: string | undefined) {
		const sessions = this.agentSessionsService.model.sessions.filter(s => !s.isArchived());
		if (coding_session_id) {
			const match = sessions.find(s => s.resource.toString() === coding_session_id);
			if (match) {
				return match;
			}
		}
		const currentResource = await this._delegate?.getCurrentSessionResource();
		if (currentResource) {
			const active = sessions.find(s => s.resource.toString() === currentResource.toString());
			if (active) {
				return active;
			}
		}
		return sessions[0];
	}

	/**
	 * Gather files touched + per-file insertions/deletions for a session.
	 * Returns a JSON string keyed for the LLM follow-up to summarize.
	 */
	private async _gatherSessionChanges(coding_session_id: string | undefined): Promise<string> {
		const session = await this._resolveSession(coding_session_id);
		if (!session) {
			return JSON.stringify({ session_id: coding_session_id ?? null, files: [], note: 'session_not_found' });
		}

		const changes = session.changes;
		const files: { path: string; insertions: number; deletions: number }[] = [];
		let totalInsertions = 0;
		let totalDeletions = 0;
		let totalFiles = 0;

		if (Array.isArray(changes)) {
			for (const c of changes) {
				// Both IChatSessionFileChange and IChatSessionFileChange2 carry a URI;
				// prefer modifiedUri (most accurate post-edit), fall back to uri.
				const uri = (c as { modifiedUri?: URI }).modifiedUri ?? (c as { uri?: URI }).uri;
				const path = uri ? this._formatPath(uri) : '(unknown)';
				files.push({ path, insertions: c.insertions, deletions: c.deletions });
				totalInsertions += c.insertions;
				totalDeletions += c.deletions;
			}
			totalFiles = files.length;
		} else if (changes && !Array.isArray(changes)) {
			// Already in summary form — we don't have per-file data.
			const summary = changes as { files: number; insertions: number; deletions: number };
			totalInsertions = summary.insertions;
			totalDeletions = summary.deletions;
			totalFiles = summary.files;
		}

		return JSON.stringify({
			session_id: session.resource.toString(),
			total_files: totalFiles,
			total_insertions: totalInsertions,
			total_deletions: totalDeletions,
			files: files.slice(0, 20), // cap so LLM context stays bounded
			truncated: files.length > 20,
		});
	}

	/**
	 * Gather the last N user/assistant turns of a coding session — actual
	 * conversation content, trimmed for spoken summarization.
	 */
	private async _gatherSessionThread(coding_session_id: string | undefined, lastN: number): Promise<string> {
		const session = await this._resolveSession(coding_session_id);
		if (!session) {
			return JSON.stringify({ session_id: coding_session_id ?? null, turns: [], note: 'session_not_found' });
		}

		const model = this.chatService.getSession(session.resource);
		if (!model) {
			return JSON.stringify({
				session_id: session.resource.toString(),
				turns: [],
				note: 'chat_model_not_loaded',
			});
		}

		const reqs = model.getRequests().slice(-lastN);
		const turns = reqs.map(req => {
			const userText = req.message.text || '';
			const assistantText = req.response?.response.value
				.filter(p => p.kind === 'markdownContent')
				.map(p => (p as { content: { value: string } }).content.value)
				.join(' ')
				.slice(0, 600) || '';
			return {
				user: userText.slice(0, 400),
				assistant: assistantText,
			};
		});

		return JSON.stringify({
			session_id: session.resource.toString(),
			turn_count: turns.length,
			turns,
		});
	}

	/** Render a URI as a short relative-ish path for spoken summaries. */
	private _formatPath(uri: URI): string {
		// Take last 2 segments — enough for the model to identify the file
		// without dumping full workspace paths into the prompt.
		const parts = uri.path.split('/').filter(Boolean);
		if (parts.length <= 2) {
			return uri.path.replace(/^\//, '');
		}
		return parts.slice(-2).join('/');
	}
}

registerSingleton(IVoiceToolDispatchService, VoiceToolDispatchService, InstantiationType.Delayed);
