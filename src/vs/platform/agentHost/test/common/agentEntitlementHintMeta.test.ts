/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { agentEntitlementHintMeta, readAgentEntitlementHint } from '../../common/meta/agentEntitlementHintMeta.js';

suite('Agent entitlement hint metadata', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('round-trips a hint and ignores absent or malformed extensions', () => {
		const entitlement = { trackingId: 'analytics', sku: 'free_limited_copilot' };
		const invalid = [undefined, null, [], '', {}, { trackingId: ' ', sku: 'free' }, { trackingId: 'a', sku: 42 }];
		assert.deepStrictEqual({
			valid: readAgentEntitlementHint({ _meta: agentEntitlementHintMeta(entitlement) }),
			absent: readAgentEntitlementHint({}),
			invalid: invalid.map(value => readAgentEntitlementHint({ _meta: { 'vscode.authentication.entitlement': value } })),
		}, { valid: entitlement, absent: undefined, invalid: invalid.map(() => undefined) });
	});
});
