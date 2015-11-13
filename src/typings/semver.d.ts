// Type definitions for semver v2.2.1
// Project: https://github.com/isaacs/node-semver
// Definitions by: Bart van der Schoor <https://github.com/Bartvds>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

declare module SemVerModule {
    /**
     * Return the parsed version, or null if it's not valid.
     */
    function valid(v: string, loose?: boolean): string;
    /**
     * Return the version incremented by the release type (major, minor, patch, or prerelease), or null if it's not valid.
     */
    function inc(v: string, release: string, loose?: boolean): string;

    // Comparison
    /**
     * v1 > v2
     */
    function gt(v1: string, v2: string, loose?: boolean): boolean;
    /**
     * v1 >= v2
     */
    function gte(v1: string, v2: string, loose?: boolean): boolean;
    /**
     * v1 < v2
     */
    function lt(v1: string, v2: string, loose?: boolean): boolean;
    /**
     * v1 <= v2
     */
    function lte(v1: string, v2: string, loose?: boolean): boolean;
    /**
     * v1 == v2 This is true if they're logically equivalent, even if they're not the exact same string. You already know how to compare strings.
     */
    function eq(v1: string, v2: string, loose?: boolean): boolean;
    /**
     * v1 != v2 The opposite of eq.
     */
    function neq(v1: string, v2: string, loose?: boolean): boolean;
    /**
     * Pass in a comparison string, and it'll call the corresponding semver comparison function. "===" and "!==" do simple string comparison, but are included for completeness. Throws if an invalid comparison string is provided.
     */
    function cmp(v1: string, comparator: any, v2: string, loose?: boolean): boolean;
    /**
     * Return 0 if v1 == v2, or 1 if v1 is greater, or -1 if v2 is greater. Sorts in ascending order if passed to Array.sort().
     */
    function compare(v1: string, v2: string, loose?: boolean): number;
    /**
     * The reverse of compare. Sorts an array of versions in descending order when passed to Array.sort().
     */
    function rcompare(v1: string, v2: string, loose?: boolean): number;

    // Ranges
    /**
     * Return the valid range or null if it's not valid
     */
    function validRange(range: string, loose?: boolean): string;
    /**
     * Return true if the version satisfies the range.
     */
    function satisfies(version: string, range: string, loose?: boolean): boolean;
    /**
     * Return the highest version in the list that satisfies the range, or null if none of them do.
     */
    function maxSatisfying(versions: string[], range: string, loose?: boolean): string;
    /**
     * Return true if version is greater than all the versions possible in the range.
     */
    function gtr(version: string, range: string, loose?: boolean): boolean;
    /**
     * Return true if version is less than all the versions possible in the range.
     */
    function ltr(version: string, range: string, loose?: boolean): boolean;
    /**
     * Return true if the version is outside the bounds of the range in either the high or low direction. The hilo argument must be either the string '>' or '<'. (This is the function called by gtr and ltr.)
     */
    function outside(version: string, range: string, hilo: string, loose?: boolean): boolean;

    class SemVerBase {
        raw: string;
        loose: boolean;
        format(): string;
        inspect(): string;
        toString(): string;
    }

    class SemVer extends SemVerBase {
        constructor(version: string, loose?: boolean);

        major: number;
        minor: number;
        patch: number;
        version: string;
        build: string[];
        prerelease: string[];

        compare(other:SemVer): number;
        compareMain(other:SemVer): number;
        comparePre(other:SemVer): number;
        inc(release: string): SemVer;
    }

    class Comparator extends SemVerBase {
        constructor(comp: string, loose?: boolean);

        semver: SemVer;
        operator: string;
        value: boolean;
        parse(comp: string): void;
        test(version:SemVer): boolean;
    }

    class Range extends SemVerBase {
        constructor(range: string, loose?: boolean);

        set: Comparator[][];
        parseRange(range: string): Comparator[];
        test(version: SemVer): boolean;
    }
}

declare module "semver" {
    export = SemVerModule;
}
