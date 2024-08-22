/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ViewportData } from 'vs/editor/common/viewLayout/viewLinesViewportData';

export const enum BindingId {
	GlyphInfo0,
	GlyphInfo1,
	Cells,
	TextureSampler,
	Texture,
	ViewportUniform,
	AtlasDimensionsUniform,
	ScrollOffset,
}

export interface IGpuRenderStrategy {
	readonly wgsl: string;
	readonly bindGroupEntries: GPUBindGroupEntry[];

	update(viewportData: ViewportData): number;
	draw?(pass: GPURenderPassEncoder, viewportData: ViewportData): void;
}
