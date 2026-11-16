/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable, toDisposable } from '../../../base/common/lifecycle.js';
import { IAgentHostManagementService } from './agentService.js';

/** Owns one process generation's claim, including its asynchronous initial snapshot. */
export class AgentHostKeepAwakeClaim extends Disposable {
	constructor(
		source: Pick<IAgentHostManagementService, 'onDidChangeKeepAwakeWork' | 'getKeepAwakeWork'>,
		onExit: Event<unknown>,
		update: (busy: boolean) => void,
		onError: (error: unknown) => void,
	) {
		super();
		let eventReceived = false;
		this._register(toDisposable(() => update(false)));
		this._register(source.onDidChangeKeepAwakeWork(busy => {
			eventReceived = true;
			update(busy);
		}));
		this._register(onExit(() => this.dispose()));
		void source.getKeepAwakeWork().then(busy => {
			if (!this._store.isDisposed && !eventReceived) {
				update(busy);
			}
		}).catch(onError);
	}
}
