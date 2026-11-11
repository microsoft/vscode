/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject, isStringArray } from '../../../../../base/common/types.js';

const sandboxPolicyKey = 'vscode.resolvedSandboxPolicy';

/** The runtime-resolved sandbox floor for one session, not a client preference. */
export interface ISessionSandboxPolicy {
	readonly enabled: boolean;
	readonly allowBypass?: boolean;
	readonly allowOutbound?: boolean;
	readonly allowLocalNetwork?: boolean;
	readonly allowedHosts?: readonly string[];
	readonly blockedHosts?: readonly string[];
	readonly readwritePaths?: readonly string[];
	readonly readonlyPaths?: readonly string[];
	readonly deniedPaths?: readonly string[];
	readonly allowDevToolAccess?: boolean;
	readonly addCurrentWorkingDirectory?: boolean;
	readonly sandboxMcpServers?: boolean;
	readonly sandboxLspServers?: boolean;
	readonly authenticateGit?: boolean;
	readonly authenticateGh?: boolean;
	readonly failClosed?: boolean;
}

/** Reads trusted host policy metadata; missing or non-object metadata carries no policy assertion. */
export function readSessionSandboxPolicy(source: { readonly _meta?: Record<string, unknown> } | undefined): ISessionSandboxPolicy | undefined {
	const value = source?._meta?.[sandboxPolicyKey];
	if (!isObject(value)) {
		return undefined;
	}
	const { enabled, allowBypass, allowOutbound, allowLocalNetwork, allowedHosts, blockedHosts, readwritePaths, readonlyPaths, deniedPaths, allowDevToolAccess, addCurrentWorkingDirectory, sandboxMcpServers, sandboxLspServers, authenticateGit, authenticateGh, failClosed } = value as ISessionSandboxPolicy;
	return {
		enabled,
		...(allowBypass !== undefined ? { allowBypass } : {}),
		...(allowOutbound !== undefined ? { allowOutbound } : {}),
		...(allowLocalNetwork !== undefined ? { allowLocalNetwork } : {}),
		...(isStringArray(allowedHosts) ? { allowedHosts: [...allowedHosts] } : {}),
		...(isStringArray(blockedHosts) ? { blockedHosts: [...blockedHosts] } : {}),
		...(isStringArray(readwritePaths) ? { readwritePaths: [...readwritePaths] } : {}),
		...(isStringArray(readonlyPaths) ? { readonlyPaths: [...readonlyPaths] } : {}),
		...(isStringArray(deniedPaths) ? { deniedPaths: [...deniedPaths] } : {}),
		...(allowDevToolAccess !== undefined ? { allowDevToolAccess } : {}),
		...(typeof addCurrentWorkingDirectory === 'boolean' ? { addCurrentWorkingDirectory } : {}),
		...(sandboxMcpServers !== undefined ? { sandboxMcpServers } : {}),
		...(sandboxLspServers !== undefined ? { sandboxLspServers } : {}),
		...(authenticateGit !== undefined ? { authenticateGit } : {}),
		...(authenticateGh !== undefined ? { authenticateGh } : {}),
		...(failClosed !== undefined ? { failClosed } : {}),
	};
}

export function withSessionSandboxPolicy(meta: Record<string, unknown> | undefined, policy: ISessionSandboxPolicy | undefined): Record<string, unknown> {
	const result: Record<string, unknown> = {
		...meta,
		[sandboxPolicyKey]: policy ? {
			enabled: policy.enabled,
			...(policy.allowBypass !== undefined ? { allowBypass: policy.allowBypass } : {}),
			...(policy.allowOutbound !== undefined ? { allowOutbound: policy.allowOutbound } : {}),
			...(policy.allowLocalNetwork !== undefined ? { allowLocalNetwork: policy.allowLocalNetwork } : {}),
			...(policy.allowedHosts !== undefined ? { allowedHosts: [...policy.allowedHosts] } : {}),
			...(policy.blockedHosts !== undefined ? { blockedHosts: [...policy.blockedHosts] } : {}),
			...(policy.readwritePaths !== undefined ? { readwritePaths: [...policy.readwritePaths] } : {}),
			...(policy.readonlyPaths !== undefined ? { readonlyPaths: [...policy.readonlyPaths] } : {}),
			...(policy.deniedPaths !== undefined ? { deniedPaths: [...policy.deniedPaths] } : {}),
			...(policy.allowDevToolAccess !== undefined ? { allowDevToolAccess: policy.allowDevToolAccess } : {}),
			...(policy.addCurrentWorkingDirectory !== undefined ? { addCurrentWorkingDirectory: policy.addCurrentWorkingDirectory } : {}),
			...(policy.sandboxMcpServers !== undefined ? { sandboxMcpServers: policy.sandboxMcpServers } : {}),
			...(policy.sandboxLspServers !== undefined ? { sandboxLspServers: policy.sandboxLspServers } : {}),
			...(policy.authenticateGit !== undefined ? { authenticateGit: policy.authenticateGit } : {}),
			...(policy.authenticateGh !== undefined ? { authenticateGh: policy.authenticateGh } : {}),
			...(policy.failClosed !== undefined ? { failClosed: policy.failClosed } : {}),
		} : undefined,
	};
	delete result['vscode.sandboxPolicy'];
	return result;
}
