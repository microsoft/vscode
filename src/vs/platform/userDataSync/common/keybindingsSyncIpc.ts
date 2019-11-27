/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IChannel, IServerChannel } from 'vs/base/parts/ipc/common/ipc';
import { Event } from 'vs/base/common/event';
import { IKeybindingsMergeService } from 'vs/platform/userDataSync/common/userDataSync';

export class KeybindingsMergeChannel implements IServerChannel {

	constructor(private readonly service: IKeybindingsMergeService) { }

	listen(_: unknown, event: string): Event<any> {
		throw new Error(`Event not found: ${event}`);
	}

	call(context: any, command: string, args?: any): Promise<any> {
		switch (command) {
			case 'merge': return this.service.merge(args[0], args[1], args[2]);
		}
		throw new Error('Invalid call');
	}
}

export class KeybindingsMergeChannelClient implements IKeybindingsMergeService {

	_serviceBrand: undefined;

	constructor(private readonly channel: IChannel) {
	}

	merge(localContent: string, remoteContent: string, baseContent: string | null): Promise<{ mergeContent: string, hasChanges: boolean, hasConflicts: boolean }> {
		return this.channel.call('merge', [localContent, remoteContent, baseContent]);
	}

}
