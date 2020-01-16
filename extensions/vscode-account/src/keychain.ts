/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as keytar from 'keytar';

const SERVICE_ID = 'vscode.login';
const ACCOUNT_ID = 'account';

export class Keychain {

	async setToken(token: string): Promise<void> {
		try {
			return await keytar.setPassword(SERVICE_ID, ACCOUNT_ID, token);
		} catch (e) {
			// Ignore
		}
	}

	async getToken() {
		try {
			return await keytar.getPassword(SERVICE_ID, ACCOUNT_ID);
		} catch (e) {
			// Ignore
		}
	}

	async deleteToken() {
		try {
			return await keytar.deletePassword(SERVICE_ID, ACCOUNT_ID);
		} catch (e) {
			// Ignore
		}
	}
}

export const keychain = new Keychain();
