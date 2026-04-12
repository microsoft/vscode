/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { coalesce, equals, isNonEmptyArray } from '../../../../base/common/arrays.js';
import { CancellationToken } from '../../../../base/common/cancellation.js';
import { illegalArgument, isCancellationError, onUnexpectedExternalError } from '../../../../base/common/errors.js';
import { HierarchicalKind } from '../../../../base/common/hierarchicalKind.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import * as nls from '../../../../nls.js';
import { AccessibilitySignal, IAccessibilitySignalService } from '../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js';
import { CommandsRegistry, ICommandService } from '../../../../platform/commands/common/commands.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { Progress } from '../../../../platform/progress/common/progress.js';
import { ITelemetryService } from '../../../../platform/telemetry/common/telemetry.js';
import { IBulkEditService } from '../../../browser/services/bulkEditService.js';
import { Range } from '../../../common/core/range.js';
import { Selection } from '../../../common/core/selection.js';
import * as languages from '../../../common/languages.js';
import { ILanguageFeaturesService } from '../../../common/services/languageFeatures.js';
import { IModelService } from '../../../common/services/model.js';
import { EditSources } from '../../../common/textModelEditSource.js';
import { TextModelCancellationTokenSource } from '../../editorState/browser/editorState.js';
import { CodeActionItem, CodeActionKind, CodeActionTriggerSource, filtersAction, mayIncludeActionsOfKind } from '../common/types.js';
export const codeActionCommandId = 'editor.action.codeAction';
export const quickFixCommandId = 'editor.action.quickFix';
export const autoFixCommandId = 'editor.action.autoFix';
export const refactorCommandId = 'editor.action.refactor';
export const refactorPreviewCommandId = 'editor.action.refactor.preview';
export const sourceActionCommandId = 'editor.action.sourceAction';
export const organizeImportsCommandId = 'editor.action.organizeImports';
export const fixAllCommandId = 'editor.action.fixAll';
const CODE_ACTION_SOUND_APPLIED_DURATION = 1000;
class ManagedCodeActionSet extends Disposable {
    static codeActionsPreferredComparator(a, b) {
        if (a.isPreferred && !b.isPreferred) {
            return -1;
        }
        else if (!a.isPreferred && b.isPreferred) {
            return 1;
        }
        else {
            return 0;
        }
    }
    static codeActionsComparator({ action: a }, { action: b }) {
        if (a.isAI && !b.isAI) {
            return 1;
        }
        else if (!a.isAI && b.isAI) {
            return -1;
        }
        if (isNonEmptyArray(a.diagnostics)) {
            return isNonEmptyArray(b.diagnostics) ? ManagedCodeActionSet.codeActionsPreferredComparator(a, b) : -1;
        }
        else if (isNonEmptyArray(b.diagnostics)) {
            return 1;
        }
        else {
            return ManagedCodeActionSet.codeActionsPreferredComparator(a, b); // both have no diagnostics
        }
    }
    constructor(actions, documentation, disposables) {
        super();
        this.documentation = documentation;
        this._register(disposables);
        this.allActions = [...actions].sort(ManagedCodeActionSet.codeActionsComparator);
        this.validActions = this.allActions.filter(({ action }) => !action.disabled);
    }
    get hasAutoFix() {
        return this.validActions.some(({ action: fix }) => !!fix.kind && CodeActionKind.QuickFix.contains(new HierarchicalKind(fix.kind)) && !!fix.isPreferred);
    }
    get hasAIFix() {
        return this.validActions.some(({ action: fix }) => !!fix.isAI);
    }
    get allAIFixes() {
        return this.validActions.every(({ action: fix }) => !!fix.isAI);
    }
}
const emptyCodeActionsResponse = { actions: [], documentation: undefined };
export async function getCodeActions(registry, model, rangeOrSelection, trigger, progress, token) {
    const filter = trigger.filter || {};
    const notebookFilter = {
        ...filter,
        excludes: [...(filter.excludes || []), CodeActionKind.Notebook],
    };
    const codeActionContext = {
        only: filter.include?.value,
        trigger: trigger.type,
    };
    const cts = new TextModelCancellationTokenSource(model, token);
    // if the trigger is auto (autosave, lightbulb, etc), we should exclude notebook codeActions
    const excludeNotebookCodeActions = (trigger.type === 2 /* languages.CodeActionTriggerType.Auto */);
    const providers = getCodeActionProviders(registry, model, (excludeNotebookCodeActions) ? notebookFilter : filter);
    const disposables = new DisposableStore();
    const promises = providers.map(async (provider) => {
        const handle = setTimeout(() => progress.report(provider), 1250);
        try {
            const providedCodeActions = await provider.provideCodeActions(model, rangeOrSelection, codeActionContext, cts.token);
            if (cts.token.isCancellationRequested) {
                providedCodeActions?.dispose();
                return emptyCodeActionsResponse;
            }
            if (providedCodeActions) {
                disposables.add(providedCodeActions);
            }
            const filteredActions = (providedCodeActions?.actions || []).filter(action => action && filtersAction(filter, action));
            const documentation = getDocumentationFromProvider(provider, filteredActions, filter.include);
            return {
                actions: filteredActions.map(action => new CodeActionItem(action, provider)),
                documentation
            };
        }
        catch (err) {
            if (isCancellationError(err)) {
                throw err;
            }
            onUnexpectedExternalError(err);
            return emptyCodeActionsResponse;
        }
        finally {
            clearTimeout(handle);
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
        const managedCodeActionSet = new ManagedCodeActionSet(allActions, allDocumentation, disposables);
        disposables.add(managedCodeActionSet);
        return managedCodeActionSet;
    }
    catch (err) {
        disposables.dispose();
        throw err;
    }
    finally {
        listener.dispose();
        cts.dispose();
    }
}
function getCodeActionProviders(registry, model, filter) {
    return registry.all(model)
        // Don't include providers that we know will not return code actions of interest
        .filter(provider => {
        if (!provider.providedCodeActionKinds) {
            // We don't know what type of actions this provider will return.
            return true;
        }
        return provider.providedCodeActionKinds.some(kind => mayIncludeActionsOfKind(filter, new HierarchicalKind(kind)));
    });
}
function* getAdditionalDocumentationForShowingActions(registry, model, trigger, actionsToShow) {
    if (model && actionsToShow.length) {
        for (const provider of registry.all(model)) {
            if (provider._getAdditionalMenuItems) {
                yield* provider._getAdditionalMenuItems?.({ trigger: trigger.type, only: trigger.filter?.include?.value }, actionsToShow.map(item => item.action));
            }
        }
    }
}
function getDocumentationFromProvider(provider, providedCodeActions, only) {
    if (!provider.documentation) {
        return undefined;
    }
    const documentation = provider.documentation.map(entry => ({ kind: new HierarchicalKind(entry.kind), command: entry.command }));
    if (only) {
        let currentBest;
        for (const entry of documentation) {
            if (entry.kind.contains(only)) {
                if (!currentBest) {
                    currentBest = entry;
                }
                else {
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
            if (entry.kind.contains(new HierarchicalKind(action.kind))) {
                return entry.command;
            }
        }
    }
    return undefined;
}
export var ApplyCodeActionReason;
(function (ApplyCodeActionReason) {
    ApplyCodeActionReason["OnSave"] = "onSave";
    ApplyCodeActionReason["FromProblemsView"] = "fromProblemsView";
    ApplyCodeActionReason["FromCodeActions"] = "fromCodeActions";
    ApplyCodeActionReason["FromAILightbulb"] = "fromAILightbulb";
    ApplyCodeActionReason["FromProblemsHover"] = "fromProblemsHover";
})(ApplyCodeActionReason || (ApplyCodeActionReason = {}));
export async function applyCodeAction(accessor, item, codeActionReason, options, token = CancellationToken.None) {
    const bulkEditService = accessor.get(IBulkEditService);
    const commandService = accessor.get(ICommandService);
    const telemetryService = accessor.get(ITelemetryService);
    const notificationService = accessor.get(INotificationService);
    const accessibilitySignalService = accessor.get(IAccessibilitySignalService);
    telemetryService.publicLog2('codeAction.applyCodeAction', {
        codeActionTitle: item.action.title,
        codeActionKind: item.action.kind,
        codeActionIsPreferred: !!item.action.isPreferred,
        reason: codeActionReason,
    });
    accessibilitySignalService.playSignal(AccessibilitySignal.codeActionTriggered);
    await item.resolve(token);
    if (token.isCancellationRequested) {
        return;
    }
    if (item.action.edit?.edits.length) {
        const result = await bulkEditService.apply(item.action.edit, {
            editor: options?.editor,
            label: item.action.title,
            quotableLabel: item.action.title,
            code: 'undoredo.codeAction',
            respectAutoSaveConfig: codeActionReason !== ApplyCodeActionReason.OnSave,
            showPreview: options?.preview,
            reason: EditSources.codeAction({ kind: item.action.kind, providerId: languages.ProviderId.fromExtensionId(item.provider?.extensionId) }),
        });
        if (!result.isApplied) {
            return;
        }
    }
    if (item.action.command) {
        try {
            await commandService.executeCommand(item.action.command.id, ...(item.action.command.arguments || []));
        }
        catch (err) {
            const message = asMessage(err);
            notificationService.error(typeof message === 'string'
                ? message
                : nls.localize('applyCodeActionFailed', "An unknown error occurred while applying the code action"));
        }
    }
    // ensure the start sound and end sound do not overlap
    setTimeout(() => accessibilitySignalService.playSignal(AccessibilitySignal.codeActionApplied), CODE_ACTION_SOUND_APPLIED_DURATION);
}
function asMessage(err) {
    if (typeof err === 'string') {
        return err;
    }
    else if (err instanceof Error && typeof err.message === 'string') {
        return err.message;
    }
    else {
        return undefined;
    }
}
CommandsRegistry.registerCommand('_executeCodeActionProvider', async function (accessor, resource, rangeOrSelection, kind, itemResolveCount) {
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
    const include = typeof kind === 'string' ? new HierarchicalKind(kind) : undefined;
    const codeActionSet = await getCodeActions(codeActionProvider, model, validatedRangeOrSelection, { type: 1 /* languages.CodeActionTriggerType.Invoke */, triggerAction: CodeActionTriggerSource.Default, filter: { includeSourceActions: true, include } }, Progress.None, CancellationToken.None);
    const resolving = [];
    const resolveCount = Math.min(codeActionSet.validActions.length, typeof itemResolveCount === 'number' ? itemResolveCount : 0);
    for (let i = 0; i < resolveCount; i++) {
        resolving.push(codeActionSet.validActions[i].resolve(CancellationToken.None));
    }
    try {
        await Promise.all(resolving);
        return codeActionSet.validActions.map(item => item.action);
    }
    finally {
        setTimeout(() => codeActionSet.dispose(), 100);
    }
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29kZUFjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL2VkaXRvci9jb250cmliL2NvZGVBY3Rpb24vYnJvd3Nlci9jb2RlQWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Z0dBR2dHO0FBRWhHLE9BQU8sRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLGVBQWUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQ3RGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLHlDQUF5QyxDQUFDO0FBQzVFLE9BQU8sRUFBRSxlQUFlLEVBQUUsbUJBQW1CLEVBQUUseUJBQXlCLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNwSCxPQUFPLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSw2Q0FBNkMsQ0FBQztBQUMvRSxPQUFPLEVBQUUsVUFBVSxFQUFFLGVBQWUsRUFBRSxNQUFNLHNDQUFzQyxDQUFDO0FBQ25GLE9BQU8sRUFBRSxHQUFHLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNyRCxPQUFPLEtBQUssR0FBRyxNQUFNLG9CQUFvQixDQUFDO0FBQzFDLE9BQU8sRUFBRSxtQkFBbUIsRUFBRSwyQkFBMkIsRUFBRSxNQUFNLGdGQUFnRixDQUFDO0FBQ2xKLE9BQU8sRUFBRSxnQkFBZ0IsRUFBRSxlQUFlLEVBQUUsTUFBTSxrREFBa0QsQ0FBQztBQUVyRyxPQUFPLEVBQUUsb0JBQW9CLEVBQUUsTUFBTSwwREFBMEQsQ0FBQztBQUNoRyxPQUFPLEVBQWEsUUFBUSxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDdkYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sb0RBQW9ELENBQUM7QUFFdkYsT0FBTyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sOENBQThDLENBQUM7QUFDaEYsT0FBTyxFQUFFLEtBQUssRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3RELE9BQU8sRUFBRSxTQUFT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