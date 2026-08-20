/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from '../../../base/common/path.js';
import { getLogger } from './browserCookieImportLog.js';

// `node:sqlite` is experimental and must be loaded via createRequire — same
// pattern used by src/vs/platform/otel/node/sqlite/otelSqliteStore.ts.
const nodeRequire = createRequire(import.meta.url);
function loadSqlite(): typeof import('node:sqlite') {
	return nodeRequire('node:sqlite') as typeof import('node:sqlite');
}

/**
 * Cold-start staging for cookies that the live cookie jar rejects.
 *
 * Electron's `session.cookies.set()` (and CDP `Network.setCookie`) reject
 * some cookie shapes — most notably partitioned cookies on Electron
 * versions whose Chromium predates CHIPS, and cookies with exotic
 * attributes. For those, we can't write into the live jar.
 *
 * Instead we stage a *replacement cookie database*: a copy of the session's
 * current `Cookies` SQLite file with the imported cookies already inserted.
 * On the next app start, the session loads this staged file, so the cookies
 * appear in the jar without ever passing through the live write path.
 *
 * This mirrors Orca's `stageCookieDatabase()` approach. The staged file is
 * written to the OS temp dir and registered in a manifest so the main
 * process can find it at startup.
 */

/**
 * A cookie row ready for insertion into a staged Chromium `Cookies` DB.
 * Field names match the Chromium schema (v10+).
 */
export interface IStagedCookieRow {
	readonly domain: string;
	readonly name: string;
	readonly value: string;
	readonly path: string;
	readonly secure: boolean;
	readonly httpOnly: boolean;
	readonly sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
	readonly expirationDate: number;
	readonly creationUtc: number;
	readonly lastAccessUtc: number;
	readonly hasExpires: boolean;
	readonly isPersistent: boolean;
	readonly priority: 'low' | 'medium' | 'high';
	readonly sourceScheme: 'unset' | 'non_secure' | 'secure';
	readonly sourcePort: number;
	readonly partitionKey?: string;
}

/**
 * Manifest file that records staged cookie DBs awaiting swap-in at next
 * startup. Written to the OS temp dir; the main process reads it during
 * session initialization.
 */
export interface IStagedCookieManifest {
	readonly version: 1;
	readonly stagedDbs: readonly {
		readonly sessionPartition: string;
		readonly stagedPath: string;
		readonly createdAt: number;
	}[];
}

const MANIFEST_PATH = join(tmpdir(), 'vscode-cookie-import-staged.json');

/**
 * Returns the path to the staged-cookie manifest. Exposed for tests.
 */
export function getStagedCookieManifestPath(): string {
	return MANIFEST_PATH;
}

/**
 * Reads the staged-cookie manifest, or `null` if none exists.
 */
export function readStagedCookieManifest(): IStagedCookieManifest | null {
	try {
		if (!existsSync(MANIFEST_PATH)) {
			return null;
		}
		const raw = readFileSync(MANIFEST_PATH, 'utf8');
		const parsed = JSON.parse(raw) as IStagedCookieManifest;
		if (parsed.version !== 1 || !Array.isArray(parsed.stagedDbs)) {
			return null;
		}
		return parsed;
	} catch {
		return null;
	}
}

/**
 * Writes the staged-cookie manifest. Best-effort — failures are logged but
 * don't abort the import.
 */
export function writeStagedCookieManifest(manifest: IStagedCookieManifest): void {
	try {
		mkdirSync(tmpdir(), { recursive: true });
		writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		getLogger().warn(`Failed to write staged cookie manifest: ${message}`);
	}
}

/**
 * Clears the staged-cookie manifest (e.g. after a successful swap-in).
 */
export function clearStagedCookieManifest(): void {
	try {
		rmSync(MANIFEST_PATH, { force: true });
	} catch {
		// best-effort
	}
}

/**
 * Stages a replacement cookie DB for the given session partition.
 *
 * Copies the session's current `Cookies` SQLite file (if any) to a temp
 * path, inserts the given rows into it, and records the staged file in the
 * manifest. The main process swaps it in at next startup.
 *
 * @param sessionPartition The Electron session partition string (e.g.
 *   `persist:vscode-browser`).
 * @param cookiesDbPath Path to the session's current `Cookies` SQLite file.
 * @param rows Cookie rows to insert.
 * @returns The staged DB path, or `null` if staging failed.
 */
export async function stageCookieDatabase(
	sessionPartition: string,
	cookiesDbPath: string,
	rows: readonly IStagedCookieRow[]
): Promise<string | null> {
	const log = getLogger();
	log.info(`stageCookieDatabase: staging ${rows.length} cookies for partition ${sessionPartition}`);

	try {
		const { DatabaseSync } = loadSqlite();
		const stagedDir = join(tmpdir(), 'vscode-cookie-import');
		mkdirSync(stagedDir, { recursive: true });
		const stagedPath = join(stagedDir, `cookies-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.sqlite`);

		// Copy the existing DB so we don't lose the session's current cookies.
		if (existsSync(cookiesDbPath)) {
			copyFileSync(cookiesDbPath, stagedPath);
		}

		const db = new DatabaseSync(stagedPath);
		try {
			// Ensure the cookies table exists (Chromium v10+ schema).
			db.exec(`
				CREATE TABLE IF NOT EXISTS cookies (
					creation_utc INTEGER NOT NULL,
					host_key TEXT NOT NULL,
					name TEXT NOT NULL,
					value TEXT NOT NULL,
					path TEXT NOT NULL,
					expires_utc INTEGER NOT NULL,
					is_secure INTEGER NOT NULL,
					is_httponly INTEGER NOT NULL,
					last_access_utc INTEGER NOT NULL,
					has_expires INTEGER NOT NULL,
					is_persistent INTEGER NOT NULL,
					priority INTEGER NOT NULL DEFAULT 1,
					encrypted_value BLOB NOT NULL DEFAULT '',
					samesite INTEGER NOT NULL DEFAULT -1,
					source_scheme INTEGER NOT NULL DEFAULT 0,
					source_port INTEGER NOT NULL DEFAULT 80,
					is_same_party INTEGER NOT NULL DEFAULT 0,
					top_frame_site_key TEXT NOT NULL DEFAULT '',
					PRIMARY KEY (creation_utc, host_key, name, top_frame_site_key)
				)
			`);

			const insert = db.prepare(`
				INSERT OR REPLACE INTO cookies (
					creation_utc, host_key, name, value, path, expires_utc,
					is_secure, is_httponly, last_access_utc, has_expires,
					is_persistent, priority, encrypted_value, samesite,
					source_scheme, source_port, is_same_party, top_frame_site_key
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, 0, ?)
			`);

			for (const row of rows) {
				insert.run(
					row.creationUtc,
					row.domain,
					row.name,
					row.value,
					row.path,
					row.expirationDate,
					row.secure ? 1 : 0,
					row.httpOnly ? 1 : 0,
					row.lastAccessUtc,
					row.hasExpires ? 1 : 0,
					row.isPersistent ? 1 : 0,
					row.priority === 'low' ? 0 : row.priority === 'high' ? 2 : 1,
					row.sameSite === 'no_restriction' ? 0 : row.sameSite === 'lax' ? 1 : row.sameSite === 'strict' ? 2 : -1,
					row.sourceScheme === 'non_secure' ? 1 : row.sourceScheme === 'secure' ? 2 : 0,
					row.sourcePort,
					row.partitionKey ?? ''
				);
			}
		} finally {
			db.close();
		}

		// Record in manifest.
		const manifest = readStagedCookieManifest() ?? { version: 1, stagedDbs: [] };
		manifest.stagedDbs = [
			...manifest.stagedDbs.filter((entry) => entry.sessionPartition !== sessionPartition),
			{ sessionPartition, stagedPath, createdAt: Date.now() }
		];
		writeStagedCookieManifest(manifest);

		log.info(`stageCookieDatabase: staged at ${stagedPath}`);
		return stagedPath;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(`stageCookieDatabase: failed: ${message}`);
		return null;
	}
}

/**
 * Removes a staged DB file and its manifest entry. Called after a
 * successful swap-in at startup, or when the user cancels an import.
 */
export function discardStagedCookieDatabase(sessionPartition: string, stagedPath: string): void {
	try {
		rmSync(stagedPath, { force: true });
		const manifest = readStagedCookieManifest();
		if (manifest) {
			manifest.stagedDbs = manifest.stagedDbs.filter(
				(entry) => entry.sessionPartition !== sessionPartition || entry.stagedPath !== stagedPath
			);
			if (manifest.stagedDbs.length === 0) {
				clearStagedCookieManifest();
			} else {
				writeStagedCookieManifest(manifest);
			}
		}
	} catch {
		// best-effort
	}
}
