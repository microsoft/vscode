/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { ColorProviderRegistry, DocumentColorProvider, IColorRange, IColor, ColorFormat } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';

export interface IColorData {
	colorRange: IColorRange;
	provider: DocumentColorProvider;
}

export function getColors(model: IReadOnlyModel): TPromise<IColorData[]> {
	const colors: IColorData[] = [];
	const providers = ColorProviderRegistry.ordered(model).reverse();
	const promises = providers.map(provider => asWinJsPromise(token => provider.provideColorRanges(model, token)).then(result => {
		if (Array.isArray(result)) {
			for (let colorRange of result) {
				colors.push({ colorRange, provider });
			}
		}
	}));

	return TPromise.join(promises).then(() => colors);
}

export function resolveColor(color: IColor, colorFormat: ColorFormat, provider: DocumentColorProvider): TPromise<string> {
	return asWinJsPromise(token => provider.resolveColor(color, colorFormat, token));
}
