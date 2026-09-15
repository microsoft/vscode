/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	CLOUD_SANDBOX_ADDRESS_PREFIX,
	CLOUD_SANDBOX_AGENT_PROVIDER,
	CLOUD_SANDBOX_SESSION_SCHEME,
	cloudSandboxEnvironmentId,
	ICloudSandboxAgentHostService,
	isCloudSandboxSealedToken,
} from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IAgentHostAuthenticateRequest } from '../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostAuth.js';
import { IRemoteAgentHostConnectionCustomization } from './remoteAgentHostConnectionCustomization.js';
import { CloudSandboxProjectResolver } from './cloudSandboxProjectResolver.js';

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

/** Adapts authentication, session identity and repository preparation for a cloud sandbox. */
export function createCloudSandboxConnectionCustomization(
	address: string,
	sandboxService: ICloudSandboxAgentHostService,
	projectResolver: CloudSandboxProjectResolver,
): IRemoteAgentHostConnectionCustomization | undefined {
	const environmentId = cloudSandboxEnvironmentId(address);
	if (environmentId === undefined) {
		return undefined;
	}
	return {
		authenticate: async (request: IAgentHostAuthenticateRequest): Promise<IAgentHostAuthenticateRequest> => {
			// Already sealed (e.g. re-sending a cached envelope) — forward as-is.
			if (isCloudSandboxSealedToken(request.token)) {
				return request;
			}
			// The sandbox host only accepts the sealed GitHub token for GitHub resources; there is no
			// per-resource sealing for other hosts over the sandbox relay today.
			if (!isGitHubResource(request.resource)) {
				throw new Error(`Cloud sandbox cannot authenticate the non-GitHub resource '${request.resource}'.`);
			}
			const sealed = sandboxService.getSealedGitHubToken(environmentId);
			if (!sealed || !isCloudSandboxSealedToken(sealed)) {
				throw new Error(`No sealed GitHub token is available for cloud sandbox ${address}; refusing to forward a plaintext bearer.`);
			}
			return { resource: request.resource, scopes: request.scopes, token: sealed };
		},
		backendSessionScheme: (provider: string): string | undefined =>
			provider === CLOUD_SANDBOX_AGENT_PROVIDER ? CLOUD_SANDBOX_SESSION_SCHEME : undefined,
		prepareWorkingDirectory: (connection, workingDirectory, token) => projectResolver.resolve(connection, workingDirectory, token),
	};
}

/** Whether a remote-agent-host connection address identifies a cloud sandbox environment. */
export function isCloudSandboxConnectionAddress(address: string): boolean {
	return address.startsWith(CLOUD_SANDBOX_ADDRESS_PREFIX);
}
