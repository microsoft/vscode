/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import { IWindowsMainService, OpenContext } from 'vs/code/electron-main/windows';
import { VSCodeWindow } from 'vs/code/electron-main/window';
import { TPromise } from 'vs/base/common/winjs.base';
import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { ILogService } from 'vs/code/electron-main/log';
import { IURLService } from 'vs/platform/url/common/url';
import { IProcessEnvironment } from 'vs/base/common/platform';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { once } from 'vs/base/common/event';

export const ID = 'launchService';
export const ILaunchService = createDecorator<ILaunchService>(ID);

export interface IStartArguments {
	args: ParsedArgs;
	userEnv: IProcessEnvironment;
}

export interface ILaunchService {
	_serviceBrand: any;
	start(args: ParsedArgs, userEnv: IProcessEnvironment): TPromise<void>;
	getMainProcessId(): TPromise<number>;
}

export interface ILaunchChannel extends IChannel {
	call(command: 'start', arg: IStartArguments): TPromise<void>;
	call(command: 'get-main-process-id', arg: null): TPromise<any>;
	call(command: string, arg: any): TPromise<any>;
}

export class LaunchChannel implements ILaunchChannel {

	constructor(private service: ILaunchService) { }

	call(command: string, arg: any): TPromise<any> {
		switch (command) {
			case 'start':
				const { args, userEnv } = arg as IStartArguments;
				return this.service.start(args, userEnv);

			case 'get-main-process-id':
				return this.service.getMainProcessId();
		}
		return undefined;
	}
}

export class LaunchChannelClient implements ILaunchService {

	_serviceBrand: any;

	constructor(private channel: ILaunchChannel) { }

	start(args: ParsedArgs, userEnv: IProcessEnvironment): TPromise<void> {
		return this.channel.call('start', { args, userEnv });
	}

	getMainProcessId(): TPromise<number> {
		return this.channel.call('get-main-process-id', null);
	}
}

export class LaunchService implements ILaunchService {

	_serviceBrand: any;

	constructor(
		@ILogService private logService: ILogService,
		@IWindowsMainService private windowsService: IWindowsMainService,
		@IURLService private urlService: IURLService
	) { }

	start(args: ParsedArgs, userEnv: IProcessEnvironment): TPromise<void> {
		this.logService.log('Received data from other instance: ', args, userEnv);

		const openUrlArg = args['open-url'] || [];
		const openUrl = typeof openUrlArg === 'string' ? [openUrlArg] : openUrlArg;
		const context = !!userEnv['VSCODE_CLI'] ? OpenContext.CLI : OpenContext.OTHER;

		if (openUrl.length > 0) {
			openUrl.forEach(url => this.urlService.open(url));
			return TPromise.as(null);
		}

		// Otherwise handle in windows service
		let usedWindows: VSCodeWindow[];
		if (!!args.extensionDevelopmentPath) {
			this.windowsService.openExtensionDevelopmentHostWindow({ context, cli: args, userEnv });
		} else if (args._.length === 0 && args['new-window']) {
			usedWindows = this.windowsService.open({ context, cli: args, userEnv, forceNewWindow: true, forceEmpty: true });
		} else if (args._.length === 0) {
			usedWindows = [this.windowsService.focusLastActive(args, context)];
		} else {
			usedWindows = this.windowsService.open({
				context,
				cli: args,
				userEnv,
				forceNewWindow: args.wait || args['new-window'] || args['new-window-if-not-first'],
				preferNewWindow: !args['reuse-window'],
				forceReuseWindow: args['reuse-window'],
				diffMode: args.diff
			});
		}

		// If the other instance is waiting to be killed, we hook up a window listener if one window
		// is being used and only then resolve the startup promise which will kill this second instance
		if (args.wait && usedWindows && usedWindows.length === 1 && usedWindows[0]) {
			const windowId = usedWindows[0].id;

			return new TPromise<void>((c, e) => {
				const onceWindowClose = once(this.windowsService.onWindowClose);
				onceWindowClose(id => {
					if (id === windowId) {
						c(null);
					}
				});
			});
		}

		return TPromise.as(null);
	}

	getMainProcessId(): TPromise<number> {
		this.logService.log('Received request for process ID from other instance.');
		return TPromise.as(process.pid);
	}
}