/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import {
	IManagedSettingsFreshness,
	IManagedSettingsFreshnessScope,
	isManagedSettingsFreshnessBlocking,
	isManagedSettingsFreshnessSatisfiedFor,
	MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED,
	ManagedSettingsFreshnessFailure,
	ManagedSettingsFreshnessState,
} from '../../common/managedSettingsFreshness.js';

suite('Managed settings freshness', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	const scope: IManagedSettingsFreshnessScope = {
		accountId: 'account-1',
		authenticationProviderId: 'github',
		endpointOrigin: 'https://api.github.com',
	};

	const satisfied: IManagedSettingsFreshness = {
		state: ManagedSettingsFreshnessState.Satisfied,
		source: 'nativeMdm',
		scope,
		satisfiedAt: 1,
	};

	test('only an unresolved or failed refresh withholds agent functionality', () => {
		assert.deepStrictEqual({
			notRequired: isManagedSettingsFreshnessBlocking(MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED),
			pending: isManagedSettingsFreshnessBlocking({ state: ManagedSettingsFreshnessState.Pending, source: 'server' }),
			satisfied: isManagedSettingsFreshnessBlocking(satisfied),
			blocked: isManagedSettingsFreshnessBlocking({ state: ManagedSettingsFreshnessState.Blocked, source: 'server', failure: ManagedSettingsFreshnessFailure.Network }),
		}, {
			notRequired: false,
			// Pending gates: an unresolved refresh must never read as permission to proceed.
			pending: true,
			satisfied: false,
			blocked: true,
		});
	});

	test('satisfaction is scoped to one account, provider and endpoint', () => {
		assert.deepStrictEqual({
			sameScope: isManagedSettingsFreshnessSatisfiedFor(satisfied, { ...scope }),
			otherAccount: isManagedSettingsFreshnessSatisfiedFor(satisfied, { ...scope, accountId: 'account-2' }),
			otherProvider: isManagedSettingsFreshnessSatisfiedFor(satisfied, { ...scope, authenticationProviderId: 'github-enterprise' }),
			otherEndpoint: isManagedSettingsFreshnessSatisfiedFor(satisfied, { ...scope, endpointOrigin: 'https://ghe.example.com' }),
			pendingNeverSatisfies: isManagedSettingsFreshnessSatisfiedFor({ state: ManagedSettingsFreshnessState.Pending, source: 'nativeMdm' }, scope),
		}, {
			sameScope: true,
			otherAccount: false,
			otherProvider: false,
			otherEndpoint: false,
			pendingNeverSatisfies: false,
		});
	});

});
