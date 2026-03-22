/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IMarker } from './markers.js';

export type IMarkerOrigin = string | undefined;

export interface IOriginMarkers {
	readonly origin: IMarkerOrigin;
	markers: IMarker[];
}

/**
 * There are two prioritization levels represented by `IMarkerOrigin`:
 * `undefined` < `string`, strings are considered equal in priority
 * @returns `-1` if `a` prioritized over `b`
 */
export function markerOriginPriorityCompare(a: IOriginMarkers, b: IOriginMarkers) {
	if (a.origin === b.origin) { return 0; }
	if (a.origin === undefined) { return 1; }
	if (b.origin === undefined) { return -1; }
	return 0;
}

export function markerOriginSelectPrioritized(ormMap: Map<IMarkerOrigin, IOriginMarkers>) {
	if (ormMap.size === 0) {
		return undefined;
	}
	const sorted = Array.from(ormMap.values()).sort(markerOriginPriorityCompare);
	return sorted[0];
}
