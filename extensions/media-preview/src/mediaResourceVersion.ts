/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface MediaResourceStat {
	readonly mtime: number;
	readonly size: number;
}

export interface MediaResource {
	toString(): string;
}

export function getMediaResourceVersion(resource: MediaResource, stat: MediaResourceStat | undefined): string {
	if (!stat) {
		return resource.toString();
	}
	return `${stat.mtime}-${stat.size}`;
}
