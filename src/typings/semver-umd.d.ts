/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

declare module 'semver-umd' {

	// Type definitions for semver 5.5
	// Project: https://github.com/npm/node-semver
	// Definitions by: Bart van der Schoor <https://github.com/Bartvds>
	//                 BendingBender <https://github.com/BendingBender>
	//                 Lucian Buzzo <https://github.com/LucianBuzzo>
	// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/semver

	export const SEMVER_SPEC_VERSION: "2.0.0";

	export type ReleaseType = "major" | "premajor" | "minor" | "preminor" | "patch" | "prepatch" | "prerelease";

	/**
	 * Return the parsed version as a SemVer object, or null if it's not valid.
	 */
	export function parse(v: string | SemVer, loose?: boolean): SemVer | null;
	/**
	 * Return the parsed version, or null if it's not valid.
	 */
	export function valid(v: string | SemVer, loose?: boolean): string | null;
	/**
	 * Returns cleaned (removed leading/trailing whitespace, remove '=v' prefix) and parsed version, or null if version is invalid.
	 */
	export function clean(version: string, loose?: boolean): string | null;
	/**
	 * Return the version incremented by the release type (major, minor, patch, or prerelease), or null if it's not valid.
	 */
	export function inc(v: string | SemVer, release: ReleaseType, loose?: boolean, identifier?: string): string | null;
	/**
	 * Return the major version number.
	 */
	export function major(v: string | SemVer, loose?: boolean): number;
	/**
	 * Return the minor version number.
	 */
	export function minor(v: string | SemVer, loose?: boolean): number;
	/**
	 * Return the patch version number.
	 */
	export function patch(v: string | SemVer, loose?: boolean): number;
	/**
	 * Returns an array of prerelease components, or null if none exist.
	 */
	export function prerelease(v: string | SemVer, loose?: boolean): string[] | null;

	// Comparison
	/**
	 * v1 > v2
	 */
	export function gt(v1: string | SemVer, v2: string | SemVer, loose?: boolean): boolean;
	/**
	 * v1 >= v2
	 */
	export function gte(v1: string | SemVer, v2: string | SemVer, loose?: boolean): boolean;
	/**
	 * v1 < v2
	 */
	export function lt(v1: string | SemVer, v2: string | SemVer, loose?: boolean): boolean;
	/**
	 * v1 <= v2
	 */
	export function lte(v1: string | SemVer, v2: string | SemVer, loose?: boolean): boolean;
	/**
	 * v1 == v2 This is true if they're logically equivalent, even if they're not the exact same string. You already know how to compare strings.
	 */
	export function eq(v1: string | SemVer, v2: string | SemVer, loose?: boolean): boolean;
	/**
	 * v1 != v2 The opposite of eq.
	 */
	export function neq(v1: string | SemVer, v2: string | SemVer, loose?: boolean): boolean;

	/**
	 * Pass in a comparison string, and it'll call the corresponding semver comparison function.
	 * "===" and "!==" do simple string comparison, but are included for completeness.
	 * Throws if an invalid comparison string is provided.
	 */
	export function cmp(v1: string | SemVer, operator: Operator, v2: string | SemVer, loose?: boolean): boolean;
	export type Operator = '===' | '!==' | '' | '=' | '==' | '!=' | '>' | '>=' | '<' | '<=';

	/**
	 * Return 0 if v1 == v2, or 1 if v1 is greater, or -1 if v2 is greater. Sorts in ascending order if passed to Array.sort().
	 */
	export function compare(v1: string | SemVer, v2: string | SemVer, loose?: boolean): 1 | 0 | -1;
	/**
	 * The reverse of compare. Sorts an array of versions in descending order when passed to Array.sort().
	 */
	export function rcompare(v1: string | SemVer, v2: string | SemVer, loose?: boolean): 1 | 0 | -1;

	/**
	 * Compares two identifiers, must be numeric strings or truthy/falsy values. Sorts in ascending order if passed to Array.sort().
	 */
	export function compareIdentifiers(a: string | null, b: string | null): 1 | 0 | -1;
	/**
	 * The reverse of compareIdentifiers. Sorts in descending order when passed to Array.sort().
	 */
	export function rcompareIdentifiers(a: string | null, b: string | null): 1 | 0 | -1;

	/**
	 * Sorts an array of semver entries in ascending order.
	 */
	export function sort(list: Array<string | SemVer>, loose?: boolean): Array<string | SemVer>;
	/**
	 * Sorts an array of semver entries in descending order.
	 */
	export function rsort(list: Array<string | SemVer>, loose?: boolean): Array<string | SemVer>;

	/**
	 * Returns difference between two versions by the release type (major, premajor, minor, preminor, patch, prepatch, or prerelease), or null if the versions are the same.
	 */
	export function diff(v1: string, v2: string, loose?: boolean): ReleaseType | null;

	// Ranges
	/**
	 * Return the valid range or null if it's not valid
	 */
	export function validRange(range: string | Range, loose?: boolean): string;
	/**
	 * Return true if the version satisfies the range.
	 */
	export function satisfies(version: string | SemVer, range: string | Range, loose?: boolean): boolean;
	/**
	 * Return the highest version in the list that satisfies the range, or null if none of them do.
	 */
	export function maxSatisfying(versions: Array<string | SemVer>, range: string | Range, loose?: boolean): string;
	/**
	 * Return the lowest version in the list that satisfies the range, or null if none of them do.
	 */
	export function minSatisfying(versions: Array<string | SemVer>, range: string, loose?: boolean): string;
	/**
	 * Return true if version is greater than all the versions possible in the range.
	 */
	export function gtr(version: string | SemVer, range: string | Range, loose?: boolean): boolean;
	/**
	 * Return true if version is less than all the versions possible in the range.
	 */
	export function ltr(version: string | SemVer, range: string | Range, loose?: boolean): boolean;
	/**
	 * Return true if the version is outside the bounds of the range in either the high or low direction.
	 * The hilo argument must be either the string '>' or '<'. (This is the function called by gtr and ltr.)
	 */
	export function outside(version: string | SemVer, range: string | Range, hilo: '>' | '<', loose?: boolean): boolean;
	/**
	 * Return true if any of the ranges comparators intersect
	 */
	export function intersects(range1: string | Range, range2: string | Range, loose?: boolean): boolean;

	// Coercion
	/**
	 * Coerces a string to semver if possible
	 */
	export function coerce(version: string | SemVer): SemVer | null;

	export class SemVer {
		constructor(version: string | SemVer, loose?: boolean);

		raw: string;
		loose: boolean;
		format(): string;
		inspect(): string;

		major: number;
		minor: number;
		patch: number;
		version: string;
		build: string[];
		prerelease: string[];

		compare(other: string | SemVer): 1 | 0 | -1;
		compareMain(other: string | SemVer): 1 | 0 | -1;
		comparePre(other: string | SemVer): 1 | 0 | -1;
		inc(release: ReleaseType, identifier?: string): SemVer;
	}

	export class Comparator {
		constructor(comp: string | Comparator, loose?: boolean);

		semver: SemVer;
		operator: string;
		value: boolean;
		parse(comp: string): void;
		test(version: string | SemVer): boolean;
		intersects(comp: Comparator, loose?: boolean): boolean;
	}

	export class Range {
		constructor(range: string | Range, loose?: boolean);

		range: string;
		raw: string;
		loose: boolean;
		format(): string;
		inspect(): string;

		set: Comparator[][];
		parseRange(range: string): Comparator[];
		test(version: string | SemVer): boolean;
		intersects(range: Range, loose?: boolean): boolean;
	}

}