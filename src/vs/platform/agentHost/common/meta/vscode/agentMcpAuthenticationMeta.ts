/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const mcpAuthenticationIdentityKey = 'vscode.mcp.authenticationIdentity';

export interface IAgentMcpAuthenticationIdentity {
	readonly serverName: string;
	readonly clientId?: string;
}

export function readAgentMcpAuthenticationIdentity(source: { readonly _meta?: Record<string, unknown> }): IAgentMcpAuthenticationIdentity | undefined {
	const value = source._meta?.[mcpAuthenticationIdentityKey];
	if (!isObject(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.serverName !== 'string' || !raw.serverName ||
		(raw.clientId !== undefined && (typeof raw.clientId !== 'string' || !raw.clientId))) {
		return undefined;
	}
	return {
		serverName: raw.serverName,
		...(typeof raw.clientId === 'string' ? { clientId: raw.clientId } : {}),
	};
}

export function agentMcpAuthenticationIdentityMeta(identity: IAgentMcpAuthenticationIdentity): Record<string, unknown> {
	return { [mcpAuthenticationIdentityKey]: { ...identity } };
}
