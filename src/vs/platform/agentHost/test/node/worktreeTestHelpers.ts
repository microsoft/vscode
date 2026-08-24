/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import type { URI } from '../../../../base/common/uri.js';
import type { Turn } from '../../common/state/sessionState.js';
import type { IAgentHostWorktreeIsolation } from '../../node/shared/worktreeIsolation.js';

/**
 * Worktree isolation that never reports a pending working directory and leaves
 * restored turns untouched. Lives in the node layer because
 * {@link IAgentHostWorktreeIsolation} is a node-layer service.
 */
export function createNoopWorktreeIsolation(): IAgentHostWorktreeIsolation {
	return {
		_serviceBrand: undefined,
		onDidChangeWorkingDirectoryPending: Event.None,
		isWorkingDirectoryPending: (_sessionId: string) => false,
		applyRestoreAnnouncement: async (_sessionUri: URI, turns: readonly Turn[]) => turns,
	};
}
