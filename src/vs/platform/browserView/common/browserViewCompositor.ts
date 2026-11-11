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

export interface IBrowserViewDevToolsLayout {
	/** DevTools panel rectangle relative to the view, in DIPs. */
	readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
	/** Size of the whole view in DIPs. */
	readonly viewSize: { readonly width: number; readonly height: number };
}

const edgeTolerance = 2;

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
 * Composes a screenshot of the whole view from the page screenshot, which excludes a docked
 * DevTools panel, and the screenshot of that panel.
 */
export function composeDevToolsScreenshot(page: IBrowserViewBitmap, devTools: IBrowserViewBitmap, layout: IBrowserViewDevToolsLayout): IBrowserViewBitmap {
	const { bounds, viewSize } = layout;
	const scale = devTools.width / bounds.width;
	const result: IBrowserViewBitmap = {
		data: new Uint8Array(Math.round(viewSize.width * scale) * Math.round(viewSize.height * scale) * 4),
		width: Math.round(viewSize.width * scale),
		height: Math.round(viewSize.height * scale),
	};

	const spansHeight = bounds.height >= viewSize.height - edgeTolerance;
	const devToolsLeft = Math.round(bounds.x * scale);
	const devToolsTop = Math.round(bounds.y * scale);
	// The page occupies the side of the view that DevTools doesn't.
	const pageLeft = spansHeight && bounds.x < viewSize.width / 2 ? devTools.width : 0;
	const pageTop = !spansHeight && bounds.y < viewSize.height / 2 ? devTools.height : 0;

	blit(result, page, pageLeft, pageTop);
	blit(result, devTools, devToolsLeft, devToolsTop);
	return result;
}
