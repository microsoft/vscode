/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from '../utils/api';
import { disposeAll } from '../utils/dispose';

class ConditionalRegistration {
	private registration: vscode.Disposable | undefined = undefined;

	public constructor(
		private readonly _doRegister: () => vscode.Disposable
	) { }

	public dispose() {
		if (this.registration) {
			this.registration.dispose();
			this.registration = undefined;
		}
	}

	public update(enabled: boolean) {
		if (enabled) {
			if (!this.registration) {
				this.registration = this._doRegister();
			}
		} else {
			if (this.registration) {
				this.registration.dispose();
				this.registration = undefined;
			}
		}
	}
}

export interface VersionDependentRegistrationDelegate {
	isSupportedVersion(api: API): boolean;
	register(): vscode.Disposable;
}

export class VersionDependentRegistration {
	private readonly _registration: ConditionalRegistration;

	private readonly _disposables: vscode.Disposable[] = [];

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly delegate: VersionDependentRegistrationDelegate,
	) {
		this._registration = new ConditionalRegistration(this.delegate.register);

		this.update(client.apiVersion);

		this.client.onTsServerStarted(() => {
			this.update(this.client.apiVersion);
		}, null, this._disposables);
	}

	public dispose() {
		disposeAll(this._disposables);
		this._registration.dispose();
	}

	private update(api: API) {
		this._registration.update(this.delegate.isSupportedVersion(api));
	}
}
