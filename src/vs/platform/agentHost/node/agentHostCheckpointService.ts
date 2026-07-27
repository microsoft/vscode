/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostCheckpointService, META_CHECKPOINT_BASE_REF, buildCheckpointRefName } from '../common/agentHostCheckpointService.js';
import { AgentSession } from '../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';

/**
 * `session_metadata` key under which the working directory used for
 * checkpoint capture is persisted (set when the baseline is created).
 * Stored as `URI.toString()`. Read by `captureTurnCheckpoint` /
 * `disposeSessionData` so they can resolve the repo without per-call
 * working-directory plumbing.
 */
export const META_CHECKPOINT_WORKING_DIR = 'checkpoint.workingDir';

export class AgentHostCheckpointService extends Disposable implements IAgentHostCheckpointService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Serializes capture/dispose per session so back-to-back end-of-turn
	 * captures don't race on the temp-index files or the `setTurnCheckpointRef`
	 * write, and a dispose can't run concurrently with an in-flight capture.
	 * Keyed by session URI string.
	 */
	private readonly _sequencer = new SequencerByKey<string>();

	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// Cleanup hook: when a session's data directory is about to be
		// deleted, enumerate and delete every checkpoint ref we created
		// for that session BEFORE the database file disappears. The
		// `waitUntil` API blocks `deleteSessionData` until our promise
		// settles, so the deletion can't race the ref read.
		this._register(this._sessionDataService.onWillDeleteSessionData(e => {
			e.waitUntil(this.disposeSessionData(e.session));
		}));
	}

	captureBaseline(sessionUri: URI, workingDirectory: URI | undefined): Promise<string | undefined> {
		return this._sequencer.queue(sessionUri.toString(), () => this._captureBaseline(sessionUri, workingDirectory));
	}

	private async _captureBaseline(sessionUri: URI, workingDirectory: URI | undefined): Promise<string | undefined> {
		if (!workingDirectory) {
			return undefined;
		}
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const existing = await ref.object.getMetadata(META_CHECKPOINT_BASE_REF);
			if (existing) {
				return existing;
			}
			const sanitized = this._sanitizedSessionId(sessionUri);
			const refName = buildCheckpointRefName(sanitized, 0);
			const commit = await this._writeCheckpointCommit(workingDirectory, undefined, `Agent host session ${sanitized} - baseline checkpoint`);
			if (!commit) {
				return undefined;
			}
			const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
			if (!repoRoot) {
				return undefined;
			}
			await this._gitService.updateRef(repoRoot, refName, commit.commitOid);
			await ref.object.setMetadata(META_CHECKPOINT_BASE_REF, refName);
			await ref.object.setMetadata(META_CHECKPOINT_WORKING_DIR, workingDirectory.toString());
			this._logService.trace(`[AgentHostCheckpoint] Captured baseline for ${sessionUri.toString()} at ${refName}`);
			return refName;
		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to capture baseline for ${sessionUri.toString()}`, err);
			return undefined;
		} finally {
			ref.dispose();
		}
	}

	captureTurnCheckpoint(sessionUri: URI, turnId: string): Promise<string | undefined> {
		return this._sequencer.queue(sessionUri.toString(), () => this._captureTurnCheckpoint(sessionUri, turnId));
	}

	private async _captureTurnCheckpoint(sessionUri: URI, turnId: string): Promise<string | undefined> {
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const [baseRef, workingDirRaw, existing, prevTurnRef] = await Promise.all([
				ref.object.getMetadata(META_CHECKPOINT_BASE_REF),
				ref.object.getMetadata(META_CHECKPOINT_WORKING_DIR),
				ref.object.getTurnCheckpointRef(turnId),
				ref.object.getPreviousCheckpointRef(turnId),
			]);
			if (existing) {
				return existing;
			}
			if (!baseRef || !workingDirRaw) {
				// Baseline never captured — session is not git-backed or
				// baseline failed. Nothing to chain from.
				return undefined;
			}
			const workingDirectory = URI.parse(workingDirRaw);
			const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
			if (!repoRoot) {
				return undefined;
			}
			const parentRef = prevTurnRef ?? baseRef;
			const parentCommitOid = await this._gitService.revParse(repoRoot, parentRef);
			if (!parentCommitOid) {
				this._logService.warn(`[AgentHostCheckpoint] Parent ref ${parentRef} missing for session ${sessionUri.toString()}`);
				return undefined;
			}

			const tree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
			if (!tree) {
				return undefined;
			}

			// No-op turn: if the tree is identical to the parent's tree,
			// don't create a redundant commit/ref — point the turn at the
			// parent ref so per-turn diffs against it are empty by
			// construction.
			const parentTree = await this._gitService.revParse(repoRoot, `${parentCommitOid}^{tree}`);
			if (parentTree && parentTree === tree) {
				await ref.object.setTurnCheckpointRef(turnId, parentRef);
				this._logService.trace(`[AgentHostCheckpoint] No-op turn ${turnId} for ${sessionUri.toString()}; reusing ${parentRef}`);
				return parentRef;
			}

			const sanitized = this._sanitizedSessionId(sessionUri);
			const turnNumber = await this._nextTurnNumber(ref.object);
			const refName = buildCheckpointRefName(sanitized, turnNumber);
			const commitOid = await this._gitService.commitTree(repoRoot, tree, parentCommitOid, `Agent host session ${sanitized} - turn ${turnNumber}`);
			if (!commitOid) {
				return undefined;
			}
			await this._gitService.updateRef(repoRoot, refName, commitOid);
			await ref.object.setTurnCheckpointRef(turnId, refName);
			this._logService.trace(`[AgentHostCheckpoint] Captured turn ${turnNumber} for ${sessionUri.toString()} at ${refName}`);
			return refName;
		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn checkpoint for ${sessionUri.toString()}/${turnId}`, err);
			return undefined;
		} finally {
			ref.dispose();
		}
	}

	async getTurnCheckpointPair(sessionUri: URI, turnId: string): Promise<{ parent: string; current: string } | undefined> {
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const [current, prev, baseRef] = await Promise.all([
				ref.object.getTurnCheckpointRef(turnId),
				ref.object.getPreviousCheckpointRef(turnId),
				ref.object.getMetadata(META_CHECKPOINT_BASE_REF),
			]);
			if (!current) {
				return undefined;
			}
			const parent = prev ?? baseRef;
			if (!parent) {
				return undefined;
			}
			return { parent, current };
		} finally {
			ref.dispose();
		}
	}

	async getBaselineCheckpointRef(sessionUri: URI): Promise<string | undefined> {
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			return await ref.object.getMetadata(META_CHECKPOINT_BASE_REF);
		} finally {
			ref.dispose();
		}
	}

	async disposeSessionData(sessionUri: URI): Promise<void> {
		await this._sequencer.queue(sessionUri.toString(), () => this._disposeSessionData(sessionUri));
	}

	private async _disposeSessionData(sessionUri: URI): Promise<void> {
		const refHandle = await this._sessionDataService.tryOpenDatabase(sessionUri);
		if (!refHandle) {
			return;
		}
		try {
			const [workingDirRaw, baseRef, turnRefs] = await Promise.all([
				refHandle.object.getMetadata(META_CHECKPOINT_WORKING_DIR),
				refHandle.object.getMetadata(META_CHECKPOINT_BASE_REF),
				refHandle.object.getAllCheckpointRefs(),
			]);
			if (!workingDirRaw) {
				return;
			}
			const workingDirectory = URI.parse(workingDirRaw);
			const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
			if (!repoRoot) {
				return;
			}
			// Dedup baseRef and turnRefs (a no-op turn may reuse its
			// parent's ref). Deleting the same ref twice is harmless but
			// noisy, and the batch API takes a list.
			const all = new Set<string>();
			if (baseRef) {
				all.add(baseRef);
			}
			for (const r of turnRefs) {
				all.add(r);
			}
			if (all.size === 0) {
				return;
			}
			await this._gitService.deleteRefs(repoRoot, [...all]);
			this._logService.trace(`[AgentHostCheckpoint] Deleted ${all.size} checkpoint refs for ${sessionUri.toString()}`);
		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to dispose checkpoint refs for ${sessionUri.toString()}`, err);
		} finally {
			refHandle.dispose();
		}
	}

	private async _writeCheckpointCommit(
		workingDirectory: URI,
		parentOid: string | undefined,
		message: string,
	): Promise<{ commitOid: string } | undefined> {
		const tree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
		if (!tree) {
			return undefined;
		}
		const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repoRoot) {
			return undefined;
		}
		const commitOid = await this._gitService.commitTree(repoRoot, tree, parentOid, message);
		if (!commitOid) {
			return undefined;
		}
		return { commitOid };
	}

	/**
	 * Parses the highest turn number from the existing refs and returns
	 * the next one. Falls back to 1 (baseline is always 0).
	 */
	private async _nextTurnNumber(db: ISessionDatabase): Promise<number> {
		const refs = await db.getAllCheckpointRefs();
		let max = 0;
		for (const ref of refs) {
			const idx = ref.lastIndexOf('/');
			const tail = idx >= 0 ? ref.substring(idx + 1) : ref;
			const n = parseInt(tail, 10);
			if (Number.isFinite(n) && n > max) {
				max = n;
			}
		}
		return max + 1;
	}

	private _sanitizedSessionId(sessionUri: URI): string {
		return AgentSession.id(sessionUri).replace(/[^a-zA-Z0-9_.-]/g, '-');
	}
}
