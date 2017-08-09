/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TPromise } from 'vs/base/common/winjs.base';
import { ColorProviderRegistry, IColorRange } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { flatten } from 'vs/base/common/arrays';

export function getColors(model: IReadOnlyModel): TPromise<IColorRange[]> {
	const providers = ColorProviderRegistry.ordered(model).reverse();
	const promises = providers.map(p => asWinJsPromise(token => p.provideColorRanges(model, token)));

	return TPromise.join(promises)
		.then(ranges => flatten(ranges.filter(r => Array.isArray(r))));
}
