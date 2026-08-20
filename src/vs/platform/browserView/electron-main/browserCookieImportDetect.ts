/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from '../../../base/common/path.js';
import type {
	BrowserCookieImportFamily,
	IBrowserCookieImportDetectedBrowser,
	IBrowserCookieImportProfile
} from '../common/browserCookieImport.js';

/**
 * Definition of a Chromium-based browser used to locate its data directory
 * and keychain identifiers on each platform. Fields are optional per-platform
 * because not every browser ships everywhere.
 */
interface IChromiumBrowserDef {
	readonly family: BrowserCookieImportFamily;
	readonly label: string;
	readonly keychainService: string;
	readonly keychainAccount: string;
	readonly macRoot?: string;
	readonly winRoot?: string;
	readonly linuxRoot?: string;
}

/**
 * Chromium browsers supported by the detector. Order determines priority when
 * multiple browsers are installed — the first detected wins the default slot
 * in the picker.
 *
 * Aligned with Orca's `CHROMIUM_BROWSERS` table so family ids, keychain
 * service names, and data-dir roots match exactly.
 */
const CHROMIUM_BROWSERS: readonly IChromiumBrowserDef[] = [
	{
		family: 'chrome',
		label: 'Google Chrome',
		keychainService: 'Chrome Safe Storage',
		keychainAccount: 'Chrome',
		macRoot: 'Google/Chrome',
		winRoot: 'Google/Chrome/User Data',
		linuxRoot: 'google-chrome'
	},
	{
		family: 'edge',
		label: 'Microsoft Edge',
		keychainService: 'Microsoft Edge Safe Storage',
		keychainAccount: 'Microsoft Edge',
		macRoot: 'Microsoft Edge',
		winRoot: 'Microsoft/Edge/User Data',
		linuxRoot: 'microsoft-edge'
	},
	{
		family: 'arc',
		label: 'Arc',
		keychainService: 'Arc Safe Storage',
		keychainAccount: 'Arc',
		macRoot: 'Arc/User Data'
	},
	{
		family: 'chromium',
		label: 'Brave',
		keychainService: 'Brave Safe Storage',
		keychainAccount: 'Brave',
		macRoot: 'BraveSoftware/Brave-Browser',
		winRoot: 'BraveSoftware/Brave-Browser/User Data',
		linuxRoot: 'BraveSoftware/Brave-Browser'
	},
	{
		family: 'comet',
		label: 'Comet',
		keychainService: 'Comet Safe Storage',
		keychainAccount: 'Comet',
		macRoot: 'Comet',
		winRoot: 'Comet/User Data'
	},
	{
		family: 'helium',
		label: 'Helium',
		keychainService: 'Helium Storage Key',
		keychainAccount: 'Helium',
		macRoot: 'net.imput.helium'
	}
];

/**
 * Resolves the platform-specific root directory for a Chromium browser's
 * user data. Returns `null` when the browser does not ship on this platform.
 */
function browserRootPath(def: IChromiumBrowserDef): string | null {
	if (process.platform === 'darwin') {
		if (!def.macRoot) {
			return null;
		}
		const home = process.env.HOME ?? '';
		return join(home, 'Library', 'Application Support', def.macRoot);
	}
	if (process.platform === 'win32') {
		if (!def.winRoot) {
			return null;
		}
		const localAppData = process.env.LOCALAPPDATA ?? '';
		if (!localAppData) {
			return null;
		}
		return join(localAppData, def.winRoot);
	}
	// Linux
	if (!def.linuxRoot) {
		return null;
	}
	const configHome = process.env.XDG_CONFIG_HOME ?? join(process.env.HOME ?? '', '.config');
	return join(configHome, def.linuxRoot);
}

/**
 * Validates that a profile directory name is safe to join into a filesystem
 * path. Rejects traversal characters, null bytes, and path separators that
 * could let a compromised renderer escape the browser data directory.
 */
export function isSafeBrowserProfileDirectory(directory: string): boolean {
	return (
		directory.length > 0 &&
		directory !== '.' &&
		!directory.includes('\0') &&
		!directory.includes('/') &&
		!directory.includes('\\') &&
		!directory.includes('..')
	);
}

/**
 * Discovers browser profiles from Chromium's `Local State` JSON file. Falls
 * back to a single `Default` profile when the metadata file is missing or
 * unreadable.
 */
function discoverProfiles(browserRoot: string): IBrowserCookieImportProfile[] {
	try {
		const localStatePath = join(browserRoot, 'Local State');
		if (!existsSync(localStatePath)) {
			return [{ name: 'Default', directory: 'Default' }];
		}
		const raw = readFileSync(localStatePath, 'utf-8');
		const localState = JSON.parse(raw) as { profile?: { info_cache?: Record<string, { name?: string }> } };
		const infoCache = localState?.profile?.info_cache;
		if (!infoCache || typeof infoCache !== 'object') {
			return [{ name: 'Default', directory: 'Default' }];
		}
		const profiles: IBrowserCookieImportProfile[] = [];
		for (const [dir, info] of Object.entries(infoCache)) {
			if (!isSafeBrowserProfileDirectory(dir)) {
				continue;
			}
			const profileName = info?.name ?? dir;
			profiles.push({ name: profileName, directory: dir });
		}
		return profiles.length > 0 ? profiles : [{ name: 'Default', directory: 'Default' }];
	} catch {
		return [{ name: 'Default', directory: 'Default' }];
	}
}

/**
 * Resolves the Cookies database path inside a Chromium profile directory.
 * Chromium 96+ moved the DB under `Network/`; older profiles keep it at the
 * profile root. Returns `null` when neither location exists.
 */
export function resolveChromiumCookiesPath(profileDir: string): string | null {
	const networkPath = join(profileDir, 'Network', 'Cookies');
	if (existsSync(networkPath)) {
		return networkPath;
	}
	const legacyPath = join(profileDir, 'Cookies');
	return existsSync(legacyPath) ? legacyPath : null;
}

// ---------------------------------------------------------------------------
// Firefox detection
// ---------------------------------------------------------------------------

function firefoxProfilesRoot(): string | null {
	if (process.platform === 'darwin') {
		const home = process.env.HOME ?? '';
		return join(home, 'Library', 'Application Support', 'Firefox', 'Profiles');
	}
	if (process.platform === 'win32') {
		const appData = process.env.APPDATA ?? '';
		return appData ? join(appData, 'Mozilla', 'Firefox', 'Profiles') : null;
	}
	const home = process.env.HOME ?? '';
	return join(home, '.mozilla', 'firefox');
}

function discoverFirefoxProfiles(): IBrowserCookieImportProfile[] {
	const profilesRoot = firefoxProfilesRoot();
	if (!profilesRoot) {
		return [];
	}
	try {
		if (!existsSync(profilesRoot)) {
			return [];
		}
		const entries = readdirSync(profilesRoot, { withFileTypes: true })
			.filter((e) => e.isDirectory())
			.map((e) => e.name);
		// Prefer 'default-release' as the primary profile on most installs.
		const sorted = entries.sort((a, b) => {
			if (a.includes('default-release')) { return -1; }
			if (b.includes('default-release')) { return 1; }
			if (a.includes('default')) { return -1; }
			if (b.includes('default')) { return 1; }
			return 0;
		});
		return sorted.map((dir) => {
			const label = dir.includes('.') ? dir.split('.').slice(1).join('.') : dir;
			return { name: label, directory: dir };
		});
	} catch {
		return [];
	}
}

function detectFirefox(): IBrowserCookieImportDetectedBrowser | null {
	const profilesRoot = firefoxProfilesRoot();
	if (!profilesRoot) {
		return null;
	}
	const profiles = discoverFirefoxProfiles();
	for (const profile of profiles) {
		const cookiesPath = join(profilesRoot, profile.directory, 'cookies.sqlite');
		if (existsSync(cookiesPath)) {
			return {
				family: 'firefox',
				label: 'Firefox',
				profiles,
				selectedProfile: profile.directory
			};
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Safari detection (macOS only)
// ---------------------------------------------------------------------------

function detectSafari(): IBrowserCookieImportDetectedBrowser | null {
	if (process.platform !== 'darwin') {
		return null;
	}
	const home = process.env.HOME ?? '';
	const candidates = [
		join(home, 'Library', 'Cookies', 'Cookies.binarycookies'),
		join(home, 'Library', 'Containers', 'com.apple.Safari', 'Data', 'Library', 'Cookies', 'Cookies.binarycookies')
	];
	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return {
				family: 'safari',
				label: 'Safari',
				profiles: [{ name: 'Default', directory: 'Default' }],
				selectedProfile: 'Default'
			};
		}
	}
	return null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects all installed browsers on the host machine that have at least one
 * profile with a cookies database. The returned list is suitable for sending
 * across IPC to the renderer — filesystem paths and keychain identifiers are
 * intentionally excluded.
 */
export function detectInstalledBrowsers(): IBrowserCookieImportDetectedBrowser[] {
	const detected: IBrowserCookieImportDetectedBrowser[] = [];

	for (const browser of CHROMIUM_BROWSERS) {
		const root = browserRootPath(browser);
		if (!root) {
			continue;
		}
		const profiles = discoverProfiles(root);
		// A browser counts as detected once a profile has a cookies DB.
		for (const profile of profiles) {
			const profileDir = join(root, profile.directory);
			const cookiesPath = resolveChromiumCookiesPath(profileDir);
			if (cookiesPath) {
				detected.push({
					family: browser.family,
					label: browser.label,
					profiles,
					selectedProfile: profile.directory
				});
				break;
			}
		}
	}

	const firefox = detectFirefox();
	if (firefox) {
		detected.push(firefox);
	}

	const safari = detectSafari();
	if (safari) {
		detected.push(safari);
	}

	return detected;
}

/**
 * Resolves a specific profile selection to a detected browser with updated
 * cookies path. Returns `null` when the profile directory is unsafe or the
 * cookies database does not exist.
 */
export function selectBrowserProfile(
	browser: IBrowserCookieImportDetectedBrowser,
	profileDirectory: string
): IBrowserCookieImportDetectedBrowser | null {
	if (!isSafeBrowserProfileDirectory(profileDirectory)) {
		return null;
	}

	if (browser.family === 'firefox') {
		const profilesRoot = firefoxProfilesRoot();
		if (!profilesRoot) {
			return null;
		}
		const cookiesPath = join(profilesRoot, profileDirectory, 'cookies.sqlite');
		if (!existsSync(cookiesPath)) {
			return null;
		}
		return { ...browser, selectedProfile: profileDirectory };
	}

	const browserDef = CHROMIUM_BROWSERS.find((b) => b.family === browser.family);
	if (!browserDef) {
		return null;
	}
	const root = browserRootPath(browserDef);
	if (!root) {
		return null;
	}
	const profileDir = join(root, profileDirectory);
	const cookiesPath = resolveChromiumCookiesPath(profileDir);
	if (!cookiesPath) {
		return null;
	}
	return { ...browser, selectedProfile: profileDirectory };
}

/**
 * Returns the keychain service and account names for a Chromium browser
 * family. Used by the encryption key extraction module. Returns `null` for
 * non-Chromium browsers (Firefox/Safari don't use Chromium encryption).
 */
export function getChromiumKeychainIdentifiers(
	family: BrowserCookieImportFamily
): { service: string; account: string } | null {
	const def = CHROMIUM_BROWSERS.find((b) => b.family === family);
	if (!def) {
		return null;
	}
	return { service: def.keychainService, account: def.keychainAccount };
}

/**
 * Resolves the full filesystem path to the cookies database for a detected
 * browser. This is the primary entry point for callers that need to read
 * cookies — it handles all the platform-specific path construction that the
 * detector knows about.
 *
 * Returns `null` when the database file does not exist or the browser family
 * is not recognized.
 */
export function resolveCookieSourcePath(
	family: BrowserCookieImportFamily,
	profileDirectory: string
): string | null {
	if (family === 'firefox') {
		const profilesRoot = firefoxProfilesRoot();
		if (!profilesRoot) {
			return null;
		}
		const cookiesPath = join(profilesRoot, profileDirectory, 'cookies.sqlite');
		return existsSync(cookiesPath) ? cookiesPath : null;
	}

	if (family === 'safari') {
		// Safari stores cookies in a fixed location, not per-profile.
		const home = process.env.HOME ?? '';
		const candidates = [
			join(home, 'Library', 'Cookies', 'Cookies.binarycookies'),
			join(home, 'Library', 'Containers', 'com.apple.Safari', 'Data', 'Library', 'Cookies', 'Cookies.binarycookies')
		];
		for (const candidate of candidates) {
			if (existsSync(candidate)) {
				return candidate;
			}
		}
		return null;
	}

	// Chromium-based browsers.
	const browserDef = CHROMIUM_BROWSERS.find((b) => b.family === family);
	if (!browserDef) {
		return null;
	}
	const root = browserRootPath(browserDef);
	if (!root) {
		return null;
	}
	const profileDir = join(root, profileDirectory);
	return resolveChromiumCookiesPath(profileDir);
}
