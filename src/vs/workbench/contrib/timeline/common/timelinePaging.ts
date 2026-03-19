/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getDefaultTimelinePageSize(renderHeight: number | undefined, itemHeight: number, pageOnScroll: boolean): number {
	const safeItemHeight = Number.isFinite(itemHeight) ? Math.max(1, Math.trunc(itemHeight)) : 1;
	const renderHeightCandidate = renderHeight ?? 0;
	const safeRenderHeight = Number.isFinite(renderHeightCandidate) ? renderHeightCandidate : 0;
	return Math.max(20, Math.floor((safeRenderHeight / safeItemHeight) + (pageOnScroll ? 1 : -1)));
}
