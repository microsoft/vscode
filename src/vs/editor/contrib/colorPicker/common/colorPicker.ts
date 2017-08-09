/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from "vs/base/common/winjs.base";
import { ColorProviderRegistry, IColorRange } from "vs/editor/common/modes";
import { asWinJsPromise } from "vs/base/common/async";
import { onUnexpectedExternalError } from "vs/base/common/errors";
import { IReadOnlyModel } from "vs/editor/common/editorCommon";

export function getColors(model: IReadOnlyModel): TPromise<IColorRange[]> {
	let colorInfo: IColorRange[] = [];

	// ask all providers for colors in parallel
	const promises = ColorProviderRegistry.ordered(model).reverse().map(provider => {
		return asWinJsPromise(token => provider.provideColorRanges(model, token)).then(result => {
			if (Array.isArray(result)) {
				colorInfo = colorInfo.concat(result);
			}
		}, onUnexpectedExternalError);
	});

	return TPromise.join(promises).then(() => {
		return colorInfo;
	});
}