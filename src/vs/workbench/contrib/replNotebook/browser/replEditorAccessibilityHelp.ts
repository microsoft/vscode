/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IAccessibleViewImplementation } from '../../../../platform/accessibility/browser/accessibleViewRegistry.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { localize } from '../../../../nls.js';
import { AccessibleViewProviderId, AccessibleViewType, AccessibleContentProvider } from '../../../../platform/accessibility/browser/accessibleView.js';
import { AccessibilityVerbositySettingId } from '../../accessibility/browser/accessibilityConfiguration.js';
import { ICodeEditorService } from '../../../../editor/browser/services/codeEditorService.js';
import { IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED } from '../../notebook/common/notebookContextKeys.js';

export class ReplEditorInputAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'REPL Editor Input';
	readonly when = ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED.negate());
	readonly type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		return getAccessibilityHelpProvider(accessor.get(ICodeEditorService), getAccessibilityInputHelpText());
	}
}

function getAccessibilityInputHelpText(): string {
	return [
		localize('replEditor.inputOverview', 'You are in a REPL Editor Input box which will accept code to be executed in the REPL.'),
		localize('replEditor.execute', 'The Execute command{0} will evaluate the expression in the input box.', '<keybinding:repl.execute>'),
		localize('replEditor.configReadExecution', 'The setting `accessibility.replEditor.readLastExecutionOutput` controls if output will be automatically read when execution completes.'),
		localize('replEditor.autoFocusRepl', 'The setting `accessibility.replEditor.autoFocusReplExecution` controls if focus will automatically move to the REPL after executing code.'),
		localize('replEditor.focusLastItemAdded', 'The Focus Last executed command{0} will move focus to the last executed item in the REPL history.', '<keybinding:repl.focusLastItemExecuted>'),
		localize('replEditor.inputAccessibilityView', 'When you run the Open Accessbility View command{0} from this input box, the output from the last execution will be shown in the accessibility view.', '<keybinding:editor.action.accessibleView>'),
		localize('replEditor.focusReplInput', 'The Focus Input Editor command{0} will bring the focus back to this editor.', '<keybinding:repl.input.focus>'),
	].join('\n');
}

export class ReplEditorHistoryAccessibilityHelp implements IAccessibleViewImplementation {
	readonly priority = 105;
	readonly name = 'REPL Editor History';
	readonly when = ContextKeyExpr.and(IS_COMPOSITE_NOTEBOOK, NOTEBOOK_CELL_LIST_FOCUSED);
	readonly type: AccessibleViewType = AccessibleViewType.Help;
	getProvider(accessor: ServicesAccessor) {
		return getAccessibilityHelpProvider(accessor.get(ICodeEditorService), getAccessibilityHistoryHelpText());
	}
}

function getAccessibilityHistoryHelpText(): string {
	return [
		localize('replEditor.historyOverview', 'You are in a REPL History which is a list of cells that have been executed in the REPL. Each cell has an input, an output, and the cell container.'),
		localize('replEditor.focusCellEditor', 'The Edit Cell command{0} will move focus to the read-only editor for the input of the cell.', '<keybinding:notebook.cell.edit>'),
		localize('replEditor.cellNavigation', 'The Quit Edit command{0} will move focus to the cell container, where the up and down arrows will also move focus between cells in the history.', '<keybinding:notebook.cell.quitEdit>'),
		localize('replEditor.accessibilityView', 'Run the Open Accessbility View command{0} while navigating the history for an accessible view of the item\'s output.', '<keybinding:editor.action.accessibleView>'),
		localize('replEditor.focusInOutput', 'The Focus Output command{0} will set focus on the output when focused on a previously executed item.', '<keybinding:notebook.cell.focusInOutput>'),
		localize('replEditor.focusReplInputFromHistory', 'The Focus Input Editor command{0} will move focus to the REPL input box.', '<keybinding:repl.input.focus>'),
		localize('replEditor.focusLastItemAdded', 'The Focus Last executed command{0} will move focus to the last executed item in the REPL history.', '<keybinding:repl.focusLastItemExecuted>'),
	].join('\n');
}

function getAccessibilityHelpProvider(editorService: ICodeEditorService, helpText: string) {
	const activeEditor = editorService.getActiveCodeEditor()
		|| editorService.getFocusedCodeEditor();

	if (!activeEditor) {
		return;
	}

	return new AccessibleContentProvider(
		AccessibleViewProviderId.ReplEditor,
		{ type: AccessibleViewType.Help },
		() => helpText,
		() => activeEditor.focus(),
		AccessibilityVerbositySettingId.ReplEditor,
	);
}
