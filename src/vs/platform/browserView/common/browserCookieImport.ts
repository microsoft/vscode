/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Shared types for the browser cookie import feature.
 *
 * These types flow across the main/shared/renderer process boundary via
 * ProxyChannel IPC. Keep them pure data — no classes, no methods, no imports
 * from electron-main or workbench.
 *
 * Aligned with Orca's `browser-workspace-types.ts` contract so the import
 * summary, warning codes, and result shape match what the renderer UI already
 * knows how to render.
 */

/**
 * Browser families the detector can find on the host machine.
 *
 * `chromium` is the Brave family id (kept for compatibility with Orca's
 * `CHROMIUM_BROWSERS` table where Brave maps to the `chromium` family slot).
 * `manual` marks imports that came from a user-picked JSON file rather than
 * a detected browser profile.
 */
export type BrowserCookieImportFamily =
	| 'chrome'
	| 'edge'
	| 'arc'
	| 'chromium'
	| 'comet'
	| 'helium'
	| 'firefox'
	| 'safari'
	| 'manual';

/**
 * A single browser profile as discovered on disk. The `directory` segment is
 * a safe path component (validated by `isSafeBrowserProfileDirectory` in the
 * detector) — it is never joined with user-supplied traversal characters.
 */
export interface IBrowserCookieImportProfile {
	readonly name: string;
	readonly directory: string;
}

/**
 * A detected browser on the host machine. The renderer receives this shape
 * to populate the import picker. Filesystem paths and keychain identifiers
 * are stripped before crossing the IPC boundary — see
 * `browser-session-profile-ipc.ts` in Orca for the precedent.
 */
export interface IBrowserCookieImportDetectedBrowser {
	readonly family: BrowserCookieImportFamily;
	readonly label: string;
	readonly profiles: readonly IBrowserCookieImportProfile[];
	readonly selectedProfile: string;
}

/**
 * Warning attached to a successful import when some cookies could not be
 * carried over. The renderer reads `code` to pick a localized message and
 * `reason` to surface a specific remediation step (install gnome-keyring,
 * grant Full Disk Access, update the client).
 */
export interface IBrowserCookieImportWarning {
	readonly code: 'cookies-undecryptable' | 'restart-fallback-unavailable';
	readonly failedCookies: number;
	readonly reason?: 'app-bound-encryption' | 'linux-keyring-unavailable' | 'unknown';
	readonly otherFailedCookies?: number;
	readonly loadedCookies?: number;
}

/**
 * Summary of a completed import. Counts are additive:
 *   totalCookies === importedCookies + skippedCookies
 * `partitionSkippedCookies` and `googleCookiesSkipped` are breakdowns of
 * `skippedCookies`, never additions to it (STA-4300 invariant).
 */
export interface IBrowserCookieImportSummary {
	readonly totalCookies: number;
	readonly importedCookies: number;
	readonly skippedCookies: number;
	readonly googleCookiesSkipped?: number;
	readonly partitionSkippedCookies?: number;
	readonly domains: readonly string[];
	readonly warning?: IBrowserCookieImportWarning;
}

export interface IBrowserCookieImportSuccess {
	readonly ok: true;
	readonly summary: IBrowserCookieImportSummary;
}

export interface IBrowserCookieImportFailure {
	readonly ok: false;
	readonly reason: string;
}

export type BrowserCookieImportResult =
	| IBrowserCookieImportSuccess
	| IBrowserCookieImportFailure;

/**
 * Parameters for an import-from-browser request. The renderer sends the
 * family the user picked plus an optional non-default profile directory;
 * the main process resolves the cookies DB path from those.
 */
export interface IBrowserCookieImportFromBrowserParams {
	readonly browserFamily: BrowserCookieImportFamily;
	readonly browserProfile?: string;
}

/**
 * Parameters for an import-from-file request. When `filePath` is omitted the
 * main process opens a native file picker dialog.
 */
export interface IBrowserCookieImportFromFileParams {
	readonly filePath?: string;
}
