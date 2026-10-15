/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceCancellationError } from '../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError } from '../../../../../base/common/errors.js';
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

function throwIfCancelled(token: CancellationToken): void {
	if (token.isCancellationRequested) {
		throw new CancellationError();
	}
}

export async function getWorktreeDiskUsage(connection: WorktreeFileConnection, root: URI, token = CancellationToken.None): Promise<number | undefined> {
	throwIfCancelled(token);
	const rootStat = await raceCancellationError(connection.resourceResolve({ channel: ROOT_STATE_URI, uri: root.toString(), followSymlinks: false }), token).catch(error => {
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
		throwIfCancelled(token);
		const directories = pending.splice(0, MAX_CONCURRENT_REQUESTS);
		const entries = (await raceCancellationError(Promise.all(directories.map(async directory => {
			throwIfCancelled(token);
			return {
				directory,
				children: (await connection.resourceList(directory)).entries,
			};
		})), token)).flatMap(({ directory, children }) => children.map(child => ({ directory, child })));

		for (let index = 0; index < entries.length; index += MAX_CONCURRENT_REQUESTS) {
			throwIfCancelled(token);
			const stats = await raceCancellationError(Promise.all(entries.slice(index, index + MAX_CONCURRENT_REQUESTS).map(async ({ directory, child }) => {
				const resource = URI.joinPath(directory, child.name);
				const stat = await connection.resourceResolve({ channel: ROOT_STATE_URI, uri: resource.toString(), followSymlinks: false });
				return { resource, stat };
			})), token);

			for (const { resource, stat } of stats) {
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
