/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Logger } from '../../automation';
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';

export class McpLogger implements Logger {
	constructor(private _server?: Server) { }
	log(message: string, ...args: any[]): void {
		this._server?.sendLoggingMessage({
			level: 'info',
			message,
			args
		});
	}

	set server(server: Server) {
		this._server = server;
	}
}
