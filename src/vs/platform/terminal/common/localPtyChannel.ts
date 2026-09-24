/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../base/common/lifecycle.js';
import { IServerChannel, ProxyChannel } from '../../../base/parts/ipc/common/ipc.js';
import { ILocalPtyService } from './terminal.js';

export function createLocalPtyChannel(service: ILocalPtyService, disposables: DisposableStore): IServerChannel {
	return ProxyChannel.fromService(service, disposables, {
		// Process events use the direct pty host connection; keep management-event buffering unchanged on this channel.
		unbufferedEvents: [
			'onProcessData',
			'onProcessReady',
			'onProcessExit',
			'onProcessReplay',
			'onDidChangeProperty',
			'onProcessOrphanQuestion',
			'onDidRequestDetach',
		] satisfies (keyof ILocalPtyService)[]
	});
}
