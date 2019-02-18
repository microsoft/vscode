/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten, isNonEmptyArray, mergeSort } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, isPromiseCanceledError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionContext, CodeActionProviderRegistry, CodeActionTrigger as CodeActionTriggerKind } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CodeActionKind, CodeActionTrigger, filtersAction, mayIncludeActionsOfKind, CodeActionFilter } from './codeActionTrigger';

export function getCodeActions(
	model: ITextModel,
	rangeOrSelection: Range | Selection,
	trigger: CodeActionTrigger,
	token: CancellationToken
): Promise<CodeAction[]> {
	const filter = trigger.filter || {};

	const codeActionContext: CodeActionContext = {
		only: filter.kind ? filter.kind.value : undefined,
		trigger: trigger.type === 'manual' ? CodeActionTriggerKind.Manual : CodeActionTriggerKind.Automatic
	};

	if (filter.kind && CodeActionKind.Source.contains(filter.kind) && rangeOrSelection.isEmpty()) {
		rangeOrSelection = model.getFullModelRange();
	}

	const promises = getCodeActionProviders(model, filter).map(provider => {
		return Promise.resolve(provider.provideCodeActions(model, rangeOrSelection, codeActionContext, token)).then(providedCodeActions => {
			if (!Array.isArray(providedCodeActions)) {
				return [];
			}
			return providedCodeActions.filter(action => action && filtersAction(filter, action));
		}, (err): CodeAction[] => {
			if (isPromiseCanceledError(err)) {
				throw err;
			}

			onUnexpectedExternalError(err);
			return [];
		});
	});

	return Promise.all(promises)
		.then(flatten)
		.then(allCodeActions => mergeSort(allCodeActions, codeActionsComparator));
}

function getCodeActionProviders(
	model: ITextModel,
	filter: CodeActionFilter
) {
	return CodeActionProviderRegistry.all(model)
		// Don't include providers that we know will not return code actions of interest
		.filter(provider => {
			if (!provider.providedCodeActionKinds) {
				// We don't know what type of actions this provider will return.
				return true;
			}
			return provider.providedCodeActionKinds.some(kind => mayIncludeActionsOfKind(filter, new CodeActionKind(kind)));
		});
}

function codeActionsComparator(a: CodeAction, b: CodeAction): number {
	if (isNonEmptyArray(a.diagnostics)) {
		if (isNonEmptyArray(b.diagnostics)) {
			return a.diagnostics[0].message.localeCompare(b.diagnostics[0].message);
		} else {
			return -1;
		}
	} else if (isNonEmptyArray(b.diagnostics)) {
		return 1;
	} else {
		return 0;	// both have no diagnostics
	}
}

registerLanguageCommand('_executeCodeActionProvider', function (accessor, args) {
	const { resource, range, kind } = args;
	if (!(resource instanceof URI) || !Range.isIRange(range)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	return getCodeActions(
		model,
		model.validateRange(range),
		{ type: 'manual', filter: { includeSourceActions: true, kind: kind ? new CodeActionKind(kind) : undefined } },
		CancellationToken.None);
});
