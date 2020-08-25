/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// keytar depends on a native module shipped in vscode, so this is
// how we load it
import * as vscode from 'vscode';
import Logger from './logger';
import * as nls from 'vscode-nls';

const localize = nls.loadMessageBundle();


const SERVICE_ID = `${vscode.env.uriScheme}-github.auth`;

export class Keychain {
	async setToken(token: string): Promise<void> {
		try {
			return await vscode.authentication.setPassword(SERVICE_ID, token);
		} catch (e) {
			// Ignore
			Logger.error(`Setting token failed: ${e}`);
			const troubleshooting = localize('troubleshooting', "Troubleshooting Guide");
			const result = await vscode.window.showErrorMessage(localize('keychainWriteError', "Writing login information to the keychain failed with error '{0}'.", e.message), troubleshooting);
			if (result === troubleshooting) {
				vscode.env.openExternal(vscode.Uri.parse('https://code.visualstudio.com/docs/editor/settings-sync#_troubleshooting-keychain-issues'));
			}
		}
	}

	async getToken(): Promise<string | null | undefined> {
		try {
			return await vscode.authentication.getPassword(SERVICE_ID);
		} catch (e) {
			// Ignore
			Logger.error(`Getting token failed: ${e}`);
			return Promise.resolve(undefined);
		}
	}

	async deleteToken(): Promise<void> {
		try {
			return await vscode.authentication.deletePassword(SERVICE_ID);
		} catch (e) {
			// Ignore
			Logger.error(`Deleting token failed: ${e}`);
			return Promise.resolve(undefined);
		}
	}
}

export const keychain = new Keychain();
