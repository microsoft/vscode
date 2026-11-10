/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createDecorator } from '../../instantiation/common/instantiation.js';
import type { IDisposable } from '../../../base/common/lifecycle.js';
import type { AuthenticateParams } from './agent.js';
import type { AgentInfo } from './state/sessionState.js';

export const IAgentHostAdvertisedAuthenticationResolver = createDecorator<IAgentHostAdvertisedAuthenticationResolver>('agentHostAdvertisedAuthenticationResolver');

/** Resolves existing credentials without prompting or sending requests to the connection. */
export interface IAgentHostAdvertisedAuthenticationResolver {
	readonly _serviceBrand: undefined;
	/** Tracks startup session removals until the contribution attaches or the client disposes. */
	createResolver(address: string): IAgentHostAdvertisedAuthentication;
	/** Transfers recorded removals to the connection's normal authentication driver. */
	takePendingSessionRemovals(address: string): readonly IAgentHostAuthenticationSessionRemoval[];
}

export interface IAgentHostAdvertisedAuthentication extends IDisposable {
	resolve(agents: readonly AgentInfo[]): Promise<readonly AuthenticateParams[]>;
}

/** Session identity and granted scopes suffice to reconcile a removal without retaining its token. */
export interface IAgentHostAuthenticationSessionRemoval {
	readonly providerId: string;
	readonly sessions: readonly { readonly id: string; readonly scopes: readonly string[] }[];
}

/** A declared authentication provider has not finished starting. */
export class AgentHostAuthenticationPendingError extends Error {
	constructor(resource: string) {
		super(`Authentication provider is not ready for resource: ${resource}`);
		this.name = 'AgentHostAuthenticationPendingError';
	}
}
