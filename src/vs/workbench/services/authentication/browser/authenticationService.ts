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
import { AuthenticationProviderInformation, AuthenticationSession, AuthenticationSessionAccount, AuthenticationSessionsChangeEvent, IAuthenticationCreateSessionOptions, IAuthenticationGetSessionsOptions, IAuthenticationProvider, IAuthenticationProviderHostDelegate, IAuthenticationService, IAuthenticationSessionRequest, isAuthenticationSessionRequest } from '../common/authentication.js';
import { IBrowserWorkbenchEnvironmentService } from '../../environment/browser/environmentService.js';
import { ActivationKind, IExtensionService } from '../../extensions/common/extensions.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IJSONSchema } from '../../../../base/common/jsonSchema.js';
import { ExtensionsRegistry } from '../../extensions/common/extensionsRegistry.js';
import { match } from '../../../../base/common/glob.js';
import { URI } from '../../../../base/common/uri.js';
import { IAuthorizationProtectedResourceMetadata, IAuthorizationServerMetadata, parseWWWAuthenticateHeader } from '../../../../base/common/oauth.js';
import { raceCancellation, raceTimeout } from '../../../../base/common/async.js';
import { CancellationTokenSource } from '../../../../base/common/cancellation.js';

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

const authenticationDefinitionSchema: IJSONSchema = {
	type: 'object',
	additionalProperties: false,
	properties: {
		id: {
			type: 'string',
			description: localize('authentication.id', 'The id of the authentication provider.')
		},
		label: {
			type: 'string',
			description: localize('authentication.label', 'The human readable name of the authentication provider.'),
		},
		authorizationServerGlobs: {
			type: 'array',
			items: {
				type: 'string',
				description: localize('authentication.authorizationServerGlobs', 'A list of globs that match the authorization servers that this provider supports.'),
			},
			description: localize('authentication.authorizationServerGlobsDescription', 'A list of globs that match the authorization servers that this provider supports.')
		}
	}
};

const authenticationExtPoint = ExtensionsRegistry.registerExtensionPoint<AuthenticationProviderInformation[]>({
	extensionPoint: 'authentication',
	jsonSchema: {
		description: localize({ key: 'authenticationExtensionPoint', comment: [`'Contributes' means adds here`] }, 'Contributes authentication'),
		type: 'array',
		items: authenticationDefinitionSchema
	},
	activationEventsGenerator: (authenticationProviders, result) => {
		for (const authenticationProvider of authenticationProviders) {
			if (authenticationProvider.id) {
				result.push(`onAuthenticationRequest:${authenticationProvider.id}`);
			}
		}
	}
});

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
	private _dynamicAuthenticationProviderIds = new Set<string>();

	private readonly _delegates: IAuthenticationProviderHostDelegate[] = [];

	private _disposedSource = new CancellationTokenSource();

	constructor(
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IAuthenticationAccessService authenticationAccessService: IAuthenticationAccessService,
		@IBrowserWorkbenchEnvironmentService private readonly _environmentService: IBrowserWorkbenchEnvironmentService,
		@ILogService private readonly _logService: ILogService
	) {
		super();
		this._register(toDisposable(() => this._disposedSource.dispose(true)));
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
		this._registerAuthenticationExtentionPointHandler();
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
			this.registerDeclaredAuthenticationProvider(provider);
			this.registerAuthenticationProvider(provider.id, provider);
		}
	}

	private _registerAuthenticationExtentionPointHandler(): void {
		this._register(authenticationExtPoint.setHandler((_extensions, { added, removed }) => {
			this._logService.debug(`Found authentication providers. added: ${added.length}, removed: ${removed.length}`);
			added.forEach(point => {
				for (const provider of point.value) {
					if (isFalsyOrWhitespace(provider.id)) {
						point.collector.error(localize('authentication.missingId', 'An authentication contribution must specify an id.'));
						continue;
					}

					if (isFalsyOrWhitespace(provider.label)) {
						point.collector.error(localize('authentication.missingLabel', 'An authentication contribution must specify a label.'));
						continue;
					}

					if (!this.declaredProviders.some(p => p.id === provider.id)) {
						this.registerDeclaredAuthenticationProvider(provider);
						this._logService.debug(`Declared authentication provider: ${provider.id}`);
					} else {
						point.collector.error(localize('authentication.idConflict', "This authentication id '{0}' has already been registered", provider.id));
					}
				}
			});

			const removedExtPoints = removed.flatMap(r => r.value);
			removedExtPoints.forEach(point => {
				const provider = this.declaredProviders.find(provider => provider.id === point.id);
				if (provider) {
					this.unregisterDeclaredAuthenticationProvider(provider.id);
					this._logService.debug(`Undeclared authentication provider: ${provider.id}`);
				}
			});
		}));
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

	isDynamicAuthenticationProvider(id: string): boolean {
		return this._dynamicAuthenticationProviderIds.has(id);
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
			// If this is a dynamic provider, remove it from the set of dynamic providers
			if (this._dynamicAuthenticationProviderIds.has(id)) {
				this._dynamicAuthenticationProviderIds.delete(id);
			}
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

	async getSessions(id: string, scopeListOrRequest?: ReadonlyArray<string> | IAuthenticationSessionRequest, options?: IAuthenticationGetSessionsOptions, activateImmediate: boolean = false): Promise<ReadonlyArray<AuthenticationSession>> {
		if (this._disposedSource.token.isCancellationRequested) {
			return [];
		}

		const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, activateImmediate);
		if (authProvider) {
			// Check if the authorization server is in the list of supported authorization servers
			if (options?.authorizationServer) {
				const authServerStr = options.authorizationServer.toString(true);
				// TODO: something is off here...
				if (!authProvider.authorizationServers?.some(i => i.toString(true) === authServerStr || match(i.toString(true), authServerStr))) {
					throw new Error(`The authorization server '${authServerStr}' is not supported by the authentication provider '${id}'.`);
				}
			}
			if (isAuthenticationSessionRequest(scopeListOrRequest)) {
				if (!authProvider.getSessionsFromChallenges) {
					throw new Error(`The authentication provider '${id}' does not support getting sessions from challenges.`);
				}
				return await authProvider.getSessionsFromChallenges(
					{ challenges: parseWWWAuthenticateHeader(scopeListOrRequest.challenge), scopes: scopeListOrRequest.scopes },
					{ ...options }
				);
			}
			return await authProvider.getSessions(scopeListOrRequest ? [...scopeListOrRequest] : undefined, { ...options });
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async createSession(id: string, scopeListOrRequest: ReadonlyArray<string> | IAuthenticationSessionRequest, options?: IAuthenticationCreateSessionOptions): Promise<AuthenticationSession> {
		if (this._disposedSource.token.isCancellationRequested) {
			throw new Error('Authentication service is disposed.');
		}

		const authProvider = this._authenticationProviders.get(id) || await this.tryActivateProvider(id, !!options?.activateImmediate);
		if (authProvider) {
			if (isAuthenticationSessionRequest(scopeListOrRequest)) {
				if (!authProvider.createSessionFromChallenges) {
					throw new Error(`The authentication provider '${id}' does not support creating sessions from challenges.`);
				}
				return await authProvider.createSessionFromChallenges(
					{ challenges: parseWWWAuthenticateHeader(scopeListOrRequest.challenge), scopes: scopeListOrRequest.scopes },
					{ ...options }
				);
			}
			return await authProvider.createSession([...scopeListOrRequest], { ...options });
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async removeSession(id: string, sessionId: string): Promise<void> {
		if (this._disposedSource.token.isCancellationRequested) {
			throw new Error('Authentication service is disposed.');
		}

		const authProvider = this._authenticationProviders.get(id);
		if (authProvider) {
			return authProvider.removeSession(sessionId);
		} else {
			throw new Error(`No authentication provider '${id}' is currently registered.`);
		}
	}

	async getOrActivateProviderIdForServer(authorizationServer: URI): Promise<string | undefined> {
		for (const provider of this._authenticationProviders.values()) {
			if (provider.authorizationServers?.some(i => i.toString(true) === authorizationServer.toString(true) || match(i.toString(true), authorizationServer.toString(true)))) {
				return provider.id;
			}
		}

		const authServerStr = authorizationServer.toString(true);
		const providers = this._declaredProviders
			// Only consider providers that are not already registered since we already checked them
			.filter(p => !this._authenticationProviders.has(p.id))
			.filter(p => !!p.authorizationServerGlobs?.some(i => match(i, authServerStr)));
		// TODO:@TylerLeonhardt fan out?
		for (const provider of providers) {
			const activeProvider = await this.tryActivateProvider(provider.id, true);
			// Check the resolved authorization servers
			if (activeProvider.authorizationServers?.some(i => match(i.toString(true), authServerStr))) {
				return activeProvider.id;
			}
		}
		return undefined;
	}

	async createDynamicAuthenticationProvider(authorizationServer: URI, serverMetadata: IAuthorizationServerMetadata, resource: IAuthorizationProtectedResourceMetadata | undefined): Promise<IAuthenticationProvider | undefined> {
		const delegate = this._delegates[0];
		if (!delegate) {
			this._logService.error('No authentication provider host delegate found');
			return undefined;
		}
		const providerId = await delegate.create(authorizationServer, serverMetadata, resource);
		const provider = this._authenticationProviders.get(providerId);
		if (provider) {
			this._logService.debug(`Created dynamic authentication provider: ${providerId}`);
			this._dynamicAuthenticationProviderIds.add(providerId);
			return provider;
		}
		this._logService.error(`Failed to create dynamic authentication provider: ${providerId}`);
		return undefined;
	}

	registerAuthenticationProviderHostDelegate(delegate: IAuthenticationProviderHostDelegate): IDisposable {
		this._delegates.push(delegate);
		this._delegates.sort((a, b) => b.priority - a.priority);

		return {
			dispose: () => {
				const index = this._delegates.indexOf(delegate);
				if (index !== -1) {
					this._delegates.splice(index, 1);
				}
			}
		};
	}

	private async tryActivateProvider(providerId: string, activateImmediate: boolean): Promise<IAuthenticationProvider> {
		await this._extensionService.activateByEvent(getAuthenticationProviderActivationEvent(providerId), activateImmediate ? ActivationKind.Immediate : ActivationKind.Normal);
		let provider = this._authenticationProviders.get(providerId);
		if (provider) {
			return provider;
		}
		if (this._disposedSource.token.isCancellationRequested) {
			throw new Error('Authentication service is disposed.');
		}

		const store = new DisposableStore();
		try {
			const result = await raceTimeout(
				raceCancellation(
					Event.toPromise(
						Event.filter(
							this.onDidRegisterAuthenticationProvider,
							e => e.id === providerId,
							store
						),
						store
					),
					this._disposedSource.token
				),
				5000
			);
			if (!result) {
				throw new Error(`Timed out waiting for authentication provider '${providerId}' to register.`);
			}
			provider = this._authenticationProviders.get(result.id);
			if (provider) {
				return provider;
			}
			throw new Error(`No authentication provider '${providerId}' is currently registered.`);
		} finally {
			store.dispose();
		}
	}
}

registerSingleton(IAuthenticationService, AuthenticationService, InstantiationType.Delayed);
