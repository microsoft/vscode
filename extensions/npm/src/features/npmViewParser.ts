/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface ViewPackageInfo {
	description: string;
	version?: string;
	time?: string;
	homepage?: string;
	installedVersion?: string;
}

export interface NpmViewRecord {
	description?: string;
	version?: string;
	homepage?: string;
	time?: { [version: string]: string };
	'dist-tags.latest'?: string;
}

/**
 * Parses the output of `npm view --json`. npm 12+ always returns an array `[{...}]`,
 * even for a single package, while older versions return the object directly.
 */
export function parseNpmViewOutput(stdout: string): ViewPackageInfo | undefined {
	try {
		const parsed = JSON.parse(stdout) as NpmViewRecord | NpmViewRecord[];
		const content = Array.isArray(parsed) ? parsed[0] : parsed;
		const version = content['dist-tags.latest'] || content.version;
		return {
			description: content.description ?? '',
			version,
			time: version ? content.time?.[version] : undefined,
			homepage: content.homepage
		};
	} catch (e) {
		return undefined;
	}
}