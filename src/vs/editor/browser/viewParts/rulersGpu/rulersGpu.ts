/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ViewPart } from '../../view/viewPart.js';
import { RenderingContext, RestrictedRenderingContext } from '../../view/renderingContext.js';
import { ViewContext } from '../../../common/viewModel/viewContext.js';
import * as viewEvents from '../../../common/viewEvents.js';
import { EditorOption, IRulerOption } from '../../../common/config/editorOptions.js';
import type { ViewGpuContext } from '../../gpu/viewGpuContext.js';
import type { IObjectCollectionBufferEntry } from '../../gpu/objectCollectionBuffer.js';
import type { RectangleRendererEntrySpec } from '../../gpu/rectangleRenderer.js';

/**
 * Rulers are vertical lines that appear at certain columns in the editor. There can be >= 0 rulers
 * at a time.
 */
export class RulersGpu extends ViewPart {

	private readonly _gpuShapes: IObjectCollectionBufferEntry<RectangleRendererEntrySpec>[] = [];
	private _rulers: IRulerOption[];
	private _typicalHalfwidthCharacterWidth: number;

	constructor(
		context: ViewContext,
		private readonly _viewGpuContext: ViewGpuContext
	) {
		super(context);
		const options = this._context.configuration.options;
		this._rulers = options.get(EditorOption.rulers);
		this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
	}

	// --- begin event handlers

	public override onConfigurationChanged(e: viewEvents.ViewConfigurationChangedEvent): boolean {
		const options = this._context.configuration.options;
		this._rulers = options.get(EditorOption.rulers);
		this._typicalHalfwidthCharacterWidth = options.get(EditorOption.fontInfo).typicalHalfwidthCharacterWidth;
		return true;
	}
	public override onScrollChanged(e: viewEvents.ViewScrollChangedEvent): boolean {
		return e.scrollHeightChanged;
	}

	// --- end event handlers

	public prepareRender(ctx: RenderingContext): void {
		// Nothing to read
	}

	public render(ctx: RestrictedRenderingContext): void {
		for (let i = 0, len = this._rulers.length; i < len; i++) {
			const ruler = this._rulers[i];
			const shape = this._gpuShapes[i];
			const rulerData = this._getRulerData(ruler);
			if (!shape) {
				this._gpuShapes[i] = this._viewGpuContext.rectangleRenderer.register(...rulerData);
			} else {
				// TODO: Setting ruler data directly would be nicer (eg. `shape.setData(rulerData)`)
				shape.set('x', rulerData[0]);
				shape.set('y', rulerData[1]);
				shape.set('width', rulerData[2]);
				shape.set('height', rulerData[3]);
				shape.set('red', rulerData[4]);
				shape.set('green', rulerData[5]);
				shape.set('blue', rulerData[6]);
				shape.set('alpha', rulerData[7]);
			}
		}
		while (this._gpuShapes.length > this._rulers.length) {
			this._gpuShapes.splice(-1, 1)[0].dispose();
		}
	}

	private _getRulerData(ruler: IRulerOption): [number, number, number, number, number, number, number, number] {
		return [
			// TODO: The x should be relative to the left side of the viewport
			ruler.column * this._typicalHalfwidthCharacterWidth * this._viewGpuContext.devicePixelRatio.get(),
			0,
			1,
			this._viewGpuContext.canvasDevicePixelDimensions.get().height,
			1,
			0,
			0,
			1
		];
	}
}
