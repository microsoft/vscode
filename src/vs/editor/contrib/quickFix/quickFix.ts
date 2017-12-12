/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { IReadOnlyModel } from 'vs/editor/common/editorCommon';
import { Range } from 'vs/editor/common/core/range';
import { CodeActionProviderRegistry, CodeAction } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedExternalError, illegalArgument } from 'vs/base/common/errors';
import { IModelService } from 'vs/editor/common/services/modelService';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';

export function getCodeActions(model: IReadOnlyModel, range: Range): TPromise<CodeAction[]> {

	const allResults: CodeAction[] = [];
	const promises = CodeActionProviderRegistry.all(model).map(support => {
		return asWinJsPromise(token => support.provideCodeActions(model, range, token)).then(result => {
			if (Array.isArray(result)) {
				for (const quickFix of result) {
					if (quickFix) {
						allResults.push(quickFix);
					}
				}
			}
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(() =>
		allResults.sort(codeActionsAndCommandsComparator)
	);
}

function isCommand(quickFix: CodeAction | Command): quickFix is Command {
	return (<Command>quickFix).id !== undefined;
}

function codeActionsAndCommandsComparator(a: (CodeAction | Command), b: (CodeAction | Command)): number {
	if (isCommand(a)) {
		if (isCommand(b)) {
			return a.title.localeCompare(b.title);
		} else {
			return 1;
		}
	}
	else {
		if (isCommand(b)) {
			return -1;
		} else {
			return a.title.localeCompare(b.title);
		}
	}
}

registerLanguageCommand('_executeCodeActionProvider', function (accessor, args) {

	const { resource, range } = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	return getCodeActions(model, model.validateRange(range));
});
