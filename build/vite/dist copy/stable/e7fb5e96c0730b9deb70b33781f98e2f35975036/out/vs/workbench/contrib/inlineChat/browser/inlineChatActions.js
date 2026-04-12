/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Codicon } from '../../../../base/common/codicons.js';
import { isCodeEditor, isDiffEditor } from '../../../../editor/browser/editorBrowser.js';
import { EditorAction2 } from '../../../../editor/browser/editorExtensions.js';
import { EmbeddedDiffEditorWidget } from '../../../../editor/browser/widget/diffEditor/embeddedDiffEditorWidget.js';
import { EmbeddedCodeEditorWidget } from '../../../../editor/browser/widget/codeEditor/embeddedCodeEditorWidget.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { InlineChatController, InlineChatRunOptions } from './inlineChatController.js';
import { ACTION_ACCEPT_CHANGES, ACTION_ASK_IN_CHAT, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_OUTER_CURSOR_POSITION, CTX_INLINE_CHAT_POSSIBLE, ACTION_START, CTX_INLINE_CHAT_V2_ENABLED, CTX_INLINE_CHAT_V1_ENABLED, CTX_HOVER_MODE, CTX_INLINE_CHAT_INPUT_HAS_TEXT, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_PENDING_CONFIRMATION, CTX_INLINE_CHAT_TERMINATED, CTX_FIX_DIAGNOSTICS_ENABLED, CTX_INLINE_CHAT_AFFORDANCE_VISIBLE, CTX_ASK_IN_CHAT_ENABLED } from '../common/inlineChat.js';
import { ctxHasEditorModification, ctxHasRequestInProgress } from '../../chat/browser/chatEditing/chatEditingEditorContextKeys.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { CONTEXT_ACCESSIBILITY_MODE_ENABLED } from '../../../../platform/accessibility/common/accessibility.js';
import { CommandsRegistry } from '../../../../platform/commands/common/commands.js';
import { registerIcon } from '../../../../platform/theme/common/iconRegistry.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IChatEditingService } from '../../chat/common/editing/chatEditingService.js';
import { IChatWidgetService } from '../../chat/browser/chat.js';
import { ChatEntitlementContextKeys } from '../../../services/chat/common/chatEntitlementService.js';
CommandsRegistry.registerCommandAlias('interactiveEditor.start', 'inlineChat.start');
CommandsRegistry.registerCommandAlias('interactive.acceptChanges', ACTION_ACCEPT_CHANGES);
export const START_INLINE_CHAT = registerIcon('start-inline-chat', Codicon.sparkle, localize('startInlineChat', 'Icon which spawns the inline chat from the editor toolbar.'));
const inlineChatContextKey = ContextKeyExpr.and(ContextKeyExpr.or(CTX_INLINE_CHAT_V1_ENABLED, CTX_INLINE_CHAT_V2_ENABLED), CTX_INLINE_CHAT_POSSIBLE, EditorContextKeys.writable, EditorContextKeys.editorSimpleInput.negate());
export class StartSessionAction extends Action2 {
    constructor() {
        super({
            id: ACTION_START,
            title: localize2('run', 'Open Inline Chat'),
            shortTitle: localize2('runShort', 'Inline Chat'),
            category: AbstractInlineChatAction.category,
            f1: true,
            precondition: ContextKeyExpr.and(inlineChatContextKey, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())),
            keybinding: {
                when: ContextKeyExpr.and(EditorContextKeys.focus, inlineChatContextKey, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())),
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */
            },
            icon: START_INLINE_CHAT,
            menu: [{
                    id: MenuId.EditorContext,
                    group: '1_chat',
                    order: 3,
                    when: ContextKeyExpr.and(inlineChatContextKey, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate()))
                }, {
                    id: MenuId.ChatTitleBarMenu,
                    group: 'a_open',
                    order: 3,
                }]
        });
    }
    run(accessor, ...args) {
        const codeEditorService = accessor.get(ICodeEditorService);
        const editor = codeEditorService.getActiveCodeEditor();
        if (!editor || editor.isSimpleWidget) {
            // well, at least we tried...
            return;
        }
        // precondition does hold
        return editor.invokeWithinContext((editorAccessor) => {
            const kbService = editorAccessor.get(IContextKeyService);
            const logService = editorAccessor.get(ILogService);
            const enabled = kbService.contextMatchesRules(this.desc.precondition ?? undefined);
            if (!enabled) {
                logService.debug(`[EditorAction2] NOT running command because its precondition is FALSE`, this.desc.id, this.desc.precondition?.serialize());
                return;
            }
            return this._runEditorCommand(editorAccessor, editor, ...args);
        });
    }
    async _runEditorCommand(accessor, editor, ...args) {
        const configServce = accessor.get(IConfigurationService);
        const ctrl = InlineChatController.get(editor);
        if (!ctrl) {
            return;
        }
        let options;
        const arg = args[0];
        if (arg && InlineChatRunOptions.isInlineChatRunOptions(arg)) {
            options = arg;
        }
        // use hover overlay to ask for input
        if (!options?.message && configServce.getValue("inlineChat.renderMode" /* InlineChatConfigKeys.RenderMode */) === 'hover') {
            const selection = editor.getSelection();
            const placeholder = selection && !selection.isEmpty()
                ? localize('placeholderWithSelection', "Describe how to change this")
                : localize('placeholderNoSelection', "Describe what to generate");
            // show menu and RETURN because the menu is re-entrant
            await ctrl.inputOverlayWidget.showMenuAtSelection(placeholder);
            return;
        }
        await ctrl?.run({ ...options });
    }
}
// --- InlineChatEditorAffordance menu ---
MenuRegistry.appendMenuItem(MenuId.InlineChatEditorAffordance, {
    group: '0_chat',
    order: 1,
    when: ContextKeyExpr.and(EditorContextKeys.writable, EditorContextKeys.hasNonEmptySelection, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate()), ChatEntitlementContextKeys.Setup.hidden.negate()),
    command: {
        id: ACTION_START,
        title: localize('editCode', "Ask for Edits"),
        shortTitle: localize('editCodeShort', "Ask for Edits"),
        icon: Codicon.sparkle,
    }
});
export class FocusInlineChat extends EditorAction2 {
    constructor() {
        super({
            id: 'inlineChat.focus',
            title: localize2('focus', "Focus Input"),
            f1: true,
            category: AbstractInlineChatAction.category,
            precondition: ContextKeyExpr.and(EditorContextKeys.editorTextFocus, CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_FOCUSED.negate(), CONTEXT_ACCESSIBILITY_MODE_ENABLED.negate()),
            keybinding: [{
                    weight: 0 /* KeybindingWeight.EditorCore */ + 10, // win against core_command
                    when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo('above'), EditorContextKeys.isEmbeddedDiffEditor.negate()),
                    primary: 2048 /* KeyMod.CtrlCmd */ | 18 /* KeyCode.DownArrow */,
                }, {
                    weight: 0 /* KeybindingWeight.EditorCore */ + 10, // win against core_command
                    when: ContextKeyExpr.and(CTX_INLINE_CHAT_OUTER_CURSOR_POSITION.isEqualTo('below'), EditorContextKeys.isEmbeddedDiffEditor.negate()),
                    primary: 2048 /* KeyMod.CtrlCmd */ | 16 /* KeyCode.UpArrow */,
                }]
        });
    }
    runEditorCommand(_accessor, editor, ..._args) {
        InlineChatController.get(editor)?.focus();
    }
}
//#region --- VERSION 2
export class AbstractInlineChatAction extends EditorAction2 {
    static { this.category = localize2('cat', "Inline Chat"); }
    constructor(desc) {
        const massageMenu = (menu) => {
            if (Array.isArray(menu)) {
                for (const entry of menu) {
                    entry.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, entry.when);
                }
            }
            else if (menu) {
                menu.when = ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, menu.when);
            }
        };
        if (Array.isArray(desc.menu)) {
            massageMenu(desc.menu);
        }
        else {
            massageMenu(desc.menu);
        }
        super({
            ...desc,
            category: AbstractInlineChatAction.category,
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_V2_ENABLED, desc.precondition)
        });
    }
    runEditorCommand(accessor, editor, ..._args) {
        const editorService = accessor.get(IEditorService);
        const logService = accessor.get(ILogService);
        let ctrl = InlineChatController.get(editor);
        if (!ctrl) {
            const { activeTextEditorControl } = editorService;
            if (isCodeEditor(activeTextEditorControl)) {
                editor = activeTextEditorControl;
            }
            else if (isDiffEditor(activeTextEditorControl)) {
                editor = activeTextEditorControl.getModifiedEditor();
            }
            ctrl = InlineChatController.get(editor);
        }
        if (!ctrl) {
            logService.warn('[IE] NO controller found for action', this.desc.id, editor.getModel()?.uri);
            return;
        }
        if (editor instanceof EmbeddedCodeEditorWidget) {
            editor = editor.getParentEditor();
        }
        if (!ctrl) {
            for (const diffEditor of accessor.get(ICodeEditorService).listDiffEditors()) {
                if (diffEditor.getOriginalEditor() === editor || diffEditor.getModifiedEditor() === editor) {
                    if (diffEditor instanceof EmbeddedDiffEditorWidget) {
                        this.runEditorCommand(accessor, diffEditor.getParentEditor(), ..._args);
                    }
                }
            }
            return;
        }
        this.runInlineChatCommand(accessor, ctrl, editor, ..._args);
    }
}
export class FixDiagnosticsAction extends AbstractInlineChatAction {
    constructor() {
        super({
            id: 'inlineChat.fixDiagnostics',
            title: localize2('fix', 'Fix'),
            icon: Codicon.editSparkle,
            precondition: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
            menu: [{
                    id: MenuId.InlineChatEditorAffordance,
                    group: '1_quickfix',
                    order: 100,
                    when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
                }, {
                    id: MenuId.ChatEditorInlineMenu,
                    group: '2_chat',
                    order: 1,
                    when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, EditorContextKeys.selectionHasDiagnostics, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
                }, {
                    id: MenuId.MarkerHoverStatusBar,
                    group: '1_fix',
                    order: 1,
                    when: ContextKeyExpr.and(CTX_FIX_DIAGNOSTICS_ENABLED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate()),
                    precondition: null,
                }]
        });
    }
    runInlineChatCommand(_accessor, ctrl, _editor, ..._args) {
        ctrl.inputWidget.hide();
        ctrl.run({ autoSend: true, attachDiagnostics: true });
    }
}
class KeepOrUndoSessionAction extends AbstractInlineChatAction {
    constructor(_keep, desc) {
        super(desc);
        this._keep = _keep;
    }
    async runInlineChatCommand(_accessor, ctrl, editor, ..._args) {
        if (this._keep) {
            await ctrl.acceptSession();
        }
        else {
            await ctrl.rejectSession();
        }
        if (editor.hasModel()) {
            editor.setSelection(editor.getSelection().collapseToStart());
        }
    }
}
export class KeepSessionAction2 extends KeepOrUndoSessionAction {
    constructor() {
        super(true, {
            id: 'inlineChat2.keep',
            title: localize2('Keep', "Keep"),
            f1: true,
            icon: Codicon.check,
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, ctxHasRequestInProgress.negate(), ctxHasEditorModification),
            keybinding: [{
                    when: ContextKeyExpr.and(ChatContextKeys.inputHasFocus, ChatContextKeys.inputHasText.negate()),
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                    primary: 3 /* KeyCode.Enter */
                }, {
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 10,
                    primary: 2048 /* KeyMod.CtrlCmd */ | 3 /* KeyCode.Enter */
                }],
            menu: [{
                    id: MenuId.ChatEditorInlineExecute,
                    group: 'navigation',
                    order: 4,
                    when: ContextKeyExpr.and(ctxHasRequestInProgress.negate(), ctxHasEditorModification, ChatContextKeys.inputHasText.toNegated()),
                }]
        });
    }
}
export class UndoSessionAction2 extends KeepOrUndoSessionAction {
    constructor() {
        super(false, {
            id: 'inlineChat2.undo',
            title: localize2('undo', "Undo"),
            f1: true,
            icon: Codicon.discard,
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_HOVER_MODE),
            keybinding: [{
                    when: ContextKeyExpr.or(ContextKeyExpr.and(EditorContextKeys.focus, ctxHasEditorModification.negate()), ChatContextKeys.inputHasFocus),
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                    primary: 9 /* KeyCode.Escape */,
                }],
            menu: [{
                    id: MenuId.ChatEditorInlineExecute,
                    group: 'navigation',
                    order: 100,
                    when: ContextKeyExpr.and(CTX_HOVER_MODE, ctxHasRequestInProgress.negate(), ctxHasEditorModification)
                }]
        });
    }
}
export class UndoAndCloseSessionAction2 extends KeepOrUndoSessionAction {
    constructor() {
        super(false, {
            id: 'inlineChat2.close',
            title: localize2('close2', "Close"),
            f1: true,
            icon: Codicon.close,
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE),
            keybinding: [{
                    when: ContextKeyExpr.or(ContextKeyExpr.and(EditorContextKeys.focus, ctxHasEditorModification.negate()), ChatContextKeys.inputHasFocus),
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                    primary: 9 /* KeyCode.Escape */,
                }],
            menu: [{
                    id: MenuId.ChatEditorInlineExecute,
                    group: 'navigation',
                    order: 100,
                    when: ContextKeyExpr.or(CTX_HOVER_MODE.negate(), ContextKeyExpr.and(CTX_HOVER_MODE, ctxHasEditorModification.negate(), ctxHasRequestInProgress.negate()), ContextKeyExpr.and(CTX_HOVER_MODE, CTX_INLINE_CHAT_PENDING_CONFIRMATION))
                }]
        });
    }
}
export class CancelSessionAction extends KeepOrUndoSessionAction {
    constructor() {
        super(false, {
            id: 'inlineChat2.cancel',
            title: localize2('cancel', "Cancel"),
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, ctxHasRequestInProgress),
            keybinding: [{
                    when: ContextKeyExpr.or(EditorContextKeys.focus, ChatContextKeys.inputHasFocus),
                    weight: 200 /* KeybindingWeight.WorkbenchContrib */ + 1,
                    primary: 9 /* KeyCode.Escape */,
                }],
            menu: [{
                    id: MenuId.ChatEditorInlineExecute,
                    group: 'navigation',
                    order: 100,
                    when: ContextKeyExpr.and(CTX_HOVER_MODE, ctxHasRequestInProgress)
                }]
        });
    }
}
export class ContinueInlineChatInChatViewAction extends AbstractInlineChatAction {
    constructor() {
        super({
            id: 'inlineChat2.continueInChat',
            title: localize2('continueInChat', "Ask in Chat"),
            icon: Codicon.chatSparkle,
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_HOVER_MODE, CTX_INLINE_CHAT_TERMINATED),
            menu: [{
                    id: MenuId.ChatEditorInlineExecute,
                    group: 'navigation',
                    order: 2,
                    when: ContextKeyExpr.and(CTX_HOVER_MODE, CTX_INLINE_CHAT_TERMINATED)
                }]
        });
    }
    async runInlineChatCommand(_accessor, ctrl, _editor) {
        await ctrl.continueSessionInChat();
    }
}
export class RephraseInlineChatSessionAction extends AbstractInlineChatAction {
    constructor() {
        super({
            id: 'inlineChat2.rephrase',
            title: localize2('rephrase', "Rephrase"),
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_HOVER_MODE, CTX_INLINE_CHAT_TERMINATED),
            menu: [{
                    id: MenuId.ChatEditorInlineExecute,
                    group: 'navigation',
                    order: 1,
                    when: ContextKeyExpr.and(CTX_HOVER_MODE, CTX_INLINE_CHAT_TERMINATED)
                }]
        });
    }
    async runInlineChatCommand(_accessor, ctrl, _editor) {
        await ctrl.rephraseSession();
    }
}
export class SubmitInlineChatInputAction extends AbstractInlineChatAction {
    constructor() {
        super({
            id: 'inlineChat.submitInput',
            title: localize2('submitInput', "Send"),
            icon: Codicon.send,
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_INPUT_HAS_TEXT, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())),
            keybinding: {
                when: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())),
                weight: 0 /* KeybindingWeight.EditorCore */ + 10,
                primary: 3 /* KeyCode.Enter */
            },
            menu: [{
                    id: MenuId.InlineChatInput,
                    group: '0_main',
                    order: 1,
                    when: ContextKeyExpr.or(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT.negate(), CTX_ASK_IN_CHAT_ENABLED.negate())
                }]
        });
    }
    runInlineChatCommand(_accessor, ctrl, _editor, ..._args) {
        const value = ctrl.inputWidget.value;
        if (value) {
            ctrl.inputWidget.addToHistory(value);
            ctrl.inputWidget.hide();
            ctrl.run({ message: value, autoSend: true });
        }
    }
}
export class HideInlineChatInputAction extends AbstractInlineChatAction {
    constructor() {
        super({
            id: 'inlineChat.hideInput',
            title: localize2('hideInput', "Hide Input"),
            precondition: CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED,
            keybinding: {
                when: CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED,
                weight: 0 /* KeybindingWeight.EditorCore */ + 10,
                primary: 9 /* KeyCode.Escape */
            }
        });
    }
    runInlineChatCommand(_accessor, ctrl, _editor, ..._args) {
        ctrl.inputWidget.hide();
    }
}
export class AskInChatAction extends EditorAction2 {
    constructor() {
        super({
            id: ACTION_ASK_IN_CHAT,
            title: localize2('askInChat', 'Ask in Chat'),
            category: AbstractInlineChatAction.category,
            f1: true,
            precondition: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED),
            keybinding: {
                when: EditorContextKeys.focus,
                weight: 200 /* KeybindingWeight.WorkbenchContrib */,
                primary: 2048 /* KeyMod.CtrlCmd */ | 39 /* KeyCode.KeyI */
            },
            icon: Codicon.chatSparkle,
            menu: [{
                    id: MenuId.EditorContext,
                    group: '1_chat',
                    order: 3,
                    when: ContextKeyExpr.and(inlineChatContextKey, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED)
                }, {
                    id: MenuId.InlineChatEditorAffordance,
                    group: '0_chat',
                    order: 1,
                    when: ContextKeyExpr.and(EditorContextKeys.hasNonEmptySelection, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED)
                }]
        });
    }
    async runEditorCommand(accessor, editor) {
        const chatEditingService = accessor.get(IChatEditingService);
        const ctrl = InlineChatController.get(editor);
        if (!ctrl || !editor.hasModel()) {
            return;
        }
        const entry = chatEditingService.editingSessionsObs.get().find(value => value.getEntry(editor.getModel().uri));
        if (entry) {
            ctrl.inputOverlayWidget.showMenuAtSelection(localize('placeholderAskInChat', "Describe how to proceed in Chat"));
        }
    }
}
export class DismissEditorAffordanceAction extends EditorAction2 {
    constructor() {
        super({
            id: 'inlineChat.dismissEditorAffordance',
            title: localize2('dismissAffordance', "Dismiss Editor Affordance"),
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_AFFORDANCE_VISIBLE, ContextKeyExpr.equals('config.inlineChat.affordance', 'editor')),
            keybinding: {
                when: EditorContextKeys.editorTextFocus,
                weight: 100 /* KeybindingWeight.EditorContrib */,
                primary: 9 /* KeyCode.Escape */,
            }
        });
    }
    runEditorCommand(_accessor, editor) {
        InlineChatController.get(editor)?.inputOverlayWidget.dismiss();
    }
}
export class QueueInChatAction extends AbstractInlineChatAction {
    constructor() {
        super({
            id: 'inlineChat.queueInChat',
            title: localize2('queueInChat', "Queue in Chat"),
            icon: Codicon.arrowUp,
            precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_INPUT_HAS_TEXT, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED),
            keybinding: {
                when: ContextKeyExpr.and(CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED, CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED),
                weight: 0 /* KeybindingWeight.EditorCore */ + 10,
                primary: 3 /* KeyCode.Enter */
            },
            menu: [{
                    id: MenuId.InlineChatInput,
                    group: '0_main',
                    order: 1,
                    when: ContextKeyExpr.and(CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT, CTX_ASK_IN_CHAT_ENABLED),
                }]
        });
    }
    async runInlineChatCommand(accessor, ctrl, editor) {
        const chatEditingService = accessor.get(IChatEditingService);
        const chatWidgetService = accessor.get(IChatWidgetService);
        if (!editor.hasModel()) {
            return;
        }
        const value = ctrl.inputWidget.value;
        if (value) {
            ctrl.inputWidget.addToHistory(value);
        }
        ctrl.inputWidget.hide();
        if (!value) {
            return;
        }
        const session = chatEditingService.editingSessionsObs.get().find(s => s.getEntry(editor.getModel().uri));
        if (!session) {
            return;
        }
        const widget = await chatWidgetService.openSession(session.chatSessionResource);
        if (!widget) {
            return;
        }
        const selection = editor.getSelection();
        if (selection && !selection.isEmpty()) {
            await widget.attachmentModel.addFile(editor.getModel().uri, selection);
        }
        await widget.acceptInput(value, { queue: "queued" /* ChatRequestQueueKind.Queued */ });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdEFjdGlvbnMuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9pbmxpbmVDaGF0L2Jyb3dzZXIvaW5saW5lQ2hhdEFjdGlvbnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBRTlELE9BQU8sRUFBZSxZQUFZLEVBQUUsWUFBWSxFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFDdEcsT0FBTyxFQUFFLGFBQWEsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQy9FLE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQ3BILE9BQU8sRUFBRSx3QkFBd0IsRUFBRSxNQUFNLDBFQUEwRSxDQUFDO0FBQ3BILE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGdEQUFnRCxDQUFDO0FBQ25GLE9BQU8sRUFBRSxvQkFBb0IsRUFBRSxvQkFBb0IsRUFBRSxNQUFNLDJCQUEyQixDQUFDO0FBQ3ZGLE9BQU8sRUFBRSxxQkFBcUIsRUFBRSxrQkFBa0IsRUFBRSx1QkFBdUIsRUFBRSx1QkFBdUIsRUFBRSxxQ0FBcUMsRUFBRSx3QkFBd0IsRUFBRSxZQUFZLEVBQUUsMEJBQTBCLEVBQUUsMEJBQTBCLEVBQUUsY0FBYyxFQUFFLDhCQUE4QixFQUFFLG9DQUFvQyxFQUFFLG9DQUFvQyxFQUFFLG9DQUFvQyxFQUFFLDBCQUEwQixFQUF3QiwyQkFBMkIsRUFBRSxrQ0FBa0MsRUFBRSx1QkFBdUIsRUFBRSxNQUFNLHlCQUF5QixDQUFDO0FBQzNqQixPQUFPLEVBQUUsd0JBQXdCLEVBQUUsdUJBQXVCLEVBQUUsTUFBTSxnRUFBZ0UsQ0FBQztBQUNuSSxPQUFPLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FB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