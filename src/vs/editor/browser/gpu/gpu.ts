/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { ViewConfigurationChangedEvent, ViewLinesChangedEvent, ViewLinesDeletedEvent, ViewLinesInsertedEvent, ViewScrollChangedEvent, ViewTokensChangedEvent } from '../../common/viewEvents.js';
import type { ViewportData } from '../../common/viewLayout/viewLinesViewportData.js';
import type { ViewLineOptions } from '../viewParts/viewLines/viewLineOptions.js';
import type { IGlyphRasterizer } from './raster/raster.js';

export const enum BindingId {
	GlyphInfo,
	Cells,
	TextureSampler,
	Texture,
	LayoutInfoUniform,
	AtlasDimensionsUniform,
	ScrollOffset,
}

export interface IGpuRenderStrategy extends IDisposable {
	readonly type: string;
	readonly wgsl: string;
	readonly bindGroupEntries: GPUBindGroupEntry[];
	readonly glyphRasterizer: IGlyphRasterizer;

	onLinesDeleted(e: ViewLinesDeletedEvent): boolean;
	onConfigurationChanged(e: ViewConfigurationChangedEvent): boolean;
	onTokensChanged(e: ViewTokensChangedEvent): boolean;
	onLinesInserted(e: ViewLinesInsertedEvent): boolean;
	onLinesChanged(e: ViewLinesChangedEvent): boolean;
	onScrollChanged(e?: ViewScrollChangedEvent): boolean;

	/**
	 * Resets the render strategy, clearing all data and setting up for a new frame.
	 */
	reset(): void;
	update(viewportData: ViewportData, viewLineOptions: ViewLineOptions): number;
	draw(pass: GPURenderPassEncoder, viewportData: ViewportData): void;
}
