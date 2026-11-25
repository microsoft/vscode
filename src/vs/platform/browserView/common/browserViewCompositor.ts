/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** A raw 4-bytes-per-pixel bitmap. */
export interface IBrowserViewBitmap {
	readonly data: Uint8Array;
	readonly width: number;
	readonly height: number;
}

export type BrowserViewDevToolsDockSide = 'left' | 'right' | 'bottom';

function blit(target: IBrowserViewBitmap, source: IBrowserViewBitmap, left: number, top: number): void {
	for (let row = 0; row < source.height; row++) {
		const targetRow = top + row;
		if (targetRow < 0 || targetRow >= target.height) {
			continue;
		}
		const startColumn = Math.max(0, -left);
		const columns = Math.min(source.width, target.width - left) - startColumn;
		if (columns <= 0) {
			continue;
		}
		const sourceStart = (row * source.width + startColumn) * 4;
		const targetStart = (targetRow * target.width + left + startColumn) * 4;
		target.data.set(source.data.subarray(sourceStart, sourceStart + columns * 4), targetStart);
	}
}

/**
 * Composes a separately captured page into the hole in a docked DevTools screenshot.
 * Uses the explicit origin for device mode, or the area opposite the dock side by default.
 */
export function composeDevToolsScreenshot(page: IBrowserViewBitmap, devTools: IBrowserViewBitmap, dockSide: BrowserViewDevToolsDockSide, pageOrigin?: { readonly x: number; readonly y: number }): IBrowserViewBitmap {
	const result: IBrowserViewBitmap = { data: devTools.data.slice(), width: devTools.width, height: devTools.height };
	const pageLeft = pageOrigin?.x ?? (dockSide === 'left' ? devTools.width - page.width : 0);
	blit(result, page, pageLeft, pageOrigin?.y ?? 0);
	return result;
}
