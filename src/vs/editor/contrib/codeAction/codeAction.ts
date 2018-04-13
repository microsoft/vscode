/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isFalsyOrEmpty, mergeSort } from 'vs/base/common/arrays';
import { asWinJsPromise } from 'vs/base/common/async';
import { illegalArgument, onUnexpectedExternalError } from 'vs/base/common/errors';
import URI from 'vs/base/common/uri';
import { TPromise } from 'vs/base/common/winjs.base';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionProviderRegistry } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CodeActionFilter, CodeActionKind } from './codeActionTrigger';

export function getCodeActions(model: ITextModel, range: Range, filter?: CodeActionFilter): TPromise<CodeAction[]> {
	const allCodeActions: CodeAction[] = [];
	const promises = CodeActionProviderRegistry.all(model).map(support => {
		return asWinJsPromise(token => support.provideCodeActions(model, range, { only: filter && filter.kind ? filter.kind.value : undefined }, token)).then(providedCodeActions => {
			if (Array.isArray(providedCodeActions)) {
				for (const action of providedCodeActions) {
					if (!action) {
						continue;
					}

					if (!filter || !filter.kind || (action.kind && filter.kind.contains(action.kind))) {
						if (action.kind && CodeActionKind.Source.contains(action.kind) && (!filter || !filter.includeSourceActions)) {
							continue;
						}
						allCodeActions.push(action);
					}
				}
			}
		}, err => {
			onUnexpectedExternalError(err);
		});
	});

	return TPromise.join(promises).then(
		() => mergeSort(allCodeActions, codeActionsComparator)
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
