/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewEventHandler } from '../../../common/viewEventHandler.js';
import type { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import type { ViewContext } from '../../../common/viewModel/viewContext.js';
import type { ViewLineOptions } from '../../viewParts/viewLines/viewLineOptions.js';
import type { IGpuRenderStrategy } from '../gpu.js';
import { GlyphRasterizer } from '../raster/glyphRasterizer.js';
import type { ViewGpuContext } from '../viewGpuContext.js';

export abstract class BaseRenderStrategy extends ViewEventHandler implements IGpuRenderStrategy {

	get glyphRasterizer() { return this._glyphRasterizer.value; }

	abstract type: string;
	abstract wgsl: string;
	abstract bindGroupEntries: GPUBindGroupEntry[];

	constructor(
		protected readonly _context: ViewContext,
		protected readonly _viewGpuContext: ViewGpuContext,
		protected readonly _device: GPUDevice,
		protected readonly _glyphRasterizer: { value: GlyphRasterizer },
	) {
		super();

		this._context.addEventHandler(this);
	}

	abstract reset(): void;
	abstract update(viewportData: ViewportData, viewLineOptions: ViewLineOptions): number;
	abstract draw(pass: GPURenderPassEncoder, viewportData: ViewportData): void;
}
