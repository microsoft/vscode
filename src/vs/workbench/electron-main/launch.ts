/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { log, ICommandLineArguments, IProcessEnvironment } from 'vs/workbench/electron-main/env';
import { manager as WindowManager, onClose as onWindowClose } from 'vs/workbench/electron-main/windows';
import { VSCodeWindow } from 'vs/workbench/electron-main/window';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';

export interface ILaunchService {
	start(args: ICommandLineArguments, userEnv: IProcessEnvironment): TPromise<void>;
}

export interface ILaunchChannel extends IChannel {
	call(command: 'start', args: ICommandLineArguments, userEnv: IProcessEnvironment): TPromise<void>;
	call(command: string, ...args: any[]): TPromise<any>;
}

export class LaunchChannel implements ILaunchChannel {

	constructor(private service: ILaunchService) { }

	call(command: string, ...args: any[]): TPromise<any> {
		switch (command) {
			case 'start': return this.service.start(args[0], args[1]);
		}
	}
}

export class LaunchChannelClient implements ILaunchService {

	constructor(private channel: ILaunchChannel) { }

	start(args: ICommandLineArguments, userEnv: IProcessEnvironment): TPromise<void> {
		return this.channel.call('start', args, userEnv);
	}
}

export class LaunchService implements ILaunchService {
	start(args: ICommandLineArguments, userEnv: IProcessEnvironment): TPromise<void> {
		log('Received data from other instance', args);

		// Otherwise handle in windows manager
		let usedWindows: VSCodeWindow[];
		if (!!args.extensionDevelopmentPath) {
			WindowManager.openPluginDevelopmentHostWindow({ cli: args, userEnv: userEnv });
		} else if (args.pathArguments.length === 0 && args.openNewWindow) {
			usedWindows = WindowManager.open({ cli: args, userEnv: userEnv, forceNewWindow: true, forceEmpty: true });
		} else if (args.pathArguments.length === 0) {
			usedWindows = [WindowManager.focusLastActive(args)];
		} else {
			usedWindows = WindowManager.open({
				cli: args,
				userEnv: userEnv,
				forceNewWindow: args.waitForWindowClose || args.openNewWindow,
				preferNewWindow: !args.openInSameWindow,
				diffMode: args.diffMode
			});
		}

		// If the other instance is waiting to be killed, we hook up a window listener if one window
		// is being used and only then resolve the startup promise which will kill this second instance
		if (args.waitForWindowClose && usedWindows && usedWindows.length === 1 && usedWindows[0]) {
			const windowId = usedWindows[0].id;

			return new TPromise<void>((c, e) => {

				const unbind = onWindowClose(id => {
					if (id === windowId) {
						unbind();
						c(null);
					}
				});
			});
		}

		return TPromise.as(null);
	}
}