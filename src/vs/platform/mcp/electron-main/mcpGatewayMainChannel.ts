/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../base/common/event.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { IPCServer, IServerChannel } from '../../../base/parts/ipc/common/ipc.js';
import { IMcpGatewayService } from '../common/mcpGateway.js';

/**
 * IPC channel for the MCP Gateway service in the electron-main process.
 *
 * This channel tracks which client (identified by ctx) creates gateways,
 * enabling cleanup when a client disconnects (e.g., window crash).
 */
export class McpGatewayMainChannel extends Disposable implements IServerChannel<string> {

	constructor(
		ipcServer: IPCServer,
		@IMcpGatewayService private readonly mcpGatewayService: IMcpGatewayService
	) {
		super();
		this._register(ipcServer.onDidRemoveConnection(c => mcpGatewayService.disposeGatewaysForClient(c.ctx)));
	}

	listen<T>(_ctx: string, _event: string): Event<T> {
		throw new Error('Invalid listen');
	}

	async call<T>(ctx: string, command: string, args?: unknown): Promise<T> {
		switch (command) {
			case 'createGateway': {
				// Use the context (client ID) to track gateway ownership
				const result = await this.mcpGatewayService.createGateway(ctx);
				return result as T;
			}
			case 'disposeGateway': {
				await this.mcpGatewayService.disposeGateway(args as string);
				return undefined as T;
			}
		}
		throw new Error(`Invalid call: ${command}`);
	}
}
