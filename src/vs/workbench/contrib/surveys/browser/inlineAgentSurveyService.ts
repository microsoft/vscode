/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { Emitter, Event } from '../../../../base/common/event.js';
import { URI } from '../../../../base/common/uri.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { escapeModelIdForTelemetry, ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IWorkbenchAssignmentService } from '../../../services/assignment/common/assignmentService.js';
import {
	IInlineAgentSurveyPending,
	IInlineAgentSurveyResponseContext,
	IInlineAgentSurveyService,
	IInlineAgentSurveySubmission,
	InlineAgentSurveyRating,
	InlineAgentSurveyReason,
	InlineAgentSurveySurface,
	InlineAgentSurveyTrigger,
} from '../common/inlineAgentSurveyService.js';
import {
	InlineAgentSurveyTreatmentName,
	IInlineAgentSurveyRawTreatments,
	isResponseEligible,
	resolveInlineAgentSurveyTreatments,
	rollInlineAgentSurvey,
} from '../common/inlineAgentSurveyScheduler.js';

const STORAGE_KEY = 'inlineAgentSurvey.state.v1';

interface IPersistedPending {
	/** responseId */
	readonly r: string;
	/** trigger */
	readonly t: InlineAgentSurveyTrigger;
	/** surface */
	readonly s: InlineAgentSurveySurface;
	/** dismissed */
	readonly d: boolean;
}

interface IPersistedState {
	/** Timestamp of the last inline-survey impression in any chat. */
	lastGlobalImpressionAt: number;
	/** Durable per-chat impression markers keyed by chat resource string. */
	impressed: { [chatKey: string]: 1 };
	/** Selected-but-not-yet-submitted surveys keyed by chat resource string. */
	pending: { [chatKey: string]: IPersistedPending };
}

type InlineAgentSurveyAction = 'impression' | 'dismiss' | 'undo' | 'rating' | 'submission';

type InlineAgentSurveyEvent = {
	action: InlineAgentSurveyAction;
	trigger: string;
	surface: string;
	turnCount: number;
	model: string | undefined;
	rating: string | undefined;
	reasons: string | undefined;
	responseId: string;
	requestId: string;
};

type InlineAgentSurveyClassification = {
	action: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The survey lifecycle action: impression, dismiss, undo, rating, or submission.' };
	trigger: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Which trigger selected the survey: firstResponse or mature.' };
	surface: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The chat surface the survey was shown in: agentsWindow or editorChat.' };
	turnCount: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Number of completed user turns in the session when the survey was scheduled.' };
	model: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The escaped language model identifier for the turn, if known.' };
	rating: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The selected rating: yes, partly, or no. Absent for impression/dismiss/undo.' };
	reasons: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Finite reason ID selected for partly/no submissions. No free text.' };
	responseId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque identifier of the chat response the survey is attached to.' };
	requestId: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Opaque identifier of the chat request that produced the response.' };
	owner: 'digitarald';
	comment: 'Tracks the sampled inline agent-quality survey lifecycle to measure task-outcome satisfaction. No transcript, code, or free text is collected.';
};

export class InlineAgentSurveyService extends Disposable implements IInlineAgentSurveyService {

	declare readonly _serviceBrand: undefined;

	/** Response IDs that must never be rolled again: historical snapshots and live rolls. */
	private readonly rolledResponses = new Set<string>();
	private readonly _onDidChangeFeedbackEnabled = this._register(new Emitter<boolean>());
	readonly onDidChangeFeedbackEnabled: Event<boolean> = this._onDidChangeFeedbackEnabled.event;

	constructor(
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IWorkbenchAssignmentService private readonly assignmentService: IWorkbenchAssignmentService,
	) {
		super();
		this._register(this.configurationService.onDidChangeConfiguration(e => {
			if (e.affectsConfiguration('telemetry.feedback.enabled')) {
				this._onDidChangeFeedbackEnabled.fire(this.isFeedbackEnabled);
			}
		}));
	}

	private chatKey(chatResource: URI): string {
		return chatResource.toString();
	}

	private readState(): IPersistedState {
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.APPLICATION);
		if (raw) {
			try {
				const parsed = JSON.parse(raw) as Partial<IPersistedState>;
				return {
					lastGlobalImpressionAt: typeof parsed.lastGlobalImpressionAt === 'number' && isFinite(parsed.lastGlobalImpressionAt) ? parsed.lastGlobalImpressionAt : 0,
					impressed: parsed.impressed && typeof parsed.impressed === 'object' ? parsed.impressed : {},
					pending: parsed.pending && typeof parsed.pending === 'object' ? parsed.pending : {},
				};
			} catch {
				// fall through to default
			}
		}
		return { lastGlobalImpressionAt: 0, impressed: {}, pending: {} };
	}

	private writeState(state: IPersistedState): void {
		this.storageService.store(STORAGE_KEY, JSON.stringify(state), StorageScope.APPLICATION, StorageTarget.USER);
	}

	get isFeedbackEnabled(): boolean {
		return this.configurationService.getValue<boolean>('telemetry.feedback.enabled') !== false;
	}

	snapshotHistoricalResponses(chatResource: URI, responseIds: readonly string[]): void {
		for (const id of responseIds) {
			this.rolledResponses.add(id);
		}
	}

	async evaluateResponseCompletion(context: IInlineAgentSurveyResponseContext): Promise<void> {
		// Mark rolled synchronously before any async work so a response is only ever rolled once,
		// regardless of re-renders, virtualization, or multiple visible sessions.
		if (this.rolledResponses.has(context.responseId)) {
			return;
		}
		this.rolledResponses.add(context.responseId);

		if (!this.isFeedbackEnabled) {
			return;
		}

		// Cheap gates before awaiting assignments.
		if (!isResponseEligible(context)) {
			return;
		}
		const key = this.chatKey(context.chatResource);
		const preState = this.readState();
		if (preState.impressed[key]) {
			return;
		}

		const treatments = resolveInlineAgentSurveyTreatments(await this.readTreatments());
		if (!treatments.enabled) {
			return;
		}

		// Re-read state after the async gap in case another window changed pacing meanwhile.
		const state = this.readState();
		const trigger = rollInlineAgentSurvey({
			treatments,
			eligibility: context,
			now: Date.now(),
			lastGlobalImpressionAt: state.lastGlobalImpressionAt,
			alreadyImpressedThisChat: !!state.impressed[key],
			random: Math.random(),
		});
		if (trigger === undefined) {
			return; // Never persist negative roll outcomes.
		}

		state.pending[key] = { r: context.responseId, t: trigger, s: context.surface, d: false };
		this.writeState(state);
	}

	private async readTreatments(): Promise<IInlineAgentSurveyRawTreatments> {
		const [enabled, firstResponseProbability, matureResponseProbability, matureMinTimeMs, matureMinUserTurns, globalCooldownMs] = await Promise.all([
			this.assignmentService.getTreatment<boolean>(InlineAgentSurveyTreatmentName.enabled),
			this.assignmentService.getTreatment<number>(InlineAgentSurveyTreatmentName.firstResponseProbability),
			this.assignmentService.getTreatment<number>(InlineAgentSurveyTreatmentName.matureResponseProbability),
			this.assignmentService.getTreatment<number>(InlineAgentSurveyTreatmentName.matureMinTimeMs),
			this.assignmentService.getTreatment<number>(InlineAgentSurveyTreatmentName.matureMinUserTurns),
			this.assignmentService.getTreatment<number>(InlineAgentSurveyTreatmentName.globalCooldownMs),
		]);
		return { enabled, firstResponseProbability, matureResponseProbability, matureMinTimeMs, matureMinUserTurns, globalCooldownMs };
	}

	getPendingSurvey(chatResource: URI, responseId: string): IInlineAgentSurveyPending | undefined {
		if (!this.isFeedbackEnabled) {
			return undefined;
		}
		const state = this.readState();
		const pending = state.pending[this.chatKey(chatResource)];
		if (!pending || pending.r !== responseId) {
			return undefined;
		}
		return { responseId: pending.r, trigger: pending.t, surface: pending.s, dismissed: pending.d === true };
	}

	recordImpression(context: IInlineAgentSurveyResponseContext): void {
		if (!this.isFeedbackEnabled) {
			return;
		}
		const key = this.chatKey(context.chatResource);
		const state = this.readState();
		if (state.impressed[key]) {
			return; // Idempotent: one impression per chat.
		}
		state.impressed[key] = 1;
		state.lastGlobalImpressionAt = Date.now();
		this.writeState(state);
		this.log('impression', context);
	}

	recordDismiss(context: IInlineAgentSurveyResponseContext): void {
		if (!this.isFeedbackEnabled) {
			return;
		}
		this.updateDismissed(context, true);
		this.log('dismiss', context);
	}

	recordUndo(context: IInlineAgentSurveyResponseContext): void {
		if (!this.isFeedbackEnabled) {
			return;
		}
		this.updateDismissed(context, false);
		this.log('undo', context);
	}

	private updateDismissed(context: IInlineAgentSurveyResponseContext, dismissed: boolean): void {
		const key = this.chatKey(context.chatResource);
		const state = this.readState();
		const pending = state.pending[key];
		if (pending?.r === context.responseId && pending.d !== dismissed) {
			state.pending[key] = { ...pending, d: dismissed };
			this.writeState(state);
		}
	}

	recordRating(context: IInlineAgentSurveyResponseContext, rating: InlineAgentSurveyRating): void {
		if (!this.isFeedbackEnabled) {
			return;
		}
		this.log('rating', context, rating);
	}

	recordSubmission(context: IInlineAgentSurveyResponseContext, submission: IInlineAgentSurveySubmission): void {
		if (!this.isFeedbackEnabled) {
			return;
		}
		// Log before clearing pending so the trigger is still resolvable.
		this.log('submission', context, submission.rating, submission.reason);
		const key = this.chatKey(context.chatResource);
		const state = this.readState();
		if (state.pending[key]?.r === context.responseId) {
			delete state.pending[key];
			this.writeState(state);
		}
	}

	private log(action: InlineAgentSurveyAction, context: IInlineAgentSurveyResponseContext, rating?: InlineAgentSurveyRating, reason?: InlineAgentSurveyReason): void {
		if (!this.isFeedbackEnabled) {
			return;
		}
		const pending = this.getPendingSurvey(context.chatResource, context.responseId);
		this.telemetryService.publicLog2<InlineAgentSurveyEvent, InlineAgentSurveyClassification>('inlineAgentSurvey', {
			action,
			trigger: pending?.trigger ?? '',
			surface: context.surface,
			turnCount: context.completedUserTurns,
			model: escapeModelIdForTelemetry(context.modelId),
			rating,
			reasons: reason?.toString(),
			responseId: context.responseId,
			requestId: context.requestId,
		});
	}
}

registerSingleton(IInlineAgentSurveyService, InlineAgentSurveyService, InstantiationType.Delayed);
