/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// ESM-comment-begin
// export as namespace semver;
// export = semver;
// ESM-comment-end

// ESM-uncomment-begin
export * from 'semver'
// ESM-uncomment-end

declare namespace semver {

	// Type definitions for semver 6.2
	// Project: https://github.com/npm/node-semver
	// Definitions by: Bart van der Schoor <https://github.com/Bartvds>
	//                 BendingBender <https://github.com/BendingBender>
	//                 Lucian Buzzo <https://github.com/LucianBuzzo>
	//                 Klaus Meinhardt <https://github.com/ajafff>
	//                 ExE Boss <https://github.com/ExE-Boss>
	// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/semver

	export const SEMVER_SPEC_VERSION: "2.0.0";

	export type ReleaseType = "major" | "premajor" | "minor" | "preminor" | "patch" | "prepatch" | "prerelease";

	export interface Options {
		loose?: boolean;
		includePrerelease?: boolean;
	}

	export interface CoerceOptions extends Options {
		/**
		 * Used by `coerce()` to coerce from right to left.
		 *
		 * @default false
		 *
		 * @example
		 * coerce('1.2.3.4', { rtl: true });
		 * // => SemVer { version: '2.3.4', ... }
		 *
		 * @since 6.2.0
		 */
		rtl?: boolean;
	}

	/**
	 * Return the parsed version as a SemVer object, or null if it's not valid.
	 */
	export function parse(version: string | SemVer | null | undefined, optionsOrLoose?: boolean | Options): SemVer | null;

	/**
	 * Return the parsed version as a string, or null if it's not valid.
	 */
	export function valid(version: string | SemVer | null | undefined, optionsOrLoose?: boolean | Options): string | null;

	/**
	 * Coerces a string to SemVer if possible
	 */
	export function coerce(version: string | number | SemVer | null | undefined, options?: CoerceOptions): SemVer | null;

	/**
	 * Returns cleaned (removed leading/trailing whitespace, remove '=v' prefix) and parsed version, or null if version is invalid.
	 */
	export function clean(version: string, optionsOrLoose?: boolean | Options): string | null;

	/**
	 * Return the version incremented by the release type (major, minor, patch, or prerelease), or null if it's not valid.
	 */
	export function inc(version: string | SemVer, release: ReleaseType, optionsOrLoose?: boolean | Options, identifier?: string): string | null;
	export function inc(version: string | SemVer, release: ReleaseType, identifier?: string): string | null;

	/**
	 * Return the major version number.
	 */
	export function major(version: string | SemVer, optionsOrLoose?: boolean | Options): number;

	/**
	 * Return the minor version number.
	 */
	export function minor(version: string | SemVer, optionsOrLoose?: boolean | Options): number;

	/**
	 * Return the patch version number.
	 */
	export function patch(version: string | SemVer, optionsOrLoose?: boolean | Options): number;

	/**
	 * Returns an array of prerelease components, or null if none exist.
	 */
	export function prerelease(version: string | SemVer, optionsOrLoose?: boolean | Options): ReadonlyArray<string> | null;

	// Comparison
	/**
	 * v1 > v2
	 */
	export function gt(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * v1 >= v2
	 */
	export function gte(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * v1 < v2
	 */
	export function lt(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * v1 <= v2
	 */
	export function lte(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * v1 == v2 This is true if they're logically equivalent, even if they're not the exact same string. You already know how to compare strings.
	 */
	export function eq(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * v1 != v2 The opposite of eq.
	 */
	export function neq(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): boolean;

	/**
	 * Pass in a comparison string, and it'll call the corresponding semver comparison function.
	 * "===" and "!==" do simple string comparison, but are included for completeness.
	 * Throws if an invalid comparison string is provided.
	 */
	export function cmp(v1: string | SemVer, operator: Operator, v2: string | SemVer, optionsOrLoose?: boolean | Options): boolean;
	export type Operator = '===' | '!==' | '' | '=' | '==' | '!=' | '>' | '>=' | '<' | '<=';

	/**
	 * Compares two versions excluding build identifiers (the bit after `+` in the semantic version string).
	 *
	 * Sorts in ascending order when passed to `Array.sort()`.
	 *
	 * @return
	 * - `0` if `v1` == `v2`
	 * - `1` if `v1` is greater
	 * - `-1` if `v2` is greater.
	 */
	export function compare(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): 1 | 0 | -1;
	/**
	 * The reverse of compare.
	 *
	 * Sorts in descending order when passed to `Array.sort()`.
	 */
	export function rcompare(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): 1 | 0 | -1;

	/**
	 * Compares two identifiers, must be numeric strings or truthy/falsy values.
	 *
	 * Sorts in ascending order when passed to `Array.sort()`.
	 */
	export function compareIdentifiers(a: string | null | undefined, b: string | null | undefined): 1 | 0 | -1;
	/**
	 * The reverse of compareIdentifiers.
	 *
	 * Sorts in descending order when passed to `Array.sort()`.
	 */
	export function rcompareIdentifiers(a: string | null | undefined, b: string | null | undefined): 1 | 0 | -1;

	/**
	 * Compares two versions including build identifiers (the bit after `+` in the semantic version string).
	 *
	 * Sorts in ascending order when passed to `Array.sort()`.
	 *
	 * @return
	 * - `0` if `v1` == `v2`
	 * - `1` if `v1` is greater
	 * - `-1` if `v2` is greater.
	 *
	 * @since 6.1.0
	 */
	export function compareBuild(a: string | SemVer, b: string | SemVer): 1 | 0 | -1;

	/**
	 * Sorts an array of semver entries in ascending order using `compareBuild()`.
	 */
	export function sort<T extends string | SemVer>(list: T[], optionsOrLoose?: boolean | Options): T[];
	/**
	 * Sorts an array of semver entries in descending order using `compareBuild()`.
	 */
	export function rsort<T extends string | SemVer>(list: T[], optionsOrLoose?: boolean | Options): T[];

	/**
	 * Returns difference between two versions by the release type (major, premajor, minor, preminor, patch, prepatch, or prerelease), or null if the versions are the same.
	 */
	export function diff(v1: string | SemVer, v2: string | SemVer, optionsOrLoose?: boolean | Options): ReleaseType | null;

	// Ranges
	/**
	 * Return the valid range or null if it's not valid
	 */
	export function validRange(range: string | Range | null | undefined, optionsOrLoose?: boolean | Options): string;
	/**
	 * Return true if the version satisfies the range.
	 */
	export function satisfies(version: string | SemVer, range: string | Range, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * Return the highest version in the list that satisfies the range, or null if none of them do.
	 */
	export function maxSatisfying<T extends string | SemVer>(versions: ReadonlyArray<T>, range: string | Range, optionsOrLoose?: boolean | Options): T | null;
	/**
	 * Return the lowest version in the list that satisfies the range, or null if none of them do.
	 */
	export function minSatisfying<T extends string | SemVer>(versions: ReadonlyArray<T>, range: string | Range, optionsOrLoose?: boolean | Options): T | null;
	/**
	 * Return the lowest version that can possibly match the given range.
	 */
	export function minVersion(range: string | Range, optionsOrLoose?: boolean | Options): SemVer | null;
	/**
	 * Return true if version is greater than all the versions possible in the range.
	 */
	export function gtr(version: string | SemVer, range: string | Range, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * Return true if version is less than all the versions possible in the range.
	 */
	export function ltr(version: string | SemVer, range: string | Range, optionsOrLoose?: boolean | Options): boolean;
	/**
	 * Return true if the version is outside the bounds of the range in either the high or low direction.
	 * The hilo argument must be either the string '>' or '<'. (This is the function called by gtr and ltr.)
	 */
	export function outside(version: string | SemVer, range: string | Range, hilo: '>' | '<', optionsOrLoose?: boolean | Options): boolean;
	/**
	 * Return true if any of the ranges comparators intersect
	 */
	export function intersects(range1: string | Range, range2: string | Range, optionsOrLoose?: boolean | Options): boolean;

	export class SemVer {
		constructor(version: string | SemVer, optionsOrLoose?: boolean | Options);

		raw: string;
		loose: boolean;
		options: Options;
		format(): string;
		inspect(): string;

		major: number;
		minor: number;
		patch: number;
		version: string;
		build: ReadonlyArray<string>;
		prerelease: ReadonlyArray<string | number>;

		/**
		 * Compares two versions excluding build identifiers (the bit after `+` in the semantic version string).
		 *
		 * @return
		 * - `0` if `this` == `other`
		 * - `1` if `this` is greater
		 * - `-1` if `other` is greater.
		 */
		compare(other: string | SemVer): 1 | 0 | -1;

		/**
		 * Compares the release portion of two versions.
		 *
		 * @return
		 * - `0` if `this` == `other`
		 * - `1` if `this` is greater
		 * - `-1` if `other` is greater.
		 */
		compareMain(other: string | SemVer): 1 | 0 | -1;

		/**
		 * Compares the prerelease portion of two versions.
		 *
		 * @return
		 * - `0` if `this` == `other`
		 * - `1` if `this` is greater
		 * - `-1` if `other` is greater.
		 */
		comparePre(other: string | SemVer): 1 | 0 | -1;

		/**
		 * Compares the build identifier of two versions.
		 *
		 * @return
		 * - `0` if `this` == `other`
		 * - `1` if `this` is greater
		 * - `-1` if `other` is greater.
		 */
		compareBuild(other: string | SemVer): 1 | 0 | -1;

		inc(release: ReleaseType, identifier?: string): SemVer;
	}

	export class Comparator {
		constructor(comp: string | Comparator, optionsOrLoose?: boolean | Options);

		semver: SemVer;
		operator: '' | '=' | '<' | '>' | '<=' | '>=';
		value: string;
		loose: boolean;
		options: Options;
		parse(comp: string): void;
		test(version: string | SemVer): boolean;
		intersects(comp: Comparator, optionsOrLoose?: boolean | Options): boolean;
	}

	export class Range {
		constructor(range: string | Range, optionsOrLoose?: boolean | Options);

		range: string;
		raw: string;
		loose: boolean;
		options: Options;
		includePrerelease: boolean;
		format(): string;
		inspect(): string;

		set: ReadonlyArray<ReadonlyArray<Comparator>>;
		parseRange(range: string): ReadonlyArray<Comparator>;
		test(version: string | SemVer): boolean;
		intersects(range: Range, optionsOrLoose?: boolean | Options): boolean;
	}

}
