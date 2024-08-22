/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getActiveWindow } from 'vs/base/browser/dom';
import { createFastDomNode, type FastDomNode } from 'vs/base/browser/fastDomNode';
import { Emitter } from 'vs/base/common/event';
import { Disposable } from 'vs/base/common/lifecycle';
import { GPULifecycle } from 'vs/editor/browser/view/gpu/gpuDisposable';
import { ensureNonNullable, observeDevicePixelDimensions } from 'vs/editor/browser/view/gpu/gpuUtils';

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
