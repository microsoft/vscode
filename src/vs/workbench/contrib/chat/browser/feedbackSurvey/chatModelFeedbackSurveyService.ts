/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../../base/common/event.js';
import { Disposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { generateUuid } from '../../../../../base/common/uuid.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { escapeModelIdForTelemetry, ITelemetryService, TelemetryLevel } from '../../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchAssignmentService } from '../../../../services/assignment/common/assignmentService.js';
import { ChatModelFeedbackSurveyStepKind, expandModelMatchCandidates, IChatModelFeedbackSurveyConfig, matchesChatModelFeedbackSurvey, parseChatModelFeedbackSurveyConfig } from '../../common/feedbackSurvey/chatModelFeedbackSurveyConfig.js';
import { CHAT_MODEL_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID, ChatModelFeedbackSurveyEventKind, IChatModelFeedbackSurveyTelemetryEvent } from '../../common/feedbackSurvey/chatModelFeedbackSurveyTelemetry.js';
import { ILanguageModelsService } from '../../common/languageModels.js';
import { getChatSessionType } from '../../common/model/chatUri.js';
import { IChatResponseViewModel } from '../../common/model/chatViewModel.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { IChatService } from '../../common/chatService/chatService.js';

/** Name of the experiment treatment carrying the survey payload. */
export const CHAT_MODEL_FEEDBACK_SURVEY_TREATMENT = 'chatModelFeedbackSurvey';

/** Gates the in product feedback UI. The survey replaces thumbs up and down, so it obeys this too. */
const FEEDBACK_ENABLED_CONFIG = 'telemetry.feedback.enabled';

const STORAGE_PREFIX = 'chat.modelFeedbackSurvey.';

export const enum ChatModelFeedbackSurveyStatus {
	/** Available but not showing: only the feedback control is rendered. */
	Collapsed = 'collapsed',
	Open = 'open',
}

/** What caused the survey to open, recorded so the funnel can separate the two paths. */
export type ChatModelFeedbackSurveyOpenTrigger = 'manual' | 'chance' | 'modelSwitchedAway';

export interface IChatModelFeedbackSurveyState {
	readonly config: IChatModelFeedbackSurveyConfig;
	readonly instanceId: string;
	readonly status: ChatModelFeedbackSurveyStatus;
	/** Index into `config.steps` of the step currently being shown. */
	readonly stepIndex: number;
	/** Answers so far, keyed by step id. Choice steps store an option id, text steps the comment. */
	readonly answers: ReadonlyMap<string, string>;
	/** Uncommitted free text, preserved across the widget being recycled by virtualization. */
	readonly commentDraft: string;
	/** Whether this survey was submitted. Reopening it acknowledges rather than asks again. */
	readonly isSubmitted: boolean;
	/** What opened the survey, so the UI can take focus only when the user asked for it. */
	readonly openTrigger: ChatModelFeedbackSurveyOpenTrigger | undefined;
}

/** Identifies the response whose survey changed, without retaining its view model. */
export interface IChatModelFeedbackSurveyChangeEvent {
	readonly sessionResource: URI;
	readonly requestId: string;
}

export const IChatModelFeedbackSurveyService = createDecorator<IChatModelFeedbackSurveyService>('chatModelFeedbackSurveyService');

export interface IChatModelFeedbackSurveyService {
	readonly _serviceBrand: undefined;

	/** Fires when a response's survey state changes, so the row can re-render. */
	readonly onDidChangeSurveyState: Event<IChatModelFeedbackSurveyChangeEvent>;

	/**
	 * Fires when the configured survey changes, including when it first resolves. Rows rendered
	 * before that point carry no control until they re-render, so they listen for this.
	 */
	readonly onDidChangeConfiguration: Event<void>;

	/**
	 * The survey attached to a response, or `undefined` when the config does not apply to it.
	 *
	 * Presence depends only on the `match` rules and never on the prompting heuristics, so the
	 * control does not come and go between responses. Repeated calls return the same state, so a
	 * row scrolling back into view keeps its control and is not asked to prompt twice.
	 */
	getSurvey(response: IChatResponseViewModel): IChatModelFeedbackSurveyState | undefined;

	/**
	 * Opens the survey, or closes it when it is already showing. Manual opens are never rate
	 * limited, because the prompting rules only exist to pace surveys the user did not ask for.
	 */
	toggle(response: IChatResponseViewModel): void;

	/**
	 * Reports that the user moved the model picker from one model to another. Leaving a surveyed
	 * model for an unsurveyed one is the strongest signal that the model was wrong.
	 */
	notifyModelSwitchedAway(sessionResource: URI, fromModelId: string, toModelId: string): void;
	answerChoice(response: IChatResponseViewModel, stepId: string, optionId: string): void;
	submit(response: IChatResponseViewModel, comment?: string): void;
	dismiss(response: IChatResponseViewModel): void;
	/** Records in-progress free text without re-rendering, so it survives row recycling. */
	setCommentDraft(response: IChatResponseViewModel, comment: string): void;
}

interface IMutableSurveyState {
	readonly config: IChatModelFeedbackSurveyConfig;
	readonly instanceId: string;
	readonly sessionResource: URI;
	readonly requestId: string;
	status: ChatModelFeedbackSurveyStatus;
	stepIndex: number;
	readonly answers: Map<string, string>;
	commentDraft: string;
	isSubmitted: boolean;
	openTrigger: ChatModelFeedbackSurveyOpenTrigger | undefined;
	/** Dimensions read from the response when the survey was created. */
	readonly dimensions: IChatModelFeedbackSurveyDimensions;
	/** Guards against re-emitting `shown` when a virtualized row is re-rendered. */
	shownReported: boolean;
	/** Text already reported, so submitting and dismissing cannot report it twice. */
	reportedComment?: string;
}

type IChatModelFeedbackSurveyDimensions = Pick<IChatModelFeedbackSurveyTelemetryEvent, 'modelId' | 'resolvedModelId' | 'modeId' | 'harness' | 'sessionType'>;

/** Whether the user is part way through answering, as opposed to done or not started. */
function isInProgress(state: IMutableSurveyState): boolean {
	return state.status === ChatModelFeedbackSurveyStatus.Open && !state.isSubmitted;
}

export class ChatModelFeedbackSurveyService extends Disposable implements IChatModelFeedbackSurveyService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChangeSurveyState = this._register(new Emitter<IChatModelFeedbackSurveyChangeEvent>());
	readonly onDidChangeSurveyState: Event<IChatModelFeedbackSurveyChangeEvent> = this._onDidChangeSurveyState.event;

	private readonly _onDidChangeConfiguration = this._register(new Emitter<void>());
	readonly onDidChangeConfiguration: Event<void> = this._onDidChangeConfiguration.event;

	private _config: IChatModelFeedbackSurveyConfig | undefined;
	private _configResolved = false;
	/** Increments on every treatment refresh so a slow in-flight resolution cannot overwrite a newer one. */
	private _configGeneration = 0;

	private readonly _states = new Map<string, IMutableSurveyState>();
	/** How many times the survey has opened itself in each session, keyed by session resource. */
	private readonly _sessionPromptCounts = new Map<string, number>();
	/** The most recent response carrying a survey in each session, for event-driven prompting. */
	private readonly _lastSurveyedResponse = new Map<string, string>();

	constructor(
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IStorageService private readonly storageService: IStorageService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ICommandService private readonly commandService: ICommandService,
		@ILanguageModelsService private readonly languageModelsService: ILanguageModelsService,
		@IChatSessionsService private readonly chatSessionsService: IChatSessionsService,
		@IChatService private readonly chatService: IChatService,
		@ILogService private readonly logService: ILogService,
	) {
		super();

		void this.resolveConfig();
		this._register(this.assignmentService.onDidRefetchAssignments(() => void this.resolveConfig()));
		this._register(this.chatService.onDidDisposeSession(e => this.forgetSessions(e.sessionResources)));
	}

	private async resolveConfig(): Promise<void> {
		const generation = ++this._configGeneration;
		let payload: string | undefined;
		try {
			payload = await this.assignmentService.getTreatment<string>(CHAT_MODEL_FEEDBACK_SURVEY_TREATMENT);
		} catch (err) {
			this.logService.trace(`[chatModelFeedbackSurvey] failed to resolve treatment: ${err}`);
		}

		if (generation !== this._configGeneration) {
			return; // a newer resolution won
		}

		const previousId = this._config?.id;
		if (payload === undefined) {
			this._config = undefined;
		} else {
			const result = parseChatModelFeedbackSurveyConfig(payload);
			if (result.error) {
				this.logService.warn(`[chatModelFeedbackSurvey] ignoring invalid survey config: ${result.error}`);
				this._config = undefined;
			} else {
				this._config = result.config;
			}
		}
		this._configResolved = true;

		// Only a different survey invalidates state, since reported step indices would no longer
		// mean what they did when sent. A treatment that resolves to nothing happens while the
		// experimentation client is rebuilt, and must not close an open survey or reset budgets.
		if (this._config && this._config.id !== previousId) {
			this._states.clear();
			this._sessionPromptCounts.clear();
			this._lastSurveyedResponse.clear();
		}

		if (this._config?.id !== previousId) {
			this._onDidChangeConfiguration.fire();
		}
	}

	getSurvey(response: IChatResponseViewModel): IChatModelFeedbackSurveyState | undefined {
		const key = this.getKey(response);
		const existing = this._states.get(key);
		if (existing) {
			// The config can be retired and feedback can be switched off after a survey was
			// offered, so a cached one is only handed back while it still applies. A survey the
			// user is part way through is left alone, since a treatment that briefly resolves to
			// nothing must not take a form away mid answer.
			const stillApplies = this._config?.id === existing.config.id && this.isFeedbackUiEnabled();
			if (!stillApplies && !isInProgress(existing)) {
				this._states.delete(key);
				return undefined;
			}
			// A survey the user is part way through stays put, so a form is never pulled away
			// when a newer response arrives. Anything else follows the newest response.
			if (!response.isLast && !isInProgress(existing)) {
				this._states.delete(key);
				return undefined;
			}
			this.reportShownOnce(existing);
			return this.toReadonly(existing);
		}

		// Only the newest response offers feedback, so history never fills with stale controls.
		if (!response.isLast) {
			return undefined;
		}

		// Runs before the match check so a newer response the survey ignores still supersedes.
		this.dropSupersededStates(response.sessionResource, key);

		const config = this.getMatchingConfig(response);
		if (!config) {
			return undefined;
		}

		const state: IMutableSurveyState = {
			config,
			instanceId: generateUuid(),
			sessionResource: response.sessionResource,
			requestId: response.requestId,
			status: ChatModelFeedbackSurveyStatus.Collapsed,
			stepIndex: 0,
			answers: new Map(),
			commentDraft: '',
			isSubmitted: false,
			openTrigger: undefined,
			dimensions: this.readDimensions(response),
			shownReported: false,
		};
		this._states.set(key, state);
		this._lastSurveyedResponse.set(response.sessionResource.toString(), key);
		this.reportShownOnce(state);

		// Rolled once per response so the outcome is stable however often the row re-renders.
		// The caller is mid render and reads the state below, so this does not announce a change.
		if (this.shouldPromptByChance(state)) {
			this.beginPrompt(state, 'chance', false);
		}

		return this.toReadonly(state);
	}

	toggle(response: IChatResponseViewModel): void {
		const state = this._states.get(this.getKey(response));
		if (!state) {
			return;
		}
		if (state.status === ChatModelFeedbackSurveyStatus.Open) {
			this.dismiss(response);
		} else {
			this.openState(state, 'manual');
		}
	}

	notifyModelSwitchedAway(sessionResource: URI, fromModelId: string, toModelId: string): void {
		const key = this._lastSurveyedResponse.get(sessionResource.toString());
		const state = key ? this._states.get(key) : undefined;
		if (!state || state.status === ChatModelFeedbackSurveyStatus.Open || state.isSubmitted) {
			return;
		}

		// Leaving one surveyed model for another is not abandoning the thing being surveyed, and
		// a switch between two unrelated models says nothing about it either.
		if (!this.isSurveyedModel(state.config, fromModelId) || this.isSurveyedModel(state.config, toModelId)) {
			return;
		}

		const trigger = state.config.prompt.triggers.modelSwitchedAway;
		if (!trigger.enabled || this.hasSurveyInProgress() || !this.hasPromptBudget(state, trigger.bypassCooldown)) {
			return;
		}

		this.beginPrompt(state, 'modelSwitchedAway');
	}

	/** Whether a model identifier is one the survey's `selectedModels` selectors name. */
	private isSurveyedModel(config: IChatModelFeedbackSurveyConfig, modelId: string): boolean {
		const selectors = config.match.selectedModels;
		if (!selectors.length) {
			return false; // a survey that does not name a model cannot detect leaving one
		}
		const candidates = expandModelMatchCandidates(modelId, this.getModelAliases(modelId));
		return selectors.some(selector => candidates.has(selector));
	}

	/** The other identifiers a selector may name a model by. */
	private getModelAliases(modelId: string | undefined): string[] | undefined {
		const metadata = modelId ? this.languageModelsService.lookupLanguageModel(modelId) : undefined;
		return metadata ? [metadata.id, metadata.family, metadata.name, metadata.vendor] : undefined;
	}

	answerChoice(response: IChatResponseViewModel, stepId: string, optionId: string): void {
		const state = this._states.get(this.getKey(response));
		if (!state || state.status !== ChatModelFeedbackSurveyStatus.Open || state.isSubmitted) {
			return;
		}

		const stepIndex = state.config.steps.findIndex(step => step.id === stepId);
		const step = state.config.steps[stepIndex];
		if (!step || step.kind !== ChatModelFeedbackSurveyStepKind.Choice) {
			return;
		}
		// Only ids that came from the config may reach telemetry.
		if (!step.options.some(option => option.id === optionId)) {
			return;
		}

		state.answers.set(stepId, optionId);
		this.report(state, 'step', { stepId, stepIndex, answerId: optionId });

		const isLastStep = stepIndex === state.config.steps.length - 1;
		if (isLastStep) {
			// A survey that ends on a choice has no Submit button, so the final selection is the
			// submission. Without this the panel would re-render the same question forever.
			this.finish(state, true, 'submitted');
			return;
		}

		state.stepIndex = stepIndex + 1;
		this._onDidChangeSurveyState.fire(this.toChangeEvent(state));
	}

	submit(response: IChatResponseViewModel, comment?: string): void {
		const state = this._states.get(this.getKey(response));
		if (!state || state.status !== ChatModelFeedbackSurveyStatus.Open || state.isSubmitted) {
			return;
		}

		this.reportCommentOnce(state, comment);
		this.finish(state, true, 'submitted');
	}

	dismiss(response: IChatResponseViewModel): void {
		const state = this._states.get(this.getKey(response));
		if (!state || state.status !== ChatModelFeedbackSurveyStatus.Open) {
			return;
		}

		// Closing an acknowledgement is not a dismissal, and reporting one would double count
		// against the submission already sent.
		if (state.isSubmitted) {
			state.status = ChatModelFeedbackSurveyStatus.Collapsed;
			this._onDidChangeSurveyState.fire(this.toChangeEvent(state));
			return;
		}

		this.reportCommentOnce(state, state.commentDraft);
		this.finish(state, false, 'dismissed');
	}

	setCommentDraft(response: IChatResponseViewModel, comment: string): void {
		const state = this._states.get(this.getKey(response));
		if (!state || state.status !== ChatModelFeedbackSurveyStatus.Open) {
			return;
		}
		// No change event, because re-rendering on every keystroke would fight the input. The
		// draft lives here so recycling the widget cannot discard it.
		state.commentDraft = comment;
	}

	// --- automatic prompting

	/**
	 * Decides whether a newly surveyed response should prompt on its own. The odds ramp with
	 * every response that passed without prompting, so heavier users reach the survey sooner.
	 */
	private shouldPromptByChance(state: IMutableSurveyState): boolean {
		const { chance } = state.config.prompt;
		if (chance.initial <= 0 && chance.increment <= 0) {
			return false;
		}
		if (this.hasSurveyInProgress()) {
			return false;
		}
		if (!this.hasPromptBudget(state, false)) {
			return false;
		}

		const misses = this.readPromptMisses(state.config);
		const probability = Math.min(chance.initial + (chance.increment * misses), chance.max);
		if (Math.random() < probability) {
			return true;
		}

		this.writePromptMisses(state.config, misses + 1);
		return false;
	}

	/** Releases everything held for sessions that have gone away. */
	private forgetSessions(sessionResources: readonly URI[]): void {
		for (const sessionResource of sessionResources) {
			const session = sessionResource.toString();
			this._sessionPromptCounts.delete(session);
			this._lastSurveyedResponse.delete(session);
			for (const [key, state] of [...this._states]) {
				if (state.sessionResource.toString() === session) {
					this._states.delete(key);
				}
			}
		}
	}

	/** Whether any survey is part way through, which an unrequested prompt must not displace. */
	private hasSurveyInProgress(): boolean {
		for (const state of this._states.values()) {
			if (isInProgress(state)) {
				return true;
			}
		}
		return false;
	}

	private hasPromptBudget(state: IMutableSurveyState, bypassCooldown: boolean): boolean {
		const { prompt } = state.config;
		const sessionKey = state.sessionResource.toString();
		if ((this._sessionPromptCounts.get(sessionKey) ?? 0) >= prompt.maxPerSession) {
			return false;
		}
		if (bypassCooldown || prompt.cooldownDays <= 0) {
			return true;
		}

		const lastPromptAt = this.readLastPromptAt(state.config);
		if (lastPromptAt === undefined) {
			return true;
		}
		return Date.now() - lastPromptAt >= prompt.cooldownDays * 24 * 60 * 60 * 1000;
	}

	/** Opens the survey unprompted and charges it against the pacing budgets. */
	private beginPrompt(state: IMutableSurveyState, trigger: ChatModelFeedbackSurveyOpenTrigger, announce = true): void {
		const sessionKey = state.sessionResource.toString();
		this._sessionPromptCounts.set(sessionKey, (this._sessionPromptCounts.get(sessionKey) ?? 0) + 1);
		this.writeLastPromptAt(state.config, Date.now());
		this.writePromptMisses(state.config, 0);
		this.openState(state, trigger, announce);
	}

	private openState(state: IMutableSurveyState, trigger: ChatModelFeedbackSurveyOpenTrigger, announce = true): void {
		this.closeOtherOpenSurveys(state);
		// A submitted survey reopens read only, so it needs no new instance.
		if (!state.isSubmitted && state.stepIndex >= state.config.steps.length) {
			state.stepIndex = 0;
		}
		state.status = ChatModelFeedbackSurveyStatus.Open;
		state.openTrigger = trigger;
		if (!state.isSubmitted) {
			this.report(state, 'opened', { trigger });
		}
		if (announce) {
			this._onDidChangeSurveyState.fire(this.toChangeEvent(state));
		}
	}

	private finish(state: IMutableSurveyState, submitted: boolean, kind: ChatModelFeedbackSurveyEventKind): void {
		const stepIndex = state.stepIndex;
		state.isSubmitted = submitted;
		// A submitted survey stays open to acknowledge. An abandoned one closes and can be
		// reopened, since the user never answered it.
		state.status = submitted ? ChatModelFeedbackSurveyStatus.Open : ChatModelFeedbackSurveyStatus.Collapsed;
		this.report(state, kind, { stepIndex });
		this._onDidChangeSurveyState.fire(this.toChangeEvent(state));
	}

	private toChangeEvent(state: IMutableSurveyState): IChatModelFeedbackSurveyChangeEvent {
		return { sessionResource: state.sessionResource, requestId: state.requestId };
	}

	// --- eligibility

	private getMatchingConfig(response: IChatResponseViewModel): IChatModelFeedbackSurveyConfig | undefined {
		if (!this._configResolved || !this._config) {
			return undefined;
		}
		if (!this.isFeedbackUiEnabled()) {
			return undefined;
		}
		if (!response.isComplete || response.isCanceled || response.errorDetails) {
			return undefined;
		}

		const request = response.model.request;
		const selectedModelId = request?.modelId;

		return matchesChatModelFeedbackSurvey(this._config, {
			selectedModelId,
			selectedModelAliases: this.getModelAliases(selectedModelId),
			resolvedModelId: this.getResolvedModelId(response),
			modeId: request?.modeInfo?.telemetryModeId,
			harness: this.getHarness(response.sessionResource),
			sessionType: getChatSessionType(response.sessionResource),
		}) ? this._config : undefined;
	}

	/** Answers that could never be sent must not be collected in the first place. */
	private isFeedbackUiEnabled(): boolean {
		return this.configurationService.getValue<boolean>(FEEDBACK_ENABLED_CONFIG) !== false
			&& this.telemetryService.telemetryLevel !== TelemetryLevel.NONE;
	}

	private getResolvedModelId(response: IChatResponseViewModel): string | undefined {
		const resolvedModel = response.result?.metadata?.resolvedModel;
		return typeof resolvedModel === 'string' ? resolvedModel : undefined;
	}

	/** Normalizes local and remote session types to one provider id, which is what a config targets. */
	private getHarness(sessionResource: URI): string | undefined {
		return this.chatSessionsService.getChatSessionContribution(getChatSessionType(sessionResource))?.agentHostProviderId;
	}

	// --- prompt pacing storage

	private readPromptMisses(config: IChatModelFeedbackSurveyConfig): number {
		const value = this.storageService.getNumber(`${STORAGE_PREFIX}${config.id}.promptMisses`, StorageScope.PROFILE, 0);
		return Number.isFinite(value) && value > 0 ? value : 0;
	}

	private writePromptMisses(config: IChatModelFeedbackSurveyConfig, misses: number): void {
		this.storageService.store(`${STORAGE_PREFIX}${config.id}.promptMisses`, misses, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private readLastPromptAt(config: IChatModelFeedbackSurveyConfig): number | undefined {
		const value = this.storageService.getNumber(`${STORAGE_PREFIX}${config.id}.lastPromptAt`, StorageScope.PROFILE);
		return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
	}

	private writeLastPromptAt(config: IChatModelFeedbackSurveyConfig, timestamp: number): void {
		this.storageService.store(`${STORAGE_PREFIX}${config.id}.lastPromptAt`, timestamp, StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	// --- state bookkeeping

	private getKey(response: IChatResponseViewModel): string {
		return `${response.sessionResource.toString()}\u0000${response.requestId}`;
	}

	private toReadonly(state: IMutableSurveyState): IChatModelFeedbackSurveyState {
		return {
			config: state.config,
			instanceId: state.instanceId,
			status: state.status,
			stepIndex: state.stepIndex,
			answers: state.answers,
			commentDraft: state.commentDraft,
			isSubmitted: state.isSubmitted,
			openTrigger: state.openTrigger,
		};
	}

	/**
	 * Closes whichever survey was already showing, since only one is open at a time. This is the
	 * UI moving on rather than the user rejecting anything, so nothing is reported.
	 */
	private closeOtherOpenSurveys(keep: IMutableSurveyState): void {
		for (const other of [...this._states.values()]) {
			if (other === keep || other.status !== ChatModelFeedbackSurveyStatus.Open) {
				continue;
			}
			other.status = ChatModelFeedbackSurveyStatus.Collapsed;
			this._onDidChangeSurveyState.fire(this.toChangeEvent(other));
		}
	}

	/**
	 * Within one session, keeps the newest response plus anything the user is part way through.
	 * Other sessions are separate transcripts and are left alone.
	 */
	private dropSupersededStates(sessionResource: URI, currentKey: string): void {
		const session = sessionResource.toString();
		for (const [key, state] of [...this._states]) {
			if (key !== currentKey && state.sessionResource.toString() === session && !isInProgress(state)) {
				this._states.delete(key);
			}
		}
	}

	// --- telemetry

	private reportShownOnce(state: IMutableSurveyState): void {
		if (state.shownReported) {
			return;
		}
		state.shownReported = true;
		this.report(state, 'shown', {});
	}

	private reportCommentOnce(state: IMutableSurveyState, comment: string | undefined): void {
		// Validation guarantees at most one text step, and that it is last.
		const textStep = state.config.steps.at(-1);
		if (textStep?.kind !== ChatModelFeedbackSurveyStepKind.Text) {
			return;
		}
		const trimmed = comment?.trim();
		if (!trimmed || trimmed === state.reportedComment) {
			return;
		}

		const clamped = trimmed.slice(0, textStep.maxLength);
		state.reportedComment = trimmed;
		state.answers.set(textStep.id, clamped);
		this.report(state, 'step', {
			stepId: textStep.id,
			stepIndex: state.config.steps.length - 1,
			comment: clamped,
		});
	}

	private readDimensions(response: IChatResponseViewModel): IChatModelFeedbackSurveyDimensions {
		const request = response.model.request;
		return {
			modelId: escapeModelIdForTelemetry(request?.modelId),
			resolvedModelId: escapeModelIdForTelemetry(this.getResolvedModelId(response)),
			modeId: request?.modeInfo?.telemetryModeId,
			harness: this.getHarness(response.sessionResource),
			sessionType: getChatSessionType(response.sessionResource),
		};
	}

	private report(
		state: IMutableSurveyState,
		kind: ChatModelFeedbackSurveyEventKind,
		details: Pick<IChatModelFeedbackSurveyTelemetryEvent, 'stepId' | 'stepIndex' | 'answerId' | 'comment' | 'trigger'>,
	): void {
		if (!this.isFeedbackUiEnabled()) {
			return; // never let survey content cross the process boundary when feedback is off
		}

		const event: IChatModelFeedbackSurveyTelemetryEvent = {
			kind,
			surveyId: state.config.id,
			surveyInstanceId: state.instanceId,
			stepCount: state.config.steps.length,
			...details,
			...state.dimensions,
			requestId: state.requestId,
		};

		// Best effort: the survey must never interfere with the chat session.
		this.commandService.executeCommand(CHAT_MODEL_FEEDBACK_SURVEY_TELEMETRY_COMMAND_ID, event)
			.catch(err => this.logService.trace(`[chatModelFeedbackSurvey] failed to report '${kind}': ${err}`));
	}
}
