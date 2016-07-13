/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {illegalArgument, onUnexpectedError} from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IdGenerator} from 'vs/base/common/idGenerator';
import {Range} from 'vs/editor/common/core/range';
import {IReadOnlyModel} from 'vs/editor/common/editorCommon';
import {CommonEditorRegistry} from 'vs/editor/common/editorCommonExtensions';
import {CodeActionProviderRegistry, CodeAction, CodeActionProvider} from 'vs/editor/common/modes';
import {IModelService} from 'vs/editor/common/services/modelService';
import {asWinJsPromise} from 'vs/base/common/async';

export interface IQuickFix2 extends CodeAction {
	support: CodeActionProvider;
	id: string;
}

export function getCodeActions(model: IReadOnlyModel, range: Range): TPromise<IQuickFix2[]> {

	const quickFixes: IQuickFix2[] = [];
	let ids = new IdGenerator('quickfix');
	const promises = CodeActionProviderRegistry.all(model).map(support => {
		return asWinJsPromise((token) => {
			return support.provideCodeActions(model, range, token);
		}).then(result => {
			if (!Array.isArray(result)) {
				return;
			}
			for (let fix of result) {
				quickFixes.push({
					command: fix.command,
					score: fix.score,
					id: ids.nextId(),
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

	const editorRange = Range.lift(range);

	return getCodeActions(model, editorRange);
});
