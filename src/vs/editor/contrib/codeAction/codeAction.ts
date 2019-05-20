/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals, flatten, isNonEmptyArray, mergeSort } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, isPromiseCanceledError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { URI } from 'vs/base/common/uri';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import { CodeAction, CodeActionContext, CodeActionProviderRegistry, CodeActionTrigger as CodeActionTriggerKind } from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CodeActionFilter, CodeActionKind, CodeActionTrigger, filtersAction, mayIncludeActionsOfKind } from './codeActionTrigger';
import { TextModelCancellationTokenSource } from 'vs/editor/browser/core/editorState';

export class CodeActionSet {

	private static codeActionsComparator(a: CodeAction, b: CodeAction): number {
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

	public readonly actions: readonly CodeAction[];

	public constructor(actions: readonly CodeAction[]) {
		this.actions = mergeSort([...actions], CodeActionSet.codeActionsComparator);
	}

	public get hasAutoFix() {
		return this.actions.some(fix => !!fix.kind && CodeActionKind.QuickFix.contains(new CodeActionKind(fix.kind)) && !!fix.isPreferred);
	}
}

export function getCodeActions(
	model: ITextModel,
	rangeOrSelection: Range | Selection,
	trigger: CodeActionTrigger,
	token: CancellationToken
): Promise<CodeActionSet> {
	const filter = trigger.filter || {};

	const codeActionContext: CodeActionContext = {
		only: filter.kind ? filter.kind.value : undefined,
		trigger: trigger.type === 'manual' ? CodeActionTriggerKind.Manual : CodeActionTriggerKind.Automatic
	};

	const cts = new TextModelCancellationTokenSource(model, token);
	const providers = getCodeActionProviders(model, filter);

	const promises = providers.map(provider => {
		return Promise.resolve(provider.provideCodeActions(model, rangeOrSelection, codeActionContext, cts.token)).then(providedCodeActions => {
			if (cts.token.isCancellationRequested || !Array.isArray(providedCodeActions)) {
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

	const listener = CodeActionProviderRegistry.onDidChange(() => {
		const newProviders = CodeActionProviderRegistry.all(model);
		if (!equals(newProviders, providers)) {
			cts.cancel();
		}
	});

	return Promise.all(promises)
		.then(flatten)
		.then(actions => new CodeActionSet(actions))
		.finally(() => {
			listener.dispose();
			cts.dispose();
		});
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

registerLanguageCommand('_executeCodeActionProvider', function (accessor, args): Promise<ReadonlyArray<CodeAction>> {
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
		{ type: 'manual', filter: { includeSourceActions: true, kind: kind && kind.value ? new CodeActionKind(kind.value) : undefined } },
		CancellationToken.None).then(actions => actions.actions);
});
