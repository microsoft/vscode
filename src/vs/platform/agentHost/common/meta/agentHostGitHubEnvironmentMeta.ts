/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { vBoolean, vObj, vOptionalProp, vString } from '../../../../base/common/validation.js';

/**
 * Present when a directly connected client can register the host as a GitHub environment with its own GitHub
 * credential. Its value is the host's current {@link IAgentHostGitHubEnvironmentStatus}.
 */
export const AgentHostGitHubEnvironmentCapabilityMetaKey = 'vscode.githubEnvironment';

/**
 * Whether, and by whom, an agent host is registered as a GitHub environment.
 */
export interface IAgentHostGitHubEnvironmentStatus {
	/** Identifies the host process. A new value means the host restarted and lost any client registration. */
	readonly instanceId: string;
	/** The registration made by a directly connected client, if any. */
	readonly registration?: {
		readonly accountId: string;
		readonly environmentId: string;
		readonly name: string;
	};
	/** Whether the host registered itself from its own configuration, which prevents client registrations. */
	readonly registeredByHost?: boolean;
}

export const agentHostGitHubEnvironmentStatusValidator = vObj({
	instanceId: vString(),
	registration: vOptionalProp(vObj({ accountId: vString(), environmentId: vString(), name: vString() })),
	registeredByHost: vOptionalProp(vBoolean()),
});

/**
 * Returns the GitHub environment status a host advertised in its initialize result, or `undefined` if it does
 * not support client registrations.
 */
export function getAgentHostGitHubEnvironmentStatus(result: { readonly _meta?: Readonly<Record<string, unknown>> } | undefined): IAgentHostGitHubEnvironmentStatus | undefined {
	const value = result?._meta?.[AgentHostGitHubEnvironmentCapabilityMetaKey];
	return value === undefined ? undefined : agentHostGitHubEnvironmentStatusValidator.validate(value).content;
}

export function supportsAgentHostGitHubEnvironment(result: { readonly _meta?: Readonly<Record<string, unknown>> } | undefined): boolean {
	return getAgentHostGitHubEnvironmentStatus(result) !== undefined;
}
