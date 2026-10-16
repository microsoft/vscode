/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentEntitlementMeta, readAgentEntitlement } from '../../common/meta/agentEntitlementMeta.js';

suite('Agent entitlement metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a hint and ignores absent or malformed extensions', () => {
		const entitlement = { trackingId: 'analytics', sku: 'free_limited_copilot' };
		const invalid = [undefined, null, [], '', {}, { trackingId: ' ', sku: 'free' }, { trackingId: 'a', sku: 42 }];
		assert.deepStrictEqual({
			valid: readAgentEntitlement({ _meta: agentEntitlementMeta(entitlement) }),
			absent: readAgentEntitlement({}),
			invalid: invalid.map(value => readAgentEntitlement({ _meta: { 'vscode.authentication.entitlement': value } })),
		}, { valid: entitlement, absent: undefined, invalid: invalid.map(() => undefined) });
	});
});
