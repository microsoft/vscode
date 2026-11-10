/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { authenticationAccountId, readAuthenticationAccount } from './vscode/agentAuthenticationAccount.js';

export { authenticationAccountId, authenticationAccountMeta, readAuthenticationAccount } from './vscode/agentAuthenticationAccount.js';
export type { IAgentAuthenticationAccount } from './vscode/agentAuthenticationAccount.js';

/** Reads the standard selection hint, falling back to legacy provenance only when it is absent. */
export function readAuthenticationAccountId(source: { readonly accountId?: unknown; readonly _meta?: Record<string, unknown> }): string | undefined {
	if (source.accountId !== undefined) {
		return typeof source.accountId === 'string' && source.accountId.length > 0 ? source.accountId : undefined;
	}
	return authenticationAccountId(readAuthenticationAccount(source));
}
