/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../nls.js';
import { MenuId } from '../../../../platform/actions/common/actions.js';
import { Extensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { ContextKeyExpr, RawContextKey } from '../../../../platform/contextkey/common/contextkey.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { diffInserted, diffRemoved, editorWidgetBackground, editorWidgetBorder, editorWidgetForeground, focusBorder, inputBackground, inputPlaceholderForeground, registerColor, transparent, widgetShadow } from '../../../../platform/theme/common/colorRegistry.js';
import { NOTEBOOK_IS_ACTIVE_EDITOR } from '../../notebook/common/notebookContextKeys.js';

// settings

export const enum InlineChatConfigKeys {
	/** @deprecated do not read on client */
	EnableV2 = 'inlineChat.enableV2',
	NotebookAgent = 'inlineChat.notebookAgent',
	DefaultModel = 'inlineChat.defaultModel',
	Affordance = 'inlineChat.affordance',
	FixDiagnostics = 'inlineChat.fixDiagnostics',
	AskInChat = 'inlineChat.askInChat',
}

Registry.as<IConfigurationRegistry>(Extensions.Configuration).registerConfiguration({
	id: 'editor',
	properties: {
		[InlineChatConfigKeys.EnableV2]: {
			description: localize('enableV2', "Whether to use the next version of inline chat."),
			default: false,
			type: 'boolean',
			tags: ['preview'],
			experiment: {
				mode: 'auto'
			}
		},
		[InlineChatConfigKeys.NotebookAgent]: {
			markdownDescription: localize('notebookAgent', "Enable agent-like behavior for inline chat widget in notebooks."),
			default: false,
			type: 'boolean',
			tags: ['experimental'],
			experiment: {
				mode: 'startup'
			}
		},
		[InlineChatConfigKeys.Affordance]: {
			description: localize('affordance', "Controls whether an inline chat affordance is shown when text is selected."),
			default: 'off',
			type: 'string',
			enum: ['off', 'editor'],
			enumDescriptions: [
				localize('affordance.off', "No affordance is shown."),
				localize('affordance.editor', "Show an affordance in the editor at the cursor position."),
			],
			experiment: {
				mode: 'auto'
			},
			tags: ['experimental']
		},
		[InlineChatConfigKeys.FixDiagnostics]: {
			description: localize('fixDiagnostics', "Controls whether the Fix action is shown for diagnostics in the editor."),
			default: true,
			type: 'boolean',
			experiment: {
				mode: 'auto'
			},
			tags: ['experimental']
		},
		[InlineChatConfigKeys.AskInChat]: {
			description: localize('askInChat', "Controls whether files in a chat editing session use Ask in Chat instead of Inline Chat."),
			default: true,
			type: 'boolean',
		},
	}
});


export const INLINE_CHAT_ID = 'editor.contrib.inlineChatController';

// --- CONTEXT


export const CTX_INLINE_CHAT_POSSIBLE = new RawContextKey<boolean>('inlineChatPossible', false, localize('inlineChatHasPossible', "Whether a provider for inline chat exists and whether an editor for inline chat is open"));
export const CTX_INLINE_CHAT_HAS_AGENT2 = new RawContextKey<boolean>('inlineChatHasEditsAgent', false, localize('inlineChatHasEditsAgent', "Whether an agent for inline for interactive editors exists"));
export const CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE = new RawContextKey<boolean>('inlineChatHasNotebookInline', false, localize('inlineChatHasNotebookInline', "Whether an agent for notebook cells exists"));
export const CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT = new RawContextKey<boolean>('inlineChatHasNotebookAgent', false, localize('inlineChatHasNotebookAgent', "Whether an agent for notebook cells exists"));
export const CTX_INLINE_CHAT_VISIBLE = new RawContextKey<boolean>('inlineChatVisible', false, localize('inlineChatVisible', "Whether the interactive editor input is visible"));
export const CTX_INLINE_CHAT_FOCUSED = new RawContextKey<boolean>('inlineChatFocused', false, localize('inlineChatFocused', "Whether the interactive editor input is focused"));
export const CTX_INLINE_CHAT_EDITING = new RawContextKey<boolean>('inlineChatEditing', true, localize('inlineChatEditing', "Whether the user is currently editing or generating code in the inline chat"));
export const CTX_INLINE_CHAT_RESPONSE_FOCUSED = new RawContextKey<boolean>('inlineChatResponseFocused', false, localize('inlineChatResponseFocused', "Whether the interactive widget's response is focused"));
export const CTX_INLINE_CHAT_EMPTY = new RawContextKey<boolean>('inlineChatEmpty', false, localize('inlineChatEmpty', "Whether the interactive editor input is empty"));
export const CTX_INLINE_CHAT_OUTER_CURSOR_POSITION = new RawContextKey<'above' | 'below' | ''>('inlineChatOuterCursorPosition', '', localize('inlineChatOuterCursorPosition', "Whether the cursor of the outer editor is above or below the interactive editor input"));
export const CTX_INLINE_CHAT_REQUEST_IN_PROGRESS = new RawContextKey<boolean>('inlineChatRequestInProgress', false, localize('inlineChatRequestInProgress', "Whether an inline chat request is currently in progress"));
export const CTX_INLINE_CHAT_FILE_BELONGS_TO_CHAT = new RawContextKey<boolean>('inlineChatFileBelongsToChat', false, localize('inlineChatFileBelongsToChat', "Whether the current file belongs to a chat editing session"));
export const CTX_INLINE_CHAT_TERMINATED = new RawContextKey<boolean>('inlineChatTerminated', false, localize('inlineChatTerminated', "Whether the current inline chat session is terminated"));
export const CTX_INLINE_CHAT_AFFORDANCE_VISIBLE = new RawContextKey<boolean>('inlineChatAffordanceVisible', false, localize('inlineChatAffordanceVisible', "Whether an inline chat affordance widget is visible"));

export const CTX_INLINE_CHAT_V1_ENABLED = ContextKeyExpr.or(
	ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, CTX_INLINE_CHAT_HAS_NOTEBOOK_INLINE)
);

export const CTX_INLINE_CHAT_V2_ENABLED = ContextKeyExpr.or(
	CTX_INLINE_CHAT_HAS_AGENT2,
	ContextKeyExpr.and(NOTEBOOK_IS_ACTIVE_EDITOR, CTX_INLINE_CHAT_HAS_NOTEBOOK_AGENT)
);

export const CTX_FIX_DIAGNOSTICS_ENABLED = ContextKeyExpr.equals('config.inlineChat.fixDiagnostics', true);
export const CTX_ASK_IN_CHAT_ENABLED = ContextKeyExpr.equals('config.inlineChat.askInChat', true);

// --- (selected) action identifier

export const ACTION_START = 'inlineChat.start';
export const ACTION_ASK_IN_CHAT = 'inlineChat.askInChat';

// --- menus

export const MENU_INLINE_CHAT_WIDGET_SECONDARY = MenuId.for('inlineChatWidget.secondary');
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
