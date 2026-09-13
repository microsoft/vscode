/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ViewPackageInfo {
	description: string;
	version?: string;
	versions?: string[];
	time?: string;
	homepage?: string;
	installedVersion?: string;
}

export interface NpmViewRecord {
	description?: string;
	version?: string;
	versions?: string[] | string;
	homepage?: string;
	time?: { [version: string]: string };
	'dist-tags.latest'?: string;
}

export interface ParsedSemver {
	major: number;
	minor: number;
	patch: number;
	prerelease?: string;
}

export function parseSemver(version: string): ParsedSemver | undefined {
	const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+.*)?$/.exec(version.trim());
	if (!match) {
		return undefined;
	}
	return {
		major: parseInt(match[1], 10),
		minor: parseInt(match[2], 10),
		patch: parseInt(match[3], 10),
		prerelease: match[4]
	};
}

export function compareSemver(a: string, b: string): number {
	const pa = parseSemver(a);
	const pb = parseSemver(b);
	if (pa && pb) {
		if (pa.major !== pb.major) {
			return pa.major - pb.major;
		}
		if (pa.minor !== pb.minor) {
			return pa.minor - pb.minor;
		}
		if (pa.patch !== pb.patch) {
			return pa.patch - pb.patch;
		}
		if (!pa.prerelease && pb.prerelease) {
			return 1;
		}
		if (pa.prerelease && !pb.prerelease) {
			return -1;
		}
		if (pa.prerelease && pb.prerelease) {
			return pa.prerelease.localeCompare(pb.prerelease, undefined, { numeric: true });
		}
		return 0;
	}
	if (pa && !pb) {
		return 1;
	}
	if (!pa && pb) {
		return -1;
	}
	return a.localeCompare(b, undefined, { numeric: true });
}

/**
 * Parses the output of `npm view --json`. npm 12+ always returns an array `[{...}]`,
 * even for a single package, while older versions return the object directly.
 */
export function parseNpmViewOutput(stdout: string): ViewPackageInfo | undefined {
	try {
		const parsed = JSON.parse(stdout) as NpmViewRecord | NpmViewRecord[];
		const content = Array.isArray(parsed) ? parsed[0] : parsed;
		const rawVersions = content.versions;
		const versions = Array.isArray(rawVersions)
			? rawVersions.slice().sort((a, b) => compareSemver(b, a))
			: (typeof rawVersions === 'string' ? [rawVersions] : undefined);
		const version = content['dist-tags.latest'] || content.version || (versions && versions[0]);
		return {
			description: content.description ?? '',
			version,
			versions,
			time: version ? content.time?.[version] : undefined,
			homepage: content.homepage
		};
	} catch (e) {
		return undefined;
	}
}