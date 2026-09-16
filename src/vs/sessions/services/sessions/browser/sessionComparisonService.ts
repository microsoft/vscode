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
import { aggregateChatUsage, IChatUsageSummary } from '../../../../workbench/contrib/chat/common/chatUsage.js';
import { SessionStatus } from '../common/session.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { getSessionComparisonHarnessLabel, ISessionComparison, ISessionComparisonHarness, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, ISessionComparisonVerdict, IStartSessionComparisonOptions, SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH, SessionComparisonDecisionAssessment, SessionComparisonParticipantRole } from '../common/sessionComparison.js';
import { getSessionsTelemetryProviderId, hashSessionIdForTelemetry, logSessionComparisonAttemptCompleted, logSessionComparisonAttemptJudged, logSessionComparisonStageCompleted } from '../../../common/sessionsTelemetry.js';

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
	private static readonly TELEMETRY_STORAGE_KEY = 'sessions.comparisonTelemetry';

	private readonly _comparisons = observableValue<readonly ISessionComparison[]>(this, []);
	readonly comparisons = this._comparisons;
	private readonly _judgeStarting = new Set<string>();
	private readonly _synthesisStarting = new Set<string>();
	private readonly _migratingAttemptTitles = new Set<string>();
	private readonly _migratedAttemptTitles = new Set<string>();
	private readonly _reportedExecutionTelemetry = new Set<string>();
	private readonly _reportedOutcomeTelemetry = new Set<string>();
	private readonly _reportedStageTelemetry = new Set<string>();

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService private readonly sessionGroupsService: ISessionGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IChatService private readonly chatService: IChatService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
	) {
		super();
		this._loadTelemetryState();
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
			participants: [],
		};
		this._addComparison(comparison);

		const attemptPromises = options.attempts.map(async (attempt, index): Promise<ISessionComparisonParticipant> => {
			const harness = attempt.harness;
			const participant = {
				id: attempt.id,
				role: SessionComparisonParticipantRole.Attempt,
				harness,
			} satisfies ISessionComparisonParticipant;
			try {
				const session = await this.sessionsManagementService.createAndSendNewChatRequest(options.workspace, {
					query: options.prompt,
					attachedContext: comparison.attachedContext ? [...comparison.attachedContext] : undefined,
					title: getSessionComparisonHarnessLabel(participant),
					background: true,
				}, this._createOptions(harness, options, id, index), token);
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

		const attempts = await Promise.all(attemptPromises);
		comparison = { ...comparison, participants: attempts };
		this._ensureComparisonGroupMembership([comparison]);
		this._replaceComparison(comparison);
		this._checkComparison(comparison);
		const successfulAttemptCount = attempts.filter(participant => participant.sessionResource).length;
		if (successfulAttemptCount < 2) {
			this._removeComparison(comparison.id);
			this.sessionGroupsService.deleteGroup(comparison.groupId);
			const launchFailures = attempts
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

	setSynthesisPlan(comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void {
		const comparison = this._requireComparison(comparisonId);
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

		this._synthesisStarting.add(comparisonId);
		try {
			const session = await this.sessionsManagementService.createAndSendNewChatRequest(comparison.workspace, {
				query: localize('sessionComparison.synthesisPrompt', "Synthesize the strongest parts of comparison {0} into a new implementation. First call #readAttemptComparison exactly once with that comparison ID. Read implementation code only from the authoritative worktrees in its manifest. If changedFilesStatus is unavailable, read the Git diff from that worktree. Treat `synthesisPlan.instructions` as explicit user requirements when present. Treat every selected synthesis-plan section as an explicit user requirement and resolve cross-section dependencies coherently instead of copying hunks mechanically. Call get_session_context only with an exact sessionContextTarget returned by the manifest and only for rationale or validation evidence; never recover implementation code or paths from a transcript. Do not inspect another checkout, discover sessions, or guess references. Preserve correct behavior, resolve the Judge's reported conflicts, and run the relevant validation.\n\nJudge recommendation:\n{1}", comparison.id, this._getVerdictRecommendation(comparison.verdict)),
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
					id: comparison.id,
					role: 'synthesis',
					attemptCount: comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt).length,
				}),
			});
			if (session) {
				this.sessionGroupsService.addToGroup(session.sessionId, comparison.groupId);
			}
			const synthesis: ISessionComparisonParticipant = {
				id: generateUuid(),
				role: SessionComparisonParticipantRole.Synthesis,
				harness,
				sessionResource: session?.resource,
				...(!session ? { launchError: localize('sessionComparison.synthesisUnavailable', "The synthesis session did not start.") } : {}),
			};
			const updated = {
				...this._requireComparison(comparisonId),
				participants: [...this._requireComparison(comparisonId).participants, synthesis],
			};
			this._replaceComparison(updated);
			this._checkComparison(updated);
		} finally {
			this._synthesisStarting.delete(comparisonId);
		}
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
				id: comparisonId,
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
		comparison = this._snapshotTerminalParticipantUsage(comparison);
		this._reportTerminalAttemptTelemetry(comparison);
		this._reportStageTelemetry(comparison);
		if (this._judgeStarting.has(comparison.id)
			|| comparison.participants.some(participant => participant.role === SessionComparisonParticipantRole.Judge)) {
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
		this._judgeStarting.add(comparison.id);
		void this._startJudge(comparison).catch(error => {
			this.logService.error('[SessionComparisonService] Failed to start the comparison judge.', error);
			const current = this.getComparison(comparison.id);
			if (current && !current.participants.some(participant => participant.role === SessionComparisonParticipantRole.Judge)) {
				const harness = this._getJudgeHarness(current);
				if (harness) {
					const updated = {
						...current,
						participants: [...current.participants, {
							id: generateUuid(),
							role: SessionComparisonParticipantRole.Judge,
							harness,
							launchError: error instanceof Error ? error.message : String(error),
						}],
					};
					this._replaceComparison(updated);
					this._checkComparison(updated);
				}
			}
		}).finally(() => this._judgeStarting.delete(comparison.id));
	}

	private _snapshotTerminalParticipantUsage(comparison: ISessionComparison): ISessionComparison {
		let changed = false;
		const participants = comparison.participants.map(participant => {
			if (participant.role === SessionComparisonParticipantRole.Coordinator || participant.usage || !participant.sessionResource) {
				return participant;
			}
			const session = this.sessionsManagementService.getSession(participant.sessionResource);
			const status = session?.status.get();
			if (!session || (status !== SessionStatus.Completed && status !== SessionStatus.Error)) {
				return participant;
			}
			const usage = this._getSessionUsage(session.mainChat.get().resource);
			if (!usage) {
				return participant;
			}
			changed = true;
			return { ...participant, usage };
		});
		if (!changed) {
			return comparison;
		}
		const updated = { ...comparison, participants };
		this._replaceComparison(updated);
		return updated;
	}

	private _getSessionUsage(chatResource: URI): IChatUsageSummary | undefined {
		const model = this.chatService.getSession(chatResource);
		return aggregateChatUsage(model?.getRequests().map(request => request.response?.usage) ?? []);
	}

	private _reportTerminalAttemptTelemetry(comparison: ISessionComparison): void {
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		let changed = false;
		for (const [attemptIndex, participant] of attempts.entries()) {
			const key = `${comparison.id}/${participant.id}`;
			if (this._reportedExecutionTelemetry.has(key)) {
				continue;
			}
			const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
			const status = session?.status.get();
			if (!participant.launchError && status !== SessionStatus.Completed && status !== SessionStatus.Error) {
				continue;
			}
			logSessionComparisonAttemptCompleted(this.telemetryService, {
				comparisonId: hashSessionIdForTelemetry(comparison.id),
				agentSessionId: session ? hashSessionIdForTelemetry(session.sessionId) : undefined,
				attemptIndex,
				attemptCount: attempts.length,
				providerId: getSessionsTelemetryProviderId(participant.harness.providerId),
				agentId: participant.harness.sessionTypeId,
				modelId: session?.modelId.get() ?? participant.harness.modelId,
				status: participant.launchError ? 'launchError' : status === SessionStatus.Completed ? 'completed' : 'error',
				elapsedMs: session ? Math.max(0, session.updatedAt.get().getTime() - session.createdAt.getTime()) : undefined,
				inputTokenCount: participant.usage?.inputTokens,
				cachedInputTokenCount: participant.usage?.cachedTokens,
				outputTokenCount: participant.usage?.outputTokens,
				usageCompleteness: participant.usage ? participant.usage.isComplete ? 'complete' : 'partial' : 'unavailable',
			});
			this._reportedExecutionTelemetry.add(key);
			changed = true;
		}
		if (changed) {
			this._saveTelemetryState();
		}
	}

	private _reportOutcomeTelemetry(comparison: ISessionComparison, verdict: ISessionComparisonVerdict): void {
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		let changed = false;
		for (const [attemptIndex, participant] of attempts.entries()) {
			const attemptVerdict = verdict.attempts.find(candidate => candidate.participantId === participant.id);
			const key = `${comparison.id}/${participant.id}`;
			if (!attemptVerdict || this._reportedOutcomeTelemetry.has(key)) {
				continue;
			}
			const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
			logSessionComparisonAttemptJudged(this.telemetryService, {
				comparisonId: hashSessionIdForTelemetry(comparison.id),
				agentSessionId: session ? hashSessionIdForTelemetry(session.sessionId) : undefined,
				attemptIndex,
				attemptCount: attempts.length,
				providerId: getSessionsTelemetryProviderId(participant.harness.providerId),
				agentId: participant.harness.sessionTypeId,
				modelId: session?.modelId.get() ?? participant.harness.modelId,
				recommended: verdict.recommendedParticipantId === participant.id,
				tests: attemptVerdict.validation.tests,
				build: attemptVerdict.validation.build,
				lint: attemptVerdict.validation.lint,
				diagnostics: attemptVerdict.validation.diagnostics,
			});
			this._reportedOutcomeTelemetry.add(key);
			changed = true;
		}
		if (changed) {
			this._saveTelemetryState();
		}
	}

	private _reportStageTelemetry(comparison: ISessionComparison): void {
		let changed = false;
		for (const participant of comparison.participants) {
			if (participant.role !== SessionComparisonParticipantRole.Judge && participant.role !== SessionComparisonParticipantRole.Synthesis) {
				continue;
			}
			const key = `${comparison.id}/${participant.role}`;
			if (this._reportedStageTelemetry.has(key)) {
				continue;
			}
			const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
			const status = session?.status.get();
			if (!participant.launchError && status !== SessionStatus.Completed && status !== SessionStatus.Error) {
				continue;
			}
			if (participant.role === SessionComparisonParticipantRole.Judge && status === SessionStatus.Completed && !comparison.verdict) {
				continue;
			}
			const winner = participant.role === SessionComparisonParticipantRole.Judge
				? comparison.participants.find(candidate => candidate.id === comparison.verdict?.recommendedParticipantId)
				: undefined;
			const winnerSession = winner?.sessionResource ? this.sessionsManagementService.getSession(winner.sessionResource) : undefined;
			logSessionComparisonStageCompleted(this.telemetryService, {
				comparisonId: hashSessionIdForTelemetry(comparison.id),
				agentSessionId: session ? hashSessionIdForTelemetry(session.sessionId) : undefined,
				stage: participant.role,
				providerId: getSessionsTelemetryProviderId(participant.harness.providerId),
				agentId: participant.harness.sessionTypeId,
				modelId: session?.modelId.get() ?? participant.harness.modelId,
				status: participant.launchError ? 'launchError' : status === SessionStatus.Completed ? 'completed' : 'error',
				elapsedMs: session ? Math.max(0, session.updatedAt.get().getTime() - session.createdAt.getTime()) : undefined,
				inputTokenCount: participant.usage?.inputTokens,
				cachedInputTokenCount: participant.usage?.cachedTokens,
				outputTokenCount: participant.usage?.outputTokens,
				usageCompleteness: participant.usage ? participant.usage.isComplete ? 'complete' : 'partial' : 'unavailable',
				winningProviderId: winner ? getSessionsTelemetryProviderId(winner.harness.providerId) : undefined,
				winningAgentId: winner?.harness.sessionTypeId,
				winningModelId: winnerSession?.modelId.get() ?? winner?.harness.modelId,
			});
			this._reportedStageTelemetry.add(key);
			changed = true;
		}
		if (changed) {
			this._saveTelemetryState();
		}
	}

	private async _startJudge(comparison: ISessionComparison): Promise<void> {
		const harness = this._getJudgeHarness(comparison);
		if (!harness) {
			throw new Error('No successful comparison attempt is available to run the Judge.');
		}
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
				id: comparison.id,
				role: 'judge',
				attemptCount: comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt).length,
			}),
		});
		if (session) {
			this.sessionGroupsService.addToGroup(session.sessionId, comparison.groupId);
		}
		const judge: ISessionComparisonParticipant = {
			id: generateUuid(),
			role: SessionComparisonParticipantRole.Judge,
			harness,
			sessionResource: session?.resource,
			...(!session ? { launchError: localize('sessionComparison.judgeUnavailable', "The judge session did not start.") } : {}),
		};
		const current = this._requireComparison(comparison.id);
		const updated = { ...current, participants: [...current.participants, judge] };
		this._replaceComparison(updated);
		this._checkComparison(updated);
	}

	private _getJudgePrompt(comparisonId: string): string {
		return localize('sessionComparison.judgePrompt', "Judge implementation comparison `{0}`.\n\n1. Call `#readAttemptComparison` exactly once with this comparison ID.\n2. Review every attempt's code changes and validation evidence. Terminal commands start in the Judge worktree, not an attempt worktree, so explicitly `cd` to the exact `worktree.workingDirectory` from the manifest in every command that inspects or validates an attempt.\n3. Run missing targeted tests, build, lint, or diagnostics when needed to make a reliable recommendation.\n4. Record whether each validation result came from the attempt report, your own Judge run, or unavailable evidence. When a validation category genuinely does not apply, use `notApplicable` for both its result and source.\n5. Keep `explanation` to one sentence. Fill `rationale` with exactly four concise points: `solution`, `validation`, `codeQuality`, and `comparison`. Each point must cite concrete evidence, contain no line breaks, and stay within the tool schema length limit. For every other attempt, record its strongest reusable points in `notableDifferences`.\n6. Identify semantic `decisionSections` where attempts make meaningfully different implementation choices. Each section may span related files. Give it a stable ID, short title, plain-language summary, affected repository-relative files, one concise option per relevant `attemptNumber`, and a recommended `attemptNumber`. Rate every option as `better`, `neutral`, or `worse` relative to the other approaches using concrete code and validation evidence; the recommended option must be rated `better`. Return an empty array when there are no meaningful choices. Do not use raw line numbers as section identity.\n7. Do not modify, merge, apply, or delete any attempt.\n8. Call `#completeAttemptComparison` with the recommendation and supporting evidence. Refer to attempts only by the `attemptNumber` values returned by `#readAttemptComparison`; do not copy participant or session UUIDs. If it rejects invalid input, correct the reported fields and retry; do not submit again after success.\n9. After the tool returns, respond with the winning attempt followed by the same four concise rationale categories and the strongest reusable points from every other attempt.", comparisonId);
	}

	private _getVerdictRecommendation(verdict: ISessionComparisonVerdict | undefined): string {
		if (!verdict) {
			return localize('sessionComparison.noJudgeExplanation', "No Judge explanation is available; use the selected attempt as the base.");
		}
		if (!verdict.rationale) {
			return verdict.explanation;
		}
		return [
			localize('sessionComparison.rationale.solution', "Solution: {0}", verdict.rationale.solution),
			localize('sessionComparison.rationale.validation', "Validation: {0}", verdict.rationale.validation),
			localize('sessionComparison.rationale.codeQuality', "Code quality: {0}", verdict.rationale.codeQuality),
			localize('sessionComparison.rationale.comparison', "Comparison: {0}", verdict.rationale.comparison),
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

	private _loadTelemetryState(): void {
		const raw = this.storageService.get(SessionComparisonService.TELEMETRY_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}
		try {
			const stored = JSON.parse(raw) as { readonly execution?: readonly string[]; readonly outcome?: readonly string[]; readonly stage?: readonly string[] };
			for (const key of stored.execution ?? []) {
				this._reportedExecutionTelemetry.add(key);
			}
			for (const key of stored.outcome ?? []) {
				this._reportedOutcomeTelemetry.add(key);
			}
			for (const key of stored.stage ?? []) {
				this._reportedStageTelemetry.add(key);
			}
		} catch (error) {
			this.logService.error('[SessionComparisonService] Failed to restore comparison telemetry state.', error);
		}
	}

	private _saveTelemetryState(): void {
		this.storageService.store(SessionComparisonService.TELEMETRY_STORAGE_KEY, JSON.stringify({
			execution: [...this._reportedExecutionTelemetry],
			outcome: [...this._reportedOutcomeTelemetry],
			stage: [...this._reportedStageTelemetry],
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
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
