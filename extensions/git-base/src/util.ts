/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IDisposable {
	dispose(): void;
}

export function toDisposable(dispose: () => void): IDisposable {
	return { dispose };
}

export function done<T>(promise: Promise<T>): Promise<void> {
	return promise.then<void>(() => undefined);
}

export namespace Versions {
	declare type VersionComparisonResult = -1 | 0 | 1;

	export interface Version {
		major: number;
		minor: number;
		patch: number;
		pre?: string;
	}

	export function compare(v1: string | Version, v2: string | Version): VersionComparisonResult {
		if (typeof v1 === 'string') {
			v1 = fromString(v1);
		}
		if (typeof v2 === 'string') {
			v2 = fromString(v2);
		}

		if (v1.major > v2.major) { return 1; }
		if (v1.major < v2.major) { return -1; }

		if (v1.minor > v2.minor) { return 1; }
		if (v1.minor < v2.minor) { return -1; }

		if (v1.patch > v2.patch) { return 1; }
		if (v1.patch < v2.patch) { return -1; }

		if (v1.pre === undefined && v2.pre !== undefined) { return 1; }
		if (v1.pre !== undefined && v2.pre === undefined) { return -1; }

		if (v1.pre !== undefined && v2.pre !== undefined) {
			return v1.pre.localeCompare(v2.pre) as VersionComparisonResult;
		}

		return 0;
	}

	export function from(major: string | number, minor: string | number, patch?: string | number, pre?: string): Version {
		return {
			major: typeof major === 'string' ? parseInt(major, 10) : major,
			minor: typeof minor === 'string' ? parseInt(minor, 10) : minor,
			patch: patch === undefined || patch === null ? 0 : typeof patch === 'string' ? parseInt(patch, 10) : patch,
			pre: pre,
		};
	}

	export function fromString(version: string): Version {
		const [ver, pre] = version.split('-');
		const [major, minor, patch] = ver.split('.');
		return from(major, minor, patch, pre);
	}
}
