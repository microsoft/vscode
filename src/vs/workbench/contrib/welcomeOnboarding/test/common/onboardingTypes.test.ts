/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { OnboardingStepId, getOnboardingStepSubtitle, getOnboardingStepTitle } from '../../common/onboardingTypes.js';

suite('OnboardingTypes', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('uses non-committal copy for the agent sessions step', () => {
		assert.strictEqual(getOnboardingStepTitle(OnboardingStepId.AgentSessions), 'Explore Chat and Agents');
	});

	test('keeps sign-in messaging optional for AI features', () => {
		assert.strictEqual(getOnboardingStepSubtitle(OnboardingStepId.SignIn), 'Sync your setup and optionally connect AI features');
	});
});
