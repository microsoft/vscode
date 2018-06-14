/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { ITypeScriptServiceClient } from '../typescriptService';
import API from './api';
import { disposeAll } from './dispose';

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

export class VersionDependentRegistration {
	private readonly _registration: ConditionalRegistration;
	private readonly _disposables: vscode.Disposable[] = [];

	constructor(
		private readonly client: ITypeScriptServiceClient,
		private readonly minVersion: API,
		register: () => vscode.Disposable,
	) {
		this._registration = new ConditionalRegistration(register);

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
		this._registration.update(api.gte(this.minVersion));
	}
}


export class ConfigurationDependentRegistration {
	private readonly _registration: ConditionalRegistration;
	private readonly _disposables: vscode.Disposable[] = [];

	constructor(
		private readonly language: string,
		private readonly configValue: string,
		register: () => vscode.Disposable,
	) {
		this._registration = new ConditionalRegistration(register);

		this.update();

		vscode.workspace.onDidChangeConfiguration(() => {
			this.update();
		}, null, this._disposables);
	}

	public dispose() {
		disposeAll(this._disposables);
		this._registration.dispose();
	}

	private update() {
		const config = vscode.workspace.getConfiguration(this.language, null);
		this._registration.update(!!config.get<boolean>(this.configValue));
	}
}
