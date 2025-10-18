/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ColorTheme, ColorThemeKind } from './extHostTypes.js';
import { IExtHostRpcService } from './extHostRpcService.js';
import { ExtHostThemingShape, MainContext, MainThreadThemingShape } from './extHost.protocol.js';
import { Emitter, Event } from '../../../base/common/event.js';

export class ExtHostTheming implements ExtHostThemingShape {

	readonly _serviceBrand: undefined;

	private _actual: ColorTheme;
	private _onDidChangeActiveColorTheme: Emitter<ColorTheme>;
	private _mainThreadTheming: MainThreadThemingShape;

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		this._actual = new ColorTheme(ColorThemeKind.Dark);
		this._onDidChangeActiveColorTheme = new Emitter<ColorTheme>();
		this._mainThreadTheming = extHostRpc.getProxy(MainContext.MainThreadTheming);
		
		// Set the theming service on the color theme instance
		this._actual._setThemingService(this);
	}

	public get activeColorTheme(): ColorTheme {
		return this._actual;
	}

	public async getColorAsHex(colorId: string): Promise<string | undefined> {
		return this._mainThreadTheming.$getColorAsHex(colorId);
	}

	$onColorThemeChange(type: string): void {
		let kind;
		switch (type) {
			case 'light': kind = ColorThemeKind.Light; break;
			case 'hcDark': kind = ColorThemeKind.HighContrast; break;
			case 'hcLight': kind = ColorThemeKind.HighContrastLight; break;
			default:
				kind = ColorThemeKind.Dark;
		}
		this._actual = new ColorTheme(kind);
		// Set the theming service on the new color theme instance
		this._actual._setThemingService(this);
		this._onDidChangeActiveColorTheme.fire(this._actual);
	}

	public get onDidChangeActiveColorTheme(): Event<ColorTheme> {
		return this._onDidChangeActiveColorTheme.event;
	}
}
