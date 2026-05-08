/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const MAX_ENTRIES = 100;
const FILE_PATH = path.join(os.homedir(), '.son-of-anton', 'data', 'repl-history.txt');

/**
 * Load up to `MAX_ENTRIES` newest history entries from disk. The file is
 * append-only newline-delimited, with the freshest entries at the bottom; we
 * return them oldest-first so up-arrow recall reads them right-to-left in the
 * REPL the way users expect.
 */
export function loadHistory(): string[] {
	try {
		const raw = fs.readFileSync(FILE_PATH, 'utf8');
		const lines = raw.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
		return lines.slice(-MAX_ENTRIES);
	} catch {
		return [];
	}
}

/**
 * Append a single history entry. Slash commands and empty submissions are
 * intentionally rejected by the caller before this runs.
 */
export function appendHistory(entry: string): void {
	const trimmed = entry.trim();
	if (!trimmed) {
		return;
	}
	try {
		fs.mkdirSync(path.dirname(FILE_PATH), { recursive: true, mode: 0o700 });
		fs.appendFileSync(FILE_PATH, trimmed + '\n', { mode: 0o600 });
	} catch {
		// History write failures should not crash the REPL.
	}
}
