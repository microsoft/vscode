/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { GitHubUser } from './types';

/**
 * Validates a GitHub OAuth / PAT token by calling the GitHub user API.
 * Returns the authenticated user on success, or `undefined` on failure.
 *
 * Results are cached briefly (60 s) so that rapid successive requests
 * from the same token don't hammer the GitHub API.
 */
export async function validateGitHubToken(token: string): Promise<GitHubUser | undefined> {
	const cached = tokenCache.get(token);
	if (cached && Date.now() - cached.ts < TOKEN_CACHE_TTL_MS) {
		return cached.user;
	}

	try {
		const res = await fetch('https://api.github.com/user', {
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/json',
				'User-Agent': 'codamente-server/0.1',
			},
		});

		if (!res.ok) {
			tokenCache.delete(token);
			return undefined;
		}

		const body = await res.json() as { id: number; login: string };
		const user: GitHubUser = { id: body.id, login: body.login };
		tokenCache.set(token, { user, ts: Date.now() });
		return user;
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Token validation cache — avoids hitting GitHub on every request
// ---------------------------------------------------------------------------

const TOKEN_CACHE_TTL_MS = 60_000; // 1 minute

interface CacheEntry {
	user: GitHubUser;
	ts: number;
}

const tokenCache = new Map<string, CacheEntry>();

/**
 * Evict expired entries. Called periodically from the server.
 */
export function pruneTokenCache(): void {
	const now = Date.now();
	for (const [key, entry] of tokenCache) {
		if (now - entry.ts >= TOKEN_CACHE_TTL_MS) {
			tokenCache.delete(key);
		}
	}
}
