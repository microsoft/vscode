/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { addDisposableListener, getActiveWindow } from '../../../base/browser/dom.js';
import { createFastDomNode, type FastDomNode } from '../../../base/browser/fastDomNode.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../platform/instantiation/common/instantiation.js';
import { observableValue, runOnChange, type IObservable } from '../../../base/common/observable.js';
import { TextureAtlas } from './atlas/textureAtlas.js';
import { GPULifecycle } from './gpuDisposable.js';
import { ensureNonNullable, observeDevicePixelDimensions } from './gpuUtils.js';

export class ViewGpuContext extends Disposable {
	readonly canvas: FastDomNode<HTMLCanvasElement>;
	readonly ctx: GPUCanvasContext;

	readonly device: Promise<GPUDevice>;

	private static _atlas: TextureAtlas | undefined;

	/**
	 * The shared texture atlas to use across all views.
	 *
	 * @throws if called before the GPU device is resolved
	 */
	static get atlas(): TextureAtlas {
		if (!ViewGpuContext._atlas) {
			throw new BugIndicatingError('Cannot call ViewGpuContext.textureAtlas before device is resolved');
		}
		return ViewGpuContext._atlas;
	}
	/**
	 * The shared texture atlas to use across all views. This is a convenience alias for
	 * {@link ViewGpuContext.atlas}.
	 *
	 * @throws if called before the GPU device is resolved
	 */
	get atlas(): TextureAtlas {
		return ViewGpuContext.atlas;
	}

	private readonly _onDidChangeCanvasDevicePixelDimensions = this._register(new Emitter<{ width: number; height: number }>());
	readonly onDidChangeCanvasDevicePixelDimensions = this._onDidChangeCanvasDevicePixelDimensions.event;

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
			if (!ViewGpuContext._atlas) {
				ViewGpuContext._atlas = this._instantiationService.createInstance(TextureAtlas, device.limits.maxTextureDimension2D, undefined);
				runOnChange(this.devicePixelRatio, () => ViewGpuContext.atlas.clear());
			}
		});

		const dprObs = observableValue(this, getActiveWindow().devicePixelRatio);
		this._register(addDisposableListener(getActiveWindow(), 'resize', () => {
			dprObs.set(getActiveWindow().devicePixelRatio, undefined);
		}));
		this.devicePixelRatio = dprObs;

		this._register(observeDevicePixelDimensions(this.canvas.domNode, getActiveWindow(), (width, height) => {
			this.canvas.domNode.width = width;
			this.canvas.domNode.height = height;
			this._onDidChangeCanvasDevicePixelDimensions.fire({ width, height });
		}));
	}
}
