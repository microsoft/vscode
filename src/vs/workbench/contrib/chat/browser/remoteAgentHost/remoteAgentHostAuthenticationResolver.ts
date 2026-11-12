/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { getExpirationTime, getRemainingTimeInSeconds } from '../../../../../base/common/date.js';
import { IAgentHostAdvertisedAuthenticationResolver, type IAgentHostAdvertisedAuthentication, type IAgentHostAuthenticationSessionRemoval } from '../../../../../platform/agentHost/common/agentHostAdvertisedAuthentication.js';
import type { AuthenticateParams } from '../../../../../platform/agentHost/common/agent.js';
import type { AgentInfo } from '../../../../../platform/agentHost/common/state/sessionState.js';
import type { ProtectedResourceMetadata } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { IWorkbenchEnvironmentService } from '../../../../services/environment/common/environmentService.js';
import { IExtensionService } from '../../../../services/extensions/common/extensions.js';
import { IAuthenticationService } from '../../../../services/authentication/common/authentication.js';
import { resolveProtectedResourceAuthentication } from '../agentSessions/agentHost/agentHostAuth.js';
import { IRemoteAgentHostConnectionCustomizationService } from './remoteAgentHostConnectionCustomization.js';

export function getAgentHostScenarioAutomationToken(configurationService: IConfigurationService, enableSmokeTestDriver: boolean): string | undefined {
	if (!enableSmokeTestDriver) {
		return undefined;
	}
	const token = configurationService.getValue('chat.agentHost.unsafeTestToken');
	return typeof token === 'string' && token.length > 0 ? token : undefined;
}

/** Supplies required workbench credentials during a generic remote connection's handshake. */
export class RemoteAgentHostAuthenticationResolver implements IAgentHostAdvertisedAuthenticationResolver {
	declare readonly _serviceBrand: undefined;
	private readonly _pending = new Map<string, { readonly store: DisposableStore; readonly removals: Map<string, Map<string, { readonly id: string; readonly scopes: readonly string[] }>> }>();

	constructor(
		@IInstantiationService private readonly _instantiationService: IInstantiationService,
		@IExtensionService private readonly _extensionService: IExtensionService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
		@IWorkbenchEnvironmentService private readonly _environmentService: IWorkbenchEnvironmentService,
		@IRemoteAgentHostConnectionCustomizationService private readonly _customizations: IRemoteAgentHostConnectionCustomizationService,
		@IAuthenticationService private readonly _authenticationService: IAuthenticationService,
	) { }

	createResolver(address: string): IAgentHostAdvertisedAuthentication {
		const store = new DisposableStore();
		const pending = { store, removals: new Map<string, Map<string, { readonly id: string; readonly scopes: readonly string[] }>>() };
		this._pending.set(address, pending);
		store.add(toDisposable(() => {
			if (this._pending.get(address) === pending) {
				this._pending.delete(address);
			}
		}));
		if (getAgentHostScenarioAutomationToken(this._configurationService, !!this._environmentService.enableSmokeTestDriver) === undefined) {
			store.add(this._authenticationService.onDidChangeSessions(event => {
				for (const session of event.event.removed ?? []) {
					let sessions = pending.removals.get(event.providerId);
					if (!sessions) {
						sessions = new Map();
						pending.removals.set(event.providerId, sessions);
					}
					sessions.set(session.id, { id: session.id, scopes: [...session.scopes] });
				}
			}));
		}
		return { resolve: agents => this._resolve(address, agents), dispose: () => store.dispose() };
	}

	takePendingSessionRemovals(address: string): readonly IAgentHostAuthenticationSessionRemoval[] {
		const pending = this._pending.get(address);
		if (!pending) {
			return [];
		}
		const removals = [...pending.removals].map(([providerId, sessions]) => ({ providerId, sessions: [...sessions.values()] }));
		pending.store.dispose();
		return removals;
	}

	private async _resolve(address: string, agents: readonly AgentInfo[]): Promise<readonly AuthenticateParams[]> {
		if (!this._environmentService.isSessionsWindow || this._customizations.get(address)?.authenticate) {
			return [];
		}
		const resources = new Map<string, ProtectedResourceMetadata>();
		for (const agent of agents) {
			for (const resource of agent.protectedResources ?? []) {
				if (resource.required === false) {
					continue;
				}
				const key = JSON.stringify([resource.resource, [...new Set(resource.scopes_supported ?? [])].sort(), resource.authorization_servers ?? []]);
				resources.set(key, resource);
			}
		}
		if (resources.size === 0) {
			return [];
		}
		const testToken = getAgentHostScenarioAutomationToken(this._configurationService, !!this._environmentService.enableSmokeTestDriver);
		if (testToken !== undefined) {
			return [...resources.values()].map(resource => ({ resource: resource.resource, scopes: resource.scopes_supported ?? [], token: testToken }));
		}
		await this._extensionService.whenInstalledExtensionsRegistered();
		const requests: { readonly request: AuthenticateParams; readonly expiresAt: number | undefined }[] = [];
		for (const resource of resources.values()) {
			const request = await this._instantiationService.invokeFunction(resolveProtectedResourceAuthentication, resource, '[RemoteAgentHost]');
			if (request) {
				requests.push({ request, expiresAt: getExpirationTime(request.expiresIn) });
			}
		}
		return requests.map(({ request, expiresAt }) => expiresAt === undefined ? request : {
			...request,
			expiresIn: getRemainingTimeInSeconds(expiresAt) ?? 0,
		});
	}
}
