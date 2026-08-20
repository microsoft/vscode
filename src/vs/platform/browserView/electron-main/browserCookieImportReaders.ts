/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { createRequire } from 'module';
import { tmpdir } from 'os';
import { join } from '../../../base/common/path.js';
import type { BrowserCookieImportEncryptionKeyResult } from './browserCookieImportKeys.js';
import { decryptCookieValue, type CookieDecryptOutcome } from './browserCookieImportDecrypt.js';
import { getLogger } from './browserCookieImportLog.js';

// `node:sqlite` is experimental and must be loaded via createRequire — same
// pattern used by src/vs/platform/otel/node/sqlite/otelSqliteStore.ts.
const nodeRequire = createRequire(import.meta.url);
function loadSqlite(): typeof import('node:sqlite') {
	return nodeRequire('node:sqlite') as typeof import('node:sqlite');
}

/**
 * A single cookie row read from a source database, with its encrypted value
 * already decrypted (or marked as failed). Partition identity is preserved as
 * raw fields so the planner can decide fidelity without re-reading the row.
 */
export interface ICookieImportRawRow {
	readonly domain: string;
	readonly name: string;
	readonly value: string;
	readonly path: string;
	readonly secure: boolean;
	readonly httpOnly: boolean;
	readonly sameSite: 'unspecified' | 'no_restriction' | 'lax' | 'strict';
	readonly expirationDate: number | undefined;
	/** Raw partition site from Chromium's `top_frame_site_key` column. Empty string = unpartitioned. */
	readonly partitionSite: string;
	/** Raw cross-site ancestor flag. `null` when the source schema predates CHIPS. */
	readonly hasCrossSiteAncestor: boolean | null;
	/** Firefox-only: server-declared Partitioned attribute. `null` when absent. */
	readonly firefoxPartitionedAttribute: boolean | null;
	/** Decrypt outcome for failure attribution in the summary. */
	readonly decryptOutcome: CookieDecryptOutcome['status'];
}

// ---------------------------------------------------------------------------
// Chromium SQLite reader
// ---------------------------------------------------------------------------

/**
 * Chromium timestamp epoch offset: microseconds between 1601-01-01 and
 * 1970-01-01. Stored as BigInt because values exceed Number.MAX_SAFE_INTEGER.
 */
const CHROMIUM_EPOCH_OFFSET = 11644473600n;

function chromiumTimestampToUnix(ts: bigint | number | string): number {
	if (!ts || ts === 0n || ts === 0 || ts === '0') {
		return 0;
	}
	try {
		const bigTs = typeof ts === 'bigint' ? ts : BigInt(typeof ts === 'number' ? Math.round(ts) : ts);
		if (bigTs === 0n) {
			return 0;
		}
		return Math.max(Number(bigTs / 1000000n - CHROMIUM_EPOCH_OFFSET), 0);
	} catch {
		return 0;
	}
}

function chromiumSameSite(raw: number): ICookieImportRawRow['sameSite'] {
	switch (raw) {
		case 1: return 'no_restriction';
		case 2: return 'lax';
		case 3: return 'strict';
		default: return 'unspecified';
	}
}

/**
 * Reads cookies from a Chromium SQLite database. The database is copied to a
 * temp directory first to avoid lock conflicts with a running browser.
 *
 * @param cookiesPath Absolute path to the Cookies SQLite file
 * @param keyResult Encryption key for this browser, or null if unavailable
 * @param keyringUnavailable True when Linux v11 keys could not be retrieved
 */
export function readChromiumCookies(
	cookiesPath: string,
	keyResult: BrowserCookieImportEncryptionKeyResult | null,
	keyringUnavailable: boolean
): ICookieImportRawRow[] {
	const log = getLogger();
	const tmpDir = mkdtempSync(join(tmpdir(), 'vscode-cookie-import-'));
	const tmpCookiesPath = join(tmpDir, 'Cookies');

	try {
		copyFileSync(cookiesPath, tmpCookiesPath);
		// Copy WAL/SHM sidecars if present — without them the main DB may be stale.
		for (const suffix of ['-wal', '-shm'] as const) {
			const sidecar = cookiesPath + suffix;
			if (existsSync(sidecar)) {
				try {
					copyFileSync(sidecar, tmpCookiesPath + suffix);
				} catch { /* best-effort */ }
			}
		}
	} catch (err) {
		rmSync(tmpDir, { recursive: true, force: true });
		log.error(`readChromiumCookies: could not copy ${cookiesPath}: ${String(err)}`);
		return [];
	}

	try {
		const { DatabaseSync } = loadSqlite();
		const db = new DatabaseSync(tmpCookiesPath, { readOnly: true, readBigInts: true });

		// Discover available columns — schema drifts across Chromium versions.
		const columns = new Set(
			(db.prepare('PRAGMA table_info(cookies)').all() as Array<{ name: string }>)
				.map((col) => col.name)
		);

		const rows = db.prepare('SELECT * FROM cookies ORDER BY rowid').all() as Array<Record<string, unknown>>;
		db.close();

		log.info(`readChromiumCookies: ${rows.length} rows from ${cookiesPath}`);

		const results: ICookieImportRawRow[] = [];
		for (const row of rows) {
			const domain = row.host_key as string;
			const name = row.name as string;
			if (!domain || !name) {
				continue;
			}

			const encRaw = row.encrypted_value;
			const encBuf = encRaw instanceof Uint8Array ? Buffer.from(encRaw) : null;
			const plainRaw = row.value;

			const outcome = decryptCookieValue(
				encBuf,
				plainRaw instanceof Uint8Array ? Buffer.from(plainRaw) : (typeof plainRaw === 'string' ? plainRaw : null),
				keyResult,
				keyringUnavailable
			);

			const value = outcome.status === 'ok'
				? outcome.value.toString('latin1')
				: '';

			const partitionSite = columns.has('top_frame_site_key')
				? (row.top_frame_site_key as string ?? '')
				: '';
			const hasCrossSiteAncestor = columns.has('has_cross_site_ancestor')
				? readSqliteFlag(row.has_cross_site_ancestor)
				: null;

			results.push({
				domain,
				name,
				value,
				path: (row.path as string) || '/',
				secure: row.is_secure === 1n || row.is_secure === 1,
				httpOnly: row.is_httponly === 1n || row.is_httponly === 1,
				sameSite: chromiumSameSite(Number(row.samesite ?? 0)),
				expirationDate: chromiumTimestampToUnix(row.expires_utc as bigint) || undefined,
				partitionSite,
				hasCrossSiteAncestor,
				firefoxPartitionedAttribute: null,
				decryptOutcome: outcome.status
			});
		}

		return results;
	} catch (err) {
		log.error(`readChromiumCookies: query failed: ${String(err)}`);
		return [];
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Firefox SQLite reader
// ---------------------------------------------------------------------------

function firefoxSameSite(raw: number): ICookieImportRawRow['sameSite'] {
	switch (raw) {
		case 0: return 'no_restriction';
		case 1: return 'lax';
		case 2: return 'strict';
		default: return 'unspecified';
	}
}

/**
 * Reads cookies from a Firefox `cookies.sqlite` database. Firefox stores
 * cookie values in plaintext — no decryption needed.
 */
export function readFirefoxCookies(cookiesPath: string): ICookieImportRawRow[] {
	const log = getLogger();
	const tmpDir = mkdtempSync(join(tmpdir(), 'vscode-cookie-import-ff-'));
	const tmpCookiesPath = join(tmpDir, 'cookies.sqlite');

	try {
		copyFileSync(cookiesPath, tmpCookiesPath);
		for (const suffix of ['-wal', '-shm'] as const) {
			const sidecar = cookiesPath + suffix;
			if (existsSync(sidecar)) {
				try {
					copyFileSync(sidecar, tmpCookiesPath + suffix);
				} catch { /* best-effort */ }
			}
		}
	} catch (err) {
		rmSync(tmpDir, { recursive: true, force: true });
		log.error(`readFirefoxCookies: could not copy ${cookiesPath}: ${String(err)}`);
		return [];
	}

	try {
		const { DatabaseSync } = loadSqlite();
		const db = new DatabaseSync(tmpCookiesPath, { readOnly: true });

		const columns = new Set(
			(db.prepare('PRAGMA table_info(moz_cookies)').all() as Array<{ name: string }>)
				.map((col) => col.name)
		);

		const partitionColumn = columns.has('isPartitionedAttributeSet')
			? ', isPartitionedAttributeSet'
			: '';

		const rows = db.prepare(
			`SELECT name, value, host, path, expiry, isSecure, isHttpOnly, sameSite${partitionColumn} FROM moz_cookies`
		).all() as Array<Record<string, unknown>>;
		db.close();

		log.info(`readFirefoxCookies: ${rows.length} rows from ${cookiesPath}`);

		const now = Math.floor(Date.now() / 1000);
		const results: ICookieImportRawRow[] = [];

		for (const row of rows) {
			const name = row.name as string;
			const host = row.host as string;
			if (!name || !host) {
				continue;
			}
			const expiry = row.expiry as number;
			if (expiry > 0 && expiry < now) {
				continue;
			}

			results.push({
				domain: host,
				name,
				value: (row.value as string) ?? '',
				path: (row.path as string) || '/',
				secure: row.isSecure === 1,
				httpOnly: row.isHttpOnly === 1,
				sameSite: firefoxSameSite(row.sameSite as number),
				expirationDate: expiry > 0 ? expiry : undefined,
				partitionSite: '',
				hasCrossSiteAncestor: null,
				firefoxPartitionedAttribute: columns.has('isPartitionedAttributeSet')
					? readSqliteFlag(row.isPartitionedAttributeSet)
					: null,
				decryptOutcome: 'ok'
			});
		}

		return results;
	} catch (err) {
		log.error(`readFirefoxCookies: query failed: ${String(err)}`);
		return [];
	} finally {
		rmSync(tmpDir, { recursive: true, force: true });
	}
}

// ---------------------------------------------------------------------------
// Safari binary cookies reader
// ---------------------------------------------------------------------------

const MAC_EPOCH_DELTA = 978_307_200;

/**
 * Reads cookies from Safari's `Cookies.binarycookies` file. This is a custom
 * binary format — not SQLite.
 */
export function readSafariCookies(filePath: string): ICookieImportRawRow[] {
	const log = getLogger();
	let data: Buffer;
	try {
		data = readFileSync(filePath);
	} catch (err) {
		log.error(`readSafariCookies: could not read ${filePath}: ${String(err)}`);
		return [];
	}

	if (data.length < 8 || data.subarray(0, 4).toString('utf8') !== 'cook') {
		log.warn('readSafariCookies: invalid magic header');
		return [];
	}

	const pageCount = data.readUInt32BE(4);
	let cursor = 8;
	if (cursor + pageCount * 4 > data.length) {
		return [];
	}

	const pageSizes: number[] = [];
	for (let i = 0; i < pageCount; i++) {
		pageSizes.push(data.readUInt32BE(cursor));
		cursor += 4;
	}

	const results: ICookieImportRawRow[] = [];
	for (const pageSize of pageSizes) {
		const page = data.subarray(cursor, cursor + pageSize);
		cursor += pageSize;
		decodeSafariPage(page, results);
	}

	log.info(`readSafariCookies: ${results.length} cookies from ${filePath}`);
	return results;
}

function decodeSafariPage(page: Buffer, out: ICookieImportRawRow[]): void {
	if (page.length < 16 || page.readUInt32BE(0) !== 0x00000100) {
		return;
	}
	const cookieCount = page.readUInt32LE(4);
	if (8 + cookieCount * 4 > page.length) {
		return;
	}
	const offsets: number[] = [];
	let cursor = 8;
	for (let i = 0; i < cookieCount; i++) {
		offsets.push(page.readUInt32LE(cursor));
		cursor += 4;
	}
	for (const offset of offsets) {
		const cookie = decodeSafariCookie(page, offset);
		if (cookie) {
			out.push(cookie);
		}
	}
}

function decodeSafariCookie(buf: Buffer, offset: number): ICookieImportRawRow | null {
	if (offset + 48 > buf.length) {
		return null;
	}
	const size = Math.min(buf.readUInt32LE(offset), buf.length - offset);
	if (size < 48) {
		return null;
	}

	const flags = buf.readUInt32LE(offset + 8);
	const secure = (flags & 1) !== 0;
	const httpOnly = (flags & 4) !== 0;

	const urlOffset = buf.readUInt32LE(offset + 16);
	const nameOffset = buf.readUInt32LE(offset + 20);
	const pathOffset = buf.readUInt32LE(offset + 24);
	const valueOffset = buf.readUInt32LE(offset + 28);
	const expiration = size >= 48 ? buf.readDoubleLE(offset + 40) : 0;

	const name = readCString(buf, offset + nameOffset, offset + size);
	if (!name) {
		return null;
	}
	const value = readCString(buf, offset + valueOffset, offset + size) ?? '';
	const path = readCString(buf, offset + pathOffset, offset + size) ?? '/';
	const rawUrl = readCString(buf, offset + urlOffset, offset + size) ?? '';

	// Safari stores the domain in the URL field.
	const domain = rawUrl.startsWith('.') ? rawUrl : rawUrl || null;
	if (!domain) {
		return null;
	}

	const expirationDate = expiration > 0 ? Math.round(expiration + MAC_EPOCH_DELTA) : undefined;

	return {
		domain,
		name,
		value,
		path,
		secure,
		httpOnly,
		sameSite: 'unspecified',
		expirationDate,
		partitionSite: '',
		hasCrossSiteAncestor: null,
		firefoxPartitionedAttribute: null,
		decryptOutcome: 'ok'
	};
}

function readCString(buf: Buffer, start: number, end: number): string | null {
	if (start < 0 || start >= end) {
		return null;
	}
	let cursor = start;
	while (cursor < end && buf[cursor] !== 0) {
		cursor++;
	}
	if (cursor >= end) {
		return null;
	}
	return buf.toString('utf8', start, cursor);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readSqliteFlag(raw: unknown): boolean | null {
	if (typeof raw === 'boolean') {
		return raw;
	}
	if (typeof raw === 'bigint') {
		return raw === 0n ? false : raw === 1n ? true : null;
	}
	if (typeof raw === 'number') {
		return raw === 0 ? false : raw === 1 ? true : null;
	}
	return null;
}
