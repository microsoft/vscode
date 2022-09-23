/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from 'vs/base/common/event';
import { Disposable, markAsSingleton } from 'vs/base/common/lifecycle';
import { RGBA8 } from 'vs/editor/common/core/rgba';
import { TokenizationRegistry } from 'vs/editor/common/languages';
import { ColorId } from 'vs/editor/common/encodedTokenAttributes';

export class MinimapTokensColorTracker extends Disposable {
	private static _INSTANCE: MinimapTokensColorTracker | null = null;
	public static getInstance(): MinimapTokensColorTracker {
		if (!this._INSTANCE) {
			this._INSTANCE = markAsSingleton(new MinimapTokensColorTracker());
		}
		return this._INSTANCE;
	}

	private _colors!: RGBA8[];
	private _backgroundIsLight!: boolean;

	private readonly _onDidChange = new Emitter<void>();
	public readonly onDidChange: Event<void> = this._onDidChange.event;

	private constructor() {
		super();
		this._updateColorMap();
		this._register(TokenizationRegistry.onDidChange(e => {
			if (e.changedColorMap) {
				this._updateColorMap();
			}
		}));
	}

	private _updateColorMap(): void {
		const colorMap = TokenizationRegistry.getColorMap();
		if (!colorMap) {
			this._colors = [RGBA8.Empty];
			this._backgroundIsLight = true;
			return;
		}
		this._colors = [RGBA8.Empty];
		for (let colorId = 1; colorId < colorMap.length; colorId++) {
			const source = colorMap[colorId].rgba;
			// Use a VM friendly data-type
			this._colors[colorId] = new RGBA8(source.r, source.g, source.b, Math.round(source.a * 255));
		}
		const backgroundLuminosity = colorMap[ColorId.DefaultBackground].getRelativeLuminance();
		this._backgroundIsLight = backgroundLuminosity >= 0.5;
		this._onDidChange.fire(undefined);
	}

	public getColor(colorId: ColorId): RGBA8 {
		if (colorId < 1 || colorId >= this._colors.length) {
			// background color (basically invisible)
			colorId = ColorId.DefaultBackground;
		}
		return this._colors[colorId];
	}

	public backgroundIsLight(): boolean {
		return this._backgroundIsLight;
	}
}
