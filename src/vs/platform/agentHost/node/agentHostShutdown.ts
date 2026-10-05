/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Promises, raceTimeout } from '../../../base/common/async.js';
import type { ILogService } from '../../log/common/log.js';

/**
 * Drains protocol requests and providers before flushing persistence, without letting shutdown block process exit indefinitely.
 */
export async function shutdownAgentHostBeforeDispose(
	drainProtocol: () => Promise<void>,
	shutdownProviders: () => Promise<void>,
	flushPersistence: () => readonly Promise<unknown>[],
	timeoutMs: number,
	logService: Pick<ILogService, 'error' | 'warn'>,
): Promise<void> {
	await raceTimeout((async () => {
		try {
			await drainProtocol();
		} catch (error) {
			logService.error('[AgentHostServer] Failed to drain protocol requests; continuing shutdown.', error);
		}
		try {
			await shutdownProviders();
		} catch (error) {
			logService.error('[AgentHostServer] Failed to shut down providers; continuing shutdown.', error);
		}
		await flushAgentHostPersistenceBeforeShutdown(flushPersistence(), timeoutMs, logService);
	})(), timeoutMs, () => {
		logService.warn('[AgentHostServer] Timed out waiting for graceful shutdown; exiting anyway.');
	});
}

/**
 * Waits for every persistence flush, even when one fails, without letting stalled writes block process exit indefinitely.
 */
export async function flushAgentHostPersistenceBeforeShutdown(
	flushes: readonly Promise<unknown>[],
	timeoutMs: number,
	logService: Pick<ILogService, 'error' | 'warn'>,
): Promise<void> {
	try {
		await raceTimeout(Promises.settled([...flushes]), timeoutMs, () => {
			logService.warn('[AgentHostServer] Timed out waiting for persistence writes to flush; exiting anyway.');
		});
	} catch (error) {
		logService.error('[AgentHostServer] Failed to flush persistence writes during shutdown; exiting anyway.', error);
	}
}
