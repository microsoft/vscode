/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { createSessionReferenceVariableEntry } from './sessionReference.js';
import { SessionStatus } from '../common/session.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { ISessionComparison, ISessionComparisonHarness, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonVerdict, IStartSessionComparisonOptions, SessionComparisonParticipantRole } from '../common/sessionComparison.js';

interface IStoredSessionComparisonParticipant extends Omit<ISessionComparisonParticipant, 'sessionResource'> {
	readonly sessionResource?: string;
}

interface IStoredSessionComparison extends Omit<ISessionComparison, 'workspace' | 'participants'> {
	readonly workspace: string;
	readonly participants: readonly IStoredSessionComparisonParticipant[];
}

export const SESSION_COMPARISON_AUTO_SYNTHESIZE_SETTING = 'chat.agentSessions.alwaysAutoSynthesize';

export class SessionComparisonService extends Disposable implements ISessionComparisonService {
	declare readonly _serviceBrand: undefined;

	private static readonly STORAGE_KEY = 'sessions.comparisons';

	private readonly _comparisons = observableValue<readonly ISessionComparison[]>(this, []);
	readonly comparisons = this._comparisons;
	private readonly _judgeStarting = new Set<string>();
	private readonly _synthesisStarting = new Set<string>();

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService private readonly sessionGroupsService: ISessionGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
	) {
		super();
		this._comparisons.set(this._load(), undefined);
		this._register(this.sessionsManagementService.onDidChangeSessions(() => this._checkComparisons()));
		this._checkComparisons();
	}

	async startComparison(options: IStartSessionComparisonOptions, token: CancellationToken = CancellationToken.None): Promise<ISessionComparison> {
		if (options.harnesses.length < 2) {
			throw new Error('A session comparison requires at least two harnesses.');
		}

		const id = generateUuid();
		const title = comparisonTitle(options.prompt);
		const group = this.sessionGroupsService.createGroup(localize('sessionComparison.groupTitle', "Compare: {0}", title));
		let comparison: ISessionComparison = {
			id,
			groupId: group.id,
			title,
			createdAt: Date.now(),
			workspace: options.workspace,
			prompt: options.prompt,
			branch: options.branch,
			participants: [],
		};
		this._addComparison(comparison);

		const coordinatorHarness = options.harnesses[0];
		let coordinator;
		try {
			coordinator = await this.sessionsManagementService.createAndSendNewChatRequest(options.workspace, {
				query: localize('sessionComparison.coordinatorPrompt', "Coordinate independent implementation attempts for the following task. Do not implement the task in this session. The child attempts and judge will appear beneath this session.\n\n{0}", options.prompt),
				title: localize('sessionComparison.coordinatorTitle', "Compare attempts: {0}", title),
				background: true,
			}, this._createOptions(coordinatorHarness, options), token);
		} catch (error) {
			this._removeComparison(id);
			this.sessionGroupsService.deleteGroup(group.id);
			throw error;
		}
		if (!coordinator) {
			this._removeComparison(id);
			this.sessionGroupsService.deleteGroup(group.id);
			throw new Error('The comparison coordinator session could not be created.');
		}

		const coordinatorParticipant: ISessionComparisonParticipant = {
			id: generateUuid(),
			role: SessionComparisonParticipantRole.Coordinator,
			harness: coordinatorHarness,
			sessionResource: coordinator.resource,
		};
		this.sessionGroupsService.addToGroup(coordinator.sessionId, group.id);
		comparison = { ...comparison, participants: [coordinatorParticipant] };
		this._replaceComparison(comparison);

		const createdBySession = {
			session: coordinator.resource,
			chat: coordinator.mainChat.get().resource,
		};
		const attemptPromises = options.harnesses.map(async harness => {
			const participantId = generateUuid();
			try {
				const session = await this.sessionsManagementService.createAndSendNewChatRequest(options.workspace, {
					query: options.prompt,
					attachedContext: options.attachedContext ? [...options.attachedContext] : undefined,
					title: localize('sessionComparison.attemptTitle', "{0} attempt", harness.label),
					background: true,
				}, {
					...this._createOptions(harness, options),
					createdBySession,
				}, token);
				return {
					id: participantId,
					role: SessionComparisonParticipantRole.Attempt,
					harness,
					sessionResource: session?.resource,
					...(!session ? { launchError: localize('sessionComparison.launchUnavailable', "The session did not start.") } : {}),
				} satisfies ISessionComparisonParticipant;
			} catch (error) {
				return {
					id: participantId,
					role: SessionComparisonParticipantRole.Attempt,
					harness,
					launchError: isCancellationError(error)
						? localize('sessionComparison.launchCancelled', "The attempt was cancelled before it started.")
						: error instanceof Error ? error.message : String(error),
				} satisfies ISessionComparisonParticipant;
			}
		});

		const attempts = await Promise.all(attemptPromises);
		comparison = { ...comparison, participants: [coordinatorParticipant, ...attempts] };
		this._replaceComparison(comparison);
		this._checkComparison(comparison);
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
		const attemptIds = new Set(comparison.participants
			.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource)
			.map(participant => participant.id));
		if (!attemptIds.has(verdict.recommendedParticipantId)) {
			throw new Error(`Recommended comparison attempt '${verdict.recommendedParticipantId}' was not found.`);
		}
		if (verdict.attempts.some(attempt => !attemptIds.has(attempt.participantId))) {
			throw new Error('The comparison verdict contains an unknown attempt.');
		}
		this._replaceComparison({ ...comparison, verdict });
		if (this.configurationService.getValue<boolean>(SESSION_COMPARISON_AUTO_SYNTHESIZE_SETTING)) {
			void this.synthesize(comparisonId).catch(error => this.logService.error('[SessionComparisonService] Automatic synthesis failed.', error));
		}
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
		const coordinator = comparison.participants.find(participant =>
			participant.role === SessionComparisonParticipantRole.Coordinator && participant.sessionResource);
		if (!recommended || !coordinator?.sessionResource) {
			throw new Error('A selected or recommended attempt is required before synthesis.');
		}

		this._synthesisStarting.add(comparisonId);
		try {
			const coordinatorSession = this.sessionsManagementService.getSession(coordinator.sessionResource);
			const attachedContext = comparison.participants
				.filter(participant => participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource)
				.map(participant => createSessionReferenceVariableEntry(participant.id, participant.harness.label, participant.sessionResource!));
			const session = await this.sessionsManagementService.createAndSendNewChatRequest(comparison.workspace, {
				query: localize('sessionComparison.synthesisPrompt', "Synthesize the strongest parts of the referenced implementation attempts into a new implementation. Preserve correct behavior, resolve the judge's reported conflicts, and run the relevant validation.\n\nJudge recommendation:\n{0}", comparison.verdict?.explanation ?? localize('sessionComparison.noJudgeExplanation', "No judge explanation is available; use the selected attempt as the base.")),
				attachedContext,
				title: localize('sessionComparison.synthesisTitle', "Synthesis: {0}", comparison.title),
				background: true,
			}, {
				providerId: recommended.harness.providerId,
				sessionTypeId: recommended.harness.sessionTypeId,
				modelId: recommended.harness.modelId,
				isolationMode: 'worktree',
				branch: comparison.branch,
				createdBySession: {
					session: coordinator.sessionResource,
					chat: coordinatorSession?.mainChat.get().resource,
				},
			});
			const synthesis: ISessionComparisonParticipant = {
				id: generateUuid(),
				role: SessionComparisonParticipantRole.Synthesis,
				harness: recommended.harness,
				sessionResource: session?.resource,
				...(!session ? { launchError: localize('sessionComparison.synthesisUnavailable', "The synthesis session did not start.") } : {}),
			};
			this._replaceComparison({
				...this._requireComparison(comparisonId),
				participants: [...this._requireComparison(comparisonId).participants, synthesis],
			});
		} finally {
			this._synthesisStarting.delete(comparisonId);
		}
	}

	async discardOriginalAttempts(comparisonId: string): Promise<readonly string[]> {
		const comparison = this._requireComparison(comparisonId);
		const failures: string[] = [];
		const failedParticipantIds = new Set<string>();
		for (const participant of comparison.participants) {
			if (participant.role !== SessionComparisonParticipantRole.Attempt || !participant.sessionResource) {
				continue;
			}
			const session = this.sessionsManagementService.getSession(participant.sessionResource);
			if (!session) {
				failedParticipantIds.add(participant.id);
				failures.push(localize('sessionComparison.cleanupSessionUnavailable', "The {0} session is currently unavailable.", participant.harness.label));
				continue;
			}
			try {
				await this.sessionsManagementService.deleteSession(session);
			} catch (error) {
				failedParticipantIds.add(participant.id);
				failures.push(error instanceof Error ? error.message : String(error));
			}
		}
		this._replaceComparison({
			...comparison,
			participants: comparison.participants.filter(participant =>
				participant.role !== SessionComparisonParticipantRole.Attempt || failedParticipantIds.has(participant.id)),
		});
		return failures;
	}

	private _createOptions(harness: ISessionComparisonHarness, options: IStartSessionComparisonOptions) {
		return {
			providerId: harness.providerId,
			sessionTypeId: harness.sessionTypeId,
			modelId: harness.modelId,
			permissionLevel: options.permissionLevel,
			isolationMode: 'worktree',
			branch: options.branch,
		};
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
				const coordinator = current.participants.find(participant => participant.role === SessionComparisonParticipantRole.Coordinator);
				if (coordinator) {
					this._replaceComparison({
						...current,
						participants: [...current.participants, {
							id: generateUuid(),
							role: SessionComparisonParticipantRole.Judge,
							harness: coordinator.harness,
							launchError: error instanceof Error ? error.message : String(error),
						}],
					});
				}
			}
		}).finally(() => this._judgeStarting.delete(comparison.id));
	}

	private async _startJudge(comparison: ISessionComparison): Promise<void> {
		const coordinator = comparison.participants.find(participant =>
			participant.role === SessionComparisonParticipantRole.Coordinator && participant.sessionResource);
		if (!coordinator?.sessionResource) {
			throw new Error('The comparison coordinator is unavailable.');
		}
		const coordinatorSession = this.sessionsManagementService.getSession(coordinator.sessionResource);
		const attempts = comparison.participants.filter(participant =>
			participant.role === SessionComparisonParticipantRole.Attempt && participant.sessionResource);
		const attachedContext = attempts.map(participant =>
			createSessionReferenceVariableEntry(participant.id, participant.harness.label, participant.sessionResource!));
		const attemptMap = attempts.map(participant => `${participant.id}: ${participant.harness.label}`).join('\n');
		const session = await this.sessionsManagementService.createAndSendNewChatRequest(comparison.workspace, {
			query: localize('sessionComparison.judgePrompt', "Judge the referenced implementation attempts for correctness, validation quality, maintainability, and fit to the original task. Inspect their code changes and session evidence. Then call #completeAttemptComparison exactly once with comparison ID {0} and these participant IDs:\n{1}", comparison.id, attemptMap),
			attachedContext,
			title: localize('sessionComparison.judgeTitle', "Judge: {0}", comparison.title),
			background: true,
		}, {
			providerId: coordinator.harness.providerId,
			sessionTypeId: coordinator.harness.sessionTypeId,
			modelId: coordinator.harness.modelId,
			isolationMode: 'worktree',
			branch: comparison.branch,
			createdBySession: {
				session: coordinator.sessionResource,
				chat: coordinatorSession?.mainChat.get().resource,
			},
		});
		const judge: ISessionComparisonParticipant = {
			id: generateUuid(),
			role: SessionComparisonParticipantRole.Judge,
			harness: coordinator.harness,
			sessionResource: session?.resource,
			...(!session ? { launchError: localize('sessionComparison.judgeUnavailable', "The judge session did not start.") } : {}),
		};
		const current = this._requireComparison(comparison.id);
		this._replaceComparison({ ...current, participants: [...current.participants, judge] });
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
			const stored = JSON.parse(raw) as readonly IStoredSessionComparison[];
			return stored.map(comparison => ({
				...comparison,
				workspace: URI.parse(comparison.workspace),
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
			participants: comparison.participants.map(participant => ({
				...participant,
				sessionResource: participant.sessionResource?.toString(),
			})),
		}));
		this.storageService.store(SessionComparisonService.STORAGE_KEY, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

function comparisonTitle(prompt: string): string {
	const firstLine = prompt.trim().split(/\r?\n/, 1)[0];
	return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
