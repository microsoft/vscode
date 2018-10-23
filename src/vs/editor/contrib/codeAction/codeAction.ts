/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { flatten, isFalsyOrEmpty, mergeSort } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, isPromiseCanceledError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionContext, CodeActionProviderRegistry, CodeActionTrigger as CodeActionTriggerKind } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CodeActionFilter, CodeActionKind, CodeActionTrigger } from './codeActionTrigger';

export function getCodeActions(model: ITextModel, rangeOrSelection: Range | Selection, trigger?: CodeActionTrigger, token: CancellationToken = CancellationToken.None): Promise<CodeAction[]> {
	const codeActionContext: CodeActionContext = {
		only: trigger && trigger.filter && trigger.filter.kind ? trigger.filter.kind.value : undefined,
		trigger: trigger && trigger.type === 'manual' ? CodeActionTriggerKind.Manual : CodeActionTriggerKind.Automatic
	};

	const promises = CodeActionProviderRegistry.all(model)
		.filter(provider => {
			// Avoid calling providers that we know will not return code actions of interest
			return !provider.providedCodeActionKinds || provider.providedCodeActionKinds.some(providedKind => isValidActionKind(trigger && trigger.filter, providedKind));
		})
		.map(support => {
			return Promise.resolve(support.provideCodeActions(model, rangeOrSelection, codeActionContext, token)).then(providedCodeActions => {
				if (!Array.isArray(providedCodeActions)) {
					return [];
				}
				return providedCodeActions.filter(action => isValidAction(trigger && trigger.filter, action));
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

function isValidAction(filter: CodeActionFilter | undefined, action: CodeAction): boolean {
	return action && isValidActionKind(filter, action.kind);
}

function isValidActionKind(filter: CodeActionFilter | undefined, kind: string | undefined): boolean {
	// Filter out actions by kind
	if (filter && filter.kind && (!kind || !filter.kind.contains(kind))) {
		return false;
	}

	// Don't return source actions unless they are explicitly requested
	if (kind && CodeActionKind.Source.contains(kind) && (!filter || !filter.includeSourceActions)) {
		return false;
	}

	return true;
}

function codeActionsComparator(a: CodeAction, b: CodeAction): number {
	const aHasDiags = !isFalsyOrEmpty(a.diagnostics);
	const bHasDiags = !isFalsyOrEmpty(b.diagnostics);
	if (aHasDiags) {
		if (bHasDiags) {
			return a.diagnostics![0].message.localeCompare(b.diagnostics![0].message);
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

	return getCodeActions(model, model.validateRange(range), { type: 'manual', filter: { includeSourceActions: true } });
});
