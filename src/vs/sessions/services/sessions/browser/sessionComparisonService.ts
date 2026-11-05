/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RunOnceScheduler, timeout } from '../../../../base/common/async.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore } from '../../../../base/common/lifecycle.js';
import { parse, stringify } from '../../../../base/common/marshalling.js';
import { autorun, observableSignalFromEvent, observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { withSessionComparisonMetadata } from '../../../../platform/agentHost/common/state/sessionState.js';
import { createSessionComparisonJudgePrompt } from '../../../../platform/agentHost/common/sessionComparisonPrompts.js';
import { localize } from '../../../../nls.js';
import { IChatRequestVariableEntry } from '../../../../workbench/contrib/chat/common/attachments/chatVariableEntries.js';
import { IChatModelReference, IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { aggregateChatUsage } from '../../../../workbench/contrib/chat/common/chatUsage.js';
import { setChatNotificationResource } from '../../../../workbench/contrib/chat/common/chatNotification.js';
import { ChatInteractivity, ChatOriginKind, isActiveSessionStatus, ISession, SessionStatus } from '../common/session.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { ICreateNewSessionOptions, ISendRequestOptions, ISessionsChangeEvent, ISessionsManagementService } from '../common/sessionsManagement.js';
import { getBoundedSessionComparisonManifestText, getSessionComparisonAttemptLabel, getSessionComparisonChat, getSessionComparisonHarnessLabel, ISessionComparison, ISessionComparisonHarness, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, ISessionComparisonVerdict, IStartSessionComparisonOptions, SESSION_COMPARISON_MANIFEST_LIST_MAX_ITEMS, SESSION_COMPARISON_MAX_ATTEMPTS, SESSION_COMPARISON_SYNTHESIS_INSTRUCTIONS_MAX_LENGTH, SessionComparisonLaunchError, SessionComparisonParticipantRole } from '../common/sessionComparison.js';
import { getSessionsTelemetryAgentId, getSessionsTelemetryModelId, getSessionsTelemetryProviderId, hashSessionIdForTelemetry, logSessionComparisonAttemptCompleted, logSessionComparisonModelOutcome } from '../../../common/sessionsTelemetry.js';

interface IStoredSessionComparisonParticipant extends Omit<ISessionComparisonParticipant, 'sessionResource' | 'chatResource'> {
	readonly sessionResource?: string;
	readonly chatResource?: string;
}

interface IStoredSessionComparison extends Omit<ISessionComparison, 'workspace' | 'sessionResource' | 'attachedContext' | 'participants'> {
	readonly version?: number;
	readonly workspace?: string;
	readonly sessionResource?: string;
	readonly attachedContext?: readonly IChatRequestVariableEntry[];
	readonly participants: readonly IStoredSessionComparisonParticipant[];
}

function getAttemptUnavailableMessage(): string {
	return localize('sessionComparison.attemptMissing', "The attempt session is no longer available.");
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
	private readonly _comparisonIdsBySession = new Map<string, Set<string>>();
	private readonly _movedParticipantModels = this._register(new DisposableMap<string, IChatModelReference>());
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
		for (const comparison of comparisons) {
			this._indexComparisonSessions(comparison);
		}
		this._archiveComparisonsWithMissingGroups();
		this._pruneAttemptTelemetryState(new Set(this._comparisons.get()
			.filter(comparison => comparison.archivedAt === undefined)
			.map(comparison => comparison.id)));
		this._ensureComparisonGroupMembership(this._comparisons.get());
		this._migrateLegacyAttemptTitles(this._comparisons.get());
		this._register(this.sessionsManagementService.onDidChangeSessions(event => {
			const comparisons = this._getComparisonsForSessionChanges(event);
			const reconciled = comparisons.map(comparison => this._reconcileSessionAvailability(comparison, event));
			this._archiveFullyArchivedComparisons(reconciled);
			const activeComparisons = reconciled.filter(comparison => this.getComparison(comparison.id)?.archivedAt === undefined);
			this._ensureComparisonGroupMembership(activeComparisons);
			this._migrateLegacyAttemptTitles(activeComparisons);
			this._checkComparisons(activeComparisons);
		}));
		this._register(this.sessionsManagementService.onDidArchiveSession(session => {
			this._archiveFullyArchivedComparisons(this._getComparisonsForSession(session.resource));
		}));
		this._register(this.sessionsManagementService.onDidDeleteSession(session => this._markParticipantDeleted(session)));
		this._register(this.sessionsManagementService.onDidDeleteChat(event => this._markParticipantDeleted(event.session, event.chatResource)));
		this._register(this.sessionsManagementService.onDidMoveChat(({ from, to }) => {
			for (const comparison of this._getComparisonsForSession(from.session.resource)) {
				const participants = comparison.participants.map(participant => {
					if (!isEqual(participant.sessionResource, from.session.resource)
						|| !isEqual(participant.chatResource ?? from.session.mainChat.get().resource, from.chat)) {
						return participant;
					}
					this._retainMovedParticipantModel(comparison, participant, from.chat, to.chat);
					return { ...participant, sessionResource: to.session.resource, chatResource: to.chat, missingSession: undefined, launchError: undefined };
				});
				if (participants.some((participant, index) => participant !== comparison.participants[index])) {
					this._replaceComparison({ ...comparison, participants });
				}
			}
		}));
		this._register(this.sessionGroupsService.onDidChange(event => {
			if (event.groupsChanged) {
				this._archiveComparisonsWithMissingGroups();
			}
		}));
		const checkComparisons = this._register(new RunOnceScheduler(() => this._checkComparisons(this._comparisons.get()), 0));
		const sessionsChanged = observableSignalFromEvent(this, Event.filter(this.sessionsManagementService.onDidChangeSessions,
			event => [...event.added, ...event.removed, ...event.changed].some(session => this._comparisonIdsBySession.has(session.resource.toString()))));
		this._register(autorun(reader => {
			sessionsChanged.read(reader);
			for (const comparison of this._comparisons.read(reader)) {
				if (comparison.archivedAt !== undefined || comparison.cancelledAt !== undefined) {
					continue;
				}
				for (const participant of comparison.participants) {
					const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
					getSessionComparisonChat(participant, session, reader)?.status.read(reader);
				}
			}
			checkComparisons.schedule();
		}));
		this._checkComparisons(this._comparisons.get());
	}

	async startComparison(options: IStartSessionComparisonOptions, token: CancellationToken = CancellationToken.None): Promise<ISessionComparison> {
		if (options.attempts.length < 2 || options.attempts.length > SESSION_COMPARISON_MAX_ATTEMPTS) {
			throw new Error('A session comparison requires between two and ten attempts.');
		}
		if (options.synthesisHarness && !options.judgeHarness) {
			throw new Error('A synthesis model requires a Judge model.');
		}
		if (!options.workspace && (options.judgeHarness || options.synthesisHarness)) {
			throw new Error('Folderless comparisons do not support a Judge or Synthesizer.');
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
			launching: true,
			attachedContext,
			branch: options.workspace ? options.branch : undefined,
			permissionLevel: options.permissionLevel,
			judgeHarness: options.judgeHarness,
			synthesisHarness: options.synthesisHarness,
			participants: attempts,
		};
		this._addComparison(comparison);

		const attemptPromises = attempts.map(async (participant, index): Promise<ISessionComparisonParticipant> => {
			await timeout(0);
			const harness = participant.harness;
			try {
				const session = await this._createAndSendRequest(options.workspace, {
					query: options.prompt,
					attachedContext: comparison.attachedContext ? [...comparison.attachedContext] : undefined,
					title: getSessionComparisonHarnessLabel(participant),
					background: true,
				}, {
					...this._createOptions(harness, options, id, index),
					onSessionCreated: createdSession => {
						const updated = this._updateComparisonParticipant(id, participant.id, currentParticipant => ({
							...currentParticipant,
							sessionResource: createdSession.resource,
							chatResource: createdSession.mainChat.get().resource,
							launchError: undefined,
						}));
						this._groupCreatedSession(updated, createdSession);
					},
				}, token);
				return {
					...participant,
					sessionResource: session?.resource,
					chatResource: session?.mainChat.get().resource,
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
		const successfulAttemptCount = launchedAttempts.filter(participant => participant.sessionResource).length;
		if (successfulAttemptCount < 2) {
			this._removeComparison(comparison.id);
			this.sessionGroupsService.deleteGroup(comparison.groupId);
			const launchFailures = launchedAttempts
				.filter(participant => participant.launchError)
				.map(participant => `${getSessionComparisonHarnessLabel(participant)}: ${participant.launchError}`)
				.join('; ');
			throw new SessionComparisonLaunchError(localize(
				'sessionComparison.insufficientSuccessfulAttempts',
				"Only {0} of {1} comparison attempts started. At least two must start successfully. Failed attempts: {2}",
				successfulAttemptCount,
				attempts.length,
				launchFailures
			), launchedAttempts);
		}
		const launchedSessions = launchedAttempts.flatMap(participant => {
			const session = participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource) : undefined;
			return session ? [session] : [];
		});
		await this._nestComparisonParticipants(comparison, launchedSessions);
		comparison = { ...this._requireComparison(comparison.id), launching: undefined };
		this._replaceComparison(comparison);
		this._archiveFullyArchivedComparisons([comparison]);
		const reconciled = this.getComparison(comparison.id) ?? comparison;
		if (reconciled.archivedAt === undefined) {
			this._checkComparison(reconciled);
		}
		return reconciled;
	}

	getComparison(comparisonId: string): ISessionComparison | undefined {
		return this._comparisons.get().find(comparison => comparison.id === comparisonId);
	}

	getComparisonForSession(resource: URI): ISessionComparison | undefined {
		const comparisons = this._getComparisonsForSession(resource);
		return comparisons.find(comparison => isEqual(comparison.sessionResource, resource)) ?? comparisons[0];
	}

	getParticipantForChat(comparisonId: string, resource: URI): ISessionComparisonParticipant | undefined {
		return this.getComparison(comparisonId)?.participants.find(participant => {
			if (!participant.sessionResource || participant.launchError) {
				return false;
			}
			if (isEqual(participant.chatResource ?? participant.sessionResource, resource)) {
				return true;
			}
			const model = this._movedParticipantModels.get(`${comparisonId}/${participant.id}`)?.object;
			return !!model?.requestInProgress.get() && isEqual(model.sessionResource, resource);
		});
	}

	private _getComparisonsForSession(resource: URI): ISessionComparison[] {
		return [...this._comparisonIdsBySession.get(resource.toString()) ?? []].flatMap(id => {
			const comparison = this.getComparison(id);
			return comparison ? [comparison] : [];
		});
	}

	private _retainMovedParticipantModel(comparison: ISessionComparison, participant: ISessionComparisonParticipant, resource: URI, destination: URI): void {
		const key = `${comparison.id}/${participant.id}`;
		const retained = this._movedParticipantModels.get(key);
		if (retained) {
			setChatNotificationResource(retained.object, destination);
			return;
		}
		if (comparison.archivedAt !== undefined) {
			return;
		}
		const model = this.chatService.acquireExistingSession(resource, 'sessionComparison');
		if (!model) {
			return;
		}
		setChatNotificationResource(model.object, destination);
		// The original model still owns the live response and tool context. Release it once both
		// the response and catalog settle, after capturing metrics, even if no grid was opened.
		const lifetime = new DisposableStore();
		this._movedParticipantModels.set(key, Object.assign(lifetime, { object: lifetime.add(model).object }));
		lifetime.add(autorun(reader => {
			if (model.object.requestInProgress.read(reader)) {
				return;
			}
			const current = this._comparisons.read(reader).find(candidate => candidate.id === comparison.id);
			const currentParticipant = current?.participants.find(candidate => candidate.id === participant.id);
			if (currentParticipant === participant) {
				return;
			}
			const session = currentParticipant?.sessionResource ? this.sessionsManagementService.getSession(currentParticipant.sessionResource) : undefined;
			const status = currentParticipant && getSessionComparisonChat(currentParticipant, session)?.status.read(reader);
			if (current && (status === SessionStatus.Completed || status === SessionStatus.Error)) {
				if (participant.role === SessionComparisonParticipantRole.Attempt) {
					this._captureTerminalAttemptMetrics(current);
				}
				this._movedParticipantModels.deleteAndDispose(key);
			}
		}));
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

	archiveComparison(comparisonId: string): void {
		const comparison = this._requireComparison(comparisonId);
		if (comparison.archivedAt !== undefined) {
			return;
		}
		this._replaceComparison({
			...comparison,
			archivedAt: Date.now(),
		});
		this._pruneAttemptTelemetryState(new Set(this._comparisons.get()
			.filter(candidate => candidate.archivedAt === undefined)
			.map(candidate => candidate.id)));
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
		const updated = { ...comparison, verdict, synthesisPlan: undefined };
		this._replaceComparison(updated);
		this._reportOutcomeTelemetry(comparison, verdict);
		this._checkComparison(updated);
	}

	canRetryJudge(comparisonId: string): boolean {
		const comparison = this.getComparison(comparisonId);
		return !!comparison
			&& !!comparison.judgeHarness
			&& comparison.cancelledAt === undefined
			&& comparison.archivedAt === undefined
			&& !this._judgeStarting.has(comparisonId)
			&& comparison.participants.some(participant =>
				participant.role === SessionComparisonParticipantRole.Judge && !participant.sessionResource);
	}

	retryJudge(comparisonId: string): void {
		if (!this.canRetryJudge(comparisonId)) {
			return;
		}
		const comparison = this._requireComparison(comparisonId);
		const failedJudgeIds = comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Judge && !participant.sessionResource)
			.map(participant => participant.id);
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
		this._replaceComparison({ ...comparison, synthesisPlan: { instructions: plan.instructions } });
	}

	async synthesize(comparisonId: string): Promise<void> {
		if (this._synthesisStarting.has(comparisonId)) {
			return;
		}
		const comparison = this._requireComparison(comparisonId);
		if (comparison.cancelledAt !== undefined) {
			throw new Error(`Comparison '${comparisonId}' was cancelled.`);
		}
		if (comparison.archivedAt !== undefined) {
			throw new Error(`Comparison '${comparisonId}' was archived.`);
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
		const harness = comparison.synthesisHarness;
		if (!harness || !comparison.verdict) {
			throw new Error('A configured synthesis model and a Judge verdict are required before synthesis.');
		}
		const synthesisParticipantId = generateUuid();

		this._synthesisStarting.add(comparisonId);
		try {
			const otherAttemptStrengthsPrompt = this._getOtherAttemptStrengthsPrompt(comparison);
			const synthesisPlanPrompt = this._getSynthesisPlanPrompt(comparison);
			const session = await this._createAndSendRequest(comparison.workspace, {
				query: localize('sessionComparison.synthesisPrompt', "Synthesize the strongest parts of comparison `{0}` into a new implementation.\n\n## Process\n1. Call `#readAttemptComparison` exactly once with this comparison ID.\n2. Read implementation code only from the authoritative worktrees in the manifest. If `changedFilesStatus` is unavailable, read the Git diff from that worktree.\n3. Treat additional instructions below and in the manifest as explicit user requirements. Reconcile the strongest approaches coherently instead of copying hunks mechanically.\n4. When provided, consider the strong points from other attempts below and incorporate them when they improve the solution without conflicting with user requirements.\n5. Call `get_session_context` only with an exact `sessionContextTarget` returned by the manifest and only for rationale or validation evidence. Never recover implementation code or paths from a transcript.\n6. Do not inspect another checkout, discover sessions, or guess references. Preserve correct behavior and resolve the Judge's reported conflicts.\n\n## Judge recommendation\n{1}{2}{3}\n\n## Completion\n- Run the relevant validation.\n- Respond concisely with **Changes**, **Validation**, and **Remaining issues** sections using bullet points.", comparison.id, this._getVerdictRecommendation(comparison), otherAttemptStrengthsPrompt, synthesisPlanPrompt),
				attachedContext: comparison.attachedContext?.slice(),
				title: localize('sessionComparison.synthesisTitle', "Synthesis: {0}", comparison.title),
				background: true,
			}, {
				providerId: harness.providerId,
				sessionTypeId: harness.sessionTypeId,
				modelId: harness.modelId,
				modelConfiguration: harness.modelConfiguration,
				...this._permissionOptions(harness, comparison.permissionLevel),
				isolationMode: comparison.workspace ? 'worktree' : undefined,
				branch: comparison.branch,
				metadata: withSessionComparisonMetadata(undefined, {
					id: hashSessionIdForTelemetry(comparison.id),
					role: 'synthesis',
					attemptCount: comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt).length,
				}),
				onSessionCreated: createdSession => {
					const current = this.getComparison(comparisonId);
					if (!current || current.archivedAt !== undefined) {
						return;
					}
					const synthesis: ISessionComparisonParticipant = {
						id: synthesisParticipantId,
						role: SessionComparisonParticipantRole.Synthesis,
						harness,
						sessionResource: createdSession.resource,
						chatResource: createdSession.mainChat.get().resource,
					};
					const updated = { ...current, participants: [...current.participants, synthesis] };
					this._replaceComparison(updated);
					this._groupCreatedSession(updated, createdSession);
				},
			});
			const current = this.getComparison(comparisonId);
			if (!current || current.archivedAt !== undefined) {
				if (current?.participants.some(participant => participant.id === synthesisParticipantId)) {
					this._replaceComparison({
						...current,
						participants: current.participants.filter(participant => participant.id !== synthesisParticipantId),
					});
				}
				if (session) {
					await this._cancelAndDeleteSessions([session], 'orphaned synthesis cleanup');
				}
				return;
			}
			if (session && !current.sessionResource) {
				this.sessionGroupsService.addToGroup(session.sessionId, current.groupId);
			}
			const synthesis: ISessionComparisonParticipant = {
				id: synthesisParticipantId,
				role: SessionComparisonParticipantRole.Synthesis,
				harness,
				sessionResource: session?.resource,
				chatResource: session?.mainChat.get().resource,
				...(!session ? { launchError: localize('sessionComparison.synthesisUnavailable', "The synthesis session did not start.") } : {}),
			};
			const registered = current.participants.some(participant => participant.id === synthesisParticipantId);
			const updated = {
				...current,
				participants: registered
					? current.participants.map(participant => participant.id === synthesisParticipantId ? synthesis : participant)
					: [...current.participants, synthesis],
			};
			this._replaceComparison(updated);
			await this._nestComparisonParticipants(updated, session ? [session] : []);
			await this._cleanupOrphanedEvaluator(comparisonId, synthesisParticipantId, session);
			this._checkComparison(this._requireComparison(comparisonId));
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

	private _groupCreatedSession(comparison: ISessionComparison | undefined, session: ISession): void {
		if (comparison && !comparison.sessionResource && comparison.archivedAt === undefined) {
			this.sessionGroupsService.addToGroup(session.sessionId, comparison.groupId);
		}
	}

	private async _nestComparisonParticipants(comparison: ISessionComparison, sessionsToNest: readonly ISession[]): Promise<void> {
		if (!sessionsToNest.length || (!comparison.launching && !comparison.sessionResource) || comparison.cancelledAt !== undefined || comparison.archivedAt !== undefined) {
			return;
		}
		const parentResource = comparison.sessionResource ?? sessionsToNest[0].resource;
		const parent = parentResource && this.sessionsManagementService.getSession(parentResource);
		const sessions = sessionsToNest.filter(session => !isEqual(session.resource, parentResource));
		if (!parent || parent.isArchived.get()) {
			return;
		}
		const capabilities = parent.capabilities.get();
		const canNest = capabilities.supportsMultipleChats
			&& sessions.every(session => session.providerId === parent.providerId
				&& (session.harness === parent.harness || capabilities.supportsChatHarnesses?.includes(session.harness))
				&& this.sessionsManagementService.canMoveSessionUnder(session));
		if (!canNest && !comparison.sessionResource) {
			return;
		}
		try {
			if (!canNest) {
				throw new Error('The comparison participant cannot join its parent session.');
			}
			for (const session of sessions) {
				const anchor = parent.chats.get().findLast(chat => chat.origin?.kind !== ChatOriginKind.Tool && chat.interactivity.get() !== ChatInteractivity.Hidden);
				await this.sessionsManagementService.moveSessionUnder(session, parent, anchor);
			}
			if (this._requireComparison(comparison.id).archivedAt !== undefined || this._requireComparison(comparison.id).cancelledAt !== undefined) {
				return;
			}
			if (!comparison.sessionResource) {
				await this.sessionsManagementService.renameSession(parent, comparison.title);
			}
			const current = this._requireComparison(comparison.id);
			if (current.archivedAt !== undefined || current.cancelledAt !== undefined) {
				return;
			}
			this._replaceComparison({ ...current, sessionResource: parent.resource });
			this.sessionGroupsService.deleteGroup(current.groupId, { automatic: true });
		} catch (error) {
			this.logService.warn('[SessionComparisonService] Could not nest comparison participants; retaining their sessions.', error);
			const current = this._requireComparison(comparison.id);
			if (current.archivedAt !== undefined || current.cancelledAt !== undefined) {
				return;
			}
			if (current.sessionResource) {
				const group = this.sessionGroupsService.createGroup(current.title);
				this._replaceComparison({ ...current, sessionResource: undefined, groupId: group.id });
			}
			this._ensureComparisonGroupMembership([this._requireComparison(comparison.id)]);
		}
	}

	private _createAndSendRequest(workspace: URI | undefined, options: ISendRequestOptions, createOptions: ICreateNewSessionOptions, token?: CancellationToken): Promise<ISession | undefined> {
		return workspace
			? this.sessionsManagementService.createAndSendNewChatRequest(workspace, options, createOptions, token)
			: this.sessionsManagementService.createAndSendQuickChatRequest(options, createOptions, token);
	}

	private _createOptions(harness: ISessionComparisonHarness, options: IStartSessionComparisonOptions, comparisonId: string, attemptIndex: number) {
		return {
			providerId: harness.providerId,
			sessionTypeId: harness.sessionTypeId,
			modelId: harness.modelId,
			modelConfiguration: harness.modelConfiguration,
			...this._permissionOptions(harness, options.permissionLevel),
			isolationMode: options.workspace ? 'worktree' : undefined,
			branch: options.workspace ? options.branch : undefined,
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
			return {
				...(harness.modeId ? { modeId: harness.modeId } : {}),
				permissionId: harness.permissionId,
			};
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

	private _checkComparisons(comparisons: readonly ISessionComparison[]): void {
		for (const comparison of comparisons) {
			this._checkComparison(comparison);
		}
	}

	private _checkComparison(comparison: ISessionComparison): void {
		if (comparison.launching || comparison.cancelledAt !== undefined || comparison.archivedAt !== undefined) {
			return;
		}
		comparison = this._captureTerminalAttemptMetrics(comparison);
		if (this._judgeStarting.has(comparison.id)
			|| comparison.participants.some(participant => participant.role === SessionComparisonParticipantRole.Judge)) {
			return;
		}
		const harness = this._getJudgeHarness(comparison);
		if (!harness) {
			return;
		}
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		let terminalAttemptCount = 0;
		let completedAttemptCount = 0;
		for (const participant of attempts) {
			// A session missing from the catalog may return once its provider reconnects; only confirmed deletion is terminal.
			if (participant.missingSession) {
				return;
			}
			if (participant.launchError) {
				continue;
			}
			if (!participant.sessionResource) {
				return;
			}
			const session = this.sessionsManagementService.getSession(participant.sessionResource);
			if (!session) {
				return;
			}
			const status = getSessionComparisonChat(participant, session)?.status.get();
			if (status === SessionStatus.Completed) {
				terminalAttemptCount++;
				completedAttemptCount++;
				continue;
			}
			if (status === SessionStatus.Error) {
				terminalAttemptCount++;
				continue;
			}
			return;
		}
		// The Judge reviews failed attempts too, but needs at least one finished attempt to recommend.
		if (terminalAttemptCount < 2 || completedAttemptCount === 0) {
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
				// A draft published through onSessionCreated is deleted when configuration or send fails.
				sessionResource: participant.sessionResource && this.sessionsManagementService.getSession(participant.sessionResource)
					? participant.sessionResource
					: undefined,
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
			const chat = getSessionComparisonChat(participant, session);
			const status = chat?.status.get();
			if (!chat || (status !== SessionStatus.Completed && status !== SessionStatus.Error)) {
				continue;
			}
			const model = this._movedParticipantModels.get(`${comparison.id}/${participant.id}`)?.object
				?? this.chatService.getSession(chat.resource);
			const requests = model?.getRequests() ?? [];
			const firstTurnElapsedMs = requests[0]?.response?.elapsedMs;
			const storedElapsedMs = participant.completion?.elapsedMs;
			const elapsedMs = typeof firstTurnElapsedMs === 'number' && Number.isFinite(firstTurnElapsedMs) && firstTurnElapsedMs >= 0
				? firstTurnElapsedMs
				: typeof storedElapsedMs === 'number' && storedElapsedMs > 0 ? storedElapsedMs : undefined;
			const usage = aggregateChatUsage(requests.map(request => request.response?.usage));
			const completion = {
				elapsedMs,
				tokenCount: usage ? usage.inputTokens + usage.outputTokens : participant.completion?.tokenCount,
				tokenCountIsComplete: usage?.isComplete ?? participant.completion?.tokenCountIsComplete,
			};
			completions.set(participant.id, completion);
			if (participant.completion?.elapsedMs !== completion.elapsedMs
				|| participant.completion?.tokenCount !== completion.tokenCount
				|| participant.completion?.tokenCountIsComplete !== completion.tokenCountIsComplete) {
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
				return completion && (participant.completion?.elapsedMs !== completion.elapsedMs
					|| participant.completion?.tokenCount !== completion.tokenCount
					|| participant.completion?.tokenCountIsComplete !== completion.tokenCountIsComplete)
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
				agentId: getSessionsTelemetryAgentId(participant.harness.sessionTypeId),
				modelId: getSessionsTelemetryModelId(participant.harness.sessionTypeId, getSessionComparisonChat(participant, session)?.modelId.get() ?? participant.harness.modelId),
				recommended: verdict.recommendedParticipantId === participant.id,
				judgeProviderId: getSessionsTelemetryProviderId(judge.harness.providerId),
				judgeAgentId: getSessionsTelemetryAgentId(judge.harness.sessionTypeId),
				judgeModelId: getSessionsTelemetryModelId(judge.harness.sessionTypeId, getSessionComparisonChat(judge, judgeSession)?.modelId.get() ?? judge.harness.modelId),
			});
		}
	}

	restoreComparison(comparisonId: string): string {
		const comparison = this._requireComparison(comparisonId);
		const group = this.sessionGroupsService.getGroup(comparison.groupId) ?? this.sessionGroupsService.createGroup(comparison.title);
		this._replaceComparison({ ...comparison, groupId: group.id, archivedAt: undefined });
		return group.id;
	}

	private async _startJudge(comparison: ISessionComparison, judgeParticipantId: string): Promise<void> {
		const judge = comparison.participants.find(participant => participant.id === judgeParticipantId && participant.role === SessionComparisonParticipantRole.Judge);
		if (!judge) {
			return;
		}
		const harness = judge.harness;
		const session = await this._createAndSendRequest(comparison.workspace, {
			query: createSessionComparisonJudgePrompt(comparison.id),
			attachedContext: comparison.attachedContext?.slice(),
			title: localize('sessionComparison.judgeTitle', "Judge: {0}", comparison.title),
			background: true,
		}, {
			providerId: harness.providerId,
			sessionTypeId: harness.sessionTypeId,
			modelId: harness.modelId,
			modelConfiguration: harness.modelConfiguration,
			...this._permissionOptions(harness, comparison.permissionLevel),
			isolationMode: comparison.workspace ? 'worktree' : undefined,
			branch: comparison.branch,
			metadata: withSessionComparisonMetadata(undefined, {
				id: hashSessionIdForTelemetry(comparison.id),
				role: 'judge',
				attemptCount: comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt).length,
			}),
			onSessionCreated: createdSession => {
				const updated = this._updateComparisonParticipant(comparison.id, judgeParticipantId, participant => ({
					...participant,
					sessionResource: createdSession.resource,
					chatResource: createdSession.mainChat.get().resource,
					launchError: undefined,
				}));
				this._groupCreatedSession(updated, createdSession);
			},
		});
		const current = this.getComparison(comparison.id);
		if (!current || current.archivedAt !== undefined) {
			if (current) {
				this._replaceComparison({
					...current,
					participants: current.participants.filter(participant => participant.id !== judgeParticipantId),
				});
			}
			if (session) {
				await this._cancelAndDeleteSessions([session], 'orphaned Judge cleanup');
			}
			return;
		}
		if (session && !current.sessionResource) {
			this.sessionGroupsService.addToGroup(session.sessionId, comparison.groupId);
		}
		const updated = {
			...current,
			participants: current.participants.map(participant => participant.id === judgeParticipantId
				? {
					...participant,
					sessionResource: session?.resource,
					chatResource: session?.mainChat.get().resource,
					...(!session ? { launchError: localize('sessionComparison.judgeUnavailable', "The judge session did not start.") } : {}),
				}
				: participant),
		};
		this._replaceComparison(updated);
		await this._nestComparisonParticipants(updated, session ? [session] : []);
		await this._cleanupOrphanedEvaluator(comparison.id, judgeParticipantId, session);
		this._checkComparison(this._requireComparison(comparison.id));
	}

	private async _cleanupOrphanedEvaluator(comparisonId: string, participantId: string, session: ISession | undefined): Promise<void> {
		const comparison = this.getComparison(comparisonId);
		if (!session || comparison?.archivedAt === undefined) {
			return;
		}
		const participant = comparison.participants.find(candidate => candidate.id === participantId);
		if (!isEqual(participant?.sessionResource, session.resource)) {
			return;
		}
		this._replaceComparison({ ...comparison, participants: comparison.participants.filter(candidate => candidate.id !== participantId) });
		await this._cancelAndDeleteSessions([session], 'orphaned evaluator cleanup');
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

	private _getSynthesisPlanPrompt(comparison: ISessionComparison): string {
		const plan = comparison.synthesisPlan;
		if (!plan) {
			return '';
		}
		return plan.instructions
			? localize('sessionComparison.additionalSynthesisInstructionsPrompt', "\n\n## Additional synthesis instructions\n{0}", plan.instructions)
			: '';
	}

	private _getOtherAttemptStrengthsPrompt(comparison: ISessionComparison): string {
		const verdict = comparison.verdict;
		if (!verdict) {
			return '';
		}
		const findings = new Map(verdict.attempts.map(attempt => [attempt.participantId, attempt]));
		const attempts = comparison.participants.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt);
		const strengths = attempts.flatMap((attempt, index) => {
			if (attempt.id === verdict.recommendedParticipantId) {
				return [];
			}
			const finding = findings.get(attempt.id);
			if (!finding) {
				return [];
			}
			const attemptLabel = getSessionComparisonAttemptLabel(attempt, index + 1);
			return finding.notableDifferences
				.map(strength => strength.trim())
				.filter(strength => strength.length > 0)
				.map(strength => ({ attemptLabel, strength }));
		}).slice(0, SESSION_COMPARISON_MANIFEST_LIST_MAX_ITEMS).map(({ attemptLabel, strength }) =>
			localize('sessionComparison.otherAttemptStrengthPrompt', "- **{0}**: {1}", attemptLabel, getBoundedSessionComparisonManifestText(strength)));
		return strengths.length
			? localize('sessionComparison.otherAttemptStrengthsPrompt', "\n\n## Strong points from other attempts\n{0}", strengths.join('\n'))
			: '';
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
		return comparison.judgeHarness;
	}

	private _ensureComparisonGroupMembership(comparisons: readonly ISessionComparison[]): void {
		for (const comparison of comparisons) {
			if (comparison.sessionResource || comparison.archivedAt !== undefined) {
				continue;
			}
			const sessionIds = comparison.participants
				.map(participant => participant.sessionResource ? this.sessionsManagementService.getSession(participant.sessionResource)?.sessionId : undefined)
				.filter((sessionId): sessionId is string => sessionId !== undefined
					&& !this.sessionGroupsService.getGroupOfSession(sessionId)
					&& !this.sessionGroupsService.isExplicitlyUngrouped(sessionId));
			this.sessionGroupsService.addToGroup(sessionIds, comparison.groupId);
		}
	}

	private _archiveComparisonsWithMissingGroups(): void {
		const comparisons = this._comparisons.get();
		const archivedAt = Date.now();
		let changed = false;
		const updated = comparisons.map(comparison => {
			if (comparison.sessionResource || comparison.archivedAt !== undefined || this.sessionGroupsService.getGroup(comparison.groupId)) {
				return comparison;
			}
			changed = true;
			for (const participant of comparison.participants) {
				this._movedParticipantModels.deleteAndDispose(`${comparison.id}/${participant.id}`);
			}
			return { ...comparison, archivedAt };
		});
		if (!changed) {
			return;
		}
		this._comparisons.set(updated, undefined);
		this._save();
		this._pruneAttemptTelemetryState(new Set(updated
			.filter(comparison => comparison.archivedAt === undefined)
			.map(comparison => comparison.id)));
	}

	private _archiveFullyArchivedComparisons(comparisons: readonly ISessionComparison[]): void {
		for (const comparison of comparisons) {
			if (comparison.archivedAt !== undefined || comparison.launching) {
				continue;
			}
			if (comparison.sessionResource && this.sessionsManagementService.getSession(comparison.sessionResource)?.isArchived.get()) {
				this.archiveComparison(comparison.id);
				continue;
			}
			const participantResources = comparison.participants
				.flatMap(participant => participant.sessionResource ? [{ participant, resource: participant.sessionResource }] : []);
			const participantSessions = participantResources.map(({ participant, resource }) => ({
				participant,
				session: this.sessionsManagementService.getSession(resource),
			}));
			const sessions = participantSessions.flatMap(({ session }) => session ? [session] : []);
			if (
				sessions.length === 0
				|| participantSessions.some(({ participant, session }) => !session && !participant.launchError)
				|| sessions.some(session => !session.isArchived.get())
			) {
				continue;
			}
			this.archiveComparison(comparison.id);
			this.sessionGroupsService.deleteGroup(comparison.groupId);
		}
	}

	private _migrateLegacyAttemptTitles(comparisons: readonly ISessionComparison[]): void {
		for (const comparison of comparisons) {
			if (comparison.sessionResource) {
				continue;
			}
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
		this._indexComparisonSessions(comparison);
		this._comparisons.set([...this._comparisons.get(), comparison], undefined);
		this._save();
	}

	private _replaceComparison(comparison: ISessionComparison): void {
		const previous = this.getComparison(comparison.id);
		if (previous) {
			this._unindexComparisonSessions(previous);
			for (const participant of previous.participants) {
				if (comparison.archivedAt !== undefined || !comparison.participants.some(candidate => candidate.id === participant.id && (!candidate.launchError || candidate.missingSession))) {
					this._movedParticipantModels.deleteAndDispose(`${comparison.id}/${participant.id}`);
				}
			}
		}
		this._indexComparisonSessions(comparison);
		this._comparisons.set(this._comparisons.get().map(candidate => candidate.id === comparison.id ? comparison : candidate), undefined);
		this._save();
	}

	private _removeComparison(comparisonId: string): void {
		const comparison = this.getComparison(comparisonId);
		if (comparison) {
			this._unindexComparisonSessions(comparison);
			for (const participant of comparison.participants) {
				this._movedParticipantModels.deleteAndDispose(`${comparison.id}/${participant.id}`);
			}
		}
		this._comparisons.set(this._comparisons.get().filter(comparison => comparison.id !== comparisonId), undefined);
		this._save();
		this._pruneAttemptTelemetryState(new Set(this._comparisons.get()
			.filter(comparison => comparison.archivedAt === undefined)
			.map(comparison => comparison.id)));
	}

	private _indexComparisonSessions(comparison: ISessionComparison): void {
		for (const participant of comparison.participants) {
			if (participant.sessionResource) {
				const key = participant.sessionResource.toString();
				const ids = this._comparisonIdsBySession.get(key) ?? new Set<string>();
				ids.add(comparison.id);
				this._comparisonIdsBySession.set(key, ids);
			}
		}
	}

	private _unindexComparisonSessions(comparison: ISessionComparison): void {
		for (const participant of comparison.participants) {
			if (participant.sessionResource) {
				const key = participant.sessionResource.toString();
				const ids = this._comparisonIdsBySession.get(key);
				ids?.delete(comparison.id);
				if (ids?.size === 0) {
					this._comparisonIdsBySession.delete(key);
				}
			}
		}
	}

	private _getComparisonsForSessionChanges(event: ISessionsChangeEvent): readonly ISessionComparison[] {
		const comparisonIds = new Set<string>();
		for (const session of [...event.added, ...event.removed, ...event.changed]) {
			for (const comparisonId of this._comparisonIdsBySession.get(session.resource.toString()) ?? []) {
				comparisonIds.add(comparisonId);
			}
		}
		return [...comparisonIds].flatMap(comparisonId => {
			const comparison = this.getComparison(comparisonId);
			return comparison ? [comparison] : [];
		});
	}

	/** Confirmed deletion is terminal, unlike a session that only dropped out of its provider's catalog. */
	private _markParticipantDeleted(session: ISession, chatResource?: URI): void {
		for (const comparison of this._getComparisonsForSession(session.resource)) {
			if (comparison.archivedAt !== undefined) {
				continue;
			}
			const participants = comparison.participants.map(participant =>
				isEqual(participant.sessionResource, session.resource) && (!chatResource || isEqual(participant.chatResource ?? session.mainChat.get().resource, chatResource))
					? { ...participant, missingSession: undefined, launchError: participant.launchError ?? getAttemptUnavailableMessage() }
					: participant);
			const updated = { ...comparison, participants };
			this._replaceComparison(updated);
			if (!chatResource && isEqual(comparison.sessionResource, session.resource)) {
				this.archiveComparison(comparison.id);
				continue;
			}
			this._checkComparison(updated);
		}
	}

	private _reconcileSessionAvailability(comparison: ISessionComparison, event: ISessionsChangeEvent): ISessionComparison {
		if (comparison.sessionResource && comparison.archivedAt !== undefined
			&& [...event.added, ...event.changed].some(session => isEqual(session.resource, comparison.sessionResource) && !session.isArchived.get())) {
			comparison = { ...comparison, archivedAt: undefined };
			this._replaceComparison(comparison);
		}
		const availableResources = new Set([...event.added, ...event.changed].map(session => session.resource.toString()));
		const missingResources = new Set(event.removed
			.filter(session => !session.isArchived.get() && !this.sessionsManagementService.getSession(session.resource))
			.map(session => session.resource.toString()));
		let changed = false;
		const participants = comparison.participants.map(participant => {
			const resource = participant.sessionResource?.toString();
			if (!resource) {
				return participant;
			}
			if (participant.missingSession && availableResources.has(resource)) {
				changed = true;
				return { ...participant, missingSession: undefined, launchError: undefined };
			}
			if (!participant.launchError && missingResources.has(resource)) {
				changed = true;
				return {
					...participant,
					missingSession: true,
					launchError: getAttemptUnavailableMessage(),
				};
			}
			return participant;
		});
		if (!changed) {
			return comparison;
		}
		const updated = { ...comparison, participants };
		this._replaceComparison(updated);
		return updated;
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
				judgeHarness: comparison.judgeHarness ?? (comparison.version === undefined
					? comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Coordinator)?.harness
					?? comparison.participants.find(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource)?.harness
					: undefined),
				synthesisPlan: comparison.synthesisPlan?.instructions ? { instructions: comparison.synthesisPlan.instructions } : undefined,
				verdict: comparison.verdict ? {
					recommendedParticipantId: comparison.verdict.recommendedParticipantId,
					explanation: comparison.verdict.explanation,
					rationale: comparison.verdict.rationale,
					conflicts: comparison.verdict.conflicts,
					attempts: comparison.verdict.attempts,
				} : undefined,
				launching: undefined,
				workspace: comparison.workspace ? URI.parse(comparison.workspace) : undefined,
				sessionResource: comparison.sessionResource ? URI.parse(comparison.sessionResource) : undefined,
				attachedContext: comparison.attachedContext?.map(IChatRequestVariableEntry.fromExport),
				participants: comparison.participants.map(participant => ({
					...participant,
					sessionResource: participant.sessionResource ? URI.parse(participant.sessionResource) : undefined,
					chatResource: participant.chatResource ? URI.parse(participant.chatResource) : undefined,
					// Launches do not resume after a reload, so an attempt that never received a session will not start.
					...(comparison.launching && participant.role === SessionComparisonParticipantRole.Attempt && !participant.sessionResource && !participant.launchError
						? { launchError: localize('sessionComparison.attemptInterrupted', "The attempt was interrupted before it started.") }
						: {}),
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
			version: 1,
			workspace: comparison.workspace?.toString(),
			sessionResource: comparison.sessionResource?.toString(),
			attachedContext: comparison.attachedContext?.map(IChatRequestVariableEntry.toExport),
			participants: comparison.participants.map(participant => ({
				...participant,
				sessionResource: participant.sessionResource?.toString(),
				chatResource: participant.chatResource?.toString(),
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

	private _pruneAttemptTelemetryState(comparisonIds: ReadonlySet<string>): void {
		let changed = false;
		for (const key of [...this._reportedAttemptTelemetry]) {
			const separator = key.indexOf('/');
			if (separator < 0 || !comparisonIds.has(key.slice(0, separator))) {
				this._reportedAttemptTelemetry.delete(key);
				changed = true;
			}
		}
		if (changed) {
			this._saveAttemptTelemetryState();
		}
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
