/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as nls from 'vs/nls';
import * as menubarCommands from 'vs/workbench/browser/parts/menubar/menubarCommands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';

menubarCommands.setup();

MenuRegistry.appendMenuItem(
	MenuId.MenubarFileMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('openFile', "Open File...")
		},
		group: '2_open',
		order: 1
	});

MenuRegistry.appendMenuItem(
	MenuId.MenubarFileMenu,
	{
		command: {
			id: 'workbench.action.files.openFileInNewWindow',
			title: nls.localize('openFileInNewWindow', "Open File in New Window...")
		},
		group: '2_open',
		order: 2
	}
);

MenuRegistry.appendMenuItem(
	MenuId.MenubarFileMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('openFolder', "Open Folder...")
		},
		group: '2_open',
		order: 2
	});


MenuRegistry.appendMenuItem(
	MenuId.MenubarFileMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('openSomething', "Open Something...")
		},
		group: '2_open',
		order: 3
	});


MenuRegistry.appendMenuItem(
	MenuId.MenubarEditMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('cut', "Cut")
		},
		group: '1_basic',
		order: 1
	});

MenuRegistry.appendMenuItem(
	MenuId.MenubarEditMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('copy', "Copy")
		},
		group: '1_basic',
		order: 2
	});

MenuRegistry.appendMenuItem(
	MenuId.MenubarEditMenu,
	{
		command: {
			id: menubarCommands.FILE_MENU_FAKE_OPEN_FILE_COMMAND_ID,
			title: nls.localize('paste', "Paste")
		},
		group: '1_basic',
		order: 3
	});