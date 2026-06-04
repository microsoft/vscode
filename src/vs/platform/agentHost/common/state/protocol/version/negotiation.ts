/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { compareProtocolVersions } from './registry.js';

/**
 * Parses a `MAJOR.MINOR.PATCH` SemVer string. Returns `undefined` if the
 * string is not well-formed. Pre-release / build metadata are not allowed.
 */
function tryParseSemver(version: string): readonly [number, number, number] | undefined {
	const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
	if (!match) {
		return undefined;
	}
	return [Number(match[1]), Number(match[2]), Number(match[3])] as const;
}

/**
 * Returns whether `offered` is semver-compatible with the server's
 * `current` version, using caret semantics:
 *
 *  - majors must match
 *  - when `major === 0`, minors must also match (because in 0.x semver,
 *    every minor bump is breaking)
 *  - the offered version MUST NOT be greater than `current` — a server that
 *    only knows `0.1.0` cannot pretend to speak `0.1.5`
 *
 * Invalid version strings return `false`.
 */
export function isCompatibleProtocolVersion(offered: string, current: string): boolean {
	const a = tryParseSemver(offered);
	const b = tryParseSemver(current);
	if (!a || !b) {
		return false;
	}
	if (a[0] !== b[0]) {
		return false;
	}
	if (a[0] === 0 && a[1] !== b[1]) {
		return false;
	}
	return compareProtocolVersions(offered, current) <= 0;
}

/**
 * Picks the best version from the client's offered list that this server
 * (speaking `current`) can faithfully implement. "Best" means the most
 * specific compatible version — i.e. the highest one that is still
 * compatible with `current`.
 *
 * `offered` is expected to be the client's `InitializeParams.protocolVersions`
 * (client-preference-ordered, but order is ignored here since we deterministically
 * pick the highest compatible entry). Returns `undefined` when no offered
 * version is compatible.
 */
export function negotiateProtocolVersion(offered: readonly string[], current: string): string | undefined {
	let best: string | undefined;
	for (const v of offered) {
		if (!isCompatibleProtocolVersion(v, current)) {
			continue;
		}
		if (best === undefined || compareProtocolVersions(v, best) > 0) {
			best = v;
		}
	}
	return best;
}
