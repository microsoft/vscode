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

	return TPromise.join(promises).then(
		() => allResults.sort(codeActionsComparator)
	);
}

function codeActionsComparator(a: CodeAction, b: CodeAction): number {

	if (a.command) {
		if (b.command) {
			return a.title.localeCompare(b.title);
		} else {
			return 1;
		}
	}
	else if (b.command) {
		return -1;
	}
	else {
		return suggestionsComparator(a, b);
	}
}

function suggestionsComparator(a: CodeAction, b: CodeAction): number {

	if (a.diagnostics) {
		if (b.diagnostics) {
			if (a.diagnostics.length) {
				if (b.diagnostics.length) {
					return a.diagnostics[0].message.localeCompare(b.diagnostics[0].message);
				} else {
					return -1;
				}
			} else {
				if (b.diagnostics.length) {
					return 1;
				} else {
					return a.title.localeCompare(b.title);	// both have diagnostics - but empty
				}
			}
		} else {
			return -1;
		}
	}
	else if (b.diagnostics) {
		return 1;
	}
	else {
		return a.title.localeCompare(b.title);	// both have no diagnostics
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
