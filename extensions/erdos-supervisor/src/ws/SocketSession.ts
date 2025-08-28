/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2023-2025 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import * as os from 'os';
import * as vscode from 'vscode';
import WebSocket from 'ws';
import { createWebSocket } from '../NamedPipeHttpAgent';

export class SocketSession implements vscode.Disposable {
	public readonly userId: string;
	public readonly ws: WebSocket;

	constructor(
		public readonly uri: string,
		public readonly sessionId: string,
		public readonly channel: vscode.LogOutputChannel,
		headers?: { [key: string]: string }
	) {
		this.ws = createWebSocket(uri, undefined, { headers });

		this.userId = os.userInfo().username;
	}

	close() {
		this.ws.close();
	}

	dispose() {
		this.close();
	}
}
