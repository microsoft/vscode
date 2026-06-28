/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface MediaResourceStat {
	readonly mtime: number;
	readonly size: number;
}

export function getMediaResourceVersion(stat: MediaResourceStat | undefined, fallbackVersion: string): string {
	if (!stat) {
		return fallbackVersion;
	}
	return `${stat.mtime}-${stat.size}`;
}

export async function getMediaResourceVersionFromStat(
	readStat: () => PromiseLike<MediaResourceStat>,
	getFallbackVersion: () => string,
	isExpectedStatError: (error: unknown) => boolean,
): Promise<string> {
	try {
		return getMediaResourceVersion(await readStat(), '');
	} catch (error) {
		if (!isExpectedStatError(error)) {
			throw error;
		}
		return getMediaResourceVersion(undefined, getFallbackVersion());
	}
}
