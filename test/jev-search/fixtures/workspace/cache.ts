/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

interface CachedEntry {
	value: string;
	expiresAt: number;
}

export function expireCachedEntries(cache: Map<string, CachedEntry>, now: number): void {
	for (const [key, entry] of cache) {
		if (entry.expiresAt <= now) {
			cache.delete(key);
		}
	}
}
