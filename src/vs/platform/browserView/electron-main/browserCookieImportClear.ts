/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ICdpCookie, ICookieIdentity, BrowserCookieImportCdpSession } from './browserCookieImportStore.js';
import { cookieIdentityUrl } from './browserCookieImportHelpers.js';
import { getLogger } from './browserCookieImportLog.js';
import { registrableFamily } from './browserCookieImportPlan.js';

/**
 * A snapshot of a single cookie's identity + value, captured before removal
 * so it can be restored if the import fails. Only fields needed to recreate
 * the cookie via `Network.setCookie` are stored.
 */
export interface ICookieSnapshot {
	readonly name: string;
	readonly value: string;
	readonly domain: string;
	readonly path: string;
	readonly secure: boolean;
	readonly httpOnly: boolean;
	readonly sameSite: 'Strict' | 'Lax' | 'None' | 'Unspecified';
	readonly expires: number;
	readonly url: string;
}

/**
 * Result of an atomic clear operation. Contains the snapshot for rollback
 * and the count of cookies actually removed.
 */
export interface IAtomicClearResult {
	readonly removedCount: number;
	readonly snapshot: readonly ICookieSnapshot[];
}

/**
 * Determines whether a CDP cookie belongs to the set of domains that will
 * be overwritten by the import. We only clear cookies whose registrable
 * family appears in the write plan's domain set — this prevents nuking
 * unrelated cookies in the same jar.
 *
 * The `transplantableFamilies` set is computed from the write plan's
 * `writes` array before calling this function.
 */
function isTransplantableCookie(cookie: ICdpCookie, transplantableFamilies: ReadonlySet<string>): boolean {
	const family = registrableFamily(cookie.domain);
	if (!family) {
		return false;
	}
	return transplantableFamilies.has(family);
}

/**
 * Converts a CDP cookie to a restorable snapshot.
 */
function snapshotCookie(cookie: ICdpCookie): ICookieSnapshot {
	return {
		name: cookie.name,
		value: cookie.value,
		domain: cookie.domain,
		path: cookie.path,
		secure: cookie.secure,
		httpOnly: cookie.httpOnly,
		sameSite: cookie.sameSite,
		expires: cookie.expires,
		url: cookieIdentityUrl(cookie.domain, cookie.path)
	};
}

/**
 * Atomically removes all cookies in the transplantable domain families from
 * the session's cookie jar. Before deletion, every matching cookie is
 * snapshotted so it can be restored via {@link rollbackClear} if the
 * subsequent import write phase fails.
 *
 * This is the STA-4300 "clear-before-write" invariant: we never write
 * imported cookies on top of existing ones because stale duplicates with
 * different partition keys or paths would survive and cause ambiguous
 * request-time cookie selection.
 *
 * @param cdpSession Active CDP session bound to the target Electron session.
 * @param transplantableFamilies Set of registrable domain families from the
 *   write plan. Only cookies matching these families are touched.
 */
export async function removeTransplantableCookies(
	cdpSession: BrowserCookieImportCdpSession,
	transplantableFamilies: ReadonlySet<string>
): Promise<IAtomicClearResult> {
	const log = getLogger();
	log.info(`removeTransplantableCookies: scanning jar for ${transplantableFamilies.size} families`);

	// Snapshot the entire jar once — cheaper than per-cookie queries.
	const allCookies = await cdpSession.getAllCookies();
	const toRemove: ICdpCookie[] = [];
	const snapshot: ICookieSnapshot[] = [];

	for (const cookie of allCookies) {
		if (isTransplantableCookie(cookie, transplantableFamilies)) {
			toRemove.push(cookie);
			snapshot.push(snapshotCookie(cookie));
		}
	}

	log.info(`removeTransplantableCookies: found ${toRemove.length} cookies to remove`);

	// Delete each matched cookie. CDP deleteCookies is idempotent — if a
	// cookie was already removed between snapshot and delete, the call is
	// a no-op. We don't batch because CDP has no batch-delete primitive.
	let removedCount = 0;
	for (const cookie of toRemove) {
		try {
			await cdpSession.deleteCookie({
				name: cookie.name,
				domain: cookie.domain,
				path: cookie.path,
				url: cookieIdentityUrl(cookie.domain, cookie.path)
			});
			removedCount++;
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.warn(`Failed to delete cookie ${cookie.name} on ${cookie.domain}: ${message}`);
			// Continue — partial clear is acceptable; the snapshot still
			// covers what was successfully removed for rollback purposes.
		}
	}

	log.info(`removeTransplantableCookies: removed ${removedCount}/${toRemove.length} cookies`);
	return { removedCount, snapshot };
}

/**
 * Restores cookies from a snapshot taken by {@link removeTransplantableCookies}.
 * Called when the import write phase fails after the clear has already
 * happened. Best-effort — individual restore failures are logged but don't
 * abort the rollback.
 *
 * Note: This restores the cookie *values* but cannot perfectly recreate
 * partitioned cookies or cookies with non-standard attributes that CDP's
 * `setCookie` doesn't accept. The user may need to re-authenticate on
 * affected sites regardless.
 */
export async function rollbackClear(
	cdpSession: BrowserCookieImportCdpSession,
	snapshot: readonly ICookieSnapshot[]
): Promise<void> {
	const log = getLogger();
	log.info(`rollbackClear: restoring ${snapshot.length} cookies`);

	let restored = 0;
	for (const cookie of snapshot) {
		try {
			const params: Record<string, unknown> = {
				name: cookie.name,
				value: cookie.value,
				url: cookie.url,
				domain: cookie.domain,
				path: cookie.path,
				secure: cookie.secure,
				httpOnly: cookie.httpOnly,
				sameSite: cookie.sameSite
			};
			if (cookie.expires > 0) {
				params.expires = cookie.expires;
			}
			const result = await cdpSession.writeCookie(params);
			if (result.ok) {
				restored++;
			} else {
				log.warn(`rollbackClear: failed to restore ${cookie.name} on ${cookie.domain}: ${result.error}`);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			log.warn(`rollbackClear: exception restoring ${cookie.name} on ${cookie.domain}: ${message}`);
		}
	}

	log.info(`rollbackClear: restored ${restored}/${snapshot.length} cookies`);
}
