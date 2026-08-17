/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContributionEnablementState, isWorkspaceScopedEnablement, withContributionEnabled } from '../../common/enablement.js';

suite('enablement', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	suite('withContributionEnabled', () => {

		test('answers a workspace choice where it was made, rather than promoting it', () => {
			assert.deepStrictEqual([
				withContributionEnabled(ContributionEnablementState.EnabledWorkspace, false),
				withContributionEnabled(ContributionEnablementState.DisabledWorkspace, true),
			], [
				ContributionEnablementState.DisabledWorkspace,
				ContributionEnablementState.EnabledWorkspace,
			]);
		});

		test('answers a profile choice at the profile', () => {
			assert.deepStrictEqual([
				withContributionEnabled(ContributionEnablementState.EnabledProfile, false),
				withContributionEnabled(ContributionEnablementState.DisabledProfile, true),
			], [
				ContributionEnablementState.DisabledProfile,
				ContributionEnablementState.EnabledProfile,
			]);
		});

		test('turning a workspace choice off and on again returns it to where it started', () => {
			const start = ContributionEnablementState.EnabledWorkspace;
			assert.strictEqual(withContributionEnabled(withContributionEnabled(start, false), true), start);
		});
	});

	test('isWorkspaceScopedEnablement names only the workspace states', () => {
		assert.deepStrictEqual([
			ContributionEnablementState.EnabledWorkspace,
			ContributionEnablementState.DisabledWorkspace,
			ContributionEnablementState.EnabledProfile,
			ContributionEnablementState.DisabledProfile,
		].map(isWorkspaceScopedEnablement), [true, true, false, false]);
	});
});
