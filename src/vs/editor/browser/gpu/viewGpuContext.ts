/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from '../../../base/browser/dom.js';
import { createFastDomNode, type FastDomNode } from '../../../base/browser/fastDomNode.js';
import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { GPULifecycle } from './gpuDisposable.js';
import { ensureNonNullable, observeDevicePixelDimensions } from './gpuUtils.js';

export class ViewGpuContext extends Disposable {
	readonly canvas: FastDomNode<HTMLCanvasElement>;
	readonly ctx: GPUCanvasContext;

	readonly device: Promise<GPUDevice>;

	private readonly _onDidChangeCanvasDevicePixelDimensions = this._register(new Emitter<{ width: number; height: number }>());
	readonly onDidChangeCanvasDevicePixelDimensions = this._onDidChangeCanvasDevicePixelDimensions.event;

	constructor() {
		super();

		this.canvas = createFastDomNode(document.createElement('canvas'));
		this.canvas.setClassName('editorCanvas');

		this.ctx = ensureNonNullable(this.canvas.domNode.getContext('webgpu'));

		this.device = GPULifecycle.requestDevice().then(ref => this._register(ref).object);

		this._register(observeDevicePixelDimensions(this.canvas.domNode, getActiveWindow(), (width, height) => {
			this.canvas.domNode.width = width;
			this.canvas.domNode.height = height;
			this._onDidChangeCanvasDevicePixelDimensions.fire({ width, height });
		}));
	}
}
