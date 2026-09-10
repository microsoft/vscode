/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../base/common/cancellation.js';
import { ISessionChangesetOperation } from '../../../services/sessions/common/session.js';

export type SessionPullRequestMergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

export interface ISessionPullRequestAgentMergeOptions {
	readonly addressReviews: boolean;
	readonly fixCI: boolean;
	readonly resolveConflicts: boolean;
	readonly mergePullRequest: 'always' | 'ifUnchanged' | 'never';
}

export interface ISessionPullRequestOptions {
	readonly title: string;
	readonly description: string;
	readonly draft: boolean;
	readonly agentMerge: boolean;
	readonly agentMergeOptions?: ISessionPullRequestAgentMergeOptions;
	readonly autoMergeMethod?: SessionPullRequestMergeMethod;
}

export interface ISessionPullRequestDetails {
	readonly title: string;
	readonly description: string;
	readonly branchName: string;
	readonly baseBranchName: string;
	readonly repository: string;
	readonly autoMergeAllowed: boolean;
	readonly mergeMethods: readonly SessionPullRequestMergeMethod[];
	readonly agentMergeAvailable: boolean;
	/** Effective session options; presence also indicates support for configuring them during creation. */
	readonly agentMergeOptions?: ISessionPullRequestAgentMergeOptions;
	readonly generationError?: string;
}

export interface ISessionPullRequestCreation {
	readonly operationId: string;
	/** Generates editable details without changing the repository or creating a pull request. */
	prepare(token: CancellationToken): Promise<ISessionPullRequestDetails>;
	/** Returns an optional plain-text outcome, including any post-creation warnings. */
	create(options: ISessionPullRequestOptions): Promise<string | void>;
}

/** A changeset operation that supports the Changes contribution's Create PR form. */
export interface ISessionPullRequestOperation extends ISessionChangesetOperation {
	readonly pullRequestCreation: ISessionPullRequestCreation;
}

export function isSessionPullRequestOperation(operation: ISessionChangesetOperation): operation is ISessionPullRequestOperation {
	return 'pullRequestCreation' in operation;
}
