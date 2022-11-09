/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { coalesce, equals, isNonEmptyArray } from 'vs/base/common/arrays';
import { CancellationToken } from 'vs/base/common/cancellation';
import { illegalArgument, isCancellationError, onUnexpectedExternalError } from 'vs/base/common/errors';
import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { URI } from 'vs/base/common/uri';
import { ICodeEditor } from 'vs/editor/browser/editorBrowser';
import { IBulkEditService } from 'vs/editor/browser/services/bulkEditService';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { LanguageFeatureRegistry } from 'vs/editor/common/languageFeatureRegistry';
import * as languages from 'vs/editor/common/languages';
import { ITextModel } from 'vs/editor/common/model';
import { ILanguageFeaturesService } from 'vs/editor/common/services/languageFeatures';
import { IModelService } from 'vs/editor/common/services/model';
import { TextModelCancellationTokenSource } from 'vs/editor/contrib/editorState/browser/editorState';
import * as nls from 'vs/nls';
import { CommandsRegistry, ICommandService } from 'vs/platform/commands/common/commands';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { INotificationService } from 'vs/platform/notification/common/notification';
import { IProgress, Progress } from 'vs/platform/progress/common/progress';
import { ITelemetryService } from 'vs/platform/telemetry/common/telemetry';
import { CodeActionFilter, CodeActionItem, CodeActionKind, CodeActionSet, CodeActionTrigger, CodeActionTriggerSource, filtersAction, mayIncludeActionsOfKind } from '../common/types';

export const codeActionCommandId = 'editor.action.codeAction';
export const refactorCommandId = 'editor.action.refactor';
export const refactorPreviewCommandId = 'editor.action.refactor.preview';
export const sourceActionCommandId = 'editor.action.sourceAction';
export const organizeImportsCommandId = 'editor.action.organizeImports';
export const fixAllCommandId = 'editor.action.fixAll';

export const acceptSelectedCodeActionCommand = 'acceptSelectedCodeAction';
export const previewSelectedCodeActionCommand = 'previewSelectedCodeAction';

class ManagedCodeActionSet extends Disposable implements CodeActionSet {

	private static codeActionsPreferredComparator(a: languages.CodeAction, b: languages.CodeAction): number {
		if (a.isPreferred && !b.isPreferred) {
			return -1;
		} else if (!a.isPreferred && b.isPreferred) {
			return 1;
		} else {
			return 0;
		}
	}

	private static codeActionsComparator({ action: a }: CodeActionItem, { action: b }: CodeActionItem): number {
		if (isNonEmptyArray(a.diagnostics)) {
			return isNonEmptyArray(b.diagnostics) ? ManagedCodeActionSet.codeActionsPreferredComparator(a, b) : -1;
		} else if (isNonEmptyArray(b.diagnostics)) {
			return 1;
		} else {
			return ManagedCodeActionSet.codeActionsPreferredComparator(a, b); // both have no diagnostics
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

export async function getCodeActions(
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
			const documentation = getDocumentationFromProvider(provider, filteredActions, filter.include);
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

	try {
		const actions = await Promise.all(promises);
		const allActions = actions.map(x => x.actions).flat();
		const allDocumentation = [
			...coalesce(actions.map(x => x.documentation)),
			...getAdditionalDocumentationForShowingActions(registry, model, trigger, allActions)
		];
		return new ManagedCodeActionSet(allActions, allDocumentation, disposables);
	} finally {
		listener.dispose();
		cts.dispose();
	}
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

function* getAdditionalDocumentationForShowingActions(
	registry: LanguageFeatureRegistry<languages.CodeActionProvider>,
	model: ITextModel,
	trigger: CodeActionTrigger,
	actionsToShow: readonly CodeActionItem[],
): Iterable<languages.Command> {
	if (model && actionsToShow.length) {
		for (const provider of registry.all(model)) {
			if (provider._getAdditionalMenuItems) {
				yield* provider._getAdditionalMenuItems?.({ trigger: trigger.type, only: trigger.filter?.include?.value }, actionsToShow.map(item => item.action));
			}
		}
	}
}

function getDocumentationFromProvider(
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

export enum ApplyCodeActionReason {
	OnSave = 'onSave',
	FromProblemsView = 'fromProblemsView',
	FromCodeActions = 'fromCodeActions'
}

export async function applyCodeAction(
	accessor: ServicesAccessor,
	item: CodeActionItem,
	codeActionReason: ApplyCodeActionReason,
	options?: { preview?: boolean; editor?: ICodeEditor },
): Promise<void> {
	const bulkEditService = accessor.get(IBulkEditService);
	const commandService = accessor.get(ICommandService);
	const telemetryService = accessor.get(ITelemetryService);
	const notificationService = accessor.get(INotificationService);

	type ApplyCodeActionEvent = {
		codeActionTitle: string;
		codeActionKind: string | undefined;
		codeActionIsPreferred: boolean;
		reason: ApplyCodeActionReason;
	};
	type ApplyCodeEventClassification = {
		codeActionTitle: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The display label of the applied code action' };
		codeActionKind: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind (refactor, quickfix) of the applied code action' };
		codeActionIsPreferred: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Was the code action marked as being a preferred action?' };
		reason: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The kind of action used to trigger apply code action.' };
		owner: 'mjbvz';
		comment: 'Event used to gain insights into which code actions are being triggered';
	};

	telemetryService.publicLog2<ApplyCodeActionEvent, ApplyCodeEventClassification>('codeAction.applyCodeAction', {
		codeActionTitle: item.action.title,
		codeActionKind: item.action.kind,
		codeActionIsPreferred: !!item.action.isPreferred,
		reason: codeActionReason,
	});

	await item.resolve(CancellationToken.None);

	if (item.action.edit) {
		await bulkEditService.apply(item.action.edit, {
			editor: options?.editor,
			label: item.action.title,
			quotableLabel: item.action.title,
			code: 'undoredo.codeAction',
			respectAutoSaveConfig: true,
			showPreview: options?.preview,
		});
	}

	if (item.action.command) {
		try {
			await commandService.executeCommand(item.action.command.id, ...(item.action.command.arguments || []));
		} catch (err) {
			const message = asMessage(err);
			notificationService.error(
				typeof message === 'string'
					? message
					: nls.localize('applyCodeActionFailed', "An unknown error occurred while applying the code action"));
		}
	}
}

function asMessage(err: any): string | undefined {
	if (typeof err === 'string') {
		return err;
	} else if (err instanceof Error && typeof err.message === 'string') {
		return err.message;
	} else {
		return undefined;
	}
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
		{ type: languages.CodeActionTriggerType.Invoke, triggerAction: CodeActionTriggerSource.Default, filter: { includeSourceActions: true, include } },
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
