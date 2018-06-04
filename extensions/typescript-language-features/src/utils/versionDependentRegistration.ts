/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { disposeAll } from '../utils/dispose';

export interface Delegate {
	isSupportedVersion(api: API): boolean;
	register(): vscode.Disposable;
}

export class VersionDependentRegistration {
	private registration: vscode.Disposable | undefined = undefined;

	private readonly _disposables: vscode.Disposable[] = [];

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly delegate: Delegate,
	) {
		this.update(client.apiVersion);

		this.client.onTsServerStarted(() => {
			this.update(this.client.apiVersion);
		}, null, this._disposables);
	}

	public dispose() {
		disposeAll(this._disposables);
		if (this.registration) {
			this.registration.dispose();
			this.registration = undefined;
		}
	}

	private update(api: API) {
		if (this.delegate.isSupportedVersion(api)) {
			if (!this.registration) {
				this.registration = this.delegate.register();
			}
		} else {
			if (this.registration) {
				this.registration.dispose();
				this.registration = undefined;
			}
		}
	}
}
