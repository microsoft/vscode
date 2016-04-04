/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {illegalArgument, onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {Range} from 'vs/editor/common/core/range';
import {IModel, IRange} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {IQuickFix, IQuickFixSupport} from 'vs/editor/common/modes';
import LanguageFeatureRegistry from 'vs/editor/common/modes/languageFeatureRegistry';
import {IModelService} from 'vs/editor/common/services/modelService';

export const QuickFixRegistry = new LanguageFeatureRegistry<IQuickFixSupport>('quickFixSupport');

export interface IQuickFix2 extends IQuickFix {
	support: IQuickFixSupport;
	id: string;
}

export function getQuickFixes(model: IModel, range: IRange): TPromise<IQuickFix2[]> {

	const quickFixes: IQuickFix2[] = [];
	let idPool = 0;
	const promises = QuickFixRegistry.all(model).map(support => {
		return support.getQuickFixes(model.getAssociatedResource(), range).then(result => {
			if (!Array.isArray(result)) {
				return;
			}
			for (let fix of result) {
				quickFixes.push({
					command: fix.command,
					score: fix.score,
					id: `quickfix_#${idPool++}`,
					support
				});
			}
		}, err => {
			onUnexpectedError(err);
		});
	});

	return TPromise.join(promises).then(() => quickFixes);
}

CommonEditorRegistry.registerLanguageCommand('_executeCodeActionProvider', function(accessor, args) {

	const {resource, range} = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	return getQuickFixes(model, range);
});