/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { execFileSync } from 'child_process';
import { pbkdf2Sync } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from '../../../base/common/path.js';
import { getLogger } from './browserCookieImportLog.js';
import type { BrowserCookieImportFamily } from '../common/browserCookieImport.js';
import { getChromiumKeychainIdentifiers } from './browserCookieImportDetect.js';

/**
 * Chromium uses PBKDF2 with a fixed salt and iteration count to derive the
 * AES-128-CBC key from the keychain password on macOS and Linux. Windows uses
 * DPAPI-protected AES-256-GCM instead, so this constant only applies to the
 * CBC path.
 */
const PBKDF2_ITERATIONS = 1003;
const PBKDF2_KEY_LENGTH = 16;
const PBKDF2_SALT = 'saltysalt';

/**
 * Linux v10 cookies use a hardcoded password when no OS key storage is
 * available. Kept as a constant so the derivation is trivially auditable.
 */
const LINUX_V10_PASSWORD = 'peanuts';

/**
 * Result of extracting the encryption key for a Chromium browser. The shape
 * diverges by platform because macOS/Linux share AES-128-CBC (with per-version
 * keys) while Windows uses AES-256-GCM with a single key.
 *
 * `keyringUnavailable` is set when Linux v11 cookies cannot be decrypted
 * because no keyring password could be retrieved — the caller uses it to
 * attribute failures to a specific remediation ("install gnome-keyring")
 * instead of a generic "could not decrypt".
 */
export type BrowserCookieImportEncryptionKeyResult =
	| {
		readonly mode: 'aes-128-cbc';
		readonly keysByVersion: Partial<Record<'v10' | 'v11', Buffer>>;
		readonly keyringUnavailable?: boolean;
	}
	| {
		readonly mode: 'aes-256-gcm';
		readonly key: Buffer;
	};

/**
 * Top-level entry point. Resolves the keychain identifiers for the browser
 * family and dispatches to the platform-specific extractor. Returns `null`
 * when extraction fails for any reason — callers treat null as "this browser's
 * cookies cannot be decrypted" and surface a family-specific error.
 */
export function getEncryptionKey(
	family: BrowserCookieImportFamily,
	browserDataRoot?: string
): BrowserCookieImportEncryptionKeyResult | null {
	const ids = getChromiumKeychainIdentifiers(family);
	if (!ids) {
		return null;
	}
	if (process.platform === 'darwin') {
		return getMacEncryptionKey(ids.service, ids.account);
	}
	if (process.platform === 'linux') {
		return getLinuxEncryptionKey(ids.service, ids.account);
	}
	if (process.platform === 'win32') {
		return getWindowsEncryptionKey(family, browserDataRoot);
	}
	return null;
}

/**
 * macOS: retrieve the keychain password via `security find-generic-password`
 * and derive the AES-128-CBC key with PBKDF2. Only `v10` cookies exist on
 * macOS — Chromium does not write `v11` there because the Keychain is always
 * available.
 */
function getMacEncryptionKey(
	keychainService: string,
	keychainAccount: string
): BrowserCookieImportEncryptionKeyResult | null {
	try {
		const raw = execFileSync(
			'security',
			['find-generic-password', '-s', keychainService, '-a', keychainAccount, '-w'],
			{ encoding: 'utf-8', timeout: 30_000 }
		).trim();
		if (!raw) {
			getLogger().warn(`browserCookieImportKeys: macOS keychain returned empty password for ${keychainService}`);
			return null;
		}
		return {
			mode: 'aes-128-cbc',
			keysByVersion: {
				v10: pbkdf2Sync(raw, PBKDF2_SALT, PBKDF2_ITERATIONS, PBKDF2_KEY_LENGTH, 'sha1')
			}
		};
	} catch (err) {
		getLogger().warn(`browserCookieImportKeys: macOS keychain lookup failed for ${keychainService}: ${String(err)}`);
		return null;
	}
}

/**
 * Linux: Chromium writes `v10` with the hardcoded `peanuts` password when no
 * OS key storage is configured, and `v11` with a keyring-derived password when
 * one is. Both are AES-128-CBC with a single-iteration PBKDF2.
 *
 * The v11 lookup tries two `secret-tool` shapes — the Chromium-standard
 * `service`/`account` pair first, then the application-based fallback that
 * newer Chromium versions use. When neither resolves, v11 cookies become
 * undecryptable and the `keyringUnavailable` flag is set so the caller can
 * attribute the failure correctly.
 */
function getLinuxEncryptionKey(
	keychainService: string,
	keychainAccount: string
): BrowserCookieImportEncryptionKeyResult {
	const v10Key = pbkdf2Sync(LINUX_V10_PASSWORD, PBKDF2_SALT, 1, PBKDF2_KEY_LENGTH, 'sha1');

	let keyringPassword = '';
	try {
		keyringPassword = execFileSync(
			'secret-tool',
			['lookup', 'service', keychainService, 'account', keychainAccount],
			{ encoding: 'utf-8', timeout: 5_000 }
		).trim();
	} catch {
		try {
			const app = keychainAccount.toLowerCase().replaceAll(' ', '');
			keyringPassword = execFileSync(
				'secret-tool',
				['lookup', 'application', app],
				{ encoding: 'utf-8', timeout: 5_000 }
			).trim();
		} catch {
			getLogger().info('browserCookieImportKeys: Linux keyring unavailable — v11 cookies cannot be decrypted');
		}
	}

	if (!keyringPassword) {
		return {
			mode: 'aes-128-cbc',
			keysByVersion: { v10: v10Key },
			keyringUnavailable: true
		};
	}

	const v11Key = pbkdf2Sync(keyringPassword, PBKDF2_SALT, 1, PBKDF2_KEY_LENGTH, 'sha1');
	return {
		mode: 'aes-128-cbc',
		keysByVersion: { v10: v10Key, v11: v11Key }
	};
}

/**
 * Windows: Chromium stores a DPAPI-protected AES-256-GCM master key in the
 * browser's `Local State` JSON file under `os_crypt.encrypted_key`. The
 * base64 payload starts with the ASCII bytes `DPAPI`; the remainder is
 * unwrapped by PowerShell via the user-scoped ProtectedData API.
 *
 * PowerShell is used instead of a native addon so the build has no
 * platform-specific binaries — the ProtectedData assembly is part of the
 * .NET Framework that ships with every supported Windows version.
 *
 * `browserDataRoot` lets the caller override the default user-data location
 * (used by tests and by profiles installed in non-default locations).
 */
function getWindowsEncryptionKey(
	family: BrowserCookieImportFamily,
	browserDataRoot: string | undefined
): BrowserCookieImportEncryptionKeyResult | null {
	const root = browserDataRoot ?? getDefaultWindowsBrowserRoot(family);
	if (!root) {
		return null;
	}

	const localStatePath = join(root, 'Local State');
	if (!existsSync(localStatePath)) {
		getLogger().warn(`browserCookieImportKeys: Local State not found at ${localStatePath}`);
		return null;
	}

	try {
		const raw = readFileSync(localStatePath, 'utf-8');
		const localState = JSON.parse(raw) as { os_crypt?: { encrypted_key?: string } };
		const encryptedKeyB64 = localState?.os_crypt?.encrypted_key;
		if (typeof encryptedKeyB64 !== 'string') {
			getLogger().warn('browserCookieImportKeys: os_crypt.encrypted_key missing from Local State');
			return null;
		}

		const encryptedKey = Buffer.from(encryptedKeyB64, 'base64');
		const dpapiPrefix = Buffer.from('DPAPI', 'utf-8');
		if (!encryptedKey.subarray(0, dpapiPrefix.length).equals(dpapiPrefix)) {
			getLogger().warn('browserCookieImportKeys: encrypted_key is missing DPAPI prefix');
			return null;
		}

		const dpapiData = encryptedKey.subarray(dpapiPrefix.length).toString('base64');
		const script = [
			'try { Add-Type -AssemblyName System.Security.Cryptography.ProtectedData -ErrorAction Stop }',
			'catch { try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch {} };',
			'$in=[Convert]::FromBase64String([Console]::In.ReadLine());',
			'$out=[System.Security.Cryptography.ProtectedData]::Unprotect($in,$null,',
			'[System.Security.Cryptography.DataProtectionScope]::CurrentUser);',
			'[Convert]::ToBase64String($out)'
		].join('');

		const result = execFileSync(
			'powershell',
			['-NoProfile', '-NonInteractive', '-Command', script],
			{ encoding: 'utf-8', timeout: 10_000, input: dpapiData }
		).trim();

		if (!result) {
			getLogger().warn('browserCookieImportKeys: PowerShell DPAPI returned empty output');
			return null;
		}

		return { key: Buffer.from(result, 'base64'), mode: 'aes-256-gcm' };
	} catch (err) {
		getLogger().warn(`browserCookieImportKeys: Windows DPAPI extraction failed: ${String(err)}`);
		return null;
	}
}

/**
 * Resolves the default Windows user-data root for a Chromium browser from the
 * standard `LOCALAPPDATA` layout. Returns `null` when the browser does not
 * ship on Windows or `LOCALAPPDATA` is unset.
 */
function getDefaultWindowsBrowserRoot(family: BrowserCookieImportFamily): string | null {
	const winRoots: Partial<Record<BrowserCookieImportFamily, string>> = {
		chrome: 'Google/Chrome/User Data',
		edge: 'Microsoft/Edge/User Data',
		chromium: 'BraveSoftware/Brave-Browser/User Data',
		comet: 'Comet/User Data'
	};
	const winRoot = winRoots[family];
	if (!winRoot) {
		return null;
	}
	const localAppData = process.env.LOCALAPPDATA ?? '';
	if (!localAppData) {
		return null;
	}
	return join(localAppData, winRoot);
}
