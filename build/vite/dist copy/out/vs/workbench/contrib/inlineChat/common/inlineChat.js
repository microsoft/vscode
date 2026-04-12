/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { Extensions } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { diffInserted, diffRemoved, editorWidgetBackground, editorWidgetBorder, editorWidgetForeground, focusBorder, inputBackground, inputPlaceholderForeground, registerColor, transparent, widgetShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from '../../notebook/common/notebookContextKeys.js';
// settings
export var InlineChatConfigKeys;
(function (InlineChatConfigKeys) {
    InlineChatConfigKeys["FinishOnType"] = "inlineChat.finishOnType";
    /** @deprecated do not read on client */
    InlineChatConfigKeys["EnableV2"] = "inlineChat.enableV2";
    InlineChatConfigKeys["notebookAgent"] = "inlineChat.notebookAgent";
    InlineChatConfigKeys["DefaultModel"] = "inlineChat.defaultModel";
    InlineChatConfigKeys["Affordance"] = "inlineChat.affordance";
    InlineChatConfigKeys["RenderMode"] = "inlineChat.renderMode";
    InlineChatConfigKeys["FixDiagnostics"] = "inlineChat.fixDiagnostics";
    InlineChatConfigKeys["AskInChat"] = "inlineChat.askInChat";
})(InlineChatConfigKeys || (InlineChatConfigKeys = {}));
Registry.as(Extensions.Configuration).registerConfiguration({
    id: 'editor',
    properties: {
        ["inlineChat.finishOnType" /* InlineChatConfigKeys.FinishOnType */]: {
            description: localize('finishOnType', "Whether to finish an inline chat session when typing outside of changed regions."),
            default: false,
            type: 'boolean'
        },
        ["inlineChat.enableV2" /* InlineChatConfigKeys.EnableV2 */]: {
            description: localize('enableV2', "Whether to use the next version of inline chat."),
            default: false,
            type: 'boolean',
            tags: ['preview'],
            experiment: {
                mode: 'auto'
            }
        },
        ["inlineChat.notebookAgent" /* InlineChatConfigKeys.notebookAgent */]: {
            markdownDescription: localize('notebookAgent', "Enable agent-like behavior for inline chat widget in notebooks."),
            default: false,
            type: 'boolean',
            tags: ['experimental'],
            experiment: {
                mode: 'startup'
            }
        },
        ["inlineChat.affordance" /* InlineChatConfigKeys.Affordance */]: {
            description: localize('affordance', "Controls whether an inline chat affordance is shown when text is selected."),
            default: 'off',
            type: 'string',
            enum: ['off', 'gutter', 'editor'],
            enumDescriptions: [
                localize('affordance.off', "No affordance is shown."),
                localize('affordance.gutter', "Show an affordance in the gutter."),
                localize('affordance.editor', "Show an affordance in the editor at the cursor position."),
            ],
            experiment: {
                mode: 'auto'
            },
            tags: ['experimental']
        },
        ["inlineChat.renderMode" /* InlineChatConfigKeys.RenderMode */]: {
            description: localize('renderMode', "Controls how inline chat is rendered."),
            default: 'hover',
            type: 'string',
            enum: ['zone', 'hover'],
            enumDescriptions: [
                localize('renderMode.zone', "Render inline chat as a zone widget below the current line."),
                localize('renderMode.hover', "Render inline chat as a hover overlay."),
            ],
            experiment: {
                mode: 'auto'
            },
            tags: ['experimental']
        },
        ["inlineChat.fixDiagnostics" /* InlineChatConfigKeys.FixDiagnostics */]: {
            description: localize('fixDiagnostics', "Controls whether the Fix action is shown for diagnostics in the editor."),
            default: true,
            type: 'boolean',
            experiment: {
                mode: 'auto'
            },
            tags: ['experimental']
        },
        ["inlineChat.askInChat" /* InlineChatConfigKeys.AskInChat */]: {
            description: localize('askInChat', "Controls whether files in a chat editing session use Ask in Chat instead of Inline Chat."),
            default: true,
            type: 'boolean',
        },
    }
});
export const INLINE_CHAT_ID = 'interactiveEditor';
export const INTERACTIVE_EDITOR_ACCESSIBILITY_HELP_ID = 'interactiveEditorAccessiblityHelp';
// --- CONTEXT
export var InlineChatResponseType;
(function (InlineChatResponseType) {
    InlineChatResponseType["None"] = "none";
    InlineChatResponseType["Messages"] = "messages";
    InlineChatResponseType["MessagesAndEdits"] = "messagesAndEdits";
})(InlineChatResponseType || (InlineChatResponseType = {}));
export const CTX_INLINE_CHAT_POSSIBLE = new RawContextKey('inlineChatPossible', false, localize('inlineChatHasPossible', "Whether a provider for inline chat exists and whether an editor for inline chat is open"));
export const CTX_INLINE_CHAT_HAS_AGENT2 = new RawContextKey('inlineChatHasEditsAgent', false, localize('inlineChatHasEditsAgent', "Whether an agent for inline for interactive editors exists"));
export const CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE = new RawContextKey('inlineChatHasNotebookInline', false, localize('inlineChatHasNotebookInline', "Whether an agent for notebook cells exists"));
export const CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT = new RawContextKey('inlineChatHasNotebookAgent', false, localize('inlineChatHasNotebookAgent', "Whether an agent for notebook cells exists"));
export const CTX_INLINE_CHAT_VISIBLE = new RawContextKey('inlineChatVisible', false, localize('inlineChatVisible', "Whether the interactive editor input is visible"));
export const CTX_INLINE_CHAT_FOCUSED = new RawContextKey('inlineChatFocused', false, localize('inlineChatFocused', "Whether the interactive editor input is focused"));
export const CTX_INLINE_CHAT_EDITING = new RawContextKey('inlineChatEditing', true, localize('inlineChatEditing', "Whether the user is currently editing or generating code in the inline chat"));
export const CTX_INLINE_CHAT_RESPONSE_FOCUSED = new RawContextKey('inlineChatResponseFocused', false, localize('inlineChatResponseFocused', "Whether the interactive widget's response is focused"));
export const CTX_INLINE_CHAT_EMPTY = new RawContextKey('inlineChatEmpty', false, localize('inlineChatEmpty', "Whether the interactive editor input is empty"));
export const CTX_INLINE_CHAT_INPUT_HAS_TEXT = new RawContextKey('inlineChatInputHasText', false, localize('inlineChatInputHasText', "Whether the inline chat input widget has text"));
export const CTX_INLINE_CHAT_INPUT_WIDGET_FOCUSED = new RawContextKey('inlineChatInputWidgetFocused', false, localize('inlineChatInputWidgetFocused', "Whether the inline chat input widget editor is focused"));
export const CTX_INLINE_CHAT_INNER_CURSOR_FIRST = new RawContextKey('inlineChatInnerCursorFirst', false, localize('inlineChatInnerCursorFirst', "Whether the cursor of the iteractive editor input is on the first line"));
export const CTX_INLINE_CHAT_INNER_CURSOR_LAST = new RawContextKey('inlineChatInnerCursorLast', false, localize('inlineChatInnerCursorLast', "Whether the cursor of the iteractive editor input is on the last line"));
export const CTX_INLINE_CHAT_OUTER_CURSOR_POSITION = new RawContextKey('inlineChatOuterCursorPosition', '', localize('inlineChatOuterCursorPosition', "Whether the cursor of the outer editor is above or below the interactive editor input"));
export const CTX_INLINE_CHAT_HAS_STASHED_SESSION = new RawContextKey('inlineChatHasStashedSession', false, localize('inlineChatHasStashedSession', "Whether interactive editor has kept a session for quick restore"));
export const CTX_INLINE_CHAT_CHANGE_HAS_DIFF = new RawContextKey('inlineChatChangeHasDiff', false, localize('inlineChatChangeHasDiff', "Whether the current change supports showing a diff"));
export const CTX_INLINE_CHAT_CHANGE_SHOWS_DIFF = new RawContextKey('inlineChatChangeShowsDiff', false, localize('inlineChatChangeShowsDiff', "Whether the current change showing a diff"));
export const CTX_INLINE_CHAT_REQUEST_IN_PROGRESS = new RawContextKey('inlineChatRequestInProgress', false, localize('inlineChatRequestInProgress', "Whether an inline chat request is currently in progress"));
export const CTX_INLINE_CHAT_RESPONSE_TYPE = new RawContextKey('inlineChatResponseType', "none" /* InlineChatResponseType.None */, localize('inlineChatResponseTypes', "What type was the responses have been receieved, nothing yet, just messages, or messaged and local edits"));
export const CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT = new RawContextKey('inlineChatFileBelongsToChat', false, localize('inlineChatFileBelongsToChat', "Whether the current file belongs to a chat editing session"));
export const CTX_INLINE_CHAT_PENDING_CONFIRMATION = new RawContextKey('inlineChatPendingConfirmation', false, localize('inlineChatPendingConfirmation', "Whether an inline chat request is pending user confirmation"));
export const CTX_INLINE_CHAT_TERMINATED = new RawContextKey('inlineChatTerminated', false, localize('inlineChatTerminated', "Whether the current inline chat session is terminated"));
export const CTX_INLINE_CHAT_AFFORDANCE_VISIBLE = new RawContextKey('inlineChatAffordanceVisible', false, localize('inlineChatAffordanceVisible', "Whether an inline chat affordance widget is visible"));
export const CTX_INLINE_CHAT_V1_ENABLED = ContextKeyExpr.or(ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE));
export const CTX_INLINE_CHAT_V2_ENABLED = ContextKeyExpr.or(CTX_INLINE_CHAT_HAS_AGENT2, ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT));
export const CTX_HOVER_MODE = ContextKeyExpr.equals('config.inlineChat.renderMode', 'hover');
export const CTX_FIX_DIAGNOSTICS_ENABLED = ContextKeyExpr.equals('config.inlineChat.fixDiagnostics', true);
export const CTX_ASK_IN_CHAT_ENABLED = ContextKeyExpr.equals('config.inlineChat.askInChat', true);
// --- (selected) action identifier
export const ACTION_START = 'inlineChat.start';
export const ACTION_ASK_IN_CHAT = 'inlineChat.askInChat';
export const ACTION_ACCEPT_CHANGES = 'inlineChat.acceptChanges';
export const ACTION_DISCARD_CHANGES = 'inlineChat.discardHunkChange';
export const ACTION_REGENERATE_RESPONSE = 'inlineChat.regenerate';
export const ACTION_VIEW_IN_CHAT = 'inlineChat.viewInChat';
export const ACTION_TOGGLE_DIFF = 'inlineChat.toggleDiff';
export const ACTION_REPORT_ISSUE = 'inlineChat.reportIssue';
// --- menus
export const MENU_INLINE_CHAT_WIDGET_STATUS = MenuId.for('inlineChatWidget.status');
export const MENU_INLINE_CHAT_WIDGET_SECONDARY = MenuId.for('inlineChatWidget.secondary');
export const MENU_INLINE_CHAT_ZONE = MenuId.for('inlineChatWidget.changesZone');
export const MENU_INLINE_CHAT_SIDE = MenuId.for('inlineChatWidget.side');
// --- colors
export const inlineChatForeground = registerColor('inlineChat.foreground', editorWidgetForeground, localize('inlineChat.foreground', "Foreground color of the interactive editor widget"));
export const inlineChatBackground = registerColor('inlineChat.background', editorWidgetBackground, localize('inlineChat.background', "Background color of the interactive editor widget"));
export const inlineChatBorder = registerColor('inlineChat.border', editorWidgetBorder, localize('inlineChat.border', "Border color of the interactive editor widget"));
export const inlineChatShadow = registerColor('inlineChat.shadow', widgetShadow, localize('inlineChat.shadow', "Shadow color of the interactive editor widget"));
export const inlineChatInputBorder = registerColor('inlineChatInput.border', editorWidgetBorder, localize('inlineChatInput.border', "Border color of the interactive editor input"));
export const inlineChatInputFocusBorder = registerColor('inlineChatInput.focusBorder', focusBorder, localize('inlineChatInput.focusBorder', "Border color of the interactive editor input when focused"));
export const inlineChatInputPlaceholderForeground = registerColor('inlineChatInput.placeholderForeground', inputPlaceholderForeground, localize('inlineChatInput.placeholderForeground', "Foreground color of the interactive editor input placeholder"));
export const inlineChatInputBackground = registerColor('inlineChatInput.background', inputBackground, localize('inlineChatInput.background', "Background color of the interactive editor input"));
export const inlineChatDiffInserted = registerColor('inlineChatDiff.inserted', transparent(diffInserted, .5), localize('inlineChatDiff.inserted', "Background color of inserted text in the interactive editor input"));
export const overviewRulerInlineChatDiffInserted = registerColor('editorOverviewRuler.inlineChatInserted', { dark: transparent(diffInserted, 0.6), light: transparent(diffInserted, 0.8), hcDark: transparent(diffInserted, 0.6), hcLight: transparent(diffInserted, 0.8) }, localize('editorOverviewRuler.inlineChatInserted', 'Overview ruler marker color for inline chat inserted content.'));
export const minimapInlineChatDiffInserted = registerColor('editorMinimap.inlineChatInserted', { dark: transparent(diffInserted, 0.6), light: transparent(diffInserted, 0.8), hcDark: transparent(diffInserted, 0.6), hcLight: transparent(diffInserted, 0.8) }, localize('editorMinimap.inlineChatInserted', 'Minimap marker color for inline chat inserted content.'));
export const inlineChatDiffRemoved = registerColor('inlineChatDiff.removed', transparent(diffRemoved, .5), localize('inlineChatDiff.removed', "Background color of removed text in the interactive editor input"));
export const overviewRulerInlineChatDiffRemoved = registerColor('editorOverviewRuler.inlineChatRemoved', { dark: transparent(diffRemoved, 0.6), light: transparent(diffRemoved, 0.8), hcDark: transparent(diffRemoved, 0.6), hcLight: transparent(diffRemoved, 0.8) }, localize('editorOverviewRuler.inlineChatRemoved', 'Overview ruler marker color for inline chat removed content.'));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5saW5lQ2hhdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3dvcmtiZW5jaC9jb250cmliL2lubGluZUNoYXQvY29tbW9uL2lubGluZUNoYXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLG9CQUFvQixDQUFDO0FBQzlDLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN4RSxPQUFPLEVBQUUsVUFBVSxFQUEwQixNQUFNLG9FQUFvRSxDQUFDO0FBQ3hILE9BQU8sRUFBRSxjQUFjLEVBQUUsYUFBYSxFQUFFLE1BQU0sc0RBQXNELENBQUM7QUFDckcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLGtEQUFrRCxDQUFDO0FBQzVFLE9BQU8sRUFBRSxZQUFZLEVBQUUsV0FBVyxFQUFFLHNCQUFzQixFQUFFLGtCQUFrQixFQUFFLHNCQUFzQixFQUFFLFdBQVcsRUFBRSxlQUFlLEVBQUUsMEJBQTBCLEVBQUUsYUFBYSxFQUFFLFdBQVcsRUFBRSxZQUFZLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUN2USxPQUFPLEVBQUUseUJBQXlCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUV6RixXQUFXO0FBRVgsTUFBTSxDQUFOLElBQWtCLG9CQVVqQjtBQVZELFdBQWtCLG9CQUFvQjtJQUNyQyxnRUFBd0MsQ0FBQTtJQUN4Qyx3Q0FBd0M7SUFDeEMsd0RBQWdDLENBQUE7SUFDaEMsa0VBQTBDLENBQUE7SUFDMUMsZ0VBQXdDLENBQUE7SUFDeEMsNERBQW9DLENBQUE7SUFDcEMsNERBQW9DLENBQUE7SUFDcEMsb0VBQTRDLENBQUE7SUFDNUMsMERBQWtDLENBQUE7QUFDbkMsQ0FBQyxFQVZpQixvQkFBb0IsS0FBcEIsb0JBQW9CLFFBVXJDO0FBRUQsUUFBUSxDQUFDLEVBQUUsQ0FBeUIs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