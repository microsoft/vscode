/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {coalesce} from 'vs/base/common/arrays';
import {onUnexpectedError} from 'vs/base/common/errors';
import {TPromise} from 'vs/base/common/winjs.base';
import {IModel, IPosition} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IComputeExtraInfoResult, IExtraInfoSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

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

CommonEditorRegistry.registerDefaultLanguageCommand('_executeHoverProvider', getExtraInfoAtPosition);