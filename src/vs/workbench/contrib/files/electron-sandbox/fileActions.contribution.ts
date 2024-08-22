/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from '../../../../nls';
import { URI } from '../../../../base/common/uri';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace';
import { isWindows, isMacintosh } from '../../../../base/common/platform';
import { Schemas } from '../../../../base/common/network';
import { INativeHostService } from '../../../../platform/native/common/native';
import { KeybindingsRegistry, KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys';
import { KeyMod, KeyCode, KeyChord } from '../../../../base/common/keyCodes';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation';
import { getMultiSelectedResources, IExplorerService } from '../browser/files';
import { IEditorService } from '../../../services/editor/common/editorService';
import { revealResourcesInOS } from './fileCommands';
import { MenuRegistry, MenuId } from '../../../../platform/actions/common/actions';
import { ResourceContextKey } from '../../../common/contextkeys';
import { appendToCommandPalette, appendEditorTitleContextMenuItem } from '../browser/fileActions.contribution';
import { SideBySideEditor, EditorResourceAccessor } from '../../../common/editor';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey';
import { IListService } from '../../../../platform/list/browser/listService';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService';

const REVEAL_IN_OS_COMMAND_ID = 'revealFileInOS';
const REVEAL_IN_OS_LABEL = isWindows ? nls.localize2('revealInWindows', "Reveal in File Explorer") : isMacintosh ? nls.localize2('revealInMac', "Reveal in Finder") : nls.localize2('openContainer', "Open Containing Folder");
const REVEAL_IN_OS_WHEN_CONTEXT = ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData));

KeybindingsRegistry.registerCommandAndKeybindingRule({
	id: REVEAL_IN_OS_COMMAND_ID,
	weight: KeybindingWeight.WorkbenchContrib,
	when: EditorContextKeys.focus.toNegated(),
	primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyR,
	win: {
		primary: KeyMod.Shift | KeyMod.Alt | KeyCode.KeyR
	},
	handler: (accessor: ServicesAccessor, resource: URI | object) => {
		const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
		revealResourcesInOS(resources, accessor.get(INativeHostService), accessor.get(IWorkspaceContextService));
	}
});

const REVEAL_ACTIVE_FILE_IN_OS_COMMAND_ID = 'workbench.action.files.revealActiveFileInWindows';

KeybindingsRegistry.registerCommandAndKeybindingRule({
	weight: KeybindingWeight.WorkbenchContrib,
	when: undefined,
	primary: KeyChord(KeyMod.CtrlCmd | KeyCode.KeyK, KeyCode.KeyR),
	id: REVEAL_ACTIVE_FILE_IN_OS_COMMAND_ID,
	handler: (accessor: ServicesAccessor) => {
		const editorService = accessor.get(IEditorService);
		const activeInput = editorService.activeEditor;
		const resource = EditorResourceAccessor.getOriginalUri(activeInput, { filterByScheme: Schemas.file, supportSideBySide: SideBySideEditor.PRIMARY });
		const resources = resource ? [resource] : [];
		revealResourcesInOS(resources, accessor.get(INativeHostService), accessor.get(IWorkspaceContextService));
	}
});

appendEditorTitleContextMenuItem(REVEAL_IN_OS_COMMAND_ID, REVEAL_IN_OS_LABEL.value, REVEAL_IN_OS_WHEN_CONTEXT, '2_files', false, 0);

// Menu registration - open editors

const revealInOsCommand = {
	id: REVEAL_IN_OS_COMMAND_ID,
	title: REVEAL_IN_OS_LABEL.value
};
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContext, {
	group: 'navigation',
	order: 20,
	command: revealInOsCommand,
	when: REVEAL_IN_OS_WHEN_CONTEXT
});
MenuRegistry.appendMenuItem(MenuId.OpenEditorsContextShare, {
	title: nls.localize('miShare', "Share"),
	submenu: MenuId.MenubarShare,
	group: 'share',
	order: 3,
});

// Menu registration - explorer

MenuRegistry.appendMenuItem(MenuId.ExplorerContext, {
	group: 'navigation',
	order: 20,
	command: revealInOsCommand,
	when: REVEAL_IN_OS_WHEN_CONTEXT
});

// Command Palette

const category = nls.localize2('filesCategory', "File");
appendToCommandPalette({
	id: REVEAL_IN_OS_COMMAND_ID,
	title: REVEAL_IN_OS_LABEL,
	category: category
}, REVEAL_IN_OS_WHEN_CONTEXT);
