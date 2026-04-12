/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { asyncTransaction, transaction } from '../../../../../base/common/observable.js';
import { splitLines } from '../../../../../base/common/strings.js';
import { vBoolean, vObj, vOptionalProp, vString, vUnchecked, vUndefined, vUnion, vWithJsonSchemaRef } from '../../../../../base/common/validation.js';
import * as nls from '../../../../../nls.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../../platform/accessibility/common/accessibility.js';
import { Action2, MenuId } from '../../../../../platform/actions/common/actions.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService, Severity } from '../../../../../platform/notification/common/notification.js';
import { EditorAction } from '../../../../browser/editorExtensions.js';
import { EditorContextKeys } from '../../../../common/editorContextKeys.js';
import { ILanguageFeaturesService } from '../../../../common/services/languageFeatures.js';
import { Context as SuggestContext } from '../../../suggest/browser/suggest.js';
import { hideInlineCompletionId, inlineSuggestCommitAlternativeActionId, inlineSuggestCommitId, jumpToNextInlineEditId, showNextInlineSuggestionActionId, showPreviousInlineSuggestionActionId, toggleShowCollapsedId } from './commandIds.js';
import { InlineCompletionContextKeys } from './inlineCompletionContextKeys.js';
import { InlineCompletionsController } from './inlineCompletionsController.js';
export class ShowNextInlineSuggestionAction extends EditorAction {
    static { this.ID = showNextInlineSuggestionActionId; }
    constructor() {
        super({
            id: ShowNextInlineSuggestionAction.ID,
            label: nls.localize2('action.inlineSuggest.showNext', "Show Next Inline Suggestion"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
            kbOpts: {
                weight: 100,
                primary: 512 /* KeyMod.Alt */ | 94 /* KeyCode.BracketRight */,
            },
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.get(editor);
        controller?.model.get()?.next();
    }
}
export class ShowPreviousInlineSuggestionAction extends EditorAction {
    static { this.ID = showPreviousInlineSuggestionActionId; }
    constructor() {
        super({
            id: ShowPreviousInlineSuggestionAction.ID,
            label: nls.localize2('action.inlineSuggest.showPrevious', "Show Previous Inline Suggestion"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
            kbOpts: {
                weight: 100,
                primary: 512 /* KeyMod.Alt */ | 92 /* KeyCode.BracketLeft */,
            },
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.get(editor);
        controller?.model.get()?.previous();
    }
}
export const providerIdSchemaUri = 'vscode://schemas/inlineCompletionProviderIdArgs';
export function inlineCompletionProviderGetMatcher(provider) {
    const result = [];
    if (provider.providerId) {
        result.push(provider.providerId.toStringWithoutVersion());
        result.push(provider.providerId.extensionId + ':*');
    }
    return result;
}
const argsValidator = vUnion(vObj({
    showNoResultNotification: vOptionalProp(vBoolean()),
    providerId: vOptionalProp(vWithJsonSchemaRef(providerIdSchemaUri, vString())),
    explicit: vOptionalProp(vBoolean()),
    changeHintData: vOptionalProp(vUnchecked()),
}), vUndefined());
export class TriggerInlineSuggestionAction extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.inlineSuggest.trigger',
            label: nls.localize2('action.inlineSuggest.trigger', "Trigger Inline Suggestion"),
            precondition: EditorContextKeys.writable,
            metadata: {
                description: nls.localize('inlineSuggest.trigger.description', "Triggers an inline suggestion in the editor."),
                args: [{
                        name: 'args',
                        description: nls.localize('inlineSuggest.trigger.args', "Options for triggering inline suggestions."),
                        isOptional: true,
                        schema: argsValidator.getJSONSchema(),
                    }]
            }
        });
    }
    async run(accessor, editor, args) {
        const notificationService = accessor.get(INotificationService);
        const languageFeaturesService = accessor.get(ILanguageFeaturesService);
        const controller = InlineCompletionsController.get(editor);
        const validatedArgs = argsValidator.validateOrThrow(args);
        const provider = validatedArgs?.providerId ?
            languageFeaturesService.inlineCompletionsProvider.all(editor.getModel())
                .find(p => inlineCompletionProviderGetMatcher(p).some(m => m === validatedArgs.providerId))
            : undefined;
        await asyncTransaction(async (tx) => {
            /** @description triggerExplicitly from command */
            await controller?.model.get()?.trigger(tx, {
                provider: provider,
                explicit: validatedArgs?.explicit ?? true,
                changeHint: validatedArgs?.changeHintData ? { data: validatedArgs.changeHintData } : undefined,
            });
            controller?.playAccessibilitySignal(tx);
        });
        if (validatedArgs?.showNoResultNotification) {
            if (!controller?.model.get()?.state.get()) {
                notificationService.notify({
                    severity: Severity.Info,
                    message: nls.localize('noInlineSuggestionAvailable', "No inline suggestion is available.")
                });
            }
        }
    }
}
export class AcceptNextWordOfInlineCompletion extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.inlineSuggest.acceptNextWord',
            label: nls.localize2('action.inlineSuggest.acceptNextWord', "Accept Next Word Of Inline Suggestion"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
            kbOpts: {
                weight: 100 /* KeybindingWeight.EditorContrib */ + 1,
                primary: 2048 /* KeyMod.CtrlCmd */ | 17 /* KeyCode.RightArrow */,
                kbExpr: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.cursorBeforeGhostText, CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
            },
            menuOpts: [{
                    menuId: MenuId.InlineSuggestionToolbar,
                    title: nls.localize('acceptWord', 'Accept Word'),
                    group: 'primary',
                    order: 2,
                }],
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.get(editor);
        await controller?.model.get()?.acceptNextWord();
    }
}
export class AcceptNextLineOfInlineCompletion extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.inlineSuggest.acceptNextLine',
            label: nls.localize2('action.inlineSuggest.acceptNextLine', "Accept Next Line Of Inline Suggestion"),
            precondition: ContextKeyExpr.and(EditorContextKeys.writable, InlineCompletionContextKeys.inlineSuggestionVisible),
            kbOpts: {
                weight: 100 /* KeybindingWeight.EditorContrib */ + 1,
            },
            menuOpts: [{
                    menuId: MenuId.InlineSuggestionToolbar,
                    title: nls.localize('acceptLine', 'Accept Line'),
                    group: 'secondary',
                    order: 2,
                }],
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.get(editor);
        await controller?.model.get()?.acceptNextLine();
    }
}
export class AcceptInlineCompletion extends EditorAction {
    constructor() {
        super({
            id: inlineSuggestCommitId,
            label: nls.localize2('action.inlineSuggest.accept', "Accept Inline Suggestion"),
            precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
            menuOpts: [{
                    menuId: MenuId.InlineSuggestionToolbar,
                    title: nls.localize('accept', "Accept"),
                    group: 'primary',
                    order: 2,
                }, {
                    menuId: MenuId.InlineEditsActions,
                    title: nls.localize('accept', "Accept"),
                    group: 'primary',
                    order: 2,
                }],
            kbOpts: [
                {
                    primary: 2 /* KeyCode.Tab */,
                    weight: 200,
                    kbExpr: ContextKeyExpr.or(ContextKeyExpr.and(InlineCompletionContextKeys.inlineSuggestionVisible, EditorContextKeys.tabMovesFocus.toNegated(), SuggestContext.Visible.toNegated(), EditorContextKeys.hoverFocused.toNegated(), InlineCompletionContextKeys.hasSelection.toNegated(), InlineCompletionContextKeys.inlineSuggestionHasIndentationLessThanTabSize), ContextKeyExpr.and(InlineCompletionContextKeys.inlineEditVisible, EditorContextKeys.tabMovesFocus.toNegated(), SuggestContext.Visible.toNegated(), EditorContextKeys.hoverFocused.toNegated(), InlineCompletionContextKeys.tabShouldAcceptInlineEdit)),
                }
            ],
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
        if (controller) {
            controller.model.get()?.accept(controller.editor);
            controller.editor.focus();
        }
    }
}
KeybindingsRegistry.registerKeybindingRule({
    id: inlineSuggestCommitId,
    weight: 202, // greater than jump
    primary: 2 /* KeyCode.Tab */,
    when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});
export class AcceptInlineCompletionAlternativeAction extends EditorAction {
    constructor() {
        super({
            id: inlineSuggestCommitAlternativeActionId,
            label: nls.localize2('action.inlineSuggest.acceptAlternativeAction', "Accept Inline Suggestion Alternative Action"),
            precondition: ContextKeyExpr.and(InlineCompletionContextKeys.inlineSuggestionAlternativeActionVisible, InlineCompletionContextKeys.inlineEditVisible),
            menuOpts: [],
            kbOpts: [
                {
                    primary: 1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */,
                    weight: 203,
                }
            ],
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
        if (controller) {
            controller.model.get()?.accept(controller.editor, true);
            controller.editor.focus();
        }
    }
}
KeybindingsRegistry.registerKeybindingRule({
    id: inlineSuggestCommitAlternativeActionId,
    weight: 203,
    primary: 1024 /* KeyMod.Shift */ | 2 /* KeyCode.Tab */,
    when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});
export class JumpToNextInlineEdit extends EditorAction {
    constructor() {
        super({
            id: jumpToNextInlineEditId,
            label: nls.localize2('action.inlineSuggest.jump', "Jump to next inline edit"),
            precondition: InlineCompletionContextKeys.inlineEditVisible,
            menuOpts: [{
                    menuId: MenuId.InlineEditsActions,
                    title: nls.localize('jump', "Jump"),
                    group: 'primary',
                    order: 1,
                    when: InlineCompletionContextKeys.cursorAtInlineEdit.toNegated(),
                }],
            kbOpts: {
                primary: 2 /* KeyCode.Tab */,
                weight: 201,
                kbExpr: ContextKeyExpr.and(InlineCompletionContextKeys.inlineEditVisible, EditorContextKeys.tabMovesFocus.toNegated(), SuggestContext.Visible.toNegated(), EditorContextKeys.hoverFocused.toNegated(), InlineCompletionContextKeys.tabShouldJumpToInlineEdit),
            }
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.get(editor);
        if (controller) {
            controller.jump();
        }
    }
}
export class HideInlineCompletion extends EditorAction {
    static { this.ID = hideInlineCompletionId; }
    constructor() {
        super({
            id: HideInlineCompletion.ID,
            label: nls.localize2('action.inlineSuggest.hide', "Hide Inline Suggestion"),
            precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineSuggestionVisible, InlineCompletionContextKeys.inlineEditVisible),
            kbOpts: {
                weight: 100 /* KeybindingWeight.EditorContrib */ + 90, // same as hiding the suggest widget
                primary: 9 /* KeyCode.Escape */,
            },
            menuOpts: [{
                    menuId: MenuId.InlineEditsActions,
                    title: nls.localize('reject', "Reject"),
                    group: 'primary',
                    order: 3,
                }]
        });
    }
    async run(accessor, editor) {
        const controller = InlineCompletionsController.getInFocusedEditorOrParent(accessor);
        transaction(tx => {
            controller?.model.get()?.stop('explicitCancel', tx);
        });
        controller?.editor.focus();
    }
}
export class ToggleInlineCompletionShowCollapsed extends EditorAction {
    static { this.ID = toggleShowCollapsedId; }
    constructor() {
        super({
            id: ToggleInlineCompletionShowCollapsed.ID,
            label: nls.localize2('action.inlineSuggest.toggleShowCollapsed', "Toggle Inline Suggestions Show Collapsed"),
            precondition: ContextKeyExpr.true(),
        });
    }
    async run(accessor, editor) {
        const configurationService = accessor.get(IConfigurationService);
        const showCollapsed = configurationService.getValue('editor.inlineSuggest.edits.showCollapsed');
        configurationService.updateValue('editor.inlineSuggest.edits.showCollapsed', !showCollapsed);
    }
}
KeybindingsRegistry.registerKeybindingRule({
    id: HideInlineCompletion.ID,
    weight: -1, // very weak
    primary: 9 /* KeyCode.Escape */,
    secondary: [1024 /* KeyMod.Shift */ | 9 /* KeyCode.Escape */],
    when: ContextKeyExpr.and(InlineCompletionContextKeys.inInlineEditsPreviewEditor)
});
export class ToggleAlwaysShowInlineSuggestionToolbar extends Action2 {
    static { this.ID = 'editor.action.inlineSuggest.toggleAlwaysShowToolbar'; }
    constructor() {
        super({
            id: ToggleAlwaysShowInlineSuggestionToolbar.ID,
            title: nls.localize('action.inlineSuggest.alwaysShowToolbar', "Always Show Toolbar"),
            f1: false,
            precondition: undefined,
            menu: [{
                    id: MenuId.InlineSuggestionToolbar,
                    group: 'secondary',
                    order: 10,
                }],
            toggled: ContextKeyExpr.equals('config.editor.inlineSuggest.showToolbar', 'always')
        });
    }
    async run(accessor) {
        const configService = accessor.get(IConfigurationService);
        const currentValue = configService.getValue('editor.inlineSuggest.showToolbar');
        const newValue = currentValue === 'always' ? 'onHover' : 'always';
        configService.updateValue('editor.inlineSuggest.showToolbar', newValue);
    }
}
export class DevExtractReproSample extends EditorAction {
    constructor() {
        super({
            id: 'editor.action.inlineSuggest.dev.extractRepro',
            label: nls.localize('action.inlineSuggest.dev.extractRepro', "Developer: Extract Inline Suggest State"),
            alias: 'Developer: Inline Suggest Extract Repro',
            precondition: ContextKeyExpr.or(InlineCompletionContextKeys.inlineEditVisible, InlineCompletionContextKeys.inlineSuggestionVisible),
        });
    }
    async run(accessor, editor) {
        const clipboardService = accessor.get(IClipboardService);
        const controller = InlineCompletionsController.get(editor);
        const m = controller?.model.get();
        if (!m) {
            return;
        }
        const repro = m.extractReproSample();
        const inlineCompletionLines = splitLines(JSON.stringify({ inlineCompletion: repro.inlineCompletion }, null, 4));
        const json = inlineCompletionLines.map(l => '// ' + l).join('\n');
        const reproStr = `${repro.documentValue}\n\n// <json>\n${json}\n// </json>\n`;
        await clipboardService.writeText(reproStr);
        return { reproCase: reproStr };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tbWFuZHMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9lZGl0b3IvY29udHJpYi9pbmxpbmVDb21wbGV0aW9ucy9icm93c2VyL2NvbnRyb2xsZXIvY29tbWFuZHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFHaEcsT0FBTyxFQUFFLGdCQUFnQixFQUFFLFdBQVcsRUFBRSxNQUFNLDBDQUEwQyxDQUFDO0FBQ3pGLE9BQU8sRUFBRSxVQUFVLEVBQUUsTUFBTSx1Q0FBdUMsQ0FBQztBQUNuRSxPQUFPLEVBQUUsUUFBUSxFQUFFLElBQUksRUFBRSxhQUFhLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLGtCQUFrQixFQUFFLE1BQU0sMENBQTBDLENBQUM7QUFDdEosT0FBTyxLQUFLLEdBQUcsTUFBTSx1QkFBdUIsQ0FBQztBQUM3QyxPQUFPLEVBQUUsa0NBQWtDLEVBQUUsTUFBTSwrREFBK0QsQ0FBQztBQUNuSCxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLG1EQUFtRCxDQUFDO0FBQ3BGLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDhEQUE4RCxDQUFDO0FBQ2pHLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxNQUFNLCtEQUErRCxDQUFDO0FBQ3RHLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSx5REFBeUQsQ0FBQztBQUN6RixPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sa0VBQWtFLENBQUM7QUFDekgsT0FBTyxFQUFFLG9CQUFvQixFQUFFLFFBQVEsRUFBRSxNQUFNLDZEQUE2RCxDQUFDO0FBRTdHLE9BQU8sRUFBRSxZQUFZLEVBQW9CLE1BQU0seUNBQXlDLENBQUM7QUFDekYsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFFNUUsT0FBTyxFQUFFLHdCQUF3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