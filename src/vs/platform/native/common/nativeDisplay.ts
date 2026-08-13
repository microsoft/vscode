/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRectangle } from '../../window/common/window.js';
import { INativeDisplayLayout } from './native.js';

export interface INativeDisplayLike {
	readonly id: number;
	readonly bounds: IRectangle;
	readonly workArea: IRectangle;
	readonly scaleFactor: number;
}

export function toNativeDisplayLayout(display: INativeDisplayLike): INativeDisplayLayout {
	return {
		id: display.id,
		bounds: display.bounds,
		workArea: display.workArea,
		scaleFactor: display.scaleFactor
	};
}
