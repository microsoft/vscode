/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IAccessibleViewImplentation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { localize } from '../../../../nls.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { IVisibleEditorPane } from '../../../common/editor.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IS_COMPOSITE_NOTEBOOK } from '../../notebook/common/notebookContextKeys.js';

export class ReplEditorAccessibilityHelp implements IAccessibleViewImplentation {
	readonly priority = 105;
	readonly name = 'REPL Editor';
	readonly when = IS_COMPOSITE_NOTEBOOK;
	readonly type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		const activeEditor = accessor.get(ICodeEditorService).getActiveCodeEditor()
			|| accessor.get(ICodeEditorService).getFocusedCodeEditor()
			|| accessor.get(IEditorService).activeEditorPane;

		if (!activeEditor) {
			return;
		}
		return getAccessibilityHelpProvider(accessor, activeEditor);
	}
}

function getAccessibilityHelpText(): string {
	return [
		localize('replEditor.overview', 'You are in a REPL Editor which contains in input box to evaluate expressions and a list of previously executed expressions and their output.'),
		localize('replEditor.execute', 'The Execute command{0} will evaluate the expression in the input box.', '<keybinding:repl.execute>'),
		localize('replEditor.focusHistory', 'The Focus History command{0} will move focus to the list of previously executed items.', '<keybinding:interactive.history.focus>'),
		localize('replEditor.focusReplInput', 'The Focus Input Editor command{0} will move focus to the REPL input box.', '<keybinding:interactive.input.focus>'),
		localize('replEditor.cellNavigation', 'The up and down arrows will also move focus between previously executed items.'),
		localize('replEditor.focusInOutput', 'The Focus Output command{0} will set focus on the output when focused on a previously executed item.', '<keybinding:notebook.cell.focusInOutput>'),
	].join('\n');
}

function getAccessibilityHelpProvider(accessor: ServicesAccessor, editor: ICodeEditor | IVisibleEditorPane) {
	const helpText = getAccessibilityHelpText();
	return new AccessibleContentProvider(
		AccessibleViewProviderId.ReplEditor,
		{ type: AccessibleViewType.Help },
		() => helpText,
		() => editor.focus(),
		AccessibilityVerbositySettingId.ReplEditor,
	);
}
