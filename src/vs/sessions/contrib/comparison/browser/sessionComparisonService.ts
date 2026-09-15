/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { getErrorMessage } from '../../../../base/common/errors.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { IReader, observableSignalFromEvent, observableValue, transaction } from '../../../../base/common/observable.js';
import { isObject } from '../../../../base/common/types.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import { localize } from '../../../../nls.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { IChatEntitlementService } from '../../../../workbench/services/chat/common/chatEntitlementService.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { ISession, SessionStatus, SessionTypeAuthRequirement } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { ISessionsProvider } from '../../../services/sessions/common/sessionsProvider.js';
import { COMPARISON_ENABLED_SETTING, IComparisonCandidate, IComparisonRun, IComparisonTarget, ISessionComparisonService, MAX_COMPARISON_CANDIDATES } from '../common/comparison.js';

const STORAGE_KEY = 'sessions.comparison.runs';

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

export function supportsComparison(provider: ISessionsProvider, folderUri: URI, sessionTypeId: string): boolean {
	const type = provider.getSessionTypes(folderUri).find(type => type.id === sessionTypeId);
	return type?.supportsWorktreeConfiguration === true
		&& type.authRequirement !== SessionTypeAuthRequirement.Unusable
		&& (typeof provider.setWorktreeConfiguration === 'function'
			|| (typeof provider.setIsolationMode === 'function'
				&& typeof provider.setBranch === 'function'
				&& typeof provider.setWorktreeCreateNewBranch === 'function'));
}

export class SessionComparisonService extends Disposable implements ISessionComparisonService {
	declare readonly _serviceBrand: undefined;

	private readonly _runs = observableValue<readonly IComparisonRun[]>(this, []);
	readonly runs = this._runs;
	private readonly _activeRunId = observableValue<string | undefined>(this, undefined);
	readonly activeRunId = this._activeRunId;
	private readonly starting = new Map<string, CancellationTokenSource>();
	private readonly catalog;

	constructor(
		@ISessionsManagementService private readonly managementService: ISessionsManagementService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@IStorageService private readonly storageService: IStorageService,
		@ILogService private readonly logService: ILogService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@IChatEntitlementService private readonly entitlementService: IChatEntitlementService,
	) {
		super();
		this.catalog = observableSignalFromEvent(this, managementService.onDidChangeSessions);
		this.restore();
	}

	selectRun(id: string | undefined): void {
		if (id && !this._runs.get().some(run => run.id === id)) {
			throw new Error(localize('comparison.unknownRun', "This comparison is no longer available."));
		}
		this._activeRunId.set(id, undefined);
	}

	getSession(candidate: IComparisonCandidate, reader?: IReader): ISession | undefined {
		this.catalog.read(reader);
		return candidate.sessionResource ? this.managementService.getSession(candidate.sessionResource) : undefined;
	}

	async start(folderUri: URI, branch: string, prompt: string, targets: readonly IComparisonTarget[]): Promise<void> {
		if (!this.configurationService.getValue<boolean>(COMPARISON_ENABLED_SETTING) || this.entitlementService.sentiment.hidden || this.entitlementService.sentiment.disabledInWorkspace) {
			throw new Error(localize('comparison.disabled', "Implementation comparisons are disabled."));
		}
		if (!prompt.trim() || !branch.trim() || targets.length < 2 || targets.length > MAX_COMPARISON_CANDIDATES) {
			throw new Error(localize('comparison.invalidInput', "Enter a prompt, a base branch, and between 2 and {0} attempts.", MAX_COMPARISON_CANDIDATES));
		}
		for (const target of targets) {
			const provider = this.providersService.getProvider(target.providerId);
			if (!provider || !supportsComparison(provider, folderUri, target.sessionTypeId) || !target.modelId) {
				throw new Error(localize('comparison.unsupported', "{0} cannot start isolated comparison attempts in this folder.", target.providerLabel));
			}
		}
		const run: IComparisonRun = {
			id: generateUuid(),
			createdAt: Date.now(),
			prompt,
			folderUri,
			branch: branch.trim(),
			candidates: targets.map(target => ({ id: generateUuid(), target: { ...target }, state: 'starting' })),
		};
		transaction(tx => {
			this._runs.set([run, ...this._runs.get()], tx);
			this._activeRunId.set(run.id, tx);
		});
		this.save();
		await Promise.all(run.candidates.map(candidate => this.startCandidate(run, candidate)));
	}

	private async startCandidate(run: IComparisonRun, candidate: IComparisonCandidate): Promise<void> {
		const source = new CancellationTokenSource();
		this.starting.set(candidate.id, source);
		try {
			const session = await this.managementService.createAndSendNewChatRequest(run.folderUri, {
				query: run.prompt,
				background: true,
				title: localize('comparison.sessionTitle', "Attempt {0}: {1}", String.fromCharCode(65 + run.candidates.indexOf(candidate)), candidate.target.modelLabel),
			}, {
				providerId: candidate.target.providerId,
				sessionTypeId: candidate.target.sessionTypeId,
				modelId: candidate.target.modelId,
				isolationMode: 'worktree',
				branch: run.branch,
				worktreeCreateNewBranch: true,
				worktreeBranchTrack: false,
				onSessionCreated: session => this.updateCandidate(run.id, candidate.id, { sessionResource: session.resource }),
			}, source.token);
			if (!session) {
				throw new Error(localize('comparison.notStarted', "The session could not be started."));
			}
			this.updateCandidate(run.id, candidate.id, {
				state: source.token.isCancellationRequested ? 'cancelled' : 'started',
				sessionResource: session.resource,
			});
		} catch (error) {
			const cancelled = source.token.isCancellationRequested;
			if (!cancelled) {
				this.logService.error('[SessionComparison] Failed to start attempt', error);
			}
			this.updateCandidate(run.id, candidate.id, {
				state: cancelled ? 'cancelled' : 'failed',
				error: cancelled ? undefined : getErrorMessage(error),
			});
		} finally {
			this.starting.delete(candidate.id);
			source.dispose();
		}
	}

	async stop(runId: string, candidateId: string): Promise<void> {
		const candidate = this.requireCandidate(runId, candidateId);
		const source = this.starting.get(candidateId);
		if (source) {
			source.cancel();
			return;
		}
		const session = this.getSession(candidate);
		if (!session) {
			throw new Error(localize('comparison.sessionUnavailable', "This attempt's session is unavailable. Its provider may be disconnected."));
		}
		await this.managementService.cancelCurrentRequest(session);
		this.updateCandidate(runId, candidateId, { state: 'cancelled' });
	}

	prefer(runId: string, candidateId: string): void {
		const candidate = this.requireCandidate(runId, candidateId);
		if (candidate.state !== 'started' || this.getSession(candidate)?.status.get() !== SessionStatus.Completed) {
			throw new Error(localize('comparison.notFinished', "Wait for this attempt to finish before choosing it."));
		}
		this._runs.set(this._runs.get().map(run => run.id === runId ? { ...run, preferredCandidateId: candidateId } : run), undefined);
		this.save();
	}

	private requireCandidate(runId: string, candidateId: string): IComparisonCandidate {
		const candidate = this._runs.get().find(run => run.id === runId)?.candidates.find(candidate => candidate.id === candidateId);
		if (!candidate) {
			throw new Error(localize('comparison.unknownAttempt', "This comparison attempt is no longer available."));
		}
		return candidate;
	}

	private updateCandidate(runId: string, candidateId: string, update: Partial<IComparisonCandidate>): void {
		if (this._store.isDisposed) {
			return;
		}
		this._runs.set(this._runs.get().map(run => run.id === runId
			? { ...run, candidates: run.candidates.map(candidate => candidate.id === candidateId ? { ...candidate, ...update } : candidate) }
			: run), undefined);
		this.save();
	}

	private save(): void {
		this.storageService.store(STORAGE_KEY, JSON.stringify(this._runs.get().map(run => ({
			...run,
			folderUri: run.folderUri.toString(),
			candidates: run.candidates.map(candidate => ({ ...candidate, sessionResource: candidate.sessionResource?.toString() })),
		}))), StorageScope.WORKSPACE, StorageTarget.MACHINE);
	}

	private restore(): void {
		const raw = this.storageService.get(STORAGE_KEY, StorageScope.WORKSPACE);
		if (!raw) {
			return;
		}
		try {
			const stored: unknown = JSON.parse(raw);
			if (!Array.isArray(stored)) {
				throw new Error('Invalid comparison history');
			}
			const runs = stored.map((value: unknown): IComparisonRun => {
				if (!isRecord(value) || typeof value.id !== 'string' || typeof value.prompt !== 'string'
					|| typeof value.folderUri !== 'string' || typeof value.branch !== 'string'
					|| typeof value.createdAt !== 'number' || !Array.isArray(value.candidates)
					|| value.candidates.length < 2 || value.candidates.length > MAX_COMPARISON_CANDIDATES
					|| (value.preferredCandidateId !== undefined && typeof value.preferredCandidateId !== 'string')) {
					throw new Error('Invalid comparison');
				}
				return {
					id: value.id, prompt: value.prompt, folderUri: URI.parse(value.folderUri),
					branch: value.branch, createdAt: value.createdAt, preferredCandidateId: value.preferredCandidateId,
					candidates: value.candidates.map((candidate: unknown): IComparisonCandidate => {
						if (!isRecord(candidate) || typeof candidate.id !== 'string' || !isRecord(candidate.target)
							|| typeof candidate.target.providerId !== 'string' || typeof candidate.target.sessionTypeId !== 'string'
							|| typeof candidate.target.providerLabel !== 'string' || typeof candidate.target.modelId !== 'string'
							|| typeof candidate.target.modelLabel !== 'string'
							|| (candidate.sessionResource !== undefined && typeof candidate.sessionResource !== 'string')
							|| (candidate.error !== undefined && typeof candidate.error !== 'string')
							|| (candidate.state !== 'starting' && candidate.state !== 'started' && candidate.state !== 'failed'
								&& candidate.state !== 'cancelled' && candidate.state !== 'interrupted')) {
							throw new Error('Invalid comparison attempt');
						}
						return {
							id: candidate.id,
							target: {
								providerId: candidate.target.providerId, sessionTypeId: candidate.target.sessionTypeId,
								providerLabel: candidate.target.providerLabel, modelId: candidate.target.modelId, modelLabel: candidate.target.modelLabel,
							},
							state: candidate.state === 'starting' ? 'interrupted' : candidate.state,
							sessionResource: candidate.sessionResource ? URI.parse(candidate.sessionResource) : undefined,
							error: candidate.error,
						};
					}),
				};
			});
			transaction(tx => {
				this._runs.set(runs, tx);
				this._activeRunId.set(runs[0]?.id, tx);
			});
		} catch (error) {
			this.logService.error('[SessionComparison] Could not restore comparison history', error);
		}
	}

	override dispose(): void {
		for (const source of this.starting.values()) {
			source.cancel();
		}
		super.dispose();
	}
}
