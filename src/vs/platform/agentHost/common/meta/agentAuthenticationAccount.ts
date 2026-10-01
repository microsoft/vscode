/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../base/common/types.js';

const authenticationAccountKey = 'vscode.authentication.account';

/** Optional client-selected account provenance, not an authorization or verified GitHub identity. */
export interface IAgentAuthenticationAccount {
	readonly providerId: string;
	readonly accountId: string;
	readonly authorizationServer?: string;
}

export function readAuthenticationAccount(source: { readonly _meta?: Record<string, unknown> }): IAgentAuthenticationAccount | undefined {
	const value = source._meta?.[authenticationAccountKey];
	if (!isObject(value)) {
		return undefined;
	}
	const raw = value as Record<string, unknown>;
	if (typeof raw.providerId !== 'string' || !raw.providerId
		|| typeof raw.accountId !== 'string' || !raw.accountId
		|| (raw.authorizationServer !== undefined && typeof raw.authorizationServer !== 'string')) {
		return undefined;
	}
	return {
		providerId: raw.providerId,
		accountId: raw.accountId,
		...(typeof raw.authorizationServer === 'string' ? { authorizationServer: raw.authorizationServer } : {}),
	};
}

export function authenticationAccountMeta(account: IAgentAuthenticationAccount): Record<string, unknown> {
	return { [authenticationAccountKey]: { ...account } };
}

export function authenticationAccountId(account: IAgentAuthenticationAccount | undefined): string | undefined {
	return account ? JSON.stringify([account.providerId, account.accountId, account.authorizationServer]) : undefined;
}
