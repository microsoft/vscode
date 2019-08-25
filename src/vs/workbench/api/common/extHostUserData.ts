/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostUserDataShape, MainThreadUserDataShape } from './extHost.protocol';
import { ExtHostFileSystem } from 'vs/workbench/api/common/extHostFileSystem';
import * as vscode from 'vscode';
import { DisposableStore, toDisposable } from 'vs/base/common/lifecycle';

export class ExtHostUserData implements ExtHostUserDataShape {

	private readonly loginProviders: Map<string, vscode.UserLoginProvider> = new Map<string, vscode.UserLoginProvider>();

	constructor(
		private readonly proxy: MainThreadUserDataShape,
		private readonly extHostFileSystem: ExtHostFileSystem
	) {
	}

	registerUserDataProvider(identity: string, userDataProvider: vscode.UserDataProvider): vscode.Disposable {
		const userDataScheme = `vscode-userdata-${identity}`;
		const disposable = this.extHostFileSystem.registerFileSystemProvider(userDataScheme, userDataProvider.dataProvider);
		this.proxy.$registerUserDataProvider(identity, { userDataScheme });
		return disposable;
	}

	registerUserLoginProvider(identity: string, loginProvider: vscode.UserLoginProvider): vscode.Disposable {
		this.loginProviders.set(identity, loginProvider);
		this.proxy.$registerUserLoginProvider(identity, loginProvider.isLoggedin());
		const disposable = new DisposableStore();
		disposable.add(loginProvider.onDidChange(() => this.proxy.$updateLoggedIn(identity, loginProvider.isLoggedin())));
		disposable.add(toDisposable(() => this.loginProviders.delete(identity)));
		return disposable;
	}

	async $logIn(identity: string): Promise<void> {
		const loginProvider = this.loginProviders.get(identity);
		if (!loginProvider) {
			return Promise.reject(new Error(`No login provider found for ${identity}`));
		}
		await loginProvider.login();
	}

	$logOut(identity: string): Promise<void> {
		const loginProvider = this.loginProviders.get(identity);
		if (!loginProvider) {
			return Promise.reject(new Error(`No login provider found for ${identity}`));
		}
		return Promise.resolve();
	}

}
