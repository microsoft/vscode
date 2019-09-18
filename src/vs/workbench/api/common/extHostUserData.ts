/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ExtHostUserDataShape, MainThreadUserDataShape } from './extHost.protocol';
import * as vscode from 'vscode';
import { toDisposable, Disposable } from 'vs/base/common/lifecycle';
import { ILogService } from 'vs/platform/log/common/log';
import { IUserData } from 'vs/platform/userDataSync/common/userDataSync';

export class ExtHostUserData implements ExtHostUserDataShape {

	private name: string | null = null;
	private userDataProvider: vscode.UserDataSyncProvider | null = null;

	constructor(
		private readonly proxy: MainThreadUserDataShape,
		private readonly logService: ILogService,
	) {
	}

	registerUserDataProvider(id: string, name: string, userDataProvider: vscode.UserDataSyncProvider): vscode.Disposable {
		if (this.userDataProvider) {
			this.logService.warn(`A user data provider '${this.name}' already exists hence ignoring the remote user data provider '${name}'.`);
			return Disposable.None;
		}
		this.userDataProvider = userDataProvider;
		this.name = name;
		this.proxy.$registerUserDataProvider(id, name);
		return toDisposable(() => this.proxy.$deregisterUserDataProvider());
	}

	$read(key: string): Promise<IUserData | null> {
		if (!this.userDataProvider) {
			throw new Error('No remote user data provider exists.');
		}
		return this.userDataProvider.read(key);
	}

	$write(key: string, content: string, ref: string): Promise<string> {
		if (!this.userDataProvider) {
			throw new Error('No remote user data provider exists.');
		}
		return this.userDataProvider.write(key, content, ref);
	}

}
