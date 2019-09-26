/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from 'vs/base/common/event';
import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IWindowsService } from 'vs/platform/windows/common/windows';

export class WindowsChannel implements IServerChannel {

	constructor(private readonly service: IWindowsService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'openExtensionDevelopmentHostWindow': return (this.service as any).openExtensionDevelopmentHostWindow(arg[0], arg[1]); // TODO@Isidor move
		}

		throw new Error(`Call not found: ${command}`);
	}
}
