/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import { ITextModel } from 'vs/editor/common/model';
import { Range } from 'vs/editor/common/core/range';
import { CodeActionProviderRegistry, CodeAction } from 'vs/editor/common/modes';
import { asWinJsPromise } from 'vs/base/common/async';
import { TPromise } from 'vs/base/common/winjs.base';
import { onUnexpectedExternalError, illegalArgument } from 'vs/base/common/errors';
import { IModelService } from 'vs/editor/common/services/modelService';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { isFalsyOrEmpty, mergeSort } from 'vs/base/common/arrays';
import { CodeActionKind, CodeActionFilter } from './codeActionTrigger';

export function getCodeActions(model: ITextModel, range: Range, filter?: CodeActionFilter): TPromise<CodeAction[]> {

	const allResults: CodeAction[] = [];
	const promises = CodeActionProviderRegistry.all(model).map(support => {
		return asWinJsPromise(token => support.provideCodeActions(model, range, { only: filter && filter.kind ? filter.kind.value : undefined }, token)).then(result => {
			if (Array.isArray(result)) {
				for (const quickFix of result) {
					if (!quickFix) {
						continue;
					}

					if (!filter || !filter.kind || (quickFix.kind && filter.kind.contains(quickFix.kind))) {
						if (quickFix.kind && CodeActionKind.Source.contains(quickFix.kind) && (!filter || !filter.includeSourceActions)) {
							continue;
						}
						allResults.push(quickFix);
					}
				}
			}
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(
		() => mergeSort(allResults, codeActionsComparator)
	);
}

function codeActionsComparator(a: CodeAction, b: CodeAction): number {

	const aHasDiags = !isFalsyOrEmpty(a.diagnostics);
	const bHasDiags = !isFalsyOrEmpty(b.diagnostics);
	if (aHasDiags) {
		if (bHasDiags) {
			return a.diagnostics[0].message.localeCompare(b.diagnostics[0].message);
		} else {
			return -1;
		}
	} else if (bHasDiags) {
		return 1;
	} else {
		return 0;	// both have no diagnostics
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
