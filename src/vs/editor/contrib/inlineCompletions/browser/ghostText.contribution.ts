/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from 'vs/base/common/keyCodes';
import { EditorCommand, registerEditorAction, registerEditorCommand, registerEditorContribution } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { HoverParticipantRegistry } from 'vs/editor/contrib/hover/browser/hoverTypes';
import { inlineSuggestCommitId } from 'vs/editor/contrib/inlineCompletions/browser/consts';
import { GhostTextController, ShowNextInlineSuggestionAction, ShowPreviousInlineSuggestionAction, TriggerInlineSuggestionAction } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextController';
import { InlineCompletionsHoverParticipant } from 'vs/editor/contrib/inlineCompletions/browser/ghostTextHoverParticipant';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingsRegistry } from 'vs/platform/keybinding/common/keybindingsRegistry';

registerEditorContribution(GhostTextController.ID, GhostTextController);
registerEditorAction(TriggerInlineSuggestionAction);
registerEditorAction(ShowNextInlineSuggestionAction);
registerEditorAction(ShowPreviousInlineSuggestionAction);
HoverParticipantRegistry.register(InlineCompletionsHoverParticipant);

const GhostTextCommand = EditorCommand.bindToContribution(GhostTextController.get);

export const commitInlineSuggestionAction = new GhostTextCommand({
	id: inlineSuggestCommitId,
	precondition: GhostTextController.inlineSuggestionVisible,
	handler(x) {
		x.commit();
		x.editor.focus();
	}
});
registerEditorCommand(commitInlineSuggestionAction);

KeybindingsRegistry.registerKeybindingRule({
	primary: KeyCode.Tab,
	weight: 200,
	id: commitInlineSuggestionAction.id,
	when: ContextKeyExpr.and(
		commitInlineSuggestionAction.precondition,
		EditorContextKeys.tabMovesFocus.toNegated(),
		GhostTextController.inlineSuggestionHasIndentationLessThanTabSize
	),
});

registerEditorCommand(new GhostTextCommand({
	id: 'editor.action.inlineSuggest.hide',
	precondition: GhostTextController.inlineSuggestionVisible,
	kbOpts: {
		weight: 100,
		primary: KeyCode.Escape,
	},
	handler(x) {
		x.hide();
	}
}));
