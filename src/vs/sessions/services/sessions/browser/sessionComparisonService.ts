/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { withSessionComparisonMetadata } from '../../../../platform/agentHost/common/state/sessionState.js';
import { localize } from '../../../../nls.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { aggregateChatUsage } from '../../../../workbench/contrib/chat/common/chatUsage.js';
import { isActiveSessionStatus, ISession, SessionStatus } from '../common/session.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { getSessionComparisonAttemptLabel, getSessionComparisonHarnessLabel, ISessionComparison, ISessionComparisonHarness, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, ISessionComparisonVerdict, IStartSessionComparisonOptions, SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole } from '../common/sessionComparison.js';
import { getSessionsTelemetryProviderId, hashSessionIdForTelemetry, logSessionComparisonAttemptCompleted, logSessionComparisonModelOutcome } from '../../../common/sessionsTelemetry.js';

interface IStoredSessionComparisonParticipant extends Omit<ISessionComparisonParticipant, 'sessionResource'> {
	readonly sessionResource?: string;
}

interface IStoredSessionComparison extends Omit<ISessionComparison, 'workspace' | 'attachedContext' | 'participants'> {
	readonly workspace: string;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly participants: readonly IStoredSessionComparisonParticipant[];
}

function isDecisionAssessment(value: SessionComparisonDecisionAssessment | undefined): value is SessionComparisonDecisionAssessment {
	return value === SessionComparisonDecisionAssessment.Better
		|| value === SessionComparisonDecisionAssessment.Neutral
		|| value === SessionComparisonDecisionAssessment.Worse;
}

export class SessionComparisonService extends Disposable implements ISessionComparisonService {
	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessions.comparisons';
	private static readonly ATTEMPT_TELEMETRY_STORAGE_KEY = 'sessions.comparisonAttemptTelemetry';
	private readonly _comparisons = observableValue<readonly ISessionComparison[]>(this, []);
	readonly comparisons = this._comparisons;
	private readonly _judgeStarting = new Set<string>();
	private readonly _synthesisStarting = new Set<string>();
	private readonly _migratingAttemptTitles = new Set<string>();
	private readonly _migratedAttemptTitles = new Set<string>();
	private readonly _reportedAttemptTelemetry = new Set<string>();
	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService private readonly sessionGroupsService: ISessionGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IChatService private readonly chatService: IChatService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._loadAttemptTelemetryState();
		const comparisons = this._load();
		this._comparisons.set(comparisons, undefined);
		this._removeComparisonsWithMissingGroups();
		this._ensureComparisonGroupMembership(this._comparisons.get());
		this._migrateLegacyAttemptTitles(this._comparisons.get());
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			const comparisons = this._comparisons.get();
			this._ensureComparisonGroupMembership(comparisons);
			this._migrateLegacyAttemptTitles(comparisons);
			this._checkComparisons();
		}));
		this._register(this.sessionGroupsService.onDidChange(event => {
			if (event.groupsChanged) {
				this._removeComparisonsWithMissingGroups();
			}
		}));
		this._checkComparisons();
	}

	async startComparison(options: IStartSessionComparisonOptions, token: CancellationToken = CancellationToken.None): Promise<ISessionComparison> {
		if (options.attempts.length < 2) {
			throw new Error('A session comparison requires at least two attempts.');
		}
		if (new Set(options.attempts.map(attempt => attempt.id)).size !== options.attempts.length) {
			throw new Error('Session comparison attempt identifiers must be unique.');
		}

		const id = generateUuid();
		const attachedContext = options.attachedContext ? snapshotAttachedContext(options.attachedContext) : undefined;
		const title = comparisonTitle(options.prompt);
		const group = this.sessionGroupsService.createGroup(title);
		const attempts = options.attempts.map(attempt => ({
			id: attempt.id,
			role: SessionComparisonParticipantRole.Attempt,
			harness: attempt.harness,
		} satisfies ISessionComparisonParticipant));
		let comparison: ISessionComparison = {
			id,
			groupId: group.id,
			title,
			createdAt: Date.now(),
			workspace: options.workspace,
			prompt: options.prompt,
			attachedContext,
			branch: options.branch,
			permissionLevel: options.permissionLevel,
			judgeHarness: options.judgeHarness,
			synthesisHarness: options.synthesisHarness,
			participants: attempts,
		};
		this._addComparison(comparison);

		const attemptPromises = attempts.map(async (participant, index): Promise<ISessionComparisonParticipant> => {
			const harness = participant.harness;
			try {
				const session = await this.sessionsManagementService.createAndSendNewChatRequest(options.workspace, {
					query: options.prompt,
					attachedContext: comparison.attachedContext ? [...comparison.attachedContext] : undefined,
					title: getSessionComparisonHarnessLabel(participant),
					background: true,
				}, {
					...this._createOptions(harness, options, id, index),
					onSessionCreated: createdSession => {
						this._updateComparisonParticipant(id, participant.id, currentParticipant => ({
							...currentParticipant,
							sessionResource: createdSession.resource,
							launchError: undefined,
						}));
					},
				}, token);
				return {
					...participant,
					sessionResource: session?.resource,
					...(!session ? { launchError: localize('sessionComparison.launchUnavailable', "The session did not start.") } : {}),
				} satisfies ISessionComparisonParticipant;
			} catch (error) {
				return {
					...participant,
					launchError: isCancellationError(error)
						? localize('sessionComparison.launchCancelled', "The attempt was cancelled before it started.")
						: error instanceof Error ? error.message : String(error),
				} satisfies ISessionComparisonParticipant;
			}
		});

		const launchedAttempts = await Promise.all(attemptPromises);
		const current = this.getComparison(comparison.id);
		if (!current) {
			throw new Error('Session comparison was removed while attempts were launching.');
		}
		const launchedById = new Map(launchedAttempts.map(participant => [participant.id, participant] as const));
		comparison = {
			...current,
			participants: current.participants.map(participant => launchedById.get(participant.id) ?? participant),
		};
		this._ensureComparisonGroupMembership([comparison]);
		this._replaceComparison(comparison);
		this._checkComparison(comparison);
		const successfulAttemptCount = launchedAttempts.filter(participant => participant.sessionResource).length;
		if (successfulAttemptCount < 2) {
			this._removeComparison(comparison.id);
			this.sessionGroupsService.deleteGroup(comparison.groupId);
			await this._cancelAndDeleteSessions(
				launchedAttempts
					.map(participant => participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined)
					.filter((session): session is ISession => session !== undefined),
				'attempt startup cleanup',
			);
			const launchFailures = launchedAttempts
				.filter(participant => participant.launchError)
				.map(participant => `${getSessionComparisonHarnessLabel(participant)}: ${participant.launchError}`)
				.join('; ');
			throw new Error(localize(
				'sessionComparison.insufficientSuccessfulAttempts',
				"Only {0} of {1} comparison attempts started. At least two must start successfully. Failed attempts: {2}",
				successfulAttemptCount,
				attempts.length,
				launchFailures
			));
		}
		return comparison;
	}

	getComparison(comparisonId: string): ISessionComparison | undefined {
		return this._comparisons.get().find(comparison => comparison.id === comparisonId);
	}

	getComparisonForSession(resource: URI): ISessionComparison | undefined {
		return this._comparisons.get().find(comparison =>
			comparison.participants.some(participant => participant.sessionResource && isEqual(participant.sessionResource, resource)));
	}

	cancelComparison(comparisonId: string): void {
		const comparison = this._requireComparison(comparisonId);
		if (comparison.cancelledAt !== undefined) {
			return;
		}
		this._replaceComparison({
			...comparison,
			cancelledAt: Date.now(),
			synthesisPlan: undefined,
		});
	}

	selectAttempt(comparisonId: string, participantId: string): void {
		const comparison = this._requireComparison(comparisonId);
		const participant = comparison.participants.find(candidate =>
			candidate.id === participantId && candidate.role === SessionComparisonParticipantRole.Attempt && candidate.sessionResource);
		if (!participant) {
			throw new Error(`Comparison attempt '${participantId}' was not found.`);
		}
		this._replaceComparison({ ...comparison, selectedParticipantId: participantId });
	}

	submitVerdict(comparisonId: string, verdict: ISessionComparisonVerdict): void {
		const comparison = this._requireComparison(comparisonId);
		if (comparison.cancelledAt !== undefined) {
			throw new Error(`Comparison '${comparisonId}' was cancelled.`);
		}
		if (comparison.verdict) {
			throw new Error(`A verdict has already been submitted for comparison '${comparisonId}'.`);
		}
		const attemptIds = new Set(comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource)
			.map(participant => participant.id));
		if (!attemptIds.has(verdict.recommendedParticipantId)) {
			throw new Error(`Recommended comparison attempt '${verdict.recommendedParticipantId}' was not found.`);
		}
		if (verdict.attempts.some(attempt => !attemptIds.has(attempt.participantId))) {
			throw new Error('The comparison verdict contains an unknown attempt.');
		}
		const sectionIds = new Set<string>();
		for (const section of verdict.decisionSections ?? []) {
			const optionIds = new Set(section.options.map(option => option.participantId));
			const hasAssessments = section.options.some(option => option.assessment !== undefined);
			const recommendedOption = section.options.find(option => option.participantId === section.recommendedParticipantId);
			if (sectionIds.has(section.id)
				|| !attemptIds.has(section.recommendedParticipantId)
				|| !optionIds.has(section.recommendedParticipantId)
				|| optionIds.size !== section.options.length
				|| section.options.some(option => !attemptIds.has(option.participantId))
				|| hasAssessments && (recommendedOption?.assessment !== SessionComparisonDecisionAssessment.Better
					|| section.options.some(option => !isDecisionAssessment(option.assessment)))) {
				throw new Error('The comparison verdict contains an invalid synthesis decision section.');
			}
			sectionIds.add(section.id);
		}
		const updated = { ...comparison, verdict, synthesisPlan: undefined };
		this._replaceComparison(updated);
		this._reportOutcomeTelemetry(comparison, verdict);
		this._checkComparison(updated);
	}

	retryJudge(comparisonId: string): void {
		const comparison = this._requireComparison(comparisonId);
		const failedJudgeIds = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Judge && !participant.sessionResource && !!participant.launchError)
			.map(participant => participant.id);
		if (failedJudgeIds.length === 0) {
			return;
		}
		const updated = {
			...comparison,
			participants: comparison.participants.filter(participant => !failedJudgeIds.includes(participant.id)),
		};
		this._replaceComparison(updated);
		this._checkComparison(updated);
	}

	setSynthesisPlan(comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void {
		const comparison = this._requireComparison(comparisonId);
		if (comparison.cancelledAt !== undefined) {
			throw new Error(`Comparison '${comparisonId}' was cancelled.`);
		}
		if (!plan) {
			this._replaceComparison({ ...comparison, synthesisPlan: undefined });
			return;
		}
		if (plan.instructions !== undefined
			&& (plan.instructions.trim().length === 0 || plan.instructions.length > SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH)) {
			throw new Error('The synthesis plan contains invalid additional instructions.');
		}
		const sections = new Map((comparison.verdict?.decisionSections ?? []).map(section => [section.id, section]));
		const selectedSectionIds = new Set<string>();
		for (const selection of plan.selections) {
			const section = sections.get(selection.sectionId);
			if (!section
				|| selectedSectionIds.has(selection.sectionId)
				|| selection.participantId !== undefined && !section.options.some(option => option.participantId === selection.participantId)) {
				throw new Error('The synthesis plan contains an invalid section selection.');
			}
			selectedSectionIds.add(selection.sectionId);
		}
		this._replaceComparison({ ...comparison, synthesisPlan: plan });
	}

	async synthesize(comparisonId: string): Promise<void> {
		if (this._synthesisStarting.has(comparisonId)) {
			return;
		}
		const comparison = this._requireComparison(comparisonId);
		if (comparison.cancelledAt !== undefined) {
			throw new Error(`Comparison '${comparisonId}' was cancelled.`);
		}
		if (comparison.participants.some(participant => participant.role === SessionComparisonParticipantRole.Synthesis)) {
			return;
		}
		const recommendedId = comparison.selectedParticipantId ?? comparison.verdict?.recommendedParticipantId;
		const recommended = comparison.participants.find(participant =>
			participant.id === recommendedId && participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource);
		if (!recommended) {
			throw new Error('A selected or recommended attempt is required before synthesis.');
		}
		const harness = comparison.synthesisHarness ?? recommended.harness;
		const synthesisParticipantId = generateUuid();
		let provisionalSessionResource: URI | undefined;

		this._synthesisStarting.add(comparisonId);
		try {
			const synthesisPlanPrompt = this._getSynthesisPlanPrompt(comparison);
			const session = await this.sessionsManagementService.createAndSendNewChatRequest(comparison.workspace, {
				query: localize('sessionComparison.synthesisPrompt', "Synthesize the strongest parts of comparison `{0}` into a new implementation.\n\n## Process\n1. Call `#readAttemptComparison` exactly once with this comparison ID.\n2. Read implementation code only from the authoritative worktrees in the manifest. If `changedFilesStatus` is unavailable, read the Git diff from that worktree.\n3. Treat every selected synthesis approach and additional instruction below, plus the synthesis plan in the manifest, as explicit user requirements. Resolve cross-section dependencies coherently instead of copying hunks mechanically.\n4. Call `get_session_context` only with an exact `sessionContextTarget` returned by the manifest and only for rationale or validation evidence. Never recover implementation code or paths from a transcript.\n5. Do not inspect another checkout, discover sessions, or guess references. Preserve correct behavior and resolve the Judge's reported conflicts.\n\n## Judge recommendation\n{1}{2}\n\n## Completion\n- Run the relevant validation.\n- Respond concisely with **Changes**, **Validation**, and **Remaining issues** sections using bullet points.", comparison.id, this._getVerdictRecommendation(comparison), synthesisPlanPrompt),
				attachedContext: comparison.attachedContext ? [...comparison.attachedContext] : undefined,
				title: localize('sessionComparison.synthesisTitle', "Synthesis: {0}", comparison.title),
				background: true,
			}, {
				providerId: harness.providerId,
				sessionTypeId: harness.sessionTypeId,
				modelId: harness.modelId,
				modelConfiguration: harness.modelConfiguration,
				...this._permissionOptions(harness, comparison.permissionLevel),
				isolationMode: 'worktree',
				branch: comparison.branch,
				metadata: withSessionComparisonMetadata(undefined, {
					id: hashSessionIdForTelemetry(comparison.id),
					role: 'synthesis',
					attemptCount: comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt).length,
				}),
				onSessionCreated: createdSession => {
					provisionalSessionResource = createdSession.resource;
					const current = this._requireComparison(comparisonId);
					const synthesis: ISessionComparisonParticipant = {
						id: synthesisParticipantId,
						role: SessionComparisonParticipantRole.Synthesis,
						harness,
						sessionResource: createdSession.resource,
					};
					this._replaceComparison({ ...current, participants: [...current.participants, synthesis] });
					this.sessionGroupsService.addToGroup(createdSession.sessionId, current.groupId);
				},
			});
			if (session && (!provisionalSessionResource || !isEqual(provisionalSessionResource, session.resource))) {
				this.sessionGroupsService.addToGroup(session.sessionId, comparison.groupId);
			}
			const synthesis: ISessionComparisonParticipant = {
				id: synthesisParticipantId,
				role: SessionComparisonParticipantRole.Synthesis,
				harness,
				sessionResource: session?.resource,
				...(!session ? { launchError: localize('sessionComparison.synthesisUnavailable', "The synthesis session did not start.") } : {}),
			};
			const current = this._requireComparison(comparisonId);
			const registered = current.participants.some(participant => participant.id === synthesisParticipantId);
			const updated = {
				...current,
				participants: registered
					? current.participants.map(participant => participant.id === synthesisParticipantId ? synthesis : participant)
					: [...current.participants, synthesis],
			};
			this._replaceComparison(updated);
			this._checkComparison(updated);
		} catch (error) {
			const current = this.getComparison(comparisonId);
			if (current?.participants.some(participant => participant.id === synthesisParticipantId)) {
				this._replaceComparison({
					...current,
					participants: current.participants.filter(participant => participant.id !== synthesisParticipantId),
				});
			}
			throw error;
		} finally {
			this._synthesisStarting.delete(comparisonId);
		}
	}

	private _updateComparisonParticipant(comparisonId: string, participantId: string, update: (participant: ISessionComparisonParticipant) => ISessionComparisonParticipant): ISessionComparison | undefined {
		const comparison = this.getComparison(comparisonId);
		if (!comparison) {
			return undefined;
		}
		let changed = false;
		const participants = comparison.participants.map(participant => {
			if (participant.id !== participantId) {
				return participant;
			}
			const updatedParticipant = update(participant);
			changed = true;
			return updatedParticipant;
		});
		if (!changed) {
			return comparison;
		}
		const updated = { ...comparison, participants };
		this._replaceComparison(updated);
		this._ensureComparisonGroupMembership([updated]);
		return updated;
	}

	private _createOptions(harness: ISessionComparisonHarness, options: IStartSessionComparisonOptions, comparisonId: string, attemptIndex: number) {
		return {
			providerId: harness.providerId,
			sessionTypeId: harness.sessionTypeId,
			modelId: harness.modelId,
			modelConfiguration: harness.modelConfiguration,
			...this._permissionOptions(harness, options.permissionLevel),
			isolationMode: 'worktree',
			branch: options.branch,
			metadata: withSessionComparisonMetadata(undefined, {
				id: hashSessionIdForTelemetry(comparisonId),
				role: 'attempt',
				attemptIndex,
				attemptCount: options.attempts.length,
			}),
		};
	}

	private _permissionOptions(harness: ISessionComparisonHarness, legacyPermissionLevel: string | undefined) {
		if (harness.permissionId) {
			return { permissionId: harness.permissionId };
		}
		if (legacyPermissionLevel) {
			return { permissionLevel: legacyPermissionLevel };
		}
		return {};
	}

	private _requireComparison(comparisonId: string): ISessionComparison {
		const comparison = this.getComparison(comparisonId);
		if (!comparison) {
			throw new Error(`Session comparison '${comparisonId}' was not found.`);
		}
		return comparison;
	}

	private _checkComparisons(): void {
		for (const comparison of this._comparisons.get()) {
			this._checkComparison(comparison);
		}
	}

	private _checkComparison(comparison: ISessionComparison): void {
		comparison = this._captureTerminalAttemptMetrics(comparison);
		if (comparison.cancelledAt !== undefined) {
			return;
		}
		if (this._judgeStarting.has(comparison.id)
			|| comparison.participants.some(participant => participant.role === SessionComparisonParticipantRole.Judge)) {
			return;
		}
		const harness = this._getJudgeHarness(comparison);
		if (!harness) {
			return;
		}
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const successful = attempts.filter(participant => participant.sessionResource);
		if (successful.length < 2 || attempts.some(participant => {
			if (participant.launchError) {
				return false;
			}
			const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
			const status = session?.status.get();
			return status !== SessionStatus.Completed && status !== SessionStatus.Error;
		})) {
			return;
		}
		const judgeParticipantId = generateUuid();
		const pendingJudge = {
			id: judgeParticipantId,
			role: SessionComparisonParticipantRole.Judge,
			harness,
		} satisfies ISessionComparisonParticipant;
		const pendingComparison = { ...comparison, participants: [...comparison.participants, pendingJudge] };
		this._replaceComparison(pendingComparison);
		this._judgeStarting.add(comparison.id);
		void this._startJudge(pendingComparison, judgeParticipantId).catch(error => {
			this.logService.error('[SessionComparisonService] Failed to start the comparison judge.', error);
			this._updateComparisonParticipant(comparison.id, judgeParticipantId, participant => ({
				...participant,
				launchError: error instanceof Error ? error.message : String(error),
			}));
		}).finally(() => this._judgeStarting.delete(comparison.id));
	}

	private _captureTerminalAttemptMetrics(comparison: ISessionComparison): ISessionComparison {
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		let comparisonChanged = false;
		let telemetryChanged = false;
		const completions = new Map<string, ISessionComparisonParticipant['completion']>();
		for (const [attemptIndex, participant] of attempts.entries()) {
			if (!participant.sessionResource) {
				continue;
			}
			const session = this.sessionsManagementService.getSession(participant.sessionResource);
			const status = session?.status.get();
			if (!session || (status !== SessionStatus.Completed && status !== SessionStatus.Error)) {
				continue;
			}
			const requests = this.chatService.getSession(session.mainChat.get().resource)?.getRequests() ?? [];
			const firstTurnElapsedMs = requests[0]?.response?.elapsedMs;
			const storedElapsedMs = participant.completion?.elapsedMs;
			const elapsedMs = typeof firstTurnElapsedMs === 'number' && Number.isFinite(firstTurnElapsedMs) && firstTurnElapsedMs >= 0
				? firstTurnElapsedMs
				: typeof storedElapsedMs === 'number' && storedElapsedMs > 0 ? storedElapsedMs : undefined;
			const usage = participant.completion?.tokenCount === undefined ? aggregateChatUsage(requests.map(request => request.response?.usage)) : undefined;
			const completion = {
				elapsedMs,
				tokenCount: participant.completion?.tokenCount ?? (usage ? usage.inputTokens + usage.outputTokens : undefined),
			};
			completions.set(participant.id, completion);
			if (participant.completion?.elapsedMs !== completion.elapsedMs || participant.completion?.tokenCount !== completion.tokenCount) {
				comparisonChanged = true;
			}
			const key = `${comparison.id}/${participant.id}`;
			if (this._reportedAttemptTelemetry.has(key) || completion.elapsedMs === undefined) {
				continue;
			}
			logSessionComparisonAttemptCompleted(this.telemetryService, {
				comparisonId: hashSessionIdForTelemetry(comparison.id),
				attemptIndex,
				elapsedMs: completion.elapsedMs,
			});
			this._reportedAttemptTelemetry.add(key);
			telemetryChanged = true;
		}
		if (telemetryChanged) {
			this._saveAttemptTelemetryState();
		}
		if (!comparisonChanged) {
			return comparison;
		}
		const updated = {
			...comparison,
			participants: comparison.participants.map(participant => {
				const completion = completions.get(participant.id);
				return completion && (participant.completion?.elapsedMs !== completion.elapsedMs || participant.completion?.tokenCount !== completion.tokenCount)
					? { ...participant, completion }
					: participant;
			}),
		};
		this._replaceComparison(updated);
		return updated;
	}

	private _reportOutcomeTelemetry(comparison: ISessionComparison, verdict: ISessionComparisonVerdict): void {
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const judge = comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Judge);
		if (!judge) {
			return;
		}
		const judgeSession = judge.sessionResource ? this.sessionsManagementService.getSession(judge.sessionResource) : undefined;
		for (const [attemptIndex, participant] of attempts.entries()) {
			if (!participant.sessionResource) {
				continue;
			}
			const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
			logSessionComparisonModelOutcome(this.telemetryService, {
				comparisonId: hashSessionIdForTelemetry(comparison.id),
				attemptIndex,
				attemptCount: attempts.length,
				providerId: getSessionsTelemetryProviderId(participant.harness.providerId),
				agentId: participant.harness.sessionTypeId,
				modelId: session?.modelId.get() ?? participant.harness.modelId,
				recommended: verdict.recommendedParticipantId === participant.id,
				judgeProviderId: getSessionsTelemetryProviderId(judge.harness.providerId),
				judgeAgentId: judge.harness.sessionTypeId,
				judgeModelId: judgeSession?.modelId.get() ?? judge.harness.modelId,
			});
		}
	}

	private async _startJudge(comparison: ISessionComparison, judgeParticipantId: string): Promise<void> {
		const judge = comparison.participants.find(participant => participant.id === judgeParticipantId && participant.role === SessionComparisonParticipantRole.Judge);
		if (!judge) {
			return;
		}
		const harness = judge.harness;
		const query = this._getJudgePrompt(comparison.id);
		const session = await this.sessionsManagementService.createAndSendNewChatRequest(comparison.workspace, {
			query,
			attachedContext: comparison.attachedContext ? [...comparison.attachedContext] : undefined,
			title: localize('sessionComparison.judgeTitle', "Judge: {0}", comparison.title),
			background: true,
		}, {
			providerId: harness.providerId,
			sessionTypeId: harness.sessionTypeId,
			modelId: harness.modelId,
			modelConfiguration: harness.modelConfiguration,
			...this._permissionOptions(harness, comparison.permissionLevel),
			isolationMode: 'worktree',
			branch: comparison.branch,
			metadata: withSessionComparisonMetadata(undefined, {
				id: hashSessionIdForTelemetry(comparison.id),
				role: 'judge',
				attemptCount: comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt).length,
			}),
			onSessionCreated: createdSession => {
				this._updateComparisonParticipant(comparison.id, judgeParticipantId, participant => ({
					...participant,
					sessionResource: createdSession.resource,
					launchError: undefined,
				}));
			},
		});
		const current = this.getComparison(comparison.id);
		if (!current) {
			if (session) {
				await this._cancelAndDeleteSessions([session], 'orphaned Judge cleanup');
			}
			return;
		}
		if (session) {
			this.sessionGroupsService.addToGroup(session.sessionId, comparison.groupId);
		}
		const updated = {
			...current,
			participants: current.participants.map(participant => participant.id === judgeParticipantId
				? {
					...participant,
					sessionResource: session?.resource,
					...(!session ? { launchError: localize('sessionComparison.judgeUnavailable', "The judge session did not start.") } : {}),
				}
				: participant),
		};
		this._replaceComparison(updated);
		this._checkComparison(updated);
	}

	private async _cancelAndDeleteSessions(sessions: readonly ISession[], context: string): Promise<void> {
		const activeSessions = sessions.filter(session => isActiveSessionStatus(session.status.get()));
		const cancellationResults = await Promise.allSettled(activeSessions.map(session => this.sessionsManagementService.cancelCurrentRequest(session)));
		for (const result of cancellationResults) {
			if (result.status === 'rejected') {
				this.logService.error(`[SessionComparisonService] Failed to cancel a session during ${context}.`, result.reason);
			}
		}
		const deletionResults = await Promise.allSettled(sessions.map(session => this.sessionsManagementService.deleteSession(session)));
		for (const result of deletionResults) {
			if (result.status === 'rejected') {
				this.logService.error(`[SessionComparisonService] Failed to delete a session during ${context}.`, result.reason);
			}
		}
	}

	private _getJudgePrompt(comparisonId: string): string {
		return localize('sessionComparison.judgePrompt', "Judge implementation comparison `{0}`.\n\n1. Call `#readAttemptComparison` exactly once with this comparison ID.\n2. Review every attempt's code changes and validation evidence. Use `get_session_context` with the exact manifest target to identify validation that the attempt already completed. Terminal commands start in the Judge worktree, not an attempt worktree, so explicitly `cd` to the exact `worktree.workingDirectory` from the manifest in every command that inspects or validates an attempt.\n3. Do not rerun a validation category when the attempt report contains a clear result. Run only missing targeted tests, build, lint, or diagnostics needed to make a reliable recommendation. If required dependencies or build artifacts are unavailable, record that validation as unavailable; do not install or build dependencies, and do not substitute a different validation category.\n4. For each validation category, record one consistent `state` and `source` evidence pair. Known `passed` or `failed` results must use `attemptReport` or `judgeRun`; use `unavailable` only with `notRun` or `unknown`, and use `notApplicable` for both fields when the category genuinely does not apply.\n5. Keep `explanation` to one sentence. Fill `rationale` with exactly four concise points in this order: `comparison`, `validation`, `codeQuality`, and `solution`. Each point must cite concrete evidence, contain no line breaks, and stay within the tool schema length limit. For every other attempt, record its strongest reusable points in `notableDifferences`.\n6. Identify semantic `decisionSections` where attempts make meaningfully different implementation choices. Each section may span related files. Give it a stable ID, short title, plain-language summary, affected repository-relative files, one concise option per relevant `attemptNumber`, and a recommended `attemptNumber`. Rate every option as `better`, `neutral`, or `worse` relative to the other approaches using concrete code and validation evidence; the recommended option must be rated `better`. Return an empty array when there are no meaningful choices. Do not use raw line numbers as section identity.\n7. Do not modify, merge, apply, or delete any attempt.\n8. Call `#completeAttemptComparison` with the recommendation and supporting evidence. Refer to attempts only by the `attemptNumber` values returned by `#readAttemptComparison`; do not copy participant or session UUIDs. If it rejects invalid input, correct the reported fields and retry; do not submit again after success.\n9. After the tool returns, identify the winner as `Attempt N (agent, model, effort)` and use the same rationale order, followed by the strongest reusable points from every other attempt.", comparisonId);
	}

	private _getSynthesisPlanPrompt(comparison: ISessionComparison): string {
		const plan = comparison.synthesisPlan;
		if (!plan) {
			return '';
		}
		const blocks: string[] = [];
		const sections = new Map((comparison.verdict?.decisionSections ?? []).map(section => [section.id, section]));
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const attemptNumbers = new Map(attempts.map((attempt, index) => [attempt.id, index + 1]));
		const selections = plan.selections.flatMap(selection => {
			const section = sections.get(selection.sectionId);
			if (!section) {
				return [];
			}
			if (!selection.participantId) {
				return [localize('sessionComparison.synthesizerSelectsApproachPrompt', "- **{0}**: Synthesizer decides.", section.title)];
			}
			const participant = attempts.find(attempt => attempt.id === selection.participantId);
			const option = section.options.find(option => option.participantId === selection.participantId);
			const attemptNumber = attemptNumbers.get(selection.participantId);
			if (!participant || !option || !attemptNumber) {
				return [];
			}
			return [localize('sessionComparison.selectedApproachPrompt', "- **{0}**: Follow {1}. {2}", section.title, getSessionComparisonAttemptLabel(participant, attemptNumber), option.approach)];
		});
		if (selections.length > 0) {
			blocks.push(localize('sessionComparison.selectedSynthesisApproachesPrompt', "\n\n## Selected synthesis approaches\n{0}", selections.join('\n')));
		}
		if (plan.instructions) {
			blocks.push(localize('sessionComparison.additionalSynthesisInstructionsPrompt', "\n\n## Additional synthesis instructions\n{0}", plan.instructions));
		}
		return blocks.join('');
	}

	private _getVerdictRecommendation(comparison: ISessionComparison): string {
		const verdict = comparison.verdict;
		if (!verdict) {
			return localize('sessionComparison.noJudgeExplanation', "No Judge explanation is available; use the selected attempt as the base.");
		}
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const winnerIndex = attempts.findIndex(attempt => attempt.id === verdict.recommendedParticipantId);
		const winner = attempts[winnerIndex];
		const winnerLabel = winner
			? getSessionComparisonAttemptLabel(winner, winnerIndex + 1)
			: localize('sessionComparison.unknownWinningAttempt', "Winning attempt");
		if (!verdict.rationale) {
			return `${winnerLabel}\n${verdict.explanation}`;
		}
		return [
			winnerLabel,
			localize('sessionComparison.rationale.comparison', "Comparison: {0}", verdict.rationale.comparison),
			localize('sessionComparison.rationale.validation', "Validation: {0}", verdict.rationale.validation),
			localize('sessionComparison.rationale.codeQuality', "Code quality: {0}", verdict.rationale.codeQuality),
			localize('sessionComparison.rationale.solution', "Solution: {0}", verdict.rationale.solution),
		].join('\n');
	}

	private _getJudgeHarness(comparison: ISessionComparison): ISessionComparisonHarness | undefined {
		return comparison.judgeHarness
			?? comparison.participants.find(participant =>
				participant.role === SessionComparisonParticipantRole.Coordinator)?.harness
			?? comparison.participants.find(participant =>
				participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource)?.harness;
	}

	private _ensureComparisonGroupMembership(comparisons: readonly ISessionComparison[]): void {
		for (const comparison of comparisons) {
			const sessionIds = comparison.participants
				.map(participant => participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource)?.sessionId : undefined)
				.filter(sessionId => sessionId !== undefined);
			this.sessionGroupsService.addToGroup(sessionIds, comparison.groupId);
		}
	}

	private _removeComparisonsWithMissingGroups(): void {
		const comparisons = this._comparisons.get();
		const remaining = comparisons.filter(comparison => this.sessionGroupsService.getGroup(comparison.groupId));
		if (remaining.length === comparisons.length) {
			return;
		}
		this._comparisons.set(remaining, undefined);
		this._save();
	}

	private _migrateLegacyAttemptTitles(comparisons: readonly ISessionComparison[]): void {
		for (const comparison of comparisons) {
			const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
			for (const [index, participant] of attempts.entries()) {
				const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
				if (!session || this._migratingAttemptTitles.has(session.sessionId) || this._migratedAttemptTitles.has(session.sessionId)) {
					continue;
				}
				const title = getSessionComparisonHarnessLabel(participant);
				const legacyTitle = localize('sessionComparison.legacyAttemptTitle', "Attempt {0}: {1}", index + 1, title);
				const permissionTitle = participant.harness.permissionId && participant.harness.permissionId !== 'default' && participant.harness.permissionLabel
					? localize('sessionComparison.harnessAndPermissions', "{0} · {1}", title, participant.harness.permissionLabel)
					: undefined;
				const currentTitle = session.title.get();
				if (currentTitle !== legacyTitle
					&& currentTitle !== permissionTitle
					&& currentTitle !== (permissionTitle ? localize('sessionComparison.legacyAttemptTitle', "Attempt {0}: {1}", index + 1, permissionTitle) : undefined)) {
					continue;
				}
				this._migratingAttemptTitles.add(session.sessionId);
				void this.sessionsManagementService.renameSession(session, title).then(() => {
					this._migratedAttemptTitles.add(session.sessionId);
				}, error => {
					this.logService.warn('[SessionComparisonService] Failed to migrate an attempt title.', error);
				}).finally(() => {
					this._migratingAttemptTitles.delete(session.sessionId);
				});
			}
		}
	}

	private _addComparison(comparison: ISessionComparison): void {
		this._comparisons.set([...this._comparisons.get(), comparison], undefined);
		this._save();
	}

	private _replaceComparison(comparison: ISessionComparison): void {
		this._comparisons.set(this._comparisons.get().map(candidate => candidate.id === comparison.id ? comparison : candidate), undefined);
		this._save();
	}

	private _removeComparison(comparisonId: string): void {
		this._comparisons.set(this._comparisons.get().filter(comparison => comparison.id !== comparisonId), undefined);
		this._save();
	}

	private _load(): readonly ISessionComparison[] {
		const raw = this.storageService.get(SessionComparisonService.STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return [];
		}
		try {
			const stored = parse(raw) as readonly IStoredSessionComparison[];
			return stored.map(comparison => ({
				...comparison,
				workspace: URI.parse(comparison.workspace),
				attachedContext: comparison.attachedContext?.map(IChatRequestVariableEntry.fromExport),
				participants: comparison.participants.map(participant => ({
					...participant,
					sessionResource: participant.sessionResource ? URI.parse(participant.sessionResource) : undefined,
				})),
			}));
		} catch (error) {
			this.logService.error('[SessionComparisonService] Failed to restore comparisons.', error);
			return [];
		}
	}

	private _save(): void {
		const stored: readonly IStoredSessionComparison[] = this._comparisons.get().map(comparison => ({
			...comparison,
			workspace: comparison.workspace.toString(),
			attachedContext: comparison.attachedContext?.map(IChatRequestVariableEntry.toExport),
			participants: comparison.participants.map(participant => ({
				...participant,
				sessionResource: participant.sessionResource?.toString(),
			})),
		}));
		this.storageService.store(SessionComparisonService.STORAGE_KEY, stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
	}

	private _loadAttemptTelemetryState(): void {
		const raw = this.storageService.get(SessionComparisonService.ATTEMPT_TELEMETRY_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}
		try {
			const keys = JSON.parse(raw) as readonly string[];
			for (const key of keys) {
				this._reportedAttemptTelemetry.add(key);
			}
		} catch (error) {
			this.logService.error('[SessionComparisonService] Failed to restore comparison attempt telemetry state.', error);
		}
	}

	private _saveAttemptTelemetryState(): void {
		this.storageService.store(
			SessionComparisonService.ATTEMPT_TELEMETRY_STORAGE_KEY,
			JSON.stringify([...this._reportedAttemptTelemetry]),
			StorageScope.PROFILE,
			StorageTarget.MACHINE,
		);
	}

}

function snapshotAttachedContext(attachedContext: readonly IChatRequestVariableEntry[]): readonly IChatRequestVariableEntry[] {
	const stored = attachedContext.map(IChatRequestVariableEntry.toExport);
	return (parse(stringify(stored)) as IChatRequestVariableEntry[]).map(IChatRequestVariableEntry.fromExport);
}

function comparisonTitle(prompt: string): string {
	const firstLine = prompt.trim().split(/\r?\n/, 1)[0];
	return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
