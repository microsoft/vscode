/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from 'vs/base/common/network';
import { URI } from 'vs/base/common/uri';
import { EditorContextKeys } from 'vs/editor/common/editorContextKeys';
import { MenuId, MenuRegistry } from 'vs/platform/actions/common/actions';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IListService } from 'vs/platform/list/browser/listService';
import { ResourceContextKey } from 'vs/workbench/common/resources';
import { getMultiSelectedResources } from 'vs/workbench/contrib/files/browser/files';
import { ICustomEditorService } from 'vs/workbench/contrib/customEditor/common/customEditor';
import { IEditorService } from 'vs/workbench/services/editor/common/editorService';

const OPEN_WITH_COMMAND_ID = 'openWith';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: OPEN_WITH_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	handler: async (accessor: ServicesAccessor, resource: URI | object) => {
		const editorService = accessor.get(IEditorService);
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), editorService);
		const targetResource = resources[0];
		if (!targetResource) {
			return;
		}
		const customEditorService = accessor.get(ICustomEditorService);
		return customEditorService.promptOpenWith(targetResource, undefined, undefined);
	}
});

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: 'navigation',
	order: 20,
	command: {
		id: OPEN_WITH_COMMAND_ID,
		title: 'Open With'
	},
	when: ResourceContextKey.Scheme.isEqualTo(Schemas.file)
});
