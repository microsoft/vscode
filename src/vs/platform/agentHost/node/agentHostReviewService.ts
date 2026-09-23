/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SequencerByKey } from '../../../base/common/async.js';
import { StringSHA1 } from '../../../base/common/hash.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { relativePath } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentSession } from '../common/agent.js';
import { buildFolderChangesetOwnerUri, ChangesetKind, parseChangesetUri, parseFolderChangesetOwnerUri } from '../common/changesetUri.js';
import { getWorkingDirectoryScopeId } from '../common/agentHostWorkingDirectories.js';
import { EMPTY_TREE_OBJECT, IAgentHostGitService, META_DIFF_BASE_BRANCH, resolveDiffBaseBranchName } from '../common/agentHostGitService.js';
import { IAgentHostGitStateService } from '../common/agentHostGitStateService.js';
import { buildReviewedRefName, IAgentHostReviewService } from '../common/agentHostReviewService.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { isAhpChatChannel, isDefaultChatUri, parseChatUri, readSessionGitState, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager, IAgentHostStateManager } from './agentHostStateManager.js';
import { resolveBranchChangesetScopeForOwner, resolveBranchChangesetScopeForSource } from './agentHostBranchChangesetScope.js';

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
		@IAgentHostStateManager private readonly _stateManager: AgentHostStateManager,
		@IAgentHostGitService private readonly _gitService: IAgentHostGitService,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@IAgentHostGitStateService private readonly _gitStateService: IAgentHostGitStateService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		// When a session's data directory is about to be deleted, delete the
		// reviewed ref we created for it. The working directory needed to
		// resolve the repository root is supplied by the event (resolved
		// before the session's live state was torn down) so we don't
		// persist our own copy.
		this._register(this._sessionDataService.onWillDeleteSessionData(e => {
			e.waitUntil(this.disposeSessionData(e.session.toString(), e.workingDirectories));
		}));
	}

	async setReviewState(channel: ProtocolURI, resources: readonly ProtocolURI[], reviewed: boolean): Promise<void> {
		const parsed = parseChangesetUri(channel);
		if (!parsed || parsed.kind !== ChangesetKind.Branch) {
			throw new Error(`Not a branch changeset URI: ${channel}`);
		}

		const scope = resolveBranchChangesetScopeForOwner(this._stateManager, parsed.ownerUri);
		if (!scope) {
			throw new Error(`Changeset workspace not found: ${parsed.ownerUri}`);
		}
		const sessionState = this._stateManager.getSessionState(scope.sourceUri);
		if (!sessionState) {
			throw new Error(`Changeset workspace source not found: ${scope.sourceUri}`);
		}
		if (!scope.workingDirectories[0]) {
			throw new Error(`Changeset owner has no working directory: ${parsed.ownerUri}`);
		}

		const databaseOwner = isDefaultChatUri(scope.sourceUri) ? scope.sessionUri : scope.sourceUri;
		const databaseRef = this._sessionDataService.openDatabase(URI.parse(databaseOwner));
		let persistedBaseBranch: string | undefined;
		try {
			persistedBaseBranch = await databaseRef.object.getMetadata(META_DIFF_BASE_BRANCH);
		} finally {
			databaseRef.dispose();
		}

		const workingDirectory = URI.parse(scope.workingDirectories[0]);
		const gitStateBaseBranch = this._gitStateService.getSessionGitState?.(scope.sourceUri)?.baseBranchName
			?? (!isAhpChatChannel(scope.sourceUri) || isDefaultChatUri(scope.sourceUri) ? readSessionGitState(sessionState._meta)?.baseBranchName : undefined);
		const baseBranch = resolveDiffBaseBranchName(persistedBaseBranch, gitStateBaseBranch);
		await this._sequencer.queue(parsed.ownerUri, async () => {
			for (const resource of resources) {
				await this._setReviewed(parsed.ownerUri, workingDirectory, baseBranch, URI.parse(resource), reviewed);
			}
		});
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

		const sourceOwner = resolveBranchChangesetScopeForSource(this._stateManager, sourceSession).ownerUri;
		const targetOwner = resolveBranchChangesetScopeForSource(this._stateManager, targetSession).ownerUri;
		const sourceRef = buildReviewedRefName(this._sanitizedOwnerId(sourceOwner));
		const legacySourceRef = buildReviewedRefName(this._sanitizedOwnerId(sourceSession));
		const sourceCommit = await this._gitService.revParse(repoRoot, sourceRef)
			?? await this._gitService.revParse(repoRoot, legacySourceRef);
		if (!sourceCommit) {
			return;
		}

		const targetRef = buildReviewedRefName(this._sanitizedOwnerId(targetOwner));
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

		const reviewedRef = buildReviewedRefName(this._sanitizedOwnerId(session));
		let reviewedCommit = await this._gitService.revParse(repoRoot, reviewedRef);
		const folderOwner = parseFolderChangesetOwnerUri(session);
		if (!reviewedCommit && folderOwner) {
			const legacyReviewedRef = buildReviewedRefName(this._sanitizedOwnerId(folderOwner.sessionUri));
			reviewedCommit = await this._gitService.revParse(repoRoot, legacyReviewedRef);
			if (reviewedCommit) {
				await this._gitService.updateRef(repoRoot, reviewedRef, reviewedCommit);
			}
		}
		const reviewedTree = reviewedCommit
			? await this._gitService.revParse(repoRoot, `${reviewedCommit}^{tree}`) ?? baselineTree
			: baselineTree;

		return { repoRoot, baselineTree, reviewedRef, reviewedCommit, reviewedTree };
	}

	async disposeSessionData(session: ProtocolURI, workingDirectories?: readonly string[]): Promise<void> {
		await this._sequencer.queue(session, () => this._disposeSessionData(session, workingDirectories));
	}

	private async _disposeSessionData(session: ProtocolURI, workingDirectories?: readonly string[]): Promise<void> {
		if (!workingDirectories || workingDirectories.length === 0) {
			return;
		}

		const containingSession = parseChatUri(session)?.session ?? session;
		const reviewedOwners = new Set<ProtocolURI>([
			session,
			buildFolderChangesetOwnerUri(containingSession, getWorkingDirectoryScopeId(workingDirectories)),
		]);
		for (const chat of this._stateManager.getSessionState(containingSession)?.chats ?? []) {
			reviewedOwners.add(chat.resource);
			reviewedOwners.add(resolveBranchChangesetScopeForSource(this._stateManager, chat.resource).ownerUri);
		}
		const reviewedRefs = new Set([...reviewedOwners].map(owner => buildReviewedRefName(this._sanitizedOwnerId(owner))));
		const sessionOwnerPrefix = `refs/agents/${this._sanitizedOwnerId(containingSession)}-`;

		for (const workingDirectory of workingDirectories) {
			try {
				const workingDirectoryUri = URI.parse(workingDirectory);
				const repositoryRootUri = await this._gitService.getRepositoryRoot(workingDirectoryUri);
				if (!repositoryRootUri) {
					continue;
				}

				if (this._gitService.listRefNamesWithOids) {
					for (const { ref } of await this._gitService.listRefNamesWithOids(repositoryRootUri, `${sessionOwnerPrefix}*/reviewed`)) {
						if (ref.startsWith(sessionOwnerPrefix) && ref.endsWith('/reviewed')) {
							reviewedRefs.add(ref);
						}
					}
				} else {
					this._logService.warn(`[AgentHostReview][_disposeSessionData] Git ref enumeration is unavailable; cleanup is limited to known reviewed refs for ${session}`);
				}
				await this._gitService.deleteRefs(repositoryRootUri, [...reviewedRefs]);
				this._logService.trace(`[AgentHostReview][_disposeSessionData] Deleted reviewed ref for ${session} in working directory ${workingDirectory}`);
			} catch (err) {
				this._logService.warn(`[AgentHostReview][_disposeSessionData] Failed to dispose reviewed ref for ${session} in working directory ${workingDirectory}`, err);
			}
		}
	}

	private _sanitizedOwnerId(owner: ProtocolURI): string {
		const workspace = parseFolderChangesetOwnerUri(owner);
		if (workspace) {
			const sessionId = AgentSession.id(workspace.sessionUri).replace(/[^a-zA-Z0-9_.-]/g, '-');
			return `${sessionId}-workspace-${workspace.scopeId}`;
		}
		const chat = parseChatUri(owner);
		const sessionId = AgentSession.id(chat?.session ?? owner).replace(/[^a-zA-Z0-9_.-]/g, '-');
		if (!chat) {
			return sessionId;
		}

		const sha1 = new StringSHA1();
		sha1.update(owner);
		return `${sessionId}-chat-${sha1.digest()}`;
	}
}
