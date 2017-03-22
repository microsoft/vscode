/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as nls from 'vs/nls';
import { ICommonCodeEditor } from 'vs/editor/common/editorCommon';
import { editorAction, ServicesAccessor, EditorAction } from 'vs/editor/common/editorCommonExtensions';
import { IKeybindingService } from 'vs/platform/keybinding/common/keybinding';
import { WorkbenchKeybindingService } from 'vs/workbench/services/keybinding/electron-browser/keybindingService';
import { IWorkbenchEditorService } from 'vs/workbench/services/editor/common/editorService';
import { IUntitledEditorService } from 'vs/workbench/services/untitled/common/untitledEditorService';

@editorAction
class InspectKeyMap extends EditorAction {

	constructor() {
		super({
			id: 'workbench.action.inspectKeyMappings',
			label: nls.localize('workbench.action.inspectKeyMap', "Developer: Inspect Key Mapppings"),
			alias: 'Developer: Inspect Key Mapppings',
			precondition: null
		});
	}

	public run(accessor: ServicesAccessor, editor: ICommonCodeEditor): void {
		const keybindingService = accessor.get(IKeybindingService);
		const editorService = accessor.get(IWorkbenchEditorService);
		const untitledEditorService = accessor.get(IUntitledEditorService);

		if (keybindingService instanceof WorkbenchKeybindingService) {
			const input = untitledEditorService.createOrGet(undefined, null, keybindingService.dumpDebugInfo());
			editorService.openEditor(input, { pinned: true });
		}
	}
}
