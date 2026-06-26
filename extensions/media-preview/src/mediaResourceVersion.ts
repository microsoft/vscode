/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface MediaResourceStat {
	readonly mtime: number;
	readonly size: number;
}

let fallbackVersion = 0;

export function getMediaResourceVersion(stat: MediaResourceStat | undefined): string {
	if (!stat) {
		return `fallback-${fallbackVersion++}`;
	}
	return `${stat.mtime}-${stat.size}`;
}
