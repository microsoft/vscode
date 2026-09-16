/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { disposableTimeout } from '../../../base/common/async.js';
import { getExpirationTime, isExpired } from '../../../base/common/date.js';
import { Disposable, DisposableStore, MutableDisposable, toDisposable, type IDisposable } from '../../../base/common/lifecycle.js';
import { autorun, observableValue, type IObservable, type ISettableObservable } from '../../../base/common/observable.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { AuthenticateParams } from '../common/agent.js';
import { AgentHostTunnelAuthenticationIssuer, createAgentHostTunnelProtectedResources, getAgentHostTunnelAuthenticationIssuer, isAgentHostTunnelProtectedResource, type AgentHostTunnelAuthenticationProviders } from '../common/agentHostFeatureAuthentication.js';
import { AuthRequiredReason, type AuthRequiredParams } from '../common/state/sessionActions.js';
import type { ProtectedResourceMetadata } from '../common/state/protocol/state.js';
import type { IAgentHostRemoteAgentsActivationContext, IAgentHostRemoteAgentsContribution } from './agentHostRemoteAgentsService.js';

const MAXIMUM_EXPIRY_TIMEOUT = 0x7FFFFFFF;

export interface IAgentHostFeatureAuthenticationResult {
	readonly handled: boolean;
	readonly authenticated: boolean;
}

export interface IAgentHostFeatureAuthenticationCredential {
	readonly issuer: AgentHostTunnelAuthenticationIssuer;
	readonly scopes: readonly string[];
	readonly token: string;
	readonly expiresAt: number | undefined;
}

export const IAgentHostFeatureAuthenticationRegistry = createDecorator<IAgentHostFeatureAuthenticationRegistry>('agentHostFeatureAuthenticationRegistry');

export interface IAgentHostFeatureAuthenticationRegistry {
	readonly _serviceBrand: undefined;
	readonly requirements: IObservable<readonly Omit<AuthRequiredParams, 'channel'>[]>;
	readonly credential: IObservable<IAgentHostFeatureAuthenticationCredential | undefined>;
	authenticate(params: AuthenticateParams): IAgentHostFeatureAuthenticationResult;
}

export class AgentHostFeatureAuthenticationRegistry extends Disposable implements IAgentHostFeatureAuthenticationRegistry, IAgentHostRemoteAgentsContribution {
	declare readonly _serviceBrand: undefined;

	private readonly _resources: readonly ProtectedResourceMetadata[];
	private readonly _resourcesByIssuer: ReadonlyMap<AgentHostTunnelAuthenticationIssuer, ProtectedResourceMetadata>;

	private readonly _requirements: ISettableObservable<readonly Omit<AuthRequiredParams, 'channel'>[]> = observableValue(this, []);
	readonly requirements: IObservable<readonly Omit<AuthRequiredParams, 'channel'>[]> = this._requirements;

	private readonly _credential: ISettableObservable<IAgentHostFeatureAuthenticationCredential | undefined> = observableValue(this, undefined);
	readonly credential: IObservable<IAgentHostFeatureAuthenticationCredential | undefined> = this._credential;

	private readonly _expiryTimer = this._register(new MutableDisposable<IDisposable>());
	private _activation: object | undefined;
	private _tunnelDiscoveryEnabled = false;
	private _missingReason = AuthRequiredReason.Required;

	constructor(authenticationProviders: AgentHostTunnelAuthenticationProviders | undefined) {
		super();
		this._resources = createAgentHostTunnelProtectedResources(authenticationProviders);
		this._resourcesByIssuer = new Map(this._resources.map(resource => {
			const issuer = getAgentHostTunnelAuthenticationIssuer(resource.resource);
			if (!issuer) {
				throw new Error(`Unknown tunnel authentication resource: ${resource.resource}`);
			}
			return [issuer, resource];
		}));
	}

	activate(context: IAgentHostRemoteAgentsActivationContext): IDisposable {
		if (this._activation) {
			throw new Error('Host-feature authentication is already active.');
		}
		const activation = {};
		this._activation = activation;
		const store = new DisposableStore();
		store.add(autorun(reader => {
			this._tunnelDiscoveryEnabled = context.tunnelDiscoveryEnabled.read(reader);
			this._refreshRequirements();
		}));
		store.add(context.cancellationToken.onCancellationRequested(() => this._deactivate(activation)));
		return toDisposable(() => {
			store.dispose();
			this._deactivate(activation);
		});
	}

	authenticate(params: AuthenticateParams): IAgentHostFeatureAuthenticationResult {
		const issuer = getAgentHostTunnelAuthenticationIssuer(params.resource);
		const resource = issuer ? this._resourcesByIssuer.get(issuer) : undefined;
		if (!issuer) {
			return { handled: isAgentHostTunnelProtectedResource(params.resource), authenticated: false };
		}
		if (!resource) {
			return { handled: true, authenticated: false };
		}
		if (!this._activation) {
			return { handled: true, authenticated: false };
		}

		const current = this._credential.get();
		if (!params.token) {
			if (current && current.issuer !== issuer) {
				return { handled: true, authenticated: false };
			}
			this._clearCredential(AuthRequiredReason.Expired);
			return { handled: true, authenticated: true };
		}
		if (!this._tunnelDiscoveryEnabled) {
			return { handled: true, authenticated: false };
		}
		if (current && current.issuer !== issuer) {
			return { handled: true, authenticated: false };
		}
		if (!this._hasRequiredScopes(resource, params.scopes)) {
			return { handled: true, authenticated: false };
		}
		if (params.expiresIn !== undefined && (!Number.isInteger(params.expiresIn) || params.expiresIn <= 0)) {
			return { handled: true, authenticated: false };
		}

		const credential: IAgentHostFeatureAuthenticationCredential = {
			issuer,
			scopes: resource.scopes_supported ?? [],
			token: params.token,
			expiresAt: getExpirationTime(params.expiresIn),
		};
		this._credential.set(credential, undefined);
		this._missingReason = AuthRequiredReason.Required;
		this._refreshRequirements();
		this._scheduleExpiry(credential);
		return { handled: true, authenticated: true };
	}

	private _hasRequiredScopes(resource: ProtectedResourceMetadata, grantedScopes: readonly string[] | undefined): boolean {
		if (grantedScopes === undefined) {
			return true;
		}
		const granted = new Set(grantedScopes);
		return (resource.scopes_supported ?? []).every(scope => granted.has(scope));
	}

	private _scheduleExpiry(credential: IAgentHostFeatureAuthenticationCredential): void {
		this._expiryTimer.clear();
		if (credential.expiresAt === undefined) {
			return;
		}
		const remaining = credential.expiresAt - Date.now();
		if (remaining <= 0) {
			this._expireCredential(credential);
			return;
		}
		this._expiryTimer.value = disposableTimeout(
			() => this._expireCredential(credential),
			Math.min(remaining, MAXIMUM_EXPIRY_TIMEOUT),
		);
	}

	private _expireCredential(credential: IAgentHostFeatureAuthenticationCredential): void {
		if (this._credential.get() !== credential) {
			return;
		}
		if (!isExpired(credential.expiresAt)) {
			this._scheduleExpiry(credential);
			return;
		}
		this._clearCredential(AuthRequiredReason.Expired);
	}

	private _clearCredential(reason: AuthRequiredReason): void {
		this._expiryTimer.clear();
		this._missingReason = reason;
		if (this._credential.get() !== undefined) {
			this._credential.set(undefined, undefined);
		}
		this._refreshRequirements();
	}

	private _refreshRequirements(): void {
		const requirements = this._activation && this._tunnelDiscoveryEnabled && !this._credential.get()
			? this._resources.map(resource => ({ resource, reason: this._missingReason }))
			: [];
		const current = this._requirements.get();
		if (current.length === requirements.length && current.every((requirement, index) =>
			requirement.resource === requirements[index].resource && requirement.reason === requirements[index].reason)) {
			return;
		}
		this._requirements.set(requirements, undefined);
	}

	private _deactivate(activation: object): void {
		if (this._activation !== activation) {
			return;
		}
		this._activation = undefined;
		this._tunnelDiscoveryEnabled = false;
		this._missingReason = AuthRequiredReason.Required;
		this._expiryTimer.clear();
		if (this._credential.get() !== undefined) {
			this._credential.set(undefined, undefined);
		}
		this._refreshRequirements();
	}

	override dispose(): void {
		const activation = this._activation;
		if (activation) {
			this._deactivate(activation);
		}
		this._expiryTimer.clear();
		super.dispose();
	}
}
