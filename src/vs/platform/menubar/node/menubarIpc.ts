/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { IMenubarService } from 'vs/platform/menubar/node/menubar';
import { Event } from 'vs/base/common/event';

export class MenubarChannel implements IServerChannel {

	constructor(private service: IMenubarService) { }

	listen<T>(_: unknown, event: string): Event<T> {
		throw new Error(`Event not found: ${event}`);
	}

	call(_: unknown, command: string, arg?: any): Promise<any> {
		switch (command) {
			case 'updateMenubar': return this.service.updateMenubar(arg[0], arg[1]);
		}

		throw new Error(`Call not found: ${command}`);
	}
}