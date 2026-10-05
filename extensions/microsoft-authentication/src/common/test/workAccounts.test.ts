/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import type { AccountInfo, AuthenticationResult, SilentFlowRequest } from '@azure/msal-node';
import { acquireTokensSilently, MAX_PROBED_WORK_ACCOUNTS, MSA_PASSTHRU_TID, MSA_TID, selectWorkAccountsToProbe } from '../workAccounts';

const CONTOSO = '72f988bf-86f1-41af-91ab-2d7cd011db47';
const FABRIKAM = '11111111-2222-3333-4444-555555555555';

function account(objectId: string, homeTenant: string, profileTenant = homeTenant): AccountInfo {
	return {
		homeAccountId: `${objectId}.${homeTenant}`,
		tenantId: profileTenant,
		environment: 'login.microsoftonline.com',
		username: `${objectId}@example.com`,
		localAccountId: objectId,
	};
}

function describe(accounts: readonly AccountInfo[]): string[] {
	return accounts.map(a => `${a.homeAccountId} in ${a.tenantId}`);
}

suite('selectWorkAccountsToProbe', () => {
	test('leaves out personal Microsoft accounts, whichever profile they are listed under', () => {
		assert.deepStrictEqual(describe(selectWorkAccountsToProbe([
			account('personal', MSA_TID),
			account('passthrough', MSA_PASSTHRU_TID),
			// A personal account that is a guest in a work tenant is still a personal account.
			account('guest', MSA_TID, CONTOSO),
			account('mona', CONTOSO),
		])), [`mona.${CONTOSO} in ${CONTOSO}`]);
	});

	test('keeps one entry per account, preferring the home tenant whatever the order', () => {
		assert.deepStrictEqual({
			guestFirst: describe(selectWorkAccountsToProbe([account('mona', CONTOSO, FABRIKAM), account('mona', CONTOSO)])),
			homeFirst: describe(selectWorkAccountsToProbe([account('mona', CONTOSO), account('mona', CONTOSO, FABRIKAM)])),
			guestOnly: describe(selectWorkAccountsToProbe([account('mona', CONTOSO, FABRIKAM)])),
		}, {
			guestFirst: [`mona.${CONTOSO} in ${CONTOSO}`],
			homeFirst: [`mona.${CONTOSO} in ${CONTOSO}`],
			guestOnly: [`mona.${CONTOSO} in ${FABRIKAM}`],
		});
	});

	test(`probes at most ${MAX_PROBED_WORK_ACCOUNTS} accounts`, () => {
		const many = Array.from({ length: MAX_PROBED_WORK_ACCOUNTS + 2 }, (_, i) => account(`user${i}`, CONTOSO));
		assert.deepStrictEqual(describe(selectWorkAccountsToProbe(many)), describe(many.slice(0, MAX_PROBED_WORK_ACCOUNTS)));
	});
});

suite('acquireTokensSilently', () => {
	test('asks for every account at once and separates the ones that need the user', async () => {
		const requests: SilentFlowRequest[] = [];
		const client = {
			getAllAccounts: async () => [],
			acquireTokenSilent: async (request: SilentFlowRequest) => {
				requests.push(request);
				if (request.account.localAccountId === 'blocked') {
					throw new Error('interaction_required');
				}
				return { accessToken: `token-${request.account.localAccountId}` } as AuthenticationResult;
			}
		};

		const { results, failures } = await acquireTokensSilently(client, [account('mona', CONTOSO), account('blocked', FABRIKAM)], { authority: 'https://login.microsoftonline.com/organizations', scopes: ['scope'] });

		assert.deepStrictEqual({
			requests: requests.map(request => ({ account: request.account.localAccountId, authority: request.authority, scopes: request.scopes })),
			tokens: results.map(result => result.accessToken),
			failures: failures.map(failure => (failure as Error).message),
		}, {
			requests: [
				{ account: 'mona', authority: 'https://login.microsoftonline.com/organizations', scopes: ['scope'] },
				{ account: 'blocked', authority: 'https://login.microsoftonline.com/organizations', scopes: ['scope'] },
			],
			tokens: ['token-mona'],
			failures: ['interaction_required'],
		});
	});
});
