/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService } from 'vs/platform/windows/common/windows';
import { ParsedArgs } from 'vs/platform/environment/common/environment';
import { IMainProcessService } from 'vs/platform/ipc/electron-browser/mainProcessService';
import { IProcessEnvironment } from 'vs/base/common/platform';

export class WindowsService implements IWindowsService {

	_serviceBrand: undefined;

	private channel: IChannel;

	constructor(@IMainProcessService mainProcessService: IMainProcessService) {
		this.channel = mainProcessService.getChannel('windows');
	}

	openExtensionDevelopmentHostWindow(args: ParsedArgs, env: IProcessEnvironment): Promise<void> {
		return this.channel.call('openExtensionDevelopmentHostWindow', [args, env]);
	}
}
