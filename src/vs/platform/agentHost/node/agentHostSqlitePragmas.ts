/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Experimental: `VSCODE_AGENT_HOST_SQLITE_WAL=1` opens the Agent Host databases in WAL mode with
 * `synchronous = NORMAL`, so that a commit appends to the write-ahead log instead of creating,
 * flushing and deleting a rollback journal. Measures the cost of SQLite's default durability
 * settings where disk flushes are slow, such as on Windows CI machines.
 */
export function getExperimentalSqlitePragmas(env: NodeJS.ProcessEnv = process.env): string | undefined {
	return env.VSCODE_AGENT_HOST_SQLITE_WAL === '1' ? 'PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;' : undefined;
}
