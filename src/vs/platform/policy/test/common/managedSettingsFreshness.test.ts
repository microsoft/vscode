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
	isSameManagedSettingsFreshnessScope,
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

	const satisfied: IManagedSettingsFreshness = { state: ManagedSettingsFreshnessState.Satisfied, scope };

	test('only an unresolved or failed refresh withholds agent functionality', () => {
		assert.deepStrictEqual({
			notRequired: isManagedSettingsFreshnessBlocking(MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED),
			pending: isManagedSettingsFreshnessBlocking({ state: ManagedSettingsFreshnessState.Pending }),
			satisfied: isManagedSettingsFreshnessBlocking(satisfied),
			blocked: isManagedSettingsFreshnessBlocking({ state: ManagedSettingsFreshnessState.Blocked, failure: ManagedSettingsFreshnessFailure.Network }),
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
			unscopedSatisfied: isManagedSettingsFreshnessSatisfiedFor({ state: ManagedSettingsFreshnessState.Satisfied }, scope),
			pendingNeverSatisfies: isManagedSettingsFreshnessSatisfiedFor({ state: ManagedSettingsFreshnessState.Pending, scope }, scope),
		}, {
			sameScope: true,
			// A different account, provider or GHE host must re-establish freshness rather than
			// inherit another scope's success.
			otherAccount: false,
			otherProvider: false,
			otherEndpoint: false,
			// A satisfied result without a scope is never transferable.
			unscopedSatisfied: false,
			pendingNeverSatisfies: false,
		});
	});

	test('scope comparison treats a missing scope as never matching', () => {
		assert.deepStrictEqual({
			bothPresent: isSameManagedSettingsFreshnessScope(scope, { ...scope }),
			leftMissing: isSameManagedSettingsFreshnessScope(undefined, scope),
			rightMissing: isSameManagedSettingsFreshnessScope(scope, undefined),
			bothMissing: isSameManagedSettingsFreshnessScope(undefined, undefined),
		}, {
			bothPresent: true,
			leftMissing: false,
			rightMissing: false,
			bothMissing: false,
		});
	});

	test('the default state is not-required so the gate is inert until a control is observed', () => {
		assert.deepStrictEqual(MANAGED_SETTINGS_FRESHNESS_NOT_REQUIRED, { state: ManagedSettingsFreshnessState.NotRequired });
	});
});
