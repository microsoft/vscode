/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { IAgentHostCheckpointService, buildCheckpointRefName } from '../common/agentHostCheckpointService.js';
import { AgentSession } from '../common/agent.js';
import { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';
import { IAgentHostGitService } from '../common/agentHostGitService.js';
import { IAgentConfigurationService } from './agentConfigurationService.js';

interface ITurnStartCheckpoint {
	readonly chatKey: string;
	readonly trees: Map<string, string>;
	gitEligible: boolean;
}

export class AgentHostCheckpointService extends Disposable implements IAgentHostCheckpointService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Serializes capture/dispose per session so back-to-back end-of-turn
	 * captures don't race on the temp-index files or the `setTurnCheckpointRef`
	 * write, and a dispose can't run concurrently with an in-flight capture.
	 * Keyed by session URI string.
	 */
	private readonly _sequencer = new SequencerByKey<string>();
	private readonly _turnStartCheckpoints = new Map<string, Map<string, ITurnStartCheckpoint>>();

	constructor(
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentConfigurationService private readonly _agentConfigService: IAgentConfigurationService,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		// Cleanup hook: when a session's data directory is about to be
		// deleted, enumerate and delete every checkpoint ref we created
		// for that session BEFORE the database file disappears. The
		// `waitUntil` API blocks `deleteSessionData` until our promise
		// settles, so the deletion can't race the ref read. The working
		// directories come from the event because the session has already
		// been removed from the state manager by this point.
		this._register(this._sessionDataService.onWillDeleteSessionData(e => {
			e.waitUntil(this._sequencer.queue(e.session.toString(), async () => {
				this._turnStartCheckpoints.delete(e.session.toString());
				await this._deleteCheckpoints(e.session, e.workingDirectories);
			}));
		}));
	}

	captureBaselineCheckpoint(sessionUri: URI, workingDirectories: readonly URI[] | undefined): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), () => this._captureBaseline(sessionUri, workingDirectories));
	}

	private async _captureBaseline(sessionUri: URI, workingDirectories: readonly URI[] | undefined): Promise<void> {
		if (!workingDirectories || workingDirectories.length === 0) {
			this._logService.trace(`[AgentHostCheckpoint] Skipping baseline capture for ${sessionUri.toString()} as no working directories are found`);
			return;
		}

		const sanitized = this._sanitizedSessionId(sessionUri);
		const baselineRefName = buildCheckpointRefName(sanitized, 0);

		for (const workingDirectoryUri of workingDirectories) {
			try {
				// Check that the working directory has a git repository
				const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
				if (!repositoryRootUri) {
					continue;
				}

				// Check if the baseline ref already exists
				const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
				if (baselineCheckpointRef) {
					continue;
				}

				// Create checkpoint commit
				const commit = await this._writeCheckpointCommit(repositoryRootUri, undefined, `Agent host session ${sanitized} - baseline checkpoint`);
				if (!commit) {
					continue;
				}

				// Update the baseline ref to point to the new commit
				await this._gitService.updateRef(repositoryRootUri, baselineRefName, commit);
				this._logService.trace(`[AgentHostCheckpoint] Captured baseline for ${sessionUri.toString()} at ${baselineRefName} in working directory ${workingDirectoryUri.toString()}`);
			} catch (err) {
				this._logService.warn(`[AgentHostCheckpoint] Failed to capture baseline for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`, err);
			}
		}
	}

	captureTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), () => this._captureTurnStartCheckpoint(sessionUri, chatUri, turnId, workingDirectories));
	}

	private async _captureTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		if (!workingDirectories || workingDirectories.length === 0) {
			return;
		}

		const sessionKey = sessionUri.toString();
		const chatKey = chatUri.toString();
		const turnKey = this._turnKey(chatKey, turnId);
		let sessionCheckpoints = this._turnStartCheckpoints.get(sessionKey);
		if (!sessionCheckpoints) {
			sessionCheckpoints = new Map();
			this._turnStartCheckpoints.set(sessionKey, sessionCheckpoints);
		}
		if (sessionCheckpoints.has(turnKey)) {
			return;
		}

		const hasConcurrentTurn = sessionCheckpoints.size > 0;
		if (hasConcurrentTurn) {
			for (const checkpoint of sessionCheckpoints.values()) {
				checkpoint.gitEligible = false;
			}
		}
		const checkpoint: ITurnStartCheckpoint = { chatKey, trees: new Map(), gitEligible: !hasConcurrentTurn };
		sessionCheckpoints.set(turnKey, checkpoint);
		let ref: ReturnType<ISessionDataService['openDatabase']> | undefined;
		try {
			ref = this._sessionDataService.openDatabase(sessionUri);
			await ref.object.createTurn(turnId);
			if (await ref.object.getTurnCheckpointRef(turnId)) {
				sessionCheckpoints.delete(turnKey);
				return;
			}

			for (const workingDirectoryUri of workingDirectories) {
				try {
					const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
					if (!repositoryRootUri) {
						continue;
					}

					const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
					if (tree) {
						await this._ensureBaselineCheckpoint(sessionUri, repositoryRootUri, tree);
						checkpoint.trees.set(repositoryRootUri.toString(), tree);
					}
				} catch (err) {
					this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn start for ${sessionUri.toString()}/${turnId} in working directory ${workingDirectoryUri.toString()}`, err);
				}
			}

		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn start for ${sessionUri.toString()}/${turnId}`, err);
		} finally {
			if (sessionCheckpoints.size === 0) {
				this._turnStartCheckpoints.delete(sessionKey);
			}
			ref?.dispose();
		}
	}

	discardTurnStartCheckpoint(sessionUri: URI, chatUri: URI, turnId: string): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), async () => {
			this._deleteTurnStartCheckpoint(sessionUri, this._turnKey(chatUri.toString(), turnId));
		});
	}

	discardChatTurnStartCheckpoints(sessionUri: URI, chatUri: URI): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), async () => {
			const sessionCheckpoints = this._turnStartCheckpoints.get(sessionUri.toString());
			if (!sessionCheckpoints) {
				return;
			}
			const chatKey = chatUri.toString();
			for (const [turnKey, checkpoint] of sessionCheckpoints) {
				if (checkpoint.chatKey === chatKey) {
					sessionCheckpoints.delete(turnKey);
				}
			}
			if (sessionCheckpoints.size === 0) {
				this._turnStartCheckpoints.delete(sessionUri.toString());
			}
		});
	}

	captureTurnCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), () => this._captureTurnCheckpoint(sessionUri, chatUri, turnId, workingDirectories));
	}

	private async _captureTurnCheckpoint(sessionUri: URI, chatUri: URI, turnId: string, workingDirectories: readonly URI[] | undefined): Promise<void> {
		const turnKey = this._turnKey(chatUri.toString(), turnId);
		if (!workingDirectories || workingDirectories.length === 0) {
			this._logService.trace(`[AgentHostCheckpoint] Skipping turn checkpoint capture for ${sessionUri.toString()} as no working directories are found`);
			this._deleteTurnStartCheckpoint(sessionUri, turnKey);
			return;
		}

		const startCheckpoint = this._turnStartCheckpoints.get(sessionUri.toString())?.get(turnKey);
		let ref: ReturnType<ISessionDataService['openDatabase']> | undefined;

		try {
			if (!startCheckpoint || !startCheckpoint.gitEligible) {
				return;
			}
			ref = this._sessionDataService.openDatabase(sessionUri);
			const sanitized = this._sanitizedSessionId(sessionUri);
			const turnNumber = await this._nextTurnNumber(ref.object);
			const refName = buildCheckpointRefName(sanitized, turnNumber);

			const [checkpointRef, prevTurnCheckpointRef] = await Promise.all([
				ref.object.getTurnCheckpointRef(turnId),
				ref.object.getPreviousCheckpointRef(turnId),
			]);

			if (checkpointRef) {
				// Already captured for this
				// turn, return the existing ref.
				return;
			}

			let capturedCheckpointRef = false;
			for (const workingDirectoryUri of workingDirectories) {
				try {
					// Check that the working directory has a git repository
					const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
					if (!repositoryRootUri) {
						continue;
					}

					// Check if the baseline ref exists for this repository. If it
					// doesn't exist, we cannot capture a turn checkpoint for this repository.
					const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
					if (!baselineCheckpointRef) {
						continue;
					}

					const parentRef = prevTurnCheckpointRef ?? baselineCheckpointRef;
					let parentCommitOid = await this._gitService.revParse(repositoryRootUri, parentRef);
					if (!parentCommitOid) {
						this._logService.warn(`[AgentHostCheckpoint] Parent ref ${parentRef} missing for session ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`);
						continue;
					}

					const startTree = startCheckpoint.trees.get(repositoryRootUri.toString());
					if (!startTree) {
						continue;
					}
					const startCommitOid = await this._gitService.commitTree(repositoryRootUri, startTree, parentCommitOid, `Agent host session ${sanitized} - turn ${turnNumber} start`);
					if (!startCommitOid) {
						continue;
					}
					parentCommitOid = startCommitOid;

					const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
					if (!tree) {
						continue;
					}

					const commitOid = await this._gitService.commitTree(repositoryRootUri, tree, parentCommitOid, `Agent host session ${sanitized} - turn ${turnNumber}`);
					if (!commitOid) {
						continue;
					}

					await this._gitService.updateRef(repositoryRootUri, refName, commitOid);
					capturedCheckpointRef = true;

					this._logService.trace(`[AgentHostCheckpoint] Captured turn ${turnNumber} for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()} at ${refName}`);
				} catch (err) {
					this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn checkpoint for ${sessionUri.toString()} in working directory ${workingDirectoryUri.toString()}`, err);
				}
			}

			if (capturedCheckpointRef) {
				await ref.object.setTurnCheckpointRef(turnId, refName);
			}
		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to capture turn checkpoint for ${sessionUri.toString()}/${turnId}`, err);
		} finally {
			this._deleteTurnStartCheckpoint(sessionUri, turnKey);
			ref?.dispose();
		}
	}

	async getTurnCheckpointPair(
		sessionUri: URI,
		turnId: string,
		workingDirectory?: URI
	): Promise<{ parent: string; current: string } | undefined> {
		if (!workingDirectory) {
			const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri.toString());
			if (!workingDirectories || workingDirectories.length === 0) {
				return undefined;
			}
			workingDirectory = URI.parse(workingDirectories[0]);
		}

		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			const [currentCheckpointRef, previousCheckpointRef, baselineCheckpointRef] = await Promise.all([
				ref.object.getTurnCheckpointRef(turnId),
				ref.object.getPreviousCheckpointRef(turnId),
				this.getBaselineCheckpoint(sessionUri, workingDirectory)
			]);
			if (!currentCheckpointRef || !baselineCheckpointRef) {
				return undefined;
			}

			if (currentCheckpointRef === previousCheckpointRef) {
				return { current: currentCheckpointRef, parent: currentCheckpointRef };
			}

			const parentCheckpoint = await this._gitService.revParse(workingDirectory, `${currentCheckpointRef}^`);
			if (!parentCheckpoint) {
				return undefined;
			}

			return {
				current: currentCheckpointRef,
				parent: parentCheckpoint
			};
		} finally {
			ref.dispose();
		}
	}

	async getBaselineCheckpoint(sessionUri: URI, workingDirectory?: URI): Promise<string | undefined> {
		if (!workingDirectory) {
			const workingDirectories = this._agentConfigService.getEffectiveWorkingDirectories(sessionUri.toString());
			if (!workingDirectories || workingDirectories.length === 0) {
				return undefined;
			}

			workingDirectory = URI.parse(workingDirectories[0]);
		}

		const sanitized = this._sanitizedSessionId(sessionUri);
		const baselineRefName = buildCheckpointRefName(sanitized, 0);

		const baselineRef = await this._gitService.revParse(workingDirectory, baselineRefName);
		return baselineRef ? baselineRefName : undefined;
	}

	adoptLegacyCheckpoints(sessionUri: URI, workingDirectory: URI, rawSessionId: string, turnIds: readonly string[]): Promise<void> {
		return this._sequencer.queue(sessionUri.toString(), () => this._adoptLegacyCheckpoints(sessionUri, workingDirectory, rawSessionId, turnIds));
	}

	private async _adoptLegacyCheckpoints(sessionUri: URI, workingDirectory: URI, rawSessionId: string, turnIds: readonly string[]): Promise<void> {
		const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repoRoot || !this._gitService.listRefNamesWithOids) {
			return; // non-git session (no checkpoints existed) or capability unavailable
		}
		// Legacy EH checkpoint refs are `refs/sessions/<id>/checkpoints/turn/<N>`.
		// Pass the id prefix (no glob) so git's for-each-ref prefix match returns
		// every nested ref regardless of depth.
		const legacy = await this._gitService.listRefNamesWithOids(repoRoot, `refs/sessions/${rawSessionId}`);
		if (legacy.length === 0) {
			return;
		}
		// Parse the turn number from each legacy ref's trailing path segment.
		const oidByTurn = new Map<number, string>();
		for (const { ref, oid } of legacy) {
			const n = parseInt(ref.substring(ref.lastIndexOf('/') + 1), 10);
			if (Number.isFinite(n)) {
				oidByTurn.set(n, oid);
			}
		}
		const sanitized = this._sanitizedSessionId(sessionUri);
		// Re-point each legacy commit under the agent-host ref namespace (same OIDs).
		const refByTurn = new Map<number, string>();
		for (const [n, oid] of oidByTurn) {
			const refName = buildCheckpointRefName(sanitized, n);
			await this._gitService.updateRef(repoRoot, refName, oid);
			refByTurn.set(n, refName);
		}
		const ref = this._sessionDataService.openDatabase(sessionUri);
		try {
			// The baseline (turn 0) and per-turn commits are discoverable by the
			// `buildCheckpointRefName` convention (re-pointed above via updateRef), so
			// only the per-turn checkpoint index needs seeding here. The i-th resumed
			// turn (0-based) corresponds to end-of-turn checkpoint N=i+1.
			for (let i = 0; i < turnIds.length; i++) {
				const refName = refByTurn.get(i + 1);
				if (refName) {
					await ref.object.setTurnCheckpointRef(turnIds[i], refName);
				}
			}
		} finally {
			ref.dispose();
		}
		// Drop the legacy refs now the commits are reachable via the agent-host namespace.
		await this._gitService.deleteRefs(repoRoot, legacy.map(l => l.ref)).catch(() => { });
		this._logService.info(`[AgentHostCheckpoint] Adopted ${refByTurn.size} legacy checkpoint refs for ${sessionUri.toString()}`);
	}

	async deleteCheckpoints(sessionUri: URI, workingDirectories?: readonly string[]): Promise<void> {
		await this._sequencer.queue(sessionUri.toString(), () => this._deleteCheckpoints(sessionUri, workingDirectories));
	}

	private async _deleteCheckpoints(sessionUri: URI, workingDirectories?: readonly string[]): Promise<void> {
		if (!workingDirectories || workingDirectories.length === 0) {
			return;
		}

		const refHandle = await this._sessionDataService.tryOpenDatabase(sessionUri);
		if (!refHandle) {
			return;
		}

		try {
			const turnRefs = await refHandle.object.getAllCheckpointRefs();
			for (const workingDirectory of workingDirectories) {
				try {
					const workingDirectoryUri = URI.parse(workingDirectory);

					const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
					if (!repositoryRootUri) {
						continue;
					}

					const baselineCheckpointRef = await this.getBaselineCheckpoint(sessionUri, repositoryRootUri);
					if (!baselineCheckpointRef) {
						continue;
					}

					// Dedup baseRef and turnRefs (a no-op turn may reuse its
					// parent's ref). Deleting the same ref twice is harmless but
					// noisy, and the batch API takes a list.
					const checkpointRefs = new Set<string>([baselineCheckpointRef, ...turnRefs]);
					await this._gitService.deleteRefs(repositoryRootUri, [...checkpointRefs]);
					this._logService.trace(`[AgentHostCheckpoint] Deleted ${checkpointRefs.size} checkpoint refs for ${sessionUri.toString()} in working directory ${workingDirectory}`);
				} catch (err) {
					this._logService.warn(`[AgentHostCheckpoint] Failed to delete checkpoint refs for ${sessionUri.toString()} in working directory ${workingDirectory}`, err);
				}
			}
		} catch (err) {
			this._logService.warn(`[AgentHostCheckpoint] Failed to dispose checkpoint refs for ${sessionUri.toString()}`, err);
		} finally {
			refHandle.dispose();
		}
	}

	private async _writeCheckpointCommit(
		repositoryRootUri: URI,
		parentOid: string | undefined,
		message: string,
	): Promise<string | undefined> {
		const tree = await this._gitService.captureWorkingTreeAsTree(repositoryRootUri);
		if (!tree) {
			return undefined;
		}

		const commitOid = await this._gitService.commitTree(repositoryRootUri, tree, parentOid, message);
		if (!commitOid) {
			return undefined;
		}

		return commitOid;
	}

	private async _ensureBaselineCheckpoint(sessionUri: URI, repositoryRootUri: URI, tree: string): Promise<void> {
		if (await this.getBaselineCheckpoint(sessionUri, repositoryRootUri)) {
			return;
		}

		const sanitized = this._sanitizedSessionId(sessionUri);
		const baselineRefName = buildCheckpointRefName(sanitized, 0);
		const commit = await this._gitService.commitTree(repositoryRootUri, tree, undefined, `Agent host session ${sanitized} - baseline checkpoint`);
		if (commit) {
			await this._gitService.updateRef(repositoryRootUri, baselineRefName, commit);
		}
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

	private _deleteTurnStartCheckpoint(sessionUri: URI, turnKey: string): void {
		const sessionKey = sessionUri.toString();
		const sessionCheckpoints = this._turnStartCheckpoints.get(sessionKey);
		sessionCheckpoints?.delete(turnKey);
		if (sessionCheckpoints?.size === 0) {
			this._turnStartCheckpoints.delete(sessionKey);
		}
	}

	private _turnKey(chatKey: string, turnId: string): string {
		return `${chatKey}\0${turnId}`;
	}
}
