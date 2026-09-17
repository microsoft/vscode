/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import type { IProtocolServer, IProtocolTransport } from '../common/state/sessionTransport.js';

/**
 * Presents multiple protocol listeners as one server.
 */
export class CompositeProtocolServer extends Disposable implements IProtocolServer {

	private readonly _onConnection = this._register(new Emitter<IProtocolTransport>());
	readonly onConnection = this._onConnection.event;

	readonly address = undefined;

	constructor(servers: readonly IProtocolServer[]) {
		super();

		for (const server of servers) {
			this._register(server);
			this._register(server.onConnection(transport => this._onConnection.fire(transport)));
		}
	}
}
