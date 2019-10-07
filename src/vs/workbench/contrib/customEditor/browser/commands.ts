/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// import { Schemas } from 'vs/base/common/network';
import { firstOrDefault } from 'vs/base/common/arrays';
import { URI } from 'vs/base/common/uri';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import * as nls from 'vs/nls';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IListService } from 'vs/platform/list/browser/listService';
import { IEditorCommandsContext } from 'vs/workbench/common/editor';
// import { ResourceContextKey } from 'vs/workbench/common/resources';
import { ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { getMultiSelectedResources } from 'vs/workbench/contrib/files/browser/files';
import { IEditorGroup, IEditorGroupsService } from 'vs/workbench/services/editor/common/editorGroupsService';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

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
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService);
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
	}
});

// #endregion
