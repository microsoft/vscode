/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import * as modes from 'vs/editor/common/modes';
import { Emitter, Event } from 'vs/base/common/event';
import { IMainContext, MainContext, MainThreadAuthenticationShape, ExtHostAuthenticationShape } from 'vs/workbench/api/common/extHost.protocol';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import { IExtensionDescription, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';

interface GetSessionsRequest {
	scopes: string;
	result: Promise<vscode.AuthenticationSession | undefined>;
}

interface ProviderWithMetadata {
	label: string;
	provider: vscode.AuthenticationProvider;
	options: vscode.AuthenticationProviderOptions;
}

export class ExtHostAuthentication implements ExtHostAuthenticationShape {
	private _proxy: MainThreadAuthenticationShape;
	private _authenticationProviders: Map<string, ProviderWithMetadata> = new Map<string, ProviderWithMetadata>();

	private _providers: vscode.AuthenticationProviderInformation[] = [];

	private _onDidChangeAuthenticationProviders = new Emitter<vscode.AuthenticationProvidersChangeEvent>();
	readonly onDidChangeAuthenticationProviders: Event<vscode.AuthenticationProvidersChangeEvent> = this._onDidChangeAuthenticationProviders.event;

	private _onDidChangeSessions = new Emitter<vscode.AuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions: Event<vscode.AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	private _inFlightRequests = new Map<string, GetSessionsRequest[]>();

	constructor(mainContext: IMainContext) {
		this._proxy = mainContext.getProxy(MainContext.MainThreadAuthentication);
	}

	$setProviders(providers: vscode.AuthenticationProviderInformation[]): Promise<void> {
		this._providers = providers;
		return Promise.resolve();
	}

	get providers(): ReadonlyArray<vscode.AuthenticationProviderInformation> {
		return Object.freeze(this._providers.slice());
	}

	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: string[], options: vscode.AuthenticationGetSessionOptions & { createIfNone: true }): Promise<vscode.AuthenticationSession>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: string[], options: vscode.AuthenticationGetSessionOptions = {}): Promise<vscode.AuthenticationSession | undefined> {
		const extensionId = ExtensionIdentifier.toKey(requestingExtension.identifier);
		const inFlightRequests = this._inFlightRequests.get(extensionId) || [];
		const sortedScopes = scopes.sort().join(' ');
		let inFlightRequest: GetSessionsRequest | undefined = inFlightRequests.find(request => request.scopes === sortedScopes);

		if (inFlightRequest) {
			return inFlightRequest.result;
		} else {
			const session = this._getSession(requestingExtension, extensionId, providerId, scopes, options);
			inFlightRequest = {
				scopes: sortedScopes,
				result: session
			};

			inFlightRequests.push(inFlightRequest);
			this._inFlightRequests.set(extensionId, inFlightRequests);

			try {
				await session;
			} finally {
				const requestIndex = inFlightRequests.findIndex(request => request.scopes === sortedScopes);
				if (requestIndex > -1) {
					inFlightRequests.splice(requestIndex);
					this._inFlightRequests.set(extensionId, inFlightRequests);
				}
			}

			return session;
		}
	}

	private async _getSession(requestingExtension: IExtensionDescription, extensionId: string, providerId: string, scopes: string[], options: vscode.AuthenticationGetSessionOptions = {}): Promise<vscode.AuthenticationSession | undefined> {
		await this._proxy.$ensureProvider(providerId);
		const providerData = this._authenticationProviders.get(providerId);
		const extensionName = requestingExtension.displayName || requestingExtension.name;

		if (!providerData) {
			return this._proxy.$getSession(providerId, scopes, extensionId, extensionName, options);
		}

		const orderedScopes = scopes.sort().join(' ');
		const sessions = (await providerData.provider.getSessions()).filter(session => session.scopes.slice().sort().join(' ') === orderedScopes);

		let session: vscode.AuthenticationSession | undefined = undefined;
		if (sessions.length) {
			if (!providerData.options.supportsMultipleAccounts) {
				session = sessions[0];
				const allowed = await this._proxy.$getSessionsPrompt(providerId, session.account.label, providerData.label, extensionId, extensionName);
				if (!allowed) {
					throw new Error('User did not consent to login.');
				}
			} else {
				// On renderer side, confirm consent, ask user to choose between accounts if multiple sessions are valid
				const selected = await this._proxy.$selectSession(providerId, providerData.label, extensionId, extensionName, sessions, scopes, !!options.clearSessionPreference);
				session = sessions.find(session => session.id === selected.id);
			}

		} else {
			if (options.createIfNone) {
				const isAllowed = await this._proxy.$loginPrompt(providerData.label, extensionName);
				if (!isAllowed) {
					throw new Error('User did not consent to login.');
				}

				session = await providerData.provider.login(scopes);
				await this._proxy.$setTrustedExtensionAndAccountPreference(providerId, session.account.label, extensionId, extensionName, session.id);
			} else {
				await this._proxy.$requestNewSession(providerId, scopes, extensionId, extensionName);
			}
		}

		return session;
	}

	async logout(providerId: string, sessionId: string): Promise<void> {
		const providerData = this._authenticationProviders.get(providerId);
		if (!providerData) {
			return this._proxy.$logout(providerId, sessionId);
		}

		return providerData.provider.logout(sessionId);
	}

	registerAuthenticationProvider(id: string, label: string, provider: vscode.AuthenticationProvider, options?: vscode.AuthenticationProviderOptions): vscode.Disposable {
		if (this._authenticationProviders.get(id)) {
			throw new Error(`An authentication provider with id '${id}' is already registered.`);
		}

		this._authenticationProviders.set(id, { label, provider, options: options ?? { supportsMultipleAccounts: false } });

		if (!this._providers.find(p => p.id === id)) {
			this._providers.push({
				id: id,
				label: label
			});
		}

		const listener = provider.onDidChangeSessions(e => {
			this._proxy.$sendDidChangeSessions(id, e);
		});

		this._proxy.$registerAuthenticationProvider(id, label, options?.supportsMultipleAccounts ?? false);

		return new Disposable(() => {
			listener.dispose();
			this._authenticationProviders.delete(id);

			const i = this._providers.findIndex(p => p.id === id);
			if (i > -1) {
				this._providers.splice(i);
			}

			this._proxy.$unregisterAuthenticationProvider(id);
		});
	}

	$login(providerId: string, scopes: string[]): Promise<modes.AuthenticationSession> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			return Promise.resolve(providerData.provider.login(scopes));
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$logout(providerId: string, sessionId: string): Promise<void> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			return Promise.resolve(providerData.provider.logout(sessionId));
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$getSessions(providerId: string): Promise<ReadonlyArray<modes.AuthenticationSession>> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			return Promise.resolve(providerData.provider.getSessions());
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	async $getSessionAccessToken(providerId: string, sessionId: string): Promise<string> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			const sessions = await providerData.provider.getSessions();
			const session = sessions.find(session => session.id === sessionId);
			if (session) {
				return session.accessToken;
			}

			throw new Error(`Unable to find session with id: ${sessionId}`);
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$onDidChangeAuthenticationSessions(id: string, label: string, event: modes.AuthenticationSessionsChangeEvent) {
		this._onDidChangeSessions.fire({ provider: { id, label }, ...event });
		return Promise.resolve();
	}

	$onDidChangeAuthenticationProviders(added: modes.AuthenticationProviderInformation[], removed: modes.AuthenticationProviderInformation[]) {
		added.forEach(provider => {
			if (!this._providers.some(p => p.id === provider.id)) {
				this._providers.push(provider);
			}
		});

		removed.forEach(p => {
			const index = this._providers.findIndex(provider => provider.id === p.id);
			if (index > -1) {
				this._providers.splice(index);
			}
		});

		this._onDidChangeAuthenticationProviders.fire({ added, removed });
		return Promise.resolve();
	}
}
