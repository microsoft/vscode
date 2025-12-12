/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Narrow an unknown value to an object record.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}

/**
 * Validates an exports target string according to Node.js package exports specification.
 *
 * @see https://nodejs.org/api/packages.html#targets-must-be-relative-urls
 * @see https://nodejs.org/api/packages.html#no-path-traversal-or-invalid-segments
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_TARGET_RESOLVE)
 */
function isValidExportTarget(target: string): boolean {
	if (!target.startsWith('./')) {
		return false;
	}

	// Enforce the basic Node.js exports target restrictions:
	// - must stay within the package root
	// - disallow path traversal / invalid segments (., .., node_modules, empty)
	return isValidPackageSubpath(target.slice(2));
}

/**
 * Validates a package-relative subpath string.
 *
 * This is used for both export target validation (after the leading `./`) and for
 * validating wildcard (`*`) substitutions.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_TARGET_RESOLVE)
 */
function isValidPackageSubpath(subpath: string): boolean {
	const segments = subpath.split(/[\\/]/);
	for (const segment of segments) {
		if (!segment || segment === '.' || segment === '..' || segment.toLowerCase() === 'node_modules') {
			return false;
		}
	}

	return true;
}

/**
 * Checks if an `exports` object key is a subpath export key.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_EXPORTS_RESOLVE)
 * @see https://nodejs.org/api/packages.html#subpath-exports
 */
function isSubpathKey(key: string): boolean {
	return key === '.' || key.startsWith('./');
}

/**
 * Match a single `*` wildcard pattern against a value.
 *
 * Returns the captured `*` segment when matched.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_IMPORTS_EXPORTS_RESOLVE)
 * @see https://nodejs.org/api/packages.html#subpath-patterns
 */
function matchWildcard(pattern: string, value: string): { matched: boolean; star?: string } {
	const starIndex = pattern.indexOf('*');
	if (starIndex < 0) {
		return { matched: pattern === value };
	}

	if (pattern.indexOf('*', starIndex + 1) !== -1) {
		return { matched: false };
	}

	const prefix = pattern.slice(0, starIndex);
	const suffix = pattern.slice(starIndex + 1);
	if (!value.startsWith(prefix) || !value.endsWith(suffix)) {
		return { matched: false };
	}

	return {
		matched: true,
		star: value.slice(prefix.length, value.length - suffix.length)
	};
}

/**
 * Apply the captured wildcard segment to an exports target.
 *
 * @see https://nodejs.org/api/packages.html#subpath-patterns
 */
function replaceWildcard(target: string, star: string | undefined): string {
	if (star === undefined) {
		return target;
	}
	return target.replace('*', star);
}

/**
 * Compare wildcard export keys by descending specificity.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PATTERN_KEY_COMPARE)
 */
function comparePatternKeys(keyA: string, keyB: string): number {
	// Mirrors Node's PATTERN_KEY_COMPARE ordering (descending specificity).
	const starA = keyA.indexOf('*');
	const starB = keyB.indexOf('*');
	const baseLengthA = starA < 0 ? 0 : starA;
	const baseLengthB = starB < 0 ? 0 : starB;

	if (baseLengthA !== baseLengthB) {
		return baseLengthB - baseLengthA;
	}

	if (keyA.length !== keyB.length) {
		return keyB.length - keyA.length;
	}

	return 0;
}

/**
 * Resolve an exports conditional target according to Node's condition selection rules.
 *
 * Conditions are matched in object insertion order; keys not in `conditions` are ignored
 * except for the `default` fallback.
 *
 * @see https://nodejs.org/api/packages.html#conditional-exports
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_TARGET_RESOLVE)
 */
function resolveConditionalTarget(
	value: unknown,
	conditions: readonly string[]
): string | undefined {
	if (!isRecord(value)) {
		return undefined;
	}

	// Node matches conditions in object insertion order.
	for (const key of Object.keys(value)) {
		if (key === 'default' || conditions.includes(key)) {
			const resolved = resolveExportsTarget(value[key], conditions);
			if (resolved !== undefined) {
				return resolved;
			}
		}
	}

	return undefined;
}

/**
 * Resolve an exports subpath mapping, including wildcard keys.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_EXPORTS_RESOLVE)
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_IMPORTS_EXPORTS_RESOLVE)
 * @see https://nodejs.org/api/packages.html#subpath-exports
 * @see https://nodejs.org/api/packages.html#subpath-patterns
 */
function resolveSubpathTarget(
	exportsField: Record<string, unknown>,
	subpath: string,
	conditions: readonly string[]
): { target: string; star?: string } | undefined {
	const direct = exportsField[subpath];
	if (direct !== undefined) {
		const resolved = resolveExportsTarget(direct, conditions);
		return resolved !== undefined ? { target: resolved } : undefined;
	}

	const wildcardKeys = Object.keys(exportsField).filter(key => key.includes('*'));
	wildcardKeys.sort(comparePatternKeys);

	for (const key of wildcardKeys) {
		const match = matchWildcard(key, subpath);
		if (!match.matched) {
			continue;
		}

		if (match.star !== undefined && !isValidPackageSubpath(match.star)) {
			continue;
		}

		const rawTarget = exportsField[key];

		// Node allows `null` to explicitly exclude a subpath from a broader pattern.
		// If a matching pattern has `null`, it blocks resolution (even if a less-specific
		// pattern would otherwise match).
		if (rawTarget === null) {
			return undefined;
		}

		const resolved = resolveExportsTarget(rawTarget, conditions);
		if (resolved === undefined) {
			continue;
		}

		return { target: resolved, star: match.star };
	}

	return undefined;
}

/**
 * Resolve an exports target.
 *
 * This supports string targets, arrays (first resolvable entry), and conditional objects.
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_TARGET_RESOLVE)
 * @see https://nodejs.org/api/packages.html#path-rules-and-validation-for-export-targets
 */
function resolveExportsTarget(value: unknown, conditions: readonly string[]): string | undefined {
	if (typeof value === 'string') {
		return isValidExportTarget(value) ? value : undefined;
	}

	if (value === null) {
		return undefined;
	}

	if (Array.isArray(value)) {
		for (const entry of value) {
			const resolved = resolveExportsTarget(entry, conditions);
			if (resolved !== undefined) {
				return resolved;
			}
		}
		return undefined;
	}

	if (isRecord(value)) {
		return resolveConditionalTarget(value, conditions);
	}

	return undefined;
}

/**
 * Resolve a Node-style `package.json#exports` mapping for a given package subpath.
 *
 * Notes:
 * - This intentionally implements only the portions of the exports algorithm needed for
 *   resolving file-like exports used by `tsconfig.json`'s `extends` links.
 * - The returned value is the raw exports target string (typically starting with `./`).
 *
 * @see https://nodejs.org/api/esm.html#resolution-algorithm-specification (PACKAGE_EXPORTS_RESOLVE)
 * @see https://nodejs.org/api/packages.html#package-entry-points
 */
export function resolvePackageJsonExports(
	exports: unknown,
	subpath: string,
	conditions: readonly string[],
): string | undefined {
	if (exports === undefined) {
		return undefined;
	}

	if (typeof exports === 'string') {
		return subpath === '.' && isValidExportTarget(exports) ? exports : undefined;
	}

	if (Array.isArray(exports)) {
		for (const entry of exports) {
			const resolved = resolvePackageJsonExports(entry, subpath, conditions);
			if (resolved !== undefined) {
				return resolved;
			}
		}
		return undefined;
	}

	if (!isRecord(exports)) {
		return undefined;
	}

	const keys = Object.keys(exports);
	const isSubpathMap = keys.some(isSubpathKey);
	if (!isSubpathMap) {
		return resolveConditionalTarget(exports, conditions);
	}

	const result = resolveSubpathTarget(exports, subpath, conditions);
	if (!result) {
		return undefined;
	}

	return replaceWildcard(result.target, result.star);
}
