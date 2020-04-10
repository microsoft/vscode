/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { URI } from 'vs/base/common/uri';
import { Command } from 'vs/editor/browser/editorExtensions';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import type { ITextEditorOptions } from 'vs/platform/editor/common/editor';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { EditorViewColumn, viewColumnToEditorGroup } from 'vs/workbench/api/common/shared/editor';
import { IEditorCommandsContext } from 'vs/workbench/common/editor';
import { defaultCustomEditor } from 'vs/workbench/contrib/customEditor/common/contributedCustomEditors';
import { CustomEditorInput } from 'vs/workbench/contrib/customEditor/browser/customEditorInput';
import { CONTEXT_CUSTOM_EDITORS, CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const viewCategory = nls.localize('viewCategory', "View");

// #region Open With

CommandsRegistry.registerCommand('_workbench.openWith', (accessor: ServicesAccessor, args: [URI, string, ITextEditorOptions | undefined, EditorViewColumn | undefined]) => {
	const customEditorService = accessor.get(ICustomEditorService);
	const editorGroupService = accessor.get(IEditorGroupsService);

	const [resource, viewType, options, position] = args;
	const group = viewColumnToEditorGroup(editorGroupService, position);
	customEditorService.openWith(resource, viewType, options, editorGroupService.getGroup(group));
});

// #endregion

// #region Reopen With

const REOPEN_WITH_COMMAND_ID = 'reOpenWith';
const REOPEN_WITH_TITLE = { value: nls.localize('reopenWith.title', 'Reopen With...'), original: 'Reopen With...' };

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REOPEN_WITH_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	handler: async (accessor: ServicesAccessor, resource?: URI, editorContext?: IEditorCommandsContext) => {
		const customEditorService = accessor.get(ICustomEditorService);
		const editorService = accessor.get(IEditorService);
		const editorGroupService = accessor.get(IEditorGroupsService);

		let group: IEditorGroup | undefined;
		if (editorContext) {
			group = editorGroupService.getGroup(editorContext.groupId);
		} else if (!resource) {
			if (editorService.activeEditor) {
				resource = editorService.activeEditor.resource;
				group = editorGroupService.activeGroup;
			}
		}

		if (!resource) {
			return;
		}

		// Make sure the context menu has been dismissed before we prompt.
		// Otherwise with webviews, we will sometimes close the prompt instantly when the webview is
		// refocused by the workbench
		setTimeout(() => {
			customEditorService.promptOpenWith(resource!, undefined, group);
		}, 10);
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, {
	command: {
		id: REOPEN_WITH_COMMAND_ID,
		title: REOPEN_WITH_TITLE,
		category: viewCategory,
	},
	when: CONTEXT_CUSTOM_EDITORS.notEqualsTo(''),
});

MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	command: {
		id: REOPEN_WITH_COMMAND_ID,
		title: REOPEN_WITH_TITLE,
		category: viewCategory,
	},
	group: '6_reopen',
	order: 20,
	when: CONTEXT_CUSTOM_EDITORS.notEqualsTo(''),
});

// #endregion

(new class UndoCustomEditorCommand extends Command {
	public static readonly ID = 'editor.action.customEditor.undo';

	constructor() {
		super({
			id: UndoCustomEditorCommand.ID,
			precondition: ContextKeyExpr.and(
				CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE,
				ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Z,
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor): void {
		const editorService = accessor.get<IEditorService>(IEditorService);
		const activeInput = editorService.activeEditorPane?.input;
		if (activeInput instanceof CustomEditorInput) {
			activeInput.undo();
		}
	}
}).register();

(new class RedoWebviewEditorCommand extends Command {
	public static readonly ID = 'editor.action.customEditor.redo';

	constructor() {
		super({
			id: RedoWebviewEditorCommand.ID,
			precondition: ContextKeyExpr.and(
				CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE,
				ContextKeyExpr.not(InputFocusedContextKey)),
			kbOpts: {
				primary: KeyMod.CtrlCmd | KeyCode.KEY_Y,
				secondary: [KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z],
				mac: { primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KEY_Z },
				weight: KeybindingWeight.EditorContrib
			}
		});
	}

	public runCommand(accessor: ServicesAccessor): void {
		const editorService = accessor.get<IEditorService>(IEditorService);
		const activeInput = editorService.activeEditorPane?.input;
		if (activeInput instanceof CustomEditorInput) {
			activeInput.redo();
		}
	}
}).register();

(new class ToggleCustomEditorCommand extends Command {
	public static readonly ID = 'editor.action.customEditor.toggle';

	constructor() {
		super({
			id: ToggleCustomEditorCommand.ID,
			precondition: CONTEXT_CUSTOM_EDITORS,
		});
	}

	public runCommand(accessor: ServicesAccessor): void {
		const editorService = accessor.get<IEditorService>(IEditorService);
		const activeEditorPane = editorService.activeEditorPane;
		if (!activeEditorPane) {
			return;
		}

		const activeGroup = activeEditorPane.group;
		const activeEditor = activeEditorPane.input;
		const targetResource = activeEditor.resource;

		if (!targetResource) {
			return;
		}

		const customEditorService = accessor.get<ICustomEditorService>(ICustomEditorService);

		let toggleView = defaultCustomEditor.id;
		if (!(activeEditor instanceof CustomEditorInput)) {
			const bestAvailableEditor = customEditorService.getContributedCustomEditors(targetResource).bestAvailableEditor;
			if (bestAvailableEditor) {
				toggleView = bestAvailableEditor.id;
			} else {
				return;
			}
		}

		const newEditorInput = customEditorService.createInput(targetResource, toggleView, activeGroup.id);

		editorService.replaceEditors([{
			editor: activeEditor,
			replacement: newEditorInput,
			options: {
				ignoreOverrides: true,
			}
		}], activeGroup);
	}
}).register();
