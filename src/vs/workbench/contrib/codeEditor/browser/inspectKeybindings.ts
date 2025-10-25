/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize2 } from '../../../../nls.js';
import { ICodeEditor } from '../../../../editor/browser/editorBrowser.js';
import { ServicesAccessor } from '../../../../editor/browser/editorExtensions.js';
import { IKeybindingService } from '../../../../platform/keybinding/common/keybinding.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';

class InspectKeyMap extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.inspectKeyMappings',
			title: localize2('workbench.action.inspectKeyMap', 'Inspect Key Mappings'),
			category: Categories.Developer,
			f1: true
		});
	}

	run(accessor: ServicesAccessor, editor: ICodeEditor): void {
		const keybindingService = accessor.get(IKeybindingService);
		const editorService = accessor.get(IEditorService);

		editorService.openEditor({ resource: undefined, contents: keybindingService._dumpDebugInfo(), options: { pinned: true } });
	}
}

registerAction2(InspectKeyMap);

class InspectKeyMapJSON extends Action2 {

	constructor() {
		super({
			id: 'workbench.action.inspectKeyMappingsJSON',
			title: localize2('workbench.action.inspectKeyMapJSON', 'Inspect Key Mappings (JSON)'),
			category: Categories.Developer,
			f1: true
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const editorService = accessor.get(IEditorService);
		const keybindingService = accessor.get(IKeybindingService);

		await editorService.openEditor({ resource: undefined, contents: keybindingService._dumpDebugInfoJSON(), options: { pinned: true } });
	}
}

registerAction2(InspectKeyMapJSON);
