/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Action2, registerAction2 } from '../../../../../platform/actions/common/actions.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { Categories } from '../../../../../platform/action/common/actionCommonCategories.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../platform/storage/common/storage.js';
import { IMobileSidebarEditorInputService } from '../editors/mobileSidebarInput.js';

const MOBILE_SIDEBAR_MODE_STORAGE_KEY = 'workbench.mobileSidebar.enabled';

export class ToggleMobileSidebarModeAction extends Action2 {
	static readonly ID = 'workbench.action.toggleMobileSidebarMode';

	constructor() {
		super({
			id: ToggleMobileSidebarModeAction.ID,
			title: { value: localize('toggleMobileSidebarMode', "Toggle Mobile Sidebar Mode"), original: 'Toggle Mobile Sidebar Mode' },
			category: Categories.View,
			f1: true,
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyM
			}
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		const storageService = accessor.get(IStorageService);

		const currentEnabled = storageService.getBoolean(MOBILE_SIDEBAR_MODE_STORAGE_KEY, StorageScope.WORKSPACE, false);
		const newEnabled = !currentEnabled;

		// Just store the new state - the controller will handle the actual layout changes
		storageService.store(MOBILE_SIDEBAR_MODE_STORAGE_KEY, newEnabled, StorageScope.WORKSPACE, StorageTarget.USER);

		// The MobileSidebarController will observe this change and update the layout accordingly
	}
}

export class OpenMobileSidebarAction extends Action2 {
	static readonly ID = 'workbench.action.openMobileSidebar';

	constructor() {
		super({
			id: OpenMobileSidebarAction.ID,
			title: { value: localize('openMobileSidebar', "Open Mobile Sidebar"), original: 'Open Mobile Sidebar' },
			category: Categories.View,
			f1: true
		});
	}

	async run(accessor: ServicesAccessor): Promise<void> {
		console.log('[OpenMobileSidebarAction] Starting');
		const mobileSidebarService = accessor.get(IMobileSidebarEditorInputService);
		const editorGroupService = accessor.get(IEditorGroupsService);

		// Get the singleton mobile sidebar input
		const mobileSidebarInput = mobileSidebarService.getInstance();
		console.log('[OpenMobileSidebarAction] Got input instance:', mobileSidebarInput);

		// Check if it's already open in any group to prevent duplicates
		for (const group of editorGroupService.groups) {
			const editor = group.editors.find(e => e === mobileSidebarInput);
			if (editor) {
				console.log('[OpenMobileSidebarAction] Editor already exists, focusing');
				// Just focus on the existing editor, don't open a new one
				await group.openEditor(editor, { activation: 1 });
				return;
			}
		}

		// If not found anywhere, open it in the active group
		console.log('[OpenMobileSidebarAction] Opening new editor');
		const activeGroup = editorGroupService.activeGroup;
		try {
			const result = await activeGroup.openEditor(mobileSidebarInput, {
				pinned: true,
				activation: 1
			});
			console.log('[OpenMobileSidebarAction] Editor opened, result:', result);
		} catch (error) {
			console.error('[OpenMobileSidebarAction] Failed to open editor:', error);
		}
	}
}

// Register actions
registerAction2(ToggleMobileSidebarModeAction);
registerAction2(OpenMobileSidebarAction);
