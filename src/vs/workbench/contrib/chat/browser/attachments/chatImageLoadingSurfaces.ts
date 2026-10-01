/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../../base/common/lifecycle.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { DitherSurface } from './chatImageDitherSurface.js';
import { GlyphSurface } from './chatImageGlyphSurface.js';
import { TextureSurface } from './chatImageTextures.js';

/**
 * The band loaders of the image-generation mock. Only the width of an image is known while it is
 * generated, so each band keeps a fixed height. CSS shows the selected band, the others never
 * paint, and when the image arrives the band of the selected reveal carries on into it.
 */
export class ChatImageLoadingSurfaces extends Disposable {

	readonly all: readonly TextureSurface[];

	constructor(
		container: HTMLElement,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();
		this.all = [
			this._register(instantiationService.createInstance(DitherSurface, container)),
			this._register(instantiationService.createInstance(GlyphSurface, container)),
		];
	}

	/** Returns the surface that paints a texture transition, if any. */
	get(transition: string): TextureSurface | undefined {
		return this.all.find(surface => surface.lengthOf(transition) !== undefined);
	}
}
