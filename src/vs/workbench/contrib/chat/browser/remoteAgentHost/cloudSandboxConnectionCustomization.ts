/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../../base/common/event.js';
import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { AgentHostProtocolClient } from '../../../../../platform/agentHost/browser/agentHostProtocolClient.js';
import { AuthRequiredReason } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import {
	CLOUD_SANDBOX_ADDRESS_PREFIX,
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CLOUD_SANDBOX_SESSION_SCHEME,
	cloudSandboxEnvironmentId,
	ICloudSandboxAgentHostService,
	isCloudSandboxSealedToken,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IAgentHostAuthenticateRequest } from '../agentSessions/agentHost/agentHostAuth.js';
import { IRemoteAgentHostConnectionCustomization } from './remoteAgentHostConnectionCustomization.js';
import { createCloudSandboxSessionPreparation } from './cloudSandboxLegacySessionPreparation.js';

/** Hosts whose protected resources may receive the user's GitHub identity token. */
function isGitHubResource(resource: string): boolean {
	let host: string;
	try {
		host = new URL(resource).hostname.toLowerCase();
	} catch {
		return false;
	}
	return host === 'github.com'
		|| host.endsWith('.github.com')
		|| host === 'githubcopilot.com'
		|| host.endsWith('.githubcopilot.com')
		|| host.endsWith('.ghe.com');
}

/**
 * The {@link IRemoteAgentHostConnectionCustomization} for a cloud sandbox address, supplying the
 * ways the sandbox host deviates from the generic path:
 *
 *  - **Auth**: managed sandboxes receive the connection's sealed GitHub token. User-local hosts
 *    receive an identity-only token sealed at protocol dispatch against a trusted recipient and
 *    the current connection challenge.
 *  - **Scheme**: the host advertises provider `copilot` but addresses sessions as `ahp-session`.
 *  - **Directory**: prepare an advertised repository checkout before creating a session.
 *
 * Returns `undefined` for non-sandbox addresses.
 */
export function createCloudSandboxConnectionCustomization(
	address: string,
	sandboxService: ICloudSandboxAgentHostService,
	userLocal = false,
): IRemoteAgentHostConnectionCustomization | undefined {
	const environmentId = cloudSandboxEnvironmentId(address);
	if (environmentId === undefined) {
		return undefined;
	}
	const resolveAuthentication = async (resource: string, scopes: readonly string[] | undefined, renew: boolean): Promise<IAgentHostAuthenticateRequest> => {
		if (!isGitHubResource(resource)) {
			throw new Error(`Cloud sandbox cannot authenticate the non-GitHub resource '${resource}'.`);
		}
		if (userLocal) {
			return { ...await sandboxService.resolveUserLocalAuthentication(environmentId, resource, renew), scopes };
		}
		const sealed = renew
			? await sandboxService.refreshSealedGitHubToken(environmentId)
			: sandboxService.getSealedGitHubToken(environmentId);
		if (!sealed || !isCloudSandboxSealedToken(sealed)) {
			throw new Error(`No sealed GitHub token is available for cloud sandbox ${address}; refusing to forward a plaintext bearer.`);
		}
		return { resource, scopes, token: sealed };
	};
	return {
		requiresWorkspaceTrust: false,
		authenticate: async (request: IAgentHostAuthenticateRequest, reason?: AuthRequiredReason): Promise<IAgentHostAuthenticateRequest> => {
			if (reason !== AuthRequiredReason.Expired && isCloudSandboxSealedToken(request.token)) {
				return request;
			}
			if (userLocal && (request.target || !isGitHubResource(request.resource))) {
				return request;
			}
			const authentication = await resolveAuthentication(request.resource, request.scopes, reason === AuthRequiredReason.Expired);
			return request.target ? { ...authentication, target: request.target } : authentication;
		},
		renewAuthentication: userLocal ? undefined : resource => resolveAuthentication(resource.resource, resource.scopes_supported, true),
		backendSessionScheme: (provider: string): string | undefined =>
			provider === CLOUD_SANDBOX_AGENT_PROVIDER || (userLocal && provider === 'copilotcli') ? CLOUD_SANDBOX_SESSION_SCHEME : undefined,
		retainConsumedSteeringMessages: provider => !userLocal && provider === CLOUD_SANDBOX_AGENT_PROVIDER,
		createSessionPreparation: userLocal ? undefined : (connection, owner) => {
			if (!(connection instanceof AgentHostProtocolClient)) {
				throw new Error('Cloud sandbox session preparation requires a protocol client.');
			}
			const store = owner.add(new DisposableStore());
			store.add(Event.once(connection.onDidClose)(() => store.dispose()));
			return createCloudSandboxSessionPreparation(
				connection.rootState,
				(method, params) => connection.sendHostExtensionRequest(method, params),
				store,
			);
		},
	};
}

/** Whether a remote-agent-host connection address identifies a cloud sandbox environment. */
export function isCloudSandboxConnectionAddress(address: string): boolean {
	return address.startsWith(CLOUD_SANDBOX_ADDRESS_PREFIX);
}
