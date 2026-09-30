/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DeferredPromise, Limiter, RunOnceScheduler } from '../../../../base/common/async.js';
import { Disposable, DisposableMap } from '../../../../base/common/lifecycle.js';
import { StopWatch } from '../../../../base/common/stopwatch.js';
import { URI } from '../../../../base/common/uri.js';
import { IFileService, IFileStatWithPartialMetadata } from '../../../files/common/files.js';
import { ILogService } from '../../../log/common/log.js';
import { copilotDiscoveryRetryDelays, CopilotDiscoveryReason, CopilotSessionDirectoryWatcher, CopilotSessionDiscoveryCandidate } from './copilotSessionDiscoveryWatchers.js';

export interface ICopilotChatDiscoveryScan {
	readonly id: number;
	readonly sessionIds: ReadonlySet<string> | undefined;
	isCurrent(sessionId: string): boolean;
	/** Capture metadata fingerprints for candidates without a watcher. */
	prepare(sessionId: string): Promise<boolean>;
	/** Recheck unwatched candidates before publication or retirement. */
	validate(sessionId: string): Promise<boolean>;
	describe(sessionId: string): string;
}

interface ICandidateSnapshot {
	readonly candidate: CopilotSessionDiscoveryCandidate;
	revision: number;
	readonly reason: CopilotDiscoveryReason;
}

/** Coordinates bounded readiness watching and serialized, event-driven SDK catalog scans. */
export class CopilotChatDiscovery extends Disposable {
	private static readonly refreshDelay = 500;
	private static readonly candidateLimit = 32;
	private readonly _directories: CopilotSessionDirectoryWatcher;
	private readonly _candidates = this._register(new DisposableMap<string, CopilotSessionDiscoveryCandidate>());
	private readonly _hostSessions = new Set<string>();
	private readonly _probes = this._register(new Limiter<IFileStatWithPartialMetadata | undefined>(4));
	private readonly _refresh = this._register(new RunOnceScheduler(() => { void this._run(); }, CopilotChatDiscovery.refreshDelay));
	private readonly _maintenance = this._register(new RunOnceScheduler(() => {
		this._maintenanceRequested = true;
		this._schedule(0);
	}, 60_000));
	private readonly _initial = new DeferredPromise<void>();
	private _initialScan = true;
	private _started = false;
	private _running = false;
	private _maintenanceRequested = false;
	private _maintenanceAt = 0;
	private _refreshAt = 0;
	private _scanNotBefore = 0;
	private _failures = 0;
	private _scanId = 0;
	private _creatingSessions = 0;
	private _creationGeneration = 0;
	private _watchCount = 0;

	constructor(
		root: URI,
		/** Returns terminally classified IDs, or undefined when enumeration failed. */
		private readonly _scan: (scan: ICopilotChatDiscoveryScan) => Promise<ReadonlySet<string> | undefined>,
		@IFileService private readonly _fileService: IFileService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._directories = this._register(new CopilotSessionDirectoryWatcher(root,
			id => this._hostSessions.has(id), () => this._schedule(), this._fileService, this._logService));
	}

	start(): Promise<void> {
		if (!this._started && !this._store.isDisposed) {
			this._started = true;
			this._directories.start();
			this._logService.info('[CopilotDiscovery] Started: maxCandidateWatches=32, maxConcurrentStats=4, coalesceMs=500');
			void this._run();
		}
		return this._initial.p;
	}

	/** Call before creating or resuming an SDK session, including imports and deferred backings. */
	ignoreSession(sessionId: string): void {
		if (!this._store.isDisposed && !this._hostSessions.has(sessionId)) {
			this._hostSessions.add(sessionId);
			this._removeCandidate(sessionId);
			this._logService.trace(`[CopilotDiscovery] Ignoring Agent Host session ${sessionId}`);
		}
	}

	/** The fork RPC chooses its ID; defer discovery until that ID can be excluded. */
	async trackSessionCreation<T extends { sessionId: string }>(create: () => Promise<T>): Promise<T> {
		this._creatingSessions++;
		this._creationGeneration++;
		try {
			const result = await create();
			this.ignoreSession(result.sessionId);
			return result;
		} finally {
			this._creatingSessions--;
			this._schedule();
		}
	}

	private _removeCandidate(id: string): void {
		if (this._candidates.get(id)?.watching) {
			this._watchCount--;
		}
		this._candidates.deleteAndDispose(id);
	}

	private _schedule(delay = CopilotChatDiscovery.refreshDelay): void {
		const at = Math.max(Date.now() + delay, this._scanNotBefore);
		if (this._started && !this._store.isDisposed && !this._running && this._creatingSessions === 0
			&& (!this._refresh.isScheduled() || at < this._refreshAt)) {
			this._refreshAt = at;
			this._refresh.schedule(Math.max(0, at - Date.now()));
		}
	}

	private async _updateCandidates(maintenance: boolean): Promise<void> {
		const timer = StopWatch.create();
		const changes = await this._directories.readChanges(maintenance);
		if (this._store.isDisposed) {
			return;
		}
		if (changes.reset) {
			this._candidates.clearAndDisposeAll();
			this._watchCount = 0;
		}
		for (const id of changes.removed) {
			this._removeCandidate(id);
		}
		for (const { id, resource, reason } of changes.added) {
			if (!this._hostSessions.has(id)) {
				this._candidates.set(id, new CopilotSessionDiscoveryCandidate(id, resource, reason,
					() => this._schedule(), this._fileService, this._logService));
				this._logService.trace(`[CopilotDiscovery] Candidate ${id}: enrolled=${reason}`);
			}
		}
		const probes = new Set<CopilotSessionDiscoveryCandidate>();
		for (const [id, candidate] of this._candidates) {
			if (candidate.deleted || this._hostSessions.has(id)) {
				this._removeCandidate(id);
			} else if (!candidate.watching && this._watchCount < CopilotChatDiscovery.candidateLimit) {
				candidate.watch();
				this._watchCount++;
				probes.add(candidate);
			}
		}
		if (maintenance) {
			for (const candidate of this._candidates.values()) {
				if (probes.size >= CopilotChatDiscovery.candidateLimit) {
					break;
				}
				probes.add(candidate);
			}
			for (const candidate of probes) {
				this._candidates.deleteAndLeak(candidate.id);
				this._candidates.set(candidate.id, candidate);
			}
		}
		await Promise.all([...probes].map(candidate => candidate.probe(this._probes)));
		if (maintenance) {
			this._logService.trace(`[CopilotDiscovery] Maintenance: probed=${probes.size}, pending=${this._candidates.size}, watched=${this._watchCount}, ignoredHostEvents=${this._directories.ignoredEvents}, elapsedMs=${Math.round(timer.elapsed())}`);
		}
	}

	private async _run(): Promise<void> {
		if (this._running || this._creatingSessions > 0 || this._store.isDisposed) {
			return;
		}
		this._running = true;
		this._refresh.cancel();
		const maintenance = this._maintenanceRequested;
		this._maintenanceRequested = false;
		try {
			await this._updateCandidates(maintenance);
			if (this._store.isDisposed || this._creatingSessions > 0 || Date.now() < this._scanNotBefore) {
				return;
			}
			const candidates = new Map([...this._candidates]
				.filter(([, candidate]) => this._initialScan || candidate.nextScanAt <= Date.now())
				.map(([id, candidate]) => [id, { candidate, revision: candidate.revision, reason: candidate.reason }]));
			if (this._initialScan || candidates.size > 0) {
				await this._scanCandidates(candidates);
			}
		} catch (error) {
			this._logService.warn('[CopilotDiscovery] Discovery work failed', error);
			this._scanNotBefore = Date.now() + 60_000;
		} finally {
			this._running = false;
			this._scheduleNextRun();
		}
	}

	private async _scanCandidates(candidates: ReadonlyMap<string, ICandidateSnapshot>): Promise<void> {
		const generation = this._directories.generation;
		const creationGeneration = this._creationGeneration;
		const isCurrent = (id: string) => !this._store.isDisposed && generation === this._directories.generation
			&& creationGeneration === this._creationGeneration && this._directories.isCurrent(id)
			&& candidates.get(id)?.revision === this._candidates.get(id)?.revision;
		const unwatchedReads = new Set<string>();
		const scan: ICopilotChatDiscoveryScan = {
			id: ++this._scanId,
			sessionIds: this._initialScan ? undefined : new Set(candidates.keys()),
			isCurrent,
			prepare: async id => {
				if (!isCurrent(id)) {
					return false;
				}
				const snapshot = candidates.get(id);
				if (snapshot && !snapshot.candidate.watching) {
					if (!await snapshot.candidate.probe(this._probes)) {
						return false;
					}
					snapshot.revision = snapshot.candidate.revision;
					unwatchedReads.add(id);
				}
				return isCurrent(id);
			},
			validate: async id => {
				const snapshot = candidates.get(id);
				if (snapshot && unwatchedReads.has(id) && !await snapshot.candidate.probe(this._probes)) {
					return false;
				}
				return isCurrent(id);
			},
			describe: id => {
				const snapshot = candidates.get(id);
				return `scan=${scan.id}, reason=${snapshot?.reason ?? 'startup'}, observedMsAgo=${snapshot ? Date.now() - snapshot.candidate.observedAt : 0}`;
			},
		};
		const reasons = new Map<string, number>();
		for (const { candidate } of candidates.values()) {
			reasons.set(candidate.reason, (reasons.get(candidate.reason) ?? 0) + 1);
		}
		this._logService.info(`[CopilotDiscovery] Scan ${scan.id} started: initial=${this._initialScan}, candidates=${candidates.size}, reasons=${JSON.stringify(Object.fromEntries(reasons))}, watched=${this._watchCount}, pending=${this._candidates.size}, ignoredHostEvents=${this._directories.ignoredEvents}`);
		const timer = StopWatch.create();
		let completed: ReadonlySet<string> | undefined;
		try {
			completed = await this._scan(scan);
		} catch (error) {
			this._logService.warn(`[CopilotDiscovery] Scan ${scan.id} failed`, error);
		}
		const elapsedMs = Math.round(timer.elapsed());
		if (this._store.isDisposed) {
			return;
		}
		if (completed === undefined) {
			const retryMs = copilotDiscoveryRetryDelays[Math.min(this._failures++, copilotDiscoveryRetryDelays.length - 1)];
			this._scanNotBefore = Date.now() + retryMs;
			this._logService.warn(`[CopilotDiscovery] Scan ${scan.id} unavailable: elapsedMs=${elapsedMs}, retryMs=${retryMs}, failures=${this._failures}`);
			if (this._failures >= copilotDiscoveryRetryDelays.length) {
				this._initial.complete();
			}
			return;
		}
		this._failures = 0;
		this._scanNotBefore = 0;
		if (generation === this._directories.generation && creationGeneration === this._creationGeneration) {
			this._initialScan = false;
		}
		for (const id of completed) {
			if (isCurrent(id)) {
				this._removeCandidate(id);
			}
		}
		for (const [id, { candidate }] of candidates) {
			if (isCurrent(id)) {
				candidate.retry();
			}
		}
		this._logService.info(`[CopilotDiscovery] Scan ${scan.id} finished: elapsedMs=${elapsedMs}, completed=${completed.size}, pending=${this._candidates.size}, watched=${this._watchCount}, overflow=${this._candidates.size - this._watchCount}, ignoredHostEvents=${this._directories.ignoredEvents}`);
		if (elapsedMs >= 2_000) {
			this._logService.warn(`[CopilotDiscovery] Slow scan ${scan.id}: elapsedMs=${elapsedMs}, candidates=${candidates.size}, directories=${this._directories.size}`);
		}
		this._initial.complete();
	}

	private _scheduleNextRun(): void {
		if (this._store.isDisposed) {
			return;
		}
		const needsWatchers = this._watchCount < Math.min(CopilotChatDiscovery.candidateLimit, this._candidates.size);
		let due = this._initialScan || this._directories.hasChanges || needsWatchers ? Date.now() + CopilotChatDiscovery.refreshDelay : Infinity;
		for (const candidate of this._candidates.values()) {
			due = Math.min(due, candidate.nextScanAt);
		}
		if (Number.isFinite(due)) {
			this._schedule(this._failures ? 0 : Math.max(CopilotChatDiscovery.refreshDelay, due - Date.now()));
		}
		const delay = this._candidates.size > 0 ? 5_000 : 60_000;
		if (!this._maintenance.isScheduled() || Date.now() + delay < this._maintenanceAt) {
			this._maintenanceAt = Date.now() + delay;
			this._maintenance.schedule(delay);
		}
	}

	override dispose(): void {
		if (this._store.isDisposed) {
			return;
		}
		this._logService.debug(`[CopilotDiscovery] Stopped: scans=${this._scanId}, pending=${this._candidates.size}, ignoredHostSessions=${this._hostSessions.size}, ignoredHostEvents=${this._directories.ignoredEvents}`);
		super.dispose();
		this._hostSessions.clear();
		this._initial.complete();
	}
}
