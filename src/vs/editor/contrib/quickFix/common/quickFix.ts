/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {IModel, IRange} from 'vs/editor/common/editorCommon';
import {TPromise} from 'vs/base/common/winjs.base';
import {onUnexpectedError} from 'vs/base/common/errors';
import {IQuickFixSupport, IQuickFix} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';

export const QuickFixRegistry = new LanguageFeatureRegistry<IQuickFixSupport>('quickFixSupport');

export interface IQuickFix2 extends IQuickFix {
	support: IQuickFixSupport;
}

export function getQuickFixes(model: IModel, range: IRange): TPromise<IQuickFix2[]> {

	const quickFixes: IQuickFix2[] = [];
	const promises = QuickFixRegistry.all(model).map(support => {
		return support.getQuickFixes(model.getAssociatedResource(), range).then(result => {
			if (!Array.isArray(result)) {
				return
			}
			for (let fix of result) {
				quickFixes.push({
					id: fix.id,
					label: fix.label,
					documentation: fix.documentation,
					score: fix.score,
					support
				});
			}
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(() => quickFixes);
}