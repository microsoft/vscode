/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { tmpdir } from 'os';
import { posix } from 'path';
import { KeyMod, KeyChord, KeyCode } from 'vs/base/common/keyCodes';
import { ServicesAccessor } from 'vs/platform/instantiation/common/instantiation';
import { KeybindingsRegistry, KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { IPartService } from 'vs/workbench/services/part/common/partService';
import { IWindowsService, IWindowService } from 'vs/platform/windows/common/windows';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { InEditorZenModeContext, NoEditorsVisibleContext, SingleEditorGroupsContext } from 'vs/workbench/common/editor';
import { IWorkspaceIdentifier, ISingleFolderWorkspaceIdentifier } from 'vs/platform/workspaces/common/workspaces';
import { URI } from 'vs/base/common/uri';
import { IDownloadService } from 'vs/platform/download/common/download';
import { generateUuid } from 'vs/base/common/uuid';

export const QUIT_ID = 'workbench.action.quit';

export function registerCommands(): void {

	// --- commands

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.closeWindow', // close the window when the last editor is closed by reusing the same keybinding
		weight: KeybindingWeight.WorkbenchContrib,
		when: ContextKeyExpr.and(NoEditorsVisibleContext, SingleEditorGroupsContext),
		primary: KeyMod.CtrlCmd | KeyCode.KEY_W,
		handler: accessor => {
			const windowService = accessor.get(IWindowService);
			windowService.closeWindow();
		}
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: 'workbench.action.exitZenMode',
		weight: KeybindingWeight.EditorContrib - 1000,
		handler(accessor: ServicesAccessor) {
			const partService = accessor.get(IPartService);
			partService.toggleZenMode();
		},
		when: InEditorZenModeContext,
		primary: KeyChord(KeyCode.Escape, KeyCode.Escape)
	});

	KeybindingsRegistry.registerCommandAndKeybindingRule({
		id: QUIT_ID,
		weight: KeybindingWeight.WorkbenchContrib,
		handler(accessor: ServicesAccessor) {
			const windowsService = accessor.get(IWindowsService);
			windowsService.quit();
		},
		when: undefined,
		primary: KeyMod.CtrlCmd | KeyCode.KEY_Q,
		win: { primary: undefined }
	});

	CommandsRegistry.registerCommand('_workbench.removeFromRecentlyOpened', function (accessor: ServicesAccessor, path: IWorkspaceIdentifier | ISingleFolderWorkspaceIdentifier | URI | string) {
		const windowsService = accessor.get(IWindowsService);

		return windowsService.removeFromRecentlyOpened([path]).then(() => undefined);
	});

	CommandsRegistry.registerCommand('_workbench.downloadResource', function (accessor: ServicesAccessor, resource: URI) {
		const downloadService = accessor.get(IDownloadService);
		const location = posix.join(tmpdir(), generateUuid());

		return downloadService.download(resource, location).then(() => URI.file(location));
	});
}
