/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveWindow } from '../../../base/browser/dom.js';
import { createFastDomNode, type FastDomNode } from '../../../base/browser/fastDomNode.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { observableValue, runOnChange, type IObservable } from '../../../base/common/observable.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { ViewLinesGpu } from '../viewParts/viewLinesGpu/viewLinesGpu.js';
import { TextureAtlas } from './atlas/textureAtlas.js';
import { GPULifecycle } from './gpuDisposable.js';
import { ensureNonNullable, observeDevicePixelDimensions } from './gpuUtils.js';

export class ViewGpuContext extends Disposable {
	readonly canvas: FastDomNode<HTMLCanvasElement>;
	readonly ctx: GPUCanvasContext;

	readonly device: Promise<GPUDevice>;

	readonly canvasDevicePixelDimensions: IObservable<{ width: number; height: number }>;

	readonly devicePixelRatio: IObservable<number>;

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService
	) {
		super();

		this.canvas = createFastDomNode(document.createElement('canvas'));
		this.canvas.setClassName('editorCanvas');

		this.ctx = ensureNonNullable(this.canvas.domNode.getContext('webgpu'));

		this.device = GPULifecycle.requestDevice().then(ref => this._register(ref).object);
		this.device.then(device => {
			if (!ViewLinesGpu.atlas) {
				ViewLinesGpu.atlas = this._instantiationService.createInstance(TextureAtlas, device.limits.maxTextureDimension2D, undefined);
				runOnChange(this.devicePixelRatio, () => ViewLinesGpu.atlas.clear());
			}
		});

		const dprObs = observableValue(this, getActiveWindow().devicePixelRatio);
		this._register(addDisposableListener(getActiveWindow(), 'resize', () => {
			dprObs.set(getActiveWindow().devicePixelRatio, undefined);
		}));
		this.devicePixelRatio = dprObs;

		const canvasDevicePixelDimensions = observableValue(this, { width: this.canvas.domNode.width, height: this.canvas.domNode.height });
		this._register(observeDevicePixelDimensions(
			this.canvas.domNode,
			getActiveWindow(),
			(width, height) => canvasDevicePixelDimensions.set({ width, height }, undefined)
		));
		this.canvasDevicePixelDimensions = canvasDevicePixelDimensions;
	}
}
