/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { firstOrDefault } from 'vs/base/common/arrays';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { URI } from 'vs/base/common/uri';
import { Command } from 'vs/editor/browser/editorExtensions';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InputFocusedContextKey } from 'vs/platform/contextkey/common/contextkeys';
import { ServicesAccessor, IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IListService } from 'vs/platform/list/browser/listService';
import { IEditorCommandsContext, IEditorInput } from 'vs/workbench/common/editor';
import { CONTEXT_FOCUSED_CUSTOM_EDITOR_IS_EDITABLE, CONTEXT_HAS_CUSTOM_EDITORS, ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { getMultiSelectedResources } from 'vs/workbench/contrib/files/browser/files';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IExplorerService } from 'vs/workbench/contrib/files/common/files';
import { defaultEditorId } from 'vs/workbench/contrib/customEditor/browser/customEditors';
import { FileEditorInput } from 'vs/workbench/contrib/files/common/editors/fileEditorInput';

const viewCategory = nls.localize('viewCategory', "View");

// #region Open With

const OPEN_WITH_COMMAND_ID = 'openWith';
// const OPEN_WITH_TITLE = { value: nls.localize('openWith.title', 'Open With'), original: 'Open With' };

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: OPEN_WITH_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	handler: async (accessor: ServicesAccessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService, accessor.get(IExplorerService));
		const targetResource = firstOrDefault(resources);
		if (!targetResource) {
			return;
		}
		return accessor.get(ICustomEditorService).promptOpenWith(targetResource, undefined, undefined);
	}
});

// MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
// 	group: 'navigation',
// 	order: 20,
// 	command: {
// 		id: OPEN_WITH_COMMAND_ID,
// 		title: OPEN_WITH_TITLE,
// 	},
// 	when: ResourceContextKey.Scheme.isEqualTo(Schemas.file)
// });

// #endregion

// #region Reopen With

const REOPEN_WITH_COMMAND_ID = 'reOpenWith';
const REOPEN_WITH_TITLE = { value: nls.localize('reopenWith.title', 'Reopen With'), original: 'Reopen With' };

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
				resource = editorService.activeEditor.getResource();
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
	when: CONTEXT_HAS_CUSTOM_EDITORS,
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
		const customEditorService = accessor.get<ICustomEditorService>(ICustomEditorService);

		const activeCustomEditor = customEditorService.activeCustomEditor;
		if (!activeCustomEditor) {
			return;
		}

		const model = customEditorService.models.get(activeCustomEditor.resource, activeCustomEditor.viewType);
		if (!model) {
			return;
		}

		model.undo();
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
		const customEditorService = accessor.get<ICustomEditorService>(ICustomEditorService);

		const activeCustomEditor = customEditorService.activeCustomEditor;
		if (!activeCustomEditor) {
			return;
		}

		const model = customEditorService.models.get(activeCustomEditor.resource, activeCustomEditor.viewType);
		if (!model) {
			return;
		}

		model.redo();
	}
}).register();

(new class ToggleCustomEditorCommand extends Command {
	public static readonly ID = 'editor.action.customEditor.toggle';

	constructor() {
		super({
			id: ToggleCustomEditorCommand.ID,
			precondition: CONTEXT_HAS_CUSTOM_EDITORS,
		});
	}

	public runCommand(accessor: ServicesAccessor): void {
		const editorService = accessor.get<IEditorService>(IEditorService);
		const activeControl = editorService.activeControl;
		if (!activeControl) {
			return;
		}

		const activeGroup = activeControl.group;
		const activeEditor = activeControl.input;

		if (!activeEditor) {
			return;
		}

		const targetResource = activeEditor.getResource();
		if (!targetResource) {
			return;
		}

		const customEditorService = accessor.get<ICustomEditorService>(ICustomEditorService);
		const activeCustomEditor = customEditorService.activeCustomEditor;

		let toggleView = defaultEditorId;
		if (!activeCustomEditor) {
			const viewIDs = customEditorService.getContributedCustomEditors(targetResource);
			if (viewIDs && viewIDs.length) {
				toggleView = viewIDs[0].id;
			}
			else {
				return;
			}
		}

		let replInput: IEditorInput;
		if (toggleView === defaultEditorId) {
			const instantiationService = accessor.get<IInstantiationService>(IInstantiationService);
			replInput = instantiationService.createInstance(FileEditorInput, targetResource, undefined, undefined);
		}
		else {
			replInput = customEditorService.createInput(targetResource, toggleView, activeGroup);
		}

		editorService.replaceEditors([{
			editor: activeEditor,
			replacement: replInput,
		}], activeGroup);
	}
}).register();
