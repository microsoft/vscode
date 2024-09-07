/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, IDisposable, isDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { isFalsyOrWhitespace } from '../../../../base/common/strings.js';
import { isString } from '../../../../base/common/types.js';
import { localize } from '../../../../nls.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IProductService } from '../../../../platform/product/common/productService.js';
import { ISecretStorageService } from '../../../../platform/secrets/common/secrets.js';
import { IAuthenticationAccessService } from './authenticationAccessService.js';
import { AuthenticationProviderInformation, AuthenticationSession, AuthenticationSessionAccount, AuthenticationSessionsChangeEvent, IAuthenticationCreateSessionOptions, IAuthenticationProvider, IAuthenticationService } from '../common/authentication.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { ActivationKind, IExtensionService } from '../../extensions/common/extensions.js';

export function getAuthenticationProviderActivationEvent(id: string): string { return `onAuthenticationRequest:${id}`; }

// TODO: pull this out into its own service
export type AuthenticationSessionInfo = { readonly id: string; readonly accessToken: string; readonly providerId: string; readonly canSignOut?: boolean };
export async function getCurrentAuthenticationSessionInfo(
	secretStorageService: ISecretStorageService,
	productService: IProductService
): Promise<AuthenticationSessionInfo | undefined> {
	const authenticationSessionValue = await secretStorageService.get(`${productService.urlProtocol}.loginAccount`);
	if (authenticationSessionValue) {
		try {
			const authenticationSessionInfo: AuthenticationSessionInfo = JSON.parse(authenticationSessionValue);
			if (authenticationSessionInfo
				&& isString(authenticationSessionInfo.id)
				&& isString(authenticationSessionInfo.accessToken)
				&& isString(authenticationSessionInfo.providerId)
			) {
				return authenticationSessionInfo;
			}
		} catch (e) {
			// This is a best effort operation.
			console.error(`Failed parsing current auth session value: ${e}`);
		}
	}
	return undefined;
}

export class AuthenticationService extends Disposable implements IAuthenticationService {
	declare readonly _serviceBrand: undefined;

	private _onDidRegisterAuthenticationProvider: Emitter<AuthenticationProviderInformation> = this._register(new Emitter<AuthenticationProviderInformation>());
	readonly onDidRegisterAuthenticationProvider: Event<AuthenticationProviderInformation> = this._onDidRegisterAuthenticationProvider.event;

	private _onDidUnregisterAuthenticationProvider: Emitter<AuthenticationProviderInformation> = this._register(new Emitter<AuthenticationProviderInformation>());
	readonly onDidUnregisterAuthenticationProvider: Event<AuthenticationProviderInformation> = this._onDidUnregisterAuthenticationProvider.event;

	private _onDidChangeSessions: Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }> = this._register(new Emitter<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }>());
	readonly onDidChangeSessions: Event<{ providerId: string; label: string; event: AuthenticationSessionsChangeEvent }> = this._onDidChangeSessions.event;

	private _onDidChangeDeclaredProviders: Emitter<void> = this._register(new Emitter<void>());
	readonly onDidChangeDeclaredProviders: Event<void> = this._onDidChangeDeclaredProviders.event;

	private _authenticationProviders: Map<string, IAuthenticationProvider> = new Map<string, IAuthenticationProvider>();
	private _authenticationProviderDisposables: DisposableMap<string, IDisposable> = this._register(new DisposableMap<string, IDisposable>());

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IAuthenticationAccessService authenticationAccessService: IAuthenticationAccessService,
		@IBrowserWorkbenchEnvironmentService private readonly _environmentService: IBrowserWorkbenchEnvironmentService
	) {
		super();

		this._register(authenticationAccessService.onDidChangeExtensionSessionAccess(e => {
			// The access has changed, not the actual session itself but extensions depend on this event firing
			// when they have gained access to an account so this fires that event.
			this._onDidChangeSessions.fire({
				providerId: e.providerId,
				label: e.accountName,
				event: {
					added: [],
					changed: [],
					removed: []
				}
			});
		}));

		this._registerEnvContributedAuthenticationProviders();
	}

	private _declaredProviders: AuthenticationProviderInformation[] = [];
	get declaredProviders(): AuthenticationProviderInformation[] {
		return this._declaredProviders;
	}

	private _registerEnvContributedAuthenticationProviders(): void {
		if (!this._environmentService.options?.authenticationProviders?.length) {
			return;
		}
		for (const provider of this._environmentService.options.authenticationProviders) {
			this.registerAuthenticationProvider(provider.id, provider);
		}
	}

	registerDeclaredAuthenticationProvider(provider: AuthenticationProviderInformation): void {
		if (isFalsyOrWhitespace(provider.id)) {
			throw new Error(localize('authentication.missingId', 'An authentication contribution must specify an id.'));
		}
		if (isFalsyOrWhitespace(provider.label)) {
			throw new Error(localize('authentication.missingLabel', 'An authentication contribution must specify a label.'));
		}
		if (this.declaredProviders.some(p => p.id === provider.id)) {
			throw new Error(localize('authentication.idConflict', "This authentication id '{0}' has already been registered", provider.id));
		}
		this._declaredProviders.push(provider);
		this._onDidChangeDeclaredProviders.fire();
	}

	unregisterDeclaredAuthenticationProvider(id: string): void {
		const index = this.declaredProviders.findIndex(provider => provider.id === id);
		if (index > -1) {
			this.declaredProviders.splice(index, 1);
		}
		this._onDidChangeDeclaredProviders.fire();
	}

	isAuthenticationProviderRegistered(id: string): boolean {
		return this._authenticationProviders.has(id);
	}

	registerAuthenticationProvider(id: string, authenticationProvider: IAuthenticationProvider): void {
		this._authenticationProviders.set(id, authenticationProvider);
		const disposableStore = new DisposableStore();
		disposableStore.add(authenticationProvider.onDidChangeSessions(e => this._onDidChangeSessions.fire({
			providerId: id,
			label: authenticationProvider.label,
			event: e
		})));
		if (isDisposable(authenticationProvider)) {
			disposableStore.add(authenticationProvider);
		}
		this._authenticationProviderDisposables.set(id, disposableStore);
		this._onDidRegisterAuthenticationProvider.fire({ id, label: authenticationProvider.label });
	}

	unregisterAuthenticationProvider(id: string): void {
		const provider = this._authenticationProviders.get(id);
		if (provider) {
			this._authenticationProviders.delete(id);
			this._onDidUnregisterAuthenticationProvider.fire({ id, label: provider.label });
		}
		this._authenticationProviderDisposables.deleteAndDispose(id);
	}

	getProviderIds(): string[] {
		const providerIds: string[] = [];
		this._authenticationProviders.forEach(provider => {
			providerIds.push(provider.id);
		});
		return providerIds;
	}

	getProvider(id: string): IAuthenticationProvider {
		if (this._authenticationProviders.has(id)) {
			return this._authenticationProviders.get(id)!;
		}
		throw new Error(`No authentication provider '${id}' is currently registered.`);
	}

	async getAccounts(id: string): Promise<ReadonlyArray<AuthenticationSessionAccount>> {
		// TODO: Cache this
		const sessions = await this.getSessions(id);
		const accounts = new Array<AuthenticationSessionAccount>();
		const seenAccounts = new Set<string>();
		for (const session of sessions) {
			if (!seenAccounts.has(session.account.label)) {
				seenAccounts.add(session.account.label);
				accounts.push(session.account);
			}
		}
		return accounts;
	}

	async getSessions(id: string, scopes?: string[], account?: AuthenticationSessionAccount, activateImmediate: boolean = false): Promise<ReadonlyArray<AuthenticationSession>> {
		const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, activateImmediate);
		if (authProvider) {
			return await authProvider.getSessions(scopes, { account });
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async createSession(id: string, scopes: string[], options?: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession> {
		const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, !!options?.activateImmediate);
		if (authProvider) {
			return await authProvider.createSession(scopes, {
				account: options?.account
			});
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async removeSession(id: string, sessionId: string): Promise<void> {
		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.removeSession(sessionId);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	private async tryActivateProvider(providerId: string, activateImmediate: boolean): Promise<IAuthenticationProvider> {
		await this._extensionService.activateByEvent(getAuthenticationProviderActivationEvent(providerId), activateImmediate ? ActivationKind.Immediate : ActivationKind.Normal);
		let provider = this._authenticationProviders.get(providerId);
		if (provider) {
			return provider;
		}

		const store = new DisposableStore();

		// When activate has completed, the extension has made the call to `registerAuthenticationProvider`.
		// However, activate cannot block on this, so the renderer may not have gotten the event yet.
		const didRegister: Promise<IAuthenticationProvider> = new Promise((resolve, _) => {
			store.add(Event.once(this.onDidRegisterAuthenticationProvider)(e => {
				if (e.id === providerId) {
					provider = this._authenticationProviders.get(providerId);
					if (provider) {
						resolve(provider);
					} else {
						throw new Error(`No authentication provider '${providerId}' is currently registered.`);
					}
				}
			}));
		});

		const didTimeout: Promise<IAuthenticationProvider> = new Promise((_, reject) => {
			const handle = setTimeout(() => {
				reject('Timed out waiting for authentication provider to register');
			}, 5000);

			store.add(toDisposable(() => clearTimeout(handle)));
		});

		return Promise.race([didRegister, didTimeout]).finally(() => store.dispose());
	}
}

registerSingleton(IAuthenticationService, AuthenticationService, InstantiationType.Delayed);
