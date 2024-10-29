/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import type { ViewLineOptions } from '../viewParts/viewLines/viewLineOptions.js';

export const enum BindingId {
	GlyphInfo0,
	GlyphInfo1,
	Cells,
	TextureSampler,
	Texture,
	LayoutInfoUniform,
	AtlasDimensionsUniform,
	ScrollOffset,
}

export interface IGpuRenderStrategy {
	readonly wgsl: string;
	readonly bindGroupEntries: GPUBindGroupEntry[];

	/**
	 * Resets the render strategy, clearing all data and setting up for a new frame.
	 */
	reset(): void;
	update(viewportData: ViewportData, viewLineOptions: ViewLineOptions): number;
	draw?(pass: GPURenderPassEncoder, viewportData: ViewportData): void;
}
