/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BugIndicatingError } from '../../../../base/common/errors.js';
import { Disposable, MutableDisposable, type IReference } from '../../../../base/common/lifecycle.js';
import { GPULifecycle } from '../gpuDisposable.js';
import { TextureAtlas } from './textureAtlas.js';
import { TextureAtlasPage } from './textureAtlasPage.js';

export const enum GlyphStorageBufferInfo {
	FloatsPerEntry = 6,
	BytesPerEntry = GlyphStorageBufferInfo.FloatsPerEntry * 4,
	Offset_TexturePosition = 0,
	Offset_TextureSize = 2,
	Offset_OriginPosition = 4,
}

/** Allocates GPU atlas storage for the pages in use, growing in powers of two. */
export class GpuAtlasStorage extends Disposable {
	private readonly _texture = this._register(new MutableDisposable<IReference<GPUTexture>>());
	private readonly _glyphBuffer = this._register(new MutableDisposable<IReference<GPUBuffer>>());
	private _pageCapacity = 0;
	private _pageSize = 0;

	get texture(): GPUTexture { return this._texture.value!.object; }
	get glyphBuffer(): GPUBuffer { return this._glyphBuffer.value!.object; }

	constructor(private readonly _device: GPUDevice) {
		super();
	}

	/** Returns whether storage changed and all page data needs to be uploaded again. */
	setPageCount(pageSize: number, pageCount: number): boolean {
		if (pageCount < 1 || pageCount > TextureAtlas.maximumPageCount) {
			throw new BugIndicatingError('Invalid GPU atlas page count');
		}
		const capacity = 2 ** Math.ceil(Math.log2(pageCount));
		if (capacity === this._pageCapacity && pageSize === this._pageSize) {
			return false;
		}
		this._texture.value = GPULifecycle.createTexture(this._device, {
			label: 'Monaco atlas texture',
			format: 'rgba8unorm',
			size: { width: pageSize, height: pageSize, depthOrArrayLayers: capacity },
			dimension: '2d',
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this._glyphBuffer.value = GPULifecycle.createBuffer(this._device, {
			label: 'Monaco glyph storage buffer',
			size: capacity * TextureAtlasPage.maximumGlyphCount * GlyphStorageBufferInfo.BytesPerEntry,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
		});
		this._pageCapacity = capacity;
		this._pageSize = pageSize;
		return true;
	}
}
