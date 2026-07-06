/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agentService.js';
import type { URI as ProtocolURI } from '../common/state/sessionState.js';
import { EMPTY_TREE_OBJECT, IAgentHostGitService } from '../common/agentHostGitService.js';
import { buildReviewedRefName, IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { AgentHostStateManager } from './agentHostStateManager.js';

/**
 * Resolved git context shared by the review operations: the repository root,
 * the Branch Changes baseline tree, and the current reviewed ref/tree.
 */
interface IReviewContext {
	readonly repoRoot: URI;
	/** Tree object of the baseline. */
	readonly baselineTree: string;
	/** Name of the session's reviewed ref. */
	readonly reviewedRef: string;
	/** Current reviewed commit, or `undefined` when the ref does not exist yet. */
	readonly reviewedCommit: string | undefined;
	/** Current reviewed tree; equals `baselineTree` when the ref does not exist. */
	readonly reviewedTree: string;
}

export class AgentHostReviewService extends Disposable implements IAgentHostReviewService {
	declare readonly _serviceBrand: undefined;

	/**
	 * Serializes mark/unmark/read per session so back-to-back mutations don't
	 * race on the reviewed ref rebuild and reads observe a consistent ref.
	 */
	private readonly _sequencer = new SequencerByKey<string>();

	constructor(
		private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// When a session's data directory is about to be deleted, delete the
		// reviewed ref we created for it. The working directory needed to
		// resolve the repository root is supplied by the event (resolved from
		// live session state) so we don't persist our own copy.
		this._register(this._sessionDataService.onWillDeleteSessionData(e => {
			e.waitUntil(this.disposeSessionData(e.session.toString()));
		}));
	}

	markFileReviewed(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined, resource: URI): Promise<void> {
		return this._sequencer.queue(session, () => this._setReviewed(session, workingDirectory, baseBranch, resource, true));
	}

	markFileUnreviewed(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined, resource: URI): Promise<void> {
		return this._sequencer.queue(session, () => this._setReviewed(session, workingDirectory, baseBranch, resource, false));
	}

	getReviewedPaths(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined): Promise<ReadonlySet<string>> {
		return this._sequencer.queue(session, () => this._getReviewedPaths(session, workingDirectory, baseBranch));
	}

	copyReviewedRef(sourceSession: ProtocolURI, targetSession: ProtocolURI, workingDirectory: URI): Promise<void> {
		return this._sequencer.queue(targetSession, () => this._copyReviewedRef(sourceSession, targetSession, workingDirectory));
	}

	private async _copyReviewedRef(sourceSession: ProtocolURI, targetSession: ProtocolURI, workingDirectory: URI): Promise<void> {
		const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repoRoot) {
			return;
		}

		const sourceRef = buildReviewedRefName(this._sanitizedSessionId(sourceSession));
		const sourceCommit = await this._gitService.revParse(repoRoot, sourceRef);
		if (!sourceCommit) {
			return;
		}

		const targetRef = buildReviewedRefName(this._sanitizedSessionId(targetSession));
		await this._gitService.updateRef(repoRoot, targetRef, sourceCommit);
		this._logService.trace(`[AgentHostReview][_copyReviewedRef] Copied reviewed ref ${sourceRef} -> ${targetRef} for fork`);
	}

	private async _setReviewed(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined, resource: URI, reviewed: boolean): Promise<void> {
		const context = await this._resolveContext(session, workingDirectory, baseBranch);
		if (!context) {
			return;
		}

		const path = relativePath(context.repoRoot, resource);
		if (!path) {
			this._logService.warn(`[AgentHostReview][_setReviewed] '${resource.toString()}' is not under the repository root '${context.repoRoot.toString()}'; skipping`);
			return;
		}

		// To mark a file reviewed, overlay its current working-tree content into
		// the reviewed tree; to unmark, reset it to the baseline content.
		let source: string | undefined;
		if (reviewed) {
			source = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
		} else {
			source = context.baselineTree;
		}
		if (!source) {
			return;
		}

		const newTree = await this._gitService.overlayPathIntoTree(context.repoRoot, context.reviewedTree, path, source);
		if (!newTree) {
			return;
		}
		if (newTree === context.reviewedTree) {
			// No change (already reviewed / already unreviewed).
			// Don't grow the reviewed ref chain with a no-op
			// commit.
			return;
		}

		// The reviewed ref is a session-private chain disconnected from the
		// real git history (mirroring the checkpoint baseline): the first
		// commit is a parentless root, and subsequent commits chain onto the
		// prior reviewed commit.
		const message = `review: ${reviewed ? 'mark' : 'unmark'} ${path}`;
		const commit = await this._gitService.commitTree(context.repoRoot, newTree, context.reviewedCommit, message);
		if (!commit) {
			return;
		}

		await this._gitService.updateRef(context.repoRoot, context.reviewedRef, commit);

		this._logService.trace(`[AgentHostReview][_setReviewed] ${message} for ${session.toString()} -> ${context.reviewedRef}@${commit}`);
	}

	private async _getReviewedPaths(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined): Promise<ReadonlySet<string>> {
		const context = await this._resolveContext(session, workingDirectory, baseBranch);
		if (!context?.reviewedCommit) {
			// No reviewed ref yet means
			// nothing has been reviewed.
			return new Set();
		}

		const workingTree = await this._gitService.captureWorkingTreeAsTree(workingDirectory);
		if (!workingTree) {
			return new Set();
		}

		// Changed = files that differ between the baseline and the working tree
		// (the Branch Changes universe). Unreviewed = files that still differ
		// between the reviewed tree and the working tree. Reviewed is the
		// difference: changed files whose reviewed content already matches the
		// working tree.
		const [changed, unreviewed] = await Promise.all([
			this._gitService.diffTreePaths(context.repoRoot, context.baselineTree, workingTree),
			this._gitService.diffTreePaths(context.repoRoot, context.reviewedTree, workingTree),
		]);
		if (!changed) {
			return new Set();
		}

		const unreviewedSet = new Set(unreviewed ?? []);
		return new Set(changed.filter(path => !unreviewedSet.has(path)));
	}

	private async _resolveContext(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined): Promise<IReviewContext | undefined> {
		const repoRoot = await this._gitService.getRepositoryRoot(workingDirectory);
		if (!repoRoot) {
			return undefined;
		}

		const baselineCommit = await this._gitService.resolveBranchBaselineCommit(workingDirectory, baseBranch);
		if (!baselineCommit) {
			return undefined;
		}

		const baselineTree = baselineCommit !== EMPTY_TREE_OBJECT
			? await this._gitService.revParse(repoRoot, `${baselineCommit}^{tree}`)
			: EMPTY_TREE_OBJECT;
		if (!baselineTree) {
			return undefined;
		}

		const reviewedRef = buildReviewedRefName(this._sanitizedSessionId(session));
		const reviewedCommit = await this._gitService.revParse(repoRoot, reviewedRef);
		const reviewedTree = reviewedCommit
			? await this._gitService.revParse(repoRoot, `${reviewedCommit}^{tree}`) ?? baselineTree
			: baselineTree;

		return { repoRoot, baselineTree, reviewedRef, reviewedCommit, reviewedTree };
	}

	async disposeSessionData(session: ProtocolURI): Promise<void> {
		await this._sequencer.queue(session, () => this._disposeSessionData(session));
	}

	private async _disposeSessionData(session: ProtocolURI): Promise<void> {
		const workingDirectory = this._stateManager.getSessionState(session)?.workingDirectory;
		if (!workingDirectory) {
			// No working directory means we can't resolve the repository root
			// (session was never git-backed, or its working directory is gone).
			return;
		}

		const repoRoot = await this._gitService.getRepositoryRoot(URI.parse(workingDirectory));
		if (!repoRoot) {
			return;
		}

		try {
			const reviewedRef = buildReviewedRefName(this._sanitizedSessionId(session));
			await this._gitService.deleteRefs(repoRoot, [reviewedRef]);

			this._logService.trace(`[AgentHostReview][_disposeSessionData] Deleted reviewed ref for ${session}`);
		} catch (err) {
			this._logService.warn(`[AgentHostReview][_disposeSessionData] Failed to dispose reviewed ref for ${session}`, err);
		}
	}

	private _sanitizedSessionId(session: ProtocolURI): string {
		return AgentSession.id(session).replace(/[^a-zA-Z0-9_.-]/g, '-');
	}
}
