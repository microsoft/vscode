/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const sandboxPolicyKey = 'vscode.resolvedSandboxPolicy';

/** The runtime-resolved sandbox floor for one session, not a client preference. */
export interface ISessionSandboxPolicy {
	readonly enabled: boolean;
	readonly allowBypass?: boolean;
	readonly allowOutbound?: boolean;
	readonly allowLocalNetwork?: boolean;
	readonly allowDevToolAccess?: boolean;
	readonly sandboxMcpServers?: boolean;
	readonly sandboxLspServers?: boolean;
	readonly failClosed?: boolean;
}

/** Missing or unsupported metadata carries no assertion about the host's policy. */
export function readSessionSandboxPolicy(source: { readonly _meta?: Record<string, unknown> } | undefined): ISessionSandboxPolicy | undefined {
	const value = source?._meta?.[sandboxPolicyKey];
	if (!isObject(value)) {
		return undefined;
	}
	const { enabled, allowBypass, allowOutbound, allowLocalNetwork, allowDevToolAccess, sandboxMcpServers, sandboxLspServers, failClosed } = value as Record<string, unknown>;
	if (typeof enabled !== 'boolean' || (allowBypass !== undefined && typeof allowBypass !== 'boolean') || (allowOutbound !== undefined && typeof allowOutbound !== 'boolean') || (allowLocalNetwork !== undefined && typeof allowLocalNetwork !== 'boolean') || (allowDevToolAccess !== undefined && typeof allowDevToolAccess !== 'boolean') || (sandboxMcpServers !== undefined && typeof sandboxMcpServers !== 'boolean') || (sandboxLspServers !== undefined && typeof sandboxLspServers !== 'boolean') || (failClosed !== undefined && typeof failClosed !== 'boolean')) {
		return undefined;
	}
	return { enabled, ...(allowBypass !== undefined ? { allowBypass } : {}), ...(allowOutbound !== undefined ? { allowOutbound } : {}), ...(allowLocalNetwork !== undefined ? { allowLocalNetwork } : {}), ...(allowDevToolAccess !== undefined ? { allowDevToolAccess } : {}), ...(sandboxMcpServers !== undefined ? { sandboxMcpServers } : {}), ...(sandboxLspServers !== undefined ? { sandboxLspServers } : {}), ...(failClosed !== undefined ? { failClosed } : {}) };
}

export function withSessionSandboxPolicy(meta: Record<string, unknown> | undefined, policy: ISessionSandboxPolicy | undefined): Record<string, unknown> {
	const result: Record<string, unknown> = {
		...meta,
		[sandboxPolicyKey]: policy ? {
			enabled: policy.enabled,
			...(policy.allowBypass !== undefined ? { allowBypass: policy.allowBypass } : {}),
			...(policy.allowOutbound !== undefined ? { allowOutbound: policy.allowOutbound } : {}),
			...(policy.allowLocalNetwork !== undefined ? { allowLocalNetwork: policy.allowLocalNetwork } : {}),
			...(policy.allowDevToolAccess !== undefined ? { allowDevToolAccess: policy.allowDevToolAccess } : {}),
			...(policy.sandboxMcpServers !== undefined ? { sandboxMcpServers: policy.sandboxMcpServers } : {}),
			...(policy.sandboxLspServers !== undefined ? { sandboxLspServers: policy.sandboxLspServers } : {}),
			...(policy.failClosed !== undefined ? { failClosed: policy.failClosed } : {}),
		} : undefined,
	};
	delete result['vscode.sandboxPolicy'];
	return result;
}
