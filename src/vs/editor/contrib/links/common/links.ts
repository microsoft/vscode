/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {onUnexpectedError} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IReadOnlyModel} from 'vs/editor/common/editorCommon';
import {ILink, LinkProviderRegistry} from 'vs/editor/common/modes';
import {asWinJsPromise} from 'vs/base/common/async';

export function getLinks(model: IReadOnlyModel): TPromise<ILink[]> {

	const promises = LinkProviderRegistry.ordered(model).map((support) => {
		return asWinJsPromise((token) => {
			return support.provideLinks(model, token);
		}).then((result) => {
			if (Array.isArray(result)) {
				return <ILink[]> result;
			}
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(manyLinks => {
		let result: ILink[] = [];
		for (let links of manyLinks) {
			if (links) {
				result = result.concat(links);
			}
		}
		return result;
	});
}
