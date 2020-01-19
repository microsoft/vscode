/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { equals, flatten, isNonEmptyArray, mergeSort } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, isPromiseCanceledError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { TextModelCancellationTokenSource } from 'vs/editor/browser/core/editorState';
import { registerLanguageCommand } from 'vs/editor/browser/editorExtensions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import * as modes from 'vs/editor/common/modes';
import { IModelService } from 'vs/editor/common/services/modelService';
import { CodeActionFilter, CodeActionKind, CodeActionTrigger, filtersAction, mayIncludeActionsOfKind } from './types';

export const codeActionCommandId = 'editor.action.codeAction';
export const refactorCommandId = 'editor.action.refactor';
export const sourceActionCommandId = 'editor.action.sourceAction';
export const organizeImportsCommandId = 'editor.action.organizeImports';
export const fixAllCommandId = 'editor.action.fixAll';

export interface CodeActionSet extends IDisposable {
	readonly validActions: readonly modes.CodeAction[];
	readonly allActions: readonly modes.CodeAction[];
	readonly hasAutoFix: boolean;
}

class ManagedCodeActionSet extends Disposable implements CodeActionSet {

	private static codeActionsComparator(a: modes.CodeAction, b: modes.CodeAction): number {
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

	public readonly validActions: readonly modes.CodeAction[];
	public readonly allActions: readonly modes.CodeAction[];

	public constructor(actions: readonly modes.CodeAction[], disposables: DisposableStore) {
		super();
		this._register(disposables);
		this.allActions = mergeSort([...actions], ManagedCodeActionSet.codeActionsComparator);
		this.validActions = this.allActions.filter(action => !action.disabled);
	}

	public get hasAutoFix() {
		return this.validActions.some(fix => !!fix.kind && CodeActionKind.QuickFix.contains(new CodeActionKind(fix.kind)) && !!fix.isPreferred);
	}
}

export function getCodeActions(
	model: ITextModel,
	rangeOrSelection: Range | Selection,
	trigger: CodeActionTrigger,
	token: CancellationToken
): Promise<CodeActionSet> {
	const filter = trigger.filter || {};

	const codeActionContext: modes.CodeActionContext = {
		only: filter.include?.value,
		trigger: trigger.type,
	};

	const cts = new TextModelCancellationTokenSource(model, token);
	const providers = getCodeActionProviders(model, filter);

	const disposables = new DisposableStore();
	const promises = providers.map(async provider => {
		try {
			const providedCodeActions = await provider.provideCodeActions(model, rangeOrSelection, codeActionContext, cts.token);
			if (cts.token.isCancellationRequested || !providedCodeActions) {
				return [];
			}
			disposables.add(providedCodeActions);
			return providedCodeActions.actions.filter(action => action && filtersAction(filter, action));
		} catch (err) {
			if (isPromiseCanceledError(err)) {
				throw err;
			}
			onUnexpectedExternalError(err);
			return [];
		}
	});

	const listener = modes.CodeActionProviderRegistry.onDidChange(() => {
		const newProviders = modes.CodeActionProviderRegistry.all(model);
		if (!equals(newProviders, providers)) {
			cts.cancel();
		}
	});

	return Promise.all(promises)
		.then(flatten)
		.then(actions => new ManagedCodeActionSet(actions, disposables))
		.finally(() => {
			listener.dispose();
			cts.dispose();
		});
}

function getCodeActionProviders(
	model: ITextModel,
	filter: CodeActionFilter
) {
	return modes.CodeActionProviderRegistry.all(model)
		// Don't include providers that we know will not return code actions of interest
		.filter(provider => {
			if (!provider.providedCodeActionKinds) {
				// We don't know what type of actions this provider will return.
				return true;
			}
			return provider.providedCodeActionKinds.some(kind => mayIncludeActionsOfKind(filter, new CodeActionKind(kind)));
		});
}

registerLanguageCommand('_executeCodeActionProvider', async function (accessor, args): Promise<ReadonlyArray<modes.CodeAction>> {
	const { resource, rangeOrSelection, kind } = args;
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}

	const model = accessor.get(IModelService).getModel(resource);
	if (!model) {
		throw illegalArgument();
	}

	const validatedRangeOrSelection = Selection.isISelection(rangeOrSelection)
		? Selection.liftSelection(rangeOrSelection)
		: Range.isIRange(rangeOrSelection)
			? model.validateRange(rangeOrSelection)
			: undefined;

	if (!validatedRangeOrSelection) {
		throw illegalArgument();
	}

	const codeActionSet = await getCodeActions(
		model,
		validatedRangeOrSelection,
		{ type: modes.CodeActionTriggerType.Manual, filter: { includeSourceActions: true, include: kind && kind.value ? new CodeActionKind(kind.value) : undefined } },
		CancellationToken.None);

	setTimeout(() => codeActionSet.dispose(), 100);
	return codeActionSet.validActions;
});
