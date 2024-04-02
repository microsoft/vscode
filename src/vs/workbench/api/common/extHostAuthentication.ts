/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as vscode from 'vscode';
import { Emitter, Event } from 'vs/base/common/event';
import { MainContext, MainThreadAuthenticationShape, ExtHostAuthenticationShape } from 'vs/workbench/api/common/extHost.protocol';
import { Disposable } from 'vs/workbench/api/common/extHostTypes';
import { IExtensionDescription, ExtensionIdentifier } from 'vs/platform/extensions/common/extensions';
import { INTERNAL_AUTH_PROVIDER_PREFIX } from 'vs/workbench/services/authentication/common/authentication';
import { createDecorator } from 'vs/platform/instantiation/common/instantiation';
import { IExtHostRpcService } from 'vs/workbench/api/common/extHostRpcService';

export interface IExtHostAuthentication extends ExtHostAuthentication { }
export const IExtHostAuthentication = createDecorator<IExtHostAuthentication>('IExtHostAuthentication');

interface ProviderWithMetadata {
	label: string;
	provider: vscode.AuthenticationProvider;
	options: vscode.AuthenticationProviderOptions;
}

export class ExtHostAuthentication implements ExtHostAuthenticationShape {

	declare _serviceBrand: undefined;

	private _proxy: MainThreadAuthenticationShape;
	private _authenticationProviders: Map<string, ProviderWithMetadata> = new Map<string, ProviderWithMetadata>();

	private _onDidChangeSessions = new Emitter<vscode.AuthenticationSessionsChangeEvent>();
	readonly onDidChangeSessions: Event<vscode.AuthenticationSessionsChangeEvent> = this._onDidChangeSessions.event;

	private _getSessionTaskSingler = new TaskSingler<vscode.AuthenticationSession | undefined>();
	private _getSessionsTaskSingler = new TaskSingler<ReadonlyArray<vscode.AuthenticationSession>>();

	constructor(
		@IExtHostRpcService extHostRpc: IExtHostRpcService
	) {
		this._proxy = extHostRpc.getProxy(MainContext.MainThreadAuthentication);
	}

	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions & ({ createIfNone: true } | { forceNewSession: true } | { forceNewSession: vscode.AuthenticationForceNewSessionOptions })): Promise<vscode.AuthenticationSession>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions & { forceNewSession: true }): Promise<vscode.AuthenticationSession>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions & { forceNewSession: vscode.AuthenticationForceNewSessionOptions }): Promise<vscode.AuthenticationSession>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions): Promise<vscode.AuthenticationSession | undefined>;
	async getSession(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[], options: vscode.AuthenticationGetSessionOptions = {}): Promise<vscode.AuthenticationSession | undefined> {
		const extensionId = ExtensionIdentifier.toKey(requestingExtension.identifier);
		const sortedScopes = [...scopes].sort().join(' ');
		return await this._getSessionTaskSingler.getOrCreate(`${extensionId} ${providerId} ${sortedScopes}`, async () => {
			await this._proxy.$ensureProvider(providerId);
			const extensionName = requestingExtension.displayName || requestingExtension.name;
			return this._proxy.$getSession(providerId, scopes, extensionId, extensionName, options);
		});
	}

	async getSessions(requestingExtension: IExtensionDescription, providerId: string, scopes: readonly string[]): Promise<ReadonlyArray<vscode.AuthenticationSession>> {
		const extensionId = ExtensionIdentifier.toKey(requestingExtension.identifier);
		const sortedScopes = [...scopes].sort().join(' ');
		return await this._getSessionsTaskSingler.getOrCreate(`${extensionId} ${sortedScopes}`, async () => {
			await this._proxy.$ensureProvider(providerId);
			const extensionName = requestingExtension.displayName || requestingExtension.name;
			return this._proxy.$getSessions(providerId, scopes, extensionId, extensionName);
		});
	}

	async removeSession(providerId: string, sessionId: string): Promise<void> {
		const providerData = this._authenticationProviders.get(providerId);
		if (!providerData) {
			return this._proxy.$removeSession(providerId, sessionId);
		}

		return providerData.provider.removeSession(sessionId);
	}

	registerAuthenticationProvider(id: string, label: string, provider: vscode.AuthenticationProvider, options?: vscode.AuthenticationProviderOptions): vscode.Disposable {
		if (this._authenticationProviders.get(id)) {
			throw new Error(`An authentication provider with id '${id}' is already registered.`);
		}

		this._authenticationProviders.set(id, { label, provider, options: options ?? { supportsMultipleAccounts: false } });
		const listener = provider.onDidChangeSessions(e => this._proxy.$sendDidChangeSessions(id, e));
		this._proxy.$registerAuthenticationProvider(id, label, options?.supportsMultipleAccounts ?? false);

		return new Disposable(() => {
			listener.dispose();
			this._authenticationProviders.delete(id);
			this._proxy.$unregisterAuthenticationProvider(id);
		});
	}

	$createSession(providerId: string, scopes: string[], options: vscode.AuthenticationProviderCreateSessionOptions): Promise<vscode.AuthenticationSession> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			return Promise.resolve(providerData.provider.createSession(scopes, options));
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$removeSession(providerId: string, sessionId: string): Promise<void> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			return Promise.resolve(providerData.provider.removeSession(sessionId));
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$getSessions(providerId: string, scopes?: string[]): Promise<ReadonlyArray<vscode.AuthenticationSession>> {
		const providerData = this._authenticationProviders.get(providerId);
		if (providerData) {
			return Promise.resolve(providerData.provider.getSessions(scopes));
		}

		throw new Error(`Unable to find authentication provider with handle: ${providerId}`);
	}

	$onDidChangeAuthenticationSessions(id: string, label: string) {
		// Don't fire events for the internal auth providers
		if (!id.startsWith(INTERNAL_AUTH_PROVIDER_PREFIX)) {
			this._onDidChangeSessions.fire({ provider: { id, label } });
		}
		return Promise.resolve();
	}
}

class TaskSingler<T> {
	private _inFlightPromises = new Map<string, Promise<T>>();
	getOrCreate(key: string, promiseFactory: () => Promise<T>) {
		const inFlight = this._inFlightPromises.get(key);
		if (inFlight) {
			return inFlight;
		}

		const promise = promiseFactory().finally(() => this._inFlightPromises.delete(key));
		this._inFlightPromises.set(key, promise);

		return promise;
	}
}
