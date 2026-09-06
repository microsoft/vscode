/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../base/common/async.js';
import type { ILogService } from '../../log/common/log.js';

/**
 * Flushes Agent Host persistence without allowing a failed or stalled write to
 * prevent process cleanup and exit.
 */
export async function flushAgentHostPersistenceBeforeShutdown(
	flushes: readonly Promise<unknown>[],
	timeoutMs: number,
	logService: Pick<ILogService, 'error' | 'warn'>,
): Promise<void> {
	try {
		await raceTimeout(Promise.all(flushes), timeoutMs, () => {
			logService.warn('[AgentHostServer] Timed out waiting for persistence writes to flush; exiting anyway.');
		});
	} catch (error) {
		logService.error('[AgentHostServer] Failed to flush persistence writes during shutdown; exiting anyway.', error);
	}
}
