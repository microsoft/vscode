/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createServiceIdentifier } from '../../../util/common/services';

export const IChatSessionWorktreeCheckpointService = createServiceIdentifier<IChatSessionWorktreeCheckpointService>('IChatSessionWorktreeCheckpointService');

export interface IChatSessionWorktreeCheckpointService {
	readonly _serviceBrand: undefined;

	handleRequest(sessionId: string): Promise<void>;
	handleRequestCompleted(sessionId: string, requestId: string): Promise<void>;

	/** Create baseline checkpoints for additional worktrees at request start. */
	handleAdditionalWorktreesRequest(sessionId: string): Promise<void>;

	/** Create post-turn checkpoints for additional worktrees at request completion. */
	handleAdditionalWorktreesRequestCompleted(sessionId: string, requestId: string): Promise<void>;

	/**
	 * Rewrite the session's last checkpoint so it reflects the current state of the worktree.
	 *
	 * The existing `lastCheckpointRef` (and its turn number / parent commit) are preserved; only
	 * the underlying tree (and therefore the commit OID the ref points to) is replaced.
	 */
	updateLastCheckpoint(sessionId: string): Promise<void>;
}
