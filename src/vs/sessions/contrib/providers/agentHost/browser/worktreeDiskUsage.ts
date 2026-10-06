/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { ResourceType } from '../../../../../platform/agentHost/common/state/protocol/commands.js';
import { AhpErrorCodes } from '../../../../../platform/agentHost/common/state/protocol/errors.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ProtocolError } from '../../../../../platform/agentHost/common/state/sessionProtocol.js';

const MAX_CONCURRENT_REQUESTS = 8;

type WorktreeFileConnection = Pick<IAgentConnection, 'resourceList' | 'resourceResolve'>;

/** The worktree no longer exists on disk, so it holds no storage. Other failures must surface. */
function isWorktreeMissing(error: unknown): boolean {
	return error instanceof ProtocolError && error.code === AhpErrorCodes.NotFound;
}

export async function getWorktreeDiskUsage(connection: WorktreeFileConnection, root: URI): Promise<number | undefined> {
	const rootStat = await connection.resourceResolve({ channel: ROOT_STATE_URI, uri: root.toString(), followSymlinks: false }).catch(error => {
		if (isWorktreeMissing(error)) {
			return undefined;
		}
		throw error;
	});
	if (!rootStat || rootStat.type !== ResourceType.Directory) {
		return undefined;
	}

	const pending = [root];
	let total = 0;
	while (pending.length > 0) {
		const batch = pending.splice(0, MAX_CONCURRENT_REQUESTS);
		const entries = await Promise.all(batch.map(async directory => {
			const children = await connection.resourceList(directory);
			return Promise.all(children.entries.map(async child => {
				const resource = URI.joinPath(directory, child.name);
				const stat = await connection.resourceResolve({ channel: ROOT_STATE_URI, uri: resource.toString(), followSymlinks: false });
				return { resource, stat };
			}));
		}));

		for (const directoryEntries of entries) {
			for (const { resource, stat } of directoryEntries) {
				if (stat.type === ResourceType.Directory) {
					pending.push(resource);
				} else if (stat.type === ResourceType.File) {
					total += stat.size ?? 0;
				}
			}
		}
	}

	return total;
}
