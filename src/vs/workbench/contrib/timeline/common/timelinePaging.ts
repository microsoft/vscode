/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export function getDefaultTimelinePageSize(renderHeight: number | undefined, itemHeight: number, pageOnScroll: boolean): number {
	return Math.max(20, Math.floor(((renderHeight ?? 0) / itemHeight) + (pageOnScroll ? 1 : -1)));
}
