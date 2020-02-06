/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as modes from 'vs/editor/common/modes';
import { Emitter, Event } from 'vs/base/common/event';
import { IMainContext, MainContext, MainThreadAuthenticationShape, ExtHostAuthenticationShape } from 'vs/workbench/api/common/extHost.protocol';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import { IExtensionDescription, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

export class AuthenticationProviderWrapper implements vscode.AuthenticationProvider {
	onDidChangeSessions: Event<void>;

	constructor(private _requestingExtension: IExtensionDescription,
		private _provider: vscode.AuthenticationProvider,
		private _proxy: MainThreadAuthenticationShape) {

		this.onDidChangeSessions = this._provider.onDidChangeSessions;
	}

	get id(): string {
		return this._provider.id;
	}

	get displayName(): string {
		return this._provider.displayName;
	}

	async getSessions(): Promise<ReadonlyArray<vscode.AuthenticationSession>> {
		return (await this._provider.getSessions()).map(session => {
			return {
				id: session.id,
				accountName: session.accountName,
				scopes: session.scopes,
				accessToken: async () => {
					const isAllowed = await this._proxy.$getSessionsPrompt(
						this._provider.id,
						this.displayName,
						ExtensionIdentifier.toKey(this._requestingExtension.identifier),
						this._requestingExtension.displayName || this._requestingExtension.name);

					if (!isAllowed) {
						throw new Error('User did not consent to token access.');
					}

					return session.accessToken();
				}
			};
		});
	}

	async login(scopes: string[]): Promise<vscode.AuthenticationSession> {
		const isAllowed = await this._proxy.$loginPrompt(this._provider.id, this.displayName, ExtensionIdentifier.toKey(this._requestingExtension.identifier), this._requestingExtension.displayName || this._requestingExtension.name);
		if (!isAllowed) {
			throw new Error('User did not consent to login.');
		}

		return this._provider.login(scopes);
	}

	logout(sessionId: string): Promise<void> {
		return this._provider.logout(sessionId);
	}
}

export class ExtHostAuthentication implements ExtHostAuthenticationShape {
	private _proxy: MainThreadAuthenticationShape;
	private _authenticationProviders: Map<string, vscode.AuthenticationProvider> = new Map<string, vscode.AuthenticationProvider>();

	private _onDidChangeAuthenticationProviders = new Emitter<vscode.AuthenticationProvidersChangeEvent>();
	readonly onDidChangeAuthenticationProviders: Event<vscode.AuthenticationProvidersChangeEvent> = this._onDidChangeAuthenticationProviders.event;

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAuthentication);
	}

	providers(requestingExtension: IExtensionDescription): vscode.AuthenticationProvider[] {
		let providers: vscode.AuthenticationProvider[] = [];
		this._authenticationProviders.forEach(provider => providers.push(new AuthenticationProviderWrapper(requestingExtension, provider, this._proxy)));
		return providers;
	}

	registerAuthenticationProvider(provider: vscode.AuthenticationProvider): vscode.Disposable {
		if (this._authenticationProviders.get(provider.id)) {
			throw new Error(`An authentication provider with id '${provider.id}' is already registered.`);
		}

		this._authenticationProviders.set(provider.id, provider);

		const listener = provider.onDidChangeSessions(_ => {
			this._proxy.$onDidChangeSessions(provider.id);
		});

		this._proxy.$registerAuthenticationProvider(provider.id, provider.displayName);
		this._onDidChangeAuthenticationProviders.fire({ added: [provider.id], removed: [] });

		return new Disposable(() => {
			listener.dispose();
			this._authenticationProviders.delete(provider.id);
			this._proxy.$unregisterAuthenticationProvider(provider.id);
			this._onDidChangeAuthenticationProviders.fire({ added: [], removed: [provider.id] });
		});
	}

	$login(providerId: string, scopes: string[]): Promise<modes.AuthenticationSession> {
		const authProvider = this._authenticationProviders.get(providerId);
		if (authProvider) {
			return Promise.resolve(authProvider.login(scopes));
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$logout(providerId: string, sessionId: string): Promise<void> {
		const authProvider = this._authenticationProviders.get(providerId);
		if (authProvider) {
			return Promise.resolve(authProvider.logout(sessionId));
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$getSessions(providerId: string): Promise<ReadonlyArray<modes.AuthenticationSession>> {
		const authProvider = this._authenticationProviders.get(providerId);
		if (authProvider) {
			return Promise.resolve(authProvider.getSessions());
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	async $getSessionAccessToken(providerId: string, sessionId: string): Promise<string> {
		const authProvider = this._authenticationProviders.get(providerId);
		if (authProvider) {
			const sessions = await authProvider.getSessions();
			const session = sessions.find(session => session.id === sessionId);
			if (session) {
				return session.accessToken();
			}

			throw new Error(`Unable to find session with id: ${sessionId}`);
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}
}
