/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, equals, isNonEmptyArray } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, isCancellationError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Disposable, DisposableStore, IDisposable } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { TextModelCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ITextModel } from 'vs/editor/common/model';
import * as languages from 'vs/editor/common/languages';
import { IModelService } from 'vs/editor/common/services/model';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { CodeActionFilter, CodeActionKind, CodeActionTrigger, filtersAction, mayIncludeActionsOfKind } from './types';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';

export const codeActionCommandId = 'editor.action.codeAction';
export const refactorCommandId = 'editor.action.refactor';
export const sourceActionCommandId = 'editor.action.sourceAction';
export const organizeImportsCommandId = 'editor.action.organizeImports';
export const fixAllCommandId = 'editor.action.fixAll';

export class CodeActionItem {

	constructor(
		readonly action: languages.CodeAction,
		readonly provider: languages.CodeActionProvider | undefined,
	) { }

	async resolve(token: CancellationToken): Promise<this> {
		if (this.provider?.resolveCodeAction && !this.action.edit) {
			let action: languages.CodeAction | undefined | null;
			try {
				action = await this.provider.resolveCodeAction(this.action, token);
			} catch (err) {
				onUnexpectedExternalError(err);
			}
			if (action) {
				this.action.edit = action.edit;
			}
		}
		return this;
	}
}

export interface CodeActionSet extends IDisposable {
	readonly validActions: readonly CodeActionItem[];
	readonly allActions: readonly CodeActionItem[];
	readonly hasAutoFix: boolean;

	readonly documentation: readonly languages.Command[];
}

class ManagedCodeActionSet extends Disposable implements CodeActionSet {

	private static codeActionsComparator({ action: a }: CodeActionItem, { action: b }: CodeActionItem): number {
		if (a.isPreferred && !b.isPreferred) {
			return -1;
		} else if (!a.isPreferred && b.isPreferred) {
			return 1;
		}

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

	public readonly validActions: readonly CodeActionItem[];
	public readonly allActions: readonly CodeActionItem[];

	public constructor(
		actions: readonly CodeActionItem[],
		public readonly documentation: readonly languages.Command[],
		disposables: DisposableStore,
	) {
		super();
		this._register(disposables);
		this.allActions = [...actions].sort(ManagedCodeActionSet.codeActionsComparator);
		this.validActions = this.allActions.filter(({ action }) => !action.disabled);
	}

	public get hasAutoFix() {
		return this.validActions.some(({ action: fix }) => !!fix.kind && CodeActionKind.QuickFix.contains(new CodeActionKind(fix.kind)) && !!fix.isPreferred);
	}
}


const emptyCodeActionsResponse = { actions: [] as CodeActionItem[], documentation: undefined };

export function getCodeActions(
	registry: LanguageFeatureRegistry<languages.CodeActionProvider>,
	model: ITextModel,
	rangeOrSelection: Range | Selection,
	trigger: CodeActionTrigger,
	progress: IProgress<languages.CodeActionProvider>,
	token: CancellationToken,
): Promise<CodeActionSet> {
	const filter = trigger.filter || {};

	const codeActionContext: languages.CodeActionContext = {
		only: filter.include?.value,
		trigger: trigger.type,
	};

	const cts = new TextModelCancellationTokenSource(model, token);
	const providers = getCodeActionProviders(registry, model, filter);

	const disposables = new DisposableStore();
	const promises = providers.map(async provider => {
		try {
			progress.report(provider);
			const providedCodeActions = await provider.provideCodeActions(model, rangeOrSelection, codeActionContext, cts.token);
			if (providedCodeActions) {
				disposables.add(providedCodeActions);
			}

			if (cts.token.isCancellationRequested) {
				return emptyCodeActionsResponse;
			}

			const filteredActions = (providedCodeActions?.actions || []).filter(action => action && filtersAction(filter, action));
			const documentation = getDocumentation(provider, filteredActions, filter.include);
			return {
				actions: filteredActions.map(action => new CodeActionItem(action, provider)),
				documentation
			};
		} catch (err) {
			if (isCancellationError(err)) {
				throw err;
			}
			onUnexpectedExternalError(err);
			return emptyCodeActionsResponse;
		}
	});

	const listener = registry.onDidChange(() => {
		const newProviders = registry.all(model);
		if (!equals(newProviders, providers)) {
			cts.cancel();
		}
	});

	return Promise.all(promises).then(actions => {
		const allActions = actions.map(x => x.actions).flat();
		const allDocumentation = coalesce(actions.map(x => x.documentation));
		return new ManagedCodeActionSet(allActions, allDocumentation, disposables);
	})
		.finally(() => {
			listener.dispose();
			cts.dispose();
		});
}

function getCodeActionProviders(
	registry: LanguageFeatureRegistry<languages.CodeActionProvider>,
	model: ITextModel,
	filter: CodeActionFilter
) {
	return registry.all(model)
		// Don't include providers that we know will not return code actions of interest
		.filter(provider => {
			if (!provider.providedCodeActionKinds) {
				// We don't know what type of actions this provider will return.
				return true;
			}
			return provider.providedCodeActionKinds.some(kind => mayIncludeActionsOfKind(filter, new CodeActionKind(kind)));
		});
}

function getDocumentation(
	provider: languages.CodeActionProvider,
	providedCodeActions: readonly languages.CodeAction[],
	only?: CodeActionKind
): languages.Command | undefined {
	if (!provider.documentation) {
		return undefined;
	}

	const documentation = provider.documentation.map(entry => ({ kind: new CodeActionKind(entry.kind), command: entry.command }));

	if (only) {
		let currentBest: { readonly kind: CodeActionKind; readonly command: languages.Command } | undefined;
		for (const entry of documentation) {
			if (entry.kind.contains(only)) {
				if (!currentBest) {
					currentBest = entry;
				} else {
					// Take best match
					if (currentBest.kind.contains(entry.kind)) {
						currentBest = entry;
					}
				}
			}
		}
		if (currentBest) {
			return currentBest?.command;
		}
	}

	// Otherwise, check to see if any of the provided actions match.
	for (const action of providedCodeActions) {
		if (!action.kind) {
			continue;
		}

		for (const entry of documentation) {
			if (entry.kind.contains(new CodeActionKind(action.kind))) {
				return entry.command;
			}
		}
	}

	return undefined;
}

CommandsRegistry.registerCommand('_executeCodeActionProvider', async function (accessor, resource: URI, rangeOrSelection: Range | Selection, kind?: string, itemResolveCount?: number): Promise<ReadonlyArray<languages.CodeAction>> {
	if (!(resource instanceof URI)) {
		throw illegalArgument();
	}

	const { codeActionProvider } = accessor.get(ILanguageFeaturesService);
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

	const include = typeof kind === 'string' ? new CodeActionKind(kind) : undefined;
	const codeActionSet = await getCodeActions(
		codeActionProvider,
		model,
		validatedRangeOrSelection,
		{ type: languages.CodeActionTriggerType.Invoke, filter: { includeSourceActions: true, include } },
		Progress.None,
		CancellationToken.None);

	const resolving: Promise<any>[] = [];
	const resolveCount = Math.min(codeActionSet.validActions.length, typeof itemResolveCount === 'number' ? itemResolveCount : 0);
	for (let i = 0; i < resolveCount; i++) {
		resolving.push(codeActionSet.validActions[i].resolve(CancellationToken.None));
	}

	try {
		await Promise.all(resolving);
		return codeActionSet.validActions.map(item => item.action);
	} finally {
		setTimeout(() => codeActionSet.dispose(), 100);
	}
});
