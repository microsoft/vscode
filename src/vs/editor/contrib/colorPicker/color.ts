/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { ColorProviderRegistry, DocumentColorProvider, IColorInformation, IColorPresentation } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { ITextModel } from 'vs/editor/common/model';

export interface IColorData {
	colorInfo: IColorInformation;
	provider: DocumentColorProvider;
}

export function getColors(model: ITextModel): TPromise<IColorData[]> {
	const colors: IColorData[] = [];
	const providers = ColorProviderRegistry.ordered(model).reverse();
	const promises = providers.map(provider => asWinJsPromise(token => provider.provideDocumentColors(model, token)).then(result => {
		if (Array.isArray(result)) {
			for (let colorInfo of result) {
				colors.push({ colorInfo, provider });
			}
		}
	}));

	return TPromise.join(promises).then(() => colors);
}

export function getColorPresentations(model: ITextModel, colorInfo: IColorInformation, provider: DocumentColorProvider): TPromise<IColorPresentation[]> {
	return asWinJsPromise(token => provider.provideColorPresentations(model, colorInfo, token));
}
