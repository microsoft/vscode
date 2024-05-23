/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { Log } from './logger';

export class Keychain {
	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly serviceId: string,
		private readonly Logger: Log
	) { }

	async setToken(token: string): Promise<void> {
		try {
			return await this.context.secrets.store(this.serviceId, token);
		} catch (e) {
			// Ignore
			this.Logger.error(`Setting token failed: ${e}`);
		}
	}

	async getToken(): Promise<string | null | undefined> {
		try {
			const secret = await this.context.secrets.get(this.serviceId);
			if (secret && secret !== '[]') {
				this.Logger.trace('Token acquired from secret storage.');
			}
			return secret;
		} catch (e) {
			// Ignore
			this.Logger.error(`Getting token failed: ${e}`);
			return Promise.resolve(undefined);
		}
	}

	async deleteToken(): Promise<void> {
		try {
			return await this.context.secrets.delete(this.serviceId);
		} catch (e) {
			// Ignore
			this.Logger.error(`Deleting token failed: ${e}`);
			return Promise.resolve(undefined);
		}
	}
}
