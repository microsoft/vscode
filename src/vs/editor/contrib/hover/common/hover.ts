/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import URI from 'vs/base/common/uri';
import {IExtraInfoSupport, IComputeExtraInfoResult} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {TPromise} from 'vs/base/common/winjs.base';
import {coalesce} from 'vs/base/common/arrays';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IPosition, IModel} from 'vs/editor/common/editorCommon';

export const ExtraInfoRegistry = new LanguageFeatureRegistry<IExtraInfoSupport>('extraInfoSupport');

export function getExtraInfoAtPosition(model: IModel, position: IPosition): TPromise<IComputeExtraInfoResult[]> {

	const resource = model.getAssociatedResource();
	const supports = ExtraInfoRegistry.ordered(model);
	const values: IComputeExtraInfoResult[] = [];

	const promises = supports.map((support, idx) => {
		return support.computeInfo(resource, position).then(result => {
			if (result) {
				let hasRange = (typeof result.range !== 'undefined');
				let hasValue = (typeof result.value !== 'undefined');
				let hasHtmlContent = (typeof result.htmlContent !== 'undefined' && result.htmlContent && result.htmlContent.length > 0);
				if (hasRange && (hasValue || hasHtmlContent)) {
					values[idx]  = result;
				}
			}
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(() => coalesce(values));
}