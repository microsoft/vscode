/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from "vs/base/common/winjs.base";
import { Color } from "vs/base/common/color";
import { ColorProviderRegistry, IColorInfo, ColorProvider } from "vs/editor/common/modes";
import { asWinJsPromise } from "vs/base/common/async";
import { onUnexpectedExternalError } from "vs/base/common/errors";
import { IReadOnlyModel } from "vs/editor/common/editorCommon";
import { IRange } from 'vs/editor/common/core/range';

export class ColorInfo implements IColorInfo {

	private _colorInfo: IColorInfo;
	private _provider: ColorProvider;

	constructor(colorInfo: IColorInfo, provider: ColorProvider) {
		this._colorInfo = colorInfo;
		this._provider = provider;
	}

	get range(): IRange {
		return this._colorInfo.range;
	}

	get color(): Color {
		return this._colorInfo.color;
	}
}


export function getColors(model: IReadOnlyModel): TPromise<IColorInfo[]> {
	let colors: IColorInfo[] = [];

	// ask all providers for colors in parallel
	const promises = ColorProviderRegistry.ordered(model).reverse().map(provider => {
		return asWinJsPromise(token => provider.provideColors(model, token)).then(result => {
			if (Array.isArray(result)) {
				colors.concat(result);
			}
		}, onUnexpectedExternalError);
	});

	return TPromise.join(promises).then(() => {
		return colors;
	});
}