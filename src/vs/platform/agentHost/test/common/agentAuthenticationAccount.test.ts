/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { authenticationAccountId, authenticationAccountMeta, readAuthenticationAccount } from '../../common/meta/agentAuthenticationAccount.js';

suite('Agent authentication account metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips optional provenance without using labels or tokens', () => {
		const account = { providerId: 'github', accountId: 'account', authorizationServer: 'https://github.com/login/oauth' };
		const read = readAuthenticationAccount({ _meta: authenticationAccountMeta(account) });
		assert.deepStrictEqual({
			read,
			key: authenticationAccountId(read),
			absent: readAuthenticationAccount({}),
			unrecognized: readAuthenticationAccount({ _meta: { 'another-host.account': account } }),
		}, {
			read: account,
			key: '["github","account","https://github.com/login/oauth"]',
			absent: undefined,
			unrecognized: undefined,
		});
	});

	test('round-trips a display label without changing the account identity', () => {
		const account = { providerId: 'microsoft', accountId: 'opaque-account', label: 'Selected account' };
		const metadata = JSON.parse(JSON.stringify(authenticationAccountMeta(account)));
		const read = readAuthenticationAccount({ _meta: metadata });
		const renamed = readAuthenticationAccount({ _meta: authenticationAccountMeta({ ...account, label: 'Renamed account' }) });
		assert.deepStrictEqual({
			read,
			key: authenticationAccountId(read),
			renamedKey: authenticationAccountId(renamed),
		}, {
			read: account,
			key: '["microsoft","opaque-account",null]',
			renamedKey: '["microsoft","opaque-account",null]',
		});
	});

	test('omits absent or blank display labels and rejects malformed display metadata', () => {
		const account = { providerId: 'microsoft', accountId: 'opaque-account' };
		const labels = [undefined, '', ' \t ', null, 42, false, {}, []];
		assert.deepStrictEqual(labels.map(label => readAuthenticationAccount({
			_meta: { 'vscode.authentication.account': { ...account, label } },
		})), [account, account, account, undefined, undefined, undefined, undefined, undefined]);
	});

	test('rejects malformed optional metadata', () => {
		const values = [undefined, null, [], 'account', {}, { providerId: '', accountId: 'a' }, { providerId: 'github', accountId: 101 }, { providerId: 'github', accountId: 'a', authorizationServer: 42 }];
		assert.deepStrictEqual(values.map(value => readAuthenticationAccount({ _meta: { 'vscode.authentication.account': value } })), values.map(() => undefined));
	});

	test('account keys isolate providers and issuers while ignoring token renewal', () => {
		const keys = [
			{ providerId: 'github', accountId: 'one' },
			{ providerId: 'github', accountId: 'two' },
			{ providerId: 'enterprise', accountId: 'one' },
			{ providerId: 'github', accountId: 'one', authorizationServer: 'https://tenant.ghe.com' },
		].map(authenticationAccountId);
		assert.strictEqual(new Set(keys).size, 4);
	});
});
