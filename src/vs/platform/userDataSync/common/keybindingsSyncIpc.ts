/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IUserKeybindingsResolverService } from 'vs/platform/userDataSync/common/userDataSync';
import { IStringDictionary } from 'vs/base/common/collections';

export class UserKeybindingsResolverServiceChannel implements IServerChannel {

	constructor(private readonly service: IUserKeybindingsResolverService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'resolveUserKeybindings': return this.service.resolveUserKeybindings(args[0], args[1], args[2]);
		}
		throw new Error('Invalid call');
	}
}

export class UserKeybindingsResolverServiceClient implements IUserKeybindingsResolverService {

	_serviceBrand: undefined;

	constructor(private readonly channel: IChannel) {
	}

	async resolveUserKeybindings(localContent: string, remoteContent: string, baseContent: string | null): Promise<IStringDictionary<string>> {
		return this.channel.call('resolveUserKeybindings', [localContent, remoteContent, baseContent]);
	}

}
