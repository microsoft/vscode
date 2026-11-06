/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MAX_TIMEOUT_DELAY, raceTimeout } from '../../../base/common/async.js';
import type { ILogService } from '../../log/common/log.js';

export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 4500;

/**
 * Reads `--shutdown-timeout <ms>` from the command line. Returns {@link DEFAULT_SHUTDOWN_TIMEOUT_MS}
 * when the flag is absent, or an error message for a missing value or one that a timer cannot wait for.
 */
export function parseShutdownTimeoutArg(argv: readonly string[]): { readonly timeoutMs: number; readonly error?: undefined } | { readonly timeoutMs?: undefined; readonly error: string } {
	const index = argv.indexOf('--shutdown-timeout');
	if (index < 0) {
		return { timeoutMs: DEFAULT_SHUTDOWN_TIMEOUT_MS };
	}
	const raw = argv[index + 1];
	if (raw === undefined || raw.startsWith('--')) {
		return { error: `Missing value for --shutdown-timeout; expected milliseconds (e.g. ${DEFAULT_SHUTDOWN_TIMEOUT_MS})` };
	}
	const timeoutMs = Number(raw);
	// Node clamps larger timer delays to 1 ms, which would end shutdown almost immediately.
	if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMEOUT_DELAY) {
		return { error: `--shutdown-timeout must be a whole number of milliseconds from 1 to ${MAX_TIMEOUT_DELAY}, got '${raw}'` };
	}
	return { timeoutMs };
}

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
 * Flushes Agent Host persistence without allowing a failed or stalled write to
 * prevent process cleanup and exit.
 */
export async function flushAgentHostPersistenceBeforeShutdown(
	flushes: readonly Promise<unknown>[],
	timeoutMs: number,
	logService: Pick<ILogService, 'error' | 'warn'>,
): Promise<void> {
	await raceTimeout(Promise.all(flushes.map(async flush => {
		try {
			await flush;
		} catch (error) {
			logService.error('[AgentHostServer] Failed to flush persistence writes during shutdown; exiting anyway.', error);
		}
	})), timeoutMs, () => {
		logService.warn('[AgentHostServer] Timed out waiting for persistence writes to flush; exiting anyway.');
	});
}
