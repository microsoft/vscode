/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { WebglAddon } from '@xterm/addon-webgl';
import type { IEvent } from '@xterm/xterm';
import { Emitter } from '../../../../../../base/common/event.js';
import { XtermAddonImporter, type IXtermAddonNameToCtor } from '../../../browser/xterm/xtermAddonImporter.js';

export class TestWebglAddon implements WebglAddon {
	static shouldThrow = false;
	static isEnabled = false;
	private readonly _onChangeTextureAtlas = new Emitter<HTMLCanvasElement>();
	private readonly _onAddTextureAtlasCanvas = new Emitter<HTMLCanvasElement>();
	private readonly _onRemoveTextureAtlasCanvas = new Emitter<HTMLCanvasElement>();
	private readonly _onContextLoss = new Emitter<void>();
	readonly onChangeTextureAtlas = this._onChangeTextureAtlas.event as IEvent<HTMLCanvasElement>;
	readonly onAddTextureAtlasCanvas = this._onAddTextureAtlasCanvas.event as IEvent<HTMLCanvasElement>;
	readonly onRemoveTextureAtlasCanvas = this._onRemoveTextureAtlasCanvas.event as IEvent<HTMLCanvasElement, void>;
	readonly onContextLoss = this._onContextLoss.event as IEvent<void>;
	constructor(preserveDrawingBuffer?: boolean) {
	}
	activate(): void {
		TestWebglAddon.isEnabled = !TestWebglAddon.shouldThrow;
		if (TestWebglAddon.shouldThrow) {
			throw new Error('Test webgl set to throw');
		}
	}
	dispose(): void {
		TestWebglAddon.isEnabled = false;
		this._onChangeTextureAtlas.dispose();
		this._onAddTextureAtlasCanvas.dispose();
		this._onRemoveTextureAtlasCanvas.dispose();
		this._onContextLoss.dispose();
	}
	clearTextureAtlas(): void { }
}

export class TestXtermAddonImporter extends XtermAddonImporter {
	override async importAddon<T extends keyof IXtermAddonNameToCtor>(name: T): Promise<IXtermAddonNameToCtor[T]> {
		if (name === 'webgl') {
			return TestWebglAddon as unknown as IXtermAddonNameToCtor[T];
		}
		return super.importAddon(name);
	}
}

