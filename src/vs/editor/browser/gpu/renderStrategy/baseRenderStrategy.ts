/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { MandatoryMutableDisposable } from '../../../../base/common/lifecycle.js';
import { EditorOption } from '../../../common/config/editorOptions.js';
import { ViewEventHandler } from '../../../common/viewEventHandler.js';
import type { ViewportData } from '../../../common/viewLayout/viewLinesViewportData.js';
import type { ViewContext } from '../../../common/viewModel/viewContext.js';
import type { ViewLineOptions } from '../../viewParts/viewLines/viewLineOptions.js';
import type { IGpuRenderStrategy } from '../gpu.js';
import { GlyphRasterizer } from '../raster/glyphRasterizer.js';
import type { ViewGpuContext } from '../viewGpuContext.js';

export abstract class BaseRenderStrategy extends ViewEventHandler implements IGpuRenderStrategy {
	protected readonly _glyphRasterizer: MandatoryMutableDisposable<GlyphRasterizer>;
	get glyphRasterizer() { return this._glyphRasterizer.value; }

	abstract wgsl: string;
	abstract bindGroupEntries: GPUBindGroupEntry[];

	constructor(
		protected readonly _context: ViewContext,
		protected readonly _viewGpuContext: ViewGpuContext,
		protected readonly _device: GPUDevice,
	) {
		super();

		this._context.addEventHandler(this);

		const fontFamily = this._context.configuration.options.get(EditorOption.fontFamily);
		const fontSize = this._context.configuration.options.get(EditorOption.fontSize);

		this._glyphRasterizer = this._register(new MandatoryMutableDisposable(new GlyphRasterizer(fontSize, fontFamily, this._viewGpuContext.devicePixelRatio.get())));
	}

	abstract reset(): void;
	abstract update(viewportData: ViewportData, viewLineOptions: ViewLineOptions): number;
	abstract draw?(pass: GPURenderPassEncoder, viewportData: ViewportData): void;
}
