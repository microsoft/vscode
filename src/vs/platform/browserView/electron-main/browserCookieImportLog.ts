/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { appendFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from '../../../base/common/path.js';

/**
 * Diagnostic logger for the cookie import pipeline. Writes timestamped lines
 * to a per-user log file so a failed import can be debugged without asking
 * the user to reproduce under DevTools. The file lives under the OS temp
 * directory — not world-readable on macOS/Linux because the parent is
 * user-owned — and is intentionally kept small (best-effort, swallows write
 * errors).
 *
 * A future iteration will wire this to `ILogService` once the cookie import
 * service is constructed via `IInstantiationService`. The module-level logger
 * keeps the pure-function import modules (detect, keys, decrypt, plan) free
 * of DI dependencies.
 */

let _logPath: string | null = null;

function resolveLogPath(): string {
	if (!_logPath) {
		_logPath = join(tmpdir(), 'vscode-cookie-import-diag.log');
	}
	return _logPath;
}

export interface IBrowserCookieImportLogger {
	info(message: string): void;
	warn(message: string): void;
	error(message: string): void;
}

const noopLogger: IBrowserCookieImportLogger = {
	info: () => { /* noop */ },
	warn: () => { /* noop */ },
	error: () => { /* noop */ }
};

let _logger: IBrowserCookieImportLogger = {
	info: (message) => writeLine('INFO', message),
	warn: (message) => writeLine('WARN', message),
	error: (message) => writeLine('ERROR', message)
};

function writeLine(level: string, message: string): void {
	const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
	try {
		appendFileSync(resolveLogPath(), line);
	} catch {
		// best-effort — diagnostic logging must never break the import pipeline
	}
}

/**
 * Returns the active logger. Tests can swap in a no-op via
 * `setBrowserCookieImportLogger(noopLogger)` to silence disk writes.
 */
export function getLogger(): IBrowserCookieImportLogger {
	return _logger;
}

/**
 * Replaces the active logger. Pass `undefined` to restore the default
 * file-backed logger.
 */
export function setBrowserCookieImportLogger(logger: IBrowserCookieImportLogger | undefined): void {
	_logger = logger ?? _logger;
}

export { noopLogger };
