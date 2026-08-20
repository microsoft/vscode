/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { session } from 'electron';
import { readFileSync } from 'fs';
import { join } from '../../../base/common/path.js';
import type {
	BrowserCookieImportFamily,
	BrowserCookieImportResult,
	IBrowserCookieImportDetectedBrowser,
	IBrowserCookieImportFromFileParams,
	IBrowserCookieImportFromBrowserParams,
	IBrowserCookieImportSummary,
	IBrowserCookieImportWarning
} from '../common/browserCookieImport.js';
import { detectInstalledBrowsers, resolveCookieSourcePath, selectBrowserProfile } from './browserCookieImportDetect.js';
import { getEncryptionKey } from './browserCookieImportKeys.js';
import { readChromiumCookies, readFirefoxCookies, readSafariCookies } from './browserCookieImportReaders.js';
import { planImportWrites, registrableFamily, type IImportWritePlanItem, type IImportSkipItem } from './browserCookieImportPlan.js';
import { BrowserCookieImportCdpSession, buildSetCookieParams } from './browserCookieImportStore.js';
import { removeTransplantableCookies, rollbackClear } from './browserCookieImportClear.js';
import { stageCookieDatabase, type IStagedCookieRow } from './browserCookieImportStaging.js';
import { getLogger } from './browserCookieImportLog.js';

/**
 * Main orchestrator for the browser cookie import pipeline.
 *
 * Pipeline stages:
 *   1. Detect / resolve source browser and profile
 *   2. Extract encryption key (Chromium only)
 *   3. Read cookies from source database
 *   4. Plan writes (two-pass family-atomic algorithm)
 *   5. Open CDP session on target Electron session
 *   6. Atomic clear of transplantable families
 *   7. Write cookies via CDP Network.setCookie
 *   8. Stage failures for cold-start swap-in
 *   9. Return summary
 *
 * Each stage is independently testable. The orchestrator is the only module
 * that touches Electron APIs directly (session.fromPartition).
 */

// ---------------------------------------------------------------------------
// Public API — called from IPC handlers
// ---------------------------------------------------------------------------

/**
 * Returns the list of browsers detected on this machine. Safe to call from
 * any process; the renderer uses this to populate the import picker.
 */
export function detectBrowsersForImport(): IBrowserCookieImportDetectedBrowser[] {
	return detectInstalledBrowsers();
}

/**
 * Imports cookies from a detected browser profile into the given Electron
 * session partition. This is the primary entry point for the "import from
 * browser" flow.
 */
export async function importCookiesFromBrowser(
	params: IBrowserCookieImportFromBrowserParams,
	sessionPartition: string = 'persist:vscode-browser'
): Promise<BrowserCookieImportResult> {
	const log = getLogger();
	log.info(`importCookiesFromBrowser: family=${params.browserFamily} profile=${params.browserProfile ?? '(default)'}`);

	try {
		// 1. Resolve source browser profile.
		const detected = detectInstalledBrowsers();
		const browser = detected.find((b) => b.family === params.browserFamily);
		if (!browser) {
			return { ok: false, reason: `Browser family '${params.browserFamily}' not found on this machine` };
		}

		const profileDir = params.browserProfile
			? selectBrowserProfile(browser, params.browserProfile)?.selectedProfile
			: browser.selectedProfile;
		if (!profileDir) {
			return { ok: false, reason: `Profile '${params.browserProfile ?? '(default)'}' not found for ${browser.label}` };
		}

		// 2. Read cookies from source (synchronous — no I/O awaits).
		const rows = readSourceCookies(browser.family, profileDir);
		if (rows.length === 0) {
			return { ok: false, reason: 'No cookies found in the selected browser profile' };
		}
		log.info(`importCookiesFromBrowser: read ${rows.length} raw cookies`);

		// 3. Plan writes.
		const plan = planImportWrites(rows);
		if (plan.hasUnrepresentableSkip) {
			log.warn('importCookiesFromBrowser: unrepresentable skip family detected — refusing import');
			return { ok: false, reason: 'Some cookies belong to domain families that cannot be safely imported' };
		}
		log.info(`importCookiesFromBrowser: plan=${plan.writes.length} writes, ${plan.skips.length} skips`);

		// 4. Execute against the target session.
		return await executeImport(plan.writes, plan.skips, sessionPartition);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(`importCookiesFromBrowser: unhandled error: ${message}`);
		return { ok: false, reason: message };
	}
}

/**
 * Imports cookies from a JSON file (manual export). The file must contain
 * an array of cookie objects with at least `domain`, `name`, `value`, and
 * `path` fields.
 */
export async function importCookiesFromFile(
	params: IBrowserCookieImportFromFileParams,
	sessionPartition: string = 'persist:vscode-browser'
): Promise<BrowserCookieImportResult> {
	const log = getLogger();
	log.info(`importCookiesFromFile: path=${params.filePath ?? '(picker)'}`);

	// File picker is handled by the renderer — if filePath is missing here,
	// the caller should have opened a dialog first.
	if (!params.filePath) {
		return { ok: false, reason: 'No file path provided' };
	}

	try {
		// Read and parse JSON. readFileSync is imported at the top of this
		// module — runs in electron-main only.
		const raw = readFileSync(params.filePath, 'utf8');
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return { ok: false, reason: 'JSON file must contain an array of cookie objects' };
		}

		// Convert to ICookieImportRawRow shape. Manual imports have no
		// encryption or partition data.
		const rows = parsed.map((c: Record<string, unknown>) => ({
			domain: String(c.domain ?? ''),
			name: String(c.name ?? ''),
			value: String(c.value ?? ''),
			path: String(c.path ?? '/'),
			secure: Boolean(c.secure),
			httpOnly: Boolean(c.httpOnly),
			sameSite: normalizeSameSite(c.sameSite),
			expirationDate: typeof c.expirationDate === 'number' ? c.expirationDate : undefined,
			partitionSite: '',
			hasCrossSiteAncestor: null,
			firefoxPartitionedAttribute: null,
			decryptOutcome: 'ok' as const
		}));

		const plan = planImportWrites(rows);
		if (plan.hasUnrepresentableSkip) {
			return { ok: false, reason: 'Some cookies belong to domain families that cannot be safely imported' };
		}

		return await executeImport(plan.writes, plan.skips, sessionPartition);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(`importCookiesFromFile: ${message}`);
		return { ok: false, reason: message };
	}
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function normalizeSameSite(raw: unknown): 'unspecified' | 'no_restriction' | 'lax' | 'strict' {
	switch (String(raw).toLowerCase()) {
		case 'none': case 'no_restriction': return 'no_restriction';
		case 'lax': return 'lax';
		case 'strict': return 'strict';
		default: return 'unspecified';
	}
}

/**
 * Reads cookies from a source browser's database, handling encryption key
 * extraction and platform-specific DB paths.
 *
 * Uses {@link resolveCookieSourcePath} to convert the profile directory name
 * into a full absolute path for every browser family. This fixes the original
 * bug where the orchestrator passed raw profile names (e.g. `"Default"`) to
 * path resolvers that expected absolute filesystem paths.
 */
function readSourceCookies(
	family: BrowserCookieImportFamily,
	profileDirectory: string
): ReturnType<typeof readChromiumCookies> {
	const log = getLogger();

	// Resolve the full absolute path to the cookies database.
	const cookiesPath = resolveCookieSourcePath(family, profileDirectory);
	if (!cookiesPath) {
		log.warn(`readSourceCookies: could not resolve cookies path for ${family}/${profileDirectory}`);
		return [];
	}

	switch (family) {
		case 'chrome':
		case 'edge':
		case 'arc':
		case 'chromium':
		case 'comet':
		case 'helium': {
			// getEncryptionKey is synchronous — no await needed.
			const keyResult = getEncryptionKey(family);
			// BUG-5 fix: keyringUnavailable is a boolean property on the
			// aes-128-cbc branch, not a .status field.
			const keyringUnavailable = keyResult?.mode === 'aes-128-cbc'
				&& keyResult.keyringUnavailable === true;
			return readChromiumCookies(cookiesPath, keyResult ?? null, keyringUnavailable);
		}
		case 'firefox':
			return readFirefoxCookies(cookiesPath);
		case 'safari':
			return readSafariCookies(cookiesPath);
		default:
			log.warn(`readSourceCookies: unsupported family ${family}`);
			return [];
	}
}

/**
 * Executes the import write plan against the target Electron session.
 *
 * Flow:
 *   1. Open CDP session (hidden BrowserWindow bound to target session)
 *   2. Compute transplantable families from write set
 *   3. Atomic clear of those families (with snapshot)
 *   4. Write each cookie via CDP Network.setCookie
 *   5. On failure: rollback clear + stage failed cookies for cold-start
 *   6. Build and return summary
 */
async function executeImport(
	writes: readonly IImportWritePlanItem[],
	skips: readonly IImportSkipItem[],
	sessionPartition: string
): Promise<BrowserCookieImportResult> {
	const log = getLogger();
	const electronSession = session.fromPartition(sessionPartition);
	const cdpSession = new BrowserCookieImportCdpSession(electronSession);

	try {
		await cdpSession.attach();

		// Compute transplantable families.
		const transplantableFamilies = new Set<string>();
		for (const item of writes) {
			const family = registrableFamily(item.row.domain);
			if (family) {
				transplantableFamilies.add(family);
			}
		}

		// Atomic clear.
		const clearResult = await removeTransplantableCookies(cdpSession, transplantableFamilies);
		log.info(`executeImport: cleared ${clearResult.removedCount} existing cookies`);

		// Write phase.
		let importedCount = 0;
		const stagedRows: IStagedCookieRow[] = [];
		const domains = new Set<string>();

		for (const item of writes) {
			const partitionKey = item.partition.status === 'partitioned'
				? item.partition.topLevelSite
				: undefined;
			const params = buildSetCookieParams(item.row, partitionKey);
			const result = await cdpSession.writeCookie(params);

			if (result.ok) {
				importedCount++;
				domains.add(item.row.domain);
			} else {
				// Queue for cold-start staging.
				log.warn(`executeImport: CDP setCookie failed for ${item.row.name}@${item.row.domain}: ${result.error}`);
				stagedRows.push({
					domain: item.row.domain,
					name: item.row.name,
					value: item.row.value,
					path: item.row.path,
					secure: item.row.secure,
					httpOnly: item.row.httpOnly,
					sameSite: item.row.sameSite,
					expirationDate: item.row.expirationDate ?? 0,
					creationUtc: Date.now() * 1000, // us since epoch (approximate)
					lastAccessUtc: Date.now() * 1000,
					hasExpires: item.row.expirationDate !== undefined && item.row.expirationDate > 0,
					isPersistent: item.row.expirationDate !== undefined && item.row.expirationDate > 0,
					priority: 'medium',
					sourceScheme: item.row.secure ? 'secure' : 'non_secure',
					sourcePort: item.row.secure ? 443 : 80,
					partitionKey
				});
			}
		}

		// Stage failures for cold-start.
		let warning: IBrowserCookieImportWarning | undefined;
		if (stagedRows.length > 0) {
			const cookiesDbPath = join(electronSession.storagePath ?? '', 'Cookies');
			const stagedPath = await stageCookieDatabase(sessionPartition, cookiesDbPath, stagedRows);
			if (stagedPath) {
				warning = {
					code: 'restart-fallback-unavailable',
					failedCookies: stagedRows.length,
					reason: 'unknown',
					loadedCookies: importedCount
				};
				log.info(`executeImport: staged ${stagedRows.length} cookies at ${stagedPath}`);
			} else {
				// Staging also failed — rollback the clear so the user isn't
				// left with a partially emptied jar.
				log.warn('executeImport: staging failed, rolling back clear');
				await rollbackClear(cdpSession, clearResult.snapshot);
				return {
					ok: false,
					reason: `${stagedRows.length} cookies could not be written and staging failed`
				};
			}
		}

		// Count Google-skipped and partition-skipped from the skips array.
		let googleCookiesSkipped = 0;
		let partitionSkippedCookies = 0;
		for (const skip of skips) {
			if (skip.reason === 'google-source-bound' || skip.reason === 'non-transplantable-domain') {
				googleCookiesSkipped++;
			} else if (skip.reason === 'family-partition-unreadable') {
				partitionSkippedCookies++;
			}
		}

		const summary: IBrowserCookieImportSummary = {
			totalCookies: writes.length + skips.length,
			importedCookies: importedCount,
			skippedCookies: skips.length + stagedRows.length,
			googleCookiesSkipped: googleCookiesSkipped || undefined,
			partitionSkippedCookies: partitionSkippedCookies || undefined,
			domains: [...domains].sort(),
			warning
		};

		log.info(`executeImport: done — imported=${importedCount}, skipped=${summary.skippedCookies}, staged=${stagedRows.length}`);
		return { ok: true, summary };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		log.error(`executeImport: unhandled error: ${message}`);
		return { ok: false, reason: message };
	} finally {
		cdpSession.dispose();
	}
}
