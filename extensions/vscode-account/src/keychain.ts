/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// keytar depends on a native module shipped in vscode, so this is
// how we load it
import * as keytarType from 'keytar';
import { env } from 'vscode';
import Logger from './logger';

function getKeytar(): Keytar | undefined {
	try {
		return require('keytar');
	} catch (err) {
		console.log(err);
	}

	return undefined;
}

export type Keytar = {
	getPassword: typeof keytarType['getPassword'];
	setPassword: typeof keytarType['setPassword'];
	deletePassword: typeof keytarType['deletePassword'];
};

const SERVICE_ID = `${env.uriScheme}-vscode.login`;
const ACCOUNT_ID = 'account';

export class Keychain {
	private keytar: Keytar;

	constructor() {
		const keytar = getKeytar();
		if (!keytar) {
			throw new Error('System keychain unavailable');
		}

		this.keytar = keytar;
	}

	async setToken(token: string): Promise<void> {
		try {
			return await this.keytar.setPassword(SERVICE_ID, ACCOUNT_ID, token);
		} catch (e) {
			// Ignore
			Logger.error(`Setting token failed: ${e}`);
		}
	}

	async getToken(): Promise<string | null | undefined> {
		try {
			return await this.keytar.getPassword(SERVICE_ID, ACCOUNT_ID);
		} catch (e) {
			// Ignore
			Logger.error(`Getting token failed: ${e}`);
			return Promise.resolve(undefined);
		}
	}

	async deleteToken(): Promise<boolean | undefined> {
		try {
			return await this.keytar.deletePassword(SERVICE_ID, ACCOUNT_ID);
		} catch (e) {
			// Ignore
			Logger.error(`Deleting token failed: ${e}`);
			return Promise.resolve(undefined);
		}
	}
}

export const keychain = new Keychain();
