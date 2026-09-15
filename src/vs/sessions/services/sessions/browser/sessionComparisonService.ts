/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { FileAccess } from '../../../../base/common/network.js';
import { observableValue } from '../../../../base/common/observable.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { withSessionComparisonMetadata } from '../../../../platform/agentHost/common/state/sessionState.js';
import { localize } from '../../../../nls.js';
import { IChatService } from '../../../../workbench/contrib/chat/common/chatService/chatService.js';
import { aggregateChatUsage, IChatUsageSummary } from '../../../../workbench/contrib/chat/common/chatUsage.js';
import { SessionStatus } from '../common/session.js';
import { ISessionGroupsService } from './sessionGroupsService.js';
import { ISessionsManagementService } from '../common/sessionsManagement.js';
import { getSessionComparisonHarnessLabel, ISessionComparison, ISessionComparisonHarness, ISessionComparisonParticipant, ISessionComparisonService, ISessionComparisonSynthesisPlan, ISessionComparisonVerdict, IStartSessionComparisonOptions, SessionComparisonParticipantRole } from '../common/sessionComparison.js';
import { hashSessionIdForTelemetry, logSessionComparisonAttemptCompleted, logSessionComparisonAttemptJudged } from '../../../common/sessionsTelemetry.js';

const JUDGE_PROMPT_URI = FileAccess.asFileUri('vs/sessions/prompts/judge.md');
const JUDGE_COMPARISON_ID_PLACEHOLDER = '{{comparisonId}}';

interface IStoredSessionComparisonParticipant extends Omit<ISessionComparisonParticipant, 'sessionResource'> {
	readonly sessionResource?: string;
}

interface IStoredSessionComparison extends Omit<ISessionComparison, 'workspace' | 'participants'> {
	readonly workspace: string;
	readonly participants: readonly IStoredSessionComparisonParticipant[];
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
	private _judgePromptTemplate: Promise<string> | undefined;

	constructor(
		@ISessionsManagementService private readonly sessionsManagementService: ISessionsManagementService,
		@ISessionGroupsService private readonly sessionGroupsService: ISessionGroupsService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IChatService private readonly chatService: IChatService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@IFileService private readonly fileService: IFileService,
	) {
		super();
		this._loadTelemetryState();
		const comparisons = this._load();
		this._comparisons.set(comparisons, undefined);
		this._ensureComparisonGroupMembership(comparisons);
		this._migrateLegacyAttemptTitles(comparisons);
		this._register(this.sessionsManagementService.onDidChangeSessions(() => {
			const comparisons = this._comparisons.get();
			this._ensureComparisonGroupMembership(comparisons);
			this._migrateLegacyAttemptTitles(comparisons);
			this._checkComparisons();
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
		const title = comparisonTitle(options.prompt);
		const group = this.sessionGroupsService.createGroup(title);
		let comparison: ISessionComparison = {
			id,
			groupId: group.id,
			title,
			createdAt: Date.now(),
			workspace: options.workspace,
			prompt: options.prompt,
			branch: options.branch,
			permissionLevel: options.permissionLevel,
			judgeHarness: options.judgeHarness,
			participants: [],
		};
		this._addComparison(comparison);

		const attemptPromises = options.attempts.map(async (attempt, index) => {
			const harness = attempt.harness;
			const participant = {
				id: attempt.id,
				role: SessionComparisonParticipantRole.Attempt,
				harness,
			} satisfies ISessionComparisonParticipant;
			try {
				const session = await this.sessionsManagementService.createAndSendNewChatRequest(options.workspace, {
					query: options.prompt,
					attachedContext: options.attachedContext ? [...options.attachedContext] : undefined,
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
			if (sectionIds.has(section.id)
				|| !attemptIds.has(section.recommendedParticipantId)
				|| !optionIds.has(section.recommendedParticipantId)
				|| optionIds.size !== section.options.length
				|| section.options.some(option => !attemptIds.has(option.participantId))) {
				throw new Error('The comparison verdict contains an invalid synthesis decision section.');
			}
			sectionIds.add(section.id);
		}
		this._replaceComparison({ ...comparison, verdict, synthesisPlan: undefined });
		this._reportOutcomeTelemetry(comparison, verdict);
	}

	setSynthesisPlan(comparisonId: string, plan: ISessionComparisonSynthesisPlan | undefined): void {
		const comparison = this._requireComparison(comparisonId);
		if (!plan) {
			this._replaceComparison({ ...comparison, synthesisPlan: undefined });
			return;
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

		this._synthesisStarting.add(comparisonId);
		try {
			const session = await this.sessionsManagementService.createAndSendNewChatRequest(comparison.workspace, {
				query: localize('sessionComparison.synthesisPrompt', "Synthesize the strongest parts of comparison {0} into a new implementation. First call #readAttemptComparison exactly once with that comparison ID. Read implementation code only from the authoritative worktrees in its manifest. If changedFilesStatus is unavailable, read the Git diff from that worktree. If the manifest includes a synthesisPlan, treat every selected section as an explicit user requirement and resolve cross-section dependencies coherently instead of copying hunks mechanically. Call get_session_context only with an exact sessionContextTarget returned by the manifest and only for rationale or validation evidence; never recover implementation code or paths from a transcript. Do not inspect another checkout, discover sessions, or guess references. Preserve correct behavior, resolve the Judge's reported conflicts, and run the relevant validation.\n\nJudge recommendation:\n{1}", comparison.id, comparison.verdict?.explanation ?? localize('sessionComparison.noJudgeExplanation', "No Judge explanation is available; use the selected attempt as the base.")),
				title: localize('sessionComparison.synthesisTitle', "Synthesis: {0}", comparison.title),
				background: true,
			}, {
				providerId: recommended.harness.providerId,
				sessionTypeId: recommended.harness.sessionTypeId,
				modelId: recommended.harness.modelId,
				permissionLevel: comparison.permissionLevel,
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

	private _createOptions(harness: ISessionComparisonHarness, options: IStartSessionComparisonOptions, comparisonId: string, attemptIndex: number) {
		return {
			providerId: harness.providerId,
			sessionTypeId: harness.sessionTypeId,
			modelId: harness.modelId,
			permissionLevel: options.permissionLevel,
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
		comparison = this._snapshotTerminalAttemptUsage(comparison);
		this._reportTerminalAttemptTelemetry(comparison);
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
					this._replaceComparison({
						...current,
						participants: [...current.participants, {
							id: generateUuid(),
							role: SessionComparisonParticipantRole.Judge,
							harness,
							launchError: error instanceof Error ? error.message : String(error),
						}],
					});
				}
			}
		}).finally(() => this._judgeStarting.delete(comparison.id));
	}

	private _snapshotTerminalAttemptUsage(comparison: ISessionComparison): ISessionComparison {
		let changed = false;
		const participants = comparison.participants.map(participant => {
			if (participant.role !== SessionComparisonParticipantRole.Attempt || participant.usage || !participant.sessionResource) {
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
				agentSessionId: session?.sessionId,
				attemptIndex,
				attemptCount: attempts.length,
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
				agentSessionId: session?.sessionId,
				attemptIndex,
				attemptCount: attempts.length,
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

	private async _startJudge(comparison: ISessionComparison): Promise<void> {
		const harness = this._getJudgeHarness(comparison);
		if (!harness) {
			throw new Error('No successful comparison attempt is available to run the Judge.');
		}
		const query = await this._getJudgePrompt(comparison.id);
		const session = await this.sessionsManagementService.createAndSendNewChatRequest(comparison.workspace, {
			query,
			title: localize('sessionComparison.judgeTitle', "Judge: {0}", comparison.title),
			background: true,
		}, {
			providerId: harness.providerId,
			sessionTypeId: harness.sessionTypeId,
			modelId: harness.modelId,
			permissionLevel: comparison.permissionLevel,
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
		this._replaceComparison({ ...current, participants: [...current.participants, judge] });
	}

	private async _getJudgePrompt(comparisonId: string): Promise<string> {
		this._judgePromptTemplate ??= this.fileService.readFile(JUDGE_PROMPT_URI).then(content => content.value.toString());
		const template = await this._judgePromptTemplate;
		if (!template.includes(JUDGE_COMPARISON_ID_PLACEHOLDER)) {
			throw new Error(`The Judge prompt is missing the ${JUDGE_COMPARISON_ID_PLACEHOLDER} placeholder.`);
		}
		return template.replaceAll(JUDGE_COMPARISON_ID_PLACEHOLDER, comparisonId);
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
				if (session.title.get() !== legacyTitle) {
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

	private _loadTelemetryState(): void {
		const raw = this.storageService.get(SessionComparisonService.TELEMETRY_STORAGE_KEY, StorageScope.PROFILE);
		if (!raw) {
			return;
		}
		try {
			const stored = JSON.parse(raw) as { readonly execution?: readonly string[]; readonly outcome?: readonly string[] };
			for (const key of stored.execution ?? []) {
				this._reportedExecutionTelemetry.add(key);
			}
			for (const key of stored.outcome ?? []) {
				this._reportedOutcomeTelemetry.add(key);
			}
		} catch (error) {
			this.logService.error('[SessionComparisonService] Failed to restore comparison telemetry state.', error);
		}
	}

	private _saveTelemetryState(): void {
		this.storageService.store(SessionComparisonService.TELEMETRY_STORAGE_KEY, JSON.stringify({
			execution: [...this._reportedExecutionTelemetry],
			outcome: [...this._reportedOutcomeTelemetry],
		}), StorageScope.PROFILE, StorageTarget.MACHINE);
	}
}

function comparisonTitle(prompt: string): string {
	const firstLine = prompt.trim().split(/\r?\n/, 1)[0];
	return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

registerSingleton(ISessionComparisonService, SessionComparisonService, InstantiationType.Delayed);
