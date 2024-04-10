/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyMod, KeyCode } from 'vs/base/common/keyCodes';
import { localize2, localize } from 'vs/nls';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IConfigurationService } from 'vs/platform/configuration/common/configuration';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TextDiffEditor } from 'vs/workbench/browser/parts/editor/textDiffEditor';
import { TextCompareEditorVisibleContext, TextCompareEditorActiveContext, ActiveCompareEditorCanSwapContext } from 'vs/workbench/common/contextkeys';
import { DiffEditorInput } from 'vs/workbench/common/editor/diffEditorInput';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

export const TOGGLE_DIFF_SIDE_BY_SIDE = 'toggle.diff.renderSideBySide';
export const GOTO_NEXT_CHANGE = 'workbench.action.compareEditor.nextChange';
export const GOTO_PREVIOUS_CHANGE = 'workbench.action.compareEditor.previousChange';
export const DIFF_FOCUS_PRIMARY_SIDE = 'workbench.action.compareEditor.focusPrimarySide';
export const DIFF_FOCUS_SECONDARY_SIDE = 'workbench.action.compareEditor.focusSecondarySide';
export const DIFF_FOCUS_OTHER_SIDE = 'workbench.action.compareEditor.focusOtherSide';
export const DIFF_OPEN_SIDE = 'workbench.action.compareEditor.openSide';
export const TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE = 'toggle.diff.ignoreTrimWhitespace';
export const DIFF_SWAP_SIDES = 'workbench.action.compareEditor.swapSides';

export function registerDiffEditorCommands(): void {
	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: GOTO_NEXT_CHANGE,
		weight: KeybindingWeight.WorkbenchContrib,
		when: TextCompareEditorVisibleContext,
		primary: KeyMod.Alt | KeyCode.F5,
		handler: accessor => navigateInDiffEditor(accessor, true)
	});

	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id: GOTO_NEXT_CHANGE,
			title: localize2('compare.nextChange', 'Go to Next Change'),
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: GOTO_PREVIOUS_CHANGE,
		weight: KeybindingWeight.WorkbenchContrib,
		when: TextCompareEditorVisibleContext,
		primary: KeyMod.Alt | KeyMod.Shift | KeyCode.F5,
		handler: accessor => navigateInDiffEditor(accessor, false)
	});

	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id: GOTO_PREVIOUS_CHANGE,
			title: localize2('compare.previousChange', 'Go to Previous Change'),
		}
	});

	function getActiveTextDiffEditor(accessor: ServicesAccessor): TextDiffEditor | undefined {
		const editorService = accessor.get(IEditorService);

		for (const editor of [editorService.activeEditorPane, ...editorService.visibleEditorPanes]) {
			if (editor instanceof TextDiffEditor) {
				return editor;
			}
		}

		return undefined;
	}

	function navigateInDiffEditor(accessor: ServicesAccessor, next: boolean): void {
		const activeTextDiffEditor = getActiveTextDiffEditor(accessor);

		if (activeTextDiffEditor) {
			activeTextDiffEditor.getControl()?.goToDiff(next ? 'next' : 'previous');
		}
	}

	enum FocusTextDiffEditorMode {
		Original,
		Modified,
		Toggle
	}

	function focusInDiffEditor(accessor: ServicesAccessor, mode: FocusTextDiffEditorMode): void {
		const activeTextDiffEditor = getActiveTextDiffEditor(accessor);

		if (activeTextDiffEditor) {
			switch (mode) {
				case FocusTextDiffEditorMode.Original:
					activeTextDiffEditor.getControl()?.getOriginalEditor().focus();
					break;
				case FocusTextDiffEditorMode.Modified:
					activeTextDiffEditor.getControl()?.getModifiedEditor().focus();
					break;
				case FocusTextDiffEditorMode.Toggle:
					if (activeTextDiffEditor.getControl()?.getModifiedEditor().hasWidgetFocus()) {
						return focusInDiffEditor(accessor, FocusTextDiffEditorMode.Original);
					} else {
						return focusInDiffEditor(accessor, FocusTextDiffEditorMode.Modified);
					}
			}
		}
	}

	function toggleDiffSideBySide(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);

		const newValue = !configurationService.getValue('diffEditor.renderSideBySide');
		configurationService.updateValue('diffEditor.renderSideBySide', newValue);
	}

	function toggleDiffIgnoreTrimWhitespace(accessor: ServicesAccessor): void {
		const configurationService = accessor.get(IConfigurationService);

		const newValue = !configurationService.getValue('diffEditor.ignoreTrimWhitespace');
		configurationService.updateValue('diffEditor.ignoreTrimWhitespace', newValue);
	}

	async function swapDiffSides(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);

		const diffEditor = getActiveTextDiffEditor(accessor);
		const activeGroup = diffEditor?.group;
		const diffInput = diffEditor?.input;
		if (!diffEditor || typeof activeGroup === 'undefined' || !(diffInput instanceof DiffEditorInput) || !diffInput.modified.resource) {
			return;
		}

		const untypedDiffInput = diffInput.toUntyped({ preserveViewState: activeGroup.id, preserveResource: true });
		if (!untypedDiffInput) {
			return;
		}

		// Since we are about to replace the diff editor, make
		// sure to first open the modified side if it is not
		// yet opened. This ensures that the swapping is not
		// bringing up a confirmation dialog to save.
		if (diffInput.modified.isModified() && editorService.findEditors({ resource: diffInput.modified.resource, typeId: diffInput.modified.typeId, editorId: diffInput.modified.editorId }).length === 0) {
			await editorService.openEditor({
				...untypedDiffInput.modified,
				options: {
					...untypedDiffInput.modified.options,
					pinned: true,
					inactive: true
				}
			}, activeGroup);
		}

		// Replace the input with the swapped variant
		await editorService.replaceEditors([
			{
				editor: diffInput,
				replacement: {
					...untypedDiffInput,
					original: untypedDiffInput.modified,
					modified: untypedDiffInput.original,
					options: {
						...untypedDiffInput.options,
						pinned: true
					}
				}
			}
		], activeGroup);
	}

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: TOGGLE_DIFF_SIDE_BY_SIDE,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: accessor => toggleDiffSideBySide(accessor)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: DIFF_FOCUS_PRIMARY_SIDE,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: accessor => focusInDiffEditor(accessor, FocusTextDiffEditorMode.Modified)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: DIFF_FOCUS_SECONDARY_SIDE,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: accessor => focusInDiffEditor(accessor, FocusTextDiffEditorMode.Original)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: DIFF_FOCUS_OTHER_SIDE,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: accessor => focusInDiffEditor(accessor, FocusTextDiffEditorMode.Toggle)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: TOGGLE_DIFF_IGNORE_TRIM_WHITESPACE,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: accessor => toggleDiffIgnoreTrimWhitespace(accessor)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: DIFF_SWAP_SIDES,
		weight: KeybindingWeight.WorkbenchContrib,
		when: undefined,
		primary: undefined,
		handler: accessor => swapDiffSides(accessor)
	});

	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id: TOGGLE_DIFF_SIDE_BY_SIDE,
			title: localize2('toggleInlineView', "Toggle Inline View"),
			category: localize('compare', "Compare")
		},
		when: TextCompareEditorActiveContext
	});

	MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
		command: {
			id: DIFF_SWAP_SIDES,
			title: localize2('swapDiffSides', "Swap Left and Right Editor Side"),
			category: localize('compare', "Compare")
		},
		when: ContextKeyExpr.and(TextCompareEditorActiveContext, ActiveCompareEditorCanSwapContext)
	});
}
