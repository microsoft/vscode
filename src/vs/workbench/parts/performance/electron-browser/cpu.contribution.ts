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
import { IEnvironmentService } from 'vs/platform/environment/common/environment';
import { sendData, readJSON } from 'vs/base/node/simpleIpc';
import { onUnexpectedError } from 'vs/base/common/errors';
import { IQuickOpenService, IPickOpenEntry } from 'vs/platform/quickOpen/common/quickOpen';
import { TPromise } from 'vs/base/common/winjs.base';
import * as paths from 'path';
import * as os from 'os';
import { IMessageService } from 'vs/platform/message/common/message';
import Severity from 'vs/base/common/severity';

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

CommandsRegistry.registerCommand('workbench.profile.debug', async accessor => {
	const environmentService = accessor.get(IEnvironmentService);
	const quickOpenService = accessor.get(IQuickOpenService);
	const messageService = accessor.get(IMessageService);
	const socketPath = environmentService.args['inspect-all-ipc'];
	if (socketPath) {
		sendData(socketPath, JSON.stringify({
			type: 'getProcesses',
		})).then(res => readJSON<any>(res))
			.then(data => {
				interface IDebugProcess extends IPickOpenEntry {
					debugPort: number;
				}
				let entries: IDebugProcess[] = [];
				for (var i = 0; i < data.length; i++) {
					var obj = data[i];
					entries.push({
						label: obj.name,
						debugPort: Number(obj.debugPort)
					});
				}
				const filenamePrefix = paths.join(os.homedir(), Math.random().toString(16).slice(-4));

				quickOpenService.pick(entries).then((selected: IDebugProcess) => {
					return TPromise.wrap(import('v8-inspect-profiler')).then(profiler => {
						return profiler.startProfiling({ port: selected.debugPort }).then(session => {
							return session.stop(5000);
						}).then(profile => {
							return profiler.writeProfile(profile, `${filenamePrefix}.cpuprofile`);
						}).then(() => {
							messageService.show(Severity.Info, `CPU Profile saved to ${filenamePrefix}.cpuprofile`);
						});
					});

				});
			}, onUnexpectedError);
	}
});

MenuRegistry.appendMenuItem(MenuId.CommandPalette, { command: { id: 'workbench.profile.debug', title: localize('workbench.profile.debug', "Profile Processes") } });
