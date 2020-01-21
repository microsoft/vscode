/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as modes from 'vs/editor/common/modes';
import { Emitter, Event } from 'vs/base/common/event';
import { IMainContext, MainContext, MainThreadAuthenticationShape, ExtHostAuthenticationShape } from 'vs/workbench/api/common/extHost.protocol';
import { IDisposable } from 'vs/base/common/lifecycle';

const _onDidUnregisterAuthenticationProvider = new Emitter<string>();
const _onDidChangeSessions = new Emitter<string>();

export class ExtHostAuthenticationProvider implements IDisposable {
	constructor(private _provider: vscode.AuthenticationProvider,
		private _id: string,
		private _proxy: MainThreadAuthenticationShape) {
		this._provider.onDidChangeSessions(x => {
			this._proxy.$onDidChangeSessions(this._id);
			_onDidChangeSessions.fire(this._id);
		});
	}

	getSessions(): Promise<ReadonlyArray<vscode.Session>> {
		return this._provider.getSessions();
	}

	login(): Promise<vscode.Session> {
		return this._provider.login();
	}

	logout(sessionId: string): Promise<void> {
		return this._provider.logout(sessionId);
	}

	dispose(): void {
		this._proxy.$unregisterAuthenticationProvider(this._id);
		_onDidUnregisterAuthenticationProvider.fire(this._id);
	}
}

export class ExtHostAuthentication implements ExtHostAuthenticationShape {
	private _proxy: MainThreadAuthenticationShape;
	private _authenticationProviders: Map<string, ExtHostAuthenticationProvider> = new Map<string, ExtHostAuthenticationProvider>();

	private _onDidRegisterAuthenticationProvider = new Emitter<string>();
	readonly onDidRegisterAuthenticationProvider: Event<string> = this._onDidRegisterAuthenticationProvider.event;

	readonly onDidUnregisterAuthenticationProvider: Event<string> = _onDidUnregisterAuthenticationProvider.event;

	readonly onDidChangeSessions: Event<string> = _onDidChangeSessions.event;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAuthentication);

		this.onDidUnregisterAuthenticationProvider(providerId => {
			this._authenticationProviders.delete(providerId);
		});
	}

	registerAuthenticationProvider(provider: vscode.AuthenticationProvider) {
		if (this._authenticationProviders.get(provider.id)) {
			throw new Error(`An authentication provider with id '${provider.id}' is already registered.`);
		}

		const authenticationProvider = new ExtHostAuthenticationProvider(provider, provider.id, this._proxy);
		this._authenticationProviders.set(provider.id, authenticationProvider);

		this._proxy.$registerAuthenticationProvider(provider.id);
		this._onDidRegisterAuthenticationProvider.fire(provider.id);
		return authenticationProvider;
	}

	$login(providerId: string): Promise<modes.Session> {
		const authProvider = this._authenticationProviders.get(providerId);
		if (authProvider) {
			return Promise.resolve(authProvider.login());
		}

		throw new Error(`Unable to find authentication provider with handle: ${0}`);
	}

	$logout(providerId: string, sessionId: string): Promise<void> {
		const authProvider = this._authenticationProviders.get(providerId);
		if (authProvider) {
			return Promise.resolve(authProvider.logout(sessionId));
		}

		throw new Error(`Unable to find authentication provider with handle: ${0}`);
	}

	$getSessions(providerId: string): Promise<ReadonlyArray<modes.Session>> {
		const authProvider = this._authenticationProviders.get(providerId);
		if (authProvider) {
			return Promise.resolve(authProvider.getSessions());
		}

		throw new Error(`Unable to find authentication provider with handle: ${0}`);
	}
}
