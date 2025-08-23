// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * A representation of a Python runtime's version.
 *
 * @prop raw - the original version string
 * @prop major - the "major" version
 * @prop minor - the "minor" version
 * @prop patch - the "patch" (or "micro") version
 * @prop build - the build ID of the executable
 * @prop prerelease - identifies a tag in the release process (e.g. beta 1)
 */
// Note that this is currently compatible with SemVer objects,
// but we may change it to match the format of sys.version_info.
export type PythonVersion = {
    raw: string;
    major: number;
    minor: number;
    patch: number;
    // Eventually it may be useful to match what sys.version_info
    // provides for the remainder here:
    // * releaseLevel: 'alpha' | 'beta' | 'candidate' | 'final';
    // * serial: number;
    build: string[];
    prerelease: string[];
};

export function isStableVersion(version: PythonVersion): boolean {
    // A stable version is one that has no prerelease tags.
    return (
        version.prerelease.length === 0 &&
        (version.build.length === 0 || (version.build.length === 1 && version.build[0] === 'final'))
    );
}
