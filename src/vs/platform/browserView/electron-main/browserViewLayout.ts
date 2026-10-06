/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IBrowserViewBounds, IBrowserViewRect } from '../common/browserView.js';

/** Native geometry used to place and clip the browser view. */
export interface IBrowserViewNativeLayout {
	readonly viewBounds: IBrowserViewRect;
	readonly viewCornerRadius: number;
}

/** Computes native bounds and the enclosing radius for the browser view. */
export function getBrowserViewNativeLayout(bounds: IBrowserViewBounds): IBrowserViewNativeLayout {
	const x = Math.round(bounds.x * bounds.zoomFactor);
	const y = Math.round(bounds.y * bounds.zoomFactor);
	const width = Math.round(bounds.width * bounds.zoomFactor);
	const height = Math.round(bounds.height * bounds.zoomFactor);
	const viewCornerRadius = Math.round(Math.max(bounds.cornerRadius, bounds.bottomRightCornerRadius) * bounds.zoomFactor);

	return {
		viewBounds: {
			x,
			y,
			width,
			height,
		},
		viewCornerRadius,
	};
}
