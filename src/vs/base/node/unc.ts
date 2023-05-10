/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isWindows } from 'vs/base/common/platform';

function processUNCHostAllowlist(): Set<string> | undefined {

	// The property `process.uncHostAllowlist` is not available in official node.js
	// releases, only in our own builds, so we have to probe for availability

	const processWithUNCHostAllowlist = process as typeof process & { readonly uncHostAllowlist?: Set<string> };

	return processWithUNCHostAllowlist.uncHostAllowlist;
}

export function setUNCHostAllowlist(allowedHosts: string[]): void {
	if (!isWindows) {
		return;
	}

	const allowlist = processUNCHostAllowlist();
	if (allowlist) {
		for (const allowedHost of allowedHosts) {
			allowlist.add(allowedHost);
		}
	}
}

export function getUNCHostAllowlist(): string[] {
	const allowlist = processUNCHostAllowlist();
	if (allowlist) {
		return Array.from(allowlist);
	}

	return [];
}

export function addUNCHostToAllowlist(allowedHost: string): void {
	if (!isWindows) {
		return;
	}

	const allowlist = processUNCHostAllowlist();
	if (allowlist) {
		allowlist.add(allowedHost);
	}
}

export function toUNCHostAllowlist(arg0: unknown): string[] {
	const allowedUNCHosts = new Set<string>();

	if (Array.isArray(arg0)) {
		for (const host of arg0) {
			if (typeof host === 'string') {
				allowedUNCHosts.add(host);
			}
		}
	}

	return Array.from(allowedUNCHosts);
}
