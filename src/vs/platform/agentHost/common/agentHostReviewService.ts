/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import type { URI as ProtocolURI } from './state/sessionState.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

export const IAgentHostReviewService = createDecorator<IAgentHostReviewService>('agentHostReviewService');

/**
 * Returns the canonical name for a session's synthetic **reviewed** ref.
 * Lives under the same `refs/agents/<sid>/…` namespace as checkpoint refs so
 * the two coexist safely and never surface to the user as branches/tags.
 */
export function buildReviewedRefName(sanitizedSessionId: string): string {
	return `refs/agents/${sanitizedSessionId}/reviewed`;
}

/**
 * Tracks which files in a session's **Branch Changes** the user has reviewed,
 * as a session-private synthetic git ref (`refs/agents/<sid>/reviewed`) whose
 * tree snapshots the reviewed content. A file is reviewed when its content in
 * the reviewed tree matches the current working tree; re-editing a reviewed
 * file therefore auto-unreviews it.
 *
 * All operations are keyed on the Branch Changes baseline (the merge-base of
 * `HEAD` and the session's base branch). The `baseBranch` argument is the
 * already-resolved base-branch **name** (see `resolveDiffBaseBranchName`),
 * shared with the changeset service so both agree on the baseline.
 *
 * Operations are no-ops when the working directory is not inside a git
 * repository; a future milestone will add a non-git fallback (see the
 * DB-backed reviewed-file store on `ISessionDatabase`).
 */
export interface IAgentHostReviewService {
	readonly _serviceBrand: undefined;

	/**
	 * Marks a single file reviewed at its current working-tree content by
	 * overlaying that content into the reviewed tree and advancing the
	 * reviewed ref. No-op when the file is already reviewed at that content.
	 */
	markFileReviewed(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined, resource: URI): Promise<void>;

	/**
	 * Marks a single file as unreviewed by resetting its entry in the
	 * reviewed tree back to the baseline content and advancing the reviewed
	 * ref. No-op when the file is not currently reviewed.
	 */
	markFileUnreviewed(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined, resource: URI): Promise<void>;

	/**
	 * Returns the set of reviewed repo-relative paths within the current Branch
	 * Changes: the changed files whose reviewed-tree content matches the
	 * working tree. Empty when nothing is reviewed or the directory is not a
	 * git work tree.
	 */
	getReviewedPaths(session: ProtocolURI, workingDirectory: URI, baseBranch: string | undefined): Promise<ReadonlySet<string>>;

	/**
	 * Copies the reviewed ref from `sourceSessionUri` to `targetSessionUri` so a
	 * forked session starts with the parent's review progress. Points the
	 * target's reviewed ref at the same commit as the source's (git objects are
	 * shared within the repository). No-op when the source has no reviewed ref or
	 * the directory is not a git work tree.
	 */
	copyReviewedRef(sourceSession: ProtocolURI, targetSession: ProtocolURI, workingDirectory: URI): Promise<void>;
}

/**
 * A no-op {@link IAgentHostReviewService} used as the default for the optional
 * `_reviewService` parameter on `AgentService` so existing test callsites keep
 * compiling without forced fixture updates.
 */
export const NULL_REVIEW_SERVICE: IAgentHostReviewService = {
	_serviceBrand: undefined,
	markFileReviewed: async () => { },
	markFileUnreviewed: async () => { },
	getReviewedPaths: async () => new Set(),
	copyReviewedRef: async () => { },
};
