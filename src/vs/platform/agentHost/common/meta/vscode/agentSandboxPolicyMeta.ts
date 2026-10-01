/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const sandboxPolicyKey = 'vscode.sandboxPolicy';

/** The effective runtime and forwarded VS Code sandbox floor for one session, not a client preference. */
export interface ISessionSandboxPolicy {
	readonly enabled: boolean;
	readonly allowBypass?: boolean;
	readonly allowOutbound?: boolean;
	readonly failClosed?: boolean;
}

/** Missing or unsupported metadata carries no assertion about the host's policy. */
export function readSessionSandboxPolicy(source: { readonly _meta?: Record<string, unknown> } | undefined): ISessionSandboxPolicy | undefined {
	const value = source?._meta?.[sandboxPolicyKey];
	if (!isObject(value)) {
		return undefined;
	}
	const { enabled, allowBypass, allowOutbound, failClosed } = value as Record<string, unknown>;
	if (typeof enabled !== 'boolean' || (allowBypass !== undefined && typeof allowBypass !== 'boolean') || (allowOutbound !== undefined && typeof allowOutbound !== 'boolean') || (failClosed !== undefined && typeof failClosed !== 'boolean')) {
		return undefined;
	}
	return { enabled, ...(allowBypass !== undefined ? { allowBypass } : {}), ...(allowOutbound !== undefined ? { allowOutbound } : {}), ...(failClosed !== undefined ? { failClosed } : {}) };
}

export function withSessionSandboxPolicy(meta: Record<string, unknown> | undefined, policy: ISessionSandboxPolicy | undefined): Record<string, unknown> {
	return {
		...meta,
		[sandboxPolicyKey]: policy ? {
			enabled: policy.enabled,
			...(policy.allowBypass !== undefined ? { allowBypass: policy.allowBypass } : {}),
			...(policy.allowOutbound !== undefined ? { allowOutbound: policy.allowOutbound } : {}),
			...(policy.failClosed !== undefined ? { failClosed: policy.failClosed } : {}),
		} : undefined,
	};
}
