/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { CancellationToken } from '../../../base/common/cancellation.js';
import { IChannel, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ISandboxDependencyStatus, ISandboxHelperService } from './sandboxHelperService.js';

export const SANDBOX_HELPER_CHANNEL_NAME = 'sandboxHelper';

export class SandboxHelperChannel implements IServerChannel {

	constructor(private readonly service: ISandboxHelperService) { }

	listen<T>(_context: unknown, _event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	call<T>(_context: unknown, command: string, _arg?: unknown, _cancellationToken?: CancellationToken): Promise<T> {
		switch (command) {
			case 'checkSandboxDependencies':
				return this.service.checkSandboxDependencies() as Promise<T>;
		}

		throw new Error('Invalid call');
	}
}

export class SandboxHelperChannelClient implements ISandboxHelperService {
	declare readonly _serviceBrand: undefined;

	constructor(private readonly channel: IChannel) { }

	checkSandboxDependencies(): Promise<ISandboxDependencyStatus | undefined> {
		return this.channel.call<ISandboxDependencyStatus | undefined>('checkSandboxDependencies');
	}
}
