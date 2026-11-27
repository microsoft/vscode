/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { EditorContributionInstantiation, registerEditorContribution } from '../../../../../editor/browser/editorExtensions.js';
import { ICodeEditorService } from '../../../../../editor/browser/services/codeEditorService.js';
import { EditorContextKeys } from '../../../../../editor/common/editorContextKeys.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EmptyEditorHintActionsVisible } from './emptyEditorHintActions.js';
import { EmptyEditorHintVisible, focusEmptyEditorHintCommandId } from './emptyEditorHintFocus.js';
import { EmptyTextEditorHintContribution } from './emptyTextEditorHintController.js';

registerEditorContribution(EmptyTextEditorHintContribution.ID, EmptyTextEditorHintContribution, EditorContributionInstantiation.Eager); // eager because it needs to render a help message

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: 'editor.action.hideEmptyEditorHint',
	// Below other editor contributions, so Escape still closes their widgets first
	weight: KeybindingWeight.EditorContrib - 50,
	primary: KeyCode.Escape,
	when: ContextKeyExpr.and(EmptyEditorHintActionsVisible, EditorContextKeys.editorTextFocus, EditorContextKeys.hasNonEmptySelection.toNegated(), EditorContextKeys.hasMultipleSelections.toNegated()),
	handler: accessor => {
		accessor.get(ICodeEditorService).getFocusedCodeEditor()?.getContribution<EmptyTextEditorHintContribution>(EmptyTextEditorHintContribution.ID)?.closeActionsHint();
	}
});

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: focusEmptyEditorHintCommandId,
	// Tab in an empty editor would only insert indentation. Below other editor contributions, so that e.g. accepting a suggestion wins.
	weight: KeybindingWeight.EditorContrib - 50,
	primary: KeyCode.Tab,
	// With tab focus mode, Tab already moves focus and reaches the hint like any other focusable element
	when: ContextKeyExpr.and(EmptyEditorHintVisible, EditorContextKeys.editorTextFocus, EditorContextKeys.tabMovesFocus.toNegated()),
	handler: accessor => {
		const editor = accessor.get(ICodeEditorService).getFocusedCodeEditor();
		if (editor && !editor.getContribution<EmptyTextEditorHintContribution>(EmptyTextEditorHintContribution.ID)?.focusHint()) {
			// The hint is shown by another contribution, e.g. in a notebook cell
			editor.trigger('keyboard', 'tab', null);
		}
	}
});
