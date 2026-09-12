/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { raceTimeout } from '../../../base/common/async.js';
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
): Promise<boolean> {
	let succeeded = true;
	await raceTimeout((async () => {
		try {
			await drainProtocol();
		} catch (error) {
			succeeded = false;
			logService.error('[AgentHostServer] Failed to drain protocol requests; continuing shutdown.', error);
		}
	})(), timeoutMs, () => {
		succeeded = false;
		logService.warn('[AgentHostServer] Timed out draining protocol requests; continuing shutdown.');
	});
	await raceTimeout((async () => {
		try {
			await shutdownProviders();
		} catch (error) {
			succeeded = false;
			logService.error('[AgentHostServer] Failed to shut down providers; continuing shutdown.', error);
		}
	})(), timeoutMs, () => {
		succeeded = false;
		logService.warn('[AgentHostServer] Timed out waiting for providers to shut down; continuing shutdown.');
	});
	const flushed = await flushAgentHostPersistenceBeforeShutdown(flushPersistence(), timeoutMs, logService);
	return succeeded && flushed;
}

/**
 * Flushes Agent Host persistence without allowing a failed or stalled write to
 * prevent process cleanup and exit.
 */
export async function flushAgentHostPersistenceBeforeShutdown(
	flushes: readonly Promise<unknown>[],
	timeoutMs: number,
	logService: Pick<ILogService, 'error' | 'warn'>,
): Promise<boolean> {
	try {
		const flushed = await raceTimeout(Promise.all(flushes).then(() => true), timeoutMs, () => {
			logService.warn('[AgentHostServer] Timed out waiting for persistence writes to flush; exiting anyway.');
		});
		return flushed === true;
	} catch (error) {
		logService.error('[AgentHostServer] Failed to flush persistence writes during shutdown; exiting anyway.', error);
		return false;
	}
}
