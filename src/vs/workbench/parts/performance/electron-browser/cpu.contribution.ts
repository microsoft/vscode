/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { localize } from 'vs/nls';
import { CommandsRegistry } from 'vs/platform/commands/common/commands';
import { MenuRegistry, MenuId } from 'vs/platform/actions/common/actions';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { findFreePort } from 'vs/base/node/ports';

CommandsRegistry.registerCommand('workbench.reload.debug', async accessor => {
	const windowService = accessor.get(IWindowsService);

	let argv = [];
	const portMain = await findFreePort(9222, 10, 6000);
	const portRenderer = await findFreePort(portMain + 1, 10, 6000);
	const portExthost = await findFreePort(portRenderer + 1, 10, 6000);
	const portSearch = await findFreePort(portExthost + 1, 10, 6000);

	if (!portMain || !portRenderer || !portExthost || !portSearch) {
		console.error('Failed to find free ports for profiler to connect to do.');
		return;
	}

	argv.push('--inspect-all');
	argv.push(`--inspect=${portMain}`);
	argv.push(`--remote-debugging-port=${portRenderer}`);
	argv.push(`--inspect-extensions=${portExthost}`);
	argv.push(`--inspect-search=${portSearch}`);


	windowService.relaunch({
		addArgs: argv
	});
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'workbench.reload.debug', title: localize('workbench.reload.debug', "Reload Workspace in Debug Mode") } });

MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'workbench.profile.debug', title: localize('workbench.profile.debug', "Profile Processes") } });
