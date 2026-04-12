/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as nls from '../../../../nls.js';
import { IWorkspaceContextService } from '../../../../platform/workspace/common/workspace.js';
import { isWindows, isMacintosh } from '../../../../base/common/platform.js';
import { Schemas } from '../../../../base/common/network.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { KeybindingsRegistry } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { EditorContextKeys } from '../../../../editor/common/editorContextKeys.js';
import { KeyChord } from '../../../../base/common/keyCodes.js';
import { getMultiSelectedResources, IExplorerService } from '../browser/files.js';
import { IEditorService } from '../../../services/editor/common/editorService.js';
import { revealResourcesInOS } from './fileCommands.js';
import { MenuRegistry, MenuId } from '../../../../platform/actions/common/actions.js';
import { ResourceContextKey } from '../../../common/contextkeys.js';
import { appendToCommandPalette, appendEditorTitleContextMenuItem } from '../browser/fileActions.contribution.js';
import { SideBySideEditor, EditorResourceAccessor } from '../../../common/editor.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { IListService } from '../../../../platform/list/browser/listService.js';
import { IEditorGroupsService } from '../../../services/editor/common/editorGroupsService.js';
const REVEAL_IN_OS_COMMAND_ID = 'revealFileInOS';
const REVEAL_IN_OS_LABEL = isWindows ? nls.localize2('revealInWindows', "Reveal in File Explorer") : isMacintosh ? nls.localize2('revealInMac', "Reveal in Finder") : nls.localize2('openContainer', "Open Containing Folder");
const REVEAL_IN_OS_WHEN_CONTEXT = ContextKeyExpr.or(ResourceContextKey.Scheme.isEqualTo(Schemas.file), ResourceContextKey.Scheme.isEqualTo(Schemas.vscodeUserData));
KeybindingsRegistry.registerCommandAndKeybindingRule({
    id: REVEAL_IN_OS_COMMAND_ID,
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: EditorContextKeys.focus.toNegated(),
    primary: 2048 /* KeyMod.CtrlCmd */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */,
    win: {
        primary: 1024 /* KeyMod.Shift */ | 512 /* KeyMod.Alt */ | 48 /* KeyCode.KeyR */
    },
    handler: (accessor, resource) => {
        const resources = getMultiSelectedResources(resource, accessor.get(IListService), accessor.get(IEditorService), accessor.get(IEditorGroupsService), accessor.get(IExplorerService));
        revealResourcesInOS(resources, accessor.get(INativeHostService), accessor.get(IWorkspaceContextService));
    }
});
const REVEAL_ACTIVE_FILE_IN_OS_COMMAND_ID = 'workbench.action.files.revealActiveFileInWindows';
KeybindingsRegistry.registerCommandAndKeybindingRule({
    weight: 200 /* KeybindingWeight.WorkbenchContrib */,
    when: undefined,
    primary: KeyChord(2048 /* KeyMod.CtrlCmd */ | 41 /* KeyCode.KeyK */, 48 /* KeyCode.KeyR */),
    id: REVEAL_ACTIVE_FILE_IN_OS_COMMAND_ID,
    handler: (accessor) => {
        const editorService = accessor.get(IEditorService);
        const activeInput = editorService.activeEditor;
        const resource = EditorResourceAccessor.getOriginalUri(activeInput, { filterByScheme: [Schemas.file], supportSideBySide: SideBySideEditor.PRIMARY });
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
// Menu registration - chat attachments context
MenuRegistry.appendMenuItem(MenuId.ChatAttachmentsContext, {
    group: 'navigation',
    order: 20,
    command: revealInOsCommand,
    when: REVEAL_IN_OS_WHEN_CONTEXT
});
// Menu registration - chat inline anchor
MenuRegistry.appendMenuItem(MenuId.ChatInlineResourceAnchorContext, {
    group: 'navigation',
    order: 20,
    command: revealInOsCommand,
    when: REVEAL_IN_OS_WHEN_CONTEXT
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmlsZUFjdGlvbnMuY29udHJpYnV0aW9uLmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvZmlsZXMvZWxlY3Ryb24tYnJvd3Nlci9maWxlQWN0aW9ucy5jb250cmlidXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxLQUFLLEdBQUcsTUFBTSxvQkFBb0IsQ0FBQztBQUUxQyxPQUFPLEVBQUUsd0JBQXdCLEVBQUUsTUFBTSxvREFBb0QsQ0FBQztBQUM5RixPQUFPLEVBQUUsU0FBUyxFQUFFLFdBQVcsRUFBRSxNQUFNLHFDQUFxQyxDQUFDO0FBQzdFLE9BQU8sRUFBRSxPQUFPLEVBQUUsTUFBTSxvQ0FBb0MsQ0FBQztBQUM3RCxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSw4Q0FBOEMsQ0FBQztBQUNsRixPQUFPLEVBQUUsbUJBQW1CLEVBQW9CLE1BQU0sK0RBQStELENBQUM7QUFDdEgsT0FBTyxFQUFFLGlCQUFpQixFQUFFLE1BQU0sZ0RBQWdELENBQUM7QUFDbkYsT0FBTyxFQUFtQixRQUFRLEVBQUUsTUFBTSxxQ0FBcUMsQ0FBQztBQUVoRixPQUFPLEVBQUUseUJBQXlCLEVBQUUsZ0JBQWdCLEVBQUUsTUFBTSxxQkFBcUIsQ0FBQztBQUNsRixPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sa0RBQWtELENBQUM7QUFDbEYsT0FBTyxFQUFFLG1CQUFtQixFQUFFLE1BQU0sbUJBQW1CLENBQUM7QUFDeEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLEVBQUUsTUFBTSxnREFBZ0QsQ0FBQztBQUN0RixPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSxnQ0FBZ0MsQ0FBQztBQUNwRSxPQUFPLEVBQUUsc0JBQXNCLEVBQUUsZ0NBQWdDLEVBQUUsTUFBTSx3Q0FBd0MsQ0FBQztBQUNsSCxPQUFPLEVB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