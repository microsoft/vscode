/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { AccountInfo, AuthenticationResult, SilentFlowRequest } from '@azure/msal-node';

/** The tenant that personal Microsoft accounts (MSA) belong to. */
export const MSA_TID = '9188040d-6c67-4c5b-b112-36a304b66dad';
/** The tenant personal Microsoft accounts use when passing through to first-party apps. */
export const MSA_PASSTHRU_TID = 'f8cdef31-a31e-4b4a-93e4-5f571e91255a';

/**
 * The most work or school accounts a workbench probe asks tokens for. The probe runs inside the
 * provider's queue, so this bounds how long any other extension's request can wait behind it.
 */
export const MAX_PROBED_WORK_ACCOUNTS = 5;

/** The tenant an account was created in, from the `<objectId>.<tenantId>` form of its home account id. */
function homeTenantId(account: AccountInfo): string | undefined {
	return account.homeAccountId.split('.')[1];
}

/**
 * Picks the work or school accounts a workbench probe asks tokens for: one entry per account,
 * personal Microsoft accounts left out, at most {@link MAX_PROBED_WORK_ACCOUNTS}.
 *
 * MSAL lists an account once per tenant it has a profile in, for example once for its home tenant
 * and once for each tenant it is a guest in. The home-tenant entry is kept, because that is the
 * identity the account's organization manages.
 */
export function selectWorkAccountsToProbe(accounts: readonly AccountInfo[]): AccountInfo[] {
	const selected = new Map<string, AccountInfo>();
	for (const account of accounts) {
		const home = homeTenantId(account);
		if (home === MSA_TID || home === MSA_PASSTHRU_TID) {
			continue;
		}
		if (!selected.has(account.homeAccountId) || account.tenantId === home) {
			selected.set(account.homeAccountId, account);
		}
	}
	return [...selected.values()].slice(0, MAX_PROBED_WORK_ACCOUNTS);
}

/** The part of a public client application a probe needs. */
export interface ISilentTokenClient {
	getAllAccounts(): Promise<AccountInfo[]>;
	acquireTokenSilent(request: SilentFlowRequest): Promise<AuthenticationResult>;
}

/**
 * Asks for a token for every account at once, without ever involving the user. An account that
 * would need the user, for consent or Conditional Access for example, is reported as a failure.
 */
export async function acquireTokensSilently(
	client: ISilentTokenClient,
	accounts: readonly AccountInfo[],
	request: Omit<SilentFlowRequest, 'account'>
): Promise<{ readonly results: AuthenticationResult[]; readonly failures: unknown[] }> {
	const settled = await Promise.allSettled(accounts.map(account => client.acquireTokenSilent({ ...request, account })));
	return {
		results: settled.flatMap(outcome => outcome.status === 'fulfilled' ? [outcome.value] : []),
		failures: settled.flatMap(outcome => outcome.status === 'rejected' ? [outcome.reason] : []),
	};
}
