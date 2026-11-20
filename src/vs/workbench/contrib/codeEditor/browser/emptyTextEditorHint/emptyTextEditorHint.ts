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
