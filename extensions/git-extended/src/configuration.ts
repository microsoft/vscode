/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

export interface IConfiguration {
	username: string | undefined;
	host: string;
	accessToken: string | undefined;
	onDidChange: vscode.Event<IConfiguration>;
}

export class Configuration implements IConfiguration {
	onDidChange: vscode.Event<IConfiguration>;

	private emitter: vscode.EventEmitter<IConfiguration>;

	constructor(
		public username: string | undefined,
		public host: string = 'github.com',
		public accessToken: string
	) {
		this.emitter = new vscode.EventEmitter<IConfiguration>();
		this.onDidChange = this.emitter.event;
	}

	update(username, host = 'github.com', accessToken) {
		if (
			username !== this.username ||
			host !== this.host ||
			accessToken !== this.accessToken
		) {
			this.username = username;
			this.host = host;
			this.accessToken = accessToken;
			this.emitter.fire(this);
		}
	}
}
